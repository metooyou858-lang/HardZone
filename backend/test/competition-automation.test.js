const assert = require('node:assert/strict');
const {test,after} = require('node:test');
const {randomUUID} = require('node:crypto');
const {pool} = require('../src/db');
const {createCompetitionRegistration,normalizeCompetitionRegistration,getCompetitionRegistrationByPublicToken} = require('../src/services/competition-registration');
const {startCompetitionPayment,syncCompetitionPayment} = require('../src/services/competition-payment');
const {buildCompetitionInitPayload} = require('../src/services/tbank-competition');
const {canExpireRegistration,shouldSendCompetitionEmail,reconcileRegistration,deliverEmailJob} = require('../src/services/competition-automation');
const {buildCompetitionEmail} = require('../src/services/competition-email');
const eventKey='test-competition-'+randomUUID();
Object.assign(process.env,{COMPETITION_EVENT_KEY:eventKey,COMPETITION_PAYMENT_ENABLED:'true',COMPETITION_REGISTRATION_ENABLED:'true',COMPETITION_PUBLIC_BASE_URL:'https://hardzone.space',TBANK_TERMINAL_KEY:'test',TBANK_TERMINAL_PASSWORD:'test',TBANK_TAXATION:'usn_income',TBANK_VAT:'none'});
let serial=0;
const input=(extra={})=>({team_name:'Тестовая команда',team_email:'team@example.ru',category:'amateur',male_name:'Иван Тестов',female_name:'Анна Тестова',male_phone:'7999000'+String(++serial).padStart(4,'0'),female_phone:'7999000'+String(++serial).padStart(4,'0'),terms_accepted:true,personal_data_accepted:true,...extra});
const originalFetch=global.fetch;
after(async()=>{global.fetch=originalFetch;await pool.query('DELETE FROM competition_email_jobs WHERE registration_id IN (SELECT id FROM competition_registrations WHERE event_key=$1)',[eventKey]);await pool.query('DELETE FROM competition_registrations WHERE event_key=$1',[eventKey]);await pool.end();});

test('email is mandatory, normalized and rejects a recipient list or header injection',()=>{
  for(const email of ['', 'bad', 'x@example.ru,y@example.ru','x@example.ru\r\nBcc: a@example.ru']) assert.throws(()=>normalizeCompetitionRegistration(input({team_email:email})),/email/);
  assert.equal(normalizeCompetitionRegistration(input({team_email:' TEAM@example.ru '})).team_email,'team@example.ru');
});

test('expiry excludes legacy, paid, refunded and unresolved payment sessions',()=>{
  const r={team_email:'a@example.ru',payment_deadline:new Date(Date.now()-1000),status:'registered',payment_status:'failed'};
  assert.equal(canExpireRegistration(r,[]),true);
  for(const status of ['CONFIRMED','AUTHORIZED','NEW','FAILED','REFUNDED']) assert.equal(canExpireRegistration(r,[{payment_id:'1',status}]),false);
  assert.equal(canExpireRegistration({...r,payment_deadline:null},[]),false);
  assert.equal(canExpireRegistration({...r,paid_at:new Date()},[]),false);
  assert.equal(canExpireRegistration({...r,payment_status:'paid'},[]),false);
  assert.equal(canExpireRegistration(r,[{payment_id:'1',status:'DEADLINE_EXPIRED'}]),true);
  assert.equal(shouldSendCompetitionEmail('reminder',r),false);
});

test('new application snapshots fee, has 60 minutes and duplicate does not extend deadline or duplicate welcome',async()=>{
  const data=input(); const a=await createCompetitionRegistration(data);const b=await createCompetitionRegistration(data);
  assert.equal(a.id,b.id);
  const row=await getCompetitionRegistrationByPublicToken(a.public_token);
  assert.equal(new Date(row.payment_deadline)-new Date(row.created_at),3600000);
  assert.equal(Number(row.fee_kopecks),350000);
  assert.equal((await pool.query('SELECT * FROM competition_email_jobs WHERE registration_id=$1',[a.id])).rowCount,1);
});

test('legacy registered and paid teams are untouched by reconciliation',async()=>{
  const a=await createCompetitionRegistration(input());
  await pool.query("UPDATE competition_registrations SET team_email=NULL,payment_deadline=NULL,payment_status='paid',paid_at=NOW() WHERE id=$1",[a.id]);
  const before=(await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[a.id])).rows[0];
  await reconcileRegistration(a.id,{syncPayment:()=>{throw Error('must not call bank');}});
  const afterRow=(await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[a.id])).rows[0];
  assert.deepEqual(afterRow,before);
});

test('Init includes immutable deadline and receipt email; rejects starting after deadline',async()=>{
  const a=await createCompetitionRegistration(input());
  const registration=await getCompetitionRegistrationByPublicToken(a.public_token);
  const p=buildCompetitionInitPayload({registration,orderId:'test',amountKopecks:350000},{terminalKey:'test',publicBaseUrl:'https://hardzone.space',taxation:'usn_income',tax:'none'});
  assert.equal(Date.parse(p.RedirectDueDate),Math.floor(new Date(registration.payment_deadline).getTime()/1000)*1000);
  assert.equal(p.Receipt.Email,'team@example.ru');
  await pool.query("UPDATE competition_registrations SET payment_deadline=NOW()-INTERVAL '1 minute' WHERE id=$1",[a.id]);
  await assert.rejects(startCompetitionPayment(a.public_token),/Срок оплаты истёк/);
});

test('deadline expires an unpaid closed session, retains registration row and skips pending reminders',async()=>{
  const a=await createCompetitionRegistration(input());
  await pool.query("UPDATE competition_registrations SET payment_deadline=NOW()-INTERVAL '1 minute' WHERE id=$1",[a.id]);
  await pool.query("INSERT INTO competition_payments(registration_id,order_id,payment_id,amount_kopecks,status) VALUES($1,$2,$3,350000,'NEW')",[a.id,randomUUID(),randomUUID()]);
  await reconcileRegistration(a.id,{syncPayment:async(p,c)=>{await c.query("UPDATE competition_payments SET status='DEADLINE_EXPIRED' WHERE id=$1",[p.id]);}});
  await reconcileRegistration(a.id);
  const r=await getCompetitionRegistrationByPublicToken(a.public_token);
  assert.equal(r.status,'cancelled');assert.ok(r.expired_at);
  const jobs=(await pool.query('SELECT * FROM competition_email_jobs WHERE registration_id=$1',[a.id])).rows;
  assert.equal(jobs.filter(j=>j.kind==='expired').length,1);
  assert.equal(jobs.find(j=>j.kind==='registration').state,'skipped');
});

test('bank outage and in-flight payment do not cancel overdue application',async()=>{
  const a=await createCompetitionRegistration(input());
  await pool.query("UPDATE competition_registrations SET payment_deadline=NOW()-INTERVAL '1 minute' WHERE id=$1",[a.id]);
  await pool.query("INSERT INTO competition_payments(registration_id,order_id,payment_id,amount_kopecks,status) VALUES($1,$2,$3,350000,'AUTHORIZED')",[a.id,randomUUID(),randomUUID()]);
  await assert.rejects(reconcileRegistration(a.id,{syncPayment:async()=>{throw Error('network unavailable');}}));
  assert.equal((await getCompetitionRegistrationByPublicToken(a.public_token)).status,'registered');
  await reconcileRegistration(a.id,{syncPayment:async()=>{}});
  assert.equal((await getCompetitionRegistrationByPublicToken(a.public_token)).status,'registered');
});

test('CONFIRMED verified against bank queues one paid message and stops unpaid messages',async()=>{
  const a=await createCompetitionRegistration(input());
  const p=(await pool.query("INSERT INTO competition_payments(registration_id,order_id,payment_id,amount_kopecks,status) VALUES($1,$2,$3,350000,'NEW') RETURNING *",[a.id,randomUUID(),randomUUID()])).rows[0];
  global.fetch=async()=>({ok:true,json:async()=>({Success:true,PaymentId:p.payment_id,OrderId:p.order_id,Amount:350000,Status:'CONFIRMED'})});
  try{await Promise.all([syncCompetitionPayment(p),syncCompetitionPayment(p)]);}finally{global.fetch=originalFetch;}
  const jobs=(await pool.query('SELECT * FROM competition_email_jobs WHERE registration_id=$1',[a.id])).rows;
  assert.equal(jobs.filter(j=>j.kind==='paid').length,1);
  assert.equal(jobs.find(j=>j.kind==='registration').state,'skipped');
  let sends=0;const job=jobs.find(j=>j.kind==='paid');
  await deliverEmailJob(job,{send:async()=>{sends++;}});await deliverEmailJob(job,{send:async()=>{sends++;}});
  assert.equal(sends,1);
  const r=await getCompetitionRegistrationByPublicToken(a.public_token);
  assert.equal(r.payment_status,'paid');
});

test('reminder is queued once only in final 15 minutes',async()=>{
  const a=await createCompetitionRegistration(input());
  await reconcileRegistration(a.id);
  assert.equal((await pool.query("SELECT 1 FROM competition_email_jobs WHERE registration_id=$1 AND kind='reminder'",[a.id])).rowCount,0);
  await pool.query("UPDATE competition_registrations SET payment_deadline=NOW()+INTERVAL '14 minutes' WHERE id=$1",[a.id]);
  await reconcileRegistration(a.id);await reconcileRegistration(a.id);
  assert.equal((await pool.query("SELECT 1 FROM competition_email_jobs WHERE registration_id=$1 AND kind='reminder'",[a.id])).rowCount,1);
});

test('templates have real personal URL, escaped data, small CID image and common chats',()=>{
  const r={team_name:'<img src=x>',category:'advanced',fee_kopecks:350000,public_token:'token-42',payment_deadline:new Date()};
  for(const kind of ['registration','reminder','expired','paid']) {
    const m=buildCompetitionEmail(kind,r);
    assert.ok(m.html.includes('&lt;img src=x&gt;'));assert.ok(!m.html.includes('МАКЕТ'));assert.ok(!m.html.includes('Стальные нервы'));assert.ok(!m.html.includes('{{'));
    assert.ok(m.html.includes('cid:competition-poster@hardzone.space'));
    if(kind==='registration'||kind==='reminder') assert.ok(m.html.includes('/competition/payment?registration=token-42'));
    if(kind==='paid')assert.ok(m.html.includes('https://t.me/games_khv'));
  }
});

test('ambiguous SMTP result is not resent automatically after a retry or restart',async()=>{
  const a=await createCompetitionRegistration(input());
  const job=(await pool.query("SELECT * FROM competition_email_jobs WHERE registration_id=$1 AND kind='registration'",[a.id])).rows[0];
  let sends=0;
  await deliverEmailJob(job,{send:async()=>{sends++;throw Object.assign(new Error('socket closed after DATA'),{code:'ESOCKET'});}});
  await deliverEmailJob(job,{send:async()=>{sends++;}});
  assert.equal(sends,1);
  assert.equal((await pool.query('SELECT state FROM competition_email_jobs WHERE id=$1',[job.id])).rows[0].state,'uncertain');
});

test('bank amount mismatch cannot confirm payment',async()=>{
  const a=await createCompetitionRegistration(input());
  const p=(await pool.query("INSERT INTO competition_payments(registration_id,order_id,payment_id,amount_kopecks,status) VALUES($1,$2,$3,350000,'NEW') RETURNING *",[a.id,randomUUID(),randomUUID()])).rows[0];
  global.fetch=async()=>({ok:true,json:async()=>({Success:true,PaymentId:p.payment_id,OrderId:p.order_id,Amount:1,Status:'CONFIRMED'})});
  try{await assert.rejects(syncCompetitionPayment(p),/несовпадающие/);}finally{global.fetch=originalFetch;}
  assert.notEqual((await getCompetitionRegistrationByPublicToken(a.public_token)).payment_status,'paid');
});
