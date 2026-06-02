const logger = require('../services/logger');

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

function getPublicErrorMessage(error, statusCode) {
  if (statusCode >= 500) {
    return INTERNAL_ERROR_MESSAGE;
  }

  return error?.message || 'Error';
}

function sendInternalError(res, error, context = {}) {
  logger.error('internal_error', {
    ...context,
    message: error?.message,
    stack: error?.stack,
  });

  return res.status(500).json({
    success: false,
    error: INTERNAL_ERROR_MESSAGE,
  });
}

module.exports = {
  INTERNAL_ERROR_MESSAGE,
  getPublicErrorMessage,
  sendInternalError,
};
