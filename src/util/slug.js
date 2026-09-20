/**
 * URL slug helpers.
 *
 * Slugs are ASCII, lowercase, hyphen separated. Non-latin text is transliterated
 * through Unicode NFKD normalisation where possible and otherwise dropped, which
 * keeps generated file names portable across hosting providers.
 *
 * @module util/slug
 */

/** @type {Record<string, string>} */
const TRANSLITERATION = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
  þ: 'th',
  Þ: 'Th',
  ð: 'd',
  Ð: 'D',
};

/**
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  const transliterated = String(value ?? '').replace(
    /[ßæÆœŒøØđĐłŁþÞð]/g,
    (char) => TRANSLITERATION[char] ?? char,
  );
  const ascii = transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, (char) => (char === ' ' ? ' ' : ''))
    .toLowerCase()
    .replace(/['"`’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return ascii;
}

/**
 * Slugify and fall back to a stable placeholder when nothing usable remains
 * (for example a name written entirely in a script that does not transliterate).
 *
 * @param {string} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function slugifyOr(value, fallback = 'item') {
  return slugify(value) || fallback;
}

/**
 * Make a slug unique inside a set of already used slugs, appending `-2`, `-3`…
 *
 * @param {string} slug
 * @param {Set<string>} used
 * @returns {string}
 */
export function uniqueSlug(slug, used) {
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let index = 2;
  let candidate = `${slug}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${slug}-${index}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Is this string already a safe slug?
 * @param {string} value
 * @returns {boolean}
 */
export function isSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
