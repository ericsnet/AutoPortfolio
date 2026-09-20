/**
 * The configuration model: everything about *how* the site is built.
 *
 * Keeping this separate from `portfolio-schema.js` is deliberate. Content is
 * yours and travels with you; configuration is about one deployment of that
 * content. Swapping templates or restyling the site must never mean editing the
 * portfolio document.
 *
 * @module schema/config-schema
 */

import { THEME_PRESET_NAMES } from '../theme/presets.js';
import { anyOf, bool, dict, enumOf, int, list, num, obj, str, strList, url } from './fields.js';

/** @typedef {import('./fields.js').Field} Field */

/** Files searched for, in order, when no `--config` is given. */
export const DEFAULT_CONFIG_FILENAMES = [
  'autoportfolio.config.yaml',
  'autoportfolio.config.yml',
  'autoportfolio.config.json',
  'autoportfolio.config.toml',
  'portfolio.config.yaml',
  'portfolio.config.yml',
  'portfolio.config.json',
];

/** Section ids that ship with AutoPortfolio. Custom sections may use any other id. */
export const BUILTIN_SECTIONS = [
  'about',
  'skills',
  'languages',
  'spokenLanguages',
  'technologies',
  'projects',
  'experience',
  'education',
  'certifications',
  'awards',
  'publications',
  'testimonials',
  'social',
  'contact',
];

/** Deployment targets understood by the export layer. */
export const EXPORT_TARGETS = ['static', 'github-pages', 'netlify', 'vercel', 'cloudflare-pages', 's3', 'ipfs'];

/** Where the generated site can be deployed. */
export const CONFIG_SCHEMA_DOC = 'https://github.com/Pickeric/AutoPortfolio#configuration';

/** Any value at all; used for `templateOptions`. */
const anything = /** @type {Field} */ (anyOf([str(), num(), bool(), strList(), dict(str())], { label: 'value' }));

/**
 * @type {Field}
 */
export const configSchema = /** @type {Field} */ (
  obj(
    {
      data: str({
        description: 'Path to the portfolio document, relative to this file.',
        default: 'portfolio.yaml',
        example: 'portfolio.yaml',
      }),

      template: str({
        description: 'Template name. Built in: `modern`, `minimal`, `developer`.',
        default: 'modern',
      }),

      templateOptions: dict(anything, {
        description: 'Options for the template. Each template documents the keys it understands.',
      }),

      site: obj({
        baseUrl: url({
          description: 'Public URL of the deployed site. Used for canonical links, sitemap.xml and feeds.',
          example: 'https://your-domain.example',
        }),
        title: str({ description: 'Overrides `meta.title` from the portfolio document.' }),
        description: str({ description: 'Overrides `meta.description`.' }),
        language: str({ description: 'Overrides `meta.language`.', default: 'en' }),
        favicon: str({
          description: 'Favicon path or URL. A monogram is generated when this is unset.',
          example: 'assets/favicon.svg',
        }),
        socialImage: str({ description: 'Image used for social previews. A card is generated when unset.' }),
        trailingSlash: bool({
          description: 'Use directory URLs (`projects/name/`) instead of `projects/name.html`.',
          default: true,
        }),
      }),

      theme: obj({
        preset: enumOf(THEME_PRESET_NAMES, {
          description: 'Theme preset used as the starting point.',
          default: 'default',
        }),
        mode: enumOf(['auto', 'light', 'dark'], {
          description: "Colour mode. `auto` follows the visitor's system preference.",
          default: 'auto',
          valueAliases: [
            { value: 'auto', aliases: ['system'] },
            { value: 'dark', aliases: ['night'] },
            { value: 'light', aliases: ['day'] },
          ],
        }),
        accent: str({
          description: 'Accent colour as a hex value. Overrides the preset.',
          example: '#4f46e5',
        }),
        accentSecondary: str({ description: 'Optional second colour used by gradients and charts.' }),
        radius: enumOf(['none', 'sm', 'md', 'lg', 'xl', 'full'], {
          description: 'Corner rounding used throughout the site.',
          default: 'md',
        }),
        spacing: enumOf(['compact', 'comfortable', 'spacious'], {
          description: 'Vertical rhythm between sections.',
          default: 'comfortable',
        }),
        density: enumOf(['compact', 'normal', 'relaxed'], {
          description: 'Base font size and line height.',
          default: 'normal',
        }),
        container: enumOf(['narrow', 'normal', 'wide', 'full'], {
          description: 'Maximum content width.',
          default: 'normal',
        }),
        animations: bool({ description: 'Enable transitions and reveal animations.', default: true }),
        gradients: bool({ description: 'Allow gradient accents where templates offer them.', default: true }),
        typography: obj({
          heading: str({ description: 'Heading font: a Google Font name or a CSS font stack.', default: 'Inter' }),
          body: str({ description: 'Body font.', default: 'Inter' }),
          mono: str({ description: 'Monospace font.', default: 'JetBrains Mono' }),
          scale: num({ description: 'Multiplier applied to the type scale.', default: 1, min: 0.5, max: 2 }),
          headingWeight: num({ description: 'Font weight for headings.', default: 650, min: 300, max: 900 }),
          fontDisplay: str({ description: 'CSS `font-display` value.', default: 'swap' }),
          googleFonts: bool({ description: 'Load the fonts from Google Fonts.', default: true }),
          fontUrl: url({ description: 'Stylesheet that loads the fonts, when not using Google Fonts.' }),
        }),
        customProperties: dict(str(), {
          description: 'Extra CSS custom properties. The `--ap-` prefix is added automatically.',
          example: 'container: 60rem',
        }),
        customCss: str({
          description: 'Path to a CSS file appended to the generated stylesheet.',
          example: 'custom.css',
        }),
      }),

      sections: obj({
        order: strList({
          description: 'Order of the home page sections. Unlisted sections keep their default order.',
        }),
        hidden: strList({ description: 'Sections to leave out even though they have content.' }),
        labels: dict(str(), { description: 'Replace a section heading, e.g. `projects: Selected work`.' }),
        subtitles: dict(str(), { description: 'Subtitle printed under a section heading.' }),
        numbered: bool({ description: 'Print a number next to each section heading.', default: false }),
        nav: bool({ description: 'Show the navigation bar.', default: true }),
        navStyle: enumOf(['sticky', 'static', 'top', 'hidden'], {
          description: 'How the navigation behaves while scrolling.',
          default: 'sticky',
        }),
        navItems: strList({ description: 'Section ids shown in the navigation, in this order.' }),
        home: strList({ description: 'Sections kept on the home page when projects have pages of their own.' }),
      }),

      assets: obj({
        directory: str({ description: 'Directory scanned for images referenced by the document.', default: 'assets' }),
        copy: bool({ description: 'Copy the asset directory into the output.', default: true }),
        optimizeImages: bool({ description: 'Reserved: image optimisation is done ahead of time by design.', default: false }),
        hashFilenames: bool({ description: 'Add a content hash to the generated CSS and JS file names.', default: false }),
        inlineSvg: bool({ description: 'Inline small SVG icons instead of requesting them.', default: true }),
      }),

      build: obj({
        output: str({ description: 'Where the generated site is written.', default: 'dist' }),
        clean: bool({ description: 'Remove the output directory before writing.', default: true }),
        minify: bool({ description: 'Minify HTML, CSS and JS.', default: true }),
        prettyUrls: bool({ description: 'Generate `projects/name/index.html` instead of `projects/name.html`.', default: true }),
        projectPages: bool({ description: 'Give projects with a write-up a page of their own.', default: true }),
        projectPagesMode: enumOf(['auto', 'always', 'never'], {
          description: '`auto` only creates pages for projects with details, images or features.',
          default: 'auto',
        }),
        sitemap: bool({ description: 'Write `sitemap.xml`.', default: true }),
        robots: bool({ description: 'Write `robots.txt`.', default: true }),
        rss: bool({ description: 'Write `rss.xml` with the projects as items.', default: false }),
        feedLimit: int({ description: 'Maximum number of feed items.', default: 20, min: 1, max: 200 }),
        strict: bool({ description: 'Treat warnings as errors.', default: false }),
        draft: bool({ description: 'Include entries marked `draft: true`.', default: false }),
        analytics: obj({
          provider: enumOf(['none', 'plausible', 'umami', 'fathom', 'google', 'custom'], {
            description: 'Analytics provider. Nothing is loaded when set to `none`.',
            default: 'none',
            valueAliases: [
              { value: 'google', aliases: ['google-analytics', 'ga', 'gtag'] },
              { value: 'none', aliases: ['off', 'no'] },
            ],
          }),
          id: str({
            description: 'Site id or measurement id, depending on the provider.',
            aliases: ['siteId', 'measurementId'],
          }),
          domain: str({ description: 'Domain reported to the provider.' }),
          script: str({
            description: 'Script URL, used by the `custom` provider.',
            aliases: ['src'],
          }),
          privacyFriendly: bool({ description: 'Documented intent; no cookies are set by AutoPortfolio itself.', default: true }),
        }),
      }),

      content: obj({
        markdown: bool({ description: 'Render Markdown fields. Turn off to show them as plain text.', default: true }),
        rawHtml: bool({ description: 'Allow raw HTML inside Markdown fields.', default: false }),
        lineBreaks: bool({ description: 'Turn single newlines in Markdown into line breaks.', default: false }),
        externalLinksNewTab: bool({ description: 'Open external links in a new tab.', default: true }),
        emailObfuscation: enumOf(['none', 'entities', 'markdown'], {
          description: 'How email addresses are hidden from scrapers in the generated HTML.',
          default: 'entities',
        }),
        locale: str({ description: 'Locale used to format dates.', default: 'en' }),
        dateFormat: str({
          description: '`auto` picks a readable format for the locale, or pass a preset such as `short` or `numeric`.',
          default: 'auto',
        }),
        projectSort: enumOf(['featured', 'recent', 'name', 'manual'], {
          description: 'Order of projects.',
          default: 'featured',
        }),
        maxItems: obj({
          projects: int({ description: 'Projects shown on the home page. 0 means all.', default: 0, min: 0 }),
          skills: int({ description: 'Skills shown on the home page. 0 means all.', default: 0, min: 0 }),
          experience: int({ description: 'Roles shown. 0 means all.', default: 0, min: 0 }),
          education: int({ description: 'Education entries shown. 0 means all.', default: 0, min: 0 }),
          certifications: int({ description: 'Certifications shown. 0 means all.', default: 0, min: 0 }),
        }),
      }),

      serve: obj({
        port: int({ description: 'Port used by `autoportfolio dev`.', default: 4173, min: 1, max: 65535 }),
        host: str({ description: 'Address to bind.', default: 'localhost' }),
        open: bool({ description: 'Open the preview in a browser.', default: false }),
        watch: bool({ description: 'Rebuild when a file changes.', default: true }),
        debounce: int({ description: 'Milliseconds to wait after a change before rebuilding.', default: 120, min: 0, max: 5000 }),
      }),

      deploy: obj({
        target: enumOf(EXPORT_TARGETS, {
          description: 'Deployment target used to write host-specific files.',
          default: 'static',
        }),
        basePath: str({ description: 'Sub-path the site is served from, e.g. `/portfolio`.', default: '' }),
        files: strList({ description: 'Extra files to write into the output, e.g. `netlify.toml`, `CNAME`.' }),
        options: dict(anything, { description: 'Target specific options, passed through to the export layer.' }),
      }),

      plugins: list(str(), {
        description: 'Reserved for future extension points. Accepted, currently unused.',
      }),
    },
    { description: 'AutoPortfolio configuration.' },
  )
);

export { THEME_PRESET_NAMES };
