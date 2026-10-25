#!/usr/bin/env node
/**
 * `npm run demo`
 *
 * Builds the example project once per shipped template, into a temporary
 * directory, and prints a comparison. It is a smoke test with a nicer report: it
 * fails loudly if any template stops rendering, and it exercises the loading,
 * validation, theming, generation and export stages through their public API
 * rather than through the CLI.
 *
 * Nothing is written into the repository. Pass `--keep <dir>` to keep the output.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { loadProject } from '../src/config/load.js';
import { generateSite } from '../src/generator/generator.js';
import { listTemplates } from '../src/templates/registry.js';
import { formatBytes } from '../src/util/fsx.js';
import { countDiagnostics, formatDiagnostic } from '../src/util/errors.js';
import { VERSION } from '../src/version.js';

const EXAMPLE_DIR = path.resolve(import.meta.dirname, '..', 'examples', 'developer');

/**
 * Minimal ANSI colouring, disabled when the output is not a terminal or when
 * `NO_COLOR` is set, matching the CLI's behaviour.
 */
const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;
/** @param {number} code @param {string} text */
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = (/** @type {string} */ text) => paint(1, text);
const dim = (/** @type {string} */ text) => paint(2, text);
const green = (/** @type {string} */ text) => paint(32, text);
const red = (/** @type {string} */ text) => paint(31, text);

/**
 * Pad a string to a visible width, ignoring ANSI escapes.
 * @param {string} text
 * @param {number} width
 * @param {'left'|'right'} [align]
 */
function pad(text, width, align = 'left') {
  const visible = text.replace(/\u001b\[[0-9;]*m/g, '');
  const filler = ' '.repeat(Math.max(0, width - visible.length));
  return align === 'right' ? filler + text : text + filler;
}

/**
 * Print a two-column table.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 */
function table(headers, rows) {
  /** @type {string[][]} */
  const cells = rows.map((row) => row.map((cell) => String(cell)));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((row) => row[index].replace(/\u001b\[[0-9;]*m/g, '').length)),
  );

  /**
   * @param {string[]} cells
   * @returns {string}
   */
  const line = (cells) =>
    '  ' +
    cells
      .map((cell, index) => pad(cell, widths[index], index === 0 ? 'left' : 'right'))
      .join('  ');

  console.log(line(headers.map((header) => dim(header))));
  console.log('  ' + widths.map((width) => dim('─'.repeat(width))).join('  '));
  for (const row of cells) console.log(line(row));
}

/**
 * @param {string[]} argv
 * @returns {{keep: string|null, templates: string[]|null}}
 */
function parseArgs(argv) {
  let keep = null;
  let templates = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--keep') {
      keep = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--templates') {
      templates = String(argv[index + 1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npm run demo [-- options]

  --keep <dir>            Keep the generated sites in <dir>.
  --templates <a,b>       Only build the named templates.

Builds the example project with every available template and prints a summary.
`);
      process.exit(0);
    }
  }
  return { keep, templates };
}

async function main() {
  const { keep, templates: requested } = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(`  ${bold('AutoPortfolio')} ${dim(`v${VERSION}`)}  ${dim('·')}  building the example project`);
  console.log(`  ${dim(EXAMPLE_DIR)}`);
  console.log('');

  const available = (await listTemplates()).map((template) => template.name);
  const templates = requested ?? available;
  const unknown = templates.filter((name) => !available.includes(name));
  if (unknown.length) {
    console.error(`  ${red('Unknown template(s):')} ${unknown.join(', ')}`);
    console.error(`  ${dim(`Available: ${available.join(', ')}`)}`);
    process.exitCode = 1;
    return;
  }

  const project = await loadProject({ cwd: EXAMPLE_DIR });
  const loadCounts = countDiagnostics(project.diagnostics);
  console.log(
    `  Loaded ${bold(project.data.profile?.name ?? 'portfolio')} — ` +
      `${project.data.projects.length} projects, ${project.data.experience.length} roles, ` +
      `${project.data.skills.length} skills ` +
      dim(`(${loadCounts.errors} errors, ${loadCounts.warnings} warnings)`),
  );
  console.log('');

  const root = keep
    ? path.resolve(keep)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'autoportfolio-demo-'));
  await fs.mkdir(root, { recursive: true });

  /** @type {Array<{template: string, pages: number, assets: number, bytes: number, ms: number, ok: boolean}>} */
  const results = [];
  let failed = false;

  for (const template of templates) {
    project.config.template = template;
    const started = Date.now();
    try {
      const result = await generateSite(project, {
        outDir: path.join(root, template),
        clean: true,
      });
      const errors = result.diagnostics.filter((entry) => entry.severity === 'error');
      if (errors.length) {
        failed = true;
        console.log(`  ${red('✗')} ${bold(template)}`);
        for (const error of errors) console.log(`      ${formatDiagnostic(error)}`);
        results.push({ template, pages: 0, assets: 0, bytes: 0, ms: Date.now() - started, ok: false });
        continue;
      }
      results.push({
        template,
        pages: result.pages.length,
        assets: result.assets.length,
        bytes: result.stats?.bytes ?? 0,
        ms: Date.now() - started,
        ok: true,
      });
    } catch (error) {
      failed = true;
      console.log(`  ${red('✗')} ${bold(template)} — ${/** @type {Error} */ (error).message}`);
      results.push({ template, pages: 0, assets: 0, bytes: 0, ms: Date.now() - started, ok: false });
    }
  }

  console.log('  ' + bold('Build results'));
  console.log('');
  table(
    ['template', 'pages', 'assets', 'size', 'time'],
    results.map((result) => [
      result.ok ? result.template : red(result.template),
      result.pages,
      result.assets,
      formatBytes(result.bytes),
      `${result.ms} ms`,
    ]),
  );
  console.log('');

  if (!failed) {
    // Read one page back to prove the output is real HTML rather than an empty
    // directory with the right file names in it.
    const sample = path.join(root, templates[0], 'index.html');
    const html = await fs.readFile(sample, 'utf8').catch(() => '');
    const hasTitle = /<title>/.test(html);
    const hasMain = /<main[\s>]/.test(html);
    const sections = (html.match(/<section[\s>]/g) ?? []).length;
    console.log(
      `  ${green('✓')} ${templates.length} template${templates.length === 1 ? '' : 's'} built, ` +
        `${sections} sections rendered on the first page` +
        (hasTitle && hasMain ? '' : ` ${red('(missing title or main landmark)')}`),
    );
  } else {
    console.log(`  ${red('✗')} one or more templates failed to build`);
  }

  if (keep) {
    console.log(`  ${dim(`output kept in ${root}`)}`);
  } else {
    await fs.rm(root, { recursive: true, force: true });
    console.log(`  ${dim('temporary output removed')}`);
  }
  console.log('');

  if (failed) process.exitCode = 1;
}

await main();
