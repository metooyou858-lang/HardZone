const path = require('node:path');
const templates = require('../assets/competition-email-templates.json');
const { getTransporter, readMailConfig } = require('./mail');
const { getCompetitionPublicConfig } = require('./competition-registration');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

function buildCompetitionEmail(kind, registration) {
  const config = getCompetitionPublicConfig();
  const template = templates[kind];
  if (!template) throw new Error('Unknown competition email type');
  const timezone = process.env.APP_TIMEZONE || 'Asia/Vladivostok';
  const deadline = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }).format(new Date(registration.payment_deadline));
  const base = String(process.env.COMPETITION_PUBLIC_BASE_URL || 'https://hardzone.space').replace(/\/$/, '');
  const registrationUrl = `${base}/competition/payment?registration=${encodeURIComponent(registration.public_token)}`;
  const values = {
    TEAM: registration.team_name,
    CATEGORY: registration.category === 'advanced' ? 'Продвинутые' : 'Любители',
    FEE: new Intl.NumberFormat('ru-RU').format(Number(registration.fee_kopecks) / 100),
    DEADLINE: deadline,
    TIMEZONE: 'По времени Хабаровска',
    EVENT_DATE: new Intl.DateTimeFormat('ru-RU', {timeZone: timezone, day:'numeric', month:'long', year:'numeric'}).format(new Date(`${config.date}T12:00:00+10:00`)),
    LOCATION: config.location,
    REGISTRATION_URL: registrationUrl,
  };
  const html = template.html.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => escapeHtml(values[key]));
  const text = [template.subject, '', `Команда: ${values.TEAM}`, `Категория: ${values.CATEGORY}`,
    `Взнос: ${values.FEE} ₽`, `Дата соревнований: ${values.EVENT_DATE}`,
    ...(kind === 'registration' || kind === 'reminder' ? [`Оплатите до ${deadline}. ${values.TIMEZONE}`, `Страница заявки: ${registrationUrl}`] : []),
    ...(kind === 'expired' ? ['Заявка отменена по истечении срока оплаты.', `Новая регистрация: ${base}/competition`] : []),
    ...(kind === 'paid' ? ['Оплата получена. Участие подтверждено.', `WhatsApp: ${config.messenger_urls.whatsapp}`, `Telegram: ${config.messenger_urls.telegram}`] : []),
    '', `Вопросы организатору: ${config.organizer.email}`].join('\n');
  return {subject: `HardZone — ${template.subject}`, html, text};
}

async function sendCompetitionEmail(job, registration) {
  const transport = await getTransporter();
  const message = buildCompetitionEmail(job.kind, registration);
  const info = await transport.sendMail({
    ...message, from: readMailConfig().from, to: registration.team_email,
    messageId: `<competition-${registration.id}-${job.kind}@hardzone.space>`,
    attachments: [{filename:'hardzone-competition.jpg', path:path.join(__dirname, '../assets/competition-banner-email.jpg'), cid:'competition-poster@hardzone.space'}],
  });
  if (!info.accepted?.length) throw Object.assign(new Error('Recipient rejected'), {code:'EENVELOPE'});
}

module.exports = {buildCompetitionEmail, sendCompetitionEmail};
