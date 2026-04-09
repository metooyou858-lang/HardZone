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
const clientsRouter = require('./routes/clients');
const subscriptionsRouter = require('./routes/subscriptions');
const trainingTypesRouter = require('./routes/training-types');
const trainersRouter = require('./routes/trainers');
const scheduleRouter = require('./routes/schedule');
const bookingsRouter = require('./routes/bookings');
const webhooksRouter = require('./routes/webhooks');
const { startDelayedAqsiSyncScheduler } = require('./services/order-sync');
const { markMissedBookings } = require('./jobs/schedule-cleanup');
const { ensureBootstrapUser } = require('./services/user-auth');

const app = express();
const port = Number(process.env.PORT || 3000);
const requireModule = authMiddleware.requireModule;

app.use(express.json());

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
app.use('/api/orders', authMiddleware, requireModule('sales'), ordersRouter);
app.use('/api/clients', authMiddleware, requireModule('clients', 'sales', 'schedule'), clientsRouter);
app.use('/api/subscriptions', authMiddleware, requireModule('clients'), subscriptionsRouter);
app.use('/api/training-types', authMiddleware, requireModule('services', 'schedule'), trainingTypesRouter);
app.use('/api/trainers', authMiddleware, requireModule('schedule', 'services'), trainersRouter);
app.use('/api/schedule', authMiddleware, requireModule('schedule'), scheduleRouter);
app.use('/api/bookings', authMiddleware, requireModule('schedule'), bookingsRouter);
app.use('/api/webhooks', webhooksRouter);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    error: error.message || 'Internal server error',
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

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API started on port ${port}`);
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
