const express = require('express');

const { buildUserAccessPayload, getDefaultModulesForRole, getDefaultRoleTitle } = require('../authz');
const { query, withTransaction } = require('../db');
const authMiddleware = require('../middleware/auth');
const { isMailConfigured, sendTemporaryPasswordEmail } = require('../services/mail');
const { normalizeEmail, serializeUser } = require('../services/user-auth');
const { sendInternalError } = require('../utils/http-response');
const { createTemporaryPassword, hashPassword, normalizeUsername, verifyPassword } = require('../utils/passwords');
const { normalizePhone } = require('../utils/phones');
const { createResetToken, hashResetToken } = require('../utils/reset-tokens');

const router = express.Router();
const requireModule = authMiddleware.requireModule;
const RESET_LINK_TTL_HOURS = 24;
const MANAGEABLE_ROLES = ['admin'];

function isUniqueViolation(error, indexName) {
  return String(error?.message || '').includes(indexName);
}

function canExposeTemporaryPassword() {
  return process.env.NODE_ENV !== 'production' && process.env.HARDZONE_EXPOSE_TEMP_PASSWORD === 'true';
}

function getFrontendBaseUrl() {
  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://79.137.162.55';
  return String(baseUrl).replace(/\/+$/, '');
}

function canAssignRole(actorRole, nextRole) {
  if (actorRole === 'owner') {
    return MANAGEABLE_ROLES.includes(nextRole);
  }

  return nextRole === 'admin';
}

function canManageUser(actorRole, targetRole) {
  if (actorRole === 'owner') {
    return true;
  }

  return targetRole !== 'owner';
}

function getRequestedModules(body, role) {
  if (!Array.isArray(body?.modules)) {
    return null;
  }

  return buildUserAccessPayload(role, body.modules);
}

function splitTrainerName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Тренер';
  const lastName = parts.slice(1).join(' ') || firstName;

  return { firstName, lastName };
}

async function fetchUserWithTrainer(client, userId) {
  const { rows } = await client.query(
    `
      SELECT
        u.id,
        u.name,
        u.role,
        u.role_title,
        u.username,
        u.email,
        u.phone,
        u.phone_normalized,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        u.module_grants,
        u.module_revokes,
        t.id AS trainer_id,
        t.first_name AS trainer_first_name,
        t.last_name AS trainer_last_name,
        t.is_active AS trainer_is_active
      FROM users u
      LEFT JOIN trainers t ON t.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function resetUserPasswordAndSendEmail(user) {
  if (!user?.id || !user?.email || !user?.is_active) {
    throw new Error('Нельзя отправить новый пароль для этой учетной записи');
  }

  if (!isMailConfigured()) {
    throw new Error('Почтовый сервис пока не настроен');
  }

  const nextPassword = createTemporaryPassword();
  const passwordHash = await hashPassword(nextPassword);

  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE users
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
      `,
      [passwordHash, user.id]
    );

    await sendTemporaryPasswordEmail({
      to: user.email,
      name: user.name,
      password: nextPassword,
    });
  });

  return {
    email: user.email,
  };
}

async function findActiveResetToken(token) {
  const tokenHash = hashResetToken(token);
  const { rows } = await query(
    `
      SELECT
        prt.id,
        prt.user_id,
        prt.expires_at,
        u.id AS user_row_id,
        u.name,
        u.username,
        u.email,
        u.role,
        u.role_title,
        u.is_active
      FROM user_password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  return rows[0] || null;
}

router.post('/login', async (req, res) => {
  try {
    const identifier = normalizeUsername(req.body?.email || req.body?.username);
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(422).json({ success: false, error: 'Укажите email и пароль' });
    }

    const { rows } = await query(
      `
        SELECT id, name, role, role_title, username, email, phone, phone_normalized, password_hash, is_active, last_login_at, module_grants, module_revokes
        FROM users
        WHERE LOWER(username) = $1 OR LOWER(COALESCE(email, '')) = $1
        LIMIT 1
      `,
      [identifier]
    );

    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Неверный email или пароль' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Учётная запись отключена' });
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Неверный email или пароль' });
    }

    const { rows: updatedRows } = await query(
      `
        UPDATE users
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, role, role_title, username, email, phone, phone_normalized, is_active, last_login_at, module_grants, module_revokes
      `,
      [user.id]
    );

    return res.json({
      success: true,
      data: {
        user: serializeUser(updatedRows[0]),
      },
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.login' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(404).json({ success: false, error: 'Пользователь не определён' });
    }

    const { rows } = await query(
      `
        SELECT
          u.id,
          u.name,
          u.role,
          u.role_title,
          u.username,
          u.email,
          u.phone,
          u.phone_normalized,
          u.is_active,
          u.last_login_at,
          u.module_grants,
          u.module_revokes,
          t.id AS trainer_id,
          t.first_name AS trainer_first_name,
          t.last_name AS trainer_last_name,
          t.is_active AS trainer_is_active
        FROM users u
        LEFT JOIN trainers t ON t.user_id = u.id
        WHERE u.id = $1
        LIMIT 1
      `,
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    return res.json({ success: true, data: { user: serializeUser(rows[0]) } });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.me' });
  }
});

router.get('/users', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const { rows } = await query(
      `
        SELECT
          u.id,
          u.name,
          u.role,
          u.role_title,
          u.username,
          u.email,
          u.phone,
          u.phone_normalized,
          u.is_active,
          u.created_at,
          u.updated_at,
          u.last_login_at,
          u.module_grants,
          u.module_revokes,
          t.id AS trainer_id,
          t.first_name AS trainer_first_name,
          t.last_name AS trainer_last_name,
          t.is_active AS trainer_is_active
        FROM users u
        LEFT JOIN trainers t ON t.user_id = u.id
        ORDER BY u.name, u.id
      `
    );

    return res.json({
      success: true,
      data: rows.map(serializeUser),
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.users.list' });
  }
});

router.post('/users', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim() || null;
    const phoneNormalized = normalizePhone(phone);
    const username = normalizeUsername(email);
    const providedPassword = String(req.body?.password || '').trim();
    const generatedPassword = !providedPassword;
    const password = providedPassword || createTemporaryPassword();
    const role = MANAGEABLE_ROLES.includes(req.body?.role) ? req.body.role : 'admin';
    const roleTitle = String(req.body?.role_title || '').trim() || getDefaultRoleTitle(role);
    const isActive = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true;

    if (!name || !email) {
      return res.status(422).json({ success: false, error: 'Укажите имя и email сотрудника' });
    }

    if (!canAssignRole(req.user?.role, role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для назначения этой роли' });
    }

    const accessPayload = getRequestedModules(req.body, role) || buildUserAccessPayload(role, getDefaultModulesForRole(role));
    const createTrainerProfile = Boolean(req.body?.create_trainer_profile);
    const passwordHash = await hashPassword(password);
    const createdUser = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO users (name, role, role_title, username, email, phone, phone_normalized, password_hash, is_active, module_grants, module_revokes, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          RETURNING id
        `,
        [name, role, roleTitle, username, email, phone, phoneNormalized, passwordHash, isActive, accessPayload.module_grants, accessPayload.module_revokes]
      );

      if (createTrainerProfile) {
        const { firstName, lastName } = splitTrainerName(name);
        await client.query(
          `
            INSERT INTO trainers (user_id, first_name, last_name, email, phone)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [rows[0].id, firstName, lastName, email, phone]
        );
      }

      return fetchUserWithTrainer(client, rows[0].id);
    });

    let emailSent = false;
    let emailError = null;

    if (generatedPassword && email) {
      if (isMailConfigured()) {
        try {
          await sendTemporaryPasswordEmail({
            to: email,
            name,
            password,
          });
          emailSent = true;
        } catch (deliveryError) {
          emailError = deliveryError instanceof Error ? deliveryError.message : 'Не удалось отправить письмо сотруднику';
        }
      } else {
        emailError = 'Почтовый сервис пока не настроен';
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        user: serializeUser(createdUser),
        onboarding: {
          email_sent: emailSent,
          email_error: emailError,
          temporary_password: generatedPassword && !emailSent && canExposeTemporaryPassword() ? password : null,
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error, 'idx_users_username_lower') || isUniqueViolation(error, 'users_username_key')) {
      return res.status(409).json({ success: false, error: 'Такой email уже используется' });
    }

    if (isUniqueViolation(error, 'idx_users_email_lower')) {
      return res.status(409).json({ success: false, error: 'Такой email уже используется' });
    }

    return sendInternalError(res, error, { route: 'auth.users.create' });
  }
});

router.patch('/users/:id', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const { rows: existingRows } = await query(
      `
        SELECT id, role, role_title, module_grants, module_revokes
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    const existingUser = existingRows[0];
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    if (!canManageUser(req.user?.role, existingUser.role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для управления этим пользователем' });
    }

    const updates = [];
    const values = [];

    if (req.body?.name !== undefined) {
      values.push(String(req.body.name || '').trim());
      updates.push(`name = $${values.length}`);
    }

    if (req.body?.email !== undefined) {
      const nextEmail = normalizeEmail(req.body.email);
      if (!nextEmail) {
        return res.status(422).json({ success: false, error: 'Укажите email сотрудника' });
      }

      values.push(nextEmail);
      updates.push(`email = $${values.length}`);
      values.push(normalizeUsername(nextEmail));
      updates.push(`username = $${values.length}`);
    } else if (req.body?.username !== undefined) {
      values.push(normalizeUsername(req.body.username));
      updates.push(`username = $${values.length}`);
    }

    if (req.body?.phone !== undefined) {
      const nextPhone = String(req.body.phone || '').trim() || null;
      values.push(nextPhone);
      updates.push(`phone = $${values.length}`);
      values.push(normalizePhone(nextPhone));
      updates.push(`phone_normalized = $${values.length}`);
    }

    let nextRole = existingUser.role;

    if (req.body?.role !== undefined) {
      if (!MANAGEABLE_ROLES.includes(req.body.role)) {
        return res.status(422).json({ success: false, error: 'Некорректная роль' });
      }

      if (!canAssignRole(req.user?.role, req.body.role)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав для назначения этой роли' });
      }

      values.push(req.body.role);
      updates.push(`role = $${values.length}`);
      nextRole = req.body.role;
    }

    if (req.body?.role_title !== undefined) {
      const nextRoleTitle = String(req.body.role_title || '').trim() || getDefaultRoleTitle(nextRole);
      values.push(nextRoleTitle);
      updates.push(`role_title = $${values.length}`);
    }

    const accessPayload = getRequestedModules(req.body, nextRole);
    if (accessPayload) {
      values.push(accessPayload.module_grants);
      updates.push(`module_grants = $${values.length}`);
      values.push(accessPayload.module_revokes);
      updates.push(`module_revokes = $${values.length}`);
    }

    if (req.body?.is_active !== undefined) {
      values.push(Boolean(req.body.is_active));
      updates.push(`is_active = $${values.length}`);
    }

    if (req.body?.password) {
      const passwordHash = await hashPassword(req.body.password);
      values.push(passwordHash);
      updates.push(`password_hash = $${values.length}`);
    }

    if (!updates.length) {
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }

    values.push(req.params.id);
    const { rows } = await query(
      `
        UPDATE users
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING id
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    const userWithTrainer = await fetchUserWithTrainer({ query }, rows[0].id);

    return res.json({ success: true, data: { user: serializeUser(userWithTrainer) } });
  } catch (error) {
    if (isUniqueViolation(error, 'idx_users_username_lower') || isUniqueViolation(error, 'users_username_key')) {
      return res.status(409).json({ success: false, error: 'Такой email уже используется' });
    }

    if (isUniqueViolation(error, 'idx_users_email_lower')) {
      return res.status(409).json({ success: false, error: 'Такой email уже используется' });
    }

    return sendInternalError(res, error, { route: 'auth.users.update' });
  }
});

router.delete('/users/:id', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(422).json({ success: false, error: 'Некорректный id сотрудника' });
    }

    if (req.user?.id === userId) {
      return res.status(409).json({ success: false, error: 'Нельзя удалить собственную учётную запись' });
    }

    const { rows: userRows } = await query(
      `
        SELECT id, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    if (!canManageUser(req.user?.role, user.role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для управления этим пользователем' });
    }

    if (user.role === 'owner') {
      const { rows: ownerRows } = await query(
        `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE role = 'owner'
        `
      );

      if ((ownerRows[0]?.count || 0) <= 1) {
        return res.status(409).json({ success: false, error: 'Нельзя удалить последнего главного администратора' });
      }
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);
    return res.status(204).end();
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.users.delete' });
  }
});

router.post('/password-reset/request', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(422).json({ success: false, error: 'Укажите email сотрудника' });
    }

    const { rows } = await query(
      `
        SELECT id, name, email, password_hash, is_active
        FROM users
        WHERE LOWER(COALESCE(email, '')) = $1
        LIMIT 1
      `,
      [email]
    );

    const user = rows[0];
    if (!user || !user.is_active || !user.email) {
      return res.json({ success: true });
    }

    await resetUserPasswordAndSendEmail(user);

    return res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.password_reset.request' });
  }
});

router.post('/users/:id/send-password', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const { rows: userRows } = await query(
      `
        SELECT id, name, username, email, is_active, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    if (!canManageUser(req.user?.role, user.role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для управления этим пользователем' });
    }

    if (!user.email) {
      return res.status(422).json({ success: false, error: 'У сотрудника не указан email' });
    }

    if (!user.is_active) {
      return res.status(409).json({ success: false, error: 'Нельзя отправить новый пароль отключенному сотруднику' });
    }

    const result = await resetUserPasswordAndSendEmail(user);

    return res.json({
      success: true,
      data: {
        email: result.email,
      },
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.users.send_password' });
  }
});

router.post('/users/:id/reset-link', authMiddleware, requireModule('users_manage'), async (req, res) => {
  try {
    const { rows: userRows } = await query(
      `
        SELECT id, name, username, email, is_active, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    if (!canManageUser(req.user?.role, user.role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав для управления этим пользователем' });
    }

    const rawToken = createResetToken();
    const tokenHash = hashResetToken(rawToken);

    const data = await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE user_password_reset_tokens
          SET used_at = NOW()
          WHERE user_id = $1 AND used_at IS NULL
        `,
        [user.id]
      );

      const { rows } = await client.query(
        `
          INSERT INTO user_password_reset_tokens (user_id, token_hash, expires_at, created_by)
          VALUES ($1, $2, NOW() + ($3 || ' hours')::interval, $4)
          RETURNING expires_at
        `,
        [user.id, tokenHash, RESET_LINK_TTL_HOURS, req.user?.id || null]
      );

      return rows[0];
    });

    return res.json({
      success: true,
      data: {
        email: user.email || null,
        expires_at: data.expires_at,
        reset_url: `${getFrontendBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`,
      },
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.users.reset_link' });
  }
});

router.get('/password-reset/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(422).json({ success: false, error: 'Токен не указан' });
    }

    const resetToken = await findActiveResetToken(token);
    if (!resetToken) {
      return res.status(404).json({ success: false, error: 'Ссылка восстановления недействительна или истекла' });
    }

    if (!resetToken.is_active) {
      return res.status(403).json({ success: false, error: 'Учётная запись отключена' });
    }

    return res.json({
      success: true,
      data: {
        user: {
          id: Number(resetToken.user_id),
          name: resetToken.name,
          username: resetToken.username,
          email: resetToken.email || null,
        },
        expires_at: resetToken.expires_at,
      },
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.password_reset.get' });
  }
});

router.post('/password-reset/complete', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(422).json({ success: false, error: 'Укажите токен и новый пароль' });
    }

    const resetToken = await findActiveResetToken(token);
    if (!resetToken) {
      return res.status(404).json({ success: false, error: 'Ссылка восстановления недействительна или истекла' });
    }

    if (!resetToken.is_active) {
      return res.status(403).json({ success: false, error: 'Учётная запись отключена' });
    }

    const passwordHash = await hashPassword(password);

    await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE users
          SET password_hash = $1, updated_at = NOW()
          WHERE id = $2
        `,
        [passwordHash, resetToken.user_id]
      );

      await client.query(
        `
          UPDATE user_password_reset_tokens
          SET used_at = NOW()
          WHERE id = $1
        `,
        [resetToken.id]
      );
    });

    return res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, error, { route: 'auth.password_reset.complete' });
  }
});

module.exports = router;
