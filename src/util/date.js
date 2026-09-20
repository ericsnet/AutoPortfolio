/**
 * Date parsing and formatting.
 *
 * Portfolio dates are intentionally fuzzy: people write `2021`, `2021-04`,
 * `April 2021`, `2021-04-12` or `present`. The parser accepts all of those and
 * records the *precision* so the renderer can print `2021` instead of
 * `January 2021`.
 *
 * @module util/date
 */

/** @typedef {'year'|'month'|'day'} DatePrecision */

/**
 * @typedef {object} ParsedDate
 * @property {Date} date          Resolved date (month precision defaults to day 1).
 * @property {DatePrecision} precision
 * @property {string} raw         Original input.
 * @property {boolean} present    True for `present`, `now`, `current`, ...
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const PRESENT_WORDS = new Set(['present', 'now', 'current', 'today', 'ongoing', 'date.now']);

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isPresentWord(value) {
  return PRESENT_WORDS.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Parse a portfolio date string. Returns `null` when the value is not a date.
 *
 * @param {unknown} value
 * @returns {ParsedDate|null}
 */
export function parseDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { date: value, precision: 'day', raw: value.toISOString().slice(0, 10), present: false };
  }
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(value, 0, 1));
    if (Number.isNaN(date.getTime())) return null;
    return { date, precision: 'year', raw: String(value), present: false };
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;
  if (isPresentWord(raw)) {
    const now = new Date();
    return { date: now, precision: 'month', raw, present: true };
  }

  // 2021 / 2021-04 / 2021-04-12 / 2021/04
  const numeric = raw.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/);
  if (numeric) {
    const year = Number(numeric[1]);
    const month = numeric[2] ? Number(numeric[2]) : 1;
    const day = numeric[3] ? Number(numeric[3]) : 1;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    const precision = numeric[3] ? 'day' : numeric[2] ? 'month' : 'year';
    return { date, precision, raw, present: false };
  }

  // `April 2021`, `Apr 2021`, `April, 2021`
  const monthYear = raw.match(/^([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (monthYear) {
    const index = MONTHS.indexOf(monthYear[1].toLowerCase());
    if (index !== -1) {
      return { date: new Date(Date.UTC(Number(monthYear[2]), index, 1)), precision: 'month', raw, present: false };
    }
  }

  // `12 April 2021`, `12 Apr 2021`
  const dayMonthYear = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (dayMonthYear) {
    const index = MONTHS.indexOf(dayMonthYear[2].toLowerCase());
    if (index !== -1) {
      return {
        date: new Date(Date.UTC(Number(dayMonthYear[3]), index, Number(dayMonthYear[1]))),
        precision: 'day',
        raw,
        present: false,
      };
    }
  }

  // Anything else that `Date` understands (`2021-04-12T10:00:00Z`).
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return { date: parsed, precision: 'day', raw, present: false };
  }
  return null;
}

/**
 * Format a date for display. Accepts either a parsed date
 * (`parseDate`'s result) or the raw string, so callers cannot accidentally
 * print today's date by passing a string where an object was expected.
 *
 * @param {ParsedDate|string|null} value
 * @param {object} [options]
 * @param {'year'|'month'|'day'|'auto'} [options.precision]
 * @param {string} [options.locale]
 * @returns {string}
 */
export function formatDate(value, options = {}) {
  if (!value) return '';
  const parsed = typeof value === 'string' ? parseDate(value) : value;
  if (!parsed) return '';
  return formatParsedDate(parsed, options);
}

/**
 * @param {ParsedDate} value
 * @param {object} [options]
 * @param {'year'|'month'|'day'|'auto'} [options.precision]
 * @param {string} [options.locale]
 * @returns {string}
 */
function formatParsedDate(value, options = {}) {
  const precision = options.precision === 'auto' || !options.precision ? value.precision : options.precision;
  if (precision === 'year') return String(value.date.getUTCFullYear());
  if (precision === 'month') {
    return new Intl.DateTimeFormat(options.locale ?? 'en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value.date);
  }
  return new Intl.DateTimeFormat(options.locale ?? 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value.date);
}

/**
 * Format a date for a `<time datetime="">` attribute.
 * Accepts a parsed date or a raw string.
 *
 * @param {ParsedDate|string|null} value
 * @returns {string}
 */
export function toDateTimeAttribute(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const parsed = parseDate(value);
    if (!parsed) return '';
    value = parsed;
  }
  if (value.precision === 'year') return String(value.date.getUTCFullYear());
  if (value.precision === 'month') {
    return `${value.date.getUTCFullYear()}-${String(value.date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return value.date.toISOString().slice(0, 10);
}

/**
 * Human readable range, e.g. `April 2021 — Present`.
 *
 * @param {string|undefined|null} start
 * @param {string|undefined|null} end
 * @param {object} [options]
 * @param {string} [options.separator]
 * @param {string} [options.presentLabel]
 * @param {string} [options.locale]
 * @returns {{label: string, start: ParsedDate|null, end: ParsedDate|null, startLabel: string, endLabel: string, current: boolean}}
 */
export function formatRange(start, end, options = {}) {
  const separator = options.separator ?? '—';
  const presentLabel = options.presentLabel ?? 'Present';
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const current = !endDate || endDate.present;
  const startLabel = formatDate(startDate, { locale: options.locale });
  const endLabel = current ? presentLabel : formatDate(endDate, { locale: options.locale });

  let label = '';
  if (startLabel && endLabel) label = `${startLabel} ${separator} ${endLabel}`;
  else label = startLabel || endLabel || '';

  return { label, start: startDate, end: current ? null : endDate, startLabel, endLabel, current };
}

/**
 * Approximate duration between two dates, expressed as `2 yr 3 mo`.
 *
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @param {object} [options]
 * @returns {{label: string, months: number, years: number}}
 */
export function formatDuration(start, end, options = {}) {
  const startDate = parseDate(start);
  if (!startDate) return { label: '', months: 0, years: 0 };
  const endDate = parseDate(end);
  const endTime = !endDate || endDate.present ? Date.now() : endDate.date.getTime();
  const months = Math.max(
    0,
    (new Date(endTime).getUTCFullYear() - startDate.date.getUTCFullYear()) * 12 +
      (new Date(endTime).getUTCMonth() - startDate.date.getUTCMonth()),
  );
  const years = Math.floor(months / 12);
  const rest = months % 12;
  /** @type {string[]} */
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest > 0 || years === 0) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mo'}`);
  return { label: parts.join(' '), months, years };
}

/**
 * Sort helper: newest first, `present` entries first of all.
 *
 * @param {{start?: string|null, end?: string|null, date?: string|null}} a
 * @param {{start?: string|null, end?: string|null, date?: string|null}} b
 * @returns {number}
 */
export function compareByRecency(a, b) {
  /** @param {{start?: string|null, end?: string|null, date?: string|null}} entry */
  const key = (entry) => {
    const end = parseDate(entry.end ?? entry.date ?? null);
    if (end?.present) return Number.MAX_SAFE_INTEGER;
    const start = parseDate(entry.start ?? entry.date ?? null);
    return end?.date.getTime() ?? start?.date.getTime() ?? 0;
  };
  return key(b) - key(a);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isParsableDate(value) {
  return parseDate(value) !== null;
}
