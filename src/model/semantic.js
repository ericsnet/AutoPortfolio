/**
 * Semantic checks.
 *
 * The schema validator answers "is this the right shape?". This module answers
 * the questions that need cross-references: are the dates in order, is every
 * image described, is there enough metadata for a good search result, does the
 * content actually fill the sections the configuration asks for?
 *
 * Everything here produces warnings or information — never a hard error — so
 * that a portfolio is never blocked from building because of a style nit.
 *
 * @module model/semantic
 */

import { ErrorCodes, diagnostic } from '../util/errors.js';
import { parseDate, isPresentWord } from '../util/date.js';
import { oneLine } from '../util/text.js';
import { contrastRatio } from '../util/color.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */

const DESCRIPTION_SWEET_SPOT = { min: 50, max: 160 };

/**
 * @param {any} data     Normalised portfolio document.
 * @param {any} config   Normalised configuration.
 * @param {object} [context]
 * @param {string} [context.source]
 * @param {string} [context.configSource]
 * @returns {Diagnostic[]}
 */
export function checkPortfolio(data, config, context = {}) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const source = context.source;

  /** @param {Diagnostic} entry */
  const push = (entry) => diagnostics.push(diagnostic({ source, ...entry }));

  checkMetadata(data, config, push);
  checkProfile(data, push);
  checkTimelines(data, push);
  checkImages(data, push);
  checkProjects(data, config, push);
  checkContact(data, push);
  checkLinks(data, push);
  checkSectionCoverage(data, config, push);

  return diagnostics;
}

/**
 * @param {any} data
 * @param {any} config
 * @param {(d: Diagnostic) => void} push
 */
function checkMetadata(data, config, push) {
  const description = data.meta?.description ?? data.profile?.shortBio ?? '';
  if (!description) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_MISSING,
      message: 'No site description, search results will use the first text on the page',
      path: 'meta.description',
      hint: 'Add a one or two sentence `meta.description` (or `profile.shortBio`).',
    });
  } else {
    const length = oneLine(description).length;
    if (length > DESCRIPTION_SWEET_SPOT.max) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`meta.description\` is ${length} characters, search engines usually show about ${DESCRIPTION_SWEET_SPOT.max}`,
        path: 'meta.description',
        hint: 'Trim it to the most important sentence.',
      });
    } else if (length < DESCRIPTION_SWEET_SPOT.min) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`meta.description\` is only ${length} characters`,
        path: 'meta.description',
        hint: `Around ${DESCRIPTION_SWEET_SPOT.min}–${DESCRIPTION_SWEET_SPOT.max} characters are used in search results.`,
      });
    }
  }

  const baseUrl = config?.site?.baseUrl ?? data.meta?.siteUrl;
  if (!baseUrl) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_MISSING,
      message: 'No public URL configured, the sitemap cannot be generated',
      path: 'meta.siteUrl',
      hint: 'Set `meta.siteUrl` (or `site.baseUrl`) so canonical links and `sitemap.xml` can be emitted.',
    });
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)/i.test(baseUrl)) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_FORMAT,
      message: `The public URL points at a local address (${baseUrl})`,
      path: 'meta.siteUrl',
      hint: 'Deployed sites should use their real domain, otherwise search engines index the wrong host.',
    });
  }

  if (!data.meta?.language || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(data.meta.language)) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_FORMAT,
      message: `\`meta.language\` should be a BCP-47 tag such as \`en\` or \`pt-BR\``,
      path: 'meta.language',
    });
  }
}

/**
 * @param {any} data
 * @param {(d: Diagnostic) => void} push
 */
function checkProfile(data, push) {
  if (!data.profile?.headline) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_MISSING,
      message: 'No `profile.headline`, the hero will only show the name',
      path: 'profile.headline',
      hint: 'A headline like “Backend engineer • Rust, Go, Postgres” makes the page instantly readable.',
    });
  }
  if (!data.profile?.shortBio && !data.profile?.about) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_MISSING,
      message: 'The About section is empty',
      path: 'profile.about',
      hint: 'Add `profile.shortBio` for a one-liner, or `profile.about` for the full section.',
    });
  }
  if (!data.profile?.avatar) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_MISSING,
      message: 'No `profile.avatar`, templates will fall back to a monogram',
      path: 'profile.avatar',
    });
  }
  if (data.profile?.yearsOfExperience !== undefined) {
    const years = Number(data.profile.yearsOfExperience);
    if (years < 0 || years > 70) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`profile.yearsOfExperience\` looks implausible (${years})`,
        path: 'profile.yearsOfExperience',
      });
    }
  }
}

/**
 * @param {any} data
 * @param {(d: Diagnostic) => void} push
 */
function checkTimelines(data, push) {
  /**
   * @param {string} key
   * @param {string} label
   */
  const check = (key, label) => {
    for (const [index, entry] of (data[key] ?? []).entries()) {
      const start = parseDate(entry.start ?? null);
      const end = parseDate(entry.end ?? null);
      if (start && end && !end.present && end.date < start.date) {
        push({
          severity: 'warning',
          code: ErrorCodes.DATA_FORMAT,
          message: `${label} entry ${index + 1} ends before it starts`,
          path: `${key}[${index}]`,
          hint: `Start is \`${entry.start}\` and end is \`${entry.end}\`. AutoPortfolio swaps them for display.`,
        });
      }
      if (!entry.start && !entry.end && key !== 'projects') {
        push({
          severity: 'info',
          code: ErrorCodes.DATA_MISSING,
          message: `${label} entry ${index + 1} has no dates`,
          path: `${key}[${index}]`,
          hint: 'Add `start`/`end` so the timeline can be ordered correctly.',
        });
      }
      if (entry.end && !entry.start && !isPresentWord(entry.end) && key !== 'projects') {
        push({
          severity: 'info',
          code: ErrorCodes.DATA_MISSING,
          message: `${label} entry ${index + 1} has an end date but no start date`,
          path: `${key}[${index}].start`,
        });
      }
    }
  };

  check('experience', 'Experience');
  check('education', 'Education');

  for (const [index, certification] of (data.certifications ?? []).entries()) {
    const issued = parseDate(certification.date ?? null);
    const expires = parseDate(certification.expires ?? null);
    if (issued && expires && expires.date < issued.date) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `Certification ${index + 1} expires before it was issued`,
        path: `certifications[${index}]`,
      });
    }
    if (expires && !expires.present && expires.date < new Date()) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_FORMAT,
        message: `Certification “${certification.name}” expired in ${certification.expires}`,
        path: `certifications[${index}].expires`,
        hint: 'Templates will mark it as expired; remove it if it is no longer relevant.',
      });
    }
  }
}

/**
 * @param {any} data
 * @param {(d: Diagnostic) => void} push
 */
function checkImages(data, push) {
  /** @type {Array<{image: any, path: string, label: string}>} */
  const images = [];

  if (data.profile?.avatar) images.push({ image: data.profile.avatar, path: 'profile.avatar', label: 'profile avatar' });
  if (data.meta?.image) images.push({ image: data.meta.image, path: 'meta.image', label: 'social image' });

  for (const [index, project] of (data.projects ?? []).entries()) {
    if (project.cover) {
      images.push({ image: project.cover, path: `projects[${index}].cover`, label: `cover of “${project.name}”` });
    }
    for (const [imageIndex, image] of (project.images ?? []).entries()) {
      images.push({
        image,
        path: `projects[${index}].images[${imageIndex}]`,
        label: `image ${imageIndex + 1} of “${project.name}”`,
      });
    }
  }

  for (const { image, path, label } of images) {
    const isDecorative = image.alt === '';
    if (isDecorative) continue;
    if (!image.alt || !image.alt.trim()) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `The ${label} has no alt text`,
        path: `${path}.alt`,
        hint: 'Describe what the image shows, or set `alt: ""` if it is purely decorative.',
      });
    }
    if (image.width && !image.height) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_FORMAT,
        message: `The ${label} sets \`width\` without \`height\``,
        path: `${path}.height`,
        hint: 'Providing both avoids layout shift while the image loads.',
      });
    }
  }
}

/**
 * @param {any} data
 * @param {any} config
 * @param {(d: Diagnostic) => void} push
 */
function checkProjects(data, config, push) {
  const projects = data.projects ?? [];
  if (projects.length === 0) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_MISSING,
      message: 'No projects defined',
      path: 'projects',
      hint: 'Projects are the heart of a portfolio — add at least one with a name, description and technologies.',
    });
    return;
  }

  /** @type {Map<string, number>} */
  const byName = new Map();
  for (const [index, project] of projects.entries()) {
    const key = String(project.name).toLowerCase();
    if (byName.has(key)) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_DUPLICATE,
        message: `Project “${project.name}” appears more than once`,
        path: `projects[${index}]`,
        hint: `Both entries are rendered; merge them or rename one.`,
      });
    }
    byName.set(key, index);

    if (!project.description && !project.tagline && !project.details) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_MISSING,
        message: `Project “${project.name}” has no description`,
        path: `projects[${index}].description`,
      });
    }
    if (project.github && project.liveUrl && project.github === project.liveUrl) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_FORMAT,
        message: `Project “${project.name}” points \`github\` and \`liveUrl\` at the same address`,
        path: `projects[${index}]`,
      });
    }
    const willHavePage =
      config?.build?.projectPagesMode === 'always' ||
      (config?.build?.projectPagesMode !== 'never' &&
        Boolean(project.details || project.features?.length || project.images?.length > 1 || project.metrics?.length));
    if (!willHavePage && project.details) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_INVALID,
        message: `Project “${project.name}” has a detailed description but detail pages are disabled`,
        path: `projects[${index}].details`,
        hint: 'Enable `build.projectPages` to publish it.',
      });
    }
  }

  if (!projects.some((project) => project.featured)) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_MISSING,
      message: 'No project is marked `featured`',
      path: 'projects',
      hint: 'Featured projects are highlighted on the home page.',
    });
  }
}

/**
 * @param {any} data
 * @param {(d: Diagnostic) => void} push
 */
function checkContact(data, push) {
  const contact = data.contact ?? {};
  const hasContact = contact.email || contact.phone || contact.links?.length || data.social?.length;
  if (!hasContact) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_MISSING,
      message: 'No contact details, the Contact section will be hidden',
      path: 'contact',
      hint: 'Add at least `contact.email` or one entry under `social`.',
    });
  }
  if (contact.formAction && !/^https:\/\//i.test(contact.formAction)) {
    push({
      severity: 'warning',
      code: ErrorCodes.DATA_FORMAT,
      message: '`contact.formAction` should use HTTPS',
      path: 'contact.formAction',
      hint: 'Contact form submissions include personal data; avoid plain HTTP endpoints.',
    });
  }
  if (contact.preferred && !hasPreference(contact)) {
    push({
      severity: 'info',
      code: ErrorCodes.DATA_MISSING,
      message: `\`contact.preferred\` is \`${contact.preferred}\` but no matching detail is set`,
      path: 'contact.preferred',
    });
  }
}

/**
 * @param {any} contact
 * @returns {boolean}
 */
function hasPreference(contact) {
  switch (contact.preferred) {
    case 'email':
      return Boolean(contact.email);
    case 'phone':
      return Boolean(contact.phone);
    case 'form':
      return Boolean(contact.formAction);
    case 'calendar':
      return Boolean(contact.calendarUrl);
    case 'linkedin':
      return Boolean(contact.links?.some((link) => link.network === 'linkedin') ?? false);
    default:
      return true;
  }
}

/**
 * @param {any} data
 * @param {(d: Diagnostic) => void} push
 */
function checkLinks(data, push) {
  /** @type {Array<{url: string, path: string}>} */
  const links = [];

  for (const [index, project] of (data.projects ?? []).entries()) {
    if (project.github) links.push({ url: project.github, path: `projects[${index}].github` });
    if (project.liveUrl) links.push({ url: project.liveUrl, path: `projects[${index}].liveUrl` });
    for (const link of project.links ?? []) links.push({ url: link.url, path: `projects[${index}].links.${link.key}` });
  }
  for (const [index, entry] of (data.experience ?? []).entries()) {
    if (entry.companyUrl) links.push({ url: entry.companyUrl, path: `experience[${index}].companyUrl` });
  }
  for (const [index, entry] of (data.education ?? []).entries()) {
    if (entry.institutionUrl) links.push({ url: entry.institutionUrl, path: `education[${index}].institutionUrl` });
  }
  for (const link of data.links ?? []) links.push({ url: link.url, path: `social.${link.key}` });

  const seen = new Set();
  for (const { url, path } of links) {
    if (seen.has(`${url}|${path}`)) continue;
    seen.add(`${url}|${path}`);
    if (/^http:\/\//i.test(url)) {
      push({
        severity: 'warning',
        code: ErrorCodes.DATA_FORMAT,
        message: `Insecure link used for \`${path}\``,
        path,
        hint: 'Prefer `https://` — browsers mark plain HTTP pages as “not secure”.',
      });
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url)) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_FORMAT,
        message: `\`${path}\` points at localhost`,
        path,
        hint: 'Visitors will not be able to open it.',
      });
    }
  }
}

/**
 * Warn when the configuration asks for sections that the data cannot fill.
 *
 * @param {any} data
 * @param {any} config
 * @param {(d: Diagnostic) => void} push
 */
function checkSectionCoverage(data, config, push) {
  const requested = config?.sections?.order ?? [];
  /** @type {Record<string, boolean>} */
  const available = {
    about: Boolean(data.profile?.about || data.profile?.shortBio),
    skills: (data.skills?.length ?? 0) > 0,
    languages: (data.languages?.length ?? 0) > 0,
    spokenLanguages: (data.spokenLanguages?.length ?? 0) > 0,
    technologies: (data.technologies?.length ?? 0) > 0,
    projects: (data.projects?.length ?? 0) > 0,
    experience: (data.experience?.length ?? 0) > 0,
    education: (data.education?.length ?? 0) > 0,
    certifications: (data.certifications?.length ?? 0) > 0,
    awards: (data.awards?.length ?? 0) > 0,
    publications: (data.publications?.length ?? 0) > 0,
    testimonials: (data.testimonials?.length ?? 0) > 0,
    contact: Boolean(data.contact?.email || data.contact?.phone || data.links?.length || data.social?.length),
  };

  for (const id of requested) {
    if (id in available && !available[id]) {
      push({
        severity: 'info',
        code: ErrorCodes.DATA_INVALID,
        message: `Section \`${id}\` is listed in \`sections.order\` but there is no content for it`,
        path: 'sections.order',
        hint: 'Empty sections are skipped automatically.',
      });
    }
  }

  const accent = config?.theme?.accent;
  if (accent) {
    const ratio = contrastRatio(accent, '#ffffff');
    const darkRatio = contrastRatio(accent, '#0b1120');
    if (ratio < 3 && darkRatio < 3) {
      push({
        severity: 'warning',
        code: ErrorCodes.THEME_CONTRAST,
        message: `The accent colour ${accent} has low contrast against both light and dark backgrounds`,
        path: 'theme.accent',
        hint: 'Text drawn in the accent colour may be hard to read (WCAG requires at least 3:1 for large text).',
      });
    }
  }
}
