/**
 * Template discovery and loading.
 *
 * A template is a directory containing a `template.json` manifest, an optional
 * layout, one or more page templates, partials and its own CSS/JS. Nothing about
 * a template is hard-coded in the generator, so a template can live in a user's
 * repository and be selected with `template: ./my-template`.
 *
 * @module templates/registry
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoPortfolioError, ErrorCodes, diagnostic } from '../util/errors.js';
import { isDirectory, isFile, readTextOrNull, walk } from '../util/fsx.js';
import { nearestKey } from '../schema/validate.js';

const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

/**
 * @typedef {object} TemplateManifest
 * @property {string} name
 * @property {string} [label]
 * @property {string} [description]
 * @property {string} [version]
 * @property {string} [author]
 * @property {string} [license]
 * @property {string} [entry]      Home page template (default `page.html`).
 * @property {string} [layout]     Wrapping layout (default `layout.html`).
 * @property {string} [project]    Project detail template (default `project.html`).
 * @property {string} [notFound]  404 template (default `not-found.html`).
 * @property {string[]} [styles]
 * @property {string[]} [scripts]
 * @property {Record<string, any>} [options]   Declared option defaults.
 * @property {boolean} [preview]   Whether the template is offered by the preview server.
 */

/**
 * @typedef {object} LoadedTemplate
 * @property {TemplateManifest} manifest
 * @property {string} dir
 * @property {boolean} builtin
 * @property {string} layout
 * @property {string} page
 * @property {string|null} project
 * @property {string|null} notFound
 * @property {Map<string, string>} partials  Partial name -> source.
 * @property {string[]} styles  Output file names of the template stylesheets.
 * @property {string[]} scripts
 * @property {Array<{from: string, to: string}>} assets Static files shipped by the template.
 * @property {diagnostic[]} [diagnostics]
 */

/**
 * List every template available in the builtin directory plus any extra search
 * paths from the configuration.
 *
 * @param {object} [options]
 * @param {string[]} [options.searchPaths]
 * @returns {Promise<TemplateManifest[]>}
 */
export async function listTemplates(options = {}) {
  /** @type {TemplateManifest[]} */
  const templates = [];
  const dirs = [...(options.searchPaths ?? []), BUILTIN_DIR];

  for (const root of dirs) {
    if (!(await isDirectory(root))) continue;
    const entries = await walk(root, { maxDepth: 0, includeDirectories: true });
    for (const entry of entries) {
      if (!entry.directory) continue;
      const manifestPath = path.join(entry.path, 'template.json');
      if (!(await isFile(manifestPath))) continue;
      const manifest = await readManifest(manifestPath);
      if (!manifest) continue;
      if (templates.some((template) => template.name === manifest.name)) continue;
      templates.push(manifest);
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load a template by name or directory path.
 *
 * @param {string} name Template name, or a path relative to `root`.
 * @param {object} [options]
 * @param {string} [options.root]       Directory used to resolve relative template paths.
 * @param {string[]} [options.searchPaths]
 * @returns {Promise<LoadedTemplate>}
 */
export async function loadTemplate(name, options = {}) {
  const candidates = await resolveTemplateDirectories(name, options);
  /** @type {string|undefined} */
  let directory;
  /** @type {boolean} */
  let builtin = false;

  for (const candidate of candidates) {
    if (await isFile(path.join(candidate, 'template.json'))) {
      directory = candidate;
      builtin = path.resolve(candidate).startsWith(path.resolve(BUILTIN_DIR));
      break;
    }
  }

  if (!directory) {
    const available = await listTemplates(options);
    throw new AutoPortfolioError(`Unknown template \`${name}\``, {
      code: ErrorCodes.TEMPLATE_NOT_FOUND,
      hint: available.length
        ? `Available templates: ${available.map((template) => template.name).join(', ')}. You can also point \`template\` at a directory.`
        : 'No templates were found. Reinstall AutoPortfolio or pass a template directory.',
    });
  }

  const manifestPath = path.join(directory, 'template.json');
  const manifest = await readManifest(manifestPath);
  if (!manifest) {
    throw new AutoPortfolioError(`Template \`${name}\` has no valid template.json`, {
      code: ErrorCodes.TEMPLATE_MANIFEST,
      source: path.relative(process.cwd(), manifestPath),
      hint: 'The manifest needs at least a `name` and an `entry` template.',
    });
  }

  /** @type {string[]} */
  const diagnostics = [];
  const read = async (file, fallbackNames = []) => {
    for (const candidate of [file, ...fallbackNames]) {
      if (!candidate) continue;
      const absolute = path.join(directory, candidate);
      const source = await readTextOrNull(absolute);
      if (source !== null) return { source, file: candidate };
    }
    return null;
  };

  const layout = await read(manifest.layout ?? 'layout.html', ['layouts/base.html']);
  const page = await read(manifest.entry ?? 'page.html', ['index.html', 'home.html']);
  const project = await read(manifest.project ?? 'project.html', ['projects/detail.html']);
  const notFound = await read(manifest.notFound ?? 'not-found.html', ['404.html']);

  if (!page) {
    throw new AutoPortfolioError(`Template \`${manifest.name}\` is missing its page template`, {
      code: ErrorCodes.TEMPLATE_MISSING_FILE,
      source: path.relative(process.cwd(), directory),
      hint: `Expected \`${manifest.entry ?? 'page.html'}\` in the template directory.`,
    });
  }

  /** @type {Map<string, string>} */
  const partials = new Map();
  const partialFiles = await walk(path.join(directory, 'partials'), {});
  for (const entry of partialFiles) {
    const source = await readTextOrNull(entry.path);
    if (source === null) continue;
    const base = path.relative(path.join(directory, 'partials'), entry.path).split(path.sep).join('/');
    const withoutExtension = base.replace(/\.(html|hbs|mustache)$/, '');
    partials.set(withoutExtension, source);
    const basename = path.posix.basename(withoutExtension);
    if (!partials.has(basename)) partials.set(basename, source);
  }

  const styles = (manifest.styles ?? ['styles.css']).filter(Boolean);
  const scripts = (manifest.scripts ?? []).filter(Boolean);

  /** @type {Array<{from: string, to: string}>} */
  const assets = [];
  const staticFiles = await walk(path.join(directory, 'static'), {});
  for (const entry of staticFiles) {
    assets.push({
      from: entry.path,
      to: path.relative(path.join(directory, 'static'), entry.path).split(path.sep).join('/'),
    });
  }

  // Warn about manifest typos so a template author sees them immediately.
  const knownKeys = [
    'name', 'label', 'description', 'version', 'author', 'license', 'entry', 'layout',
    'project', 'notFound', 'styles', 'scripts', 'options', 'preview', 'requires',
  ];
  for (const key of Object.keys(manifest)) {
    if (knownKeys.includes(key)) continue;
    diagnostics.push(
      diagnostic({
        severity: 'warning',
        code: ErrorCodes.TEMPLATE_MANIFEST,
        message: `Unknown key \`${key}\` in template manifest`,
        source: path.relative(process.cwd(), manifestPath),
        hint: nearestKey(key, knownKeys) ? `Did you mean \`${nearestKey(key, knownKeys)}\`?` : undefined,
      }),
    );
  }

  return {
    manifest,
    dir: directory,
    builtin,
    layout: layout?.source ?? defaultLayout(),
    page: page.source,
    project: project?.source ?? null,
    notFound: notFound?.source ?? null,
    partials,
    styles,
    scripts,
    assets,
    diagnostics,
  };
}

/**
 * @param {string} name
 * @param {object} options
 * @param {string} [options.root]
 * @param {string[]} [options.searchPaths]
 * @returns {Promise<string[]>}
 */
async function resolveTemplateDirectories(name, options) {
  /** @type {string[]} */
  const candidates = [];

  // Explicit path (absolute, relative, or containing a separator).
  if (path.isAbsolute(name) || name.startsWith('.') || name.includes('/') || name.includes('\\')) {
    candidates.push(path.resolve(options.root ?? process.cwd(), name));
  }

  for (const searchPath of options.searchPaths ?? []) {
    candidates.push(path.join(searchPath, name));
  }
  candidates.push(path.join(BUILTIN_DIR, name));

  return candidates;
}

/**
 * @param {string} file
 * @returns {Promise<TemplateManifest|null>}
 */
async function readManifest(file) {
  const text = await readTextOrNull(file);
  if (text === null) return null;
  try {
    const manifest = JSON.parse(text);
    if (!manifest || typeof manifest !== 'object' || typeof manifest.name !== 'string') return null;
    return /** @type {TemplateManifest} */ (manifest);
  } catch {
    return null;
  }
}

/**
 * The layout used when a template does not ship one.
 * @returns {string}
 */
function defaultLayout() {
  return `<!doctype html>
<html lang="{{site.language}}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{site.title}}</title>
</head>
<body>
{{{body}}}
</body>
</html>
`;
}

export { BUILTIN_DIR };
