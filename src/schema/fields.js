/**
 * A tiny schema DSL.
 *
 * Schemas are plain objects, not classes: they are easy to inspect, easy to
 * serialise (the documentation generator walks them) and easy to extend without
 * touching the validator. `src/schema/validate.js` is the only consumer that
 * needs to know about `kind`.
 *
 * Two conventions run through the whole schema:
 *
 * - **Shorthands are welcome.** A list of skills may be a list of strings, a
 *   project may be a single mapping instead of a list. `single` and `from`
 *   describe those conveniences so the whole system can support them without
 *   special cases in the templates.
 * - **Aliases are first class.** `bio` and `biography`, `repo` and `github`,
 *   `tech` and `technologies` all resolve to the same canonical field.
 *
 * @module schema/fields
 */

/**
 * @typedef {object} Field
 * @property {string} kind              One of the kinds handled by the validator.
 * @property {string} [label]           Human readable name used in messages.
 * @property {string} [description]     One line used by `docs/` and `--help`.
 * @property {any} [default]            Value used when the field is absent.
 * @property {string} [example]         Example value shown in documentation.
 * @property {boolean} [required]
 * @property {string[]} [aliases]       Alternative keys accepted for this field.
 * @property {Field} [item]             Item schema for `array`.
 * @property {Field[]} [variants]       Alternatives for `any`.
 * @property {Record<string, Field>} [fields] Object schemas.
 * @property {Field} [value]            Value schema for `record`.
 * @property {string[]} [values]        Allowed values for `enum`.
 * @property {import('./fields.js').ValueAlias[]} [valueAliases]
 * @property {number} [min]             Minimum for numbers or string length.
 * @property {number} [max]             Maximum for numbers or string length.
 * @property {RegExp} [pattern]
 * @property {string} [patternHint]
 * @property {string} [formatHint]
 * @property {boolean} [single]         `array` also accepts a single value (default true).
 * @property {string|null} [unique]     `array` requires unique items (by key, or `null` for the value itself).
 * @property {string} [from]            `object` accepts a bare string as this field.
 * @property {boolean} [allowEmpty]     Accept an empty collection instead of dropping it.
 * @property {string} [deprecated]      Message shown when the key is used.
 * @property {(value: string, ctx: any) => string} [coerce] Extra normalisation for strings.
 * @property {boolean} [sensitive]      Not for display (documented only).
 */

/**
 * @typedef {object} ValueAlias
 * @property {string} value
 * @property {string[]} aliases
 */

/** @type {ValueAlias[]} */
export const BOOLEAN_VALUES = [
  { value: 'true', aliases: ['yes', 'y', 'on', '1'] },
  { value: 'false', aliases: ['no', 'n', 'off', '0'] },
];

/**
 * @param {string} kind
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export function field(kind, options = {}) {
  return { kind, ...options };
}

/**
 * A short, single-line string.
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const str = (options) => field('string', options);

/**
 * Multi-line plain text: newlines are preserved, trailing spaces removed.
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const text = (options) => field('text', options);

/**
 * Markdown source. Rendered by `src/util/markdown.js`.
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const markdown = (options) => field('markdown', options);

/**
 * A date in `YYYY`, `YYYY-MM`, `YYYY-MM-DD` or `present`.
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const date = (options) => field('date', options);

/**
 * An absolute URL (`https://…`) or a `mailto:` link.
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const url = (options) => field('url', options);

/** @param {Partial<Field>} [options] @returns {Field} */
export const email = (options) => field('email', options);

/** @param {Partial<Field>} [options] @returns {Field} */
export const phone = (options) => field('phone', options);

/** @param {Partial<Field>} [options] @returns {Field} */
export const color = (options) => field('color', options);

/** @param {Partial<Field>} [options] @returns {Field} */
export const bool = (options) => field('boolean', { default: false, ...options });

/** @param {Partial<Field>} [options] @returns {Field} */
export const num = (options) => field('number', options);

/** @param {Partial<Field>} [options] @returns {Field} */
export const int = (options) => field('integer', options);

/**
 * A string restricted to a set of values.
 *
 * @param {string[]} values
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const enumOf = (values, options) => field('enum', { values, ...options });

/**
 * A list of items. A single item is accepted unless `single: false`.
 *
 * @param {Field} item
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const list = (item, options) => field('array', { item, single: true, ...options });

/**
 * A mapping with a known set of keys.
 *
 * @param {Record<string, Field>} fields
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const obj = (fields, options) => field('object', { fields, ...options });

/**
 * A mapping with arbitrary keys (social links, custom link groups).
 *
 * @param {Field} value
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const dict = (value, options) => field('record', { value, ...options });

/**
 * A value that may take one of several shapes (a string or a mapping, for
 * example). The first variant that validates wins.
 *
 * @param {Field[]} variants
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const anyOf = (variants, options) => field('any', { variants, ...options });

/**
 * A list of named things. A bare string is turned into `{ name }`, so
 * `technologies: [Docker]` and `technologies: [{ name: Docker }]` produce the
 * same model — templates never have to know which spelling was used.
 *
 * @param {Record<string, Field>} extraFields
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const nameList = (extraFields = {}, options) =>
  list(
    obj({ name: str({ required: true, label: 'name' }), ...extraFields }, { from: 'name' }),
    options,
  );

/**
 * A list of strings, used for tags, keywords and highlights.
 *
 * @param {Partial<Field>} [options]
 * @returns {Field}
 */
export const strList = (options) => list(str({ label: 'value' }), options);

/**
 * Walk a schema and call `visit(field, path, parent)` for every field.
 *
 * @param {Field} schema
 * @param {(field: Field, path: string[], parent: Field|null) => void} visit
 * @param {string[]} [path]
 * @param {Field|null} [parent]
 */
export function walkFields(schema, visit, path = [], parent = null) {
  visit(schema, path, parent);
  if (schema.kind === 'object' && schema.fields) {
    for (const [key, child] of Object.entries(schema.fields)) {
      walkFields(child, visit, [...path, key], schema);
    }
  } else if (schema.kind === 'array' && schema.item) {
    walkFields(schema.item, visit, [...path, '[]'], schema);
  } else if (schema.kind === 'record' && schema.value) {
    walkFields(schema.value, visit, [...path, '*'], schema);
  } else if (schema.kind === 'any' && schema.variants) {
    for (const variant of schema.variants) walkFields(variant, visit, path, schema);
  }
}

/**
 * Look up a field by dotted path, for documentation and error messages.
 *
 * @param {Field} schema
 * @param {string} path
 * @returns {Field|null}
 */
export function findField(schema, path) {
  /** @type {Field|null} */
  let current = schema;
  for (const part of path.split('.')) {
    if (!current) return null;
    if (current.kind === 'any' && current.variants) {
      current = current.variants.map((variant) => findField(variant, part)).find(Boolean) ?? null;
      continue;
    }
    if (current.kind === 'array' && current.item) {
      current = current.item;
      if (part === '[]' || /^\d+$/.test(part)) continue;
    }
    if (current.kind === 'record' && current.value) {
      current = current.value;
      continue;
    }
    if (current.kind !== 'object' || !current.fields) return null;
    const direct = current.fields[part];
    if (direct) {
      current = direct;
      continue;
    }
    const aliased = Object.entries(current.fields).find(([, field]) => field.aliases?.includes(part));
    if (!aliased) return null;
    current = aliased[1];
  }
  return current ?? null;
}
