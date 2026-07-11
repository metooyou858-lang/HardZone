const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';

function getTimeZoneParts(date, timeZone = CLUB_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function clubDateTimeToDate(dateValue, timeValue, timeZone = CLUB_TIME_ZONE) {
  const dateText = String(dateValue || '').slice(0, 10);
  const timeText = String(timeValue || '').slice(0, 8);
  const match = `${dateText}T${timeText}`.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    return new Date(Number.NaN);
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  const desiredUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const guess = new Date(desiredUtcMs);
  const zoned = getTimeZoneParts(guess, timeZone);
  const representedUtcMs = Date.UTC(
    Number(zoned.year),
    Number(zoned.month) - 1,
    Number(zoned.day),
    Number(zoned.hour),
    Number(zoned.minute),
    Number(zoned.second)
  );
  const offsetMs = representedUtcMs - desiredUtcMs;

  return new Date(desiredUtcMs - offsetMs);
}

module.exports = { CLUB_TIME_ZONE, clubDateTimeToDate };
