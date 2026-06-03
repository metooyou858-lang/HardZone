'use strict';

const express = require('express');
const flow = require('../services/aqsi-v4-flow');
const authMiddleware = require('../middleware/auth');
const { getPublicErrorMessage } = require('../utils/http-response');

const router = express.Router();
const requireSalesPay = authMiddleware.requireModule('sales_pay');
const requireSalesAqsiRecovery = authMiddleware.requireModule('sales_aqsi_recovery');

// Устаревший endpoint — удалён, оставлен как 410 для безопасной деградации
router.post('/:id/send-to-aqsi-v4-legacy', (req, res) => {
  return res.status(410).json({ success: false, error: 'Устаревший endpoint. Используйте initiate-payment + sync-slip.' });
});

router.post('/:id/initiate-payment', requireSalesPay, async (req, res) => {
  try {
    const result = await flow.initiatePayment(req.params.id);
    if (result.type === 'conflict') {
      return res.json({ success: true, data: { status: 'operation_in_progress', conflicting_operation_id: result.conflictingOperationId } });
    }
    return res.json({ success: true, data: { operation_id: result.operationId } });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const body = { success: false, error: getPublicErrorMessage(err, statusCode) };
    if (err.payment_operation_id) body.payment_operation_id = err.payment_operation_id;
    return res.status(statusCode).json(body);
  }
});

router.post('/:id/sync-slip', requireSalesPay, async (req, res) => {
  try {
    const result = await flow.syncSlip(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/:id/sync-aqsi-v4', requireSalesAqsiRecovery, async (req, res) => {
  try {
    const result = await flow.syncAqsiV4(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

// Нет /:id — должен быть смонтирован раньше ordersRouter
router.post('/recover-terminal-blocker', requireSalesAqsiRecovery, async (req, res) => {
  const { operation_id } = req.body;
  if (!operation_id) return res.status(422).json({ success: false, error: 'Укажите operation_id' });
  try {
    const result = await flow.recoverTerminalBlocker(operation_id);
    return res.json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/force-clear-blocker', requireSalesAqsiRecovery, async (req, res) => {
  const { operation_id } = req.body;
  if (!operation_id) return res.status(422).json({ success: false, error: 'Укажите operation_id' });
  try {
    const result = await flow.forceClearBlocker(operation_id);
    return res.json({ success: true, data: result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

module.exports = router;
