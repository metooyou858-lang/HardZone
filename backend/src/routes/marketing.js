const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const CAMPAIGN_STATUSES = new Set(['draft', 'active', 'archived']);
const REFERRAL_STATUSES = new Set(['registered', 'completed', 'cancelled']);
const REWARD_STATUSES = new Set(['pending', 'issued', 'cancelled']);
const REWARD_RECIPIENTS = new Set(['referrer', 'referred']);
const REWARD_TYPES = new Set(['discount_percent', 'free_visit']);
const bannerDir = path.join(__dirname, '..', '..', 'uploads', 'marketing');

const bannerStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(bannerDir, { recursive: true });
    callback(null, bannerDir);
  },
  filename: (_req, file, callback) => {
    const extensionByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${extensionByMime[file.mimetype] || ''}`);
  },
});

const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported marketing banner type'));
  },
});

function handleBannerUpload(req, res, next) {
  uploadBanner.single('banner')(req, res, (error) => {
    if (!error && req.file) return next();
    if (!error) return res.status(422).json({ success: false, error: 'Выберите баннер' });
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(422).json({ success: false, error: 'Баннер слишком большой. Максимальный размер — 8 МБ.' });
    }
    return res.status(422).json({ success: false, error: 'Поддерживаются JPG, PNG и WebP.' });
  });
}

function normalizeRewardRules(input) {
  if (!Array.isArray(input)) {
    throw Object.assign(new Error('Награды должны быть списком'), { statusCode: 422 });
  }

  return input.map((rule, index) => {
    const recipient = String(rule?.recipient || '').trim();
    const rewardType = String(rule?.reward_type || '').trim();
    const value = Number(rule?.value);

    if (!REWARD_RECIPIENTS.has(recipient)) {
      throw Object.assign(new Error(`Укажите получателя награды №${index + 1}`), { statusCode: 422 });
    }
    if (!REWARD_TYPES.has(rewardType)) {
      throw Object.assign(new Error(`Укажите тип награды №${index + 1}`), { statusCode: 422 });
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw Object.assign(new Error(`Укажите размер награды №${index + 1}`), { statusCode: 422 });
    }
    if (rewardType === 'discount_percent' && value > 100) {
      throw Object.assign(new Error('Скидка не может быть больше 100%'), { statusCode: 422 });
    }
    if (rewardType === 'free_visit' && !Number.isInteger(value)) {
      throw Object.assign(new Error('Количество бесплатных посещений должно быть целым числом'), { statusCode: 422 });
    }

    return { recipient, reward_type: rewardType, value };
  });
}

function normalizeCampaign(body, existing = {}) {
  const name = body.name !== undefined ? String(body.name || '').trim() : existing.name;
  const status = body.status !== undefined ? String(body.status || '').trim() : existing.status || 'draft';
  const campaignType = body.campaign_type !== undefined
    ? String(body.campaign_type || '').trim()
    : existing.campaign_type || 'referral';

  if (!name) throw Object.assign(new Error('Укажите название кампании'), { statusCode: 422 });
  if (!CAMPAIGN_STATUSES.has(status)) throw Object.assign(new Error('Некорректный статус кампании'), { statusCode: 422 });
  if (!campaignType) throw Object.assign(new Error('Укажите тип кампании'), { statusCode: 422 });

  const startsAt = body.starts_at !== undefined ? body.starts_at || null : existing.starts_at ?? null;
  const endsAt = body.ends_at !== undefined ? body.ends_at || null : existing.ends_at ?? null;
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw Object.assign(new Error('Дата окончания не может быть раньше даты начала'), { statusCode: 422 });
  }

  return {
    name,
    campaign_type: campaignType,
    status,
    public_rules: body.public_rules !== undefined ? String(body.public_rules || '').trim() : existing.public_rules || '',
    reward_rules: body.reward_rules !== undefined ? normalizeRewardRules(body.reward_rules) : normalizeRewardRules(existing.reward_rules || []),
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

function clientName(prefix) {
  return `NULLIF(CONCAT_WS(' ', ${prefix}.last_name, ${prefix}.first_name, ${prefix}.middle_name), '')`;
}

async function getCampaign(id, executor = pool) {
  const campaignResult = await executor.query(
    `SELECT mc.*, creator.name AS created_by_name, updater.name AS updated_by_name
     FROM marketing_campaigns mc
     LEFT JOIN users creator ON creator.id = mc.created_by
     LEFT JOIN users updater ON updater.id = mc.updated_by
     WHERE mc.id = $1`,
    [id]
  );
  if (!campaignResult.rows[0]) return null;

  const referralResult = await executor.query(
    `SELECT
       mr.*,
       ${clientName('referrer')} AS referrer_name,
       referrer.phone AS referrer_phone,
       ${clientName('referred')} AS referred_name,
       referred.phone AS referred_phone,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'id', mrr.id,
             'recipient_role', mrr.recipient_role,
             'client_id', mrr.client_id,
             'reward_type', mrr.reward_type,
             'reward_value', mrr.reward_value,
             'reward_snapshot', mrr.reward_snapshot,
             'status', mrr.status,
             'issued_at', mrr.issued_at,
             'note', mrr.note
           ) ORDER BY mrr.rule_index
         ) FILTER (WHERE mrr.id IS NOT NULL),
         '[]'::jsonb
       ) AS rewards
     FROM marketing_referrals mr
     JOIN clients referrer ON referrer.id = mr.referrer_client_id
     JOIN clients referred ON referred.id = mr.referred_client_id
     LEFT JOIN marketing_referral_rewards mrr ON mrr.referral_id = mr.id
     WHERE mr.campaign_id = $1
     GROUP BY mr.id, referrer.id, referred.id
     ORDER BY mr.created_at DESC, mr.id DESC`,
    [id]
  );

  return { ...campaignResult.rows[0], referrals: referralResult.rows };
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        mc.*,
        COUNT(DISTINCT mr.id)::INT AS participants_count,
        COUNT(DISTINCT mrr.id) FILTER (WHERE mrr.status = 'pending')::INT AS pending_rewards_count
      FROM marketing_campaigns mc
      LEFT JOIN marketing_referrals mr ON mr.campaign_id = mc.id
      LEFT JOIN marketing_referral_rewards mrr ON mrr.referral_id = mr.id
      GROUP BY mc.id
      ORDER BY CASE mc.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, mc.updated_at DESC, mc.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.list' });
  }
});

router.get('/client-search', async (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    if (search.length < 2) return res.json({ success: true, data: [] });
    const pattern = `%${search}%`;
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, middle_name, phone
       FROM clients
       WHERE status <> 'inactive'
         AND (CONCAT_WS(' ', last_name, first_name, middle_name) ILIKE $1 OR phone ILIKE $1)
       ORDER BY last_name, first_name
       LIMIT 12`,
      [pattern]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.client_search' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Кампания не найдена' });
    res.json({ success: true, data: campaign });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.get' });
  }
});

router.post('/', async (req, res, next) => {
  try {
    const campaign = normalizeCampaign(req.body);
    const { rows } = await pool.query(
      `INSERT INTO marketing_campaigns
        (name, campaign_type, status, public_rules, reward_rules, starts_at, ends_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)
       RETURNING *`,
      [campaign.name, campaign.campaign_type, campaign.status, campaign.public_rules, JSON.stringify(campaign.reward_rules), campaign.starts_at, campaign.ends_at, req.user.id]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const currentResult = await pool.query('SELECT * FROM marketing_campaigns WHERE id = $1', [req.params.id]);
    if (!currentResult.rows[0]) return res.status(404).json({ success: false, error: 'Кампания не найдена' });
    const campaign = normalizeCampaign(req.body, currentResult.rows[0]);
    const { rows } = await pool.query(
      `UPDATE marketing_campaigns
       SET name = $1, campaign_type = $2, status = $3, public_rules = $4,
           reward_rules = $5::jsonb, starts_at = $6, ends_at = $7,
           updated_by = $8, updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [campaign.name, campaign.campaign_type, campaign.status, campaign.public_rules, JSON.stringify(campaign.reward_rules), campaign.starts_at, campaign.ends_at, req.user.id, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    next(error);
  }
});

router.post('/:id/banner', handleBannerUpload, async (req, res) => {
  try {
    const bannerUrl = `/uploads/marketing/${req.file.filename}`;
    const { rows } = await pool.query(
      `UPDATE marketing_campaigns
       SET banner_url = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [bannerUrl, req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Кампания не найдена' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.banner' });
  }
});

router.post('/:id/referrals', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const referrerId = Number.parseInt(req.body.referrer_client_id, 10);
    const referredId = Number.parseInt(req.body.referred_client_id, 10);
    if (!referrerId || !referredId) {
      return res.status(422).json({ success: false, error: 'Выберите обоих клиентов из CRM' });
    }
    if (referrerId === referredId) {
      return res.status(422).json({ success: false, error: 'Клиент не может пригласить сам себя' });
    }

    await client.query('BEGIN');
    const campaignResult = await client.query('SELECT * FROM marketing_campaigns WHERE id = $1 FOR UPDATE', [req.params.id]);
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Кампания не найдена' });
    }
    const clientResult = await client.query('SELECT id FROM clients WHERE id = ANY($1::bigint[])', [[referrerId, referredId]]);
    if (clientResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Оба участника должны быть зарегистрированы в CRM' });
    }

    const referralResult = await client.query(
      `INSERT INTO marketing_referrals
        (campaign_id, referrer_client_id, referred_client_id, note, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, referrerId, referredId, String(req.body.note || '').trim() || null, req.user.id]
    );
    const referral = referralResult.rows[0];
    const rules = normalizeRewardRules(campaign.reward_rules);

    for (const [index, rule] of rules.entries()) {
      const recipientId = rule.recipient === 'referrer' ? referrerId : referredId;
      await client.query(
        `INSERT INTO marketing_referral_rewards
          (referral_id, rule_index, recipient_role, client_id, reward_type, reward_value, reward_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [referral.id, index, rule.recipient, recipientId, rule.reward_type, rule.value, JSON.stringify(rule)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: await getCampaign(req.params.id) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Этот приглашённый клиент уже участвует в кампании' });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    next(error);
  } finally {
    client.release();
  }
});

router.patch('/referrals/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!REFERRAL_STATUSES.has(status)) return res.status(422).json({ success: false, error: 'Некорректный статус участия' });
    const { rows } = await pool.query(
      `UPDATE marketing_referrals SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING campaign_id`,
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Участие не найдено' });
    res.json({ success: true, data: await getCampaign(rows[0].campaign_id) });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.referral_status' });
  }
});

router.patch('/rewards/:id', async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!REWARD_STATUSES.has(status)) return res.status(422).json({ success: false, error: 'Некорректный статус награды' });
    const note = String(req.body.note || '').trim() || null;
    const { rows } = await pool.query(
      `UPDATE marketing_referral_rewards mrr
       SET status = $1,
           issued_at = CASE WHEN $1 = 'issued' THEN NOW() ELSE NULL END,
           issued_by = CASE WHEN $1 = 'issued' THEN $2 ELSE NULL END,
           note = $3,
           updated_at = NOW()
       FROM marketing_referrals mr
       WHERE mrr.id = $4 AND mr.id = mrr.referral_id
       RETURNING mr.campaign_id`,
      [status, req.user.id, note, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Награда не найдена' });
    res.json({ success: true, data: await getCampaign(rows[0].campaign_id) });
  } catch (error) {
    sendInternalError(res, error, { route: 'marketing.reward_status' });
  }
});

module.exports = router;
module.exports.normalizeRewardRules = normalizeRewardRules;
