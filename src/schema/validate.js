/**
 * The validator: raw parsed value + schema -> normalised value + diagnostics.
 *
 * Validation and normalisation happen in a single pass on purpose. A portfolio
 * document is hand written, so "clean it up and tell me what you ignored" is far
 * more useful than "reject it". The result of this module is the only shape the
 * rest of AutoPortfolio sees: no `undefined`, no shorthands, no aliases.
 *
 * @module schema/validate
 */

import { ErrorCodes, diagnostic } from '../util/errors.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */
/** @typedef {import('./fields.js').Field} Field */

/**
 * @typedef {object} ValidateOptions
 * @property {string} [source]   File name used in diagnostics.
 * @property {boolean} [strict]  Promote warnings to errors.
 * @property {string} [path]     Path prefix (used internally for nested calls).
 * @property {any} [context]     Extra data passed to `coerce`.
 */

/**
 * Validate and normalise a value.
 *
 * @param {unknown} input
 * @param {Field} schema
 * @param {ValidateOptions} [options]
 * @returns {{value: any, diagnostics: Diagnostic[]}}
 */
export function validateDocument(input, schema, options = {}) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {(severity: Diagnostic['severity']) => Diagnostic['severity']} */
  const promote = (severity) => (options.strict && severity === 'warning' ? 'error' : severity);
  const context = {
    source: options.source,
    path: options.path ?? '',
    diagnostics,
    /** @param {Omit<Diagnostic, 'severity'> & {severity?: Diagnostic['severity']}} entry */
    promote,
    report(entry) {
      const severity = promote(entry.severity ?? 'error');
      diagnostics.push(
        diagnostic({
          ...entry,
          severity,
          source: entry.source ?? options.source,
        }),
      );
    },
  };

  // A completely empty document is a mistake worth naming: it usually means the
  // file was created but never filled in.
  if (input === null || input === undefined) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_EMPTY,
      message: 'The document is empty',
      hint: 'Add at least `profile.name` so the generated site has a title.',
    });
    return { value: defaultFor(schema), diagnostics };
  }

  const value = validateValue(input, schema, '', { ...context, coerce: options.context });
  return { value, diagnostics };
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {{source?: string, path: string, diagnostics: Diagnostic[], report: Function, coerce?: any}} context
 * @returns {any}
 */
export function validateValue(input, schema, path, context) {
  const { report } = context;
  const label = describeField(schema, path);

  // `null` and empty strings are treated as "not provided" everywhere. It keeps
  // `github:` (empty value) from becoming a broken link.
  if (input === null || input === undefined || (typeof input === 'string' && input.trim() === '')) {
    if (schema.required) {
      report({
        severity: 'error',
        code: ErrorCodes.DATA_MISSING,
        message: `Missing required field \`${label}\``,
        path: path || undefined,
        hint: schema.example
          ? `For example: ${schema.example}`
          : 'Add it, or remove the parent key if nothing in it is needed.',
      });
      return defaultFor(schema);
    }
    return defaultFor(schema);
  }

  switch (schema.kind) {
    case 'string':
      return validateString(input, schema, path, context);
    case 'text':
    case 'markdown':
      return validateText(input, schema, path, context);
    case 'boolean':
      return validateBoolean(input, schema, path, context);
    case 'number':
      return validateNumber(input, schema, path, context, false);
    case 'integer':
      return validateNumber(input, schema, path, context, true);
    case 'date':
      return validateDate(input, schema, path, context);
    case 'url':
      return validateUrl(input, schema, path, context);
    case 'email':
      return validateEmailLike(input, schema, path, context, 'email');
    case 'phone':
      return validatePhone(input, schema, path, context);
    case 'color':
      return validateColor(input, schema, path, context);
    case 'enum':
      return validateEnum(input, schema, path, context);
    case 'array':
      return validateArray(input, schema, path, context);
    case 'object':
      return validateObject(input, schema, path, context);
    case 'record':
      return validateRecord(input, schema, path, context);
    case 'any':
      return validateAny(input, schema, path, context);
    default:
      report({
        severity: 'error',
        code: ErrorCodes.INTERNAL,
        message: `Unsupported schema kind \`${schema.kind}\``,
        path: path || undefined,
      });
      return input;
  }
}

// ---------------------------------------------------------------------------
// scalars
// ---------------------------------------------------------------------------

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateString(input, schema, path, context) {
  if (typeof input === 'object') return typeError(input, schema, path, context, 'a string');

  let value = String(input).trim().replace(/[ \t]{2,}/g, ' ');
  if (schema.coerce) value = schema.coerce(value, context.coerce);

  if (schema.pattern && !schema.pattern.test(value)) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` has an unexpected format`,
      path,
      hint: schema.patternHint ?? `Expected ${schema.pattern}.`,
    });
  }

  if (schema.kind === 'string' && schema.max === undefined && !schema.allowLong) {
    const limit = 400;
    if (value.length > limit) {
      context.report({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`${describeField(schema, path)}\` is ${value.length} characters long`,
        path,
        hint: 'Long prose reads better in a Markdown field such as `about` or `description`.',
      });
    }
  }

  return checkLength(value, schema, path, context);
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateText(input, schema, path, context) {
  if (typeof input === 'object') return typeError(input, schema, path, context, 'a string');
  // YAML block scalars keep their trailing newline; drop it, keep the rest.
  const value = String(input).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return checkLength(value, schema, path, context);
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {boolean}
 */
function validateBoolean(input, schema, path, context) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number' && (input === 0 || input === 1)) return input === 1;
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    if (['true', 'yes', 'y', 'on', '1'].includes(value)) return true;
    if (['false', 'no', 'n', 'off', '0'].includes(value)) return false;
  }
  return typeError(input, schema, path, context, '`true` or `false`');
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @param {boolean} forceInteger
 * @returns {number}
 */
function validateNumber(input, schema, path, context, forceInteger) {
  const value = typeof input === 'string' ? Number(input.trim()) : input;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return typeError(input, schema, path, context, 'a number');
  }
  if (forceInteger && !Number.isInteger(value)) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` must be a whole number`,
      path,
      hint: `Received \`${value}\`.`,
    });
    return Math.round(value);
  }
  if (schema.min !== undefined && value < schema.min) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` must be at least ${schema.min}`,
      path,
    });
  }
  if (schema.max !== undefined && value > schema.max) {
    context.report({
      severity: 'warning',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is larger than expected (${schema.max})`,
      path,
    });
  }
  return value;
}

/**
 * Dates are kept as strings so the document round-trips: `2024-01` stays
 * `2024-01` instead of becoming midnight UTC on New Year's Day.
 *
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateDate(input, schema, path, context) {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const raw = String(input).trim();
  const normalized = normalizeDateString(raw);
  if (normalized) return normalized;

  context.report({
    severity: 'error',
    code: ErrorCodes.DATA_FORMAT,
    message: `\`${describeField(schema, path)}\` is not a date: \`${raw}\``,
    path,
    hint: 'Use `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or `present` for something ongoing.',
  });
  return raw;
}

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeDateString(raw) {
  if (/^present$/i.test(raw) || /^now$/i.test(raw) || /^current$/i.test(raw)) return 'present';
  const value = raw.replace(/[/.]/g, '-').replace(/(\d)(st|nd|rd|th)/i, '$1');
  let match = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    if (month && (Number(month) < 1 || Number(month) > 12)) return null;
    if (day && (Number(day) < 1 || Number(day) > 31)) return null;
    return [year, month?.padStart(2, '0'), day?.padStart(2, '0')].filter(Boolean).join('-');
  }
  // `March 2024` / `Mar 2024` / `2024 Q1`
  match = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(raw.trim());
  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const index = months.findIndex((month) => match[1].toLowerCase().startsWith(month));
    if (index >= 0) return `${match[2]}-${String(index + 1).padStart(2, '0')}`;
  }
  match = /^(\d{4})\s*Q([1-4])$/.exec(raw.trim());
  if (match) return `${match[1]}-${String((Number(match[2]) - 1) * 3 + 1).padStart(2, '0')}`;
  return null;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateUrl(input, schema, path, context) {
  if (typeof input === 'object') return typeError(input, schema, path, context, 'a URL string');
  const value = String(input).trim();
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//');

  if (!isAbsolute) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` must be an absolute URL: \`${value}\``,
      path,
      hint: 'Write the full address, including `https://`.',
    });
    return value;
  }

  if (value.startsWith('//')) return `https:${value}`;
  if (/^(mailto|tel):/i.test(value)) return value;

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      context.report({
        severity: 'error',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`${describeField(schema, path)}\` must use http or https`,
        path,
      });
    }
    return url.toString().replace(/\/$/, url.pathname === '/' && !url.search && !url.hash ? '' : '');
  } catch {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is not a valid URL: \`${value}\``,
      path,
    });
    return value;
  }
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @param {string} what
 * @returns {string}
 */
function validateEmailLike(input, schema, path, context, what) {
  if (typeof input === 'object') return typeError(input, schema, path, context, `an ${what} address`);
  const value = String(input).trim().replace(/^mailto:/i, '');
  if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value)) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is not a valid ${what} address: \`${value}\``,
      path,
    });
  }
  return value;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validatePhone(input, schema, path, context) {
  const value = String(input).trim();
  if (!/^\+?[0-9][0-9\s().-]{5,}$/.test(value)) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is not a valid phone number: \`${value}\``,
      path,
      hint: 'Use the international format, e.g. `+351 912 345 678`.',
    });
  }
  return value;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateColor(input, schema, path, context) {
  const value = String(input).trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` must be a hex colour (\`#4f46e5\`), received \`${value}\``,
      path,
    });
  }
  return value.toLowerCase();
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function validateEnum(input, schema, path, context) {
  const raw = String(input).trim();
  const values = /** @type {string[]} */ (schema.values);
  const value = values.find((candidate) => candidate === raw) ?? values.find((candidate) => candidate.toLowerCase() === raw.toLowerCase());

  if (value) return value;

  const aliasMatch = (schema.valueAliases ?? []).find((entry) =>
    entry.aliases.some((alias) => alias.toLowerCase() === raw.toLowerCase()),
  );
  if (aliasMatch) return aliasMatch.value;

  const normalized = raw.toLowerCase().replace(/[\s_]+/g, '-');
  const fuzzy = values.find((candidate) => candidate.toLowerCase().replace(/[\s_]+/g, '-') === normalized);
  if (fuzzy) return fuzzy;

  context.report({
    severity: 'error',
    code: ErrorCodes.DATA_FORMAT,
    message: `\`${describeField(schema, path)}\` is not one of ${values.map((v) => `\`${v}\``).join(', ')}`,
    path,
    hint: `Received \`${raw}\`.${closest(raw, values)}`,
  });
  return raw;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {any[]}
 */
function validateArray(input, schema, path, context) {
  const itemSchema = /** @type {Field} */ (schema.item);
  /** @type {unknown[]} */
  let list;

  if (Array.isArray(input)) {
    list = input;
  } else if (schema.single === false) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_TYPE,
      message: `\`${describeField(schema, path)}\` must be a list`,
      path,
      hint: 'Start each item on its own line with `- `.',
    });
    return [];
  } else {
    list = [input];
  }

  /** @type {any[]} */
  const values = [];
  list.forEach((item, index) => {
    const itemPath = path ? `${path}[${index}]` : `[${index}]`;
    const value = validateValue(item, itemSchema, itemPath, context);
    if (value !== undefined && !isEmptyValue(value)) values.push(value);
  });

  if (schema.min !== undefined && values.length < schema.min) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_MISSING,
      message: `\`${describeField(schema, path)}\` needs at least ${schema.min} item${schema.min === 1 ? '' : 's'}`,
      path,
    });
  }

  if (schema.unique !== undefined) checkUnique(values, schema, path, context);

  return values;
}

/**
 * @param {any[]} values
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 */
function checkUnique(values, schema, path, context) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  values.forEach((value, index) => {
    const key = schema.unique ? String(value?.[schema.unique] ?? '') : JSON.stringify(value);
    if (!key) return;
    const keyed = key.toLowerCase();
    if (seen.has(keyed)) {
      context.report({
        severity: 'warning',
        code: ErrorCodes.DATA_DUPLICATE,
        message: `\`${describeField(schema, path)}\` repeats \`${key}\` (first at index ${seen.get(keyed)})`,
        path: `${path}[${index}]`,
        hint: schema.unique ? `Give each item a unique \`${schema.unique}\`.` : 'Remove the duplicate entry.',
      });
      values.splice(index, 1);
      return;
    }
    seen.set(keyed, index);
  });
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {Record<string, any>}
 */
function validateObject(input, schema, path, context) {
  // `- name: TypeScript` may also be written as `- TypeScript`.
  if (typeof input === 'string' && schema.from) {
    return validateObject({ [schema.from]: input }, schema, path, context);
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return typeError(input, schema, path, context, 'a mapping of keys and values');
  }

  const raw = /** @type {Record<string, any>} */ (input);
  /** @type {Record<string, any>} */
  const out = {};
  /** @type {Record<string, string>} */
  const resolvedKeys = {};

  for (const [key, fieldSchema] of Object.entries(schema.fields ?? {})) {
    let value = raw[key];
    let usedKey = key;

    if (value === undefined) {
      for (const alias of fieldSchema.aliases ?? []) {
        if (raw[alias] !== undefined) {
          if (value !== undefined) {
            context.report({
              severity: 'warning',
              code: ErrorCodes.DATA_DUPLICATE,
              message: `\`${key}\` and its alias \`${alias}\` are both set`,
              path: joinPath(path, alias),
              hint: `Keep \`${key}\` and remove \`${alias}\`.`,
            });
            break;
          }
          value = raw[alias];
          usedKey = alias;
        }
      }
    }

    const fieldPath = joinPath(path, usedKey);
    const result = validateValue(value, fieldSchema, fieldPath, context);
    // Lists stay in the output even when empty, so downstream code can iterate
    // without guarding. Everything else is only kept when it has a value.
    if (result !== undefined) out[key] = result;
    resolvedKeys[key] = usedKey;
  }

  // Unknown keys: a typo silently dropping a section is the worst failure mode
  // of a content-driven generator, so it is reported with a suggestion.
  if (schema.allowExtra !== true) {
    const known = new Set(Object.keys(schema.fields ?? {}));
    const aliases = new Set(Object.values(schema.fields ?? {}).flatMap((field) => field.aliases ?? []));
    for (const key of Object.keys(raw)) {
      if (known.has(key) || aliases.has(key)) continue;
      const suggestion = closestValue(key, [...known, ...aliases]);
      context.report({
        severity: 'warning',
        code: ErrorCodes.DATA_UNKNOWN_KEY,
        message: `Unknown key \`${key}\``,
        path: joinPath(path, key),
        hint: suggestion
          ? `Did you mean \`${suggestion.value}\`?`
          : 'Remove it, or describe it under a custom section.',
      });
    }
  }

  if (schema.required && Object.keys(out).length === 0) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_MISSING,
      message: `\`${describeField(schema, path)}\` has no usable fields`,
      path: path || undefined,
    });
  }

  return out;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {Record<string, any>}
 */
function validateRecord(input, schema, path, context) {
  if (typeof input !== 'object' || Array.isArray(input)) {
    return typeError(input, schema, path, context, 'a mapping');
  }
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(/** @type {Record<string, any>} */ (input))) {
    const result = validateValue(value, /** @type {Field} */ (schema.value), joinPath(path, key), context);
    if (result !== undefined && !isEmptyValue(result)) out[key] = result;
  }
  return out;
}

/**
 * @param {unknown} input
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {any}
 */
function validateAny(input, schema, path, context) {
  /** @type {Array<{diagnostics: Diagnostic[], shapeMatches: boolean}>} */
  const failures = [];

  for (const variant of schema.variants ?? []) {
    // Try each variant on a scratch diagnostics buffer so that only the
    // successful interpretation reports anything.
    /** @type {Diagnostic[]} */
    const trial = [];
    const trialContext = {
      ...context,
      diagnostics: trial,
      report: (/** @type {any} */ entry) => trial.push({ ...entry, severity: context.promote(entry.severity ?? 'error') }),
    };
    const value = validateValue(input, variant, path, trialContext);
    if (!trial.some((entry) => entry.severity === 'error')) {
      context.diagnostics.push(...trial);
      return value;
    }
    failures.push({ diagnostics: trial, shapeMatches: shapeOf(variant) === shapeOf(input) });
  }

  // The most useful report comes from the variant that matches the value's
  // shape: `{ name: "Rust", level: "godlike" }` should complain about `level`,
  // not about the mapping being "an unsupported shape".
  const preferred = failures.find((failure) => failure.shapeMatches) ?? failures[failures.length - 1];
  if (preferred) {
    context.diagnostics.push(...preferred.diagnostics);
    return undefined;
  }

  context.report({
    severity: 'error',
    code: ErrorCodes.DATA_TYPE,
    message: `\`${describeField(schema, path)}\` has an unsupported shape`,
    path: path || undefined,
  });
  return undefined;
}

/**
 * The broad shape of a value, used to pick the most helpful diagnostic.
 *
 * @param {unknown} value
 * @returns {'string'|'number'|'boolean'|'array'|'object'|'empty'}
 */
function shapeOf(value) {
  if (value === null || value === undefined) return 'empty';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string') return 'string';
  if (type === 'number' || type === 'boolean') return type === 'boolean' ? 'boolean' : 'number';
  if (type === 'object') return 'object';
  return 'empty';
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * @param {any} value
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @param {string} expected
 * @returns {any}
 */
function typeError(value, schema, path, context, expected) {
  const received = Array.isArray(value) ? 'a list' : typeof value === 'object' ? 'a mapping' : `\`${String(value)}\``;
  context.report({
    severity: 'error',
    code: ErrorCodes.DATA_TYPE,
    message: `\`${describeField(schema, path)}\` should be ${expected}, received ${received}`,
    path: path || undefined,
    hint: schema.example ? `For example: ${schema.example}` : undefined,
  });
  return defaultFor(schema);
}

/**
 * @param {string} value
 * @param {Field} schema
 * @param {string} path
 * @param {any} context
 * @returns {string}
 */
function checkLength(value, schema, path, context) {
  if (schema.min !== undefined && value.length < schema.min) {
    context.report({
      severity: 'error',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is too short (${value.length} characters, minimum ${schema.min})`,
      path,
    });
  }
  if (schema.max !== undefined && value.length > schema.max) {
    context.report({
      severity: 'warning',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`${describeField(schema, path)}\` is longer than ${schema.max} characters and may be truncated`,
      path,
    });
  }
  return value;
}

/**
 * @param {Field} schema
 * @returns {any}
 */
export function defaultFor(schema) {
  if (schema.default !== undefined) return typeof schema.default === 'object' ? structuredClone(schema.default) : schema.default;
  // Lists always normalise to a list: templates and model code can then iterate
  // without guarding, which is what keeps the "no undefined" promise cheap.
  if (schema.kind === 'array') return [];
  if (schema.kind === 'boolean') return false;
  return undefined;
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * @param {string} path
 * @param {string} key
 * @returns {string}
 */
function joinPath(path, key) {
  if (!path) return key;
  if (/^\d+$/.test(key)) return `${path}[${key}]`;
  return `${path}.${key}`;
}

/**
 * @param {Field} schema
 * @param {string} path
 * @returns {string}
 */
function describeField(schema, path) {
  if (schema.label) return schema.label;
  if (schema.kind === 'array' && path.endsWith('[]')) return path.slice(0, -2) || 'value';
  return path || 'document';
}

/**
 * Levenshtein distance, used for "did you mean" hints. Small inputs only, so the
 * straightforward dynamic programming version is fine.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function distance(a, b) {
  if (a === b) return 0;
  /** @type {number[]} */
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    /** @type {number[]} */
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * @param {string} word
 * @param {string[]} candidates
 * @returns {{value: string, distance: number}|null}
 */
function closestValue(word, candidates) {
  let best = null;
  const threshold = Math.max(1, Math.floor(word.length / 3));
  for (const candidate of candidates) {
    const d = distance(word.toLowerCase(), candidate.toLowerCase());
    if (d <= threshold && (!best || d < best.distance)) best = { value: candidate, distance: d };
  }
  return best;
}

/**
 * @param {string} word
 * @param {string[]} candidates
 * @returns {string}
 */
function closest(word, candidates) {
  const best = closestValue(word, candidates);
  if (best) return ` Did you mean \`${best.value}\`?`;
  return ` Allowed values: ${candidates.map((candidate) => `\`${candidate}\``).join(', ')}.`;
}

/**
 * Suggest the closest key from a list. Used for "did you mean" hints when a
 * template manifest or a configuration file uses an unknown key.
 *
 * @param {string} word
 * @param {string[]} candidates
 * @returns {string|null}
 */
export function nearestKey(word, candidates) {
  const best = closestValue(word, candidates);
  return best ? best.value : null;
}

export { closestValue as closestMatch };
