require('dotenv').config();

const express = require('express');

const authMiddleware = require('./middleware/auth');
const { pool, query } = require('./db');
const productsRouter = require('./routes/products');
const receiptsRouter = require('./routes/receipts');
const writeoffsRouter = require('./routes/writeoffs');
const salesRouter = require('./routes/sales');
const categoriesRouter = require('./routes/categories');
const importRouter = require('./routes/import');
const inventoriesRouter = require('./routes/inventories');

const app = express();
const port = Number(process.env.PORT || 3000);

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

app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/receipts', authMiddleware, receiptsRouter);
app.use('/api/writeoffs', authMiddleware, writeoffsRouter);
app.use('/api/inventories', authMiddleware, inventoriesRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/import', authMiddleware, importRouter);
app.use('/api/sales', authMiddleware, salesRouter);

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

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API started on port ${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down`);

    server.close(async () => {
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
