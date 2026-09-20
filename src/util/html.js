/**
 * HTML helpers.
 *
 * Every dynamic value that reaches a template passes through `escapeHtml` (the
 * template engine escapes by default) or through the explicit `raw()` marker for
 * trusted, already-sanitised HTML such as rendered Markdown.
 *
 * @module util/html
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape text for HTML text nodes and quoted attribute values.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[/** @type {keyof typeof ESCAPES} */ (char)]);
}

/**
 * Wrapper marking a string as trusted HTML. The template engine emits these
 * verbatim for `{{ }}` (no double escaping) and `{{{ }}}`.
 */
export class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    /** @type {string} */
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/**
 * @param {string} value
 * @returns {SafeHtml}
 */
export function raw(value) {
  return new SafeHtml(String(value));
}

/**
 * @param {unknown} value
 * @returns {value is SafeHtml}
 */
export function isSafeHtml(value) {
  return value instanceof SafeHtml;
}

/**
 * Serialise a value the way the template engine would emit it: trusted HTML
 * passes through, everything else is escaped.
 * @param {unknown} value
 * @returns {string}
 */
export function stringify(value) {
  if (value === null || value === undefined) return '';
  if (isSafeHtml(value)) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(value);
}

/**
 * Render `name="value"` attributes, skipping empty/false values. `true` renders
 * as a bare boolean attribute.
 *
 * @param {Record<string, unknown>} attributes
 * @returns {string}
 */
export function attrs(attributes) {
  /** @type {string[]} */
  const out = [];
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined || value === '') continue;
    if (value === true) {
      out.push(name);
      continue;
    }
    out.push(`${name}="${escapeHtml(value)}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * Build a class list, dropping falsy entries.
 * @param {...(string|false|null|undefined|Record<string, boolean>)} values
 * @returns {string}
 */
export function classNames(...values) {
  /** @type {string[]} */
  const out = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string') {
      out.push(value);
    } else {
      for (const [name, enabled] of Object.entries(value)) if (enabled) out.push(name);
    }
  }
  return out.join(' ');
}

/**
 * Join a base URL and a path without producing `//` or dropping the scheme.
 *
 * @param {string} base e.g. `https://example.com/blog`
 * @param {string} path e.g. `projects/foo/index.html` or `/assets/a.css`
 * @returns {string}
 */
export function joinUrl(base, path) {
  if (!base) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  if (!cleanPath) return `${cleanBase}/`;
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Build a `srcset` string from width/variant descriptors.
 *
 * @param {string} src Fallback source (used as the `1x` entry when no widths given).
 * @param {Array<{url: string, width?: number, density?: number}>} [variants]
 * @returns {string}
 */
export function srcset(src, variants = []) {
  if (!variants.length) return '';
  return variants
    .map((variant) => (variant.width ? `${variant.url} ${variant.width}w` : `${variant.url} ${variant.density ?? 1}x`))
    .join(', ');
}

/**
 * Strip tags and collapse whitespace — used for meta descriptions derived from
 * rich text.
 * @param {string} value
 * @returns {string}
 */
export function textContent(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape a string for inclusion in an XML document (sitemap, feed, JSON-LD is
 * JSON so it does not need this).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

/**
 * A minimal allow-list sanitiser used when a portfolio enables raw HTML inside
 * Markdown. It is deliberately conservative: unknown tags are escaped rather
 * than removed, and event handler attributes are dropped.
 *
 * @param {string} html
 * @param {object} [options]
 * @param {string[]} [options.tags]
 * @param {string[]} [options.attributes]
 * @returns {string}
 */
export function sanitizeHtml(html, options = {}) {
  const allowedTags = new Set(
    options.tags ?? [
      'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del',
      'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p',
      'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
      'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'video',
    ],
  );
  const allowedAttributes = new Set(
    options.attributes ?? [
      'alt', 'aria-label', 'aria-hidden', 'class', 'colspan', 'datetime', 'height',
      'href', 'id', 'lang', 'loading', 'rel', 'role', 'rowspan', 'src', 'srcset',
      'sizes', 'style', 'target', 'title', 'type', 'width',
    ],
  );

  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\/?>/g, (match, tagName, rawAttributes) => {
    const tag = String(tagName).toLowerCase();
    if (!allowedTags.has(tag)) return escapeHtml(match);
    if (match.startsWith('</')) return `</${tag}>`;

    const attributes = String(rawAttributes ?? '').replace(
      /([a-zA-Z-][a-zA-Z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)')/g,
      (attribute, name, _all, doubleQuoted, singleQuoted) => {
        const key = String(name).toLowerCase();
        const value = doubleQuoted ?? singleQuoted ?? '';
        if (!allowedAttributes.has(key)) return '';
        if (/^on/i.test(key)) return '';
        if (/^(href|src)$/i.test(key) && /^\s*javascript:/i.test(value)) return '';
        return ` ${key}="${escapeHtml(value)}"`;
      },
    );
    const booleanAttributes = String(rawAttributes ?? '').replace(
      /([a-zA-Z-][a-zA-Z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/g,
      ' ',
    );
    const cleanBooleans = booleanAttributes
      .split(/\s+/)
      .filter(Boolean)
      .filter((name) => /^[a-z][a-z0-9-]*$/i.test(name) && allowedAttributes.has(name.toLowerCase()))
      .map((name) => ` ${name.toLowerCase()}`)
      .join('');
    return `<${tag}${attributes}${cleanBooleans}>`;
  });
}
