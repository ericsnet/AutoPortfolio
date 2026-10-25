/**
 * Tiny ANSI-aware logger.
 *
 * Output is intentionally minimal: no dependencies, no spinners in non-TTY
 * environments, and colours disabled by `NO_COLOR`/`--no-color`/non-TTY.
 *
 * @module util/logger
 */

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
};

/** @typedef {'silent'|'error'|'warn'|'info'|'debug'} LogLevel */

/** @type {Record<LogLevel, number>} */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

/**
 * @typedef {object} LoggerOptions
 * @property {LogLevel} [level]
 * @property {boolean} [color]
 * @property {NodeJS.WriteStream|{write(chunk: string): unknown}} [stream]
 */

export class Logger {
  /** @param {LoggerOptions} [options] */
  constructor(options = {}) {
    /** @type {LogLevel} */
    this.level = options.level ?? 'info';
    /** @type {boolean} */
    this.color =
      options.color ??
      Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb');
    /** @type {NodeJS.WriteStream|{write(chunk: string): unknown}} */
    this.stream = options.stream ?? process.stdout;
    /** @type {NodeJS.WriteStream|{write(chunk: string): unknown}} */
    this.errStream =
      options.stream ?? (/** @type {NodeJS.WriteStream} */ (process.stderr).isTTY ? process.stderr : process.stdout);
  }

  /**
   * @param {string} name
   * @param {string} text
   * @returns {string}
   */
  paint(name, text) {
    if (!this.color) return text;
    const code = ANSI[/** @type {keyof typeof ANSI} */ (name)];
    return code ? `${code}${text}${ANSI.reset}` : text;
  }

  /**
   * @param {LogLevel} level
   * @returns {boolean}
   */
  enabled(level) {
    return LEVELS[level] <= LEVELS[this.level];
  }

  /** @param {...unknown} args */
  write(...args) {
    this.stream.write(args.map(String).join(' '));
  }

  /** @param {string} [message] */
  info(message = '') {
    if (this.enabled('info')) this.write(`${message}\n`);
  }

  /** @param {string} [message] */
  warn(message = '') {
    if (this.enabled('warn')) this.errStream.write(`${this.paint('yellow', 'warning')} ${message}\n`);
  }

  /** @param {string} [message] */
  error(message = '') {
    if (this.enabled('error')) this.errStream.write(`${this.paint('red', 'error')} ${message}\n`);
  }

  /** @param {string} [message] */
  success(message = '') {
    if (this.enabled('info')) this.stream.write(`${this.paint('green', '✓')} ${message}\n`);
  }

  /** @param {string} [message] */
  step(message = '') {
    if (this.enabled('info')) this.stream.write(`${this.paint('cyan', '→')} ${message}\n`);
  }

  /** @param {string} [message] */
  debug(message = '') {
    if (this.enabled('debug')) this.stream.write(`${this.paint('gray', `[debug] ${message}`)}\n`);
  }

  /**
   * Render a simple aligned list of `label: value` rows.
   * @param {Array<[string, string]>} rows
   */
  table(rows) {
    const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);
    for (const [label, value] of rows) {
      this.write(`  ${this.paint('gray', label.padEnd(width))}  ${value}\n`);
    }
  }
}

/** @type {Logger} */
export const defaultLogger = new Logger();
