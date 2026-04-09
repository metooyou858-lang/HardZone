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

function buildTemporaryPasswordText({ to, name, password, loginUrl }) {
  return [
    `Здравствуйте, ${name || 'сотрудник HardZone'}!`,
    '',
    'Для вашей учетной записи HardZone CRM подготовлен новый временный пароль.',
    '',
    `Логин: ${to}`,
    `Временный пароль: ${password}`,
    `Вход в CRM: ${loginUrl}`,
    '',
    'После входа рекомендуем сразу сменить пароль на свой.',
    '',
    'Если это письмо пришло вам по ошибке, просто проигнорируйте его.',
    '',
    'HardZone CRM',
  ].join('\n');
}

function buildTemporaryPasswordHtml({ to, name, password, loginUrl }) {
  const safeName = escapeHtml(name || 'сотрудник HardZone');
  const safeEmail = escapeHtml(to);
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(loginUrl);

  return `
    <div style="margin:0;padding:32px 0;background:#0b1018;">
      <div style="max-width:640px;margin:0 auto;padding:0 20px;">
        <div style="border:1px solid rgba(0,229,200,0.18);border-radius:28px;background:#121827;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.28);">
          <div style="padding:28px 32px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg, rgba(0,229,200,0.08) 0%, rgba(18,24,39,0.98) 100%);">
            <div style="display:flex;justify-content:center;align-items:center;padding-bottom:14px;">
              <img src="cid:${LOGO_CID}" alt="HardZone" style="display:block;width:132px;max-width:100%;height:auto;" />
            </div>
            <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#7f95b3;text-align:center;">HardZone CRM</div>
            <h1 style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:28px;line-height:1.2;color:#f5f7fb;text-align:center;">Временный пароль для входа</h1>
            <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#9fb2cd;text-align:center;">
              Здравствуйте, ${safeName}. Для вашей учетной записи подготовлен новый временный пароль.
            </p>
          </div>

          <div style="padding:28px 32px 20px;">
            <div style="border:1px solid rgba(255,255,255,0.08);border-radius:22px;background:#171f31;padding:20px 22px;">
              <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#7f95b3;">Данные для входа</div>
              <div style="margin-top:18px;">
                <div style="font-family:Arial,sans-serif;font-size:13px;color:#8ea2bf;">Логин</div>
                <div style="margin-top:6px;font-family:Arial,sans-serif;font-size:16px;font-weight:600;color:#f5f7fb;">${safeEmail}</div>
              </div>
              <div style="margin-top:18px;">
                <div style="font-family:Arial,sans-serif;font-size:13px;color:#8ea2bf;">Временный пароль</div>
                <div style="margin-top:8px;display:inline-block;padding:14px 18px;border-radius:18px;background:#0f1523;border:1px solid rgba(0,229,200,0.22);font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.04em;color:#00e5c8;">
                  ${safePassword}
                </div>
              </div>
            </div>

            <div style="margin-top:24px;">
              <a href="${safeLoginUrl}" style="display:inline-block;padding:14px 22px;border-radius:18px;background:#00c8ad;color:#04120f;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">
                Войти в HardZone CRM
              </a>
            </div>

            <p style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#9fb2cd;">
              После входа рекомендуем сразу сменить пароль на свой. Если письмо пришло вам по ошибке, просто проигнорируйте его.
            </p>
          </div>

          <div style="padding:18px 32px 26px;border-top:1px solid rgba(255,255,255,0.06);font-family:Arial,sans-serif;font-size:12px;line-height:1.7;color:#6f829f;">
            HardZone CRM • Хабаровск<br />
            Ссылка для входа: <a href="${safeLoginUrl}" style="color:#8fe9dc;text-decoration:none;">${safeLoginUrl}</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendTemporaryPasswordEmail({ to, name, password }) {
  if (!to) {
    throw new Error('Recipient email is required');
  }

  const transporter = await getTransporter();
  const config = readMailConfig();
  const loginUrl = `${getFrontendBaseUrl()}/login`;

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'HardZone CRM • временный пароль для входа',
    text: buildTemporaryPasswordText({ to, name, password, loginUrl }),
    html: buildTemporaryPasswordHtml({ to, name, password, loginUrl }),
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
  sendTemporaryPasswordEmail,
};
