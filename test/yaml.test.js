/**
 * YAML parser tests.
 *
 * The last test in this file is a differential test: whenever the optional
 * `yaml` package is installed (it is a devDependency), every YAML file in the
 * repository is parsed by both implementations and the results are compared.
 * That is the strongest guarantee available that a hand written parser agrees
 * with the ecosystem on the documents people actually write.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseYaml, YamlError } from '../src/config/yaml.js';
import { REPO_ROOT, EXAMPLE_DIR } from './helpers.js';

test('parses scalars with types', () => {
  const value = parseYaml(`
string: hello
quoted: "with: colon"
single: 'it''s'
integer: 42
negative: -7
float: 3.5
exponent: 1e3
booleanTrue: true
booleanFalse: false
nothing: null
tilde: ~
empty:
`);
  assert.equal(value.string, 'hello');
  assert.equal(value.quoted, 'with: colon');
  assert.equal(value.single, "it's");
  assert.equal(value.integer, 42);
  assert.equal(value.negative, -7);
  assert.equal(value.float, 3.5);
  assert.equal(value.exponent, 1000);
  assert.equal(value.booleanTrue, true);
  assert.equal(value.booleanFalse, false);
  assert.equal(value.nothing, null);
  assert.equal(value.tilde, null);
  assert.equal(value.empty, null);
});

test('dates stay strings so they round-trip', () => {
  const value = parseYaml('start: 2024-06-01\nmonth: 2024-06\nversion: "1.0"\n');
  assert.equal(value.start, '2024-06-01');
  assert.equal(value.month, '2024-06');
  assert.equal(value.version, '1.0');
});

test('parses nested mappings and sequences', () => {
  const value = parseYaml(`
profile:
  name: Ada
  links:
    - github
    - gitlab
projects:
  - name: One
    tags: [a, b]
    metrics:
      - label: Stars
        value: 10
  - name: Two
    nested:
      deep:
        deeper: yes
`);
  assert.equal(value.profile.name, 'Ada');
  assert.deepEqual(value.profile.links, ['github', 'gitlab']);
  assert.equal(value.projects[0].name, 'One');
  assert.deepEqual(value.projects[0].tags, ['a', 'b']);
  assert.deepEqual(value.projects[0].metrics[0], { label: 'Stars', value: 10 });
  assert.equal(value.projects[1].nested.deep.deeper, true);
});

test('parses flow collections including nested ones', () => {
  const value = parseYaml('a: {x: 1, y: [2, 3]}\nb: [\n  one,\n  two,\n]\n');
  assert.deepEqual(value.a, { x: 1, y: [2, 3] });
  assert.deepEqual(value.b, ['one', 'two']);
});

test('block scalars keep newlines and respect chomping', () => {
  const value = parseYaml(`
literal: |
  line one
  line two
folded: >
  line one
  line two
keep: |-
  no trailing newline
indented: |
  first
    second
`);
  assert.equal(value.literal, 'line one\nline two\n');
  assert.equal(value.folded, 'line one line two\n');
  assert.equal(value.keep, 'no trailing newline');
  assert.equal(value.indented, 'first\n  second\n');
});

test('anchor, alias and merge key work together', () => {
  const value = parseYaml(`
base: &base
  name: Ada
  role: engineer
copy:
  <<: *base
  role: maintainer
list: &l [1, 2]
again: *l
`);
  assert.deepEqual(value.copy, { name: 'Ada', role: 'maintainer' });
  assert.deepEqual(value.again, [1, 2]);
  // Aliases are copies: mutating one must not change the other.
  value.again.push(3);
  assert.deepEqual(value.list, [1, 2]);
});

test('comments are stripped, but not inside strings', () => {
  const value = parseYaml('# leading\nkey: value # trailing\nurl: "https://x.test/#anchor"\nhash: "# not a comment"\n');
  assert.equal(value.key, 'value');
  assert.equal(value.url, 'https://x.test/#anchor');
  assert.equal(value.hash, '# not a comment');
});

test('a document may start with a directive marker', () => {
  assert.deepEqual(parseYaml('---\na: 1\n...\n'), { a: 1 });
});

test('empty documents parse to null', () => {
  assert.equal(parseYaml(''), null);
  assert.equal(parseYaml('# only a comment\n'), null);
});

test('errors report the offending line and column', () => {
  assert.throws(() => parseYaml('a: 1\n  b: 2\n'), (error) => {
    assert.ok(error instanceof YamlError, `expected YamlError, got ${error}`);
    assert.ok(error.line >= 2, `line was ${error.line}`);
    assert.ok(typeof error.message === 'string' && error.message.length > 0);
    return true;
  });

  assert.throws(() => parseYaml('\tkey: value\n'), /tab/i);
  assert.throws(() => parseYaml('a: "unterminated\n'), /unterminated|quote/i);
  assert.throws(() => parseYaml('a: *missing\n'), /unknown alias|missing/i);
});

test('deeply nested structures round-trip through the parser', () => {
  const source = `
a:
  b:
    c:
      - d: 1
        e:
          - 2
          - 3
      - f: []
`;
  const value = parseYaml(source);
  assert.deepEqual(value, { a: { b: { c: [{ d: 1, e: [2, 3] }, { f: [] }] } } });
});

test('matches the reference implementation on every YAML file in the repo', async (t) => {
  /** @type {any} */
  let reference;
  try {
    reference = await import('yaml');
  } catch {
    t.skip('the optional `yaml` package is not installed');
    return;
  }

  /** @type {string[]} */
  const files = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(full);
      else if (/\.ya?ml$/.test(entry.name)) files.push(full);
    }
  }
  await collect(REPO_ROOT);

  assert.ok(files.length > 0, 'expected at least one YAML file to compare');
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const mine = parseYaml(source);
    const theirs = reference.parse(source);
    assert.deepEqual(mine, theirs, `${path.relative(REPO_ROOT, file)} parsed differently`);
  }
});

test('the example project parses into the expected shape', async () => {
  const source = await fs.readFile(path.join(EXAMPLE_DIR, 'portfolio.yaml'), 'utf8');
  const data = parseYaml(source);
  assert.equal(data.profile.name, 'Eric Lönnrot');
  assert.equal(data.projects.length, 4);
  assert.deepEqual(data.projects[0].tags, ['systems', 'search', 'rust']);
  assert.match(data.projects[0].details, /Architecture/);
  assert.equal(data.sections[2].layout, 'stats');
});
