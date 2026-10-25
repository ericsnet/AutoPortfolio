/**
 * Value formatting shared by every template.
 *
 * Templates receive *formatted* values (HTML for rich text, human dates, links
 * relative to the current page) so a template author never has to know about
 * Markdown, date precision or URL conventions. This is the boundary that keeps
 * templates decoupled from the data model.
 *
 * @module model/format
 */

import { renderMarkdown, renderInlineMarkdown } from '../util/markdown.js';
import { SafeHtml, raw, escapeHtml } from '../util/html.js';
import { formatDate, formatRange, formatDuration, parseDate } from '../util/date.js';
import { absoluteUrl, normalizeBaseUrl, relativeUrl } from './urls.js';

/**
 * @typedef {object} FormatterOptions
 * @property {any} config
 * @property {any} [data]
 * @property {string} [pageFile] Output file of the page being rendered.
 * @property {(path: string) => string} [resolveAsset] Turns an asset reference into an output path.
 */

/**
 * Create the formatter used for one page.
 *
 * @param {FormatterOptions} options
 * @returns {ReturnType<typeof createFormatterShape>}
 */
export function createFormatter(options) {
  return createFormatterShape(options);
}

/**
 * @param {FormatterOptions} options
 */
function createFormatterShape(options) {
  const { config, data } = options;
  const content = config?.content ?? {};
  const locale = content.locale ?? data?.meta?.locale ?? 'en-US';
  const baseUrl = normalizeBaseUrl(config?.site?.baseUrl ?? data?.meta?.siteUrl ?? '');
  const pageFile = options.pageFile ?? 'index.html';
  const prettyUrls = config?.build?.prettyUrls !== false;

  /**
   * @param {string|undefined|null} value
   * @returns {SafeHtml}
   */
  const markdown = (value) => {
    if (!value) return raw('');
    if (content.markdown === false) {
      return raw(`<p>${escapeHtml(value).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`);
    }
    return renderMarkdown(value, {
      allowHtml: Boolean(content.rawHtml),
      breaks: Boolean(content.lineBreaks),
      linkTarget: content.externalLinksNewTab ? '_blank' : undefined,
    });
  };

  /**
   * Inline Markdown for contexts where a paragraph would be invalid — hero
   * taglines, card taglines, list items.
   * @param {string|undefined|null} value
   * @returns {SafeHtml}
   */
  const inline = (value) =>
    renderInlineMarkdown(value, {
      allowHtml: Boolean(content.rawHtml),
      linkTarget: content.externalLinksNewTab ? '_blank' : undefined,
    });

  /**
   * @param {string|undefined|null} value
   * @param {object} [dateOptions]
   * @param {string} [dateOptions.precision]
   * @returns {string}
   */
  const date = (value, dateOptions = {}) => {
    const parsed = parseDate(value ?? null);
    if (!parsed) return '';
    const precision = dateOptions.precision ?? content.dateFormat ?? 'auto';
    return formatDate(parsed, { precision: precision === 'auto' ? undefined : precision, locale });
  };

  /**
   * @param {string|undefined|null} start
   * @param {string|undefined|null} end
   * @param {object} [rangeOptions]
   * @param {string} [rangeOptions.format] `long` prints the full range, `short` prints years.
   * @returns {string}
   */
  const range = (start, end, rangeOptions = {}) => {
    const formatted = formatRange(start, end, { locale, presentLabel: 'Present' });
    if (rangeOptions.format === 'short') {
      const startLabel = formatDate(parseDate(start ?? null), { precision: 'year', locale });
      const endLabel = formatted.current ? 'Present' : formatDate(parseDate(end ?? null), { precision: 'year', locale });
      return startLabel && endLabel ? `${startLabel} – ${endLabel}` : startLabel || endLabel || '';
    }
    return formatted.label;
  };

  /**
   * @param {string|undefined|null} start
   * @param {string|undefined|null} end
   * @returns {string} e.g. `2 yrs 3 mo`
   */
  const duration = (start, end) => formatDuration(start, end).label;

  /**
   * Resolve an asset reference against the current page.
   * @param {string|undefined|null} source
   * @returns {string}
   */
  const asset = (source) => {
    if (!source) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith('//') || source.startsWith('data:')) return source;
    if (source.startsWith('/')) return source;
    const resolved = options.resolveAsset ? options.resolveAsset(source) : source;
    return relativeUrl(pageFile, resolved, { prettyUrls });
  };

  /**
   * A site-relative link (with the leading slash) resolved into a relative one
   * when the site is going to be hosted under a sub-path.
   * @param {string} url
   * @returns {string}
   */
  const link = (url) => {
    if (!url) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) return url;

    // Split the fragment off so `/#projects` resolves like `/` and keeps the hash.
    const hashIndex = url.indexOf('#');
    const pathPart = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

    const withoutLeading = pathPart.replace(/^\/+/, '');
    const file = !withoutLeading
      ? 'index.html'
      : withoutLeading.endsWith('/')
        ? `${withoutLeading}index.html`
        : withoutLeading;
    return `${relativeUrl(pageFile, file, { prettyUrls })}${hash}`;
  };

  /**
   * @param {string} url
   * @returns {string}
   */
  const absolute = (url) => absoluteUrl(baseUrl, url);

  /**
   * @param {string|undefined|null} email
   * @returns {string}
   */
  const mailto = (email) => {
    if (!email) return '';
    if (content.emailObfuscation === 'none') return `mailto:${email}`;
    // Encode the address so naive scrapers do not see a literal `@`.
    const encoded = [...`mailto:${email}`]
      .map((char) => (char === '@' || char === ':' || char === '.' ? `&#${char.charCodeAt(0)};` : char))
      .join('');
    return encoded;
  };

  return {
    markdown,
    inline,
    date,
    range,
    duration,
    asset,
    link,
    absolute,
    mailto,
    get locale() {
      return locale;
    },
    get baseUrl() {
      return baseUrl;
    },
    get pageFile() {
      return pageFile;
    },
  };
}

/**
 * Text used for `<title>` and social cards: prefer the explicit override, fall
 * back to a generated one.
 *
 * @param {any} data
 * @param {any} config
 * @returns {{title: string, description: string}}
 */
export function siteTitleAndDescription(data, config) {
  const name = data.profile?.name ?? 'Portfolio';
  const title = config?.site?.title ?? data.meta?.title ?? (data.profile?.headline ? `${name} — ${data.profile.headline}` : name);
  const description =
    data.meta?.description ?? data.profile?.shortBio ?? [data.profile?.headline, data.profile?.location].filter(Boolean).join(' · ');
  return { title, description };
}

/**
 * Initials used for the monogram fallback when there is no avatar.
 * @param {string} name
 * @returns {string}
 */
export function initials(name) {
  if (!name) return '?';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/**
 * Strip the scheme and `www.` from a URL so it can be shown to humans.
 * @param {string} url
 * @returns {string}
 */
export function prettyUrl(url) {
  return String(url)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
