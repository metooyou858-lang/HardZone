const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/db');
const { getCompetitionConfig, createCompetitionEvent, updateCompetitionEvent, listCompetitionEvents } = require('../src/services/competition-events');
const { createCompetitionRegistration, getCompetitionRegistrationByPublicToken, listCompetitionRegistrations, updateCompetitionRegistrationStatus } = require('../src/services/competition-registration');
const { getCompetitionPaymentSummary, startCompetitionPayment } = require('../src/services/competition-payment');
const { reconcileRegistration } = require('../src/services/competition-automation');
const { buildCompetitionEmail } = require('../src/services/competition-email');

const legacyKey = `legacy-${randomUUID()}`;
Object.assign(process.env, { COMPETITION_EVENT_KEY: legacyKey, COMPETITION_PAYMENT_ENABLED: 'true', COMPETITION_REGISTRATION_ENABLED: 'true', TBANK_TERMINAL_KEY: 'test', TBANK_TERMINAL_PASSWORD: 'test', COMPETITION_PUBLIC_BASE_URL: 'https://hardzone.space' });
const keys = [legacyKey];
const originalFetch = global.fetch;
let phone = 3000;
const input = () => ({ team_name:'Команда проверки', team_email:'test@example.ru', category:'rookie', male_name:'Иван Тестов', female_name:'Анна Тестова', male_phone:`7999000${++phone}`, female_phone:`7999000${++phone}`, terms_accepted:true, personal_data_accepted:true });
const settings = (name = 'Новые соревнования') => ({ name, date:'2027-03-20', location:'Новая площадка', fee_rubles:4200, registration_enabled:true, categories:[{key:'rookie',name:'Новички'},{key:'pro',name:'Профи'}], terms_text:'Условия нового мероприятия' });
async function event(name) { const result = await createCompetitionEvent(settings(name)); keys.push(result.event_key); return result; }
after(async () => {
  global.fetch = originalFetch;
  await pool.query('DELETE FROM competition_email_jobs WHERE registration_id IN (SELECT id FROM competition_registrations WHERE event_key=ANY($1::TEXT[]))', [keys]);
  await pool.query('DELETE FROM competition_registrations WHERE event_key=ANY($1::TEXT[])', [keys]);
  await pool.query('DELETE FROM competition_events WHERE event_key=ANY($1::TEXT[])', [keys]);
  await pool.end();
});

test('default competition retains URL, config and existing registration identifiers', async () => {
  const a = await createCompetitionRegistration({...input(),category:'amateur'});
  const before = (await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[a.id])).rows[0];
  const config = await getCompetitionConfig();
  await listCompetitionEvents(); await event();
  assert.equal(config.public_path,'/competition'); assert.equal(config.legacy,true);
  assert.deepEqual((await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[a.id])).rows[0],before);
  assert.equal((await getCompetitionRegistrationByPublicToken(a.public_token)).id,a.id);
});

test('same athletes can register in different events, but cannot join another team within one event', async () => {
  const a=await event('Первое'); const b=await event('Второе'); const data=input();
  const ra=await createCompetitionRegistration(data,a.event_key);
  const rb=await createCompetitionRegistration(data,b.event_key);
  assert.notEqual(ra.id,rb.id);
  assert.equal((await createCompetitionRegistration(data,a.event_key)).id,ra.id);
  await assert.rejects(createCompetitionRegistration({...data,team_name:'Другая'},a.event_key),/другой команде/);
  assert.deepEqual((await listCompetitionRegistrations(pool,a.event_key)).map(r=>r.id),[ra.id]);
  await assert.rejects(updateCompetitionRegistrationStatus(ra.id,'cancelled',b.event_key),/не найдена/);
  assert.equal((await getCompetitionRegistrationByPublicToken(ra.public_token)).status,'registered');
});

test('category membership is event-specific; used categories cannot be removed', async () => {
  const a=await event(); await createCompetitionRegistration(input(),a.event_key);
  await assert.rejects(createCompetitionRegistration({...input(),category:'amateur'},a.event_key),/категорию/);
  await assert.rejects(updateCompetitionEvent(a.event_key,{...settings(),categories:[{key:'pro',name:'Профи'}]}),/уже есть заявки/);
  await assert.rejects(createCompetitionEvent({...settings(),date:'2027-02-30'}),/дату/);
  await assert.rejects(createCompetitionEvent({...settings(),categories:[{key:'a',name:'Новички'},{key:'b',name:'новички'}]}),/повторяться/);
});

test('closing registration blocks new entries but preserves an existing payment at its original fee', async () => {
  const a=await event(); const r=await createCompetitionRegistration(input(),a.event_key);
  await updateCompetitionEvent(a.event_key,{...settings(),fee_rubles:9000,registration_enabled:false});
  await assert.rejects(createCompetitionRegistration(input(),a.event_key),/не открыта/);
  const registration=await getCompetitionRegistrationByPublicToken(r.public_token);
  assert.equal(Number(registration.fee_kopecks),420000);
  let request;
  global.fetch=async (_url,options)=> { request=JSON.parse(options.body); return {ok:true,json:async()=>({Success:true,PaymentId:randomUUID(),PaymentURL:'https://bank.example/pay',Status:'NEW'})}; };
  try { await startCompetitionPayment(r.public_token); } finally { global.fetch=originalFetch; }
  assert.equal(request.Amount,420000); assert.ok(request.Receipt.Items[0].Name.includes(a.name));
});

test('new-event payment summary and email use own category, date, name and registration URL', async () => {
  const a=await event('Осенний кубок'); const r=await createCompetitionRegistration(input(),a.event_key);
  const summary=await getCompetitionPaymentSummary(r.public_token);
  assert.equal(summary.category_name,'Новички'); assert.equal(summary.event_name,a.name); assert.equal(summary.event_date,a.date);
  assert.ok(summary.public_path.includes(a.event_key));
  const registration=await getCompetitionRegistrationByPublicToken(r.public_token);
  for(const kind of ['registration','reminder','paid','expired']) {
    const mail=buildCompetitionEmail(kind,registration,a);
    assert.ok(mail.html.includes('Осенний кубок')); assert.ok(mail.html.includes('Новички'));
    assert.ok(!mail.html.includes('cid:')); assert.ok(!mail.html.includes('games_khv'));
    if(kind==='expired') assert.ok(mail.html.includes(a.event_key));
  }
});

test('automation reconciles a non-default event without touching another event', async () => {
  const a=await event(); const b=await event();
  const ra=await createCompetitionRegistration(input(),a.event_key); const rb=await createCompetitionRegistration(input(),b.event_key);
  await pool.query("UPDATE competition_registrations SET payment_deadline=NOW()-INTERVAL '1 minute' WHERE id=$1",[ra.id]);
  await reconcileRegistration(ra.id);
  assert.equal((await getCompetitionRegistrationByPublicToken(ra.public_token)).status,'cancelled');
  assert.equal((await getCompetitionRegistrationByPublicToken(rb.public_token)).status,'registered');
});

test('event list counts only active verified paid entries as confirmed', async () => {
  const a=await event(); const r=await createCompetitionRegistration(input(),a.event_key);
  const counts=async()=> (await listCompetitionEvents()).find(e=>e.event_key===a.event_key);
  assert.equal((await counts()).confirmed_count,0);
  await pool.query("UPDATE competition_registrations SET payment_status='paid' WHERE id=$1",[r.id]);
  assert.equal((await counts()).confirmed_count,1);
  await updateCompetitionRegistrationStatus(r.id,'cancelled',a.event_key);
  assert.equal((await counts()).confirmed_count,0);
});
