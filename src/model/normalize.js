/**
 * Canonicalisation of a validated portfolio document.
 *
 * Validation guarantees *shape*; this module guarantees *meaning*:
 *
 * - every collection is sorted deterministically,
 * - every entry has a stable id/slug,
 * - shorthand spellings (`date` vs `start`/`end`, `current`, `title` vs `name`)
 *   are collapsed into one canonical form,
 * - derived values that templates rely on (display date ranges, link labels)
 *   are computed once here instead of in every template.
 *
 * @module model/normalize
 */

import { slugifyOr, uniqueSlug } from '../util/slug.js';
import { formatRange, formatDuration, parseDate } from '../util/date.js';
import { titleCase } from '../util/text.js';

/**
 * @typedef {object} Link
 * @property {string} key       Original map key, e.g. `github`.
 * @property {string} label     Display label.
 * @property {string} url       Destination.
 * @property {string} [handle]
 * @property {string} [icon]
 * @property {boolean} primary
 * @property {string} [network] Normalised network identifier used for icons.
 */

/**
 * @typedef {object} ImageModel
 * @property {string} src
 * @property {string} alt
 * @property {string} [caption]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [focal]
 * @property {boolean} priority
 * @property {string} [captionHtml]
 */

/** Known networks, used to pick icons and default labels. */
const NETWORK_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  linkedin: 'LinkedIn',
  x: 'X',
  twitter: 'Twitter',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  threads: 'Threads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  twitch: 'Twitch',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  devto: 'DEV Community',
  'dev.to': 'DEV Community',
  hashnode: 'Hashnode',
  medium: 'Medium',
  substack: 'Substack',
  stackoverflow: 'Stack Overflow',
  'stack-overflow': 'Stack Overflow',
  dribbble: 'Dribbble',
  behance: 'Behance',
  figma: 'Figma',
  npm: 'npm',
  pypi: 'PyPI',
  crates: 'crates.io',
  docker: 'Docker Hub',
  kaggle: 'Kaggle',
  researchgate: 'ResearchGate',
  orcid: 'ORCID',
  scholar: 'Google Scholar',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  discord: 'Discord',
  signal: 'Signal',
  calendly: 'Calendly',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  blog: 'Blog',
  rss: 'RSS',
};

/**
 * Human readable label for a network key (`stack-overflow` -> `Stack Overflow`).
 * @param {string} key
 * @returns {string}
 */
export function networkLabel(key) {
  const normalised = key.toLowerCase();
  if (NETWORK_LABELS[normalised]) return NETWORK_LABELS[normalised];
  const compact = normalised.replace(/[.\s_]+/g, '-');
  if (NETWORK_LABELS[compact]) return NETWORK_LABELS[compact];
  return titleCase(key);
}

/**
 * Normalise the `social`/`links` maps into a stable list.
 *
 * @param {Record<string, any>|undefined} map
 * @param {object} [options]
 * @param {string} [options.fallbackLabel]
 * @returns {Link[]}
 */
export function normalizeLinks(map, options = {}) {
  if (!map || typeof map !== 'object') return [];
  /** @type {Link[]} */
  const links = [];
  for (const [key, value] of Object.entries(map)) {
    if (!value) continue;
    const url = typeof value === 'string' ? value : value.url;
    if (!url) continue;
    links.push({
      key,
      network: key.toLowerCase(),
      label: (typeof value === 'object' && value.label) || networkLabel(key) || options.fallbackLabel || titleCase(key),
      url,
      handle: typeof value === 'object' ? value.handle : undefined,
      icon: (typeof value === 'object' && value.icon) || key.toLowerCase(),
      primary: Boolean(typeof value === 'object' && value.primary),
    });
  }
  return links.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * @param {any} image
 * @param {object} [options]
 * @param {string} [options.altFallback]
 * @param {boolean} [options.required]
 * @returns {ImageModel|null}
 */
export function normalizeImage(image, options = {}) {
  if (!image) return null;
  const value = typeof image === 'string' ? { src: image } : image;
  if (!value?.src) return null;
  const alt = (value.alt ?? '').trim() || options.altFallback || '';
  return {
    src: value.src,
    alt,
    caption: value.caption || undefined,
    width: value.width,
    height: value.height,
    focal: value.focal,
    priority: Boolean(value.priority || options.required),
  };
}

/**
 * @param {any} entry
 * @param {object} [options]
 * @returns {{start: string|undefined, end: string|undefined, current: boolean, range: ReturnType<typeof formatRange>, duration: ReturnType<typeof formatDuration>}}
 */
export function normalizeTimeline(entry, options = {}) {
  const start = entry?.start ?? entry?.date ?? undefined;
  let end = entry?.end ?? undefined;
  let current = Boolean(entry?.current);
  if (!current && typeof end === 'string' && /^(present|now|current)$/i.test(end.trim())) current = true;
  if (current) end = 'present';
  if (start && end && !current) {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (startDate && endDate && endDate.date < startDate.date) {
      // Swap silently here; the semantic checker reports it as a warning.
      return {
        start: end,
        end: start,
        current: false,
        range: formatRange(end, start, options),
        duration: formatDuration(end, start),
      };
    }
  }
  return {
    start,
    end,
    current,
    range: formatRange(start, end, options),
    duration: formatDuration(start, end),
  };
}

/**
 * @param {number|undefined} value
 * @returns {number}
 */
function recencyKey(entry) {
  const end = parseDate(entry.end ?? entry.date ?? null);
  if (end?.present) return Number.MAX_SAFE_INTEGER;
  const start = parseDate(entry.start ?? entry.date ?? null);
  return end?.date.getTime() ?? start?.date.getTime() ?? 0;
}

/**
 * Build the canonical portfolio document.
 *
 * @param {any} input A document produced by `validateDocument`.
 * @param {object} [options]
 * @param {string} [options.locale]
 * @param {boolean} [options.includeDrafts] Keep entries flagged `draft: true`.
 * @param {boolean} [options.strictDates] Keep the user's ordering instead of sorting.
 * @returns {any}
 */
export function normalizePortfolio(input, options = {}) {
  const locale = input?.meta?.locale ?? options.locale ?? 'en-US';
  const rangeOptions = { locale };
  const used = new Set();

  const projects = (input.projects ?? [])
    .filter((project) => options.includeDrafts || project.draft !== true)
    .map((project) => {
      const id = uniqueSlug(slugifyOr(project.id || project.name, 'project'), used);
      const timeline = normalizeTimeline(project, rangeOptions);
      const technologies = project.technologies ?? [];
      const images = (project.images ?? []).map((image, index) =>
        normalizeImage(image, { altFallback: `${project.name}${index > 0 ? ` — image ${index + 1}` : ''}` }),
      ).filter(Boolean);
      const cover =
        normalizeImage(project.cover, { altFallback: project.name }) ?? images[0] ?? null;
      return {
        ...project,
        id,
        slug: id,
        url: `/projects/${id}/`,
        start: timeline.start,
        end: timeline.end,
        current: timeline.current,
        date: project.date ?? timeline.start,
        timeline,
        technologies,
        technologyNames: technologies.map((technology) => technology.name),
        images,
        cover,
        links: normalizeLinks(project.links),
        metrics: project.metrics ?? [],
        features: project.features ?? [],
        highlights: project.highlights ?? [],
        tags: project.tags ?? [],
        featured: Boolean(project.featured),
        order: project.order ?? undefined,
      };
    });

  projects.sort(compareProjects);

  const experience = (input.experience ?? [])
    .filter((entry) => options.includeDrafts || entry.draft !== true)
    .map((entry) => {
      const timeline = normalizeTimeline(entry, rangeOptions);
      return {
        ...entry,
        id: slugifyOr(`${entry.company}-${entry.role}`, 'role'),
        start: timeline.start,
        end: timeline.end,
        current: timeline.current,
        timeline,
        logo: normalizeImage(entry.logo, { altFallback: entry.company }),
        technologies: entry.technologies ?? [],
        links: normalizeLinks(entry.links),
        highlights: entry.highlights ?? [],
        skills: entry.skills ?? [],
      };
    });
  experience.sort((a, b) => recencyKey(b) - recencyKey(a));

  const education = (input.education ?? [])
    .filter((entry) => options.includeDrafts || entry.draft !== true)
    .map((entry) => {
      const timeline = normalizeTimeline(entry, rangeOptions);
      return {
        ...entry,
        id: slugifyOr(`${entry.institution}-${entry.degree ?? entry.field ?? ''}`, 'education'),
        start: timeline.start,
        end: timeline.end,
        current: timeline.current,
        timeline,
        logo: normalizeImage(entry.logo, { altFallback: entry.institution }),
        highlights: entry.highlights ?? [],
        activities: entry.activities ?? [],
        courses: entry.courses ?? [],
      };
    });
  education.sort((a, b) => recencyKey(b) - recencyKey(a));

  const certifications = (input.certifications ?? [])
    .filter((entry) => options.includeDrafts || entry.draft !== true)
    .map((entry) => ({
      ...entry,
      id: slugifyOr(`${entry.name}-${entry.issuer ?? ''}`, 'certification'),
      logo: normalizeImage(entry.logo, { altFallback: entry.issuer ?? entry.name }),
      skills: entry.skills ?? [],
      issued: parseDate(entry.date) ? entry.date : undefined,
      expires: entry.expires,
    }));
  certifications.sort((a, b) => (parseDate(b.date)?.date.getTime() ?? 0) - (parseDate(a.date)?.date.getTime() ?? 0));

  const awards = (input.awards ?? []).map((entry) => ({
    ...entry,
    id: slugifyOr(`${entry.title}-${entry.issuer ?? ''}`, 'award'),
  }));
  awards.sort((a, b) => (parseDate(b.date)?.date.getTime() ?? 0) - (parseDate(a.date)?.date.getTime() ?? 0));

  const publications = (input.publications ?? []).map((entry) => ({
    ...entry,
    id: slugifyOr(entry.title, 'publication'),
    authors: entry.authors ?? [],
  }));
  publications.sort((a, b) => (parseDate(b.date)?.date.getTime() ?? 0) - (parseDate(a.date)?.date.getTime() ?? 0));

  const testimonials = (input.testimonials ?? []).map((entry) => ({
    ...entry,
    id: slugifyOr(`${entry.author}-${entry.company ?? ''}`, 'testimonial'),
    avatar: normalizeImage(entry.avatar, { altFallback: entry.author }),
  }));

  const skills = input.skills ?? [];
  const languages = input.languages ?? [];
  const technologies = input.technologies ?? [];

  const sectionSlugs = new Set();
  const sections = (input.sections ?? []).map((section) => {
    const id = uniqueSlug(slugifyOr(section.id || section.title, 'section'), sectionSlugs);
    return {
      ...section,
      id,
      anchor: id,
      layout: section.layout ?? 'cards',
      items: (section.items ?? []).map((item) => ({
        ...item,
        id: slugifyOr(item.title ?? item.label ?? 'item', 'item'),
        image: normalizeImage(item.image, { altFallback: item.title }),
        links: normalizeLinks(item.links),
        tags: item.tags ?? [],
      })),
      hidden: Boolean(section.hidden),
    };
  });
  sections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const contact = input.contact ?? {};
  const profile = input.profile ?? {};

  const socialLinks = normalizeLinks(input.social);
  const contactLinks = normalizeLinks(contact.links);
  /** @type {Link[]} */
  const allLinks = dedupeLinks([...socialLinks, ...contactLinks]);

  return {
    version: input.version ?? '1.0',
    meta: {
      ...input.meta,
      language: input.meta?.language ?? 'en',
      locale,
      keywords: input.meta?.keywords ?? [],
      robots: input.meta?.robots ?? 'index,follow',
      image: normalizeImage(input.meta?.image, { altFallback: input.profile?.name ?? '' }),
    },
    profile: {
      ...profile,
      name: profile.name ?? '',
      avatar: normalizeImage(profile.avatar, { altFallback: profile.name ?? '', required: true }),
    },
    contact: {
      ...contact,
      links: contactLinks,
    },
    social: socialLinks,
    links: allLinks,
    skills,
    languages,
    spokenLanguages: input.spokenLanguages ?? [],
    technologies,
    projects,
    experience,
    education,
    certifications,
    awards,
    publications,
    testimonials,
    sections,
    extra: input.extra ?? {},
  };
}

/**
 * Projects sort by: manual order, then featured, then recency, then name.
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function compareProjects(a, b) {
  if (a.order !== undefined || b.order !== undefined) {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
  }
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  const recency = recencyKey(b) - recencyKey(a);
  if (recency !== 0) return recency;
  return String(a.name).localeCompare(String(b.name));
}

/**
 * @param {Link[]} links
 * @returns {Link[]}
 */
function dedupeLinks(links) {
  /** @type {Map<string, Link>} */
  const seen = new Map();
  for (const link of links) {
    const key = `${link.network}:${link.url}`;
    if (!seen.has(key)) seen.set(key, link);
  }
  return [...seen.values()];
}

/**
 * Normalise a validated configuration document.
 *
 * @param {any} input
 * @param {object} [options]
 * @returns {any}
 */
export function normalizeConfig(input, options = {}) {
  const theme = input.theme ?? {};
  const build = input.build ?? {};
  const site = input.site ?? {};
  const content = input.content ?? {};
  const serve = input.serve ?? {};
  const assets = input.assets ?? {};

  return {
    ...input,
    template: input.template ?? 'modern',
    templateOptions: input.templateOptions ?? {},
    theme: {
      ...theme,
      preset: theme.preset ?? 'default',
      mode: theme.mode ?? 'auto',
      radius: theme.radius ?? 'md',
      spacing: theme.spacing ?? 'comfortable',
      density: theme.density ?? 'normal',
      container: theme.container ?? 'normal',
      animations: theme.animations ?? true,
      gradients: theme.gradients ?? true,
      typography: {
        scale: 1,
        headingWeight: 650,
        fontDisplay: 'swap',
        ...(theme.typography ?? {}),
      },
      customProperties: theme.customProperties ?? {},
      customCss: theme.customCss,
      accentSecondary: theme.accentSecondary ?? theme.secondary,
    },
    sections: {
      order: input.sections?.order ?? [],
      hidden: input.sections?.hidden ?? [],
      labels: input.sections?.labels ?? {},
      subtitles: input.sections?.subtitles ?? {},
      nav: input.sections?.nav ?? true,
      navStyle: input.sections?.navStyle ?? 'sticky',
      numbered: input.sections?.numbered ?? false,
      navItems: input.sections?.navItems ?? [],
      home: input.sections?.home ?? [],
    },
    site: {
      ...site,
      trailingSlash: site.trailingSlash ?? true,
    },
    assets: {
      directory: assets.directory ?? 'assets',
      copy: assets.copy ?? true,
      optimizeImages: assets.optimizeImages ?? false,
      hashFilenames: assets.hashFilenames ?? false,
      inlineSvg: assets.inlineSvg !== false,
    },
    build: {
      output: build.output ?? 'dist',
      clean: build.clean ?? true,
      minify: build.minify ?? true,
      prettyUrls: build.prettyUrls ?? true,
      projectPages: build.projectPages ?? true,
      projectPagesMode: build.projectPagesMode ?? 'auto',
      sitemap: build.sitemap ?? true,
      robots: build.robots ?? true,
      rss: build.rss ?? false,
      feedLimit: build.feedLimit ?? 20,
      verify: build.verify !== false,
      strict: build.strict ?? false,
      draft: build.draft ?? false,
      analytics: {
        provider: 'none',
        privacyFriendly: true,
        ...(build.analytics ?? {}),
      },
    },
    content: {
      markdown: content.markdown ?? true,
      rawHtml: content.rawHtml ?? false,
      lineBreaks: content.lineBreaks ?? false,
      externalLinksNewTab: content.externalLinksNewTab ?? true,
      emailObfuscation: content.emailObfuscation ?? 'entities',
      dateFormat: content.dateFormat ?? 'auto',
      ...content,
    },
    serve: {
      port: serve.port ?? options.port ?? 4173,
      host: serve.host ?? 'localhost',
      open: serve.open ?? false,
      watch: serve.watch ?? true,
      debounce: serve.debounce ?? 120,
    },
    deploy: {
      target: input.deploy?.target ?? 'static',
      options: input.deploy?.options ?? {},
      basePath: input.deploy?.basePath ?? '',
      files: input.deploy?.files ?? [],
    },
    plugins: input.plugins ?? [],
  };
}
