const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';

async function expireActiveSubscriptions(executor, options = {}) {
  const conditions = [
    "status = 'active'",
    `(
      (expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE $1)::date)
      OR (type IN ('single', 'visits') AND visits_left IS NOT NULL AND visits_left <= 0)
    )`,
  ];
  const params = [CLUB_TIME_ZONE];

  if (options.clientId) {
    params.push(options.clientId);
    conditions.push(`client_id = $${params.length}`);
  }

  if (options.subscriptionId) {
    params.push(options.subscriptionId);
    conditions.push(`id = $${params.length}`);
  }

  const { rowCount } = await executor.query(
    `
      UPDATE client_subscriptions
      SET status = CASE
            WHEN expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE $1)::date
              THEN 'expired'::subscription_status
            ELSE 'exhausted'::subscription_status
          END,
          updated_at = NOW()
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return rowCount || 0;
}

async function restoreSubscriptionToActiveIfValid(executor, subscriptionId) {
  const { rows } = await executor.query(
    `
      UPDATE client_subscriptions
      SET status = CASE
            WHEN expires_at IS NOT NULL AND expires_at < (NOW() AT TIME ZONE $1)::date
              THEN 'expired'::subscription_status
            WHEN type IN ('single', 'visits') AND visits_left IS NOT NULL AND visits_left <= 0
              THEN 'exhausted'::subscription_status
            ELSE 'active'::subscription_status
          END,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
    [CLUB_TIME_ZONE, subscriptionId]
  );

  return rows[0] || null;
}

module.exports = {
  CLUB_TIME_ZONE,
  expireActiveSubscriptions,
  restoreSubscriptionToActiveIfValid,
};
