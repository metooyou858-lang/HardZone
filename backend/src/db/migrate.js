require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');

const { withTransaction } = require('./index');

const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function run() {
  const files = await getMigrationFiles();

  for (const filename of files) {
    const fullPath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(fullPath, 'utf8');

    const applied = await withTransaction(async (client) => {
      try {
        await ensureMigrationsTable(client);

        const existing = await client.query(
          'SELECT 1 FROM schema_migrations WHERE filename = $1',
          [filename]
        );

        if (existing.rowCount > 0) {
          return false;
        }

        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );

        return true;
      } catch (error) {
        console.error(`failed ${filename}`);
        throw error;
      }
    });

    console.log(`${applied ? 'applied' : 'skipped'} ${filename}`);
  }
}

run().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
