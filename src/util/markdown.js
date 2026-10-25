/**
 * A small, dependency-free Markdown renderer.
 *
 * AutoPortfolio only needs the subset of Markdown that shows up in portfolio
 * copy: headings, emphasis, links, images, lists, quotes, rules, tables, code
 * blocks and inline code. Implementing it here keeps the install footprint at
 * zero runtime dependencies and lets us guarantee that output is always escaped
 * unless raw HTML was explicitly enabled in the configuration.
 *
 * @module util/markdown
 */

import { escapeHtml, raw, sanitizeHtml, SafeHtml } from './html.js';

/**
 * @typedef {object} MarkdownOptions
 * @property {boolean} [allowHtml]   Emit (sanitised) raw HTML blocks/inline.
 * @property {string} [linkTarget]   `target` attribute for external links.
 * @property {boolean} [breaks]      Treat single newlines as `<br>`.
 * @property {string} [headingBase]  Extra class prefix for headings.
 */

/**
 * Render Markdown to a `SafeHtml` string.
 *
 * @param {string} source
 * @param {MarkdownOptions} [options]
 * @returns {SafeHtml}
 */
export function renderMarkdown(source, options = {}) {
  if (!source) return raw('');
  const text = String(source).replace(/\r\n?/g, '\n').trim();
  if (!text) return raw('');

  const lines = text.split('\n');
  const html = renderBlocks(lines, options);
  return raw(html);
}

/**
 * Render inline Markdown (emphasis, links, code) without wrapping the result in
 * a paragraph. Used for taglines and other single-line contexts.
 *
 * @param {string} source
 * @param {MarkdownOptions} [options]
 * @returns {SafeHtml}
 */
export function renderInlineMarkdown(source, options = {}) {
  if (!source) return raw('');
  return raw(renderInline(String(source), { allowHtml: false, ...options }));
}

/**
 * Render Markdown to plain text (used for `<meta name="description">` and
 * JSON-LD summaries).
 * @param {string} source
 * @returns {string}
 */
export function markdownToText(source) {
  if (!source) return '';
  return String(source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1$2')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string[]} lines
 * @param {MarkdownOptions} options
 * @returns {string}
 */
function renderBlocks(lines, options) {
  /** @type {string[]} */
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Blank line
    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const language = fence[2] || '';
      /** @type {string[]} */
      const body = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
      const dataLanguage = language ? ` data-language="${escapeHtml(language)}"` : '';
      out.push(
        `<pre class="md-code"${dataLanguage}><code${languageClass}>${escapeHtml(body.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) {
      out.push('<hr class="md-rule">');
      index += 1;
      continue;
    }

    // ATX heading
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const id = slugifyHeading(heading[2]);
      out.push(
        `<h${level}${id ? ` id="${escapeHtml(id)}"` : ''} class="md-heading">${renderInline(heading[2], options)}</h${level}>`,
      );
      index += 1;
      continue;
    }

    // Table (header row followed by a separator row)
    if (
      index + 1 < lines.length &&
      line.includes('|') &&
      /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(lines[index + 1])
    ) {
      const { html, next } = renderTable(lines, index, options);
      out.push(html);
      index = next;
      continue;
    }

    // Blockquote
    if (/^\s{0,3}>/.test(line)) {
      /** @type {string[]} */
      const body = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        body.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote class="md-quote">${renderBlocks(body, options)}</blockquote>`);
      continue;
    }

    // Lists
    if (/^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/.test(line)) {
      const { html, next } = renderList(lines, index, options);
      out.push(html);
      index = next;
      continue;
    }

    // Raw HTML block
    if (options.allowHtml && /^\s{0,3}<([a-zA-Z][a-zA-Z0-9-]*)[\s>]/.test(line)) {
      /** @type {string[]} */
      const body = [];
      while (index < lines.length && !/^\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      out.push(sanitizeHtml(body.join('\n')));
      continue;
    }

    // Paragraph
    /** @type {string[]} */
    const paragraph = [];
    while (
      index < lines.length &&
      !/^\s*$/.test(lines[index]) &&
      !/^\s{0,3}(#{1,6}\s|>|`{3,}|~{3,})/.test(lines[index]) &&
      !/^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/.test(lines[index]) &&
      !/^\s{0,3}(?:[-*_]\s*){3,}$/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    const joined = paragraph.join(options.breaks ? '\n' : ' ');
    out.push(`<p>${renderInline(joined, options)}</p>`);
  }

  return out.join('\n');
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {MarkdownOptions} options
 * @returns {{html: string, next: number}}
 */
function renderList(lines, start, options) {
  const first = lines[start].match(/^(\s*)([-*+]|\d{1,9}[.)])\s+/);
  const baseIndent = first ? first[1].length : 0;
  const ordered = first ? /\d/.test(first[2]) : false;
  /** @type {string[]} */
  const items = [];
  let index = start;
  /** @type {string[]} */
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const itemText = current.join('\n');
    const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.*)$/s);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      items.push(
        `<li class="md-task"><input type="checkbox" disabled${checked ? ' checked' : ''}> ${renderInline(taskMatch[2], options)}</li>`,
      );
    } else {
      // An item may contain both its own text and indented block content
      // (usually a nested list): render the text inline, then the blocks.
      const [head, ...rest] = current;
      const inlineLines = rest.filter((entry) => !/^\s{2,}\S/.test(entry));
      const blockLines = rest.filter((entry) => /^\s{2,}\S/.test(entry));
      const inlineHtml = renderInline([head, ...inlineLines].join(' '), options);
      if (blockLines.length) {
        const nested = renderBlocks(blockLines.map((entry) => entry.replace(/^\s{2}/, '')), options);
        items.push(`<li>${inlineHtml}${nested}</li>`);
      } else {
        items.push(`<li>${inlineHtml}</li>`);
      }
    }
    current = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
    if (match && match[1].length === baseIndent) {
      flush();
      current.push(match[3]);
      index += 1;
      continue;
    }
    if (/^\s*$/.test(line)) {
      // A blank line ends the list unless the next line is an indented continuation.
      const nextLine = lines[index + 1];
      if (nextLine && /^\s{2,}\S/.test(nextLine)) {
        current.push('');
        index += 1;
        continue;
      }
      break;
    }
    if (/^\s{2,}\S/.test(line)) {
      // Keep the indentation relative to the item: it is what tells a nested
      // list apart from a plain continuation line.
      current.push(line.slice(baseIndent));
      index += 1;
      continue;
    }
    break;
  }
  flush();

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && first && Number.parseInt(first[2], 10) > 1 ? ` start="${Number.parseInt(first[2], 10)}"` : '';
  return { html: `<${tag} class="md-list"${startAttr}>${items.join('')}</${tag}>`, next: index };
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {MarkdownOptions} options
 * @returns {{html: string, next: number}}
 */
function renderTable(lines, start, options) {
  /**
   * @param {string} line
   * @returns {string[]}
   */
  const cells = (line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const header = cells(lines[start]);
  const alignments = cells(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });

  let index = start + 2;
  /** @type {string[]} */
  const rows = [];
  while (index < lines.length && lines[index].includes('|') && !/^\s*$/.test(lines[index])) {
    rows.push(lines[index]);
    index += 1;
  }

  /** @param {number} column */
  const alignmentAttr = (column) =>
    alignments[column] ? ` style="text-align:${alignments[column]}"` : '';

  const head = header
    .map((cell, column) => `<th${alignmentAttr(column)}>${renderInline(cell, options)}</th>`)
    .join('');
  const body = rows
    .map((row) => {
      const cellsHtml = cells(row)
        .map((cell, column) => `<td${alignmentAttr(column)}>${renderInline(cell, options)}</td>`)
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('');

  return {
    html: `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    next: index,
  };
}

/**
 * Inline Markdown: escapes HTML first, then applies inline rules.
 * @param {string} text
 * @param {MarkdownOptions} options
 * @returns {string}
 */
function renderInline(text, options) {
  /** @type {string[]} */
  const held = [];
  /**
   * Replace a piece of generated HTML with a placeholder so that later passes
   * (escaping, emphasis) cannot touch it. This is why link titles survive even
   * when the surrounding text is escaped.
   *
   * @param {string} html
   * @returns {string}
   */
  const hold = (html) => {
    held.push(html);
    return `\u0000HOLD${held.length - 1}\u0000`;
  };

  let value = String(text);

  // 1. Inline code first: nothing inside it is markdown.
  value = value.replace(/(`+)([\s\S]*?)\1/g, (_match, _ticks, code) =>
    hold(`<code class="md-inline-code">${escapeHtml(code.trim())}</code>`),
  );

  // 2. Images, before links: both use `[](...)`.
  value = value.replace(
    /!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)/g,
    (_match, alt, url, title) => {
      const src = stripAngle(url);
      if (!isSafeUrl(src)) return hold(escapeHtml(_match));
      return hold(
        `<img class="md-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${
          title ? ` title="${escapeHtml(title)}"` : ''
        } loading="lazy" decoding="async">`,
      );
    },
  );

  // 3. Links. Unsafe protocols stay visible as text instead of becoming a link.
  value = value.replace(
    /\[([^\]]+)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)/g,
    (_match, label, url, title) => {
      const href = stripAngle(url);
      if (!isSafeUrl(href)) return hold(`${escapeHtml(label)} (${escapeHtml(href)})`);
      const external = /^https?:\/\//i.test(href) && !isSameSite(href);
      const attributes = [
        `href="${escapeHtml(href)}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        external ? 'rel="noopener noreferrer"' : '',
        external && options.linkTarget ? `target="${escapeHtml(options.linkTarget)}"` : '',
      ].filter(Boolean);
      return hold(`<a ${attributes.join(' ')}>${formatLabel(label)}</a>`);
    },
  );

  // 4. Autolinks: <https://example.test>
  value = value.replace(/<((?:https?:|mailto:)[^\s>]+)>/g, (_match, url) =>
    hold(`<a href="${escapeHtml(url)}"${/^https?:/i.test(url) ? ' rel="noopener noreferrer"' : ''}>${escapeHtml(url)}</a>`),
  );

  // 5. Everything left is literal text.
  if (options.allowHtml) {
    value = value.replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => sanitizeHtml(tag));
    value = value.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  } else {
    value = escapeHtml(value);
  }

  // 6. Emphasis, strikethrough and line breaks.
  value = value.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  value = value.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
  value = value.replace(/(^|[\s(])_(?=\S)([^_]*?\S)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
  value = value.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  value = value.replace(/ {2,}\n/g, '<br>\n');
  value = value.replace(/\n/g, options.breaks ? '<br>\n' : '\n');

  // 7. Put the held HTML back.
  value = value.replace(/\u0000HOLD(\d+)\u0000/g, (_match, index) => held[Number(index)] ?? '');

  return value;
}

/**
 * Link text may contain emphasis, but not another link.
 * @param {string} label
 * @returns {string}
 */
function formatLabel(label) {
  return escapeHtml(label)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
}

/**
 * Only link to protocols that cannot execute code. Anything else (including
 * `javascript:` and `data:`) is rendered as plain text.
 *
 * @param {string} href
 * @returns {boolean}
 */
function isSafeUrl(href) {
  if (!href) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return /^(https?|mailto|tel|ftp):/i.test(href);
  if (href.startsWith('//')) return true;
  return true;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripAngle(value) {
  return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value;
}

/**
 * Relative links stay on site; everything else gets `rel="noopener"`.
 * @param {string} href
 * @returns {boolean}
 */
function isSameSite(href) {
  return /^\/(?!\/)/.test(href) || href.startsWith('#') || href.startsWith('?');
}

/**
 * Slug used for generated heading anchors.
 * @param {string} value
 * @returns {string}
 */
function slugifyHeading(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
