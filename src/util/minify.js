/**
 * Conservative minifiers.
 *
 * These only remove whitespace and formatting that can never change rendering.
 * Risky transformations (renaming, tree shaking, rewriting expressions) are out
 * of scope on purpose: a portfolio must never break because of a clever
 * optimiser.
 *
 * @module util/minify
 */

/**
 * Tags whose contents must never be touched.
 * @type {RegExp}
 */
const PRESERVE = /<(pre|textarea|script|style|code)\b[\s\S]*?<\/\1>/gi;

/**
 * Collapse whitespace in an HTML document.
 *
 * @param {string} html
 * @param {object} [options]
 * @param {boolean} [options.removeComments] Strip ordinary HTML comments (default true).
 * @returns {string}
 */
export function minifyHtml(html, options = {}) {
  const removeComments = options.removeComments !== false;
  /** @type {string[]} */
  const preserved = [];

  let output = html.replace(PRESERVE, (match) => {
    preserved.push(match);
    return `\u0000PRESERVED${preserved.length - 1}\u0000`;
  });

  if (removeComments) {
    output = output.replace(/<!--(?!\[if)(?!\s*<)[\s\S]*?-->/g, '');
  }

  // Whitespace between block elements is not significant, but a single space
  // between two inline elements is: `<a>a</a> <a>b</a>` must not become `ab`.
  // Runs that contain a newline are formatting, runs that do not are content.
  output = output
    .replace(/>[ \t]*\n[ \t]*</g, '><')
    .replace(/>[ \t]{2,}</g, '> <')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

  output = output.replace(/\u0000PRESERVED(\d+)\u0000/g, (_match, index) => preserved[Number(index)] ?? '');
  return output;
}

/**
 * Collapse whitespace and comments in a stylesheet.
 *
 * @param {string} css
 * @returns {string}
 */
export function minifyCss(css) {
  /** @type {string[]} */
  const urls = [];
  let output = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, quote, url) => {
    urls.push(`${quote}${url}${quote}`);
    return `url(\u0000URL${urls.length - 1}\u0000)`;
  });

  output = output
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{};:,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .replace(/\s*!\s*important/g, '!important')
    .trim();

  output = output.replace(/url\(\u0000URL(\d+)\u0000\)/g, (_match, index) => `url(${urls[Number(index)]})`);
  return output;
}

/**
 * Strip comments, indentation and blank lines from JavaScript.
 *
 * Newlines are preserved on purpose. Automatic semicolon insertion means that
 * joining `return` and its argument changes behaviour, and a portfolio is not
 * worth breaking for a few saved bytes. Comments are removed only outside
 * strings, template literals and regular expressions.
 *
 * @param {string} js
 * @returns {string}
 */
export function minifyJs(js) {
  /** @type {string[]} */
  const out = [];
  let index = 0;
  /** @type {'code'|'single'|'double'|'template'|'regex'|'line'|'block'} mode = 'code' */
  let mode = 'code';
  let previous = '';

  /** Whether a `/` starts a regular expression rather than a division. */
  const startsRegex = () => {
    const trimmed = previous.trimEnd();
    if (!trimmed) return true;
    return /(?:^|[=(,:[!&|?{};+\-*%^~<>]|\b(?:return|typeof|instanceof|in|of|case|delete|void|new|do|else|yield|await))$/.test(
      trimmed,
    );
  };

  while (index < js.length) {
    const char = js[index];
    const next = js[index + 1];

    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code';
        previous += char;
      }
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (mode === 'single' || mode === 'double' || mode === 'template') {
      previous += char;
      if (char === '\\') {
        previous += next ?? '';
        index += 2;
        continue;
      }
      if ((mode === 'single' && char === "'") || (mode === 'double' && char === '"') || (mode === 'template' && char === '`')) {
        mode = 'code';
      }
      index += 1;
      continue;
    }
    if (mode === 'regex') {
      previous += char;
      if (char === '\\') {
        previous += next ?? '';
        index += 2;
        continue;
      }
      if (char === '/') mode = 'code';
      index += 1;
      continue;
    }

    // mode === 'code'
    if (char === '/' && next === '/') {
      mode = 'line';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      mode = 'block';
      index += 2;
      continue;
    }
    if (char === '/' && startsRegex()) {
      mode = 'regex';
      previous += char;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      mode = char === '"' ? 'double' : char === "'" ? 'single' : 'template';
      previous += char;
      index += 1;
      continue;
    }
    previous += char;
    index += 1;
  }

  for (const line of previous.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return out.join('\n');
}

/**
 * Minify a file based on its extension.
 *
 * @param {string} content
 * @param {string} file
 * @param {boolean} [enabled]
 * @returns {string}
 */
export function minifyByExtension(content, file, enabled = true) {
  if (!enabled) return content;
  if (file.endsWith('.html') || file.endsWith('.htm')) return minifyHtml(content);
  if (file.endsWith('.css')) return minifyCss(content);
  if (file.endsWith('.js') || file.endsWith('.mjs')) return minifyJs(content);
  return content;
}
