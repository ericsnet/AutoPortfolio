/**
 * String helpers shared across the generator. Kept dependency-free and
 * side-effect free so they are trivially unit-testable.
 *
 * @module util/text
 */

/**
 * Everything in AutoPortfolio is stored as UTF-8 text; normalise the various
 * newline spellings down to `\n` early so downstream code can assume one form.
 * @param {string} value
 * @returns {string}
 */
export function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, '\n');
}

/**
 * @param {string} value
 * @returns {string}
 */
export function collapseWhitespace(value) {
  return value.replace(/[\t ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

/**
 * Collapse every whitespace run (including newlines) into single spaces. Useful
 * for meta descriptions and other single-line contexts.
 * @param {string} value
 * @returns {string}
 */
export function oneLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} value
 * @param {number} max
 * @param {object} [options]
 * @param {string} [options.ellipsis]
 * @param {boolean} [options.words] Prefer breaking on a word boundary.
 * @returns {string}
 */
export function truncate(value, max, options = {}) {
  const ellipsis = options.ellipsis ?? '…';
  const text = oneLine(value);
  if (text.length <= max) return text;
  const slice = text.slice(0, Math.max(0, max - ellipsis.length));
  if (options.words === false) return `${slice}${ellipsis}`;
  const boundary = slice.lastIndexOf(' ');
  const clipped = boundary > max * 0.5 ? slice.slice(0, boundary) : slice;
  return `${clipped.replace(/[\s.,;:!?-]+$/, '')}${ellipsis}`;
}

/**
 * Count words in a string.
 * @param {string} value
 * @returns {number}
 */
export function wordCount(value) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Turn `foo-bar_baz qux` into `Foo Bar Baz Qux`.
 * @param {string} value
 * @returns {string}
 */
export function titleCase(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length > 3 && word === word.toUpperCase() ? word : capitalize(word)))
    .join(' ');
}

/**
 * `helloWorld` / `hello-world` / `hello_world` -> `hello world`.
 * @param {string} value
 * @returns {string}
 */
export function humanize(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
export function stripTags(value) {
  return value.replace(/<[^>]*>/g, '');
}

/**
 * Escape a string for safe inclusion in a regular expression.
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic, order-independent string hash (FNV-1a 32 bit).
 * Used for cache keys and short content fingerprints.
 * @param {string} value
 * @returns {string} 8 character hex digest
 */
export function shortHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * @param {string} value
 * @returns {string}
 */
export function indent(value, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

/**
 * Join a list of strings the human way: `a, b and c`.
 * @param {string[]} items
 * @param {string} [conjunction]
 * @returns {string}
 */
export function listJoin(items, conjunction = 'and') {
  const values = items.filter(Boolean);
  if (values.length === 0) return '';
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} ${conjunction} ${values[values.length - 1]}`;
}

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string}
 */
export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural ?? `${singular}s`;
}
