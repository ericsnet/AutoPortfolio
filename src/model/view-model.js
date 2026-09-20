/**
 * The view model.
 *
 * Templates receive one object and render it. Everything a template might need
 * is either already formatted (dates, HTML, relative URLs) or available raw
 * through `doc` for advanced use — so adding a template requires no changes here
 * and no knowledge of the document format.
 *
 * View models are built *per page*, because URLs are relative to the page being
 * rendered.
 *
 * @module model/view-model
 */

import { SafeHtml, raw } from '../util/html.js';
import { oneLine, truncate } from '../util/text.js';
import { createFormatter, initials, siteTitleAndDescription } from './format.js';
import { buildSections, imageView, projectView } from './sections.js';
import { fileToUrl, normalizeBaseUrl } from './urls.js';
import { GENERATOR, VERSION } from '../version.js';

/**
 * @typedef {object} PageDescriptor
 * @property {string} file         Output path, e.g. `projects/foo/index.html`.
 * @property {string} [url]        Public URL for canonical links.
 * @property {'home'|'project'|'not-found'|'custom'} [type]
 * @property {string} [title]      Overrides the generated `<title>`.
 * @property {string} [description]
 * @property {any} [project]       Project document for detail pages.
 * @property {any} [extra]         Extra data merged into the view model.
 */

/**
 * @typedef {object} ViewModelOptions
 * @property {any} data
 * @property {any} config
 * @property {any} theme
 * @property {PageDescriptor} page
 * @property {object} [build]
 * @property {Set<string>} [build.pages]       Every file that will exist.
 * @property {Record<string, string>} [build.assets] Logical asset name -> output file.
 * @property {SafeHtml} [build.headHtml]
 * @property {SafeHtml} [build.bodyHtml]
 * @property {string} [build.copyright]
 */

/**
 * Build the view model for one page.
 *
 * @param {ViewModelOptions} options
 * @returns {any}
 */
export function buildViewModel(options) {
  const { data, config, theme, page } = options;
  const build = options.build ?? {};
  const pages = build.pages ?? new Set([page.file]);
  const assetMap = build.assets ?? {};
  const prettyUrls = config.build.prettyUrls !== false;

  /** @param {string} file */
  const pageExists = (file) => pages.has(file);

  /**
   * Asset references in the document are written relative to the project root,
   * which is also the root of the generated site, so they normally pass through
   * unchanged. The map is only consulted for the few assets the generator moves
   * (hashed stylesheets and scripts).
   *
   * @param {string} reference
   */
  const resolveAsset = (reference) => {
    if (!reference) return reference;
    if (assetMap[reference]) return assetMap[reference];
    return String(reference);
  };

  const formatter = createFormatter({
    config,
    data,
    pageFile: page.file,
    resolveAsset,
  });

  /** @type {import('./sections.js').SectionContext} */
  const sectionContext = { config, data, theme, formatter, pageExists };

  const { title: siteTitle, description: siteDescription } = siteTitleAndDescription(data, config);
  const baseUrl = normalizeBaseUrl(config.site?.baseUrl ?? data.meta?.siteUrl ?? '');
  const pageUrl = page.url ?? fileToUrl(page.file, { prettyUrls });
  const canonical = baseUrl ? `${baseUrl}${pageUrl === '/' ? '/' : pageUrl}` : '';

  const pageTitle =
    page.type === 'project' && page.project
      ? `${page.project.name} — ${data.profile?.name ?? siteTitle}`
      : page.type === 'not-found'
        ? `Page not found — ${data.profile?.name ?? siteTitle}`
        : siteTitle;

  const sections = buildSections(data, sectionContext);
  const projectsSection = sections.find((section) => section.id === 'projects');
  const projects = (data.projects ?? []).map((project) => projectView(project, sectionContext));

  /** The project view for the page being rendered, if this is a detail page. */
  const currentProject = page.project
    ? projects.find((project) => project.slug === page.project.slug) ?? projectView(page.project, sectionContext)
    : undefined;

  const nav = buildNavigation(sections, config, formatter, page);

  const social = (data.social ?? []).map((link) => ({
    ...link,
    href: link.url,
    external: /^https?:/i.test(link.url),
    pretty: link.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  }));

  const avatar = imageView(data.profile?.avatar, sectionContext);

  /** @type {any} */
  const viewModel = {
    site: {
      title: siteTitle,
      description: oneLine(siteDescription),
      shortDescription: truncate(siteDescription, 150),
      language: data.meta?.language ?? 'en',
      locale: formatter.locale,
      robots: data.meta?.robots ?? 'index,follow',
      url: baseUrl,
      canonical,
      ogImage: imageView(data.meta?.image, sectionContext) ?? avatar,
      themeColor: data.meta?.themeColor ?? theme.themeColor,
      keywords: data.meta?.keywords ?? [],
      author: data.meta?.author ?? data.profile?.name,
      generator: { name: 'AutoPortfolio', version: VERSION, url: 'https://github.com/Pickeric/AutoPortfolio' },
      year: new Date().getUTCFullYear(),
      builtAt: build.timestamp ?? new Date().toISOString(),
      isHome: page.type === 'home' || page.type === undefined,
      hasBaseUrl: Boolean(baseUrl),
      copyright: build.copyright ?? defaultCopyright(data, config),
    },

    page: {
      file: page.file,
      url: pageUrl,
      absoluteUrl: canonical,
      type: page.type ?? 'home',
      title: page.title ?? pageTitle,
      description: page.description ?? oneLine(siteDescription),
      isProject: page.type === 'project',
    },

    profile: {
      ...data.profile,
      avatar,
      monogram: initials(data.profile?.name ?? ''),
      initials: initials(data.profile?.name ?? ''),
      headlineHtml: data.profile?.headline ? formatter.inline(data.profile.headline) : raw(''),
      shortBioHtml: data.profile?.shortBio ? formatter.inline(data.profile.shortBio) : raw(''),
      aboutHtml: formatter.markdown(data.profile?.about),
      resumeHref: data.profile?.resume,
      availability: data.profile?.availability,
      facts: sections.find((section) => section.id === 'about')?.model?.facts ?? [],
    },

    contact: data.contact,
    social,
    links: data.links ?? [],

    hero: {
      name: data.profile?.name,
      headline: data.profile?.headline,
      headlineHtml: data.profile?.headline ? formatter.inline(data.profile.headline) : raw(''),
      shortBioHtml: data.profile?.shortBio ? formatter.inline(data.profile.shortBio) : raw(''),
      avatar,
      monogram: initials(data.profile?.name ?? ''),
      location: data.profile?.location,
      availability: data.profile?.availability,
      social: social.slice(0, 6),
      primaryLinks: primaryHeroLinks(data, social),
      highlights: heroHighlights(data),
      resumeHref: data.profile?.resume,
      scrollTarget: sections[0]?.anchor ? `#${sections[0].anchor}` : undefined,
    },

    nav,
    sections,
    projects,
    featuredProjects: projects.filter((project) => project.featured),
    projectCount: projects.length,
    skills: data.skills ?? [],
    technologies: data.technologies ?? [],
    experience: data.experience ?? [],
    education: data.education ?? [],
    certifications: data.certifications ?? [],
    sections_data: sections,

    theme: {
      name: theme.name,
      label: theme.label,
      mode: theme.mode,
      modeLabel: theme.modeLabel,
      radius: theme.radius,
      spacing: theme.spacing,
      container: theme.container,
      animations: theme.animations,
      gradients: theme.gradients,
      themeColor: theme.themeColor,
      typography: theme.typography,
      fontUrl: theme.fontUrl,
      showsToggle: theme.mode !== 'light' && theme.mode !== 'dark',
    },

    assets: {
      stylesheets: (build.stylesheets ?? []).map((file) => formatter.asset(file)),
      scripts: (build.scripts ?? []).map((file) => formatter.asset(file)),
      favicon: build.favicon ? formatter.asset(build.favicon) : undefined,
      faviconType: build.favicon ? mimeFor(build.favicon) : undefined,
      preload: (build.preload ?? []).map((entry) =>
        typeof entry === 'string' ? { href: formatter.asset(entry) } : { ...entry, href: formatter.asset(entry.href) },
      ),
    },

    analytics: build.analytics ?? { provider: 'none' },
    head: build.headHtml ?? raw(''),
    bodyEnd: build.bodyHtml ?? raw(''),

    project: currentProject,
    detail: currentProject ? projectDetailModel(currentProject, sectionContext, projects) : undefined,

    // Escape hatches for custom templates.
    doc: data,
    config,
    data,

    /** The page-bound formatter, exposed for helpers and custom templates. */
    formatter,

    /** `AutoPortfolio v1.0.0`, handy in footers and `<meta name="generator">`. */
    generator: GENERATOR,

    /** True when any project has a detail page (templates use it for card links). */
    hasDetailPages: projects.some((project) => project.hasPage),
    projectsSection,
  };

  return { ...viewModel, ...(page.extra ?? {}) };
}

/**
 * @param {any[]} sections
 * @param {any} config
 * @param {any} formatter
 * @param {import('./view-model.js').PageDescriptor} [page]
 * @returns {{items: any[], primary: any[], brand: any, style: string, enabled: boolean}}
 */
function buildNavigation(sections, config, formatter, page) {
  const homeLink = formatter.link('/');
  const isHome = !page || page.type === undefined || page.type === 'home';

  /** Sections are anchors on the home page; from other pages link back to it. */
  const anchorHref = (anchor) => (isHome ? `#${anchor}` : `${homeLink}#${anchor}`);

  const items = sections.map((section) => ({
    id: section.id,
    label: section.title,
    icon: section.icon,
    number: section.number,
    href: anchorHref(section.anchor),
    anchor: anchorHref(section.anchor),
  }));

  const preferred = ['about', 'projects', 'experience', 'skills', 'contact'];
  const primary = [];
  for (const id of preferred) {
    const match = items.find((item) => item.id === id);
    if (match) primary.push(match);
  }
  for (const item of items) {
    if (primary.length >= 5) break;
    if (!primary.includes(item)) primary.push(item);
  }

  return {
    items,
    primary,
    brand: { href: homeLink, label: '', anchor: '#top' },
    home: homeLink,
    style: config.sections?.navStyle ?? 'sticky',
    enabled: config.sections?.nav !== false && items.length > 1,
  };
}

/**
 * Links shown as buttons in the hero: résumé, main social profiles, contact.
 *
 * @param {any} data
 * @param {any[]} social
 * @returns {any[]}
 */
function primaryHeroLinks(data, social) {
  /** @type {any[]} */
  const links = [];
  if (data.profile?.resume) links.push({ label: 'Résumé', href: data.profile.resume, icon: 'download', kind: 'resume' });
  const preferred = ['github', 'linkedin', 'gitlab', 'mastodon', 'bluesky', 'x', 'devto'];
  for (const network of preferred) {
    const match = social.find((link) => link.network === network);
    if (match && links.length < 3) links.push({ label: match.label, href: match.url, icon: match.icon, kind: 'social' });
  }
  if (data.contact?.email && links.length < 3) {
    links.push({ label: 'Email', href: `mailto:${data.contact.email}`, icon: 'mail', kind: 'contact' });
  }
  return links;
}

/**
 * @param {any} data
 * @returns {Array<{label: string, value: string, icon: string}>}
 */
function heroHighlights(data) {
  /** @type {Array<{label: string, value: string, icon: string}>} */
  const highlights = [];
  if (data.projects?.length) {
    highlights.push({
      label: data.projects.length === 1 ? 'Project' : 'Projects',
      value: String(data.projects.length),
      icon: 'layers',
    });
  }
  if (data.profile?.yearsOfExperience) {
    highlights.push({ label: 'Years experience', value: String(data.profile.yearsOfExperience), icon: 'clock' });
  }
  if (data.certifications?.length) {
    highlights.push({
      label: data.certifications.length === 1 ? 'Certification' : 'Certifications',
      value: String(data.certifications.length),
      icon: 'award',
    });
  }
  if (data.skills?.length) highlights.push({ label: 'Skills', value: String(data.skills.length), icon: 'sparkles' });
  return highlights.slice(0, 3);
}

/**
 * Extra data for a project detail page: neighbours, related projects and the
 * cover image.
 *
 * Every project here is a *view* (see `projectView`), not a document entry, so
 * URLs are already resolved for the page being rendered.
 *
 * @param {any} project  Project view for the current page.
 * @param {import('./sections.js').SectionContext} context
 * @param {any[]} projects Project views, in display order.
 * @returns {any}
 */
function projectDetailModel(project, context, projects) {
  const index = projects.findIndex((entry) => entry.slug === project.slug);
  const ownTechnologies = new Set(
    (project.technologyItems ?? []).map((technology) => String(technology.name ?? '').toLowerCase()),
  );
  const related = projects
    .filter((entry) => entry.slug !== project.slug)
    .map((entry) => ({
      project: entry,
      shared: (entry.technologyItems ?? []).filter((technology) =>
        ownTechnologies.has(String(technology.name ?? '').toLowerCase()),
      ).length,
    }))
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 3)
    .map((entry) => entry.project);

  return {
    previous: index > 0 ? projects[index - 1] : undefined,
    next: index >= 0 && index < projects.length - 1 ? projects[index + 1] : undefined,
    related,
    hero: project.cover,
    gallery: project.images ?? [],
  };
}

/**
 * @param {any} data
 * @param {any} config
 * @returns {string}
 */
function defaultCopyright(data, config) {
  const name = data.profile?.name ?? '';
  const year = new Date().getUTCFullYear();
  return config?.site?.copyright ?? `${year}${name ? ` ${name}` : ''}`;
}

/**
 * @param {string} file
 * @returns {string}
 */
function mimeFor(file) {
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.ico')) return 'image/x-icon';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  return undefined;
}

export { SafeHtml };
