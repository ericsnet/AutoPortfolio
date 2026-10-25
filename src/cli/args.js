/**
 * A small, predictable argument parser.
 *
 * Supports `--flag`, `--key=value`, `--key value`, short aliases (`-o dist`),
 * repeated flags, and `--` to stop parsing. It never guesses: an unknown flag is
 * an error, which keeps typos from silently changing a build.
 *
 * @module cli/args
 */

import { AutoPortfolioError, ErrorCodes } from '../util/errors.js';

/**
 * @typedef {object} OptionSpec
 * @property {string} name        Canonical name (`output`).
 * @property {string[]} [aliases] Other spellings (`out`, `o`).
 * @property {'string'|'boolean'|'number'} [type]
 * @property {string} [description]
 * @property {string} [placeholder]
 * @property {boolean} [multiple]
 * @property {unknown} [default]
 */

/**
 * @param {string[]} argv
 * @param {OptionSpec[]} spec
 * @returns {{options: Record<string, any>, positionals: string[]}}
 */
export function parseArgs(argv, spec) {
  /** @type {Map<string, OptionSpec>} */
  const lookup = new Map();
  for (const option of spec) {
    lookup.set(option.name, option);
    for (const alias of option.aliases ?? []) lookup.set(alias, option);
  }

  /** @type {Record<string, any>} */
  const options = {};
  for (const option of spec) {
    if (option.default !== undefined) options[option.name] = option.default;
    if (option.multiple) options[option.name] = option.default ?? [];
  }

  /** @type {string[]} */
  const positionals = [];
  let index = 0;
  let onlyPositionals = false;

  while (index < argv.length) {
    const argument = argv[index];

    if (onlyPositionals) {
      positionals.push(argument);
      index += 1;
      continue;
    }
    if (argument === '--') {
      onlyPositionals = true;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) {
      const [name, inlineValue] = splitOption(argument.slice(2));
      const option = lookup.get(name);
      if (!option) throw unknownOption(argument, spec);
      if (option.type === 'boolean') {
        options[option.name] = inlineValue === undefined ? true : inlineValue !== 'false';
        index += 1;
        continue;
      }
      const value = inlineValue ?? argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new AutoPortfolioError(`Option \`--${name}\` needs a value`, {
          code: ErrorCodes.INVALID_ARGUMENT,
          hint: option.placeholder ? `For example: --${name} ${option.placeholder}` : undefined,
        });
      }
      assign(options, option, value);
      index += inlineValue === undefined ? 2 : 1;
      continue;
    }
    if (argument.startsWith('-') && argument.length > 1) {
      const name = argument.slice(1);
      const option = lookup.get(name);
      if (!option) throw unknownOption(argument, spec);
      if (option.type === 'boolean') {
        options[option.name] = true;
        index += 1;
        continue;
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new AutoPortfolioError(`Option \`-${name}\` needs a value`, { code: ErrorCodes.INVALID_ARGUMENT });
      }
      assign(options, option, value);
      index += 2;
      continue;
    }

    positionals.push(argument);
    index += 1;
  }

  return { options, positionals };
}

/**
 * @param {string} value
 * @returns {[string, string|undefined]}
 */
function splitOption(value) {
  const equals = value.indexOf('=');
  if (equals === -1) return [value, undefined];
  return [value.slice(0, equals), value.slice(equals + 1)];
}

/**
 * @param {Record<string, any>} options
 * @param {OptionSpec} option
 * @param {string} raw
 */
function assign(options, option, raw) {
  let value = raw;
  if (option.type === 'number') {
    value = Number(raw);
    if (Number.isNaN(value)) {
      throw new AutoPortfolioError(`Option \`--${option.name}\` expects a number but received \`${raw}\``, {
        code: ErrorCodes.INVALID_ARGUMENT,
      });
    }
  }
  if (option.multiple) {
    options[option.name] = [...(options[option.name] ?? []), value];
    return;
  }
  options[option.name] = value;
}

/**
 * @param {string} argument
 * @param {OptionSpec[]} spec
 * @returns {AutoPortfolioError}
 */
function unknownOption(argument, spec) {
  const suggestions = spec
    .flatMap((option) => [option.name, ...(option.aliases ?? [])])
    .filter((name) => name.startsWith(argument.replace(/^-+/, '').slice(0, 3)))
    .slice(0, 3);
  return new AutoPortfolioError(`Unknown option \`${argument}\``, {
    code: ErrorCodes.INVALID_ARGUMENT,
    hint: suggestions.length ? `Did you mean --${suggestions[0]}?` : 'Run with `--help` to see the available options.',
  });
}

/**
 * Render a `--help` block for a command.
 *
 * @param {object} options
 * @param {string} options.usage
 * @param {string} options.summary
 * @param {OptionSpec[]} options.spec
 * @param {boolean} [options.color]
 * @returns {string}
 */
export function renderHelp(options) {
  /** @type {string[]} */
  const lines = [options.summary, '', `Usage: ${options.usage}`, ''];
  const rows = options.spec.map((option) => {
    const flags = [`--${option.name}`, ...(option.aliases ?? []).map((alias) => (alias.length === 1 ? `-${alias}` : `--${alias}`))];
    const value = option.type === 'boolean' ? '' : option.placeholder ? ` <${option.placeholder}>` : ' <value>';
    return [flags.join(', ') + value, option.description ?? ''];
  });
  const width = rows.reduce((max, [flags]) => Math.max(max, flags.length), 0);
  for (const [flags, description] of rows) {
    lines.push(`  ${flags.padEnd(width)}  ${description}`);
  }
  return lines.join('\n');
}

export const GLOBAL_OPTIONS = /** @type {OptionSpec[]} */ ([
  { name: 'help', aliases: ['h'], type: 'boolean', description: 'Show this help.' },
  { name: 'version', aliases: ['v'], type: 'boolean', description: 'Print the version and exit.' },
  { name: 'verbose', type: 'boolean', description: 'Print debug information, including stack traces.' },
  { name: 'quiet', aliases: ['q'], type: 'boolean', description: 'Only print errors.' },
  { name: 'no-color', type: 'boolean', description: 'Disable coloured output.' },
  { name: 'json', type: 'boolean', description: 'Print machine readable output.' },
]);
