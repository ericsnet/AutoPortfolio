/**
 * Format detection and parsing for configuration and portfolio documents.
 *
 * `parseDocument` is the only place in AutoPortfolio that turns text into a
 * JavaScript value. It normalises the error reporting of the three supported
 * formats (YAML, JSON, TOML) into a single `AutoPortfolioError` carrying a line
 * and column, so the CLI can always print a code frame.
 *
 * @module config/parse
 */

import path from 'node:path';
import { AutoPortfolioError, ErrorCodes } from '../util/errors.js';
import { readTextOrNull } from '../util/fsx.js';
import { parseYaml, YamlError } from './yaml.js';
import { parseToml, TomlError } from './toml.js';

/** @typedef {'yaml'|'json'|'toml'} DataFormat */

/** @type {Record<string, DataFormat>} */
const EXTENSIONS = {
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.jsonc': 'json',
  '.toml': 'toml',
};

/**
 * @param {string} file
 * @param {DataFormat} [explicit]
 * @returns {DataFormat}
 */
export function detectFormat(file, explicit) {
  if (explicit) return explicit;
  const extension = path.extname(file).toLowerCase();
  const format = EXTENSIONS[extension];
  if (format) return format;
  throw new AutoPortfolioError(`Unsupported file format \`${extension || '(none)'}\``, {
    code: ErrorCodes.CONFIG_UNSUPPORTED_FORMAT,
    source: file,
    hint: 'Use `.yaml`, `.yml`, `.json` or `.toml`.',
  });
}

/**
 * Parse a document from a string.
 *
 * @param {string} text
 * @param {object} options
 * @param {string} options.source  Path shown in diagnostics.
 * @param {DataFormat} [options.format]
 * @returns {any}
 */
export function parseDocument(text, options) {
  const format = detectFormat(options.source, options.format);
  try {
    if (format === 'yaml') return parseYaml(text);
    if (format === 'toml') return parseToml(text);
    return parseJson(text, options.source);
  } catch (error) {
    throw normalizeParseError(error, options.source, text);
  }
}

/**
 * Read and parse a document from disk.
 *
 * @param {string} file
 * @param {object} [options]
 * @param {DataFormat} [options.format]
 * @returns {Promise<{value: any, text: string, format: DataFormat}>}
 */
export async function readDocument(file, options = {}) {
  const text = await readTextOrNull(file);
  if (text === null) {
    throw new AutoPortfolioError(`Cannot read \`${file}\``, {
      code: ErrorCodes.CONFIG_NOT_FOUND,
      source: file,
      hint: 'Check the path and that the file exists.',
    });
  }
  const format = detectFormat(file, options.format);
  return { value: parseDocument(text, { source: file, format }), text, format };
}

/**
 * JSON with a friendlier error message. Trailing commas and comments are
 * rejected, but the message points at the exact position.
 *
 * @param {string} text
 * @param {string} source
 * @returns {any}
 */
export function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = /position (\d+)/.exec(message);
    let line;
    let column;
    if (position) {
      const index = Number(position[1]);
      const before = text.slice(0, index);
      line = before.split('\n').length;
      column = index - before.lastIndexOf('\n');
    }
    const explicit = /\(line (\d+) column (\d+)\)/.exec(message);
    if (explicit) {
      line = Number(explicit[1]);
      column = Number(explicit[2]);
    }
    throw new AutoPortfolioError(`Invalid JSON: ${cleanJsonMessage(message)}`, {
      code: ErrorCodes.CONFIG_SYNTAX,
      source,
      line,
      column,
      hint: 'JSON does not allow comments or trailing commas.',
    });
  }
}

/**
 * @param {string} message
 * @returns {string}
 */
function cleanJsonMessage(message) {
  return message.replace(/^JSON\.parse: /, '').replace(/ in JSON at position \d+.*$/, '');
}

/**
 * @param {unknown} error
 * @param {string} source
 * @param {string} text
 * @returns {AutoPortfolioError}
 */
function normalizeParseError(error, source, text) {
  if (error instanceof YamlError) {
    return new AutoPortfolioError(`Invalid YAML: ${error.message}`, {
      code: ErrorCodes.CONFIG_SYNTAX,
      source,
      line: error.line,
      column: error.column,
      hint: error.hint ?? 'Check the indentation and that every `key:` has a value or a nested block.',
      cause: error,
    });
  }
  if (error instanceof TomlError) {
    return new AutoPortfolioError(`Invalid TOML: ${error.message}`, {
      code: ErrorCodes.CONFIG_SYNTAX,
      source,
      line: error.line,
      column: error.column,
      cause: error,
    });
  }
  if (error instanceof AutoPortfolioError) return error;
  const fallback = new AutoPortfolioError(error instanceof Error ? error.message : String(error), {
    code: ErrorCodes.CONFIG_SYNTAX,
    source,
    cause: error,
  });
  // Attach the text so callers that want a code frame still can.
  Object.defineProperty(fallback, 'text', { value: text, enumerable: false });
  return fallback;
}
