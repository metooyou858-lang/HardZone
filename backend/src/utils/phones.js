function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  return digits;
}

module.exports = {
  normalizePhone,
};
