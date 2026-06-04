require('dotenv').config();

const express = require('express');

const authMiddleware = require('./middleware/auth');
const { pool, query } = require('./db');
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const receiptsRouter = require('./routes/receipts');
const writeoffsRouter = require('./routes/writeoffs');
const salesRouter = require('./routes/sales');
const categoriesRouter = require('./routes/categories');
const importRouter = require('./routes/import');
const inventoriesRouter = require('./routes/inventories');
const productTypesRouter = require('./routes/product-types');
const ordersRouter = require('./routes/orders');
const aqsiV4Router = require('./routes/aqsi-v4');
const clientsRouter = require('./routes/clients');
const subscriptionsRouter = require('./routes/subscriptions');
const trainingTypesRouter = require('./routes/training-types');
const trainersRouter = require('./routes/trainers');
const scheduleRouter = require('./routes/schedule');
const bookingsRouter = require('./routes/bookings');
const webhooksRouter = require('./routes/webhooks');
const telegramRouter = require('./routes/telegram');
const systemRouter = require('./routes/system');
const staffRouter = require('./routes/staff');
const { startDelayedAqsiSyncScheduler } = require('./services/order-sync');
const { markMissedBookings } = require('./jobs/schedule-cleanup');
const { ensureBootstrapUser } = require('./services/user-auth');
const logger = require('./services/logger');
const { getPublicErrorMessage } = require('./utils/http-response');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const requireModule = authMiddleware.requireModule;

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms,
      user: req.user?.username ?? null,
    });
  });
  next();
});

app.get('/health', async (req, res, next) => {
  try {
    await query('SELECT 1');

    res.json({
      status: 'ok',
      uptime: process.uptime(),
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/products', authMiddleware, requireModule('warehouse', 'services', 'sales', 'schedule'), productsRouter);
app.use('/api/receipts', authMiddleware, requireModule('warehouse'), receiptsRouter);
app.use('/api/writeoffs', authMiddleware, requireModule('warehouse'), writeoffsRouter);
app.use('/api/product-types', authMiddleware, requireModule('warehouse'), productTypesRouter);
app.use('/api/inventories', authMiddleware, requireModule('warehouse'), inventoriesRouter);
app.use('/api/categories', authMiddleware, requireModule('warehouse'), categoriesRouter);
app.use('/api/import', authMiddleware, requireModule('warehouse'), importRouter);
app.use('/api/sales', authMiddleware, requireModule('sales'), salesRouter);
app.use('/api/orders', authMiddleware, requireModule('sales'), aqsiV4Router);
app.use('/api/orders', authMiddleware, requireModule('sales'), ordersRouter);
app.use('/api/clients', authMiddleware, requireModule('clients', 'clients_create', 'clients_update', 'clients_import', 'sales', 'schedule'), clientsRouter);
app.use('/api/subscriptions', authMiddleware, requireModule('clients'), subscriptionsRouter);
app.use('/api/training-types', authMiddleware, requireModule('services', 'schedule'), trainingTypesRouter);
app.use('/api/trainers', authMiddleware, requireModule('schedule', 'services'), trainersRouter);
app.use('/api/schedule', authMiddleware, requireModule('schedule'), scheduleRouter);
app.use('/api/bookings', authMiddleware, requireModule('schedule'), bookingsRouter);
app.use('/api/staff', authMiddleware, staffRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/system', authMiddleware, systemRouter);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  logger.error('unhandled', {
    method: req.method,
    url: req.originalUrl,
    user: req.user?.username ?? null,
    status: statusCode,
    message: error.message,
    stack: error.stack,
  });

  res.status(statusCode).json({
    error: getPublicErrorMessage(error, statusCode),
  });
});

async function start() {
  await query('SELECT 1');
  const bootstrapUser = await ensureBootstrapUser();
  if (bootstrapUser) {
    console.log(`Bootstrap auth user is ready: ${bootstrapUser.username}`);
  }
  startDelayedAqsiSyncScheduler();
  markMissedBookings();
  const scheduleCleanupInterval = setInterval(markMissedBookings, 60 * 60 * 1000);

  const server = app.listen(port, host, () => {
    console.log(`API started on ${host}:${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down`);

    server.close(async () => {
      clearInterval(scheduleCleanupInterval);
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      console.error('Shutdown failed', error);
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      console.error('Shutdown failed', error);
      process.exit(1);
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start API', error);
    process.exit(1);
  });
}

module.exports = app;
