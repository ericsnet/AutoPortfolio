/**
 * URL and file-path conventions for generated sites.
 *
 * AutoPortfolio writes plain files, so "pretty URLs" are just a directory with
 * an `index.html` inside. Everything that converts between the two — the
 * generator, the navigation builder and `sitemap.xml` — goes through this
 * module so the convention cannot drift.
 *
 * @module model/urls
 */

import path from 'node:path';

/**
 * @typedef {object} UrlOptions
 * @property {boolean} [prettyUrls]  Directory style URLs (default true).
 * @property {string} [trailingSlash]
 */

/**
 * Convert an output file path into the URL a visitor will see.
 *
 * `index.html`            -> `/`
 * `projects/foo/index.html` -> `/projects/foo/`
 * `projects/foo.html` (prettyUrls off) -> `/projects/foo.html`
 *
 * @param {string} filePath Path relative to the output directory, POSIX style.
 * @param {UrlOptions} [options]
 * @returns {string}
 */
export function fileToUrl(filePath, options = {}) {
  const pretty = options.prettyUrls !== false;
  const normalised = filePath.replace(/^\/+/, '').split(path.sep).join('/');

  if (normalised === 'index.html' || normalised === '') return '/';

  if (pretty) {
    if (normalised.endsWith('/index.html')) return `/${normalised.slice(0, -'index.html'.length)}`;
    return `/${normalised}`;
  }

  if (normalised.endsWith('/index.html')) {
    const directory = normalised.slice(0, -'index.html'.length).replace(/\/$/, '');
    return directory ? `/${directory}/` : '/';
  }
  return `/${normalised}`;
}

/**
 * Convert a site URL into the file that implements it.
 *
 * @param {string} url e.g. `/projects/foo/`
 * @param {UrlOptions} [options]
 * @returns {string}
 */
export function urlToFile(url, options = {}) {
  const pretty = options.prettyUrls !== false;
  const normalised = url.replace(/^\/+/, '');
  if (normalised === '' || normalised === '/') return 'index.html';
  if (normalised.endsWith('/')) return `${normalised}index.html`;
  if (normalised.endsWith('.html')) return normalised;
  return pretty ? `${normalised}/index.html` : `${normalised}.html`;
}

/**
 * Build a relative link from one output file to another.
 *
 * @param {string} fromFile The page doing the linking (`projects/foo/index.html`).
 * @param {string} toFile   The target file.
 * @param {UrlOptions} [options]
 * @returns {string}
 */
export function relativeUrl(fromFile, toFile, options = {}) {
  const fromDirectory = path.posix.dirname(fromFile.split(path.sep).join('/'));
  const target = toFile.split(path.sep).join('/');
  let relative = path.posix.relative(fromDirectory === '.' ? '' : fromDirectory, target);
  if (relative === '') relative = path.posix.basename(target);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  if (options.prettyUrls !== false && /(^|\/)index\.html$/.test(relative)) {
    // Directory URLs read better and survive being copied between hosts.
    const stripped = relative.replace(/\/?index\.html$/, '');
    if (stripped && stripped !== '.' && stripped !== './') {
      return stripped.endsWith('/') ? stripped : `${stripped}/`;
    }
  }
  return relative;
}

/**
 * Normalise a base URL from configuration or data (`https://x.dev/` -> `https://x.dev`).
 *
 * @param {string|undefined|null} baseUrl
 * @returns {string}
 */
export function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Join a base URL with a site path.
 *
 * @param {string} baseUrl
 * @param {string} url
 * @returns {string}
 */
export function absoluteUrl(baseUrl, url) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return url;
  const cleanPath = url.replace(/^\/+/, '');
  if (!cleanPath) return `${base}/`;
  return `${base}/${cleanPath}`;
}

/**
 * Make a URL safe to use as a file name fragment.
 *
 * @param {string} value
 * @returns {string}
 */
export function humanizeUrl(value) {
  return value.replace(/\/index\.html$/, '/');
}
