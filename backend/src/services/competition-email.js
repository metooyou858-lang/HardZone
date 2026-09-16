const path = require('node:path');
const templates = require('../assets/competition-email-templates.json');
const { getTransporter, readMailConfig } = require('./mail');
const { getCompetitionPublicConfig } = require('./competition-registration');
const { getCompetitionConfig } = require('./competition-events');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

function buildCompetitionEmail(kind, registration, config = getCompetitionPublicConfig()) {
  const template = templates[kind];
  if (!template) throw new Error('Unknown competition email type');
  const timezone = process.env.APP_TIMEZONE || 'Asia/Vladivostok';
  const deadline = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }).format(new Date(registration.payment_deadline));
  const base = String(process.env.COMPETITION_PUBLIC_BASE_URL || 'https://hardzone.space').replace(/\/$/, '');
  const registrationUrl = `${base}/competition/payment?registration=${encodeURIComponent(registration.public_token)}`;
  const values = {
    TEAM: registration.team_name,
    CATEGORY: config.categories?.find(item => item.key === registration.category)?.name || (registration.category === 'advanced' ? 'Продвинутые' : 'Любители'),
    FEE: new Intl.NumberFormat('ru-RU').format(Number(registration.fee_kopecks) / 100),
    DEADLINE: deadline,
    TIMEZONE: 'По времени Хабаровска',
    EVENT_DATE: new Intl.DateTimeFormat('ru-RU', {timeZone: timezone, day:'numeric', month:'long', year:'numeric'}).format(new Date(`${config.date}T12:00:00+10:00`)),
    LOCATION: config.location,
    REGISTRATION_URL: registrationUrl,
  };
  const publicUrl = `${base}${config.public_path || '/competition'}`;
  const text = [config.name, template.subject, '', `Команда: ${values.TEAM}`, `Категория: ${values.CATEGORY}`,
    `Взнос: ${values.FEE} ₽`, `Дата соревнований: ${values.EVENT_DATE}`,
    `Место: ${config.location}`,
    ...(kind === 'registration' || kind === 'reminder' ? [`Оплатите до ${deadline}. ${values.TIMEZONE}`, `Страница заявки: ${registrationUrl}`] : []),
    ...(kind === 'expired' ? ['Заявка отменена по истечении срока оплаты.', `Новая регистрация: ${publicUrl}`] : []),
    ...(kind === 'paid' ? ['Оплата получена. Участие подтверждено.', ...Object.entries(config.messenger_urls).filter(([,url])=>url).map(([name,url])=>`${name}: ${url}`)] : []),
    '', `Вопросы организатору: ${config.organizer.email}`].join('\n');
  const html = config.legacy !== false
    ? template.html.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => escapeHtml(values[key]))
    : `<html lang="ru"><body style="margin:0;background:#f0ede4;color:#121412;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td style="padding:32px 20px"><table role="presentation" width="100%" style="max-width:600px;margin:auto"><tr><td><p style="color:#686960">HARDZONE · ${escapeHtml(config.name)}</p><h1 style="font-size:28px">${escapeHtml(template.subject)}</h1>${text.split('\n').slice(3).filter(Boolean).map(line=>`<p style="line-height:1.6">${escapeHtml(line)}</p>`).join('')}<p style="padding:24px 0"><a href="${escapeHtml(kind === 'expired' ? publicUrl : registrationUrl)}" style="background:#c4c33a;color:#121412;padding:16px 24px;text-decoration:none;font-weight:bold">${kind === 'expired' ? 'Открыть регистрацию' : 'Открыть заявку'}</a></p></td></tr></table></td></tr></table></body></html>`;
  return {subject: `HardZone — ${template.subject}`, html, text};
}

async function sendCompetitionEmail(job, registration) {
  const transport = await getTransporter();
  const config = await getCompetitionConfig(registration.event_key);
  const message = buildCompetitionEmail(job.kind, registration, config);
  const info = await transport.sendMail({
    ...message, from: readMailConfig().from, to: registration.team_email,
    messageId: `<competition-${registration.id}-${job.kind}@hardzone.space>`,
    attachments: config.legacy ? [{filename:'hardzone-competition.jpg', path:path.join(__dirname, '../assets/competition-banner-email.jpg'), cid:'competition-poster@hardzone.space'}] : [],
  });
  if (!info.accepted?.length) throw Object.assign(new Error('Recipient rejected'), {code:'EENVELOPE'});
}

module.exports = {buildCompetitionEmail, sendCompetitionEmail};
