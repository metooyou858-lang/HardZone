const crypto = require('node:crypto');
const csv = require('csv-parse/sync');

const { normalizePhone } = require('../utils/phones');
const { CLUB_TIME_ZONE, expireActiveSubscriptions } = require('./subscription-validity');

const TYPE_VALUES = new Set(['single', 'visits', 'period', 'unlimited']);
const STATUS_VALUES = new Set(['active', 'frozen', 'expired', 'exhausted']);

function getCell(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && String(row[name]).trim() !== '') {
      return String(row[name]).trim();
    }
  }

  return '';
}

function parseInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).replace(/\s+/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'да', 'семейный'].includes(normalized);
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return raw;
  }

  const dotMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!dotMatch) {
    return null;
  }

  const day = dotMatch[1].padStart(2, '0');
  const month = dotMatch[2].padStart(2, '0');
  const year = dotMatch[3].length === 2 ? `20${dotMatch[3]}` : dotMatch[3];
  return `${year}-${month}-${day}`;
}

function inferSubscriptionType(row, visitsTotal, visitsLeft) {
  const rawType = getCell(row, ['type', 'тип', 'Тип', 'subscription_type', 'Тип абонемента', 'Абонемент']).toLowerCase();

  if (TYPE_VALUES.has(rawType)) {
    return rawType;
  }

  if (rawType.includes('раз')) return 'single';
  if (rawType.includes('посещ') || rawType.includes('занят') || rawType.includes('visit')) return 'visits';
  if (rawType.includes('безлим') || rawType.includes('unlimited')) return 'unlimited';
  if (rawType.includes('мес') || rawType.includes('период') || rawType.includes('period')) return 'period';
  if (visitsTotal !== null || visitsLeft !== null) return 'visits';

  return null;
}

function normalizeStatus(row, type, expiresAt, visitsLeft, today) {
  const rawStatus = getCell(row, ['status', 'статус', 'Статус']).toLowerCase();

  if (STATUS_VALUES.has(rawStatus)) {
    return rawStatus;
  }

  if (expiresAt && expiresAt < today) {
    return 'expired';
  }

  if (['single', 'visits'].includes(type) && visitsLeft !== null && visitsLeft <= 0) {
    return 'exhausted';
  }

  return 'active';
}

function parseRows(buffer) {
  const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return csv.parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function mapLegacyRow(row, rowNumber, today) {
  const visitsTotal = parseInteger(getCell(row, [
    'visits_total',
    'visitsTotal',
    'Всего посещений',
    'Количество посещений',
    'Посещений',
  ]));
  const visitsLeft = parseInteger(getCell(row, [
    'visits_left',
    'visitsLeft',
    'Остаток',
    'Осталось',
    'Осталось посещений',
  ]));
  const type = inferSubscriptionType(row, visitsTotal, visitsLeft);
  const startedAt = parseDate(getCell(row, [
    'started_at',
    'start_date',
    'Дата начала',
    'Начало',
    'Активен с',
  ]));
  const expiresAt = parseDate(getCell(row, [
    'expires_at',
    'end_date',
    'Дата окончания',
    'Окончание',
    'Активен до',
    'Действует до',
  ]));
  const clientId = parseInteger(getCell(row, ['client_id', 'clientId', 'ID клиента', 'Клиент ID']));
  const productId = parseInteger(getCell(row, ['product_id', 'productId', 'ID услуги', 'Услуга ID']));
  const status = type ? normalizeStatus(row, type, expiresAt, visitsLeft, today) : null;

  return {
    row_number: rowNumber,
    client_id: clientId,
    phone: getCell(row, ['phone', 'Телефон', 'телефон']),
    email: getCell(row, ['email', 'Email', 'Почта']),
    first_name: getCell(row, ['first_name', 'Имя', 'имя']),
    last_name: getCell(row, ['last_name', 'Фамилия', 'фамилия']),
    product_id: productId,
    product_name: getCell(row, ['product_name', 'Услуга', 'Абонемент', 'Название абонемента']),
    type,
    visits_total: visitsTotal,
    visits_left: visitsLeft ?? visitsTotal,
    started_at: startedAt,
    expires_at: expiresAt,
    is_family: parseBoolean(getCell(row, ['is_family', 'Семейный', 'family'])),
    status,
    note: getCell(row, ['note', 'Комментарий', 'comment', 'Примечание']),
  };
}

async function getClubToday(executor) {
  const { rows } = await executor.query('SELECT (NOW() AT TIME ZONE $1)::date::text AS today', [CLUB_TIME_ZONE]);
  return rows[0].today;
}

async function resolveClient(executor, item) {
  if (item.client_id) {
    const { rows } = await executor.query('SELECT id, first_name, last_name, phone, email FROM clients WHERE id = $1', [item.client_id]);
    return rows[0] || null;
  }

  const normalizedPhone = normalizePhone(item.phone);
  if (normalizedPhone) {
    const { rows } = await executor.query(
      `
        SELECT id, first_name, last_name, phone, email
        FROM clients
        WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') IN ($1, $2)
        ORDER BY id
        LIMIT 2
      `,
      [normalizedPhone, normalizedPhone.length === 11 && normalizedPhone.startsWith('7') ? `8${normalizedPhone.slice(1)}` : normalizedPhone]
    );
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) return { ambiguous: true };
  }

  if (item.email) {
    const { rows } = await executor.query(
      'SELECT id, first_name, last_name, phone, email FROM clients WHERE lower(email) = lower($1) ORDER BY id LIMIT 2',
      [item.email]
    );
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) return { ambiguous: true };
  }

  if (item.first_name || item.last_name) {
    const { rows } = await executor.query(
      `
        SELECT id, first_name, last_name, phone, email
        FROM clients
        WHERE lower(first_name) = lower($1)
          AND lower(last_name) = lower($2)
        ORDER BY id
        LIMIT 2
      `,
      [item.first_name, item.last_name]
    );
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) return { ambiguous: true };
  }

  return null;
}

async function resolveProduct(executor, item) {
  if (item.product_id) {
    const { rows } = await executor.query('SELECT id, name FROM products WHERE id = $1 AND type = $2', [item.product_id, 'service']);
    return rows[0] || null;
  }

  if (!item.product_name) {
    return null;
  }

  const { rows } = await executor.query(
    'SELECT id, name FROM products WHERE type = $1 AND lower(name) = lower($2) ORDER BY id LIMIT 2',
    ['service', item.product_name]
  );
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) return { ambiguous: true };
  return null;
}

async function buildLegacySubscriptionImportPlan(executor, buffer) {
  const today = await getClubToday(executor);
  const parsedRows = parseRows(buffer);
  const results = [];

  for (let index = 0; index < parsedRows.length; index += 1) {
    const item = mapLegacyRow(parsedRows[index], index + 2, today);
    const errors = [];
    const warnings = [];

    if (!item.type) {
      errors.push('Не удалось определить тип абонемента');
    }
    if (!item.client_id && !item.phone && !item.email && (!item.first_name || !item.last_name)) {
      errors.push('Не указан клиент: нужен client_id, телефон, email или ФИО');
    }

    const resolvedClient = errors.length ? null : await resolveClient(executor, item);
    if (resolvedClient?.ambiguous) {
      errors.push('Найдено несколько клиентов, укажите client_id');
    } else if (!resolvedClient) {
      errors.push('Клиент не найден');
    }

    const resolvedProduct = await resolveProduct(executor, item);
    if (resolvedProduct?.ambiguous) {
      warnings.push('Найдено несколько услуг с таким названием, product_id не будет заполнен');
    } else if (item.product_id && !resolvedProduct) {
      warnings.push('Услуга по product_id не найдена, абонемент будет без привязки к услуге');
    } else if (item.product_name && !resolvedProduct) {
      warnings.push('Услуга по названию не найдена, абонемент будет без привязки к услуге');
    }

    if (resolvedClient && !resolvedClient.ambiguous) {
      const { rows: activeRows } = await executor.query(
        `
          SELECT id
          FROM client_subscriptions
          WHERE client_id = $1
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at >= $2::date)
          LIMIT 1
        `,
        [resolvedClient.id, today]
      );
      if (activeRows[0] && item.status === 'active') {
        errors.push(`У клиента уже есть активный абонемент #${activeRows[0].id}`);
      }
    }

    results.push({
      ...item,
      client: resolvedClient && !resolvedClient.ambiguous ? resolvedClient : null,
      product: resolvedProduct && !resolvedProduct.ambiguous ? resolvedProduct : null,
      errors,
      warnings,
      ready: errors.length === 0,
    });
  }

  return {
    total: results.length,
    ready: results.filter((item) => item.ready).length,
    conflicts: results.filter((item) => !item.ready).length,
    rows: results,
  };
}

async function importLegacySubscriptions(executor, buffer, importedBy) {
  const plan = await buildLegacySubscriptionImportPlan(executor, buffer);
  const batchId = crypto.randomUUID();
  const imported = [];

  for (const item of plan.rows.filter((row) => row.ready)) {
    await expireActiveSubscriptions(executor, { clientId: item.client.id });

    const { rows } = await executor.query(
      `
        INSERT INTO client_subscriptions (
          client_id, product_id, type, visits_total, visits_left,
          started_at, expires_at, is_family, status,
          legacy_import_batch_id, legacy_source, legacy_note
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `,
      [
        item.client.id,
        item.product?.id || null,
        item.type,
        item.visits_total,
        item.visits_left,
        item.started_at,
        item.expires_at,
        item.is_family,
        item.status,
        batchId,
        'legacy_crm',
        [item.note, importedBy ? `imported_by=${importedBy}` : null].filter(Boolean).join(' | ') || null,
      ]
    );
    imported.push(rows[0]);
  }

  return {
    batch_id: batchId,
    imported: imported.length,
    skipped: plan.total - imported.length,
    rows: plan.rows,
  };
}

module.exports = {
  buildLegacySubscriptionImportPlan,
  importLegacySubscriptions,
};
