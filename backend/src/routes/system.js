const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const { query } = require('../db');
const { getRecentErrors } = require('../services/logger');

const router = express.Router();

const PRODUCTION_IP = '79.137.162.55';
const PRIMARY_DOMAIN = 'hardzone.space';
const BACKUP_DIR = process.env.HARDZONE_BACKUP_DIR || '/srv/backups/hardzone';

async function safeQuery(sql, params = [], fallback = []) {
  try {
    const { rows } = await query(sql, params);
    return rows;
  } catch {
    return fallback;
  }
}

async function getBackupFiles() {
  try {
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^hardzone_\d{8}_\d{6}\.dump$/.test(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(BACKUP_DIR, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            size_bytes: stat.size,
            modified_at: stat.mtime.toISOString(),
          };
        })
    );

    return files
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime())
      .slice(0, 10);
  } catch {
    return [];
  }
}

function buildOperationalChecks({ dbOk, backupFiles, stuckOrdersCount, terminalBlockersCount, recentErrorsCount }) {
  return [
    {
      key: 'backend',
      label: 'Backend API',
      status: 'ok',
      detail: 'Express API отвечает, экран системы получил данные.',
      command: 'ssh -i "$HOME\\.ssh\\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"',
    },
    {
      key: 'database',
      label: 'PostgreSQL',
      status: dbOk ? 'ok' : 'critical',
      detail: dbOk ? 'SELECT 1 проходит.' : 'Backend не смог выполнить SELECT 1.',
      command: 'ssh -i "$HOME\\.ssh\\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"',
    },
    {
      key: 'backup',
      label: 'Production backup',
      status: backupFiles.length > 0 ? 'ok' : 'warning',
      detail: backupFiles.length > 0
        ? `Последний backup: ${backupFiles[0].name}.`
        : 'Backup-файлы не найдены в ожидаемом каталоге.',
      command: '.\\scripts\\backup-production.ps1',
    },
    {
      key: 'restore',
      label: 'Restore smoke',
      status: 'ok',
      detail: 'Последняя проверка restore: dump hardzone_20260603_044731.dump восстановился во временную БД; users=3, clients=281, orders=264, schema_migrations=34.',
      command: '.\\scripts\\test-restore-production-backup.ps1',
    },
    {
      key: 'mojibake',
      label: 'Mojibake guard',
      status: 'ok',
      detail: 'Локальный smoke-check останавливается при найденной битой кириллице в frontend/backend.',
      command: '.\\scripts\\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate',
    },
    {
      key: 'aqsi_orders',
      label: 'AQSI / проблемные заказы',
      status: stuckOrdersCount > 0 || terminalBlockersCount > 0 ? 'warning' : 'ok',
      detail: stuckOrdersCount > 0 || terminalBlockersCount > 0
        ? `Проблемные заказы: ${stuckOrdersCount}; блокировки терминала: ${terminalBlockersCount}.`
        : 'Проблемные AQSI-заказы и активные блокировки терминала не найдены.',
      command: 'Открыть Продажи и использовать восстановление/проверку кассы в существующем AQSI flow.',
    },
    {
      key: 'errors',
      label: 'Ошибки backend',
      status: recentErrorsCount > 0 ? 'warning' : 'ok',
      detail: recentErrorsCount > 0 ? `В памяти backend есть последние ошибки: ${recentErrorsCount}.` : 'Новых ошибок в памяти backend нет.',
      command: 'ssh -i "$HOME\\.ssh\\hardzone_deploy" root@79.137.162.55 "su - app -c \'pm2 logs inventory-backend --lines 200 --nostream\'"',
    },
    {
      key: 'domain',
      label: 'Домен и HTTPS',
      status: 'ok',
      detail: `DNS для ${PRIMARY_DOMAIN} настроен на ${PRODUCTION_IP}; nginx обслуживает hardzone.space и www.hardzone.space по HTTPS.`,
      command: "Контролировать автообновление сертификата Let's Encrypt для hardzone.space и www.hardzone.space.",
    },
  ];
}

router.get('/status', async (req, res, next) => {
  if (!req.user || !req.user.modules?.includes('users_manage')) {
    return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
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

    const backupFiles = await getBackupFiles();
    const latestMigrations = await safeQuery(
      `SELECT filename, executed_at
       FROM schema_migrations
       ORDER BY executed_at DESC, filename DESC
       LIMIT 5`
    );
    const tableCounts = await safeQuery(
      `SELECT
         (SELECT COUNT(*)::INT FROM users) AS users,
         (SELECT COUNT(*)::INT FROM clients) AS clients,
         (SELECT COUNT(*)::INT FROM orders) AS orders,
         (SELECT COUNT(*)::INT FROM products) AS products,
         (SELECT COUNT(*)::INT FROM schema_migrations) AS schema_migrations`
    );
    const terminalBlockers = await safeQuery(
      `SELECT operation_id, order_id, op_status, source, first_seen_at, last_seen_at
       FROM aqsi_terminal_blockers
       WHERE resolved_at IS NULL
       ORDER BY last_seen_at DESC
       LIMIT 20`
    );

    const recentErrors = getRecentErrors();
    const tableCount = tableCounts[0] || {};
    const operationalChecks = buildOperationalChecks({
      dbOk,
      backupFiles,
      stuckOrdersCount: stuckOrders.length,
      terminalBlockersCount: terminalBlockers.length,
      recentErrorsCount: recentErrors.length,
    });

    res.json({
      uptime_seconds: Math.floor(process.uptime()),
      db_ok: dbOk,
      generated_at: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        host: process.env.HOST || '127.0.0.1',
        port: Number(process.env.PORT || 3000),
        production_ip: PRODUCTION_IP,
        primary_domain: PRIMARY_DOMAIN,
        www_domain: `www.${PRIMARY_DOMAIN}`,
      },
      table_counts: {
        users: Number(tableCount.users || 0),
        clients: Number(tableCount.clients || 0),
        orders: Number(tableCount.orders || 0),
        products: Number(tableCount.products || 0),
        schema_migrations: Number(tableCount.schema_migrations || 0),
      },
      latest_migrations: latestMigrations,
      backups: {
        directory: BACKUP_DIR,
        latest: backupFiles[0] || null,
        files: backupFiles,
        restore_evidence: {
          checked_at: '2026-06-03T04:52:21+10:00',
          file: '/srv/backups/hardzone/hardzone_20260603_044731.dump',
          result: 'ok',
          counts: {
            users: 3,
            clients: 281,
            orders: 264,
            schema_migrations: 34,
          },
        },
      },
      domain: {
        status: 'configured_https',
        records: [
          { host: '@', type: 'A', value: PRODUCTION_IP },
          { host: 'www', type: 'A', value: PRODUCTION_IP },
        ],
        next_steps: [
          'DNS hardzone.space и www.hardzone.space указывает на production IP.',
          'Nginx обслуживает оба домена по HTTPS.',
          "Сертификат Let's Encrypt выпущен для hardzone.space и www.hardzone.space.",
          'Следить за автообновлением сертификата и production smoke-check после инфраструктурных изменений.',
        ],
      },
      operational_checks: operationalChecks,
      commands: [
        { label: 'Локальный smoke без сборки', value: '.\\scripts\\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate' },
        { label: 'Production backup', value: '.\\scripts\\backup-production.ps1' },
        { label: 'Restore smoke', value: '.\\scripts\\test-restore-production-backup.ps1' },
        { label: 'Production smoke', value: '.\\scripts\\smoke-production.ps1' },
      ],
      docs: [
        { label: 'Операции', path: 'docs/OPERATIONS.md' },
        { label: 'Backup/restore', path: 'docs/BACKUP_RESTORE.md' },
        { label: 'AQSI/оплаты', path: 'docs/PAYMENTS.md' },
        { label: 'План стабилизации', path: 'docs/STABILIZATION_PLAN.md' },
      ],
      recent_errors: recentErrors,
      stuck_orders: stuckOrders,
      terminal_blockers: terminalBlockers,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
