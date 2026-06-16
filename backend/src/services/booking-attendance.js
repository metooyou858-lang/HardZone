const {
  assertSubscriptionAccess,
  chargeSubscriptionVisit,
  getSlotAccessContext,
  refundSubscriptionVisit,
} = require('./subscription-access');

function createHttpError(statusCode, message, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
}

function combineSlotDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}`);
}

function mapCoverageReason(error) {
  if (!error) return 'no_subscription';

  switch (error.code) {
    case 'subscription_inactive':
      return 'expired';
    case 'subscription_exhausted':
      return 'exhausted';
    case 'subscription_access_denied':
      return 'wrong_format';
    case 'subscription_training_type_denied':
      return 'wrong_training_type';
    case 'subscription_not_found':
      return 'no_subscription';
    default:
      return 'manual_without_subscription';
  }
}

async function loadActiveSlot(executor, slotId) {
  const { rows } = await executor.query(
    'SELECT * FROM schedule_slots WHERE id = $1 AND status = $2',
    [slotId, 'active']
  );
  const slot = rows[0];
  if (!slot) {
    throw createHttpError(404, 'Занятие не найдено или отменено', 'slot_not_found');
  }
  return slot;
}

async function createTrainingBooking(executor, {
  slotId,
  clientId,
  subscriptionId = null,
  bookedBy = 'admin',
  coveredByBookingId = null,
  allowUnpaid = false,
  unpaidReason = 'no_subscription',
}) {
  if (!slotId || !clientId) {
    throw createHttpError(422, 'Укажите занятие и клиента', 'validation_failed');
  }

  const slot = await loadActiveSlot(executor, slotId);

  if (slot.block_if_empty_hours && Number(slot.booked_count || 0) === 0) {
    const slotDateTime = combineSlotDateTime(slot.date, slot.start_time);
    const hoursUntil = (slotDateTime.getTime() - Date.now()) / 3600000;
    if (hoursUntil <= slot.block_if_empty_hours) {
      throw createHttpError(
        409,
        'Запись закрыта — никто не записался заблаговременно',
        'booking_closed'
      );
    }
  }

  if (!coveredByBookingId && !subscriptionId && !allowUnpaid) {
    throw createHttpError(
      422,
      'Выберите подходящий абонемент или запишите клиента как неоплаченное посещение',
      'subscription_required'
    );
  }

  let placesCount = 1;
  let coverageStatus = subscriptionId ? 'pending' : 'unpaid';
  let coverageReason = subscriptionId ? 'subscription_planned' : unpaidReason;

  if (coveredByBookingId) {
    coverageStatus = 'not_required';
    coverageReason = 'covered_by_partner';
  } else if (subscriptionId) {
    const subscription = await assertSubscriptionAccess(executor, {
      subscriptionId,
      clientId,
      context: await getSlotAccessContext(executor, slotId),
    });

    if (subscription.is_family) {
      placesCount = 2;
    }
  }

  if (!coveredByBookingId && Number(slot.booked_count || 0) + placesCount > Number(slot.capacity || 0)) {
    throw createHttpError(409, 'Нет свободных мест', 'no_places');
  }

  const { rows: existingRows } = await executor.query(
    "SELECT id FROM bookings WHERE slot_id = $1 AND client_id = $2 AND status IN ('confirmed', 'attended')",
    [slotId, clientId]
  );

  if (existingRows.length > 0) {
    throw createHttpError(409, 'Клиент уже записан', 'already_booked');
  }

  const { rows } = await executor.query(
    `
      INSERT INTO bookings
        (slot_id, client_id, subscription_id, places_count, booked_by, covered_by_booking_id,
         coverage_status, coverage_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7::coverage_status, $8)
      RETURNING *
    `,
    [
      slotId,
      clientId,
      subscriptionId || null,
      placesCount,
      bookedBy,
      coveredByBookingId || null,
      coverageStatus,
      coverageReason,
    ]
  );

  await executor.query(
    'UPDATE schedule_slots SET booked_count = booked_count + $1, updated_at = NOW() WHERE id = $2',
    [placesCount, slotId]
  );

  return rows[0];
}

async function findEligibleSubscriptionForBooking(executor, booking, context) {
  const { rows: candidateRows } = await executor.query(
    `
      SELECT id
      FROM client_subscriptions
      WHERE client_id = $1
        AND status = 'active'
        AND (
          type IN ('period', 'unlimited')
          OR COALESCE(visits_left, 0) > 0
        )
      ORDER BY expires_at NULLS LAST, created_at DESC
    `,
    [booking.client_id]
  );

  for (const candidate of candidateRows) {
    try {
      return await assertSubscriptionAccess(executor, {
        subscriptionId: candidate.id,
        clientId: booking.client_id,
        context,
      });
    } catch (error) {
      if (![404, 409].includes(error.statusCode)) {
        throw error;
      }
    }
  }

  return null;
}

async function ensureBookingCapacityForSubscription(executor, booking, subscription) {
  const placesCount = subscription.is_family ? 2 : 1;
  const placeDelta = placesCount - Number(booking.places_count || 1);

  if (placeDelta > 0) {
    const { rows: slotRows } = await executor.query(
      'SELECT booked_count, capacity FROM schedule_slots WHERE id = $1 FOR UPDATE',
      [booking.slot_id]
    );
    const slot = slotRows[0];
    if (!slot || Number(slot.booked_count || 0) + placeDelta > Number(slot.capacity || 0)) {
      throw createHttpError(409, 'Нет свободных мест для семейного абонемента', 'no_places');
    }
  }

  if (placeDelta !== 0) {
    await executor.query(
      'UPDATE schedule_slots SET booked_count = GREATEST(booked_count + $1, 0), updated_at = NOW() WHERE id = $2',
      [placeDelta, booking.slot_id]
    );
  }

  return placesCount;
}

async function markTrainingBookingArrived(executor, {
  bookingId,
  attendanceMode = 'auto',
  coverageNote = null,
  createdBy = null,
}) {
  const { rows: bookingRows } = await executor.query(
    'SELECT * FROM bookings WHERE id = $1 AND status = $2 FOR UPDATE',
    [bookingId, 'confirmed']
  );
  const booking = bookingRows[0];

  if (!booking) {
    throw createHttpError(404, 'Запись не найдена', 'booking_not_found');
  }

  const isCoveredPartner = !!booking.covered_by_booking_id;
  let effectiveSubscriptionId = null;
  let resolvedSubscriptionId = booking.subscription_id || null;
  let resolvedPlacesCount = Number(booking.places_count || 1);
  let coverageStatus = 'unpaid';
  let coverageReason = 'no_subscription';

  if (isCoveredPartner) {
    coverageStatus = 'not_required';
    coverageReason = 'covered_by_partner';
  } else if (attendanceMode === 'comped') {
    coverageStatus = 'comped';
    coverageReason = 'manual_override';
  } else if (attendanceMode === 'unpaid') {
    coverageStatus = 'unpaid';
    coverageReason = booking.subscription_id ? 'manual_without_charge' : 'no_subscription';
  } else if (attendanceMode === 'auto') {
    try {
      const context = await getSlotAccessContext(executor, booking.slot_id);
      let subscriptionId = booking.subscription_id;

      if (!subscriptionId) {
        const matchedSubscription = await findEligibleSubscriptionForBooking(executor, booking, context);
        if (matchedSubscription) {
          await ensureBookingCapacityForSubscription(executor, booking, matchedSubscription);
          subscriptionId = matchedSubscription.id;
          resolvedSubscriptionId = matchedSubscription.id;
          resolvedPlacesCount = matchedSubscription.is_family ? 2 : 1;
        }
      }

      if (!subscriptionId) {
        throw createHttpError(404, 'Абонемент не найден', 'subscription_not_found');
      }

      const chargedSubscription = await chargeSubscriptionVisit(executor, {
        subscriptionId,
        clientId: booking.client_id,
        context,
      });
      effectiveSubscriptionId = chargedSubscription.id;
      resolvedSubscriptionId = chargedSubscription.id;
      coverageStatus = 'covered';
      coverageReason = 'subscription_charged';
    } catch (error) {
      if (![404, 409].includes(error.statusCode)) {
        throw error;
      }
      coverageStatus = 'unpaid';
      coverageReason = mapCoverageReason(error);
    }
  }

  const { rows: updatedRows } = await executor.query(
    `
      UPDATE bookings
      SET status = 'attended',
          subscription_id = $1,
          places_count = $2,
          coverage_status = $3::coverage_status,
          coverage_reason = $4,
          coverage_note = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `,
    [resolvedSubscriptionId, resolvedPlacesCount, coverageStatus, coverageReason, coverageNote, booking.id]
  );

  await executor.query(
    `
      INSERT INTO client_visits
        (client_id, subscription_id, visit_type, slot_id, booking_id, created_by,
         coverage_status, coverage_reason, coverage_note)
      VALUES ($1, $2, 'group', $3, $4, $5, $6::coverage_status, $7, $8)
    `,
    [
      booking.client_id,
      effectiveSubscriptionId,
      booking.slot_id,
      booking.id,
      createdBy,
      coverageStatus,
      coverageReason,
      coverageNote,
    ]
  );

  return updatedRows[0];
}

async function attachEligibleSubscriptionToBooking(executor, bookingId) {
  const { rows: bookingRows } = await executor.query(
    `
      SELECT *
      FROM bookings
      WHERE id = $1
        AND status IN ('confirmed', 'attended')
      FOR UPDATE
    `,
    [bookingId]
  );
  const booking = bookingRows[0];

  if (!booking) {
    throw createHttpError(404, 'Запись не найдена', 'booking_not_found');
  }

  if (booking.subscription_id && booking.coverage_status !== 'unpaid') {
    return { attached: true, booking, subscription: null };
  }

  const context = await getSlotAccessContext(executor, booking.slot_id);

  const matchedSubscription = await findEligibleSubscriptionForBooking(executor, booking, context);

  if (!matchedSubscription) {
    return { attached: false, booking, subscription: null };
  }

  const placesCount = await ensureBookingCapacityForSubscription(executor, booking, matchedSubscription);

  if (booking.status === 'attended') {
    const chargedSubscription = await chargeSubscriptionVisit(executor, {
      subscriptionId: matchedSubscription.id,
      clientId: booking.client_id,
      context,
    });

    const { rows: updatedRows } = await executor.query(
      `
        UPDATE bookings
        SET subscription_id = $1,
            places_count = $2,
            coverage_status = 'covered'::coverage_status,
            coverage_reason = 'subscription_charged',
            coverage_note = NULL,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `,
      [chargedSubscription.id, placesCount, booking.id]
    );

    const { rowCount } = await executor.query(
      `
        UPDATE client_visits
        SET subscription_id = $1,
            coverage_status = 'covered'::coverage_status,
            coverage_reason = 'subscription_charged',
            coverage_note = NULL
        WHERE id = (
          SELECT id
          FROM client_visits
          WHERE booking_id = $2
          ORDER BY visited_at DESC
          LIMIT 1
        )
      `,
      [chargedSubscription.id, booking.id]
    );

    if (rowCount === 0) {
      await executor.query(
        `
          INSERT INTO client_visits
            (client_id, subscription_id, visit_type, slot_id, booking_id,
             coverage_status, coverage_reason)
          VALUES ($1, $2, 'group', $3, $4, 'covered'::coverage_status, 'subscription_charged')
        `,
        [booking.client_id, chargedSubscription.id, booking.slot_id, booking.id]
      );
    }

    return { attached: true, booking: updatedRows[0], subscription: chargedSubscription };
  }

  const { rows: updatedRows } = await executor.query(
    `
      UPDATE bookings
      SET subscription_id = $1,
          places_count = $2,
          coverage_status = 'pending'::coverage_status,
          coverage_reason = 'subscription_planned',
          coverage_note = NULL,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
    [matchedSubscription.id, placesCount, booking.id]
  );

  return { attached: true, booking: updatedRows[0], subscription: matchedSubscription };
}

async function unmarkTrainingBookingArrived(executor, bookingId) {
  const { rows: bookingRows } = await executor.query(
    'SELECT * FROM bookings WHERE id = $1 AND status = $2 FOR UPDATE',
    [bookingId, 'attended']
  );
  const booking = bookingRows[0];

  if (!booking) {
    throw createHttpError(404, 'Запись не найдена или посещение не отмечено', 'booking_not_attended');
  }

  const { rows: visitRows } = await executor.query(
    `DELETE FROM client_visits
     WHERE id = (
       SELECT id FROM client_visits
       WHERE booking_id = $1
          OR (booking_id IS NULL AND client_id = $2 AND slot_id = $3 AND visit_type = 'group')
       ORDER BY visited_at DESC
       LIMIT 1
     )
     RETURNING subscription_id, coverage_status`,
    [booking.id, booking.client_id, booking.slot_id]
  );

  const visit = visitRows[0];
  if (visit?.subscription_id && visit.coverage_status === 'covered') {
    await refundSubscriptionVisit(executor, visit.subscription_id);
  }

  const nextCoverageStatus = booking.subscription_id ? 'pending' : 'unpaid';
  const nextCoverageReason = booking.subscription_id ? 'subscription_planned' : 'no_subscription';

  const { rows: updatedRows } = await executor.query(
    `
      UPDATE bookings
      SET status = 'confirmed',
          coverage_status = $1::coverage_status,
          coverage_reason = $2,
          coverage_note = NULL,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
    [nextCoverageStatus, nextCoverageReason, booking.id]
  );

  return updatedRows[0];
}

async function markOpenGymVisit(executor, {
  clientId,
  subscriptionId = null,
  attendanceMode = 'auto',
  coverageNote = null,
  createdBy = null,
}) {
  let effectiveSubscriptionId = null;
  let coverageStatus = 'unpaid';
  let coverageReason = 'no_subscription';

  if (attendanceMode === 'comped') {
    coverageStatus = 'comped';
    coverageReason = 'manual_override';
  } else if (attendanceMode === 'unpaid') {
    coverageStatus = 'unpaid';
    coverageReason = subscriptionId ? 'manual_without_charge' : 'no_subscription';
  } else if (subscriptionId) {
    try {
      const chargedSubscription = await chargeSubscriptionVisit(executor, {
        subscriptionId,
        clientId,
        context: { kind: 'free_visit' },
      });
      effectiveSubscriptionId = chargedSubscription.id;
      coverageStatus = 'covered';
      coverageReason = 'subscription_charged';
    } catch (error) {
      if (![404, 409].includes(error.statusCode)) {
        throw error;
      }
      coverageStatus = 'unpaid';
      coverageReason = mapCoverageReason(error);
    }
  }

  const { rows } = await executor.query(
    `
      INSERT INTO client_visits
        (client_id, subscription_id, visit_type, created_by,
         coverage_status, coverage_reason, coverage_note)
      VALUES ($1, $2, 'open_gym', $3, $4::coverage_status, $5, $6)
      RETURNING *
    `,
    [
      clientId,
      effectiveSubscriptionId,
      createdBy,
      coverageStatus,
      coverageReason,
      coverageNote,
    ]
  );

  return rows[0];
}

module.exports = {
  createHttpError,
  attachEligibleSubscriptionToBooking,
  createTrainingBooking,
  markOpenGymVisit,
  markTrainingBookingArrived,
  unmarkTrainingBookingArrived,
};
