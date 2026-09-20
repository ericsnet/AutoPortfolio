/**
 * JSON Schema export.
 *
 * The Field DSL already describes every key, its type, its aliases and its
 * documentation, so a JSON Schema can be derived from it mechanically. That
 * gives editors autocomplete and inline errors for `portfolio.yaml` and
 * `autoportfolio.config.yaml` without a second source of truth to maintain.
 *
 * `autoportfolio schema` prints the result.
 *
 * @module schema/json-schema
 */

import { DATA_VERSION, portfolioSchema } from './portfolio-schema.js';
import { configSchema } from './config-schema.js';

/** @typedef {import('./fields.js').Field} Field */

/**
 * Convert a schema to a JSON Schema document.
 *
 * @param {Field} schema
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.description]
 * @param {string} [options.id] `$id` for the document.
 * @returns {Record<string, any>}
 */
export function toJsonSchema(schema, options = {}) {
  const document = convert(schema, options);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...(options.id ? { $id: options.id } : {}),
    title: options.title ?? 'AutoPortfolio document',
    description: options.description,
    ...document,
  };
}

/**
 * The portfolio document schema, ready for editors.
 *
 * @returns {Record<string, any>}
 */
export function portfolioJsonSchema() {
  return toJsonSchema(portfolioSchema, {
    title: 'AutoPortfolio portfolio document',
    description: `The content of your portfolio. Data model version ${DATA_VERSION}.`,
    id: 'https://autoportfolio.dev/schema/portfolio-1.0.json',
  });
}

/**
 * The configuration file schema, ready for editors.
 *
 * @returns {Record<string, any>}
 */
export function configJsonSchema() {
  return toJsonSchema(configSchema, {
    title: 'AutoPortfolio configuration',
    description: 'How the site is built: template, theme, sections, output and deployment.',
    id: 'https://autoportfolio.dev/schema/config-1.0.json',
  });
}

/**
 * @param {Field} field
 * @param {Record<string, any>} [options]
 * @returns {Record<string, any>}
 */
function convert(field, options = {}) {
  /** @type {Record<string, any>} */
  const out = {};

  switch (field.kind) {
    case 'string':
    case 'text':
    case 'markdown':
      out.type = 'string';
      break;
    case 'boolean':
      out.type = 'boolean';
      break;
    case 'number':
      out.type = 'number';
      break;
    case 'integer':
      out.type = 'integer';
      break;
    case 'date':
      out.type = 'string';
      out.pattern = '^(present|now|current|\\d{4}(-\\d{2}(-\\d{2})?)?)$';
      out.examples = ['2024', '2024-06', '2024-06-01', 'present'];
      break;
    case 'url':
      out.type = 'string';
      out.format = 'uri';
      break;
    case 'email':
      out.type = 'string';
      out.format = 'email';
      break;
    case 'phone':
      out.type = 'string';
      break;
    case 'color':
      out.type = 'string';
      out.pattern = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';
      break;
    case 'enum':
      out.type = 'string';
      out.enum = field.values;
      break;
    case 'array':
      out.type = 'array';
      out.items = convert(/** @type {Field} */ (field.item), options);
      if (field.unique) out['x-unique'] = field.unique;
      break;
    case 'object': {
      out.type = 'object';
      /** @type {Record<string, any>} */
      const properties = {};
      /** @type {string[]} */
      const required = [];
      for (const [key, child] of Object.entries(field.fields ?? {})) {
        const converted = convert(child, options);
        if (child.aliases?.length) converted['x-aliases'] = child.aliases;
        properties[key] = converted;
        if (child.required) required.push(key);
      }
      out.properties = properties;
      if (required.length) out.required = required;
      out.additionalProperties = false;
      break;
    }
    case 'record':
      out.type = 'object';
      out.additionalProperties = convert(/** @type {Field} */ (field.value), options);
      break;
    case 'any':
      out.anyOf = (field.variants ?? []).map((variant) => convert(variant, options));
      break;
    default:
      out.type = 'string';
  }

  if (field.description) out.description = field.description;
  if (field.default !== undefined) out.default = field.default;
  if (field.example !== undefined) out.examples = [...(out.examples ?? []), field.example];
  if (field.min !== undefined) out[typeof field.min === 'number' && out.type === 'string' ? 'minLength' : 'minimum'] = field.min;
  if (field.max !== undefined) out[typeof field.max === 'number' && out.type === 'string' ? 'maxLength' : 'maximum'] = field.max;
  if (field.deprecated) out.deprecated = true;

  return out;
}
