/**
 * Asset handling.
 *
 * The generator copies files instead of transforming them, which keeps builds
 * fast and predictable. What it does do is make sure every referenced image
 * exists in the output: content may point at files inside the asset directory
 * *or* anywhere else in the project, and both must survive into `dist`.
 *
 * @module generator/assets
 */

import path from 'node:path';
import { ErrorCodes, diagnostic } from '../util/errors.js';
import { isDirectory, isFile, walk } from '../util/fsx.js';
import { escapeHtml } from '../util/html.js';
import { initials } from '../model/format.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */

const FAVICON_CANDIDATES = [
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
  'icon.svg',
  'icon.png',
  'apple-touch-icon.png',
];
const FAVICON_DIRECTORIES = ['', 'assets', 'static', 'public', 'assets/images'];

/**
 * Collect every image reference in the document.
 *
 * @param {any} data Normalised portfolio document.
 * @returns {Array<{src: string, path: string}>}
 */
export function collectImageReferences(data) {
  /** @type {Array<{src: string, path: string}>} */
  const references = [];
  /** @param {any} image @param {string} label */
  const add = (image, label) => {
    if (image?.src) references.push({ src: image.src, path: label });
  };

  add(data.profile?.avatar, 'profile.avatar');
  add(data.meta?.image, 'meta.image');

  (data.projects ?? []).forEach((project, index) => {
    add(project.cover, `projects[${index}].cover`);
    (project.images ?? []).forEach((image, imageIndex) => add(image, `projects[${index}].images[${imageIndex}]`));
  });

  (data.experience ?? []).forEach((entry, index) => add(entry.logo, `experience[${index}].logo`));
  (data.education ?? []).forEach((entry, index) => add(entry.logo, `education[${index}].logo`));
  (data.certifications ?? []).forEach((entry, index) => add(entry.logo, `certifications[${index}].logo`));
  (data.testimonials ?? []).forEach((entry, index) => add(entry.avatar, `testimonials[${index}].avatar`));
  (data.sections ?? []).forEach((section, index) => {
    (section.items ?? []).forEach((item, itemIndex) => add(item.image, `sections[${index}].items[${itemIndex}].image`));
  });

  return references;
}

/**
 * @param {string} src
 * @returns {boolean}
 */
function isRemote(src) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(src) || src.startsWith('//') || src.startsWith('data:');
}

/**
 * Plan the file copies for a build.
 *
 * @param {object} options
 * @param {any} options.data
 * @param {any} options.config
 * @param {string} options.root      Project root.
 * @param {string} options.outDir    Output directory (absolute).
 * @returns {Promise<{copies: Array<{from: string, to: string}>, diagnostics: Diagnostic[]}>}
 */
export async function planAssetCopies(options) {
  const { data, config, root } = options;
  /** @type {Array<{from: string, to: string}>} */
  const copies = [];
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const seen = new Set();

  const assetDirectory = config.assets?.directory ?? 'assets';
  const assetRoot = path.resolve(root, assetDirectory);

  if (config.assets?.copy !== false && (await isDirectory(assetRoot))) {
    const entries = await walk(assetRoot, {});
    for (const entry of entries) {
      const relative = path.posix.join(assetDirectory.split(path.sep).join('/'), entry.relative);
      copies.push({ from: entry.path, to: relative });
      seen.add(relative);
    }
  }

  for (const reference of collectImageReferences(data)) {
    if (isRemote(reference.src)) continue;
    const clean = reference.src.replace(/^\.?\/+/, '').split('?')[0].split('#')[0];
    if (seen.has(clean)) continue;

    const candidates = [path.resolve(root, clean)];
    if (!clean.startsWith(`${assetDirectory}/`)) candidates.push(path.resolve(assetRoot, clean));

    let resolved;
    for (const candidate of candidates) {
      if (await isFile(candidate)) {
        resolved = candidate;
        break;
      }
    }

    if (!resolved) {
      diagnostics.push(
        diagnostic({
          severity: 'warning',
          code: ErrorCodes.ASSET_NOT_FOUND,
          message: `Image not found: ${reference.src}`,
          path: reference.path,
          hint: `Place the file at \`${clean}\` relative to the configuration, or point the field at an absolute URL.`,
        }),
      );
      continue;
    }

    copies.push({ from: resolved, to: clean.replace(/^\.?\/+/, '') });
    seen.add(clean);
  }

  return { copies, diagnostics };
}

/**
 * Locate a favicon in the project.
 *
 * @param {object} options
 * @param {any} options.config
 * @param {string} options.root
 * @returns {Promise<{from: string, to: string}|null>}
 */
export async function findFavicon(options) {
  const configured = options.config.site?.favicon;
  if (configured) {
    const candidate = path.resolve(options.root, configured);
    if (await isFile(candidate)) return { from: candidate, to: `favicon${path.extname(candidate)}` };
    if (await isDirectory(candidate)) {
      for (const name of FAVICON_CANDIDATES) {
        const inside = path.join(candidate, name);
        if (await isFile(inside)) return { from: inside, to: `favicon${path.extname(inside)}` };
      }
    }
  }

  for (const directory of FAVICON_DIRECTORIES) {
    for (const name of FAVICON_CANDIDATES) {
      const candidate = path.join(options.root, directory, name);
      if (await isFile(candidate)) {
        return { from: candidate, to: `favicon${path.extname(candidate)}` };
      }
    }
  }
  return null;
}

/**
 * Generate a simple monogram favicon so a fresh portfolio still looks finished.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.background
 * @param {string} options.foreground
 * @returns {string} SVG source
 */
export function createMonogramFavicon(options) {
  const letters = initials(options.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeHtml(options.name)}">
  <rect width="64" height="64" rx="14" fill="${escapeHtml(options.background)}"/>
  <text x="32" y="41" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="30" font-weight="700" fill="${escapeHtml(options.foreground)}" text-anchor="middle">${escapeHtml(letters)}</text>
</svg>
`;
}

/**
 * Default Open Graph image: a card with the name and headline, drawn as SVG so
 * it never needs an image pipeline.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {string} [options.headline]
 * @param {string} options.background
 * @param {string} options.foreground
 * @param {string} options.accent
 * @returns {string}
 */
export function createSocialCard(options) {
  const name = escapeHtml(options.name ?? '');
  const headline = escapeHtml(options.headline ?? '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${name}">
  <rect width="1200" height="630" fill="${escapeHtml(options.background)}"/>
  <rect x="0" y="0" width="12" height="630" fill="${escapeHtml(options.accent)}"/>
  <text x="96" y="300" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="76" font-weight="700" fill="${escapeHtml(options.foreground)}">${name}</text>
  <text x="96" y="380" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="38" fill="${escapeHtml(options.accent)}">${headline}</text>
</svg>
`;
}
