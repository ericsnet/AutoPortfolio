/**
 * The generation engine.
 *
 * `generateSite` is the whole pipeline in one place:
 *
 *   configuration + document  ->  theme  ->  template  ->  view models
 *                             ->  rendered pages + assets  ->  files on disk
 *
 * Everything it needs comes from a loaded project (see `config/load.js`), so it
 * can be driven from the CLI, the preview server, a test or an embedder's own
 * script.
 *
 * @module generator/generator
 */

import path from 'node:path';
import { AutoPortfolioError, ErrorCodes, diagnostic } from '../util/errors.js';
import { ensureDir, isFile, readTextOrNull, removeDir, statOrNull, walk, writeFileAtomic } from '../util/fsx.js';
import { escapeHtml, raw } from '../util/html.js';
import { minifyByExtension } from '../util/minify.js';
import { hashContent } from '../util/fsx.js';
import { truncate } from '../util/text.js';
import { resolveTheme, themeToCss } from '../theme/theme.js';
import { compileTemplate } from '../template/engine.js';
import { createRuntime } from '../template/runtime.js';
import { loadTemplate, BUILTIN_DIR } from '../templates/registry.js';
import { buildViewModel } from '../model/view-model.js';
import { fileToUrl } from '../model/urls.js';
import { createHelpers, registerHelpers } from './helpers.js';
import { buildStructuredData, buildProjectStructuredData, jsonLdScript } from './structured-data.js';
import { collectImageReferences, createMonogramFavicon, createSocialCard, findFavicon, planAssetCopies } from './assets.js';
import { applyExportTarget } from '../export/targets.js';
import { GENERATOR } from '../version.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */

const SHARED_PARTIALS_DIR = path.join(BUILTIN_DIR, '_shared', 'partials');

/**
 * @typedef {object} BuildResult
 * @property {string} outDir
 * @property {string} template
 * @property {string} theme
 * @property {Array<{file: string, url: string, bytes: number, type: string, title: string}>} pages
 * @property {Array<{file: string, bytes: number}>} assets
 * @property {Diagnostic[]} diagnostics
 * @property {number} durationMs
 * @property {Record<string, number>} stats
 */

/**
 * @typedef {object} GenerateOptions
 * @property {string} [outDir]          Override the configured output directory.
 * @property {(message: string) => void} [onProgress]
 * @property {boolean} [collectOutput]  Keep rendered HTML on the result (tests, preview).
 * @property {boolean} [clean]          Remove the output directory first.
 * @property {string} [target]          Deployment target override (`netlify`, `vercel`, …).
 */

/**
 * Generate the site for a loaded project.
 *
 * @param {import('../config/load.js').LoadedProject} project
 * @param {GenerateOptions} [options]
 * @returns {Promise<BuildResult & {output?: Record<string, string>, meta?: any}>}
 */
export async function generateSite(project, options = {}) {
  const started = Date.now();
  const log = options.onProgress ?? (() => {});
  const { config, data, root } = project;
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Record<string, string>} */
  const output = options.collectOutput ? {} : undefined;

  const outDir = path.resolve(root, options.outDir ?? config.build.output);
  const prettyUrls = config.build.prettyUrls !== false;

  // --- theme ---------------------------------------------------------------
  const { theme, diagnostics: themeDiagnostics } = resolveTheme(config.theme, {
    source: project.configPath ? path.relative(process.cwd(), project.configPath) : undefined,
  });
  diagnostics.push(...themeDiagnostics);

  // --- template ------------------------------------------------------------
  const searchPaths = [path.join(root, 'templates'), path.join(root, 'src', 'templates')];
  const template = await loadTemplate(config.template, { root, searchPaths });
  diagnostics.push(...(template.diagnostics ?? []));

  // --- pages ---------------------------------------------------------------
  const projectPages = planProjectPages(data, config);
  /** @type {Array<any>} */
  const pages = [
    { file: 'index.html', type: 'home' },
    ...projectPages.map((project_) => ({
      file: prettyUrls ? `projects/${project_.slug}/index.html` : `projects/${project_.slug}.html`,
      type: 'project',
      project: project_,
    })),
    { file: '404.html', type: 'not-found' },
  ];

  const pageFiles = new Set(pages.map((page) => page.file));

  // --- assets --------------------------------------------------------------
  const assetPlan = await planAssetCopies({ data, config, root, outDir });
  diagnostics.push(...assetPlan.diagnostics);

  const favicon = await findFavicon({ config, root });
  const generatedFavicon = favicon ? null : createMonogramFavicon({
    name: data.profile?.name ?? 'Portfolio',
    background: theme.light.palette.accent,
    foreground: theme.light.onAccent,
  });

  const socialImage = await resolveSocialImage({ config, data, root, assetPlan, theme });

  const stylesheets = ['assets/css/site.css'];
  const scripts = ['assets/js/autoportfolio.js'];
  const hashNames = Boolean(config.assets?.hashFilenames);

  const cssContent = [themeToCss(theme), await readBaseCss(), await readTemplateStyles(template)]
    .filter(Boolean)
    .join('\n\n/* --- */\n\n');
  const jsContent = [await readClientJs(), await readTemplateScripts(template)].filter(Boolean).join('\n\n');

  const cssFile = hashNames ? hashedPath(stylesheets[0], cssContent) : stylesheets[0];
  const jsFile = hashNames ? hashedPath(scripts[0], jsContent) : scripts[0];

  const assets = {
    stylesheets: [cssFile],
    scripts: [jsFile],
    favicon: favicon ? favicon.to : generatedFavicon ? 'favicon.svg' : null,
    // Written further down; templates link it from the head.
    manifest: 'manifest.webmanifest',
    preload: buildPreloads(data),
  };

  const baseUrl = (config.site?.baseUrl ?? data.meta?.siteUrl ?? '').replace(/\/+$/, '');
  const headScript = raw(
    `<script>try{var t=localStorage.getItem('autoportfolio:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}</script>`,
  );

  // --- runtime -------------------------------------------------------------
  /** @type {any} */
  let currentFormatter = null;
  const runtime = createRuntime();
  registerHelpers(
    runtime,
    createHelpers({
      config,
      data,
      theme,
      runtime,
      build: { templateOptions: template.manifest.options ?? {} },
      currentFormatter: () => currentFormatter,
    }),
  );

  const layoutRender = compileTemplate(template.layout, { name: `${template.manifest.name}/layout.html` });
  const pageRender = compileTemplate(template.page, { name: `${template.manifest.name}/page.html` });
  const projectRender = template.project
    ? compileTemplate(template.project, { name: `${template.manifest.name}/project.html` })
    : pageRender;
  const notFoundRender = template.notFound
    ? compileTemplate(template.notFound, { name: `${template.manifest.name}/not-found.html` })
    : pageRender;

  // Shared partials first so templates can override any of them.
  const sharedPartials = await readPartials(SHARED_PARTIALS_DIR);
  for (const [name, source] of sharedPartials) {
    if (template.partials.has(name)) continue;
    runtime.registerPartial(name, compileTemplate(source, { name: `_shared/partials/${name}.html` }));
  }
  for (const [name, source] of template.partials) {
    runtime.registerPartial(name, compileTemplate(source, { name: `${template.manifest.name}/partials/${name}.html` }));
  }

  // --- clean ---------------------------------------------------------------
  if (options.clean ?? config.build.clean) {
    await removeDir(outDir);
  }
  await ensureDir(outDir);

  // --- render --------------------------------------------------------------
  const buildContext = {
    pages: pageFiles,
    assets,
    headScript,
    stylesheets: assets.stylesheets,
    scripts: assets.scripts,
    favicon: assets.favicon,
    manifest: assets.manifest,
    preload: assets.preload,
    templateOptions: template.manifest.options ?? {},
    timestamp: new Date().toISOString(),
  };

  /** @type {BuildResult['pages']} */
  const renderedPages = [];
  let sectionCount = 0;

  for (const page of pages) {
    const viewModel = buildViewModel({ data, config, theme, page, build: buildContext });
    currentFormatter = viewModel.formatter;
    sectionCount = viewModel.sections.length;

    const headHtml = raw(
      renderHeadMeta({
        data,
        config,
        baseUrl,
        page,
        project: page.project,
        socialImage,
        theme,
      }),
    );
    const render = page.type === 'project' ? projectRender : page.type === 'not-found' ? notFoundRender : pageRender;
    const bodyHtml = render(viewModel, runtime);
    const html = layoutRender({ ...viewModel, head: headHtml, body: raw(bodyHtml) }, runtime);
    const finalHtml = minifyByExtension(html, page.file, config.build.minify);

    await writeFileAtomic(path.join(outDir, page.file), finalHtml);
    if (output) output[page.file] = finalHtml;

    const stats = await statOrNull(path.join(outDir, page.file));
    renderedPages.push({
      file: page.file,
      url: fileToUrl(page.file, { prettyUrls }),
      bytes: stats?.size ?? Buffer.byteLength(finalHtml),
      type: page.type ?? 'home',
      title: viewModel.page.title,
    });
    log(`rendered ${page.file}`);
  }

  // --- assets on disk ------------------------------------------------------
  /** @type {BuildResult['assets']} */
  const writtenAssets = [];

  const writeAsset = async (file, content) => {
    const finalContent = minifyByExtension(content, file, config.build.minify);
    await writeFileAtomic(path.join(outDir, file), finalContent);
    writtenAssets.push({ file, bytes: Buffer.byteLength(finalContent) });
    if (output) output[file] = finalContent;
  };

  await writeAsset(cssFile, cssContent);
  await writeAsset(jsFile, jsContent);

  if (generatedFavicon) await writeAsset('favicon.svg', generatedFavicon);
  if (favicon) {
    const faviconContent = await readTextOrNull(favicon.from);
    if (faviconContent && /\.(svg|ico|png|jpg|jpeg|webp)$/i.test(favicon.to)) {
      if (faviconContent.includes('\u0000')) {
        const buffer = await import('node:fs/promises').then((fs) => fs.readFile(favicon.from));
        await writeFileAtomic(path.join(outDir, favicon.to), buffer);
        writtenAssets.push({ file: favicon.to, bytes: buffer.byteLength });
      } else {
        await writeAsset(favicon.to, faviconContent);
      }
    }
  }

  if (socialImage?.generated) {
    await writeAsset('social-card.svg', socialImage.generated);
  }

  for (const copy of assetPlan.copies) {
    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(copy.from));
    await writeFileAtomic(path.join(outDir, copy.to), buffer);
    writtenAssets.push({ file: copy.to, bytes: buffer.byteLength });
  }

  await writeAsset('assets/css/site.css.map.json', JSON.stringify(themeVariablesManifest(theme), null, 2));

  // --- site metadata -------------------------------------------------------
  const metadata = [];
  if (config.build.robots) {
    await writeAsset('robots.txt', renderRobots(baseUrl));
    metadata.push('robots.txt');
  }
  if (config.build.sitemap && baseUrl) {
    await writeAsset('sitemap.xml', renderSitemap(renderedPages, baseUrl));
    metadata.push('sitemap.xml');
  } else if (config.build.sitemap && !baseUrl) {
    diagnostics.push(
      diagnostic({
        severity: 'info',
        code: ErrorCodes.DATA_MISSING,
        message: 'Skipped sitemap.xml because no public URL is configured',
        path: 'meta.siteUrl',
        hint: 'Set `meta.siteUrl` in the portfolio document or `site.baseUrl` in the configuration.',
      }),
    );
  }
  if (config.build.rss && baseUrl) {
    await writeAsset('rss.xml', renderRssFeed(data, baseUrl, renderedPages));
    metadata.push('rss.xml');
  }

  await writeAsset('manifest.webmanifest', renderWebManifest(data, theme, assets.favicon));

  // --- deployment target ---------------------------------------------------
  const exported = await applyExportTarget({ project, outDir, target: options.target });
  diagnostics.push(...exported.diagnostics);
  for (const file of exported.files) {
    await writeAsset(file.file, file.content);
    metadata.push(file.file);
  }

  const stats = {
    pages: renderedPages.length,
    assets: writtenAssets.length,
    files: renderedPages.length + writtenAssets.length,
    sections: sectionCount,
    projects: data.projects.length,
    bytes:
      renderedPages.reduce((total, page) => total + page.bytes, 0) +
      writtenAssets.reduce((total, asset) => total + asset.bytes, 0),
  };

  return {
    outDir,
    template: template.manifest.name,
    theme: theme.name,
    pages: renderedPages,
    assets: writtenAssets,
    diagnostics,
    durationMs: Date.now() - started,
    stats,
    output,
    meta: {
      template,
      theme,
      assets,
      headScript,
      metadata,
      baseUrl,
      pages,
      export: {
        target: exported.target,
        files: exported.files.map((file) => file.file),
        notes: exported.notes,
      },
    },
  };
}

/**
 * Which projects get a detail page?
 *
 * @param {any} data
 * @param {any} config
 * @returns {any[]}
 */
export function planProjectPages(data, config) {
  if (config.build?.projectPages === false || config.build?.projectPagesMode === 'never') return [];
  const mode = config.build?.projectPagesMode ?? 'auto';
  if (mode === 'always') return data.projects ?? [];
  return (data.projects ?? []).filter(
    (project) =>
      Boolean(
        project.details ||
          project.features?.length ||
          project.highlights?.length ||
          project.metrics?.length ||
          project.images?.length > 1,
      ),
  );
}

/**
 * Preload hints: the portrait, because it is the largest above-the-fold asset.
 *
 * @param {any} data
 * @returns {Array<{href: string, as: string, type?: string}>}
 */
function buildPreloads(data) {
  const avatar = data.profile?.avatar?.src;
  if (!avatar || /^[a-z][a-z0-9+.-]*:/i.test(avatar)) return [];
  return [{ href: avatar, as: 'image' }];
}

/**
 * Build the `<head>` metadata block: canonical link, Open Graph, Twitter cards,
 * structured data and the analytics snippet.
 *
 * @param {object} options
 * @returns {string}
 */
function renderHeadMeta(options) {
  const { data, config, baseUrl, page, project, socialImage, theme } = options;
  const site = config.site ?? {};
  const title = site.title ?? data.meta?.title ?? (data.profile?.headline ? `${data.profile.name} — ${data.profile.headline}` : data.profile?.name);
  const description = truncate(data.meta?.description ?? data.profile?.shortBio ?? '', 200, { words: true });
  /** @type {string[]} */
  const tags = [];

  tags.push(`<meta name="generator" content="${escapeHtml(GENERATOR)}">`);
  if (data.meta?.robots && data.meta.robots !== 'index,follow') {
    tags.push(`<meta name="robots" content="${escapeHtml(data.meta.robots)}">`);
  }
  const pageUrl = page?.file ? fileToUrl(page.file, { prettyUrls: config.build?.prettyUrls !== false }) : '/';
  if (baseUrl) tags.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl(baseUrl, pageUrl))}">`);

  if (data.profile?.name) tags.push(`<meta name="author" content="${escapeHtml(data.meta?.author ?? data.profile.name)}">`);
  if (data.meta?.keywords?.length) {
    tags.push(`<meta name="keywords" content="${escapeHtml(data.meta.keywords.join(', '))}">`);
  }

  const image = project?.cover?.src
    ? project.cover.src.startsWith('http')
      ? project.cover.src
      : baseUrl
        ? `${baseUrl}/${project.cover.src.replace(/^\.?\/+/, '')}`
        : project.cover.src
    : socialImage?.url;
  const pageTitle = project ? `${project.name} — ${data.profile?.name ?? title}` : title;
  const pageDescription = project ? truncate(project.description ?? project.tagline ?? description, 200, { words: true }) : description;

  tags.push(`<meta property="og:type" content="${project ? 'article' : 'profile'}">`);
  tags.push(`<meta property="og:title" content="${escapeHtml(pageTitle)}">`);
  if (pageDescription) tags.push(`<meta property="og:description" content="${escapeHtml(pageDescription)}">`);
  tags.push(`<meta property="og:site_name" content="${escapeHtml(data.profile?.name ?? title)}">`);
  if (baseUrl) tags.push(`<meta property="og:url" content="${escapeHtml(canonicalUrl(baseUrl, pageUrl))}">`);
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(data.profile?.name ?? '')}">`);
  }
  if (data.meta?.locale) tags.push(`<meta property="og:locale" content="${escapeHtml(data.meta.locale.replace('-', '_'))}">`);

  tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(pageTitle)}">`);
  if (pageDescription) tags.push(`<meta name="twitter:description" content="${escapeHtml(pageDescription)}">`);
  if (image) tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);

  if (project) {
    tags.push(
      jsonLdScript(
        buildProjectStructuredData(project, {
          baseUrl,
          author: data.profile?.name,
          language: data.meta?.language,
        }),
      ),
    );
    tags.push(jsonLdScript(buildStructuredData(data, config, { baseUrl })[0]));
  } else {
    tags.push(jsonLdScript(buildStructuredData(data, config, { baseUrl })));
  }

  const analytics = renderAnalytics(config.build?.analytics, theme);
  if (analytics) tags.push(analytics);

  return tags.join('\n  ');
}

/**
 * @param {string} baseUrl
 * @param {string} pageUrl
 * @returns {string}
 */
function canonicalUrl(baseUrl, pageUrl) {
  return pageUrl === '/' ? `${baseUrl}/` : `${baseUrl}${pageUrl}`;
}

/**
 * @param {any} analytics
 * @param {any} theme
 * @returns {string}
 */
function renderAnalytics(analytics, theme) {
  if (!analytics || analytics.provider === 'none' || !analytics.provider) return '';
  const id = analytics.id ? escapeHtml(analytics.id) : '';
  switch (analytics.provider) {
    case 'plausible':
      return `<script defer data-domain="${id}" src="https://plausible.io/js/script.js"></script>`;
    case 'umami':
      return `<script defer src="https://cloud.umami.is/script.js" data-website-id="${id}"></script>`;
    case 'fathom':
      return `<script defer src="https://cdn.usefathom.com/script.js" data-site="${id}"></script>`;
    case 'google':
      return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`;
    case 'custom':
      return analytics.script ? `<script defer src="${escapeHtml(analytics.script)}"></script>` : '';
    default:
      return '';
  }
}

/**
 * @param {string} baseUrl
 * @returns {string}
 */
function renderRobots(baseUrl) {
  const lines = ['User-agent: *', 'Allow: /', ''];
  lines.push('Disallow: /assets/css/site.css.map.json');
  if (baseUrl) lines.push('', `Sitemap: ${baseUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

/**
 * @param {BuildResult['pages']} pages
 * @param {string} baseUrl
 * @returns {string}
 */
function renderSitemap(pages, baseUrl) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const priorities = { home: '1.0', project: '0.7', 'not-found': '0.1' };
  const entries = pages
    .filter((page) => page.type !== 'not-found')
    .map(
      (page) =>
        `  <url>\n    <loc>${escapeXml(`${baseUrl}${page.url}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priorities[page.type] ?? '0.6'}</priority>\n  </url>`,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

/**
 * @param {any} data
 * @param {string} baseUrl
 * @param {BuildResult['pages']} pages
 * @returns {string}
 */
function renderRssFeed(data, baseUrl, pages) {
  const items = (data.projects ?? [])
    .filter((project) => project.start || project.date)
    .map((project) => {
      const url = `${baseUrl}/projects/${project.slug}/`;
      const date = new Date(`${project.date ?? project.start}-01T00:00:00Z`);
      const published = Number.isNaN(date.getTime()) ? new Date() : date;
      const hasPage = pages.some((page) => page.file.includes(`projects/${project.slug}/`));
      return `    <item>\n      <title>${escapeXml(project.name)}</title>\n      <link>${escapeXml(hasPage ? url : baseUrl)}</link>\n      <guid>${escapeXml(hasPage ? url : `${baseUrl}#${project.slug}`)}</guid>\n      <pubDate>${published.toUTCString()}</pubDate>\n      <description>${escapeXml(project.description ?? project.tagline ?? '')}</description>\n    </item>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${escapeXml(data.profile?.name ?? 'Portfolio')}</title>\n    <link>${escapeXml(`${baseUrl}/`)}</link>\n    <description>${escapeXml(data.meta?.description ?? '')}</description>\n    <language>${escapeXml(data.meta?.language ?? 'en')}</language>\n    <generator>${escapeXml(GENERATOR)}</generator>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
}

/**
 * @param {any} data
 * @param {any} theme
 * @param {string|null} favicon
 * @returns {string}
 */
function renderWebManifest(data, theme, favicon) {
  const manifest = {
    name: data.profile?.name ?? 'Portfolio',
    short_name: data.profile?.name ?? 'Portfolio',
    start_url: '/',
    display: 'standalone',
    background_color: theme.light.palette.background,
    theme_color: theme.themeColor,
    lang: data.meta?.language ?? 'en',
    description: data.meta?.description ?? data.profile?.shortBio ?? '',
    icons: favicon ? [{ src: `/${favicon}`, sizes: 'any', type: favicon.endsWith('.svg') ? 'image/svg+xml' : undefined }] : [],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * @param {any} theme
 * @returns {Record<string, string>}
 */
function themeVariablesManifest(theme) {
  return {
    $comment:
      'Resolved theme tokens. Override any of these in `theme.customProperties` (drop the leading `--ap-`).',
    preset: theme.name,
    mode: theme.mode,
    light: Object.fromEntries(
      Object.entries(theme.variables)
        .filter(([name]) => !name.startsWith('dark-'))
        .map(([name, value]) => [`--${name}`, value]),
    ),
    dark: Object.fromEntries(
      Object.entries(theme.variables)
        .filter(([name]) => name.startsWith('dark-'))
        .map(([name, value]) => [`--${name.slice(5)}`, value]),
    ),
  };
}

/**
 * @param {string} file
 * @param {string} content
 * @returns {string}
 */
function hashedPath(file, content) {
  const hash = hashContent(content);
  return file.replace(/(\.[a-z0-9]+)$/, `.${hash}$1`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** @type {string|null} */
let baseCssCache = null;
/**
 * @returns {Promise<string>}
 */
async function readBaseCss() {
  if (baseCssCache) return baseCssCache;
  const file = path.join(BUILTIN_DIR, '..', 'assets', 'base.css');
  baseCssCache = (await readTextOrNull(file)) ?? '';
  return baseCssCache;
}

/**
 * @returns {Promise<string>}
 */
async function readClientJs() {
  const file = path.join(BUILTIN_DIR, '..', 'assets', 'client.js');
  return (await readTextOrNull(file)) ?? '';
}

/**
 * @param {import('../templates/registry.js').LoadedTemplate} template
 * @returns {Promise<string>}
 */
async function readTemplateStyles(template) {
  /** @type {string[]} */
  const parts = [];
  for (const file of template.styles) {
    const source = await readTextOrNull(path.join(template.dir, file));
    if (source) parts.push(`/* ${template.manifest.name}/${file} */\n${source}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {import('../templates/registry.js').LoadedTemplate} template
 * @returns {Promise<string>}
 */
async function readTemplateScripts(template) {
  /** @type {string[]} */
  const parts = [];
  for (const file of template.scripts) {
    const source = await readTextOrNull(path.join(template.dir, file));
    if (source) parts.push(`/* ${template.manifest.name}/${file} */\n${source}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {string} dir
 * @returns {Promise<Map<string, string>>}
 */
async function readPartials(dir) {
  /** @type {Map<string, string>} */
  const partials = new Map();
  const entries = await walk(dir, {});
  for (const entry of entries) {
    const source = await readTextOrNull(entry.path);
    if (source === null) continue;
    const withoutExtension = entry.relative.replace(/\.(html|hbs|mustache)$/, '');
    partials.set(withoutExtension, source);
    const basename = path.posix.basename(withoutExtension);
    if (!partials.has(basename)) partials.set(basename, source);
  }
  return partials;
}

/**
 * Resolve the Open Graph image, generating a card when the author has not
 * provided one.
 *
 * @param {object} options
 * @returns {Promise<{url: string, generated?: string}|null>}
 */
async function resolveSocialImage(options) {
  const { config, data, root, theme } = options;
  const configured = config.site?.socialImage ?? data.meta?.image?.src;
  const baseUrl = (config.site?.baseUrl ?? data.meta?.siteUrl ?? '').replace(/\/+$/, '');

  if (configured) {
    const isRemote = /^[a-z][a-z0-9+.-]*:\/\//i.test(configured) || configured.startsWith('data:');
    if (isRemote) return { url: configured };
    const exists = await isFile(path.resolve(root, configured.replace(/^\.?\/+/, '')));
    if (exists) {
      return { url: baseUrl ? `${baseUrl}/${configured.replace(/^\.?\/+/, '')}` : configured };
    }
  }

  const generated = createSocialCard({
    name: data.profile?.name ?? 'Portfolio',
    headline: data.profile?.headline ?? '',
    background: theme.light.palette.background,
    foreground: theme.light.palette.text,
    accent: theme.light.palette.accent,
  });

  return baseUrl ? { url: `${baseUrl}/social-card.svg`, generated } : { url: '', generated };
}

export { collectImageReferences };
