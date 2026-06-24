const { normalizePhone } = require('../utils/phones');

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ');
}

function getClientSearchTokens(search) {
  return normalizeSearchText(search).split(/\s+/).filter(Boolean);
}

function isTextSearchToken(token) {
  return /[A-Za-zА-Яа-яЁё]/.test(String(token || ''));
}

function getClientSearchDigits(search) {
  const rawDigits = String(search || '').replace(/\D/g, '');
  const normalizedPhone = normalizePhone(search);

  return Array.from(new Set([rawDigits, normalizedPhone].filter(Boolean)));
}

function clientSearchExpression(alias = 'c', { includeEmail = true } = {}) {
  const textFields = [
    `${alias}.first_name`,
    `${alias}.last_name`,
    `COALESCE(${alias}.middle_name, '')`,
    `CONCAT_WS(' ', ${alias}.last_name, ${alias}.first_name, ${alias}.middle_name)`,
    `CONCAT_WS(' ', ${alias}.first_name, ${alias}.last_name, ${alias}.middle_name)`,
    `CONCAT_WS(' ', ${alias}.first_name, ${alias}.middle_name, ${alias}.last_name)`,
    `CONCAT_WS(' ', ${alias}.last_name, ${alias}.first_name)`,
    `CONCAT_WS(' ', ${alias}.first_name, ${alias}.last_name)`,
  ];

  if (includeEmail) {
    textFields.push(`COALESCE(${alias}.email, '')`);
  }

  return `
    ${textFields.map((field) => `replace(lower(${field}), 'ё', 'е') ILIKE lower($TOKEN)`).join('\n    OR ')}
    OR COALESCE(${alias}.barcode, '') ILIKE $TOKEN
  `;
}

function addClientSearchConditions({
  search,
  params,
  conditions,
  alias = 'c',
  includeEmail = true,
}) {
  const tokens = getClientSearchTokens(search);
  const textTokens = tokens.filter(isTextSearchToken);
  const digits = getClientSearchDigits(search);

  textTokens.forEach((token) => {
    params.push(`%${token}%`);
    const tokenIndex = params.length;
    const tokenCondition = clientSearchExpression(alias, { includeEmail })
      .replaceAll('$TOKEN', `$${tokenIndex}`);

    conditions.push(`
      (
        ${tokenCondition}
      )
    `);
  });

  if (textTokens.length === 0 && digits.length > 0) {
    const digitConditions = [];

    digits.forEach((digitsValue) => {
      params.push(`%${digitsValue}%`);
      const digitIndex = params.length;
      digitConditions.push(`
        regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g') LIKE $${digitIndex}
        OR COALESCE(${alias}.phone_normalized, '') LIKE $${digitIndex}
        OR COALESCE(${alias}.barcode, '') LIKE $${digitIndex}
      `);
    });

    conditions.push(`
      (
        ${digitConditions.join('\n        OR ')}
      )
    `);
  }

  return { tokens, textTokens, digits };
}

module.exports = {
  addClientSearchConditions,
  getClientSearchDigits,
  getClientSearchTokens,
  isTextSearchToken,
  normalizeSearchText,
};
