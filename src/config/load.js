/**
 * Loading a project: configuration + portfolio document -> validated model.
 *
 * This is the seam between "text on disk" and "objects the generator uses". It
 * is deliberately forgiving about *where* things are (a config file, a bare
 * portfolio file, or no file at all in a fresh directory) and strict about what
 * they may contain.
 *
 * @module config/load
 */

import path from 'node:path';
import { AutoPortfolioError, ErrorCodes, countDiagnostics, diagnostic } from '../util/errors.js';
import { exists, isDirectory, isFile, readTextOrNull } from '../util/fsx.js';
import { DEFAULT_CONFIG_FILENAMES, configSchema } from '../schema/config-schema.js';
import { DATA_VERSION, portfolioSchema } from '../schema/portfolio-schema.js';
import { validateDocument } from '../schema/validate.js';
import { normalizeConfig, normalizePortfolio } from '../model/normalize.js';
import { checkPortfolio } from '../model/semantic.js';
import { parseDocument, detectFormat } from './parse.js';

/**
 * @typedef {import('../util/errors.js').Diagnostic} Diagnostic
 */

/**
 * @typedef {object} LoadedProject
 * @property {string} root            Directory the project is anchored to.
 * @property {string|null} configPath Absolute path of the configuration file.
 * @property {string|null} dataPath   Absolute path of the portfolio document.
 * @property {any} config             Normalised configuration.
 * @property {any} data               Normalised portfolio document.
 * @property {Diagnostic[]} diagnostics
 * @property {Record<string, string>} sources File contents by absolute path.
 * @property {string[]} files         Every file that was read, absolute.
 */

/**
 * @typedef {object} LoadOptions
 * @property {string} [cwd]
 * @property {string} [config]      Explicit configuration file.
 * @property {string} [data]        Explicit portfolio document (overrides `config.data`).
 * @property {string} [template]    CLI override.
 * @property {string} [theme]       CLI override (preset name).
 * @property {string} [mode]        CLI override for the colour mode.
 * @property {string} [accent]      CLI override for the accent colour.
 * @property {string} [output]      CLI override for the output directory.
 * @property {string} [baseUrl]     CLI override for the public URL.
 * @property {boolean} [strict]
 * @property {boolean} [drafts]
 * @property {boolean} [minify]
 */

/**
 * Find the configuration file for a working directory.
 *
 * @param {string} cwd
 * @returns {Promise<string|null>}
 */
export async function findConfigFile(cwd) {
  for (const name of DEFAULT_CONFIG_FILENAMES) {
    const candidate = path.join(cwd, name);
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Load a project from disk.
 *
 * @param {LoadOptions} [options]
 * @returns {Promise<LoadedProject>}
 */
export async function loadProject(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Record<string, string>} */
  const sources = {};
  /** @type {string[]} */
  const files = [];

  let configPath = null;
  /** @type {any} */
  let rawConfig = {};
  /** @type {string|null} */
  let configText = null;

  /** @type {string|undefined} */
  let dataOverride = options.data;

  if (options.config) {
    configPath = path.resolve(cwd, options.config);
    if (!(await isFile(configPath))) {
      throw new AutoPortfolioError(`Configuration file not found: ${configPath}`, {
        code: ErrorCodes.CONFIG_NOT_FOUND,
        source: relative(cwd, configPath),
        hint: 'Check the path passed to `--config`.',
      });
    }
    // `--config portfolio.yaml` is a common slip: accept it as the portfolio
    // document rather than complaining that it is not a configuration file.
    if (isDataFile(configPath) && !/config\./i.test(path.basename(configPath))) {
      dataOverride = configPath;
      configPath = null;
    }
  } else {
    configPath = await findConfigFile(cwd);
  }

  if (configPath) {
    configText = await readTextOrNull(configPath);
    if (configText === null) {
      throw new AutoPortfolioError(`Cannot read configuration file: ${configPath}`, {
        code: ErrorCodes.CONFIG_UNREADABLE,
        source: relative(cwd, configPath),
      });
    }
    sources[configPath] = configText;
    files.push(configPath);
    try {
      const parsed = parseDocument(configText, { source: configPath });
      rawConfig = parsed ?? {};
    } catch (error) {
      throw withSource(error, configPath);
    }
    if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      throw new AutoPortfolioError('The configuration file must contain a mapping of options', {
        code: ErrorCodes.CONFIG_INVALID,
        source: relative(cwd, configPath),
        hint: 'Start the file with `template: modern` and `data: portfolio.yaml`.',
      });
    }
  } else {
    diagnostics.push(
      diagnostic({
        severity: 'info',
        code: ErrorCodes.CONFIG_NOT_FOUND,
        message: 'No configuration file found, using defaults',
        source: cwd,
        hint: `Create one of ${DEFAULT_CONFIG_FILENAMES.slice(0, 3).map((name) => `\`${name}\``).join(', ')} or run \`autoportfolio init\`.`,
      }),
    );
  }

  const root = configPath ? path.dirname(configPath) : dataOverride ? path.dirname(path.resolve(cwd, dataOverride)) : cwd;

  // --- configuration -------------------------------------------------------
  const configResult = validateDocument(applyConfigOverrides(rawConfig, options), configSchema, {
    source: configPath ? relative(cwd, configPath) : undefined,
    strict: options.strict,
  });
  diagnostics.push(...configResult.diagnostics);
  const config = normalizeConfig(configResult.value);
  if (options.strict) config.build.strict = true;
  if (options.minify !== undefined) config.build.minify = options.minify;

  // --- portfolio document --------------------------------------------------
  const dataPath = path.resolve(root, dataOverride ?? config.data ?? 'portfolio.yaml');
  if (!(await isFile(dataPath))) {
    const searched = dataOverride ?? config.data;
    throw new AutoPortfolioError(`Portfolio document not found: ${dataPath}`, {
      code: ErrorCodes.DATA_MISSING,
      source: relative(cwd, dataPath),
      hint: searched
        ? 'Check the `data` path in the configuration, or pass `--data <file>`.'
        : 'Create `portfolio.yaml` or run `autoportfolio init`.',
    });
  }

  const dataText = await readTextOrNull(dataPath);
  if (dataText === null) {
    throw new AutoPortfolioError(`Cannot read portfolio document: ${dataPath}`, {
      code: ErrorCodes.CONFIG_UNREADABLE,
      source: relative(cwd, dataPath),
    });
  }
  sources[dataPath] = dataText;
  files.push(dataPath);

  let rawData;
  try {
    rawData = parseDocument(dataText, { source: dataPath });
  } catch (error) {
    throw withSource(error, dataPath);
  }
  if (rawData === null || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new AutoPortfolioError('The portfolio document must contain a mapping of fields', {
      code: ErrorCodes.DATA_INVALID,
      source: relative(cwd, dataPath),
      hint: 'Start with `profile:` and your name, then add sections such as `projects:` or `skills:`.',
    });
  }

  const dataResult = validateDocument(rawData, portfolioSchema, {
    source: relative(cwd, dataPath),
    strict: options.strict,
  });
  diagnostics.push(...dataResult.diagnostics);

  if (dataResult.value.version && String(dataResult.value.version) !== DATA_VERSION) {
    diagnostics.push(
      diagnostic({
        severity: 'warning',
        code: ErrorCodes.UNSUPPORTED_VERSION,
        message: `Document declares version \`${dataResult.value.version}\` but this build understands \`${DATA_VERSION}\``,
        path: 'version',
        source: relative(cwd, dataPath),
        hint: 'AutoPortfolio will try to read it anyway; remove the key to silence this warning.',
      }),
    );
  }

  const data = normalizePortfolio(dataResult.value, {
    locale: config.content.locale ?? dataResult.value?.meta?.locale,
    includeDrafts: Boolean(options.drafts ?? config.build.draft),
  });

  // --- semantic checks -----------------------------------------------------
  diagnostics.push(
    ...checkPortfolio(data, config, {
      source: relative(cwd, dataPath),
      configSource: configPath ? relative(cwd, configPath) : undefined,
    }),
  );

  return { root, configPath, dataPath, config, data, diagnostics, sources, files };
}

/**
 * Turn an `AutoPortfolioError` thrown by the parser into one whose `source`
 * matches the label used in diagnostics.
 *
 * @param {unknown} error
 * @param {string} file
 * @returns {unknown}
 */
function withSource(error, file) {
  if (error instanceof AutoPortfolioError) {
    error.source = file;
    error.message = error.message.replace(file, path.basename(file));
  }
  return error;
}

/**
 * @param {string} cwd
 * @param {string} file
 * @returns {string}
 */
function relative(cwd, file) {
  const value = path.relative(cwd, file);
  return value === '' ? '.' : value;
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isDataFile(file) {
  try {
    detectFormat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply CLI overrides on top of the raw configuration object, before validation,
 * so that an invalid flag is reported by the same code path as an invalid file.
 *
 * @param {any} raw
 * @param {LoadOptions} options
 * @returns {any}
 */
function applyConfigOverrides(raw, options) {
  const out = { ...(raw ?? {}) };
  if (options.template) out.template = options.template;
  if (options.output) out.build = { ...(out.build ?? {}), output: options.output };
  if (options.baseUrl) out.site = { ...(out.site ?? {}), baseUrl: options.baseUrl };
  if (options.mode || options.accent || options.theme) {
    out.theme = { ...(out.theme ?? {}) };
    if (options.theme) out.theme.preset = options.theme;
    if (options.mode) out.theme.mode = options.mode;
    if (options.accent) out.theme.accent = options.accent;
  }
  return out;
}

/**
 * Summarise a project for the CLI (`autoportfolio info`).
 *
 * @param {LoadedProject} project
 * @returns {Array<[string, string]>}
 */
export function describeProject(project) {
  const { data, config } = project;
  const counts = countDiagnostics(project.diagnostics);
  return [
    ['name', data.profile?.name ?? '(unnamed)'],
    ['headline', data.profile?.headline ?? '—'],
    ['template', config.template],
    ['theme', `${config.theme.preset} (${config.theme.mode})`],
    ['output', config.build.output],
    ['projects', String(data.projects.length)],
    ['experience', String(data.experience.length)],
    ['education', String(data.education.length)],
    ['skills', String(data.skills.length)],
    ['custom sections', String(data.sections.length)],
    ['problems', `${counts.errors} errors, ${counts.warnings} warnings`],
  ];
}

/**
 * Does the directory look like an AutoPortfolio project?
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isProjectDirectory(dir) {
  if (!(await isDirectory(dir))) return false;
  if (await findConfigFile(dir)) return true;
  for (const name of ['portfolio.yaml', 'portfolio.yml', 'portfolio.json', 'portfolio.toml']) {
    if (await exists(path.join(dir, name))) return true;
  }
  return false;
}

export { validateProject } from './validate-project.js';
