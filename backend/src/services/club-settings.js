const { query } = require('../db');

const CONTACT_FIELDS = [
  'title',
  'address',
  'phone',
  'email',
  'yandex_maps_url',
  'google_maps_url',
  'two_gis_url',
  'vk_url',
  'instagram_url',
  'telegram_url',
  'whatsapp_url',
  'max_url',
  'schedule_note',
  'extra_note',
];

function normalizeOptionalText(value, maxLength = 1000) {
  if (value === undefined) return undefined;
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeContactInput(input = {}) {
  const title = normalizeOptionalText(input.title, 120);

  return {
    title: input.title === undefined ? undefined : title || 'HardZone',
    address: normalizeOptionalText(input.address, 500),
    phone: normalizeOptionalText(input.phone, 80),
    email: normalizeOptionalText(input.email, 160),
    yandex_maps_url: normalizeOptionalText(input.yandex_maps_url, 500),
    google_maps_url: normalizeOptionalText(input.google_maps_url, 500),
    two_gis_url: normalizeOptionalText(input.two_gis_url, 500),
    vk_url: normalizeOptionalText(input.vk_url, 300),
    instagram_url: normalizeOptionalText(input.instagram_url, 300),
    telegram_url: normalizeOptionalText(input.telegram_url, 300),
    whatsapp_url: normalizeOptionalText(input.whatsapp_url, 300),
    max_url: normalizeOptionalText(input.max_url, 300),
    schedule_note: normalizeOptionalText(input.schedule_note, 500),
    extra_note: normalizeOptionalText(input.extra_note, 1000),
  };
}

async function ensureClubContactsRow() {
  await query(`
    INSERT INTO club_contact_settings (id, title)
    VALUES (true, 'HardZone')
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getClubContacts() {
  await ensureClubContactsRow();
  const { rows } = await query(
    `
      SELECT
        title,
        address,
        phone,
        email,
        yandex_maps_url,
        google_maps_url,
        two_gis_url,
        vk_url,
        instagram_url,
        telegram_url,
        whatsapp_url,
        max_url,
        schedule_note,
        extra_note,
        updated_at
      FROM club_contact_settings
      WHERE id = true
      LIMIT 1
    `
  );

  return rows[0] || null;
}

async function updateClubContacts(input = {}) {
  const normalized = normalizeContactInput(input);
  const updates = [];
  const values = [];

  CONTACT_FIELDS.forEach((field) => {
    if (normalized[field] !== undefined) {
      values.push(normalized[field]);
      updates.push(`${field} = $${values.length}`);
    }
  });

  if (!updates.length) {
    return getClubContacts();
  }

  await ensureClubContactsRow();

  const { rows } = await query(
    `
      UPDATE club_contact_settings
      SET ${updates.join(', ')},
          updated_at = NOW()
      WHERE id = true
      RETURNING
        title,
        address,
        phone,
        email,
        yandex_maps_url,
        google_maps_url,
        two_gis_url,
        vk_url,
        instagram_url,
        telegram_url,
        whatsapp_url,
        max_url,
        schedule_note,
        extra_note,
        updated_at
    `,
    values
  );

  return rows[0];
}

module.exports = {
  getClubContacts,
  updateClubContacts,
};
