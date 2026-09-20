/**
 * The `autoportfolio` command line interface.
 *
 * Commands stay thin: they parse arguments, call one library function, and
 * print the result. Everything they do is also available from
 * `import { ... } from 'autoportfolio'`.
 *
 * @module cli/main
 */

import path from 'node:path';
import process from 'node:process';
import { Logger } from '../util/logger.js';
import {
  AutoPortfolioError,
  ErrorCodes,
  countDiagnostics,
  formatDiagnostic,
  isAutoPortfolioError,
} from '../util/errors.js';
import { formatBytes } from '../util/fsx.js';
import { VERSION } from '../version.js';
import { loadProject, describeProject, isProjectDirectory, validateProject } from '../config/load.js';
import { generateSite } from '../generator/generator.js';
import { startPreviewServer } from '../preview/server.js';
import { listTemplates, loadTemplate } from '../templates/registry.js';
import { THEME_PRESETS, THEME_PRESET_NAMES } from '../theme/presets.js';
import { parseArgs, renderHelp, GLOBAL_OPTIONS } from './args.js';
import { scaffoldProject } from './scaffold.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

const PROGRAM = 'autoportfolio';

/**
 * Run the CLI.
 *
 * @param {string[]} argv          Arguments without `node` and the script path.
 * @param {{stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream}} [io]
 * @returns {Promise<number>} Exit code.
 */
export async function runCli(argv = process.argv.slice(2), io = {}) {
  const logger = new Logger({
    stream: io.stdout ?? process.stdout,
    ...(io.stderr ? { stream: io.stderr } : {}),
  });

  const command = argv[0];
  const rest = argv.slice(1);

  const globalFlags = new Set(['--help', '-h', '--version', '-v', '--verbose', '--quiet', '-q', '--no-color', '--json']);

  // `autoportfolio --version`, `autoportfolio --help`
  if (!command || command === 'help' || globalFlags.has(command)) {
    if (command === '--version' || command === '-v') {
      logger.info(VERSION);
      return EXIT_OK;
    }
    if (command === 'help' && rest[0]) return runCommand(rest[0], ['--help'], logger);
    logger.info(renderRootHelp());
    return EXIT_OK;
  }

  return runCommand(command, rest, logger);
}

/**
 * @param {string} command
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function runCommand(command, argv, logger) {
  switch (command) {
    case 'build':
      return commandBuild(argv, logger);
    case 'dev':
    case 'preview':
    case 'serve':
      return commandDev(argv, logger);
    case 'init':
    case 'new':
    case 'create':
      return commandInit(argv, logger);
    case 'validate':
    case 'check':
    case 'lint':
      return commandValidate(argv, logger);
    case 'info':
      return commandInfo(argv, logger);
    case 'templates':
    case 'themes':
      return commandList(command, argv, logger);
    case 'schema':
      return commandSchema(argv, logger);
    default:
      logger.error(`Unknown command \`${command}\``);
      logger.info('');
      logger.info(`Run \`${PROGRAM} --help\` to see the available commands.`);
      return EXIT_USAGE;
  }
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

const BUILD_OPTIONS = [
  ...GLOBAL_OPTIONS,
  { name: 'config', aliases: ['c'], placeholder: 'file', description: 'Path to the configuration file.' },
  { name: 'data', aliases: ['d'], placeholder: 'file', description: 'Path to the portfolio data file.' },
  { name: 'output', aliases: ['o', 'out', 'out-dir'], placeholder: 'dir', description: 'Override the output directory.' },
  { name: 'template', aliases: ['t'], placeholder: 'name', description: 'Override the template.' },
  { name: 'theme', placeholder: 'name', description: 'Override the theme preset.' },
  { name: 'mode', placeholder: 'auto|light|dark', description: 'Override the colour mode.' },
  { name: 'accent', placeholder: '#hex', description: 'Override the accent colour.' },
  { name: 'base-url', placeholder: 'url', description: 'Override the deployed base URL.' },
  { name: 'minify', type: 'boolean', description: 'Minify the generated HTML, CSS and JS.' },
  { name: 'no-minify', type: 'boolean', description: 'Never minify, even if configured.' },
  { name: 'strict', type: 'boolean', description: 'Treat warnings as errors.' },
  { name: 'clean', type: 'boolean', description: 'Remove the output directory before writing.' },
  { name: 'target', placeholder: 'name', description: 'Deployment target: static, github-pages, netlify, vercel, …' },
  { name: 'drafts', type: 'boolean', description: 'Include entries marked `draft: true`.' },
];

/**
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandBuild(argv, logger) {
  const { options, positionals } = parseArgs(argv, BUILD_OPTIONS);
  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Generate the static site from your portfolio data.',
        usage: `${PROGRAM} build [directory] [options]`,
        spec: BUILD_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);
  const started = Date.now();

  /** @type {any} */
  let project;
  try {
    project = await loadProject({
      cwd: positionals[0] ?? process.cwd(),
      config: options.config,
      data: options.data,
      ...loadOverrides(options),
    });
  } catch (error) {
    return reportError(error, logger, options);
  }

  // Diagnostics are collected twice — once while loading the project and once
  // while generating — so remember what has already been shown instead of
  // printing the same warning twice.
  const shown = new Set();
  const updateDiagnostics = (diagnostics) => {
    const overlay = mergeDiagnostics(project.diagnostics, diagnostics);
    printDiagnostics(
      overlay.filter((entry) => {
        const key = `${entry.severity}|${entry.code}|${entry.path ?? ''}|${entry.message}`;
        if (shown.has(key)) return false;
        shown.add(key);
        return true;
      }),
      logger,
      options,
    );
    return overlay;
  };

  updateDiagnostics([]);

  /** @type {any} */
  let result;
  try {
    result = await generateSite(project, {
      outDir: options.output,
      clean: options.clean,
      target: options.target,
      collectOutput: false,
      onProgress: (message) => logger.debug(message),
    });
  } catch (error) {
    return reportError(error, logger, options);
  }

  const diagnostics = updateDiagnostics(result.diagnostics);
  const counts = countDiagnostics(diagnostics);
  // `--strict` means "warnings are errors", as documented by the option. Notes
  // are never a failure: they describe things worth a look, not mistakes.
  const strictFailure = options.strict === true && counts.warnings > 0;

  if (options.json) {
    logger.info(
      JSON.stringify(
        {
          ok: counts.errors === 0 && !strictFailure,
          outDir: result.outDir,
          template: result.template,
          theme: result.theme,
          pages: result.pages,
          assets: result.assets,
          stats: result.stats,
          counts,
          diagnostics,
          durationMs: Date.now() - started,
        },
        null,
        2,
      ),
    );
  } else if (counts.errors === 0 && !strictFailure) {
    logger.success(
      `Built ${result.pages.length} page${result.pages.length === 1 ? '' : 's'} and ${result.assets.length} asset${
        result.assets.length === 1 ? '' : 's'
      } in ${formatDuration(Date.now() - started)}`,
    );
    logger.table([
      ['output', path.relative(process.cwd(), result.outDir) || '.'],
      ['template', `${result.template} · theme ${result.theme}`],
      ['size', formatBytes(result.stats.bytes ?? 0)],
    ]);
    if (!project.config.site.baseUrl) {
      logger.info('');
      logger.info(
        `  ${logger.paint('gray', 'hint')}  Set \`site.baseUrl\` before deploying so sitemap.xml and canonical links are correct.`,
      );
    }
  }

  if (strictFailure && !options.json) {
    logger.error(
      `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'} treated as ${counts.warnings === 1 ? 'an error' : 'errors'} because of \`--strict\``,
    );
    logger.info(`  ${logger.paint('gray', 'Fix them, or drop --strict to build anyway.')}`);
  }

  if (counts.errors > 0 || strictFailure) return EXIT_ERROR;
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// dev
// ---------------------------------------------------------------------------

const DEV_OPTIONS = [
  ...GLOBAL_OPTIONS,
  { name: 'config', aliases: ['c'], placeholder: 'file', description: 'Path to the configuration file.' },
  { name: 'data', aliases: ['d'], placeholder: 'file', description: 'Path to the portfolio data file.' },
  { name: 'port', aliases: ['p'], type: 'number', placeholder: '4173', description: 'Port to listen on.' },
  { name: 'host', placeholder: 'host', description: 'Address to bind (default 0.0.0.0).' },
  { name: 'no-watch', type: 'boolean', description: 'Serve once without watching for changes.' },
  { name: 'open', type: 'boolean', description: 'Open the preview in your browser.' },
  { name: 'template', aliases: ['t'], placeholder: 'name', description: 'Override the template.' },
  { name: 'theme', placeholder: 'name', description: 'Override the theme preset.' },
];

/**
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandDev(argv, logger) {
  const { options, positionals } = parseArgs(argv, DEV_OPTIONS);
  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Start a live preview that rebuilds when your content changes.',
        usage: `${PROGRAM} dev [directory] [options]`,
        spec: DEV_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);
  const cwd = positionals[0] ?? process.cwd();

  if (!(await isProjectDirectory(cwd))) {
    logger.error(`No AutoPortfolio project found in ${cwd}`);
    logger.info(`  Run \`${PROGRAM} init\` to create one, or \`${PROGRAM} dev path/to/project\`.`);
    return EXIT_ERROR;
  }

  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : undefined);

  let server;
  try {
    server = await startPreviewServer({
      cwd,
      config: options.config,
      port: port ? Number(port) : undefined,
      host: options.host,
      watch: !options['no-watch'],
      template: options.template,
      theme: options.theme,
      onLog: (message) => logger.debug(message),
      onDiagnostics: (diagnostics) => {
        const counts = countDiagnostics(diagnostics);
        for (const diagnostic of diagnostics) {
          if (diagnostic.severity === 'error') logger.error(formatDiagnostic(diagnostic));
          else if (diagnostic.severity === 'warning') logger.warn(formatDiagnostic(diagnostic));
          else logger.debug(formatDiagnostic(diagnostic));
        }
        if (counts.errors === 0) {
          logger.success(`rebuilt — ${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
        }
      },
    });
  } catch (error) {
    return reportError(error, logger, options);
  }

  const url = options.host && options.host !== '0.0.0.0' ? server.url : `http://localhost:${server.port}`;
  logger.info('');
  logger.info(`  ${logger.paint('bold', 'AutoPortfolio')} ${logger.paint('gray', `v${VERSION}`)}`);
  logger.info(`  ${logger.paint('cyan', url)}`);
  logger.info(`  ${logger.paint('gray', 'watching for changes — press Ctrl+C to stop')}`);
  logger.info('');

  if (options.open) openInBrowser(url).catch(() => {});

  await new Promise((resolve) => {
    const shutdown = async () => {
      logger.info('');
      logger.debug('shutting down');
      await server.close().catch(() => {});
      resolve(undefined);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });

  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

const INIT_OPTIONS = [
  ...GLOBAL_OPTIONS,
  { name: 'template', aliases: ['t'], placeholder: 'name', description: 'Template to start with (default modern).' },
  { name: 'theme', placeholder: 'name', description: 'Theme preset to start with (default default).' },
  { name: 'name', placeholder: 'name', description: 'Your name, written into the starter data.' },
  { name: 'title', placeholder: 'title', description: 'Page title for the starter data.' },
  { name: 'accent', placeholder: '#hex', description: 'Accent colour.' },
  { name: 'minimal', type: 'boolean', description: 'Scaffold a shorter portfolio.yaml.' },
  { name: 'ci', type: 'boolean', description: 'Add a GitHub Actions workflow that deploys to GitHub Pages.' },
  { name: 'force', aliases: ['f'], type: 'boolean', description: 'Overwrite existing files.' },
];

/**
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandInit(argv, logger) {
  const { options, positionals } = parseArgs(argv, INIT_OPTIONS);
  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Create a new AutoPortfolio project.',
        usage: `${PROGRAM} init [directory] [options]`,
        spec: INIT_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);
  const directory = positionals[0] ?? '.';

  const templates = (await listTemplates()).map((template) => template.name);
  if (options.template && !templates.includes(options.template)) {
    logger.error(`Unknown template \`${options.template}\`. Available: ${templates.join(', ')}`);
    return EXIT_USAGE;
  }
  if (options.theme && !THEME_PRESET_NAMES.includes(options.theme)) {
    logger.error(`Unknown theme \`${options.theme}\`. Available: ${THEME_PRESET_NAMES.join(', ')}`);
    return EXIT_USAGE;
  }

  try {
    const result = await scaffoldProject({
      directory,
      template: options.template,
      theme: options.theme,
      accent: options.accent,
      name: options.name,
      title: options.title,
      minimal: options.minimal,
      withCi: options.ci,
      force: options.force,
    });

    const project = await loadProject({ cwd: directory });
    const diagnostics = [...project.diagnostics, ...(await validateProject(project)).diagnostics];
    const counts = countDiagnostics(diagnostics);

    logger.success(`Created ${result.files.length} file${result.files.length === 1 ? '' : 's'} in ${path.relative(process.cwd(), path.resolve(directory)) || '.'}`);
    for (const file of result.files) logger.info(`    ${logger.paint('gray', file)}`);
    for (const file of result.skipped) logger.info(`    ${logger.paint('gray', `${file} (kept)`)}`);

    if (counts.errors > 0) {
      logger.info('');
      printDiagnostics(diagnostics, logger, options);
    }

    logger.info('');
    logger.info('  Next steps');
    logger.info(`    ${logger.paint('cyan', `${PROGRAM} dev${directory === '.' ? '' : ` ${directory}`}`)}   start the live preview`);
    logger.info(`    ${logger.paint('cyan', `${PROGRAM} build`)}         write the static site to dist/`);
    return EXIT_OK;
  } catch (error) {
    return reportError(error, logger, options);
  }
}

// ---------------------------------------------------------------------------
// validate / info / lists
// ---------------------------------------------------------------------------

const VALIDATE_OPTIONS = [
  ...GLOBAL_OPTIONS,
  { name: 'config', aliases: ['c'], placeholder: 'file', description: 'Path to the configuration file.' },
  { name: 'data', aliases: ['d'], placeholder: 'file', description: 'Path to the portfolio data file.' },
  { name: 'strict', type: 'boolean', description: 'Treat warnings as errors.' },
];

/**
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandValidate(argv, logger) {
  const { options, positionals } = parseArgs(argv, VALIDATE_OPTIONS);
  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Check the configuration and portfolio data without building.',
        usage: `${PROGRAM} validate [directory] [options]`,
        spec: VALIDATE_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);

  /** @type {any} */
  let project;
  try {
    project = await loadProject({
      cwd: positionals[0] ?? process.cwd(),
      config: options.config,
      data: options.data,
    });
    const diagnostics = [...project.diagnostics, ...(await validateProject(project)).diagnostics];
    const counts = countDiagnostics(diagnostics);

    if (options.json) {
      logger.info(JSON.stringify({ ok: counts.errors === 0, counts, diagnostics }, null, 2));
    } else {
      printDiagnostics(diagnostics, logger, options);
      if (counts.errors === 0) {
        const label = `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`;
        logger.success(`${project.data.profile?.name ?? 'portfolio'} is valid — ${label}`);
        logger.table(describeProject(project));
      }
    }

    if (counts.errors > 0) return EXIT_ERROR;
    if (options.strict && counts.warnings > 0) return EXIT_ERROR;
    return EXIT_OK;
  } catch (error) {
    return reportError(error, logger, options);
  }
}

/**
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandInfo(argv, logger) {
  const { options, positionals } = parseArgs(argv, [
    ...GLOBAL_OPTIONS,
    { name: 'config', aliases: ['c'], placeholder: 'file', description: 'Path to the configuration file.' },
    { name: 'data', aliases: ['d'], placeholder: 'file', description: 'Path to the portfolio data file.' },
  ]);
  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Show the resolved project: files, template, theme, and content counts.',
        usage: `${PROGRAM} info [directory] [options]`,
        spec: GLOBAL_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);
  const cwd = positionals[0] ?? process.cwd();

  if (!options.config && !options.data && !(await isProjectDirectory(cwd))) {
    logger.error(`No AutoPortfolio project found in ${cwd}`);
    logger.info(`  Run \`${PROGRAM} init\` to create one.`);
    return EXIT_ERROR;
  }

  try {
    const project = await loadProject({ cwd, config: options.config, data: options.data });
    const result = {
      version: VERSION,
      root: project.root,
      files: project.files,
      data: {
        name: project.data.profile?.name ?? null,
        projects: project.data.projects.length,
        experience: project.data.experience.length,
        education: project.data.education.length,
        skills: project.data.skills.length,
        certifications: project.data.certifications.length,
        customSections: project.data.sections.length,
      },
      template: project.config.template,
      theme: project.config.theme,
      build: project.config.build,
      site: project.config.site,
      diagnostics: project.diagnostics,
    };
    if (options.json) {
      logger.info(JSON.stringify(result, null, 2));
      return EXIT_OK;
    }

    logger.info(`${logger.paint('bold', 'AutoPortfolio')} ${logger.paint('gray', `v${VERSION}`)}`);
    logger.info('');
    logger.info(logger.paint('gray', 'project'));
    logger.table([
      ['root', path.relative(process.cwd(), project.root) || '.'],
      ['config', path.relative(process.cwd(), project.configPath ?? '') || '(defaults)'],
      ['data', path.relative(process.cwd(), project.dataPath) || project.dataPath],
      ['output', path.join(path.relative(process.cwd(), project.root) || '.', project.config.build.output)],
    ]);
    logger.info('');
    logger.info(logger.paint('gray', 'content'));
    logger.table(describeProject(project).slice(5));
    logger.info('');
    logger.info(logger.paint('gray', 'presentation'));
    logger.table([
      ['template', project.config.template],
      ['theme', `${project.config.theme.preset} · ${project.config.theme.mode} · accent ${project.config.theme.accent ?? 'preset'}`],
      ['typography', `${project.config.theme.typography.heading} / ${project.config.theme.typography.body}`],
    ]);
    return EXIT_OK;
  } catch (error) {
    return reportError(error, logger, options);
  }
}

/**
 * Print the JSON Schema for the portfolio document or the configuration, so
 * editors can offer completion and validation for both files.
 *
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandSchema(argv, logger) {
  const { options, positionals } = parseArgs(argv, [...GLOBAL_OPTIONS]);

  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'Print the JSON Schema for editor integration.',
        usage: `${PROGRAM} schema [portfolio|config]`,
        spec: GLOBAL_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  const which = (positionals[0] ?? 'portfolio').toLowerCase();
  if (!['portfolio', 'config', 'data'].includes(which)) {
    logger.error(`Unknown schema \`${which}\`. Use \`portfolio\` or \`config\`.`);
    return EXIT_USAGE;
  }

  const { configJsonSchema, portfolioJsonSchema } = await import('../schema/json-schema.js');
  logger.info(JSON.stringify(which === 'config' ? configJsonSchema() : portfolioJsonSchema(), null, 2));
  return EXIT_OK;
}

/**
 * @param {string} command
 * @param {string[]} argv
 * @param {Logger} logger
 * @returns {Promise<number>}
 */
async function commandList(command, argv, logger) {
  const { options, positionals } = parseArgs(argv, [...GLOBAL_OPTIONS]);
  const what = command === 'themes' ? 'themes' : positionals[0] === 'themes' ? 'themes' : 'templates';

  if (options.help) {
    logger.info(
      renderHelp({
        summary: 'List the available templates or themes.',
        usage: `${PROGRAM} templates | ${PROGRAM} themes [name]`,
        spec: GLOBAL_OPTIONS,
      }),
    );
    return EXIT_OK;
  }

  configureLogger(logger, options);

  if (what === 'themes') {
    const name = positionals[0];
    if (name) {
      const preset = THEME_PRESETS[name];
      if (!preset) {
        logger.error(`Unknown theme \`${name}\`. Available: ${THEME_PRESET_NAMES.join(', ')}`);
        return EXIT_USAGE;
      }
      if (options.json) {
        logger.info(JSON.stringify(preset, null, 2));
        return EXIT_OK;
      }
      logger.info(`${logger.paint('bold', preset.label ?? name)}${preset.description ? ` — ${preset.description}` : ''}`);
      logger.table([
        ['accent', preset.colors.light.accent],
        ['accent (dark)', preset.colors.dark.accent],
        ['background', preset.colors.light.background],
        ['background (dark)', preset.colors.dark.background],
        ['radius', preset.radius ?? 'md'],
        ['spacing', preset.spacing ?? 'comfortable'],
        ['typography', [preset.typography?.heading, preset.typography?.body].filter(Boolean).join(' / ') || '—'],
      ]);
      return EXIT_OK;
    }

    const rows = THEME_PRESET_NAMES.map((themeName) => [
      themeName,
      `${THEME_PRESETS[themeName].description ?? ''} ${logger.paint('gray', `accent ${THEME_PRESETS[themeName].colors.light.accent}`)}`.trim(),
    ]);
    if (options.json) {
      logger.info(JSON.stringify(THEME_PRESETS, null, 2));
      return EXIT_OK;
    }
    logger.info(logger.paint('gray', 'Set the theme in autoportfolio.config.yaml:'));
    logger.info('');
    logger.table(rows);
    return EXIT_OK;
  }

  const templates = await listTemplates();
  const requested = positionals[0];

  if (requested) {
    try {
      const template = await loadTemplate(requested);
      if (options.json) {
        logger.info(JSON.stringify({ manifest: template.manifest, files: template.files }, null, 2));
        return EXIT_OK;
      }
      logger.info(`${logger.paint('bold', template.manifest.name)} — ${template.manifest.description ?? ''}`);
      logger.table([
        ['version', template.manifest.version ?? '1.0.0'],
        ['author', template.manifest.author ?? '—'],
        ['sections', (template.manifest.partials?.sections ?? []).join(', ') || '(shared defaults)'],
        ['options', Object.keys(template.manifest.options ?? {}).join(', ') || '—'],
        ['files', String(template.files.length)],
      ]);
      return EXIT_OK;
    } catch (error) {
      logger.error(`Unknown template \`${requested}\`. Available: ${templates.map((t) => t.name).join(', ')}`);
      if (options.verbose) logger.debug(String(error));
      return EXIT_USAGE;
    }
  }

  if (options.json) {
    logger.info(JSON.stringify(templates, null, 2));
    return EXIT_OK;
  }

  logger.info(logger.paint('gray', 'Set the template in autoportfolio.config.yaml:'));
  logger.info('');
  logger.table(templates.map((template) => [template.name, template.description ?? '']));
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Command line flags that override configuration values, in the shape
 * `loadProject` understands.
 *
 * @param {Record<string, any>} options
 * @returns {Record<string, any>}
 */
function loadOverrides(options) {
  /** @type {Record<string, any>} */
  const overrides = {};
  if (options.template) overrides.template = options.template;
  if (options.baseUrl) overrides.baseUrl = options.baseUrl;
  if (options.mode) overrides.mode = options.mode;
  if (options.accent) overrides.accent = options.accent;
  if (options.theme) overrides.theme = options.theme;
  if (options.output) overrides.output = options.output;
  if (options.minify) overrides.minify = true;
  if (options['no-minify']) overrides.minify = false;
  if (options.strict) overrides.strict = true;
  if (options.drafts) overrides.drafts = true;
  return overrides;
}

/**
 * @param {Logger} logger
 * @param {Record<string, any>} options
 */
function configureLogger(logger, options) {
  if (options.quiet) logger.level = 'error';
  else if (options.verbose) logger.level = 'debug';
  if (options.color === false || options.noColor) logger.color = false;
}

/**
 * @param {Diagnostic[]} base
 * @param {Diagnostic[]} extra
 * @returns {Diagnostic[]}
 */
function mergeDiagnostics(base, extra) {
  const seen = new Set();
  /** @type {Diagnostic[]} */
  const merged = [];
  for (const diagnostic of [...(base ?? []), ...(extra ?? [])]) {
    const key = `${diagnostic.code}|${diagnostic.path ?? ''}|${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(diagnostic);
  }
  return merged;
}

/**
 * @param {Diagnostic[]} diagnostics
 * @param {Logger} logger
 * @param {Record<string, any>} options
 */
function printDiagnostics(diagnostics, logger, options) {
  if (!diagnostics.length || options.json) return;
  for (const diagnostic of diagnostics) {
    const text = formatDiagnostic(diagnostic);
    if (diagnostic.severity === 'error') logger.error(text);
    else if (diagnostic.severity === 'warning') logger.warn(text);
    else logger.debug(text);
  }
}

/**
 * @param {unknown} error
 * @param {Logger} logger
 * @param {Record<string, any>} options
 * @returns {number}
 */
function reportError(error, logger, options) {
  if (options.json) {
    logger.info(
      JSON.stringify(
        {
          ok: false,
          error: isAutoPortfolioError(error) && error.toDiagnostic ? error.toDiagnostic() : { message: String(error) },
        },
        null,
        2,
      ),
    );
    return EXIT_ERROR;
  }

  if (isAutoPortfolioError(error)) {
    logger.error(error.message);
    if (error.hint) logger.info(`  ${logger.paint('gray', error.hint)}`);
    if (error.location?.file) {
      logger.info(`  ${logger.paint('gray', `at ${error.location.file}${error.location.line ? `:${error.location.line}` : ''}`)}`);
    }
    if (options.verbose && error.cause) logger.debug(String(error.cause));
    else if (options.verbose) logger.debug(error.stack ?? '');
    return error.code === ErrorCodes.INVALID_ARGUMENT ? EXIT_USAGE : EXIT_ERROR;
  }

  logger.error(error instanceof Error ? error.message : String(error));
  if (options.verbose && error instanceof Error) logger.debug(error.stack ?? '');
  else logger.info(`  ${logger.paint('gray', 'Run again with --verbose for a stack trace.')}`);
  return EXIT_ERROR;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openInBrowser(url) {
  const { spawn } = await import('node:child_process');
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  await new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    child.on('error', () => resolve(undefined));
    child.on('close', () => resolve(undefined));
    child.unref();
  });
}

/**
 * @returns {string}
 */
function renderRootHelp() {
  return `${PROGRAM} ${VERSION} — turn one YAML file into a fast, accessible portfolio site.

Usage: ${PROGRAM} <command> [options]

Commands:
  init [directory]     Create a new project (config, data, assets, CI workflow)
  build [directory]    Generate the static site
  dev [directory]      Live preview with rebuild on change
  validate [directory] Check the configuration and data without building
  info [directory]     Show the resolved project
  templates [name]     List the available templates
  themes [name]        List the available theme presets
  schema [what]        Print the JSON Schema (portfolio | config)
  help <command>       Show help for a command

Global options:
  -h, --help           Show help
  -v, --version        Print the version
      --verbose        Print debug information
  -q, --quiet          Only print errors
      --no-color       Disable coloured output
      --json           Print machine readable output

Examples:
  ${PROGRAM} init my-portfolio --template developer --ci
  ${PROGRAM} dev my-portfolio
  ${PROGRAM} build my-portfolio --strict --minify

Docs: https://github.com/Pickeric/AutoPortfolio`;
}

export { describeProject };
