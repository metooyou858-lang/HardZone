const {
  CLUB_TIME_ZONE,
  expireActiveSubscriptions,
  restoreSubscriptionToActiveIfValid,
} = require('./subscription-validity');

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clubDateSqlParamIndex(params) {
  params.push(CLUB_TIME_ZONE);
  return `$${params.length}`;
}

async function getSlotAccessContext(executor, slotId) {
  const { rows } = await executor.query(
    `
      SELECT id, slot_type, training_type_id
      FROM schedule_slots
      WHERE id = $1
    `,
    [slotId]
  );

  const slot = rows[0];
  if (!slot) {
    throw createHttpError(404, 'Занятие не найдено');
  }

  return {
    kind: 'slot',
    slotId: slot.id,
    slotType: slot.slot_type,
    trainingTypeId: slot.training_type_id,
  };
}

function getContextAccessColumn(context) {
  if (context.kind === 'free_visit') {
    return 'allow_free_visit';
  }

  if (context.kind === 'slot' && context.slotType === 'group') {
    return 'allow_group_training';
  }

  if (context.kind === 'slot' && context.slotType === 'personal') {
    return 'allow_personal_training';
  }

  return null;
}

function getAccessDeniedMessage(context) {
  if (context.kind === 'free_visit') {
    return 'Абонемент не действует на свободное посещение';
  }

  if (context.slotType === 'group') {
    return 'Абонемент не действует на групповые тренировки';
  }

  if (context.slotType === 'personal') {
    return 'Абонемент не действует на персональные тренировки';
  }

  return 'Абонемент не действует на этот формат посещения';
}

async function activateOnFirstVisitIfNeeded(executor, subscription) {
  if (subscription.started_at || subscription.activation_type !== 'first_visit') {
    return subscription;
  }

  const params = [subscription.id];
  const timezoneParam = clubDateSqlParamIndex(params);

  const { rows } = await executor.query(
    `
      UPDATE client_subscriptions cs
      SET started_at = (NOW() AT TIME ZONE ${timezoneParam})::date,
          expires_at = CASE
            WHEN psp.validity_days IS NULL THEN NULL
            ELSE (NOW() AT TIME ZONE ${timezoneParam})::date + psp.validity_days::INT
          END,
          updated_at = NOW()
      FROM product_subscription_params psp
      WHERE cs.id = $1
        AND psp.product_id = cs.product_id
      RETURNING cs.*
    `,
    params
  );

  return rows[0] ? { ...subscription, ...rows[0] } : subscription;
}

async function loadSubscriptionForAccess(executor, subscriptionId, clientId = null) {
  await expireActiveSubscriptions(executor, { subscriptionId });

  const params = [subscriptionId];
  let clientFilter = '';
  if (clientId) {
    params.push(clientId);
    clientFilter = `AND cs.client_id = $${params.length}`;
  }

  const { rows } = await executor.query(
    `
      SELECT
        cs.*,
        psp.activation_type,
        psp.allow_free_visit,
        psp.allow_group_training,
        psp.allow_personal_training,
        psp.validity_days AS product_validity_days,
        EXISTS (
          SELECT 1
          FROM product_training_types ptt
          WHERE ptt.product_id = cs.product_id
        ) AS has_training_type_limits
      FROM client_subscriptions cs
      LEFT JOIN product_subscription_params psp ON psp.product_id = cs.product_id
      WHERE cs.id = $1
        ${clientFilter}
      FOR UPDATE OF cs
    `,
    params
  );

  return rows[0] || null;
}

async function assertSubscriptionAccess(executor, {
  subscriptionId,
  clientId = null,
  context,
}) {
  let subscription = await loadSubscriptionForAccess(executor, subscriptionId, clientId);

  if (!subscription) {
    throw createHttpError(404, 'Абонемент не найден');
  }

  subscription = await activateOnFirstVisitIfNeeded(executor, subscription);

  if (subscription.status !== 'active') {
    throw createHttpError(409, 'Абонемент истёк или неактивен');
  }

  if (['single', 'visits'].includes(subscription.type) && (subscription.visits_left || 0) <= 0) {
    throw createHttpError(409, 'Посещения по абонементу исчерпаны');
  }

  if (!subscription.product_id || subscription.allow_free_visit === null) {
    return subscription;
  }

  const accessColumn = getContextAccessColumn(context);
  if (!accessColumn || subscription[accessColumn] !== true) {
    throw createHttpError(409, getAccessDeniedMessage(context));
  }

  if (context.kind === 'slot' && subscription.has_training_type_limits && context.trainingTypeId) {
    const { rows } = await executor.query(
      `
        SELECT 1
        FROM product_training_types
        WHERE product_id = $1
          AND training_type_id = $2
        LIMIT 1
      `,
      [subscription.product_id, context.trainingTypeId]
    );

    if (!rows[0]) {
      throw createHttpError(409, 'Абонемент не действует на этот вид тренировки');
    }
  }

  return subscription;
}

async function chargeSubscriptionVisit(executor, {
  subscriptionId,
  clientId = null,
  context,
}) {
  const subscription = await assertSubscriptionAccess(executor, {
    subscriptionId,
    clientId,
    context,
  });

  if (['single', 'visits'].includes(subscription.type)) {
    const { rows } = await executor.query(
      `
        UPDATE client_subscriptions
        SET visits_left = GREATEST(COALESCE(visits_left, 0) - 1, 0),
            status = CASE
              WHEN GREATEST(COALESCE(visits_left, 0) - 1, 0) = 0 THEN 'exhausted'::subscription_status
              ELSE status
            END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [subscription.id]
    );

    return rows[0] || subscription;
  }

  return subscription;
}

async function refundSubscriptionVisit(executor, subscriptionId) {
  const { rows: subRows } = await executor.query(
    'SELECT * FROM client_subscriptions WHERE id = $1 FOR UPDATE',
    [subscriptionId]
  );
  const subscription = subRows[0];

  if (!subscription || !['single', 'visits'].includes(subscription.type)) {
    return subscription || null;
  }

  await executor.query(
    'UPDATE client_subscriptions SET visits_left = COALESCE(visits_left, 0) + 1, updated_at = NOW() WHERE id = $1',
    [subscriptionId]
  );

  if (subscription.status === 'exhausted') {
    return restoreSubscriptionToActiveIfValid(executor, subscriptionId);
  }

  return subscription;
}

module.exports = {
  assertSubscriptionAccess,
  chargeSubscriptionVisit,
  getSlotAccessContext,
  refundSubscriptionVisit,
};
