/**
 * Runtime helpers shared by every compiled template.
 *
 * The compiler emits straight-line JavaScript that calls into this runtime, so
 * the semantics of path lookup, escaping, iteration and helper calls live in one
 * readable place instead of being inlined into generated code.
 *
 * @module template/runtime
 */

import { AutoPortfolioError, ErrorCodes } from '../util/errors.js';
import { SafeHtml, isSafeHtml, stringify } from '../util/html.js';

/**
 * Resolve a dotted path against the scope chain.
 *
 * Lookup rules (deliberately Handlebars-like):
 * 1. `this` / `.` yields the innermost scope.
 * 2. `@root` yields the root context.
 * 3. `@index`, `@key`, `@first`, `@last`, `@length`, `@i` read loop metadata.
 * 4. The first scope that *defines* the first path segment wins; lookups never
 *    fall back to the global object.
 *
 * @param {any[]} scopes
 * @param {Array<object|null>} metas
 * @param {string} path
 * @returns {any}
 */
export function lookup(scopes, metas, path) {
  if (path === '' || path === 'this' || path === '.') return scopes[scopes.length - 1];

  if (path === '@root') return scopes[0];
  if (path.startsWith('@root.')) return descend(scopes[0], path.slice(6).split('.'));
  if (path.startsWith('@')) {
    const meta = metas[metas.length - 1];
    if (!meta) return undefined;
    const key = path.slice(1);
    return key in meta ? meta[key] : undefined;
  }

  const segments = path.split('.');
  const [head, ...rest] = segments;

  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    if (scope === null || scope === undefined) continue;
    if (typeof scope === 'object' || typeof scope === 'function') {
      if (head in scope) {
        const found = /** @type {Record<string, any>} */ (scope)[head];
        if (found === undefined) continue;
        return rest.length ? descend(found, rest) : found;
      }
    }
  }
  return undefined;
}

/**
 * @param {any} value
 * @param {string[]} segments
 * @returns {any}
 */
function descend(value, segments) {
  let current = value;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (typeof current !== 'object' && typeof current !== 'string') return undefined;
    current = /** @type {any} */ (current)[segment];
  }
  return current;
}

/**
 * Truthiness used by `#if`. Empty arrays and empty strings are false, which is
 * what template authors expect.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === '' || value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (isSafeHtml(value)) return value.value.trim().length > 0;
  return true;
}

/**
 * Normalise a value into a list of `[key, value]` pairs for `#each`.
 * @param {unknown} value
 * @returns {Array<[any, any]>}
 */
export function toEntries(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((entry, index) => [index, entry]);
  if (value instanceof Map) return [...value.entries()];
  if (value instanceof Set) return [...value.values()].map((entry, index) => [index, entry]);
  if (typeof value === 'object') {
    if (isSafeHtml(value)) return [];
    return Object.entries(value);
  }
  return [];
}

/**
 * Comparison with the numeric coercion template authors expect (`"2" == 2`).
 *
 * @param {any} a
 * @param {any} b
 * @param {string} operator
 * @returns {boolean}
 */
export function compare(a, b, operator) {
  switch (operator) {
    case '===':
      return looseEqual(a, b);
    case '!==':
      return !looseEqual(a, b);
    case '>':
      return toNumber(a) > toNumber(b);
    case '<':
      return toNumber(a) < toNumber(b);
    case '>=':
      return toNumber(a) >= toNumber(b);
    case '<=':
      return toNumber(a) <= toNumber(b);
    default:
      return false;
  }
}

/**
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function looseEqual(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  return String(a) === String(b);
}

/**
 * @param {any} value
 * @returns {number}
 */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

/**
 * @typedef {object} HelperContext
 * @property {any[]} scopes
 * @property {Array<object|null>} metas
 * @property {any} root   The root context.
 * @property {any} this   The innermost scope.
 * @property {(path: string) => any} lookup
 * @property {(name: string, context?: any) => string} partial Render a partial in the current scope.
 * @property {Map<string, Function>} partials All registered partials.
 * @property {Record<string, Function>} helpers All registered helpers.
 */

/**
 * A runtime is the mutable bag of helpers and partials shared by all templates
 * of one build.
 *
 * @typedef {object} Runtime
 * @property {Map<string, Function>} helpers
 * @property {Map<string, Function>} partials
 * @property {(name: string, fn: Function) => void} registerHelper
 * @property {(name: string, template: Function) => void} registerPartial
 * @property {(name: string, context: any, scopes: any[], metas: any[], hash?: Record<string, any>) => string} partial
 * @property {(name: string, args: any[], scopes: any[], metas: any[]) => any} call
 * @property {(value: any) => string} escape
 * @property {(value: any) => string} raw
 * @property {(value: any) => boolean} truthy
 * @property {(value: any) => Array<[any, any]>} entries
 * @property {(a: any, b: any, operator: string) => boolean} compare
 * @property {(scopes: any[], metas: any[], path: string) => any} lookup
 */

/**
 * @param {object} [options]
 * @param {Record<string, Function>} [options.helpers]
 * @returns {Runtime}
 */
export function createRuntime(options = {}) {
  /** @type {Map<string, Function>} */
  const helpers = new Map(Object.entries(options.helpers ?? {}));
  /** @type {Map<string, Function>} */
  const partials = new Map();

  /** @type {Runtime} */
  const runtime = {
    helpers,
    partials,
    registerHelper(name, fn) {
      helpers.set(name, fn);
    },
    registerPartial(name, template) {
      partials.set(name, template);
    },
    partial(name, context, scopes, metas, hash) {
      const template = partials.get(name);
      if (!template) {
        throw new AutoPortfolioError(`Unknown partial \`{{> ${name}}}\``, {
          code: ErrorCodes.TEMPLATE_RUNTIME,
          hint: partials.size
            ? `Registered partials: ${[...partials.keys()].join(', ')}.`
            : 'No partials were registered for this template.',
        });
      }
      if (hash) {
        // Hash arguments (`{{> card title=name}}`) become extra local values on
        // top of whatever scope the partial would have seen.
        const base = context !== undefined && context !== null ? context : scopes[scopes.length - 1];
        const merged =
          base && typeof base === 'object' && !Array.isArray(base) && !isSafeHtml(base)
            ? { .../** @type {Record<string, any>} */ (base), ...hash }
            : { ...hash };
        return template(merged, runtime, scopes.slice(0, -1), metas.slice(0, -1));
      }
      if (context === undefined || context === null) {
        // Render in the current scope: reuse the innermost value so the partial
        // still sees the whole chain through its parent scopes.
        return template(scopes[scopes.length - 1], runtime, scopes.slice(0, -1), metas.slice(0, -1));
      }
      return template(context, runtime, scopes, metas);
    },
    call(name, args, scopes, metas) {
      const helper = helpers.get(name);
      if (!helper) {
        throw new AutoPortfolioError(`Unknown helper \`${name}\``, {
          code: ErrorCodes.TEMPLATE_RUNTIME,
          hint: helpers.size
            ? `Available helpers: ${[...helpers.keys()].sort().join(', ')}.`
            : 'No helpers were registered for this template.',
        });
      }
      /** @type {HelperContext} */
      const context = {
        scopes,
        metas,
        root: scopes[0],
        this: scopes[scopes.length - 1],
        lookup: (path) => lookup(scopes, metas, path),
        partial: (name, context) => runtime.partial(name, context, scopes, metas),
        partials,
        helpers: Object.fromEntries(helpers),
      };
      return helper(args, context);
    },
    escape(value) {
      return stringify(value);
    },
    raw(value) {
      if (value === null || value === undefined) return '';
      if (isSafeHtml(value)) return value.value;
      if (Array.isArray(value)) return value.map((entry) => runtime.raw(entry)).join('');
      return String(value);
    },
    truthy: isTruthy,
    entries: toEntries,
    compare,
    lookup,
  };

  return runtime;
}

export { SafeHtml };
