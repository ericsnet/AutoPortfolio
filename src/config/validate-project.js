/**
 * Whole-project validation.
 *
 * `loadProject` validates the *shape* of the configuration and the portfolio
 * document. This module checks the things that only make sense once both are
 * loaded and the project is anchored to a directory:
 *
 * - the template exists and can be read,
 * - the theme preset and colours resolve,
 * - every image the document references is actually on disk,
 * - the site has the ingredients it needs to be findable (title, description,
 *   a canonical URL).
 *
 * `autoportfolio validate` runs exactly this, which is why it can be trusted as
 * a pre-commit check: a project that passes here builds.
 *
 * @module config/validate-project
 */

import path from 'node:path';
import { ErrorCodes, countDiagnostics, diagnostic } from '../util/errors.js';
import { isFile } from '../util/fsx.js';
import { listTemplates, loadTemplate } from '../templates/registry.js';
import { resolveTheme } from '../theme/theme.js';
import { collectImageReferences } from '../generator/assets.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */
/** @typedef {import('./load.js').LoadedProject} LoadedProject */

/**
 * @param {LoadedProject} project
 * @param {object} [options]
 * @returns {Promise<{diagnostics: Diagnostic[], counts: {errors: number, warnings: number, infos: number}}>}
 */
export async function validateProject(project, options = {}) {
  /** @type {Diagnostic[]} */
  const diagnostics = [...project.diagnostics];
  const source = project.configPath ? path.relative(process.cwd(), project.configPath) : undefined;
  const dataSource = project.dataPath ? path.relative(process.cwd(), project.dataPath) : undefined;

  // --- template ------------------------------------------------------------
  try {
    await loadTemplate(project.config.template, { root: project.root });
  } catch (error) {
    const available = (await listTemplates({ root: project.root })).map((template) => template.name);
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code: ErrorCodes.TEMPLATE_NOT_FOUND,
        message: `Template \`${project.config.template}\` could not be loaded`,
        path: 'template',
        source,
        hint: `Available templates: ${available.join(', ')}.`,
      }),
    );
  }

  // --- theme ---------------------------------------------------------------
  const themeResolution = resolveTheme(project.config.theme, { source });
  diagnostics.push(...themeResolution.diagnostics);

  if (project.config.theme.customCss) {
    const customCss = path.resolve(project.root, project.config.theme.customCss);
    if (!(await isFile(customCss))) {
      diagnostics.push(
        diagnostic({
          severity: 'error',
          code: ErrorCodes.THEME_INVALID,
          message: `Custom stylesheet not found: ${project.config.theme.customCss}`,
          path: 'theme.customCss',
          source,
          hint: 'The path is relative to the configuration file.',
        }),
      );
    }
  }

  // --- assets --------------------------------------------------------------
  for (const reference of collectImageReferences(project.data)) {
    if (isRemote(reference.src) || reference.src.startsWith('/')) continue;
    const file = path.resolve(project.root, reference.src);
    if (!(await isFile(file))) {
      diagnostics.push(
        diagnostic({
          severity: 'warning',
          code: ErrorCodes.ASSET_NOT_FOUND,
          message: `Image not found: \`${reference.src}\``,
          path: reference.path,
          source: dataSource,
          hint: 'Paths are relative to the configuration file.',
        }),
      );
    }
  }

  // --- discoverability -----------------------------------------------------
  if (!project.data.profile?.headline) {
    diagnostics.push(
      diagnostic({
        severity: 'info',
        code: ErrorCodes.DATA_EMPTY,
        message: '`profile.headline` is empty, so the hero has no subtitle',
        path: 'profile.headline',
        source: dataSource,
        hint: 'One line describing what you do makes the first screen much stronger.',
      }),
    );
  }

  if (!project.data.meta?.description && !project.config.site.description) {
    diagnostics.push(
      diagnostic({
        severity: 'info',
        code: ErrorCodes.DATA_EMPTY,
        message: 'No meta description, so search results will show the first sentence of your bio',
        path: 'meta.description',
        source: dataSource,
      }),
    );
  }

  if (!project.config.site.baseUrl && !project.data.meta?.siteUrl) {
    diagnostics.push(
      diagnostic({
        severity: 'info',
        code: ErrorCodes.CONFIG_INVALID,
        message: 'No `site.baseUrl` set, so canonical links, sitemap.xml and rss.xml are skipped',
        path: 'site.baseUrl',
        source,
        hint: 'Set it before deploying, for example `https://your-domain.example`.',
      }),
    );
  }

  const counts = countDiagnostics(diagnostics);
  if (options.strict && counts.warnings > 0) {
    for (const entry of diagnostics) {
      if (entry.severity === 'warning') entry.severity = 'error';
    }
  }

  return { diagnostics, counts: countDiagnostics(diagnostics) };
}

/**
 * @param {string} src
 * @returns {boolean}
 */
function isRemote(src) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(src) || src.startsWith('//') || src.startsWith('data:');
}
