const path = require('node:path');
const nodemailer = require('nodemailer');

const LOGO_CID = 'hardzone-logo@crm';
const LOGO_PATH = path.resolve(__dirname, '../assets/hardzone-logo.png');

let transporterPromise = null;

function readMailConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || user || '').trim();
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;

  return {
    host,
    port,
    user,
    pass,
    from,
    secure,
  };
}

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://79.137.162.55').replace(/\/+$/, '');
}

function isMailConfigured() {
  const config = readMailConfig();
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getTransporter() {
  if (transporterPromise) {
    return transporterPromise;
  }

  const config = readMailConfig();
  if (!isMailConfigured()) {
    throw new Error('Mail transport is not configured');
  }

  transporterPromise = Promise.resolve(
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })
  );

  return transporterPromise;
}

function buildPasswordResetText({ name, resetUrl, expiresInHours }) {
  return [
    `Здравствуйте, ${name || 'сотрудник HardZone'}!`,
    '',
    'Для вашей учётной записи HardZone CRM запрошено создание нового пароля.',
    '',
    `Задать новый пароль: ${resetUrl}`,
    '',
    `Ссылка действует ${expiresInHours} ч. и может быть использована только один раз.`,
    '',
    'Если вы не запрашивали изменение пароля, просто проигнорируйте письмо: текущий пароль продолжит действовать.',
    '',
    'HardZone CRM',
  ].join('\n');
}

function buildPasswordResetHtml({ name, resetUrl, expiresInHours }) {
  const safeName = escapeHtml(name || 'сотрудник HardZone');
  const safeResetUrl = escapeHtml(resetUrl);

  return `
    <div style="margin:0;padding:32px 0;background:#0b1018;">
      <div style="max-width:640px;margin:0 auto;padding:0 20px;">
        <div style="border:1px solid rgba(0,229,200,0.18);border-radius:28px;background:#121827;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.28);">
          <div style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg, rgba(0,229,200,0.08) 0%, rgba(18,24,39,0.98) 100%);">
            <div style="display:flex;justify-content:center;align-items:center;padding-bottom:14px;">
              <img src="cid:${LOGO_CID}" alt="HardZone" style="display:block;width:132px;max-width:100%;height:auto;" />
            </div>
            <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#7f95b3;text-align:center;">HardZone CRM</div>
            <h1 style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:1.2;color:#f5f7fb;text-align:center;">Создание нового пароля</h1>
            <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#9fb2cd;text-align:center;">
              Здравствуйте, ${safeName}. Перейдите по защищённой ссылке и задайте новый пароль для HardZone CRM.
            </p>
          </div>

          <div style="padding:28px 32px 20px;">
            <div style="border:1px solid rgba(255,255,255,0.08);border-radius:22px;background:#171f31;padding:20px 22px;">
              <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#7f95b3;">Безопасность</div>
              <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#9fb2cd;">
                Ссылка действует ${expiresInHours} ч. и может быть использована только один раз. До завершения операции текущий пароль не изменится.
              </p>
            </div>

            <div style="margin-top:24px;">
              <a href="${safeResetUrl}" style="display:inline-block;padding:14px 22px;border-radius:18px;background:#00c8ad;color:#04120f;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">
                Задать новый пароль
              </a>
            </div>

            <p style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#9fb2cd;">
              Если вы не запрашивали изменение пароля, просто проигнорируйте письмо. Текущий пароль продолжит действовать.
            </p>
          </div>

          <div style="padding:18px 32px 26px;border-top:1px solid rgba(255,255,255,0.06);font-family:Arial,sans-serif;font-size:12px;line-height:1.7;color:#6f829f;">
            HardZone CRM • Хабаровск<br />
            Ссылка для изменения пароля: <a href="${safeResetUrl}" style="color:#8fe9dc;text-decoration:none;">${safeResetUrl}</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresInHours }) {
  if (!to) {
    throw new Error('Recipient email is required');
  }

  const transporter = await getTransporter();
  const config = readMailConfig();
  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'HardZone CRM • создание нового пароля',
    text: buildPasswordResetText({ name, resetUrl, expiresInHours }),
    html: buildPasswordResetHtml({ name, resetUrl, expiresInHours }),
    attachments: [
      {
        filename: 'hardzone-logo.png',
        path: LOGO_PATH,
        cid: LOGO_CID,
      },
    ],
  });
}

module.exports = {
  isMailConfigured,
  sendPasswordResetEmail,
};
