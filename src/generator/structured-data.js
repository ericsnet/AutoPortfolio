/**
 * Structured data (JSON-LD).
 *
 * Search engines and social platforms understand schema.org; emitting a small,
 * accurate graph costs nothing and makes a portfolio findable by name, skill and
 * employer.
 *
 * @module generator/structured-data
 */

import { oneLine } from '../util/text.js';
import { markdownToText } from '../util/markdown.js';

/**
 * @param {any} data        Normalised portfolio document.
 * @param {any} config      Normalised configuration.
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @returns {object[]} One or more JSON-LD documents.
 */
export function buildStructuredData(data, config, options = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const profile = data.profile ?? {};
  const contact = data.contact ?? {};

  /** @type {Record<string, any>} */
  const person = {
    '@type': 'Person',
    name: profile.name,
  };

  if (profile.headline) person.jobTitle = profile.headline;
  if (profile.company) person.worksFor = { '@type': 'Organization', name: profile.company };
  if (profile.location) person.address = { '@type': 'PostalAddress', addressLocality: profile.location };
  if (profile.shortBio ?? data.meta?.description) {
    person.description = oneLine(markdownToText(profile.shortBio ?? data.meta?.description ?? ''));
  }
  if (contact.email) person.email = `mailto:${contact.email}`;
  if (contact.phone) person.telephone = contact.phone;
  if (baseUrl) person.url = `${baseUrl}/`;
  if (profile.avatar?.src) {
    person.image = absolute(baseUrl, profile.avatar.src);
  }

  const sameAs = [
    ...(data.social ?? []).map((link) => link.url),
    ...(data.contact?.links ?? []).filter((link) => /^https?:/i.test(link.url)).map((link) => link.url),
  ];
  if (sameAs.length) person.sameAs = [...new Set(sameAs)];

  const knowsAbout = [
    ...(data.skills ?? []).map((skill) => skill.name),
    ...(data.technologies ?? []).map((technology) => technology.name),
    ...(data.languages ?? []).map((language) => language.name),
  ];
  if (knowsAbout.length) person.knowsAbout = [...new Set(knowsAbout)].slice(0, 30);

  if (data.education?.length) {
    person.alumniOf = data.education.slice(0, 3).map((entry) => ({
      '@type': 'EducationalOrganization',
      name: entry.institution,
      ...(entry.institutionUrl ? { url: entry.institutionUrl } : {}),
    }));
  }

  if (data.projects?.length) {
    person.subjectOf = data.projects.slice(0, 12).map((project) => ({
      '@type': 'CreativeWork',
      name: project.name,
      ...(baseUrl ? { url: `${baseUrl}/projects/${project.slug}/` } : {}),
    }));
  }

  /** @type {Record<string, any>} */
  const website = {
    '@type': 'WebSite',
    name: config.site?.title ?? data.meta?.title ?? profile.name,
    inLanguage: data.meta?.language ?? 'en',
    ...(baseUrl ? { url: `${baseUrl}/` } : {}),
    ...(data.meta?.description ? { description: oneLine(data.meta.description) } : {}),
    author: { '@type': 'Person', name: profile.name },
  };

  const documents = [
    { '@context': 'https://schema.org', ...person },
    { '@context': 'https://schema.org', ...website },
  ];

  return documents;
}

/**
 * JSON-LD for a single project detail page.
 *
 * @param {any} project
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {string} [options.author]
 * @param {string} [options.language]
 * @returns {object}
 */
export function buildProjectStructuredData(project, options = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  /** @type {Record<string, any>} */
  const document = {
    '@context': 'https://schema.org',
    '@type': project.github ? 'SoftwareSourceCode' : 'CreativeWork',
    name: project.name,
    ...(project.description ? { description: oneLine(markdownToText(project.description)) } : {}),
    ...(baseUrl ? { url: `${baseUrl}/projects/${project.slug}/` } : {}),
    ...(options.author ? { author: { '@type': 'Person', name: options.author } } : {}),
    ...(project.start ? { dateCreated: project.start.slice(0, 4) } : {}),
    ...(project.liveUrl ? { sameAs: [project.liveUrl] } : {}),
    ...(project.github ? { codeRepository: project.github } : {}),
    ...(project.technologyItems?.length
      ? { keywords: project.technologyItems.map((technology) => technology.name).join(', ') }
      : {}),
  };

  if (project.cover?.src) document.image = absolute(baseUrl, project.cover.src);
  return document;
}

/**
 * Render a JSON-LD script tag.
 *
 * @param {object|object[]} value
 * @returns {string}
 */
export function jsonLdScript(value) {
  const payload = Array.isArray(value) ? value : [value];
  return payload
    .map(
      (entry) =>
        `<script type="application/ld+json">${JSON.stringify(entry).replace(/</g, '\\u003c')}</script>`,
    )
    .join('\n');
}

/**
 * @param {string} baseUrl
 * @param {string} url
 * @returns {string}
 */
function absolute(baseUrl, url) {
  if (/^https?:/i.test(url)) return url;
  if (!baseUrl) return url;
  return `${baseUrl}/${url.replace(/^\/+/, '')}`;
}
