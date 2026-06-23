async function markMissedBookings() {
  try {
    // CRM attendance is filled manually. Do not infer no-shows from elapsed time:
    // admins may complete the class roster after the workout has already ended.
    await Promise.resolve();
  } catch (err) {
    console.error('[schedule-cleanup] Error:', err.message);
  }
}

module.exports = { markMissedBookings };
