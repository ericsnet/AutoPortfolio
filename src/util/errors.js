/**
 * Error primitives and diagnostics.
 *
 * AutoPortfolio separates *diagnostics* (structured, user-facing problems with a
 * location, a severity and an optional hint) from *exceptions* (programming or
 * unrecoverable errors). Diagnostics are collected so that a single run reports
 * every problem in a file instead of stopping at the first one.
 *
 * @module util/errors
 */

/** @typedef {'error'|'warning'|'info'} Severity */

/**
 * @typedef {object} Diagnostic
 * @property {Severity} severity    How serious the problem is.
 * @property {string} code          Stable machine-readable code, e.g. `AP1012`.
 * @property {string} message       Human readable, one line, no trailing period.
 * @property {string} [path]        Dotted path inside the portfolio document (`projects.0.name`).
 * @property {string} [source]      File the problem was found in, if any.
 * @property {number} [line]        1-based line number in `source`.
 * @property {number} [column]      1-based column number in `source`.
 * @property {string} [hint]        Actionable suggestion for the user.
 * @property {string} [documentation] Link to further reading.
 */

/**
 * Stable diagnostic codes.
 *
 * The ranges are:
 * - `AP0xxx` internal / usage errors
 * - `AP1xxx` configuration parsing and loading
 * - `AP2xxx` portfolio data validation
 * - `AP3xxx` templates
 * - `AP4xxx` themes
 * - `AP5xxx` assets and export
 */
export const ErrorCodes = Object.freeze({
  // internal / usage
  INTERNAL: 'AP0001',
  INVALID_ARGUMENT: 'AP0002',
  UNSUPPORTED_VERSION: 'AP0003',
  NOT_IMPLEMENTED: 'AP0004',

  // configuration
  CONFIG_NOT_FOUND: 'AP1001',
  CONFIG_UNREADABLE: 'AP1002',
  CONFIG_SYNTAX: 'AP1003',
  CONFIG_UNSUPPORTED_FORMAT: 'AP1004',
  CONFIG_INVALID: 'AP1005',

  // data validation
  DATA_INVALID: 'AP2001',
  DATA_MISSING: 'AP2002',
  DATA_TYPE: 'AP2003',
  DATA_FORMAT: 'AP2004',
  DATA_UNKNOWN_KEY: 'AP2005',
  DATA_DUPLICATE: 'AP2006',
  DATA_EMPTY: 'AP2007',

  // templates
  TEMPLATE_NOT_FOUND: 'AP3001',
  TEMPLATE_SYNTAX: 'AP3002',
  TEMPLATE_RUNTIME: 'AP3003',
  TEMPLATE_MANIFEST: 'AP3004',
  TEMPLATE_MISSING_FILE: 'AP3005',
  TEMPLATE_INCOMPATIBLE: 'AP3006',

  // themes
  THEME_INVALID: 'AP4001',
  THEME_CONTRAST: 'AP4002',

  // assets / export
  ASSET_NOT_FOUND: 'AP5001',
  ASSET_UNSUPPORTED: 'AP5002',
  EXPORT_FAILED: 'AP5003',
  EXPORT_UNKNOWN_TARGET: 'AP5004',
});

/**
 * Error thrown for problems AutoPortfolio can detect and explain (missing
 * config, broken template syntax, unknown template, ...).
 *
 * The CLI catches these and prints them as a diagnostic, so they should always
 * carry a code and, when possible, a location and a hint.
 */
export class AutoPortfolioError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {string} [options.source]
   * @param {number} [options.line]
   * @param {number} [options.column]
   * @param {string} [options.hint]
   * @param {Severity} [options.severity]
   * @param {number} [options.exitCode]
   * @param {unknown} [options.cause]
   * @param {Diagnostic[]} [options.diagnostics]
   */
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AutoPortfolioError';
    /** @type {string} */
    this.code = options.code ?? ErrorCodes.INTERNAL;
    /** @type {string|undefined} */
    this.source = options.source;
    /** @type {number|undefined} */
    this.line = options.line;
    /** @type {number|undefined} */
    this.column = options.column;
    /** @type {string|undefined} */
    this.hint = options.hint;
    /** @type {Severity} */
    this.severity = options.severity ?? 'error';
    /** @type {number} */
    this.exitCode = options.exitCode ?? 1;
    /** @type {Diagnostic[]} */
    this.diagnostics = options.diagnostics ?? [];
  }

  /** @returns {Diagnostic} */
  toDiagnostic() {
    return {
      severity: this.severity,
      code: this.code,
      message: this.message,
      source: this.source,
      line: this.line,
      column: this.column,
      hint: this.hint,
    };
  }

  /**
   * @param {object} [context]
   * @param {string} [context.source]
   * @param {string} [context.text]
   * @returns {string}
   */
  format(context = {}) {
    return formatDiagnostic(this.toDiagnostic(), { text: context.text });
  }
}

/**
 * @param {unknown} value
 * @returns {value is AutoPortfolioError}
 */
export function isAutoPortfolioError(value) {
  return value instanceof AutoPortfolioError;
}

/**
 * Build a diagnostic object, dropping undefined keys so that serialised output
 * stays tidy.
 *
 * @param {Diagnostic} diagnostic
 * @returns {Diagnostic}
 */
export function diagnostic(diagnostic) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(diagnostic)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return /** @type {Diagnostic} */ (out);
}

/**
 * Sort diagnostics for stable output: errors first, then by file, line, column.
 * @param {Diagnostic[]} diagnostics
 */
export function sortDiagnostics(diagnostics) {
  const weight = { error: 0, warning: 1, info: 2 };
  return [...diagnostics].sort((a, b) => {
    if (weight[a.severity] !== weight[b.severity]) return weight[a.severity] - weight[b.severity];
    if ((a.source ?? '') !== (b.source ?? '')) return String(a.source).localeCompare(String(b.source));
    if ((a.line ?? 0) !== (b.line ?? 0)) return (a.line ?? 0) - (b.line ?? 0);
    if ((a.column ?? 0) !== (b.column ?? 0)) return (a.column ?? 0) - (b.column ?? 0);
    return a.message.localeCompare(b.message);
  });
}

/**
 * Count diagnostics by severity.
 * @param {Diagnostic[]} diagnostics
 * @returns {{errors: number, warnings: number, infos: number}}
 */
export function countDiagnostics(diagnostics) {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors += 1;
    else if (d.severity === 'warning') warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos };
}

/**
 * Render a source excerpt with a caret under the offending column, in the style
 * of a compiler:
 *
 * ```text
 * portfolio.yaml:12:9
 *   12 | projects:
 *      |   - name: ""
 *      |           ^ `name` must not be empty
 * ```
 *
 * @param {string} text Source text.
 * @param {number} line 1-based line number.
 * @param {number} [column] 1-based column number.
 * @param {object} [options]
 * @param {number} [options.context] Lines of context to show before/after.
 * @param {number} [options.width] Max characters of the source line to show.
 * @returns {string}
 */
export function codeFrame(text, line, column = 1, options = {}) {
  const lines = text.split(/\r\n|\r|\n/);
  const index = line - 1;
  if (index < 0 || index >= lines.length) return '';
  const context = options.context ?? 0;
  const width = options.width ?? 160;
  const gutter = String(line + context).length;
  const start = Math.max(0, index - context);
  const end = Math.min(lines.length - 1, index + context);
  /** @type {string[]} */
  const out = [];

  for (let i = start; i <= end; i += 1) {
    const raw = lines[i];
    const isTarget = i === index;
    const truncated = raw.length > width;
    const shown = truncated ? `${raw.slice(0, width)}…` : raw;
    const num = String(i + 1).padStart(gutter, ' ');
    out.push(`  ${num} | ${shown.replace(/\t/g, '  ')}`);
    if (isTarget) {
      const caretColumn = Math.max(1, Math.min(column, shown.length + 1));
      const caretPrefix = ' '.repeat(gutter + 3 + caretColumn - 1);
      out.push(`${caretPrefix}^`);
    }
  }
  return out.join('\n');
}

/**
 * Format a single diagnostic as a multi-line string (without colours).
 *
 * @param {Diagnostic} d
 * @param {object} [options]
 * @param {string} [options.text] Source text, used to render a code frame.
 * @param {boolean} [options.showHint]
 * @returns {string}
 */
export function formatDiagnostic(d, options = {}) {
  /** @type {string[]} */
  const parts = [];
  const location = [d.source, d.line, d.column].filter((v) => v !== undefined && v !== null);
  const head = `${d.severity}: ${d.message}`;
  parts.push(location.length ? `${location.join(':')} — ${head}` : head);
  if (d.text !== undefined && d.line !== undefined) {
    const frame = codeFrame(d.text, d.line, d.column ?? 1);
    if (frame) parts.push(frame);
  } else if (options.text && d.line !== undefined) {
    const frame = codeFrame(options.text, d.line, d.column ?? 1);
    if (frame) parts.push(frame);
  }
  if (d.hint && options.showHint !== false) parts.push(`  hint: ${d.hint}`);
  if (d.path) parts.push(`  at:  ${d.path}`);
  if (d.documentation) parts.push(`  docs: ${d.documentation}`);
  return parts.join('\n');
}

/**
 * Format a list of diagnostics, grouped and ordered.
 *
 * @param {Diagnostic[]} diagnostics
 * @param {object} [options]
 * @param {Record<string, string>} [options.sources] Map of file name to file text (for code frames).
 * @param {string} [options.indent]
 * @returns {string}
 */
export function formatDiagnostics(diagnostics, options = {}) {
  const ordered = sortDiagnostics(diagnostics);
  return ordered
    .map((d) => {
      const text = d.source ? options.sources?.[d.source] : undefined;
      return formatDiagnostic(d, { text });
    })
    .join('\n\n');
}

/**
 * Convert an unknown thrown value into a Diagnostic so that every failure path
 * produces something the user can act on.
 *
 * @param {unknown} error
 * @returns {Diagnostic}
 */
export function toDiagnosticObject(error) {
  if (isAutoPortfolioError(error)) return diagnostic(error.toDiagnostic());
  if (error instanceof Error) {
    return diagnostic({
      severity: 'error',
      code: ErrorCodes.INTERNAL,
      message: error.message,
      hint: 'This is likely a bug in AutoPortfolio. Re-run with --verbose for a stack trace.',
    });
  }
  return diagnostic({
    severity: 'error',
    code: ErrorCodes.INTERNAL,
    message: String(error),
  });
}
