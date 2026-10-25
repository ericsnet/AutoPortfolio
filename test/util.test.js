/**
 * Unit tests for `src/util/*` — the primitives everything else is built on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { capitalize, humanize, oneLine, pluralize, titleCase, truncate, shortHash, listJoin } from '../src/util/text.js';
import { SafeHtml, attrs, classNames, escapeHtml, escapeXml, joinUrl, raw, sanitizeHtml, srcset, stringify } from '../src/util/html.js';
import { compareByRecency, formatDate, formatDuration, formatRange, parseDate, toDateTimeAttribute } from '../src/util/date.js';
import { isSlug, slugify, uniqueSlug } from '../src/util/slug.js';
import { contrastRatio, ensureContrast, isColor, mix, readableOn, toHex } from '../src/util/color.js';
import { minifyCss, minifyHtml, minifyJs } from '../src/util/minify.js';
import { formatBytes, toPosix } from '../src/util/fsx.js';
import { codeFrame, countDiagnostics, formatDiagnostic, sortDiagnostics } from '../src/util/errors.js';

test('text helpers normalise, truncate and pluralise', () => {
  assert.equal(oneLine('  a\n   b\t c  '), 'a b c');
  assert.equal(truncate('one two three four', 12), 'one two…');
  assert.equal(capitalize('hello there'), 'Hello there');
  assert.equal(titleCase('hello-world'), 'Hello World');
  assert.equal(humanize('myLongKey'), 'my long key');
  assert.equal(pluralize(1, 'project'), 'project');
  assert.equal(pluralize(2, 'project'), 'projects');
  assert.equal(listJoin(['a', 'b'], 'and'), 'a and b');
  assert.equal(listJoin(['a', 'b', 'c'], 'and'), 'a, b and c');
  assert.match(shortHash('anything'), /^[0-9a-f]{8}$/);
});

test('html helpers escape by default and pass SafeHtml through', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.equal(escapeXml('a & b < c'), 'a &amp; b &lt; c');
  assert.equal(stringify(raw('<b>ok</b>')), '<b>ok</b>');
  assert.ok(raw('x') instanceof SafeHtml);
  assert.equal(stringify(null), '');
  assert.equal(stringify(12), '12');
});

test('attrs and classNames produce usable markup fragments', () => {
  assert.equal(attrs({ href: '/x', hidden: false, target: '_blank' }), ' href="/x" target="_blank"');
  assert.equal(classNames('a', { b: true, c: false, d: undefined }), 'a b');
  assert.equal(joinUrl('https://x.test/', '/a/b'), 'https://x.test/a/b');
  assert.equal(
    srcset('photo.jpg', [
      { url: 'photo-400.jpg', width: 400 },
      { url: 'photo-800.jpg', width: 800 },
    ]),
    'photo-400.jpg 400w, photo-800.jpg 800w',
  );
});

test('sanitizeHtml strips scripts and event handlers', () => {
  const dirty = '<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:evil()">x</a>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.match(clean, /<p\s*>hi<\/p>/);
});

test('dates parse partial precision, ranges and durations', () => {
  assert.equal(parseDate('2024')?.precision, 'year');
  assert.equal(parseDate('2024-06')?.precision, 'month');
  assert.equal(parseDate('2024-06-15')?.precision, 'day');
  assert.equal(parseDate('present')?.present, true);
  assert.equal(parseDate('not a date'), null);

  const range = formatRange('2021-03', 'present', { locale: 'en-GB' });
  assert.equal(range.current, true);
  assert.match(range.label, /2021/);
  assert.match(range.label, /Present/);

  const duration = formatDuration('2020-01', '2022-01');
  assert.match(duration.label, /2 yrs/);
  assert.equal(duration.months, 24);

  assert.equal(toDateTimeAttribute(parseDate('2024-06')), '2024-06');
  assert.equal(toDateTimeAttribute(parseDate('2024')), '2024');
  assert.equal(toDateTimeAttribute(null), '');
  assert.ok(compareByRecency({ end: 'present' }, { end: '2020' }) < 0);
});

test('dates render in the requested locale', () => {
  // Strings and parsed dates are both accepted.
  assert.equal(formatDate('2024', { locale: 'en' }), '2024');
  assert.match(formatDate('2024-06', { locale: 'de-DE' }), /Juni 2024/);
  assert.match(formatDate(parseDate('2024-06-15'), { locale: 'en' }), /June 15, 2024/);
  assert.equal(formatDate(null), '');
});

test('slugs are stable, readable and unique', () => {
  assert.equal(slugify('Héllo, Wörld!'), 'hello-world');
  assert.equal(slugify('   '), '');
  assert.ok(isSlug('hello-world-2'));
  assert.ok(!isSlug('Hello World'));
  const used = new Set();
  assert.equal(uniqueSlug('post', used), 'post');
  assert.equal(uniqueSlug('post', used), 'post-2');
});

test('colour helpers keep text readable', () => {
  assert.ok(isColor('#fff'));
  assert.ok(isColor('rebeccapurple'));
  assert.ok(!isColor('not-a-colour'));
  assert.equal(toHex({ r: 255, g: 0, b: 0, a: 1 }), '#ff0000');
  assert.ok(contrastRatio('#000000', '#ffffff') > 20);
  const adjusted = ensureContrast('#eeeeee', '#ffffff', { target: 4.5 });
  assert.ok(contrastRatio(adjusted, '#ffffff') >= 4.5);
  assert.equal(readableOn('#111111', { light: '#fff', dark: '#000' }), '#fff');
  assert.equal(mix({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }, 0.5).r, 128);
});

test('minifiers shrink output without breaking it', () => {
  const html = minifyHtml('<div class="a">\n   <p>text</p>\n   <!-- drop me -->\n</div>\n');
  assert.ok(!html.includes('<!--'));
  assert.ok(html.includes('<p>text</p>'));
  assert.ok(html.length < 60);

  const css = minifyCss('/* c */\n.a {\n  color: red;\n}\n');
  assert.equal(css, '.a{color:red}');

  const js = minifyJs('// comment\n   const a = 1; // trailing\n/* block */\n');
  assert.equal(js, 'const a = 1;');
  // Newlines are kept: automatic semicolon insertion must not change meaning.
  assert.equal(minifyJs('let a = 1\nlet b = 2'), 'let a = 1\nlet b = 2');

  // Strings are never touched, even when they contain comment-like text.
  const tricky = minifyJs('const url = "https://x.test/a//b"; /* c */\n');
  assert.ok(tricky.includes('https://x.test/a//b'));
});

test('diagnostics sort by severity then location and format readably', () => {
  const diagnostics = [
    { severity: 'warning', code: 'AP0001', message: 'warn', source: 'b.yaml', line: 3 },
    { severity: 'error', code: 'AP0002', message: 'boom', source: 'a.yaml', line: 7, hint: 'fix it' },
  ];
  const sorted = sortDiagnostics(diagnostics);
  assert.equal(sorted[0].message, 'boom');
  assert.deepEqual(countDiagnostics(diagnostics), { errors: 1, warnings: 1, infos: 0 });
  const text = formatDiagnostic(sorted[0]);
  assert.match(text, /boom/);
  assert.match(text, /fix it/);
});

test('code frames point at the offending line', () => {
  const source = 'a: 1\nb: 2\nc: 3\n';
  const frame = codeFrame(source, 2, 4);
  assert.match(frame, /b: 2/);
  assert.match(frame, /\^/);
});

test('bytes and paths render in a readable form', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 kB');
  assert.equal(formatBytes(1536), '1.5 kB');
  assert.equal(toPosix('a/b'), 'a/b');
});
