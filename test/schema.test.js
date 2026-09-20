/**
 * Schema tests: validation, normalisation and the error messages they produce.
 *
 * These are the tests that protect the promise "a typo tells you where it is"
 * and "the same document always produces the same model".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DATA_VERSION, portfolioSchema } from '../src/schema/portfolio-schema.js';
import { configSchema, DEFAULT_CONFIG_FILENAMES } from '../src/schema/config-schema.js';
import { validateDocument } from '../src/schema/validate.js';
import { normalizePortfolio, normalizeConfig } from '../src/model/normalize.js';
import { portfolioJsonSchema, configJsonSchema } from '../src/schema/json-schema.js';

/** @param {any} input @param {any} [schema] @param {any} [options] */
function validate(input, schema = portfolioSchema, options = {}) {
  return validateDocument(input, schema, options);
}

/** @param {Array<{severity: string, code: string, message: string, path?: string, hint?: string}>} diagnostics @param {string} code */
function find(diagnostics, code) {
  return diagnostics.find((entry) => entry.code === code);
}

test('the document version is stated in one place', () => {
  assert.equal(DATA_VERSION, '1.0');
  assert.ok(DEFAULT_CONFIG_FILENAMES.includes('autoportfolio.config.yaml'));
});

test('a minimal document validates and fills defaults', () => {
  const { value, diagnostics } = validate({ profile: { name: 'Ada' } });
  assert.deepEqual(diagnostics, []);
  assert.equal(value.profile.name, 'Ada');
  assert.deepEqual(value.projects, []);
  assert.deepEqual(value.skills, []);
  assert.deepEqual(value.sections, []);
  assert.equal(value.version, undefined);
});

test('missing required fields are reported with a path', () => {
  const { diagnostics } = validate({ profile: { name: 'Ada' }, projects: [{ description: 'no name' }] });
  const error = find(diagnostics, 'AP2002');
  assert.ok(error, 'expected a missing-field diagnostic');
  assert.equal(error.path, 'projects[0].name');
  assert.equal(error.severity, 'error');
});

test('an empty document is reported rather than silently accepted', () => {
  const { diagnostics } = validate(null);
  assert.equal(diagnostics[0].code, 'AP2007');
  assert.equal(diagnostics[0].severity, 'error');
});

test('unknown keys get a suggestion', () => {
  const { diagnostics } = validate({ profile: { name: 'Ada', headlien: 'typo' } });
  const warning = find(diagnostics, 'AP2005');
  assert.ok(warning);
  assert.equal(warning.path, 'profile.headlien');
  assert.match(String(warning.hint), /headline/);
});

test('aliases resolve to the canonical key', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada', bio: 'short bio' },
    projects: [{ name: 'One', slug: 'one', repo: 'https://github.com/a/b', url: 'https://one.test' }],
  });
  assert.equal(value.profile.shortBio, 'short bio');
  assert.equal(value.projects[0].id, 'one');
  assert.equal(value.projects[0].github, 'https://github.com/a/b');
  assert.equal(value.projects[0].liveUrl, 'https://one.test');
  assert.deepEqual(diagnostics, []);
});

test('type errors name what was expected', () => {
  const { diagnostics } = validate({ profile: { name: ['not', 'a string'] } });
  const error = find(diagnostics, 'AP2003');
  assert.ok(error);
  assert.match(error.message, /should be a string/);
});

test('dates are normalised and invalid ones rejected', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada' },
    experience: [
      { company: 'A', role: 'Engineer', start: 'March 2021', end: 'present' },
      { company: 'B', role: 'Dev', start: '2019' },
      { company: 'C', role: 'Intern', start: 'yesterday' },
    ],
  });
  assert.equal(value.experience[0].start, '2021-03');
  assert.equal(value.experience[0].end, 'present');
  assert.equal(value.experience[1].start, '2019');
  assert.equal(value.experience[2].start, 'yesterday');
  const error = find(diagnostics, 'AP2004');
  assert.equal(error.path, 'experience[2].start');
  assert.match(String(error.hint), /YYYY/);
});

test('URLs must be absolute and use http(s)', () => {
  const { diagnostics } = validate({
    profile: { name: 'Ada' },
    projects: [
      { name: 'One', liveUrl: 'one.test' },
      { name: 'Two', liveUrl: 'ftp://example.test/files' },
    ],
  });
  const errors = diagnostics.filter((entry) => entry.code === 'AP2004');
  assert.equal(errors.length, 2);
  assert.match(String(errors[0].hint), /https:\/\//);
});

test('email and phone validation is friendly about formatting', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada' },
    contact: { email: 'mailto:ada@example.test', phone: '+49 (30) 123-456' },
  });
  assert.equal(value.contact.email, 'ada@example.test');
  assert.equal(value.contact.phone, '+49 (30) 123-456');
  assert.deepEqual(diagnostics, []);

  const bad = validate({ profile: { name: 'Ada' }, contact: { email: 'not-an-email' } });
  assert.equal(find(bad.diagnostics, 'AP2004').path, 'contact.email');
});

test('enums accept any casing and report the allowed values', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada', availability: 'Open To Offers' },
    skills: [{ name: 'Rust', level: 'EXPERT' }],
  });
  assert.equal(value.profile.availability, 'open-to-offers');
  assert.equal(value.skills[0].level, 'expert');
  assert.deepEqual(diagnostics, []);

  const bad = validate({ profile: { name: 'Ada' }, skills: [{ name: 'Rust', level: 'godlike' }] });
  const error = find(bad.diagnostics, 'AP2004');
  assert.match(error.message, /beginner/);
  assert.equal(error.path, 'skills[0].level');
  assert.match(String(error.hint), /Allowed values/);
});

test('string lists, name lists and single values are all accepted', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada' },
    skills: ['Rust', 'Go'],
    technologies: [{ name: 'PostgreSQL', url: 'https://www.postgresql.org' }, 'Docker'],
    projects: [{ name: 'One', tags: 'solo-tag', technologies: 'Rust' }],
  });
  assert.deepEqual(value.skills.map((skill) => skill.name), ['Rust', 'Go']);
  assert.equal(value.technologies[1].name, 'Docker');
  assert.deepEqual(value.projects[0].tags, ['solo-tag']);
  assert.deepEqual(value.projects[0].technologies.map((technology) => technology.name), ['Rust']);
  assert.deepEqual(diagnostics, []);
});

test('duplicate entries are reported and dropped', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada' },
    skills: [{ name: 'Rust' }, { name: 'rust' }],
  });
  assert.equal(value.skills.length, 1);
  const warning = find(diagnostics, 'AP2006');
  assert.ok(warning);
  assert.equal(warning.severity, 'warning');
});

test('unknown keys inside entries are reported too', () => {
  const { diagnostics } = validate({
    profile: { name: 'Ada' },
    projects: [{ name: 'One', technolgies: ['Rust'] }],
  });
  const warning = find(diagnostics, 'AP2005');
  assert.equal(warning.path, 'projects[0].technolgies');
  assert.match(String(warning.hint), /technologies/);
});

test('strict mode promotes warnings to errors', () => {
  const input = { profile: { name: 'Ada', headlien: 'typo' } };
  assert.equal(find(validate(input).diagnostics, 'AP2005').severity, 'warning');
  assert.equal(find(validate(input, portfolioSchema, { strict: true }).diagnostics, 'AP2005').severity, 'error');
});

test('custom sections accept every layout and normalise their items', () => {
  const { value, diagnostics } = validate({
    profile: { name: 'Ada' },
    sections: [
      { title: 'Speaking', layout: 'milestones', items: [{ title: 'A talk', date: '2024-05' }] },
      { title: 'Numbers', layout: 'stats', items: [{ value: '42', label: 'Answers' }] },
    ],
  });
  assert.equal(value.sections[0].layout, 'timeline');
  assert.equal(value.sections[1].layout, 'stats');
  assert.deepEqual(diagnostics, []);
});

test('markdown fields keep their layout but lose trailing whitespace', () => {
  const { value } = validate({
    profile: { name: 'Ada', about: 'First line   \n\n\n\nSecond line\n' },
  });
  assert.equal(value.profile.about, 'First line\n\nSecond line');
});

test('normalisation produces a stable, fully populated model', () => {
  const { value } = validate({
    profile: { name: 'Ada Lovelace', headline: 'Analyst' },
    projects: [
      { name: 'B project', start: '2020' },
      { name: 'A project', start: '2024', featured: true },
      { name: 'Draft project', draft: true },
    ],
    experience: [
      { company: 'Old', role: 'Junior', start: '2015', end: '2018' },
      { company: 'New', role: 'Senior', start: '2021', end: 'present' },
    ],
    sections: [{ title: 'Speaking' }],
  });
  const document = normalizePortfolio(value);
  assert.deepEqual(document.projects.map((project) => project.id), ['a-project', 'b-project']);
  assert.equal(document.projects[0].url, '/projects/a-project/');
  assert.equal(document.experience[0].company, 'New');
  assert.equal(document.experience[1].company, 'Old');
  assert.equal(document.sections[0].anchor, 'speaking');
  assert.equal(document.sections[0].layout, 'cards');
  assert.equal(document.profile.avatar, null);
  assert.equal(document.meta.language, 'en');
  assert.ok(Array.isArray(document.links));
});

test('normalisation keeps drafts when asked', () => {
  const { value } = validate({
    profile: { name: 'Ada' },
    projects: [{ name: 'Hidden', draft: true }],
  });
  assert.equal(normalizePortfolio(value).projects.length, 0);
  assert.equal(normalizePortfolio(value, { includeDrafts: true }).projects.length, 1);
});

test('image shorthands normalise to the same shape', () => {
  const { value } = validate({
    profile: { name: 'Ada', avatar: 'assets/me.jpg' },
    projects: [{ name: 'One', cover: { src: 'assets/one.png', alt: 'One screenshot' } }],
  });
  const document = normalizePortfolio(value);
  assert.equal(document.profile.avatar.src, 'assets/me.jpg');
  assert.equal(document.profile.avatar.alt, 'Ada'); // alt falls back to the name
  assert.equal(document.projects[0].cover.alt, 'One screenshot');
});

test('the configuration schema fills every default', () => {
  const { value, diagnostics } = validate({}, configSchema);
  assert.deepEqual(diagnostics, []);
  const config = normalizeConfig(value);
  assert.equal(config.template, 'modern');
  assert.equal(config.build.output, 'dist');
  assert.equal(config.build.minify, true);
  assert.equal(config.theme.preset, 'default');
  assert.equal(config.theme.mode, 'auto');
  assert.equal(config.sections.nav, true);
  assert.equal(config.serve.port, 4173);
  assert.equal(config.deploy.target, 'static');
});

test('configuration overrides are validated like any other value', () => {
  const { value, diagnostics } = validate({ theme: { mode: 'dim' }, build: { projectPages: 'sometimes' } }, configSchema);
  const errors = diagnostics.filter((entry) => entry.severity === 'error');
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => error.path === 'theme.mode'));
  assert.ok(errors.some((error) => error.path === 'build.projectPages'));
  // The rest of the configuration still normalises, so one typo does not hide
  // the other problems in the file.
  assert.equal(normalizeConfig(value).build.output, 'dist');
});

test('JSON Schema export describes the documented keys', () => {
  const portfolio = portfolioJsonSchema();
  assert.equal(portfolio.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(portfolio.properties.profile.type, 'object');
  assert.ok(portfolio.properties.profile.properties.name.description);
  assert.deepEqual(portfolio.properties.profile.required, ['name']);
  assert.equal(portfolio.properties.projects.items.properties.technologies.type, 'array');

  const config = configJsonSchema();
  assert.deepEqual(config.properties.theme.properties.mode.enum, ['auto', 'light', 'dark']);
  assert.equal(config.properties.build.properties.minify.default, true);
  assert.equal(config.additionalProperties, false);
});
