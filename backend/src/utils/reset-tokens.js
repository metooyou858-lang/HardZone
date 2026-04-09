const { createHash, randomBytes } = require('node:crypto');

function createResetToken() {
  return randomBytes(32).toString('base64url');
}

function hashResetToken(token) {
  return createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

module.exports = {
  createResetToken,
  hashResetToken,
};
