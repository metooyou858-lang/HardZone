const express = require('express');
const { query } = require('../db');
const { getRecentErrors } = require('../services/logger');

const router = express.Router();

router.get('/status', async (req, res, next) => {
  if (!req.user || !['owner', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let dbOk = false;
    try {
      await query('SELECT 1');
      dbOk = true;
    } catch {
      // db down
    }

    const { rows: stuckOrders } = await query(
      `SELECT id, status, aqsi_payment_status, aqsi_receipt_status, aqsi_error,
              created_at, total_amount
       FROM orders
       WHERE status = 'open'
         AND (
           aqsi_payment_status = 'stuck'
           OR aqsi_receipt_status IN ('error', 'marking_error')
           OR (aqsi_error IS NOT NULL AND aqsi_payment_status IS NOT NULL)
         )
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.json({
      uptime_seconds: Math.floor(process.uptime()),
      db_ok: dbOk,
      recent_errors: getRecentErrors(),
      stuck_orders: stuckOrders,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
