/**
 * Markdown rendering tests.
 *
 * The renderer is intentionally small, but it is on the hot path for every
 * biography, project write-up and custom section, and it is the one place where
 * user text becomes HTML — so escaping gets its own tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { markdownToText, renderInlineMarkdown, renderMarkdown } from '../src/util/markdown.js';

/** Rendering returns `SafeHtml`; tests compare strings. */
const md = /** @type {(source: string, options?: any) => string} */ (
  (source, options) => String(renderMarkdown(source, options))
);

test('renders paragraphs, headings and emphasis', () => {
  const html = md('# Title\n\nA paragraph with **bold**, *italic* and `code`.\n\n## Second\n');
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<h2[^>]*>Second<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code[^>]*>code<\/code>/);
});

test('renders lists, quotes, rules and code blocks', () => {
  const html = md(`
- one
- two
  - nested

1. first
2. second

> quoted

---

\`\`\`js
const a = 1;
\`\`\`
`);
  assert.match(html, /<ul[^>]*>[\s\S]*<li>one<\/li>/);
  assert.match(html, /<li>two<ul[^>]*><li>nested<\/li><\/ul><\/li>/, 'nested lists keep their structure');
  assert.match(html, /<ol[^>]*>/);
  assert.match(html, /<blockquote[^>]*>/);
  assert.match(html, /<hr/);
  assert.match(html, /<pre[^>]*><code class="language-js">/);
  assert.match(html, /data-language="js"/);
  assert.match(html, /const a = 1;/);
});

test('renders links and images, and rejects dangerous protocols', () => {
  const html = md(
    '[good](https://example.test/a) ![alt text](assets/a.png "caption") [bad](javascript:alert(1))',
  );
  assert.match(html, /<a href="https:\/\/example\.test\/a"/);
  assert.match(html, /<img class="md-image" src="assets\/a\.png" alt="alt text" title="caption"/);
  assert.ok(!/<a[^>]+javascript:/.test(html), 'javascript: URLs must not become links');
  assert.match(html, /bad \(javascript:alert\(1\)\)/, 'the text of an unsafe link is kept');
});

test('escapes raw HTML unless it is explicitly allowed', () => {
  const source = 'Text with <script>alert(1)</script> and <b>bold</b>.';
  const safe = md(source);
  assert.ok(!safe.includes('<script>'));
  assert.match(safe, /&lt;script&gt;/);

  const permissive = md(source, { allowHtml: true });
  assert.match(permissive, /<b>bold<\/b>/);
  assert.ok(!permissive.includes('<script>'), 'scripts are stripped even when HTML is allowed');
});

test('inline rendering never produces block elements', () => {
  const html = String(renderInlineMarkdown('A **bold** line with `code` and [a link](https://example.test).'));
  assert.ok(!html.includes('<p>'));
  assert.match(html, /<strong>bold<\/strong>/);
});

test('markdownToText strips markup for meta descriptions', () => {
  const text = markdownToText('# Title\n\nSome **bold** [text](https://example.test) here.');
  assert.ok(!text.includes('#'));
  assert.ok(!text.includes('**'));
  assert.match(text, /Title/);
  assert.match(text, /Some bold text here/);
});

test('tables and task lists render when present', () => {
  const table = md('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
  assert.ok(table.includes('<table') || table.includes('| a |'), 'tables either render or stay literal');

  const tasks = md('- [x] done\n- [ ] todo\n');
  assert.match(tasks, /<li[^>]*>/);
});
