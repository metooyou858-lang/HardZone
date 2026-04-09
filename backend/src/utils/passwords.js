const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function createTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(length);
  let password = '';

  for (let index = 0; index < length; index += 1) {
    password += alphabet[bytes[index] % alphabet.length];
  }

  return password;
}

async function hashPassword(password) {
  const normalized = String(password || '');
  if (normalized.length < 8) {
    throw new Error('Пароль должен быть не короче 8 символов');
  }

  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(normalized, salt, KEY_LENGTH);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const normalized = String(password || '');
  const [algorithm, salt, storedHex] = String(passwordHash || '').split('$');

  if (algorithm !== 'scrypt' || !salt || !storedHex) {
    return false;
  }

  const storedBuffer = Buffer.from(storedHex, 'hex');
  const derivedKey = await scrypt(normalized, salt, storedBuffer.length);
  return timingSafeEqual(Buffer.from(derivedKey), storedBuffer);
}

module.exports = {
  createTemporaryPassword,
  hashPassword,
  normalizeUsername,
  verifyPassword,
};
