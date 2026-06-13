/**
 * Parse a human "Month YYYY" string (e.g. "December 2025") into a real Date
 * pointing at the first day of that month (UTC, so the month never shifts due
 * to timezone). Returns null when the value can't be parsed, so callers can
 * decide how to treat unsortable records.
 *
 * This is the single source of truth for the date-parsing logic that used to
 * be duplicated inline in the articles and reports routes.
 */

const MONTHS = Object.freeze({
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
});

const parseMonthYearToDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const parts = dateStr.trim().toLowerCase().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const month = MONTHS[parts[0]];
  const year = parseInt(parts[1], 10);

  if (month === undefined || Number.isNaN(year) || year < 1900 || year > 2100) {
    return null;
  }

  return new Date(Date.UTC(year, month, 1));
};

module.exports = { parseMonthYearToDate };
