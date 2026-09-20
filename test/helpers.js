/**
 * Shared test helpers.
 *
 * The tests build real projects in a temporary directory and run the real
 * pipeline; nothing here mocks the generator. Fixtures are written as strings
 * so each test can state exactly what it depends on.
 *
 * @module test/helpers
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/config/load.js';
import { generateSite } from '../src/generator/generator.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repository root, so tests can point at `examples/`. */
export const REPO_ROOT = path.resolve(HERE, '..');

/** The example project shipped with the repository. */
export const EXAMPLE_DIR = path.join(REPO_ROOT, 'examples', 'developer');

/**
 * @typedef {object} TempProject
 * @property {string} dir     Project directory.
 * @property {string} outDir  Output directory used by {@link buildFixture}.
 * @property {() => Promise<void>} cleanup
 */

/**
 * Write a project into a fresh temporary directory.
 *
 * @param {Record<string, string>} files Path relative to the project root.
 * @returns {Promise<TempProject>}
 */
export async function createTempProject(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoportfolio-test-'));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return {
    dir,
    outDir: path.join(dir, 'dist'),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Load a project directory.
 *
 * @param {string} dir
 * @param {import('../src/config/load.js').LoadOptions} [options]
 * @returns {Promise<any>}
 */
export function load(dir, options = {}) {
  return loadProject({ cwd: dir, ...options });
}

/**
 * Load and build a project directory.
 *
 * @param {string} dir
 * @param {import('../src/generator/generator.js').GenerateOptions} [options]
 * @returns {Promise<any>}
 */
export async function build(dir, options = {}) {
  const project = await load(dir);
  return generateSite(project, { clean: true, ...options });
}

/**
 * Read a generated file.
 *
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<string>}
 */
export function read(dir, file) {
  return fs.readFile(path.join(dir, file), 'utf8');
}

/**
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function readBinary(dir, file) {
  const buffer = await fs.readFile(path.join(dir, file));
  return buffer.toString('base64');
}

/**
 * Does the output file exist?
 *
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function exists(dir, file) {
  try {
    await fs.access(path.join(dir, file));
    return true;
  } catch {
    return false;
  }
}

/**
 * List every file in a directory, relative and sorted.
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  }
  await walk(dir);
  return out.sort();
}

/**
 * Filter diagnostics by severity.
 *
 * @param {Array<{severity: string, code: string, message: string}>} diagnostics
 * @param {string} severity
 * @returns {Array<{severity: string, code: string, message: string}>}
 */
export function bySeverity(diagnostics, severity) {
  return diagnostics.filter((entry) => entry.severity === severity);
}

/**
 * The smallest project that produces a meaningful site.
 *
 * @param {Record<string, string>} [overrides]
 * @returns {Record<string, string>}
 */
export function minimalProject(overrides = {}) {
  return {
    'autoportfolio.config.yaml': 'template: modern\n',
    'portfolio.yaml': `profile:\n  name: Test Person\n  headline: Tester\nprojects:\n  - name: One\n    description: First project.\n`,
    ...overrides,
  };
}

/** A project that exercises every section at least once. */
export const FULL_PROJECT = {
  'autoportfolio.config.yaml': `data: portfolio.yaml
template: modern
site:
  baseUrl: https://example.test
  language: en
theme:
  preset: default
  mode: auto
  accent: "#2563eb"
sections:
  order: [about, skills, technologies, projects, experience, education, certifications, contact]
build:
  output: dist
  minify: true
  prettyUrls: true
`,
  'portfolio.yaml': `version: "1.0"
meta:
  title: Full Person — test portfolio
  description: Everything a portfolio can contain, used to exercise every code path.
  keywords: [testing, fixtures]
  language: en
  siteUrl: https://example.test
profile:
  name: Full Person
  headline: Engineer of everything
  shortBio: One line about me.
  about: |
    A longer **markdown** introduction with a [link](https://example.test).
  location: Berlin, Germany
  availability: open-to-offers
  yearsOfExperience: 7
contact:
  email: full@example.test
  phone: "+49 30 123456"
  timezone: Europe/Berlin
  message: Say hello.
social:
  github: https://github.com/full
  mastodon:
    url: https://mastodon.social/@full
    handle: "@full"
skills:
  - name: Testing
    category: Engineering
    level: expert
    years: 7
  - name: Documentation
    category: Communication
languages:
  - name: TypeScript
    level: expert
technologies:
  - name: PostgreSQL
    url: https://www.postgresql.org
  - Docker
projects:
  - name: First
    id: first
    tagline: The first one.
    description: A project with details.
    details: |
      ## Deep dive

      Some more text.
    features: [Fast, Small]
    technologies: [TypeScript, PostgreSQL]
    github: https://github.com/full/first
    liveUrl: https://first.example.test
    start: 2023-01
    status: active
    featured: true
    tags: [tooling]
    metrics:
      - label: Stars
        value: 1.2k
  - name: Second
    description: A second project without a repository.
    start: 2022-05
    end: 2023-02
    status: archived
experience:
  - company: Example GmbH
    role: Senior engineer
    start: 2021-03
    end: present
    summary: Building things.
    highlights:
      - Shipped a thing
    technologies: [TypeScript]
education:
  - institution: Example University
    degree: MSc
    field: Computer Science
    start: 2015-10
    end: 2017-09
certifications:
  - name: Example Certified
    issuer: Example Org
    date: 2023-04
    credentialUrl: https://certs.example.test/verify
awards:
  - title: Best thing
    issuer: Example GmbH
    date: 2024-01
publications:
  - title: A paper
    publisher: ExampleConf
    date: 2020-06
    authors: [Full Person]
    doi: 10.1000/xyz
testimonials:
  - quote: Great colleague.
    author: Someone Else
    role: Manager
    company: Example GmbH
spokenLanguages:
  - name: German
    proficiency: native
sections:
  - title: Speaking
    id: speaking
    layout: timeline
    items:
      - title: A talk
        subtitle: ExampleConf
        date: 2024-05
  - title: Numbers
    id: numbers
    layout: stats
    items:
      - value: "42"
        label: Answers
`,
};
