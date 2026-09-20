/**
 * TOML parser tests.
 *
 * TOML is supported because a portfolio document may live next to a tool that
 * already speaks it. The last test compares the parser against Python's
 * `tomllib` when it is available, which is a second, independent implementation
 * of the same specification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { parseToml, TomlError } from '../src/config/toml.js';

const exec = promisify(execFile);

test('parses key/value pairs of every scalar type', () => {
  const value = parseToml(`
name = "Portfolio"
title = 'single quoted'
count = 42
negative = -7
ratio = 0.5
large = 1_000
enabled = true
disabled = false
hex = 0xff
date = 2024-06-01
timestamp = 2024-06-01T10:30:00Z
`);
  assert.equal(value.name, 'Portfolio');
  assert.equal(value.title, 'single quoted');
  assert.equal(value.count, 42);
  assert.equal(value.negative, -7);
  assert.equal(value.ratio, 0.5);
  assert.equal(value.large, 1000);
  assert.equal(value.enabled, true);
  assert.equal(value.disabled, false);
  assert.equal(value.hex, 255);
  assert.equal(value.date, '2024-06-01');
  assert.equal(value.timestamp, '2024-06-01T10:30:00Z');
});

test('parses tables, nested tables and arrays of tables', () => {
  const value = parseToml(`
[profile]
name = "Ada"
location = "London"

[profile.links]
github = "https://github.com/ada"

[[projects]]
name = "One"
tags = ["a", "b"]

[[projects]]
name = "Two"
`);
  assert.equal(value.profile.name, 'Ada');
  assert.equal(value.profile.links.github, 'https://github.com/ada');
  assert.equal(value.projects.length, 2);
  assert.equal(value.projects[0].name, 'One');
  assert.deepEqual(value.projects[0].tags, ['a', 'b']);
  assert.equal(value.projects[1].name, 'Two');
});

test('parses inline tables, dotted keys and multi-line strings', () => {
  const value = parseToml(`
inline = { a = 1, b = "two" }
theme.colors.accent = "#4f46e5"
multi = """
line one
line two
"""
literal = '''
raw \\ text
'''
array = [
  1,
  2,
  3,
]
`);
  assert.deepEqual(value.inline, { a: 1, b: 'two' });
  assert.equal(value.theme.colors.accent, '#4f46e5');
  assert.equal(value.multi, 'line one\nline two\n');
  assert.equal(value.literal, 'raw \\ text\n');
  assert.deepEqual(value.array, [1, 2, 3]);
});

test('comments and blank lines are ignored', () => {
  const value = parseToml('# comment\n\nname = "x" # trailing\n');
  assert.deepEqual(value, { name: 'x' });
});

test('errors carry a line number', () => {
  assert.throws(() => parseToml('name = "unterminated\n'), (error) => {
    assert.ok(error instanceof TomlError);
    assert.equal(typeof error.line, 'number');
    return true;
  });
  assert.throws(() => parseToml('name "no equals"\n'), TomlError);
  assert.throws(() => parseToml('[unclosed\n'), TomlError);
  assert.throws(() => parseToml('a = 1\na = 2\n'), /duplicate/i);
});

test('matches Python tomllib when it is available', async (t) => {
  const source = `
title = "Differential"
count = 3
nested = { deep = { value = "x" } }

[profile]
name = "Ada"
weights = [0.5, 1.5]

[[projects]]
name = "One"
tags = ["a", "b"]

[[projects]]
name = "Two"
`;
  let reference;
  try {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'toml-')), 'input.toml');
    await fs.writeFile(file, source);
    const { stdout } = await exec('python3', [
      '-c',
      'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))',
      file,
    ]);
    reference = JSON.parse(stdout);
    await fs.rm(path.dirname(file), { recursive: true, force: true });
  } catch {
    t.skip('python3 with tomllib is not available');
    return;
  }

  assert.deepEqual(parseToml(source), reference);
});

test('the example configuration parses as TOML when converted', () => {
  // A small, realistic subset of what a configuration file looks like.
  const value = parseToml(`
data = "portfolio.yaml"
template = "developer"

[theme]
preset = "terminal"
accent = "#4ade80"

[[sections.order]]
`);
  assert.equal(value.theme.preset, 'terminal');
  assert.ok(Array.isArray(value.sections.order));
});
