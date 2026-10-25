/**
 * The template engine.
 *
 * Templates are plain HTML files with mustache-style markers. The engine
 * compiles them to JavaScript once per build, which keeps rendering fast enough
 * to serve the live preview without caching anything to disk.
 *
 * Supported syntax:
 *
 * ```hbs
 * {{ expression }}                 escaped output
 * {{{ expression }}} / {{& e }}    raw output (trusted HTML only)
 * {{! comment }}
 * {{#if expr}} … {{else}} … {{/if}}
 * {{#unless expr}} … {{/unless}}
 * {{#each list}} {{@index}} {{this}} {{else}} … {{/each}}
 * {{#with object}} … {{/with}}
 * {{> partialName}}                include a partial in the current scope
 * {{> partialName some.path}}      include a partial with an explicit context
 * {{~ trimmed ~}}                  trim whitespace around the marker
 * ```
 *
 * Expressions support dotted paths, `this`, `@root`, loop metadata, string /
 * number / boolean literals, comparisons, `&&`, `||`, `!`, parentheses, and
 * helper calls such as `{{date start "long"}}`.
 *
 * Everything is escaped by default; `SafeHtml` values (produced by the Markdown
 * renderer, for example) pass through untouched.
 *
 * @module template/engine
 */

import { AutoPortfolioError, ErrorCodes } from '../util/errors.js';
import { createRuntime, isTruthy, lookup } from './runtime.js';

/**
 * @typedef {object} TemplateNode
 * @property {string} type
 * @property {string} [value]
 * @property {string} [expr]
 * @property {string} [hash]  Raw hash argument source, e.g. `label=name`.
 * @property {string} [keyword] The block keyword as written (`if`, `unless`, `each`, …).
 * @property {TemplateNode[]} [body]
 * @property {TemplateNode[]} [alternate]
 * @property {number} [line]
 */

/**
 * @typedef {object} CompileOptions
 * @property {string} [name]  Used in error messages.
 */

/**
 * @param {string} source
 * @param {CompileOptions} [options]
 * @returns {TemplateNode[]}
 */
export function parseTemplate(source, options = {}) {
  const name = options.name ?? 'template';
  const nodes = parseNodes(source, name);
  return nodes;
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {TemplateNode[]}
 */
function parseNodes(source, name) {
  /** @type {TemplateNode[]} */
  const root = [];
  /** @type {Array<{node: TemplateNode, branch: TemplateNode[]}>} */
  const stack = [{ node: { type: 'root', body: root }, branch: root }];

  const top = () => stack[stack.length - 1];
  const push = (node) => {
    top().branch.push(node);
  };

  const pattern = /\{\{\{?[\s\S]*?\}\}\}?/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    let text = source.slice(cursor, match.index);
    const raw = match[0];
    const line = source.slice(0, match.index).split('\n').length;

    const isTriple = raw.startsWith('{{{');
    let inner = isTriple ? raw.slice(3, -3) : raw.slice(2, -2);
    let trimLeft = false;
    let trimRight = false;

    if (inner.startsWith('~')) {
      trimLeft = true;
      inner = inner.slice(1);
    }
    if (inner.endsWith('~')) {
      trimRight = true;
      inner = inner.slice(0, -1);
    }
    if (trimLeft) text = text.replace(/\s+$/, '');
    if (trimRight) {
      const following = source.slice(pattern.lastIndex);
      const trimmed = following.replace(/^\s+/, '');
      pattern.lastIndex += following.length - trimmed.length;
    }

    if (text) push({ type: 'text', value: text });

    const content = inner.trim();

    if (content === '') {
      throw syntaxError('Empty template expression', name, line);
    }
    if (content.startsWith('!')) {
      // comment
    } else if (content.startsWith('#') || content.startsWith('^')) {
      const inverted = content.startsWith('^');
      const body = content.slice(1).trim();
      const keyword = body.split(/\s+/)[0];
      const expression = body.slice(keyword.length).trim();
      if (keyword === 'if' || keyword === 'unless') {
        requireExpression(expression, keyword, name, line);
        const node = { type: 'if', keyword: inverted ? 'if' : keyword, expr: expression, body: [], alternate: [], line };
        if (keyword === 'unless' || inverted) node.expr = `!(${expression})`;
        push(node);
        stack.push({ node, branch: node.body ?? [] });
      } else if (keyword === 'each') {
        requireExpression(expression, keyword, name, line);
        const node = { type: 'each', keyword, expr: expression, body: [], alternate: [], line };
        push(node);
        stack.push({ node, branch: node.body ?? [] });
      } else if (keyword === 'with') {
        requireExpression(expression, keyword, name, line);
        const node = { type: 'with', keyword, expr: expression, body: [], alternate: [], line };
        push(node);
        stack.push({ node, branch: node.body ?? [] });
      } else {
        throw syntaxError(`Unknown block helper \`${keyword}\``, name, line);
      }
    } else if (content.startsWith('/')) {
      const keyword = content.slice(1).trim();
      if (stack.length === 1) throw syntaxError(`Unexpected \`{{/${keyword}}}\``, name, line);
      const open = top().node;
      const openKeyword = open.keyword ?? open.type;
      if (openKeyword !== keyword) {
        throw syntaxError(`\`{{/${keyword}}}\` does not match \`{{#${openKeyword}}}\``, name, line);
      }
      stack.pop();
    } else if (content === 'else' || content.startsWith('else ')) {
      if (stack.length === 1) throw syntaxError('`{{else}}` outside of a block', name, line);
      const entry = top();
      const open = entry.node;
      if (open.type !== 'if' && open.type !== 'each' && open.type !== 'with') {
        throw syntaxError('`{{else}}` is only allowed inside `#if`, `#each` and `#with`', name, line);
      }
      if (open.alternate && open.alternate.length > 0) {
        throw syntaxError('A block may only contain one `{{else}}`', name, line);
      }
      const rest = content.slice(4).trim();
      if (rest.startsWith('if ') || rest.startsWith('unless ')) {
        // `{{else if cond}}`: nest a synthetic if inside the alternate branch.
        const nested = /** @type {TemplateNode} */ (
          rest.startsWith('unless ')
            ? { type: 'if', keyword: 'if', expr: `!(${rest.slice(7).trim()})`, body: [], alternate: [], line }
            : { type: 'if', keyword: 'if', expr: rest.slice(3).trim(), body: [], alternate: [], line }
        );
        open.alternate = [nested];
        stack.pop();
        stack.push({ node: nested, branch: nested.body ?? [] });
      } else {
        open.alternate = [];
        stack.pop();
        stack.push({ node: open, branch: open.alternate });
      }
    } else if (content.startsWith('>')) {
      const partial = parsePartialArguments(content.slice(1).trim(), name, line);
      push({ type: 'partial', value: partial.name, expr: partial.context, hash: partial.hash, line });
    } else {
      const expression = content.startsWith('&') ? content.slice(1).trim() : content;
      requireExpression(expression, 'output', name, line);
      push({ type: isTriple || content.startsWith('&') ? 'raw' : 'output', expr: expression, line });
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < source.length) push({ type: 'text', value: source.slice(cursor) });

  if (stack.length > 1) {
    const open = top().node;
    throw new AutoPortfolioError(`Unclosed \`{{#${open.type}}}\` block`, {
      code: ErrorCodes.TEMPLATE_SYNTAX,
      source: name,
      line: open.line,
      hint: `Add \`{{/${open.type}}}\`.`,
    });
  }

  return root;
}

/**
 * @param {string} expression
 * @param {string} keyword
 * @param {string} name
 * @param {number} line
 */
function requireExpression(expression, keyword, name, line) {
  if (!expression) throw syntaxError(`\`{{#${keyword}}}\` needs an expression`, name, line);
}

/**
 * @param {string} message
 * @param {string} name
 * @param {number} line
 * @returns {AutoPortfolioError}
 */
function syntaxError(message, name, line) {
  return new AutoPortfolioError(message, {
    code: ErrorCodes.TEMPLATE_SYNTAX,
    source: name,
    line,
  });
}

/**
 * Compile a template into a render function.
 *
 * @param {string} source
 * @param {object} options
 * @param {string} [options.name]
 * @returns {(context: any, runtime: any) => string}
 */
export function compileTemplate(source, options = {}) {
  const name = options.name ?? 'template';
  const nodes = parseTemplate(source, { name });
  const body = emitNodes(nodes, 1);
  const js = `"use strict";
return function render(__ctx, __rt, __parentScopes, __parentMetas) {
  const __scopes = __parentScopes ? [...__parentScopes, __ctx] : [__ctx];
  const __metas = __parentMetas ? [...__parentMetas, null] : [null];
  const __out = [];
${body}
  return __out.join('');
};`;

  try {
    // eslint-disable-next-line no-new-func
    const renderer = new Function(js)();
    return /** @type {any} */ ((context, runtime) => renderer(context, runtime ?? createRuntime()));
  } catch (error) {
    throw new AutoPortfolioError(
      `Failed to compile template: ${error instanceof Error ? error.message : String(error)}`,
      { code: ErrorCodes.TEMPLATE_SYNTAX, source: name, cause: error },
    );
  }
}

/**
 * @param {TemplateNode[]} nodes
 * @param {number} depth
 * @returns {string}
 */
function emitNodes(nodes, depth) {
  /** @type {string[]} */
  const lines = [];
  const indent = '  '.repeat(depth);

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        if (node.value) lines.push(`${indent}__out.push(${JSON.stringify(node.value)});`);
        break;
      case 'output':
        lines.push(`${indent}__out.push(__rt.escape(${compileExpression(node.expr ?? '', node)}));`);
        break;
      case 'raw':
        lines.push(`${indent}__out.push(__rt.raw(${compileExpression(node.expr ?? '', node)}));`);
        break;
      case 'if':
        lines.push(`${indent}if (__rt.truthy(${compileExpression(node.expr ?? '', node)})) {`);
        lines.push(emitNodes(node.body ?? [], depth + 1));
        if (node.alternate?.length) {
          lines.push(`${indent}} else {`);
          lines.push(emitNodes(node.alternate, depth + 1));
        }
        lines.push(`${indent}}`);
        break;
      case 'with':
        lines.push(`{`);
        lines.push(`${indent}  const __value = ${compileExpression(node.expr ?? '', node)};`);
        lines.push(`${indent}  if (__rt.truthy(__value)) {`);
        lines.push(`${indent}    __scopes.push(__value);`);
        lines.push(`${indent}    __metas.push(null);`);
        lines.push(emitNodes(node.body ?? [], depth + 2));
        lines.push(`${indent}    __scopes.pop();`);
        lines.push(`${indent}    __metas.pop();`);
        if (node.alternate?.length) {
          lines.push(`${indent}  } else {`);
          lines.push(emitNodes(node.alternate, depth + 2));
        }
        lines.push(`${indent}  }`);
        lines.push(`}`);
        break;
      case 'each':
        lines.push(`{`);
        lines.push(`${indent}  const __list = __rt.entries(${compileExpression(node.expr ?? '', node)});`);
        lines.push(`${indent}  if (__list.length) {`);
        lines.push(`${indent}    for (let __i = 0; __i < __list.length; __i += 1) {`);
        lines.push(`${indent}      const __key = __list[__i][0];`);
        lines.push(`${indent}      __scopes.push(__list[__i][1]);`);
        lines.push(
          `${indent}      __metas.push({ index: __key, key: __key, first: __i === 0, last: __i === __list.length - 1, length: __list.length, i: __i + 1 });`,
        );
        lines.push(emitNodes(node.body ?? [], depth + 3));
        lines.push(`${indent}      __metas.pop();`);
        lines.push(`${indent}      __scopes.pop();`);
        lines.push(`${indent}    }`);
        if (node.alternate?.length) {
          lines.push(`${indent}  } else {`);
          lines.push(emitNodes(node.alternate, depth + 2));
        }
        lines.push(`${indent}  }`);
        lines.push(`}`);
        break;
      case 'partial': {
        const contextExpression = node.expr ? compileExpression(node.expr, node) : 'undefined';
        const hashExpression = node.hash ? `{ ${node.hash} }` : 'undefined';
        lines.push(
          `${indent}__out.push(__rt.partial(${JSON.stringify(node.value)}, ${contextExpression}, __scopes, __metas, ${hashExpression}));`,
        );
        break;
      }
      default:
        break;
    }
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Compile a template expression into a JavaScript expression string.
 *
 * @param {string} source
 * @param {TemplateNode} node
 * @returns {string}
 */
function compileExpression(source, node) {
  const parser = new ExpressionParser(source, node);
  const expression = parser.parse();
  return expression;
}

/**
 * Split partial arguments into a name, an optional context expression and hash
 * arguments (`{{> card title=name featured=true}}`).
 *
 * @param {string} body
 * @param {string} templateName
 * @param {number} line
 * @returns {{name: string, context?: string, hash?: string}}
 */
function parsePartialArguments(body, templateName, line) {
  const tokens = splitTopLevel(body);
  const name = tokens.shift();
  if (!name) throw syntaxError('`{{> }}` needs a partial name', templateName, line);

  /** @type {string|undefined} */
  let context;
  /** @type {string[]} */
  const hash = [];

  for (const token of tokens) {
    const match = /^([A-Za-z_$][A-Za-z0-9_$-]*)=([\s\S]+)$/.exec(token);
    if (match && !token.startsWith('==')) {
      const parser = new ExpressionParser(match[2], { type: 'partial', line });
      hash.push(`${JSON.stringify(match[1])}: ${parser.parse()}`);
      continue;
    }
    if (context) {
      throw syntaxError(`Unexpected \`${token}\` in \`{{> ${name} ...}}\``, templateName, line);
    }
    context = token;
  }

  return { name, context, hash: hash.length ? hash.join(', ') : undefined };
}

/**
 * Split a fragment on whitespace that is not inside quotes, parentheses or
 * brackets.
 *
 * @param {string} source
 * @returns {string[]}
 */
function splitTopLevel(source) {
  /** @type {string[]} */
  const tokens = [];
  let current = '';
  let quote = '';
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        current += source[index + 1] ?? '';
        index += 1;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

class ExpressionParser {
  /**
   * @param {string} source
   * @param {TemplateNode} node
   */
  constructor(source, node) {
    this.source = source;
    this.node = node;
    this.index = 0;
  }

  parse() {
    const expression = this.parseOr(false);
    this.skipSpace();
    if (this.index < this.source.length) {
      throw syntaxError(
        `Unexpected \`${this.source.slice(this.index)}\` in expression \`${this.source}\``,
        this.templateName(),
        this.node.line ?? 0,
      );
    }
    return expression;
  }

  templateName() {
    return 'template';
  }

  parseOr(inArgument) {
    let left = this.parseAnd(inArgument);
    for (;;) {
      this.skipSpace();
      if (this.source.startsWith('||', this.index)) {
        this.index += 2;
        const right = this.parseAnd(inArgument);
        left = `(${left} || ${right})`;
        continue;
      }
      return left;
    }
  }

  parseAnd(inArgument) {
    let left = this.parseComparison(inArgument);
    for (;;) {
      this.skipSpace();
      if (this.source.startsWith('&&', this.index)) {
        this.index += 2;
        const right = this.parseComparison(inArgument);
        left = `(${left} && ${right})`;
        continue;
      }
      return left;
    }
  }

  parseComparison(inArgument) {
    const left = this.parseUnary(inArgument);
    this.skipSpace();
    for (const operator of ['===', '!==', '==', '!=', '>=', '<=', '>', '<']) {
      if (this.source.startsWith(operator, this.index)) {
        // Avoid consuming `=>` or lookalikes.
        this.index += operator.length;
        const right = this.parseUnary(inArgument);
        const normalised = operator === '==' ? '===' : operator === '!=' ? '!==' : operator;
        return `__rt.compare(${left}, ${right}, ${JSON.stringify(normalised)})`;
      }
    }
    return left;
  }

  parseUnary(inArgument) {
    this.skipSpace();
    if (this.source[this.index] === '!') {
      this.index += 1;
      return `!(${this.parseUnary(inArgument)})`;
    }
    if (this.source[this.index] === '-' && /[\s\d(]/.test(this.source[this.index + 1] ?? '')) {
      this.index += 1;
      return `-(${this.parseUnary(inArgument)})`;
    }
    return this.parsePrimary(inArgument);
  }

  parsePrimary(inArgument) {
    this.skipSpace();
    const char = this.source[this.index];
    if (char === '(') {
      this.index += 1;
      const inner = this.parseOr(false);
      this.skipSpace();
      if (this.source[this.index] !== ')') {
        throw syntaxError(`Missing \`)\` in expression \`${this.source}\``, 'template', this.node.line ?? 0);
      }
      this.index += 1;
      return `(${inner})`;
    }
    if (char === '"' || char === "'") {
      return JSON.stringify(this.readString(char));
    }
    if (/[0-9]/.test(char ?? '')) {
      return String(this.readNumber());
    }
    return this.parsePathOrCall(inArgument);
  }

  parsePathOrCall(inArgument) {
    this.skipSpace();
    const start = this.index;
    const nameMatch = /^[A-Za-z_$@][A-Za-z0-9_$]*/.exec(this.source.slice(this.index));
    if (!nameMatch) {
      throw syntaxError(
        `Unexpected character \`${this.source[this.index] ?? 'end of input'}\` in expression \`${this.source}\``,
        'template',
        this.node.line ?? 0,
      );
    }
    let path = nameMatch[0];
    this.index += path.length;

    // Helper call: `name arg1 arg2` or `name(arg1, arg2)`. Inside an argument
    // list only the parenthesised form counts, so `{{include partials this}}`
    // treats `partials` as a path instead of calling a helper with that name.
    this.skipSpace();
    const isCallWithParens = this.source[this.index] === '(' && !path.startsWith('@') && !path.includes('.');
    const isHelperCall = !inArgument && !isCallWithParens && this.hasHelperArguments();

    if (isCallWithParens || isHelperCall) {
      /** @type {string[]} */
      const args = [];
      if (isCallWithParens) {
        this.index += 1;
        for (;;) {
          this.skipSpace();
          if (this.source[this.index] === ')') {
            this.index += 1;
            break;
          }
          args.push(this.parseOr(false));
          this.skipSpace();
          if (this.source[this.index] === ',') {
            this.index += 1;
            continue;
          }
          if (this.source[this.index] === ')') {
            this.index += 1;
            break;
          }
          throw syntaxError(`Expected \`,\` or \`)\` in call to \`${path}\``, 'template', this.node.line ?? 0);
        }
      } else {
        while (this.index < this.source.length) {
          this.skipSpace();
          const saved = this.index;
          args.push(this.parseOr(true));
          if (this.index === saved) break;
        }
      }
      return `__rt.call(${JSON.stringify(path)}, [${args.join(', ')}], __scopes, __metas)`;
    }

    // Dotted path continuation.
    while (this.source[this.index] === '.') {
      const next = /^\.([A-Za-z0-9_$]+)/.exec(this.source.slice(this.index));
      if (!next) break;
      path += next[0];
      this.index += next[0].length;
    }

    // Bracket lookups with literal keys: `list.[0]`, `map.["key"]`.
    while (this.source[this.index] === '[') {
      const closing = this.source.indexOf(']', this.index);
      if (closing === -1) break;
      const key = this.source.slice(this.index + 1, closing).trim().replace(/^['"]|['"]$/g, '');
      path += `.${key}`;
      this.index = closing + 1;
    }

    return `__rt.lookup(__scopes, __metas, ${JSON.stringify(path)})`;
  }

  /**
   * Distinguish `{{helper a b}}` from a dotted path such as `{{profile.name}}`.
   * An identifier is treated as a helper call only when what follows looks like
   * the start of an argument rather than an operator or an accessor.
   */
  hasHelperArguments() {
    const rest = this.source.slice(this.index).replace(/^\s+/, '');
    if (!rest) return false;
    for (const operator of ['&&', '||', '===', '!==', '==', '!=', '>=', '<=', '>', '<', '?']) {
      if (rest.startsWith(operator)) return false;
    }
    return /^[A-Za-z0-9_$@'"([!-]/.test(rest);
  }

  readString(quote) {
    let result = '';
    this.index += 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '\\') {
        result += this.source[this.index + 1];
        this.index += 2;
        continue;
      }
      if (char === quote) {
        this.index += 1;
        return result;
      }
      result += char;
      this.index += 1;
    }
    throw syntaxError('Unterminated string literal', 'template', this.node.line ?? 0);
  }

  readNumber() {
    const match = /^-?\d+(?:\.\d+)?/.exec(this.source.slice(this.index));
    this.index += match ? match[0].length : 0;
    return match ? Number(match[0]) : 0;
  }

  skipSpace() {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index += 1;
  }
}

export { createRuntime, lookup, isTruthy };
export { SafeHtml } from '../util/html.js';
