/**
 * AutoPortfolio's public API.
 *
 * The CLI is a thin wrapper around exactly these functions, so anything the
 * command line does can be done from a script, a test or another tool:
 *
 * ```js
 * import { loadProject, generateSite } from 'autoportfolio';
 *
 * const project = await loadProject({ cwd: 'examples/developer' });
 * const result = await generateSite(project, { outDir: 'public' });
 * console.log(result.pages.length, 'pages');
 * ```
 *
 * The layers below this file are deliberately importable as well
 * (`autoportfolio/templates`, `autoportfolio/themes`, …) so that an advanced
 * setup can reach the template engine or the validator without going through
 * the generator.
 *
 * @module index
 */

export { VERSION, GENERATOR, HOMEPAGE } from './version.js';

// --- loading ---------------------------------------------------------------
export {
  loadProject,
  findConfigFile,
  isProjectDirectory,
  describeProject,
  validateProject,
} from './config/load.js';
export { parseDocument, readDocument, detectFormat } from './config/parse.js';
export { parseYaml } from './config/yaml.js';
export { parseToml } from './config/toml.js';

// --- schema ----------------------------------------------------------------
export {
  portfolioSchema,
  DATA_VERSION,
  SECTION_LABELS,
  SECTION_COLLECTIONS,
  SKILL_LEVELS,
  EMPLOYMENT_TYPES,
  PROJECT_STATUS,
  AVAILABILITY,
  PROFICIENCY,
  SECTION_LAYOUTS,
} from './schema/portfolio-schema.js';
export { configSchema, DEFAULT_CONFIG_FILENAMES, BUILTIN_SECTIONS } from './schema/config-schema.js';
export { validateDocument, validateValue } from './schema/validate.js';
export { toJsonSchema, portfolioJsonSchema, configJsonSchema } from './schema/json-schema.js';

// --- model -----------------------------------------------------------------
export { normalizePortfolio, normalizeConfig, normalizeImage, normalizeLinks } from './model/normalize.js';
export { checkPortfolio } from './model/semantic.js';
export { buildSections, SECTION_BUILDERS, DEFAULT_SECTION_ORDER, projectView } from './model/sections.js';
export { buildViewModel } from './model/view-model.js';
export { createFormatter, initials, prettyUrl, siteTitleAndDescription } from './model/format.js';
export { fileToUrl, urlToFile, relativeUrl, absoluteUrl, normalizeBaseUrl } from './model/urls.js';
export { findHost, HOSTS } from './model/hosts.js';

// --- presentation ----------------------------------------------------------
export { listTemplates, loadTemplate, BUILTIN_DIR } from './templates/registry.js';
export { compileTemplate } from './template/engine.js';
export { createRuntime } from './template/runtime.js';
export { THEME_PRESETS, THEME_PRESET_NAMES, getPreset, hasPreset } from './theme/presets.js';
export { resolveTheme, themeToCss, resolveFontStack, FONT_STACKS } from './theme/theme.js';
export { createHelpers, registerHelpers } from './generator/helpers.js';
export { renderMarkdown, renderInlineMarkdown, markdownToText } from './util/markdown.js';

// --- generation & export ---------------------------------------------------
export { generateSite, planProjectPages } from './generator/generator.js';
export { collectImageReferences, planAssetCopies, createMonogramFavicon, createSocialCard } from './generator/assets.js';
export { buildStructuredData, buildProjectStructuredData } from './generator/structured-data.js';
export { applyExportTarget, EXPORT_TARGETS, EXPORT_TARGET_NAMES, getExportTarget } from './export/index.js';
export { startPreviewServer } from './preview/server.js';

// --- diagnostics -----------------------------------------------------------
export {
  AutoPortfolioError,
  ErrorCodes,
  countDiagnostics,
  formatDiagnostic,
  formatDiagnostics,
  sortDiagnostics,
} from './util/errors.js';
export { Logger, defaultLogger } from './util/logger.js';
export { minifyHtml, minifyCss, minifyJs } from './util/minify.js';
