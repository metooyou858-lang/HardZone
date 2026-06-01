'use strict';

const express = require('express');
const flow = require('../services/aqsi-v4-flow');

const router = express.Router();

// Устаревший endpoint — удалён, оставлен как 410 для безопасной деградации
router.post('/:id/send-to-aqsi-v4-legacy', (req, res) => {
  return res.status(410).json({ success: false, error: 'Устаревший endpoint. Используйте initiate-payment + sync-slip.' });
});

router.post('/:id/initiate-payment', async (req, res) => {
  try {
    const result = await flow.initiatePayment(req.params.id);
    if (result.type === 'conflict') {
      return res.json({ success: true, data: { status: 'operation_in_progress', conflicting_operation_id: result.conflictingOperationId } });
    }
    return res.json({ success: true, data: { operation_id: result.operationId } });
  } catch (err) {
    const body = { success: false, error: err.message };
    if (err.payment_operation_id) body.payment_operation_id = err.payment_operation_id;
    return res.status(err.statusCode || 500).json(body);
  }
});

router.post('/:id/sync-slip', async (req, res) => {
  try {
    const result = await flow.syncSlip(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/:id/sync-aqsi-v4', async (req, res) => {
  try {
    const result = await flow.syncAqsiV4(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// Нет /:id — должен быть смонтирован раньше ordersRouter
router.post('/recover-terminal-blocker', async (req, res) => {
  const { operation_id } = req.body;
  if (!operation_id) return res.status(422).json({ success: false, error: 'Укажите operation_id' });
  try {
    const result = await flow.recoverTerminalBlocker(operation_id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/force-clear-blocker', async (req, res) => {
  const { operation_id } = req.body;
  if (!operation_id) return res.status(422).json({ success: false, error: 'Укажите operation_id' });
  try {
    const result = await flow.forceClearBlocker(operation_id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
