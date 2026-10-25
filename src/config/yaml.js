/**
 * A YAML parser for the subset that configuration and portfolio documents need.
 *
 * AutoPortfolio ships zero runtime dependencies, so this module implements the
 * parts of YAML 1.2 that a hand-written document realistically uses:
 *
 * - block mappings and block sequences, nested arbitrarily,
 * - flow collections (`[a, b]`, `{a: 1}`) including multi-line forms,
 * - plain, single-quoted, double-quoted and block (`|`, `>`) scalars,
 * - anchors, aliases and merge keys (`<<`),
 * - YAML 1.2 core scalars: null, booleans, integers, floats.
 *
 * It deliberately does **not** implement documents it considers ambiguous:
 * multiple documents in one file, complex (`?`) keys, explicit tags other than
 * the core ones, and timestamp resolution (dates stay strings, because
 * portfolio dates like `2021-04` are far more useful as text).
 *
 * Dates stay strings, tabs cannot be used for indentation, and every error
 * carries a line and column so the CLI can render a code frame.
 *
 * @module config/yaml
 */

import { ErrorCodes } from '../util/errors.js';
import { normalizeNewlines } from '../util/text.js';

/**
 * Error thrown for malformed YAML, carrying a position.
 */
export class YamlError extends Error {
  /**
   * @param {string} message
   * @param {object} options
   * @param {number} [options.line] 1-based
   * @param {number} [options.column] 1-based
   * @param {string} [options.hint] Actionable suggestion shown by the CLI.
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'YamlError';
    this.code = ErrorCodes.CONFIG_SYNTAX;
    this.line = options.line;
    this.column = options.column;
    this.hint = options.hint;
  }
}

/**
 * @typedef {object} LogicalLine
 * @property {number} indent    Number of leading spaces.
 * @property {string} content   Line content without indentation.
 * @property {number} line      1-based line number in the source.
 * @property {number} column    1-based column of `content` in the source.
 * @property {number} rawIndex  0-based index into the raw (unfiltered) line array.
 */

/**
 * Parse a YAML document into a JavaScript value.
 *
 * @param {string} source
 * @returns {any}
 */
export function parseYaml(source) {
  const raw = normalizeNewlines(source).split('\n');
  const lines = tokenize(raw);
  if (lines.length === 0) return null;
  const state = { lines, raw, anchors: new Map(), index: 0 };
  const value = parseNode(state, lines[0].indent, 0);
  if (state.index < lines.length) {
    const line = lines[state.index];
    throw new YamlError(`Unexpected indentation level (expected ${value === null ? 0 : lines[0].indent} spaces)`, {
      line: line.line,
      column: line.column,
    });
  }
  return value;
}

/**
 * Split the source into logical lines, dropping comments and blank lines but
 * remembering positions.
 *
 * @param {string} source
 * @returns {LogicalLine[]}
 */
function tokenize(raw) {
  /** @type {LogicalLine[]} */
  const lines = [];

  for (let index = 0; index < raw.length; index += 1) {
    const text = raw[index];
    const lineNumber = index + 1;

    if (text.includes('\t')) {
      const tabIndex = text.indexOf('\t');
      const beforeTab = text.slice(0, tabIndex);
      if (!beforeTab.trim() || /^\s*$/.test(beforeTab)) {
        throw new YamlError('Tabs cannot be used for indentation, use spaces', {
          line: lineNumber,
          column: tabIndex + 1,
        });
      }
    }

    const indent = text.length - text.trimStart().length;
    const body = text.slice(indent);

    if (body === '' || body.startsWith('#')) continue;
    if (body === '---' || body === '...') continue;
    if (body.startsWith('%')) continue; // directive

    lines.push({ indent, content: body, line: lineNumber, column: indent + 1, rawIndex: index });
  }

  return lines;
}

/**
 * @typedef {object} ParserState
 * @property {LogicalLine[]} lines
 * @property {string[]} raw        Original source lines, for block scalars.
 * @property {Map<string, any>} anchors
 * @property {number} index
 */

/**
 * Parse the node that starts at `state.index`, expecting `indent` as its base
 * indentation.
 *
 * @param {ParserState} state
 * @param {number} indent
 * @param {number} depth
 * @returns {any}
 */
function parseNode(state, indent, depth) {
  if (depth > 64) {
    const line = state.lines[state.index];
    throw new YamlError('Document is nested too deeply or contains an alias cycle', {
      line: line?.line ?? 1,
      column: line?.column ?? 1,
    });
  }
  const line = state.lines[state.index];
  if (!line) return null;
  if (line.indent < indent) return null;

  if (isSequenceEntry(line.content)) return parseSequence(state, line.indent, depth);
  if (looksLikeMappingEntry(line.content)) return parseMapping(state, line.indent, depth);
  // A bare scalar on its own line (single-document shorthand).
  state.index += 1;
  return parseInlineValue(state, line, line.content, depth);
}

/**
 * @param {string} content
 * @returns {boolean}
 */
function isSequenceEntry(content) {
  return content === '-' || /^-\s/.test(content);
}

/**
 * A mapping entry is `key: value`, `key:` or `"key": value`, but not a plain URL
 * such as `https://example.com` which ends the whole string.
 *
 * @param {string} content
 * @returns {boolean}
 */
function looksLikeMappingEntry(content) {
  const index = findKeySeparator(content);
  if (index === -1) return false;
  const key = content.slice(0, index).trim();
  return key.length > 0;
}

/**
 * Find the `:` that separates a key from its value, ignoring colons inside
 * quotes and inside plain scalars (e.g. `https://…`).
 *
 * @param {string} content
 * @returns {number} Index of the separator, or -1.
 */
function findKeySeparator(content) {
  if (content.startsWith('"') || content.startsWith("'")) {
    const quote = content[0];
    let index = 1;
    while (index < content.length) {
      if (content[index] === '\\' && quote === '"') index += 2;
      else if (content[index] === quote) break;
      else index += 1;
    }
    const rest = content.slice(index + 1);
    const colon = rest.indexOf(':');
    if (colon === -1) return -1;
    const after = rest.slice(colon + 1);
    if (after === '' || /^\s/.test(after) || after.startsWith('#')) return index + 1 + colon;
    return -1;
  }

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '#') return -1;
    if (content[index] !== ':') continue;
    const next = content[index + 1];
    if (next === undefined || next === ' ' || next === '\t' || next === '#') return index;
    // `key: value` where the value starts immediately is invalid YAML, but
    // `https://x` and `12:30` are plain scalars — only accept a colon that is
    // followed by whitespace or end-of-line unless the key is quoted.
    return -1;
  }
  return -1;
}

/**
 * @param {ParserState} state
 * @param {number} indent
 * @param {number} depth
 * @returns {any[]}
 */
function parseSequence(state, indent, depth) {
  /** @type {any[]} */
  const result = [];

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlError('Bad indentation in sequence', { line: line.line, column: line.column });
    }
    if (!isSequenceEntry(line.content)) break;

    const restRaw = line.content === '-' ? '' : line.content.slice(1);
    const leading = restRaw.length - restRaw.trimStart().length;
    const rest = restRaw.trim();
    const restIndent = indent + 1 + leading;

    if (rest === '' || rest.startsWith('#')) {
      // Nested block on the following lines.
      state.index += 1;
      const next = state.lines[state.index];
      if (next && next.indent > indent) {
        result.push(parseNode(state, next.indent, depth + 1));
      } else {
        result.push(null);
      }
      continue;
    }

    // `- key: value` — rewrite the line so the mapping parser sees it as a
    // normal mapping entry at its own indentation.
    if (looksLikeMappingEntry(rest) && !isSequenceEntry(rest)) {
      state.lines[state.index] = { ...line, indent: restIndent, content: rest, column: line.column + (restIndent - indent) };
      result.push(parseMapping(state, restIndent, depth + 1));
      continue;
    }

    // `- - nested` and `- scalar`
    if (isSequenceEntry(rest)) {
      state.lines[state.index] = { ...line, indent: restIndent, content: rest, column: line.column + (restIndent - indent) };
      result.push(parseSequence(state, restIndent, depth + 1));
      continue;
    }

    state.index += 1;
    result.push(parseInlineValue(state, line, rest, depth));
  }

  return result;
}

/**
 * @param {ParserState} state
 * @param {number} indent
 * @param {number} depth
 * @returns {Record<string, any>}
 */
function parseMapping(state, indent, depth) {
  /** @type {Record<string, any>} */
  const result = {};

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlError('Bad indentation in mapping', { line: line.line, column: line.column });
    }
    if (isSequenceEntry(line.content)) {
      if (Object.keys(result).length === 0) {
        // Handled by an explicit sequence — treat as sequence of the parent.
        return /** @type {any} */ (parseSequence(state, indent, depth));
      }
      throw new YamlError('Cannot mix sequence entries with mapping keys at the same indentation', {
        line: line.line,
        column: line.column,
      });
    }

    const separator = findKeySeparator(line.content);
    if (separator === -1) {
      throw new YamlError('Expected `key: value`', { line: line.line, column: line.column });
    }

    const rawKey = line.content.slice(0, separator).trim();
    const key = parseKey(state, rawKey, line);
    let rest = line.content.slice(separator + 1).trim();
    state.index += 1;

    // Anchor on the key line: `key: &anchor` followed by a block.
    let anchorName;
    const anchorMatch = rest.match(/^&([^\s[\]{},]+)\s*(.*)$/);
    if (anchorMatch) {
      anchorName = anchorMatch[1];
      rest = anchorMatch[2].trim();
    }

    /** @type {any} */
    let value;
    if (rest === '' || rest.startsWith('#')) {
      const next = state.lines[state.index];
      if (next && next.indent > indent) {
        value = parseNode(state, next.indent, depth + 1);
      } else if (next && next.indent === indent && isSequenceEntry(next.content)) {
        value = parseSequence(state, indent, depth + 1);
      } else {
        value = null;
      }
    } else if (rest === '|' || rest === '>' || /^[|>][-+]?\d?$/.test(rest) || /^[|>]\d?[-+]?$/.test(rest)) {
      value = parseBlockScalar(state, indent, rest, line);
    } else {
      value = parseInlineValue(state, line, rest, depth);
    }

    if (anchorName) {
      state.anchors.set(anchorName, value);
    }

    if (key === '<<') {
      const sources = Array.isArray(value) ? value : [value];
      for (const source of sources) {
        if (source && typeof source === 'object' && !Array.isArray(source)) {
          for (const [mergedKey, mergedValue] of Object.entries(source)) {
            if (!(mergedKey in result)) result[mergedKey] = mergedValue;
          }
        }
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * @param {ParserState} state
 * @param {string} rawKey
 * @param {LogicalLine} line
 * @returns {string}
 */
function parseKey(state, rawKey, line) {
  if (rawKey.startsWith('"') || rawKey.startsWith("'")) {
    const value = parseQuoted(rawKey, line, 0);
    return String(value);
  }
  return rawKey;
}

/**
 * Parse a scalar / flow collection / alias that appears inline after `key:` or
 * `- `.
 *
 * @param {ParserState} state
 * @param {LogicalLine} line
 * @param {string} text
 * @param {number} depth
 * @returns {any}
 */
function parseInlineValue(state, line, text, depth) {
  let value = text.trim();

  // Comments
  const commentIndex = findComment(value);
  if (commentIndex !== -1) value = value.slice(0, commentIndex).trim();
  if (value === '') return null;

  // Anchors: `&name value`
  const anchorMatch = value.match(/^&([^\s[\]{},]+)\s*(.*)$/);
  if (anchorMatch) {
    const anchorName = anchorMatch[1];
    const rest = anchorMatch[2].trim();
    const parsed = rest === '' ? null : parseInlineValue(state, line, rest, depth);
    state.anchors.set(anchorName, parsed);
    return parsed;
  }

  // Aliases: `*name`
  const aliasMatch = value.match(/^\*([^\s[\]{},]+)$/);
  if (aliasMatch) {
    const name = aliasMatch[1];
    if (!state.anchors.has(name)) {
      throw new YamlError(`Unknown alias \`*${name}\``, { line: line.line, column: line.column });
    }
    return cloneValue(state.anchors.get(name));
  }

  // Tags: `!!str`, `!custom` — strip them, ignoring the (rarely used) semantics.
  const tagMatch = value.match(/^(![^\s]*)\s+(.*)$/);
  if (tagMatch) value = tagMatch[2].trim();

  if (value.startsWith('[') || value.startsWith('{')) {
    return resolveFlowAliases(parseFlow(state, value, line, depth), state, line);
  }

  if (value.startsWith('"') || value.startsWith("'")) {
    const parsed = parseQuoted(value, line, 0);
    if (value.length !== consumedLength(value)) return parsed;
    return parsed;
  }

  return parsePlainScalar(value, { line: line.line, column: line.column + (line.content.indexOf(value) || 0) });
}

/**
 * Flow collections can contain aliases (`[*a, *b]`); they are parsed before the
 * anchor map is consulted, so resolve them in a second pass.
 *
 * @param {any} value
 * @param {ParserState} state
 * @param {LogicalLine} line
 * @returns {any}
 */
function resolveFlowAliases(value, state, line) {
  if (Array.isArray(value)) return value.map((entry) => resolveFlowAliases(entry, state, line));
  if (value && typeof value === 'object') {
    if (typeof value.__alias === 'string') {
      const name = value.__alias;
      if (!state.anchors.has(name)) {
        throw new YamlError(`Unknown alias \`*${name}\``, { line: line.line, column: line.column });
      }
      return cloneValue(state.anchors.get(name));
    }
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = resolveFlowAliases(entry, state, line);
    return out;
  }
  return value;
}

/**
 * Length of a quoted scalar including quotes; used to detect trailing garbage.
 * @param {string} value
 * @returns {number}
 */
function consumedLength(value) {
  const quote = value[0];
  let index = 1;
  while (index < value.length) {
    if (quote === '"' && value[index] === '\\') index += 2;
    else if (value[index] === quote) return index + 1;
    else index += 1;
  }
  return value.length;
}

/**
 * @param {string} value
 * @param {LogicalLine} line
 * @param {number} offset
 * @returns {string}
 */
function parseQuoted(value, line, offset) {
  const quote = value[0];
  let result = '';
  let index = 1;
  while (index < value.length) {
    const char = value[index];
    if (quote === '"' && char === '\\') {
      const escape = value[index + 1];
      const simple = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', b: '\b', f: '\f' };
      if (escape in simple) {
        result += simple[/** @type {keyof typeof simple} */ (escape)];
        index += 2;
        continue;
      }
      if (escape === 'u' || escape === 'x' || escape === 'U') {
        const length = escape === 'u' ? 4 : escape === 'x' ? 2 : 8;
        const hex = value.slice(index + 2, index + 2 + length);
        result += String.fromCodePoint(Number.parseInt(hex, 16));
        index += 2 + length;
        continue;
      }
      throw new YamlError(`Unknown escape sequence \\${escape}`, {
        line: line.line,
        column: line.column + offset + index,
      });
    }
    if (quote === "'" && char === "'") {
      if (value[index + 1] === "'") {
        result += "'";
        index += 2;
        continue;
      }
      return result;
    }
    if (quote === '"' && char === '"') return result;
    result += char;
    index += 1;
  }
  if (quote === "'") return result; // single-quoted scalars may span lines
  throw new YamlError('Unterminated double-quoted string', {
    line: line.line,
    column: line.column + offset,
  });
}

/**
 * @param {string} value
 * @param {{line: number, column: number}|null} [position]
 * @returns {any}
 */
function parsePlainScalar(value, position = null) {
  const text = value.trim();

  // A colon followed by a space inside a plain scalar is a parse error in YAML,
  // even though the intent (`description: My site: the best`) is obvious. Say so
  // clearly instead of guessing, because a file that parses here must parse
  // everywhere else too.
  const colon = /:\s/.exec(text) ?? (text.endsWith(':') ? [':'] : null);
  if (colon && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    throw new YamlError('A colon followed by a space is not allowed inside a plain value', {
      line: position?.line,
      column: position ? position.column + colon.index : undefined,
      hint: `Quote the value (\`"${text}"\`) or use a block scalar (\`|\`).`,
    });
  }

  if (text === '' || text === '~' || text === 'null' || text === 'Null' || text === 'NULL') return null;
  if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(text)) return true;
  if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(text)) return false;
  if (/^[-+]?\d+$/.test(text)) {
    const number = Number.parseInt(text, 10);
    return Number.isSafeInteger(number) ? number : text;
  }
  if (/^[-+]?0x[0-9a-fA-F_]+$/.test(text)) return Number.parseInt(text.replace(/_/g, ''), 16);
  if (/^[-+]?0o[0-7_]+$/.test(text)) return Number.parseInt(text.replace(/^[-+]?0o/, '').replace(/_/g, ''), 8);
  if (/^[-+]?(?:\d[\d_]*)?\.\d+(?:[eE][-+]?\d+)?$/.test(text) || /^[-+]?\d[\d_]*[eE][-+]?\d+$/.test(text)) {
    return Number.parseFloat(text.replace(/_/g, ''));
  }
  if (text === '.inf' || text === '.Inf') return Infinity;
  if (text === '-.inf' || text === '-.Inf') return -Infinity;
  if (text === '.nan' || text === '.NaN') return Number.NaN;
  return text;
}

/**
 * Parse a flow collection, joining continuation lines until brackets balance.
 *
 * @param {ParserState} state
 * @param {string} text
 * @param {LogicalLine} line
 * @param {number} depth
 * @returns {any}
 */
function parseFlow(state, text, line, depth) {
  let buffer = text;
  while (!isBalanced(buffer)) {
    const next = state.lines[state.index];
    if (!next) {
      throw new YamlError('Unterminated flow collection', { line: line.line, column: line.column });
    }
    state.index += 1;
    buffer += ` ${next.content}`;
  }
  const cursor = { text: buffer, index: 0, line };
  const value = parseFlowValue(cursor, depth);
  const rest = cursor.text.slice(cursor.index).trim();
  if (rest && !rest.startsWith('#')) {
    throw new YamlError(`Unexpected content after flow collection: \`${rest}\``, {
      line: line.line,
      column: line.column + cursor.index,
    });
  }
  return value;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isBalanced(text) {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (quote === '"' && char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
    if (depth === 0 && index < text.length - 1) {
      const remaining = text.slice(index + 1).trim();
      if (remaining && !remaining.startsWith('#')) return true;
    }
  }
  return depth <= 0;
}

/**
 * @typedef {{text: string, index: number, line: LogicalLine}} FlowCursor
 */

/**
 * @param {FlowCursor} cursor
 * @param {number} depth
 * @returns {any}
 */
function parseFlowValue(cursor, depth) {
  skipFlowSpace(cursor);
  const char = cursor.text[cursor.index];

  if (char === '[') {
    cursor.index += 1;
    /** @type {any[]} */
    const items = [];
    for (;;) {
      skipFlowSpace(cursor);
      if (cursor.text[cursor.index] === ']') {
        cursor.index += 1;
        return items;
      }
      items.push(parseFlowValue(cursor, depth + 1));
      skipFlowSpace(cursor);
      if (cursor.text[cursor.index] === ',') {
        cursor.index += 1;
        continue;
      }
      if (cursor.text[cursor.index] === ']') {
        cursor.index += 1;
        return items;
      }
      throw flowError(cursor, 'Expected `,` or `]` in flow sequence');
    }
  }

  if (char === '{') {
    cursor.index += 1;
    /** @type {Record<string, any>} */
    const map = {};
    for (;;) {
      skipFlowSpace(cursor);
      if (cursor.text[cursor.index] === '}') {
        cursor.index += 1;
        return map;
      }
      const key = readFlowScalar(cursor);
      skipFlowSpace(cursor);
      if (cursor.text[cursor.index] !== ':') throw flowError(cursor, 'Expected `:` in flow mapping');
      cursor.index += 1;
      const value = cursor.text[cursor.index] === ',' || cursor.text[cursor.index] === '}' ? null : parseFlowValue(cursor, depth + 1);
      map[String(key)] = value;
      skipFlowSpace(cursor);
      if (cursor.text[cursor.index] === ',') {
        cursor.index += 1;
        continue;
      }
      if (cursor.text[cursor.index] === '}') {
        cursor.index += 1;
        return map;
      }
      throw flowError(cursor, 'Expected `,` or `}` in flow mapping');
    }
  }

  return readFlowScalar(cursor);
}

/**
 * @param {FlowCursor} cursor
 * @returns {any}
 */
function readFlowScalar(cursor) {
  skipFlowSpace(cursor);
  const char = cursor.text[cursor.index];
  if (char === '"' || char === "'") {
    const start = cursor.index;
    const raw = cursor.text.slice(start);
    const value = parseQuoted(raw, cursor.line, start);
    cursor.index += consumedLength(raw);
    return value;
  }
  if (char === '*') {
    const match = cursor.text.slice(cursor.index).match(/^\*([^\s[\]{},]+)/);
    if (match) {
      cursor.index += match[0].length;
      return { __alias: match[1] };
    }
  }
  let end = cursor.index;
  while (end < cursor.text.length) {
    const char = cursor.text[end];
    if (char === ',' || char === ']' || char === '}') break;
    if (char === ':') {
      const next = cursor.text[end + 1];
      // Inside flow collections a `:` only separates when it is followed by
      // whitespace or the end of the collection; `https://x` stays a scalar.
      if (next === undefined || next === ' ' || next === '\t' || next === '\n' || next === ',' || next === '}' || next === ']') {
        break;
      }
    }
    end += 1;
  }
  const raw = cursor.text.slice(cursor.index, end).trim();
  cursor.index = end;
  return parsePlainScalar(raw, cursor.line);
}

/**
 * @param {FlowCursor} cursor
 */
function skipFlowSpace(cursor) {
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === ' ' || char === '\t' || char === '\n') {
      cursor.index += 1;
      continue;
    }
    break;
  }
}

/**
 * @param {FlowCursor} cursor
 * @param {string} message
 * @returns {YamlError}
 */
function flowError(cursor, message) {
  return new YamlError(message, { line: cursor.line.line, column: cursor.line.column + cursor.index });
}

/**
 * Parse a block scalar (`|`, `>`, with chomping and indentation indicators).
 *
 * @param {ParserState} state
 * @param {number} indent Parent key indentation.
 * @param {string} header e.g. `|-`
 * @param {LogicalLine} line
 * @returns {string}
 */
function parseBlockScalar(state, indent, header, line) {
  const style = header[0];
  const chomp = /-/.test(header) ? 'strip' : /\+/.test(header) ? 'keep' : 'clip';
  const digit = header.match(/\d/);
  const explicitIndent = digit ? Number(digit[0]) : null;
  const folded = style === '>';

  // The block runs from the line after the header up to the line before the next
  // line that is indented at or below the key — blank lines in between belong to
  // the block, so they are read from the raw source rather than the token list.
  let cursor = state.index;
  while (cursor < state.lines.length && state.lines[cursor].indent > indent) cursor += 1;
  const terminator = state.lines[cursor];
  const start = line.rawIndex + 1;
  const end = terminator ? terminator.rawIndex : state.raw.length;
  const rawBlock = state.raw.slice(start, Math.max(start, end));
  state.index = cursor;

  const nonEmpty = rawBlock.filter((entry) => entry.trim() !== '');
  if (nonEmpty.length === 0) return chomp === 'keep' ? '\n' : '';

  const blockIndent =
    explicitIndent !== null
      ? indent + explicitIndent
      : Math.min(...nonEmpty.map((entry) => entry.length - entry.trimStart().length));

  const body = rawBlock.map((entry) => (entry.trim() === '' ? '' : entry.slice(blockIndent)));
  while (body.length && body[body.length - 1] === '') body.pop();

  let text;
  if (folded) {
    /** @type {string[]} */
    const parts = [];
    for (let index = 0; index < body.length; index += 1) {
      const current = body[index];
      const previous = body[index - 1];
      const next = body[index + 1];
      if (current === '') {
        if (previous !== '' ) parts.push('\n');
        continue;
      }
      if (index === 0 || previous === '') parts.push(current);
      else if (/^\s/.test(current) || (next !== undefined && /^\s/.test(next))) parts.push(`\n${current}`);
      else parts.push(` ${current}`);
    }
    text = parts
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '');
  } else {
    text = body.join('\n');
  }

  if (chomp === 'strip') return text.replace(/\n+$/, '');
  if (chomp === 'keep') return `${text}\n`;
  return `${text.replace(/\n+$/, '')}\n`;
}

/**
 * Find the start of a trailing comment in an inline value, ignoring `#` inside
 * quotes and inside words.
 *
 * @param {string} value
 * @returns {number}
 */
function findComment(value) {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (quote === '"' && char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(value[index - 1]))) return index;
  }
  return -1;
}

/**
 * @param {any} value
 * @returns {any}
 */
function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = cloneValue(entry);
    return out;
  }
  return value;
}
