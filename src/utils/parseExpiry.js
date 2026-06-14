const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseExpiryDate(dateString, now = new Date()) {
  if (typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }

  const fullDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const monthYearMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (!fullDateMatch && !monthYearMatch) {
    return null;
  }

  const day = fullDateMatch ? Number(fullDateMatch[1]) : 1;
  const month = Number(
    fullDateMatch ? fullDateMatch[2] : monthYearMatch[1]
  );
  const year = Number(
    fullDateMatch ? fullDateMatch[3] : monthYearMatch[2]
  );

  if (year < 2024 || year > 2040 || month < 1 || month > 12) {
    return null;
  }

  const expiryMs = Date.UTC(year, month - 1, day);
  const expiryDate = new Date(expiryMs);

  if (
    day < 1 ||
    expiryDate.getUTCFullYear() !== year ||
    expiryDate.getUTCMonth() !== month - 1 ||
    expiryDate.getUTCDate() !== day
  ) {
    return null;
  }

  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const daysUntilExpiry = Math.round((expiryMs - todayMs) / DAY_IN_MS);
  const raw = `${String(day).padStart(2, '0')}/${String(month).padStart(
    2,
    '0'
  )}/${year}`;

  return {
    raw,
    iso: expiryDate.toISOString(),
    display: `${day} ${MONTH_NAMES[month - 1]} ${year}`,
    isExpired: daysUntilExpiry < 0,
    daysUntilExpiry,
  };
}

module.exports = { parseExpiryDate };
