'use strict';

const express = require('express');
const flow = require('../services/aqsi-v4-flow');
const { pool } = require('../db');
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

// История продаж использует старый URL; V4-операции нельзя сверять через Orders/simple.
router.post('/:id/sync-aqsi', requireSalesAqsiRecovery, async (req, res, next) => {
  try {
    const { rows: [order] } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order || !(order.aqsi_slip_id || order.aqsi_payment_operation_id)) {
      return next();
    }
    const result = await flow.syncAqsiV4(order.id);
    const { rows: [fresh] } = await pool.query('SELECT * FROM orders WHERE id = $1', [order.id]);
    const paid = ['confirmed', 'refunded'].includes(fresh.status);
    if (!paid) {
      const message = result.message || (result.status === 'receipt_pending'
        ? 'Фискализация ещё выполняется. Повторите проверку через несколько секунд; оплачивать заказ заново не нужно.'
        : result.status === 'payment_pending'
          ? 'Касса ещё выполняет оплату. Повторите проверку через несколько секунд.'
          : `Восстановление не завершено: ${result.status}`);
      return res.status(409).json({ success: false, error: message });
    }
    return res.json({ success: true, data: {
      paid, payment_type: fresh.payment_type, aqsi_status: fresh.aqsi_receipt_status, order: fresh,
    } });
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
