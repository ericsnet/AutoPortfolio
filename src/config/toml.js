/**
 * A small TOML parser.
 *
 * AutoPortfolio reads YAML by default and JSON for tooling, but TOML is offered
 * because it is pleasant for configuration. The subset implemented here covers
 * everything a portfolio document needs: tables, arrays of tables, dotted keys,
 * all string flavours, arrays, inline tables and the numeric/boolean scalars.
 *
 * Local dates and times are returned as strings on purpose — a portfolio date
 * like `2021-04` must not become a `Date` object.
 *
 * @module config/toml
 */

import { ErrorCodes } from '../util/errors.js';
import { normalizeNewlines } from '../util/text.js';

export class TomlError extends Error {
  /**
   * @param {string} message
   * @param {number} line
   * @param {number} column
   */
  constructor(message, line, column) {
    super(message);
    this.name = 'TomlError';
    this.code = ErrorCodes.CONFIG_SYNTAX;
    this.line = line;
    this.column = column;
  }
}

/**
 * @param {string} source
 * @returns {any}
 */
export function parseToml(source) {
  const parser = new TomlParser(normalizeNewlines(source));
  return parser.parse();
}

class TomlParser {
  /** @param {string} source */
  constructor(source) {
    this.source = source;
    this.length = source.length;
    this.index = 0;
    this.line = 1;
    this.column = 1;
    /** @type {Record<string, any>} */
    this.root = {};
    /** @type {Record<string, any>} */
    this.current = this.root;
    /** @type {Set<string>} */
    this.definedTables = new Set();
    /** @type {Set<string>} */
    this.explicitArrays = new Set();
  }

  parse() {
    while (this.index < this.length) {
      this.skipWhitespaceAndComments(true);
      if (this.index >= this.length) break;
      const char = this.source[this.index];
      if (char === '[') {
        this.parseTableHeader();
        continue;
      }
      this.parseKeyValue();
      this.skipWhitespaceAndComments(false);
      this.expectNewline();
    }
    return this.root;
  }

  /** @param {boolean} includeNewlines */
  skipWhitespaceAndComments(includeNewlines) {
    while (this.index < this.length) {
      const char = this.source[this.index];
      if (char === ' ' || char === '\t' || char === '\r' || (includeNewlines && char === '\n')) {
        this.advance();
        continue;
      }
      if (char === '#') {
        while (this.index < this.length && this.source[this.index] !== '\n') this.advance();
        continue;
      }
      break;
    }
  }

  advance(count = 1) {
    for (let step = 0; step < count; step += 1) {
      if (this.source[this.index] === '\n') {
        this.line += 1;
        this.column = 1;
      } else {
        this.column += 1;
      }
      this.index += 1;
    }
  }

  expectNewline() {
    if (this.index >= this.length) return;
    const char = this.source[this.index];
    if (char === '\n') {
      this.advance();
      return;
    }
    if (char === '\r') {
      this.advance();
      return;
    }
    this.error(`Expected a new line but found ${JSON.stringify(char)}`);
  }

  /** @param {string} message */
  error(message) {
    throw new TomlError(message, this.line, this.column);
  }

  parseTableHeader() {
    this.advance(); // [
    let isArray = false;
    if (this.source[this.index] === '[') {
      isArray = true;
      this.advance();
    }
    this.skipWhitespaceAndComments(false);
    const path = this.parseKeyPath(']');
    this.skipWhitespaceAndComments(false);
    if (this.source[this.index] !== ']') this.error('Unterminated table header');
    this.advance();
    if (isArray) {
      if (this.source[this.index] !== ']') this.error('Unterminated array-of-tables header');
      this.advance();
    }
    this.definedTables.add(path.join('\u0000'));

    let target = this.root;
    for (let position = 0; position < path.length; position += 1) {
      const key = path[position];
      const isLast = position === path.length - 1;
      const existing = target[key];
      if (isLast && isArray) {
        if (existing === undefined) target[key] = [];
        if (!Array.isArray(target[key])) this.error(`Cannot redefine \`${path.join('.')}\` as an array of tables`);
        /** @type {Record<string, any>} */
        const entry = {};
        target[key].push(entry);
        target = entry;
      } else if (isLast) {
        if (existing === undefined) target[key] = {};
        if (Array.isArray(target[key])) {
          target = target[key][target[key].length - 1];
        } else if (typeof target[key] === 'object' && target[key] !== null) {
          target = target[key];
        } else {
          this.error(`Cannot redefine \`${path.join('.')}\` as a table`);
        }
      } else {
        if (existing === undefined) target[key] = {};
        if (Array.isArray(target[key])) target = target[key][target[key].length - 1];
        else if (typeof target[key] === 'object' && target[key] !== null) target = target[key];
        else this.error(`Cannot redefine \`${key}\` as a table`);
      }
    }
    this.current = target;
  }

  parseKeyValue() {
    const path = this.parseKeyPath('=');
    this.skipWhitespaceAndComments(false);
    if (this.source[this.index] !== '=') this.error('Expected `=` after key');
    this.advance();
    this.skipWhitespaceAndComments(false);
    const value = this.parseValue();

    let target = this.current;
    for (let position = 0; position < path.length - 1; position += 1) {
      const key = path[position];
      if (target[key] === undefined) target[key] = {};
      if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
        this.error(`Key \`${key}\` is already defined and cannot be extended`);
      }
      target = target[key];
    }
    const last = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(target, last)) this.error(`Duplicate key \`${last}\``);
    target[last] = value;
  }

  /** @param {string} terminator */
  /**
   * @param {string} terminator
   * @returns {string[]}
   */
  parseKeyPath(terminator) {
    /** @type {string[]} */
    const path = [];
    for (;;) {
      this.skipWhitespaceAndComments(false);
      const char = this.source[this.index];
      if (char === '"' || char === "'") {
        path.push(this.parseQuotedString());
      } else {
        let end = this.index;
        while (end < this.length && /[A-Za-z0-9_-]/.test(this.source[end])) end += 1;
        if (end === this.index) this.error('Expected a key');
        path.push(this.source.slice(this.index, end));
        this.advance(end - this.index);
      }
      this.skipWhitespaceAndComments(false);
      if (this.source[this.index] === '.') {
        this.advance();
        continue;
      }
      break;
    }
    if (this.source[this.index] !== terminator && !(terminator === ']' && this.source[this.index] === '.')) {
      this.error(`Expected \`${terminator}\``);
    }
    return path;
  }

  /** @returns {any} */
  parseValue() {
    const char = this.source[this.index];
    if (char === undefined) this.error('Unexpected end of input, expected a value');
    if (char === '"' || char === "'") return this.parseQuotedString();
    if (char === '[') return this.parseArray();
    if (char === '{') return this.parseInlineTable();
    if (this.source.startsWith('true', this.index)) {
      this.advance(4);
      return true;
    }
    if (this.source.startsWith('false', this.index)) {
      this.advance(5);
      return false;
    }
    return this.parseScalar();
  }

  /** @returns {string} */
  parseQuotedString() {
    const quote = this.source[this.index];
    const triple = this.source.startsWith(quote.repeat(3), this.index);
    if (triple) this.advance(3);
    else this.advance();

    let result = '';
    for (;;) {
      if (this.index >= this.length) this.error('Unterminated string');
      const char = this.source[this.index];

      if (triple) {
        if (this.source.startsWith(quote.repeat(3), this.index)) {
          this.advance(3);
          return result.replace(/^\n/, '');
        }
      } else if (char === '\n') {
        this.error('Unterminated string');
      } else if (char === quote) {
        this.advance();
        return result;
      }

      if (quote === '"' && char === '\\') {
        result += this.parseEscape();
        continue;
      }
      result += char;
      this.advance();
    }
  }

  /** @returns {string} */
  parseEscape() {
    this.advance(); // backslash
    const char = this.source[this.index];
    const simple = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', b: '\b', f: '\f' };
    if (char in simple) {
      this.advance();
      return simple[/** @type {keyof typeof simple} */ (char)];
    }
    if (char === 'u' || char === 'U') {
      const length = char === 'u' ? 4 : 8;
      const hex = this.source.slice(this.index + 1, this.index + 1 + length);
      this.advance(1 + length);
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    if (char === '\n') {
      // Line-ending backslash: trim the following whitespace.
      this.advance();
      this.skipWhitespaceAndComments(true);
      return '';
    }
    this.error(`Unknown escape sequence \\${char}`);
    return '';
  }

  /** @returns {any[]} */
  parseArray() {
    this.advance(); // [
    /** @type {any[]} */
    const items = [];
    for (;;) {
      this.skipWhitespaceAndComments(true);
      if (this.source[this.index] === ']') {
        this.advance();
        return items;
      }
      items.push(this.parseValue());
      this.skipWhitespaceAndComments(true);
      if (this.source[this.index] === ',') {
        this.advance();
        continue;
      }
      if (this.source[this.index] === ']') {
        this.advance();
        return items;
      }
      this.error('Expected `,` or `]` in array');
    }
  }

  /** @returns {Record<string, any>} */
  parseInlineTable() {
    this.advance(); // {
    /** @type {Record<string, any>} */
    const table = {};
    for (;;) {
      this.skipWhitespaceAndComments(false);
      if (this.source[this.index] === '}') {
        this.advance();
        return table;
      }
      const path = this.parseKeyPath('=');
      this.skipWhitespaceAndComments(false);
      if (this.source[this.index] !== '=') this.error('Expected `=` in inline table');
      this.advance();
      this.skipWhitespaceAndComments(false);
      const value = this.parseValue();
      let target = table;
      for (const key of path.slice(0, -1)) {
        if (target[key] === undefined) target[key] = {};
        target = target[key];
      }
      target[path[path.length - 1]] = value;
      this.skipWhitespaceAndComments(false);
      if (this.source[this.index] === ',') {
        this.advance();
        continue;
      }
      if (this.source[this.index] === '}') {
        this.advance();
        return table;
      }
      this.error('Expected `,` or `}` in inline table');
    }
  }

  /** @returns {string|number|boolean} */
  parseScalar() {
    let end = this.index;
    while (end < this.length && !',]}\n#'.includes(this.source[end])) end += 1;
    const raw = this.source.slice(this.index, end).trim();
    this.advance(Math.max(0, end - this.index));
    if (!raw) this.error('Expected a value');

    if (raw === 'inf' || raw === '+inf') return Infinity;
    if (raw === '-inf') return -Infinity;
    if (raw === 'nan' || raw === '+nan' || raw === '-nan') return Number.NaN;

    const cleaned = raw.replace(/_/g, '');
    if (/^[+-]?0x[0-9a-fA-F]+$/.test(cleaned)) return Number.parseInt(cleaned, 16);
    if (/^[+-]?0o[0-7]+$/.test(cleaned)) return Number.parseInt(cleaned.replace(/^[+-]?0o/, '').replace(/^(-?)/, '$1'), 8);
    if (/^[+-]?0b[01]+$/.test(cleaned)) return Number.parseInt(cleaned.replace(/^[+-]?0b/, ''), 2);
    if (/^[+-]?\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
    if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(cleaned) && /[.eE]/.test(cleaned)) {
      return Number.parseFloat(cleaned);
    }

    // Local dates/times and offset date-times are kept as strings.
    if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) return raw;
    if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) return raw;

    this.error(`Invalid TOML value \`${raw}\``);
    return raw;
  }
}
