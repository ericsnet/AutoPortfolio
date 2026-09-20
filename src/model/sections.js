/**
 * Section registry.
 *
 * A *section* turns part of the portfolio document into the model a template
 * renders. Sections are the contract between content and presentation: every
 * template renders the same section ids, receives the same model shape, and
 * decides only how it looks.
 *
 * A builder returns `null` when the document has nothing to show for it, which
 * is how "only display sections that contain information" is implemented — in
 * one place, for every template.
 *
 * @module model/sections
 */

import { raw } from '../util/html.js';
import { SECTION_LABELS } from '../schema/portfolio-schema.js';
import { prettyUrl } from './format.js';

/**
 * @typedef {object} SectionContext
 * @property {any} config      Normalised configuration.
 * @property {any} theme       Resolved theme.
 * @property {any} formatter   Formatter bound to the page being rendered.
 * @property {any} data        Normalised portfolio document.
 * @property {(file: string) => string} [pageExists]
 */

/**
 * @typedef {object} Section
 * @property {string} id
 * @property {string} kind      `builtin` or `custom`.
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} anchor
 * @property {string} icon
 * @property {string} [number]  Rendered ordinal when `sections.numbered` is on.
 * @property {string[]} partials Candidate partials, in priority order.
 * @property {any} model
 */

/**
 * Resolve an image reference into a render-ready object.
 *
 * @param {any} image
 * @param {SectionContext} context
 * @returns {any|null}
 */
export function imageView(image, context) {
  if (!image) return null;
  return {
    src: context.formatter.asset(image.src),
    alt: image.alt ?? '',
    caption: image.caption,
    width: image.width,
    height: image.height,
    focal: image.focal,
    priority: Boolean(image.priority),
    loading: image.priority ? 'eager' : 'lazy',
  };
}

/**
 * @param {any[]|undefined} images
 * @param {SectionContext} context
 * @returns {any[]}
 */
function imageViews(images, context) {
  return (images ?? []).map((image) => imageView(image, context)).filter(Boolean);
}

/**
 * A link that is safe to drop into an `<a href>`.
 * @param {any} link
 * @param {SectionContext} context
 * @returns {any}
 */
function linkView(link, context) {
  return {
    ...link,
    href: link.url,
    hrefPretty: prettyUrl(link.url),
    external: /^https?:/i.test(link.url),
  };
}

/**
 * `[{label, value}]` rows used by the hero and about sections.
 *
 * @param {any} data
 * @param {SectionContext} context
 * @returns {Array<{label: string, value: string, icon: string, href?: string, external?: boolean}>}
 */
export function profileFacts(data, context) {
  const profile = data.profile ?? {};
  const contact = data.contact ?? {};
  /** @type {Array<{label: string, value: string, icon: string, href?: string, external?: boolean}>} */
  const facts = [];

  if (profile.location) facts.push({ label: 'Location', value: profile.location, icon: 'map-pin' });
  if (profile.company) facts.push({ label: 'Company', value: profile.company, icon: 'briefcase' });
  if (profile.jobTitle) facts.push({ label: 'Role', value: profile.jobTitle, icon: 'user' });
  if (profile.yearsOfExperience) {
    const years = Number(profile.yearsOfExperience);
    facts.push({
      label: 'Experience',
      value: `${years}${Number.isInteger(years) ? '' : '+'} ${years === 1 ? 'year' : 'years'}`,
      icon: 'clock',
    });
  }
  if (profile.availability) {
    const labels = {
      available: 'Available for work',
      'open-to-offers': 'Open to offers',
      'open-to-freelance': 'Open to freelance work',
      employed: 'Currently employed',
      'not-available': 'Not looking right now',
    };
    facts.push({
      label: 'Availability',
      value: [labels[profile.availability] ?? profile.availability, profile.availabilityNote].filter(Boolean).join(' — '),
      icon: 'check',
    });
  }
  if (contact.location && contact.location !== profile.location) {
    facts.push({ label: 'Based in', value: contact.location, icon: 'globe' });
  }
  if (data.spokenLanguages?.length) {
    facts.push({
      label: 'Languages',
      value: data.spokenLanguages.map((language) => [language.name, language.proficiency].filter(Boolean).join(' · ')).join(', '),
      icon: 'globe',
    });
  }
  if (profile.resume) facts.push({ label: 'Résumé', value: 'Download', icon: 'download', href: profile.resume, external: true });
  if (profile.pronouns) facts.push({ label: 'Pronouns', value: profile.pronouns, icon: 'user' });

  return facts;
}

/**
 * @param {any[]} list
 * @param {SectionContext} context
 * @returns {any[]}
 */
function skillView(list, context) {
  return list.map((skill) => ({
    ...skill,
    href: skill.url,
  }));
}

/**
 * Group skills by `category`, keeping the author's ordering.
 * @param {any[]} skills
 * @param {SectionContext} context
 * @returns {Array<{name: string, items: any[], hasLevels: boolean}>}
 */
function skillGroups(skills, context) {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const skill of skills) {
    const key = skill.category ?? '';
    if (!groups.has(key)) groups.set(key, []);
    /** @type {any[]} */ (groups.get(key)).push(skillView([skill], context)[0]);
  }
  return [...groups.entries()].map(([name, items]) => ({
    name: name || 'Skills',
    unnamed: name === '',
    items,
    hasLevels: items.some((item) => item.level),
  }));
}

const LEVEL_ORDER = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
const MAX_LEVEL = 4;

/**
 * @param {any[]} items
 * @returns {number}
 */
function maxLevelValue(items) {
  return items.reduce((max, item) => Math.max(max, LEVEL_ORDER[item.level] ?? 0), 0) || MAX_LEVEL;
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function experienceView(entry, context) {
  return {
    ...entry,
    title: entry.role,
    subtitle: entry.company,
    subtitleHref: entry.companyUrl ?? undefined,
    icon: 'briefcase',
    logo: imageView(entry.logo, context),
    summaryHtml: entry.summary ? context.formatter.inline(entry.summary) : raw(''),
    descriptionHtml: context.formatter.markdown(entry.description),
    highlights: (entry.highlights ?? []).map((highlight) => context.formatter.markdown(highlight)),
    highlightHtml: (entry.highlights ?? []).map((highlight) => context.formatter.markdown(highlight)),
    technologies: (entry.technologies ?? []).map((technology) => ({ ...technology, href: technology.url })),
    links: (entry.links ?? []).map((link) => linkView(link, context)),
    rangeLabel: context.formatter.range(entry.start, entry.end),
    rangeLabelShort: context.formatter.range(entry.start, entry.end, { format: 'short' }),
    startLabel: context.formatter.date(entry.start),
    endLabel: entry.current ? 'Present' : context.formatter.date(entry.end),
    durationLabel: context.formatter.duration(entry.start, entry.end),
    meta: [
      entry.employmentType,
      entry.workMode ? `${entry.workMode}` : undefined,
      entry.location,
    ].filter(Boolean),
  };
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function educationView(entry, context) {
  return {
    ...entry,
    title: [entry.degree, entry.field].filter(Boolean).join(', ') || entry.institution,
    subtitle: entry.institution,
    subtitleHref: entry.institutionUrl ?? undefined,
    icon: 'graduation-cap',
    logo: imageView(entry.logo, context),
    summaryHtml: entry.summary ? context.formatter.inline(entry.summary) : raw(''),
    descriptionHtml: context.formatter.markdown(entry.description),
    highlights: (entry.highlights ?? []).map((highlight) => context.formatter.markdown(highlight)),
    rangeLabel: context.formatter.range(entry.start, entry.end),
    rangeLabelShort: context.formatter.range(entry.start, entry.end, { format: 'short' }),
    startLabel: context.formatter.date(entry.start),
    endLabel: entry.current ? 'Present' : context.formatter.date(entry.end),
    meta: [entry.grade ? `Grade ${entry.grade}` : undefined, entry.location].filter(Boolean),
    courses: entry.courses ?? [],
    activities: entry.activities ?? [],
  };
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function certificationView(entry, context) {
  return {
    ...entry,
    title: entry.name,
    subtitle: entry.issuer,
    subtitleHref: entry.credentialUrl,
    icon: 'award',
    logo: imageView(entry.logo, context),
    descriptionHtml: context.formatter.markdown(entry.description),
    dateLabel: context.formatter.date(entry.date),
    expiresLabel: context.formatter.date(entry.expires),
    expired: Boolean(entry.expires && entry.expires !== 'present' && new Date(entry.expires) < new Date()),
    href: entry.credentialUrl,
    meta: [entry.issuer, entry.credentialId].filter(Boolean),
    skills: entry.skills ?? [],
  };
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function awardView(entry, context) {
  return {
    ...entry,
    title: entry.title,
    subtitle: entry.issuer,
    icon: 'award',
    descriptionHtml: context.formatter.markdown(entry.description),
    dateLabel: context.formatter.date(entry.date),
    href: entry.url,
  };
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function publicationView(entry, context) {
  return {
    ...entry,
    title: entry.title,
    subtitle: entry.publisher,
    icon: 'book',
    summaryHtml: entry.summary ? context.formatter.inline(entry.summary) : raw(''),
    dateLabel: context.formatter.date(entry.date),
    authorsLabel: (entry.authors ?? []).join(', '),
    href: entry.url ?? (entry.doi ? `https://doi.org/${entry.doi}` : undefined),
  };
}

/**
 * @param {any} entry
 * @param {SectionContext} context
 * @returns {any}
 */
function testimonialView(entry, context) {
  return {
    ...entry,
    quoteHtml: context.formatter.markdown(entry.quote),
    avatar: imageView(entry.avatar, context),
    authorLabel: [entry.author, entry.role, entry.company].filter(Boolean).join(', ') || entry.author,
  };
}

/**
 * A project, ready for a card or a detail page.
 *
 * @param {any} project
 * @param {SectionContext} context
 * @returns {any}
 */
export function projectView(project, context) {
  const detailFile = `projects/${project.slug}/index.html`;
  const hasPage = context.pageExists ? context.pageExists(detailFile) : context.config?.build?.projectPages !== false;

  return {
    ...project,
    hasPage,
    href: hasPage ? context.formatter.link(`/projects/${project.slug}/`) : undefined,
    externalHref: project.liveUrl ?? undefined,
    repoHref: project.github ?? undefined,
    taglineHtml: project.tagline ? context.formatter.inline(project.tagline) : raw(''),
    descriptionHtml: project.description ? context.formatter.markdown(project.description) : raw(''),
    detailsHtml: context.formatter.markdown(project.details),
    cover: imageView(project.cover, context),
    images: imageViews(project.images, context),
    technologyItems: (project.technologies ?? []).map((technology) => ({ ...technology, href: technology.url })),
    links: (project.links ?? []).map((link) => linkView(link, context)),
    features: project.features ?? [],
    highlights: (project.highlights ?? []).map((highlight) => context.formatter.markdown(highlight)),
    metrics: (project.metrics ?? []).map((metric) => ({ ...metric, labelText: metric.label })),
    tags: project.tags ?? [],
    rangeLabel: context.formatter.range(project.start, project.end),
    rangeLabelShort: context.formatter.range(project.start, project.end, { format: 'short' }),
    dateLabel: context.formatter.date(project.date ?? project.start),
    secondaryLinks: [
      project.github ? { label: 'Source code', href: project.github, icon: 'code', network: 'github' } : undefined,
      project.liveUrl ? { label: 'Live demo', href: project.liveUrl, icon: 'external-link', network: 'website' } : undefined,
    ].filter(Boolean),
  };
}

/**
 * @typedef {object} SectionDefinition
 * @property {string} id
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {string} icon
 * @property {number} order
 * @property {(data: any, context: SectionContext) => any|null} build
 */

/** @type {Record<string, SectionDefinition>} */
export const SECTION_BUILDERS = {
  about: {
    id: 'about',
    title: 'About',
    icon: 'user',
    order: 10,
    build(data, context) {
      const about = data.profile?.about;
      const shortBio = data.profile?.shortBio;
      if (!about && !shortBio) return null;
      return {
        html: context.formatter.markdown(about ?? shortBio),
        bioHtml: context.formatter.markdown(shortBio),
        aboutHtml: context.formatter.markdown(about),
        facts: profileFacts(data, context),
        avatar: imageView(data.profile?.avatar, context),
        name: data.profile?.name,
        headline: data.profile?.headline,
        snapshot: data.profile?.shortBio ?? '',
      };
    },
  },

  skills: {
    id: 'skills',
    title: 'Skills',
    icon: 'sparkles',
    order: 20,
    build(data, context) {
      if (!data.skills?.length) return null;
      const groups = skillGroups(data.skills, context);
      return {
        groups,
        items: groups.flatMap((group) => group.items),
        featured: data.skills.filter((skill) => skill.featured).map((skill) => skillView([skill], context)[0]),
        maxLevel: maxLevelValue(data.skills),
        hasLevels: data.skills.some((skill) => skill.level),
        categories: data.skills.some((skill) => skill.category),
        levelOrder: LEVEL_ORDER,
      };
    },
  },

  languages: {
    id: 'languages',
    title: 'Languages',
    icon: 'code',
    order: 25,
    build(data, context) {
      if (!data.languages?.length) return null;
      return {
        items: data.languages.map((language) => ({
          ...language,
          levelValue: LEVEL_ORDER[language.level] ?? 0,
        })),
        maxLevel: MAX_LEVEL,
        hasLevels: data.languages.some((language) => language.level),
      };
    },
  },

  spokenLanguages: {
    id: 'spokenLanguages',
    title: 'Languages',
    icon: 'globe',
    order: 26,
    build(data) {
      if (!data.spokenLanguages?.length) return null;
      return { items: data.spokenLanguages };
    },
  },

  technologies: {
    id: 'technologies',
    title: 'Technologies',
    icon: 'layers',
    order: 30,
    build(data) {
      if (!data.technologies?.length) return null;
      return {
        items: data.technologies.map((technology) => ({ ...technology, href: technology.url })),
      };
    },
  },

  projects: {
    id: 'projects',
    title: 'Projects',
    icon: 'layers',
    order: 40,
    build(data, context) {
      if (!data.projects?.length) return null;
      const items = data.projects.map((project) => projectView(project, context));
      const featured = items.filter((project) => project.featured);
      const byYear = new Map();
      for (const project of items) {
        const year = (project.date ?? project.start ?? '').slice(0, 4) || 'Undated';
        if (!byYear.has(year)) byYear.set(year, []);
        /** @type {any[]} */ (byYear.get(year)).push(project);
      }
      return {
        items,
        featured,
        rest: items.filter((project) => !project.featured),
        groups: [...byYear.entries()].map(([name, entries]) => ({ name, entries })),
        hasDetailPages: items.some((project) => project.hasPage),
        hasImages: items.some((project) => project.cover),
        technologies: [...new Set(items.flatMap((project) => project.technologyItems.map((technology) => technology.name)))],
        filters: [...new Set(items.flatMap((project) => project.tags ?? []))],
      };
    },
  },

  experience: {
    id: 'experience',
    title: 'Experience',
    icon: 'briefcase',
    order: 50,
    build(data, context) {
      if (!data.experience?.length) return null;
      return {
        items: data.experience.map((entry) => experienceView(entry, context)),
        current: data.experience.filter((entry) => entry.current).map((entry) => experienceView(entry, context)),
        totalYears: data.experience.reduce((total, entry) => total + (entry.timeline?.duration?.months ?? 0), 0) / 12,
      };
    },
  },

  education: {
    id: 'education',
    title: 'Education',
    icon: 'graduation-cap',
    order: 60,
    build(data, context) {
      if (!data.education?.length) return null;
      return { items: data.education.map((entry) => educationView(entry, context)) };
    },
  },

  certifications: {
    id: 'certifications',
    title: 'Certifications',
    icon: 'award',
    order: 70,
    build(data, context) {
      if (!data.certifications?.length) return null;
      return { items: data.certifications.map((entry) => certificationView(entry, context)) };
    },
  },

  awards: {
    id: 'awards',
    title: 'Awards',
    icon: 'award',
    order: 80,
    build(data, context) {
      if (!data.awards?.length) return null;
      return { items: data.awards.map((entry) => awardView(entry, context)) };
    },
  },

  publications: {
    id: 'publications',
    title: 'Publications',
    icon: 'book',
    order: 85,
    build(data, context) {
      if (!data.publications?.length) return null;
      return { items: data.publications.map((entry) => publicationView(entry, context)) };
    },
  },

  testimonials: {
    id: 'testimonials',
    title: 'Testimonials',
    icon: 'quote',
    order: 90,
    build(data, context) {
      if (!data.testimonials?.length) return null;
      return { items: data.testimonials.map((entry) => testimonialView(entry, context)) };
    },
  },

  social: {
    id: 'social',
    title: 'Elsewhere',
    icon: 'user-group',
    order: 95,
    build(data, context) {
      const links = [...(data.social ?? []), ...(data.contact?.links ?? [])];
      if (!links.length) return null;
      return { items: links.map((link) => linkView(link, context)) };
    },
  },

  contact: {
    id: 'contact',
    title: 'Contact',
    icon: 'send',
    order: 100,
    build(data, context) {
      const contact = data.contact ?? {};
      const links = [...(data.social ?? []), ...(contact.links ?? [])];
      const hasAnything = contact.email || contact.phone || contact.formAction || contact.calendarUrl || links.length;
      if (!hasAnything) return null;
      return {
        email: contact.email,
        mailto: context.formatter.mailto(contact.email),
        phone: contact.phone,
        phoneHref: contact.phone ? `tel:${contact.phone.replace(/[^+\d]/g, '')}` : undefined,
        location: contact.location ?? data.profile?.location,
        timezone: contact.timezone,
        availability: contact.availability ?? data.profile?.availability,
        messageHtml: context.formatter.markdown(contact.message),
        formAction: contact.formAction,
        hasForm: Boolean(contact.formAction),
        calendarUrl: contact.calendarUrl,
        preferred: contact.preferred,
        links: links.map((link) => linkView(link, context)),
        resume: data.profile?.resume,
        facts: profileFacts(data, context),
      };
    },
  },
};

/** Default order used when the configuration does not specify one. */
export const DEFAULT_SECTION_ORDER = Object.freeze([
  'about',
  'skills',
  'technologies',
  'projects',
  'experience',
  'education',
  'certifications',
  'awards',
  'publications',
  'testimonials',
  'contact',
]);

/**
 * @param {any} section
 * @param {SectionContext} context
 * @returns {any}
 */
function customSectionView(section, context) {
  if (section.hidden) return null;
  const items = (section.items ?? []).map((item) => {
    const range = item.start || item.end ? context.formatter.range(item.start, item.end) : '';
    return {
      ...item,
      url: item.url,
      href: item.url,
      descriptionHtml: context.formatter.markdown(item.description),
      dateLabel: range || context.formatter.date(item.date),
      image: imageView(item.image, context),
      links: (item.links ?? []).map((link) => linkView(link, context)),
      tags: item.tags ?? [],
      value: item.value,
      label: item.label,
    };
  });

  const content = section.content ? context.formatter.markdown(section.content) : raw('');
  if (!items.length && !section.content) return null;

  return {
    id: section.id,
    kind: 'custom',
    title: section.title,
    subtitle: section.subtitle,
    anchor: section.anchor ?? section.id,
    icon: section.icon ?? iconForLayout(section.layout),
    layout: section.layout ?? 'cards',
    html: content,
    items,
    order: section.order,
  };
}

/**
 * @param {string|undefined} layout
 * @returns {string}
 */
function iconForLayout(layout) {
  switch (layout) {
    case 'timeline':
      return 'clock';
    case 'links':
      return 'link';
    case 'stats':
      return 'target';
    case 'gallery':
      return 'image';
    case 'prose':
      return 'file-text';
    case 'list':
      return 'check';
    default:
      return 'sparkles';
  }
}

/**
 * Build the list of sections that have content, in the configured order.
 *
 * @param {any} data
 * @param {SectionContext} context
 * @returns {Section[]}
 */
export function buildSections(data, context) {
  const config = context.config ?? {};
  const requested = config.sections?.order?.length ? [...config.sections.order] : [...DEFAULT_SECTION_ORDER];
  const hidden = new Set(config.sections?.hidden ?? []);
  const labels = config.sections?.labels ?? {};
  const subtitles = config.sections?.subtitles ?? {};

  /** @type {Section[]} */
  const sections = [];
  let ordinal = 0;

  /** @param {Section} section */
  const add = (section) => {
    ordinal += 1;
    sections.push({
      ...section,
      number: config.sections?.numbered ? String(ordinal).padStart(2, '0') : undefined,
    });
  };

  for (const id of requested) {
    if (hidden.has(id)) continue;
    const definition = SECTION_BUILDERS[id];
    if (!definition) continue;
    const model = definition.build(data, context);
    if (!model) continue;
    add({
      id,
      kind: 'builtin',
      title: labels[id] ?? definition.title ?? SECTION_LABELS[id] ?? id,
      subtitle: subtitles[id] ?? definition.subtitle,
      anchor: id,
      icon: definition.icon,
      partials: [`sections/${id}`, 'sections/builtin', 'sections/default'],
      model,
    });
  }

  for (const section of data.sections ?? []) {
    if (hidden.has(section.id)) continue;
    const view = customSectionView(section, context);
    if (!view) continue;
    add({
      id: view.id,
      kind: 'custom',
      title: labels[view.id] ?? view.title,
      subtitle: subtitles[view.id] ?? view.subtitle,
      anchor: view.anchor,
      icon: view.icon,
      partials: [
        `sections/custom-${view.layout}`,
        `sections/custom-${view.layout === 'cards' ? 'cards' : 'default'}`,
        'sections/custom-default',
        'sections/default',
      ],
      model: view,
    });
  }

  return sections;
}

/**
 * Which built-in sections are available for a document (used by `info` and by
 * templates that want to advertise their capabilities).
 *
 * @param {any} data
 * @param {SectionContext} context
 * @returns {string[]}
 */
export function availableSections(data, context) {
  return Object.values(SECTION_BUILDERS)
    .filter((definition) => definition.build(data, context) !== null)
    .map((definition) => definition.id);
}

export { SECTION_LABELS };
