const { pool, withTransaction } = require('../db');
const { syncCompetitionPayment } = require('./competition-payment');
const { sendCompetitionEmail } = require('./competition-email');
const logger = require('./logger');

const CLOSED_UNPAID = new Set(['REJECTED','CANCELED','DEADLINE_EXPIRED','REVERSED','AUTH_FAIL']);

function canExpireRegistration(registration, payments, now = Date.now()) {
  return Boolean(registration.payment_deadline)
    && new Date(registration.payment_deadline).getTime() <= now
    && registration.status === 'registered'
    && !registration.paid_at && !['paid','refunded'].includes(registration.payment_status)
    && payments.every(p => p.payment_id && CLOSED_UNPAID.has(p.status));
}

function shouldSendCompetitionEmail(kind, registration, now = Date.now()) {
  if (!registration.team_email || !registration.payment_deadline) return false;
  if (kind === 'paid') return registration.payment_status === 'paid';
  if (kind === 'expired') return Boolean(registration.expired_at) && !registration.paid_at;
  if (registration.status !== 'registered' || registration.paid_at || ['paid','refunded'].includes(registration.payment_status)) return false;
  const remaining = new Date(registration.payment_deadline).getTime() - now;
  return remaining > 0 && (kind === 'registration' || (kind === 'reminder' && remaining <= 15 * 60000));
}

async function enqueue(client, registrationId, kind) {
  await client.query(`INSERT INTO competition_email_jobs (registration_id, kind) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [registrationId,kind]);
}

async function reconcileRegistration(id, {syncPayment = syncCompetitionPayment} = {}) {
  return withTransaction(async client => {
    const initial = await client.query('SELECT * FROM competition_registrations WHERE id=$1', [id]);
    if (!initial.rows[0]?.payment_deadline) return;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [initial.rows[0].event_key]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`competition-payment:${initial.rows[0].public_token}`]);
    let registration = (await client.query('SELECT * FROM competition_registrations WHERE id=$1', [id])).rows[0];
    if (registration.status !== 'registered' || registration.paid_at || ['paid','refunded'].includes(registration.payment_status)) return;
    const payments = (await client.query('SELECT * FROM competition_payments WHERE registration_id=$1 ORDER BY id', [id])).rows;
    for (const payment of payments) {
      // An Init timeout can hide an existing charge. Never release such a team blindly.
      if (!payment.payment_id) throw new Error('UNRESOLVED_PAYMENT_INIT');
      await syncPayment(payment, client);
    }
    registration = (await client.query('SELECT * FROM competition_registrations WHERE id=$1', [id])).rows[0];
    const currentPayments = (await client.query('SELECT * FROM competition_payments WHERE registration_id=$1', [id])).rows;
    if (canExpireRegistration(registration, currentPayments)) {
      await client.query(`UPDATE competition_registrations SET status='cancelled', expired_at=NOW(), updated_at=NOW(), automation_error=NULL WHERE id=$1`, [id]);
      await client.query(`UPDATE competition_email_jobs SET state='skipped' WHERE registration_id=$1 AND kind IN ('registration','reminder') AND state='pending'`,[id]);
      await enqueue(client,id,'expired');
    } else if (shouldSendCompetitionEmail('reminder',registration)) {
      await enqueue(client,id,'reminder');
    }
    const waiting = !registration.paid_at && registration.payment_deadline && new Date(registration.payment_deadline).getTime() <= Date.now() && !canExpireRegistration(registration,currentPayments);
    await client.query(`UPDATE competition_registrations SET next_payment_check_at=NOW()+INTERVAL '30 seconds', automation_error=$2 WHERE id=$1`,[id,waiting ? 'Ожидаем окончательный статус Т-Банка' : null]);
  });
}

async function deliverEmailJob(job, {send = sendCompetitionEmail} = {}) {
  return withTransaction(async client => {
    const initial = (await client.query('SELECT public_token FROM competition_registrations WHERE id=$1',[job.registration_id])).rows[0];
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`competition-payment:${initial.public_token}`]);
    let registration = (await client.query('SELECT * FROM competition_registrations WHERE id=$1',[job.registration_id])).rows[0];
    if (job.kind === 'reminder') {
      const payments=(await client.query('SELECT * FROM competition_payments WHERE registration_id=$1',[job.registration_id])).rows;
      for(const payment of payments) {
        if(!payment.payment_id) throw new Error('UNRESOLVED_PAYMENT_INIT');
        await syncCompetitionPayment(payment,client);
      }
      registration=(await client.query('SELECT * FROM competition_registrations WHERE id=$1',[job.registration_id])).rows[0];
    }
    if (!shouldSendCompetitionEmail(job.kind, registration)) {
      await client.query(`UPDATE competition_email_jobs SET state='skipped' WHERE id=$1 AND state='pending'`,[job.id]);
      return;
    }
    // Persist before SMTP: a restart after acceptance must not send the same email again.
    const claimed=await pool.query(`UPDATE competition_email_jobs SET state='sending', attempts=attempts+1 WHERE id=$1 AND state='pending' RETURNING id`,[job.id]);
    if(!claimed.rowCount) return;
    try {
      await send(job,registration);
      await client.query(`UPDATE competition_email_jobs SET state='sent', sent_at=NOW(), last_error=NULL WHERE id=$1`,[job.id]);
    } catch(error) {
      const safeRetry = ['EAUTH','EENVELOPE','ECONNECTION','EDNS'].includes(error.code) || Boolean(error.responseCode);
      await client.query(`UPDATE competition_email_jobs SET state=$2, available_at=NOW()+INTERVAL '5 minutes', last_error=$3 WHERE id=$1`,[job.id,safeRetry?'pending':'uncertain',String(error.code||'SMTP_UNCERTAIN').slice(0,120)]);
      logger.error('competition-email',{jobId:job.id,code:error.code||'SMTP_UNCERTAIN'});
    }
  });
}

async function runCompetitionAutomation() {
  const guard=await pool.connect();
  let locked=false;
  try {
    locked=(await guard.query(`SELECT pg_try_advisory_lock(hashtext('competition-automation')) AS locked`)).rows[0].locked;
    if(!locked) return;
    const registrations=await pool.query(`SELECT id FROM competition_registrations
      WHERE payment_deadline IS NOT NULL AND status='registered'
      AND paid_at IS NULL AND payment_status NOT IN ('paid','refunded')
      AND COALESCE(next_payment_check_at,created_at)<=NOW()
      ORDER BY next_payment_check_at NULLS FIRST LIMIT 100`);
    for(const {id} of registrations.rows) {
      try {await reconcileRegistration(id);} catch(error) {
        await pool.query(`UPDATE competition_registrations SET next_payment_check_at=NOW()+INTERVAL '60 seconds', automation_error=$2 WHERE id=$1`,[id,String(error.providerCode||error.code||error.message).slice(0,160)]);
        logger.warn('competition-automation',{registrationId:id,code:error.providerCode||error.code||'SYNC_FAILED'});
      }
    }
    const jobs=await pool.query(`SELECT j.* FROM competition_email_jobs j JOIN competition_registrations r ON r.id=j.registration_id
      WHERE j.state='pending' AND j.available_at<=NOW() ORDER BY j.id LIMIT 100`);
    for(const job of jobs.rows) {
      try {await deliverEmailJob(job);} catch(error) {
        await pool.query(`UPDATE competition_email_jobs SET available_at=NOW()+INTERVAL '60 seconds',last_error=$2 WHERE id=$1 AND state='pending'`,[job.id,String(error.code||'SYNC_FAILED').slice(0,120)]);
        logger.error('competition-email-job',{jobId:job.id,code:error.code||'JOB_FAILED'});
      }
    }
  } finally {
    if(locked) await guard.query(`SELECT pg_advisory_unlock(hashtext('competition-automation'))`);
    guard.release();
  }
}

function startCompetitionAutomation() {
  if(process.env.COMPETITION_AUTOMATION_ENABLED !== 'true') return () => {};
  let timer;
  let stopped=false;
  const tick=async()=>{
    try {await runCompetitionAutomation();} catch(error){logger.error('competition-automation-run',{code:error.code||'RUN_FAILED'});}
    if(!stopped) {timer=setTimeout(tick,5000);timer.unref();}
  };
  void tick();
  return ()=>{stopped=true;clearTimeout(timer);};
}

module.exports={canExpireRegistration,shouldSendCompetitionEmail,reconcileRegistration,deliverEmailJob,runCompetitionAutomation,startCompetitionAutomation};
