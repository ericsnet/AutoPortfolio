/**
 * Theme resolution.
 *
 * A theme turns a handful of human-readable choices — preset, mode, accent,
 * radius, spacing, density, fonts — into the CSS custom properties that every
 * template styles itself with. Templates never hard-code a colour and the
 * portfolio document never mentions one, which is what keeps content and
 * presentation independent.
 *
 * The resolved theme exposes two parallel views of the same data:
 *
 * - `variables`, a flat map of `ap-*` names (no leading `--`) with dark-mode
 *   overrides prefixed `dark-`. This is what `{{themeVar "ap-accent"}}` reads
 *   and what the build manifest prints.
 * - `light` / `dark`, each with the semantic `palette` plus derived values such
 *   as `onAccent`, for code that needs a real colour rather than a variable
 *   (the social card, the web manifest, ...).
 *
 * @module theme/theme
 */

import { contrastRatio, ensureContrast, isColor, mix, parseColor, readableOn, toHex, withAlpha } from '../util/color.js';
import { diagnostic, ErrorCodes } from '../util/errors.js';
import { getPreset, hasPreset, THEME_PRESET_NAMES } from './presets.js';

/**
 * @typedef {import('./presets.js').ThemePalette} ThemePalette
 * @typedef {import('./presets.js').ThemePreset} ThemePreset
 *
 * @typedef {object} ResolvedPalette
 * @property {string} background
 * @property {string} surface
 * @property {string} surfaceAlt
 * @property {string} text
 * @property {string} muted
 * @property {string} border
 * @property {string} accent
 * @property {string} secondary
 * @property {string} onAccent     Text colour to use *on* the accent.
 * @property {string} accentInk    The accent, darkened until it reads as text.
 * @property {string} accentSoft   Tinted background derived from the accent.
 * @property {string} code
 * @property {string} marker       Highlight colour for `<mark>` and markers.
 * @property {string} shadow
 * @property {string} focus
 *
 * @typedef {object} ThemeTypography
 * @property {string} heading        Heading font name as configured.
 * @property {string} body           Body font name as configured.
 * @property {string} mono           Monospace font name as configured.
 * @property {number} scale          Type scale multiplier.
 * @property {number} headingWeight  Font weight for headings.
 * @property {string} fontDisplay    CSS `font-display` value.
 * @property {string} baseSize       Base font size, e.g. `16px`.
 * @property {number} lineHeight     Unitless line height.
 * @property {string} [fontUrl]      Stylesheet that loads the fonts, when used.
 *
 * @typedef {object} ThemeSide
 * @property {ResolvedPalette} palette
 * @property {string} onAccent
 *
 * @typedef {object} ResolvedTheme
 * @property {string} name            Preset name.
 * @property {string} label           Human-readable preset name.
 * @property {string} description
 * @property {'auto'|'light'|'dark'} mode
 * @property {string} modeLabel
 * @property {string} radius          `none|sm|md|lg|xl|full`
 * @property {string} radiusValue     Pixel value the name resolves to.
 * @property {string} spacing         `compact|comfortable|spacious`
 * @property {string} density         `compact|normal|relaxed`
 * @property {string} container       `narrow|normal|wide|full`
 * @property {boolean} animations
 * @property {boolean} gradients
 * @property {string} accent
 * @property {string} accentSecondary
 * @property {string} secondary
 * @property {string} themeColor      Colour for `<meta name="theme-color">`.
 * @property {string|null} fontUrl
 * @property {string|null} customCss
 * @property {ThemeTypography} typography
 * @property {ThemeSide} light
 * @property {ThemeSide} dark
 * @property {Record<string, string>} variables
 * @property {Record<string, string>} customProperties
 */

/**
 * Font stacks. A Google Font name is quoted and given a local fallback, so the
 * page still reads well if the stylesheet is blocked or offline.
 */
export const FONT_STACKS = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  inter: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  'jetbrains mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  georgia: "Georgia, 'Times New Roman', Times, serif",
  'playfair display': "'Playfair Display', Georgia, 'Times New Roman', serif",
  'source serif': "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
  'ibm plex mono': "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
  poppins: "'Poppins', 'Segoe UI', system-ui, sans-serif",
  'fira code': "'Fira Code', ui-monospace, Menlo, Consolas, monospace",
  fraunces: "'Fraunces', Georgia, 'Times New Roman', serif",
  'ui-monospace': "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

/** Corner rounding names → pixels. */
export const RADIUS_SCALES = { none: 0, sm: 4, md: 10, lg: 16, xl: 24, full: 999 };

/** Vertical rhythm names → multiplier applied to the base spacing unit. */
export const SPACING_SCALES = { compact: 0.75, comfortable: 1, spacious: 1.35 };

/** Type density names → base font size and line height. */
export const DENSITY_SCALES = {
  compact: { fontSize: 15, lineHeight: 1.55 },
  normal: { fontSize: 16, lineHeight: 1.65 },
  relaxed: { fontSize: 17, lineHeight: 1.75 },
};

/** Content width names → maximum width. */
export const CONTAINER_SCALES = { narrow: '42rem', normal: '64rem', wide: '78rem', full: '100%' };

/** Font names that are genuinely available from Google Fonts. */
const GOOGLE_FONTS = new Set([
  'inter',
  'jetbrains mono',
  'playfair display',
  'source serif',
  'source serif 4',
  'ibm plex mono',
  'poppins',
  'fira code',
  'fraunces',
  'roboto',
  'open sans',
  'lato',
  'merriweather',
  'work sans',
  'space grotesk',
  'dm sans',
  'manrope',
  'nunito',
  'rubik',
  'karla',
  'libre franklin',
  'crimson pro',
  'libre baskerville',
  'spectral',
  'newsreader',
  'eb garamond',
  'cormorant garamond',
  'bitter',
  'josefin sans',
  'outfit',
  'public sans',
  'red hat display',
  'sora',
  'bricolage grotesque',
  'instrument serif',
  'geist',
  'geist mono',
  'recursive',
  'zilla slab',
  'anonymous pro',
  'victor mono',
]);

/** Font names that are safe to load as a generic family, not from Google. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-monospace',
  'ui-serif',
  'ui-sans-serif',
  'inherit',
]);

/**
 * Resolve one font setting to a full CSS stack.
 *
 * @param {string|undefined} font       A Google Font name, a generic family, or a stack.
 * @param {{fallback?: string, quotes?: boolean}} [options]
 * @returns {string}
 */
export function resolveFontStack(font, options = {}) {
  const fallback = options.fallback ?? FONT_STACKS.sans;
  if (typeof font !== 'string' || !font.trim()) return fallback;
  const value = font.trim();
  const known = scaleValue(FONT_STACKS, value.toLowerCase(), '');
  if (known) return known;
  if (/,/.test(value)) return value;
  if (GENERIC_FAMILIES.has(value.toLowerCase())) return value;
  const family = options.quotes === false ? value : `'${value}'`;
  return `${family}, ${fallback}`;
}

/**
 * Resolve a theme configuration into a complete theme plus any diagnostics.
 *
 * @param {Record<string, any>} [themeConfig]
 * @param {{source?: string}} [options]
 * @returns {{theme: ResolvedTheme, diagnostics: import('../util/errors.js').Diagnostic[]}}
 */
export function resolveTheme(themeConfig = {}, options = {}) {
  const input = themeConfig ?? {};
  const source = options.source;
  /** @type {import('../util/errors.js').Diagnostic[]} */
  const diagnostics = [];
  const report = (/** @type {any} */ entry) => diagnostics.push(diagnostic({ source, ...entry }));

  const requested = typeof input.preset === 'string' ? input.preset.trim().toLowerCase() : 'default';
  if (requested && !hasPreset(requested)) {
    report({
      severity: 'warning',
      code: ErrorCodes.THEME_INVALID,
      message: `Unknown theme preset "${requested}", falling back to "default"`,
      path: 'theme.preset',
      hint: `Available presets: ${THEME_PRESET_NAMES.join(', ')}.`,
    });
  }
  const preset = getPreset(requested);

  const mode = ['auto', 'light', 'dark'].includes(input.mode) ? input.mode : 'auto';
  const radius = nameOrDefault(input.radius, Object.keys(RADIUS_SCALES), preset.radius ?? 'md', 'theme.radius', report);
  const spacing = nameOrDefault(input.spacing, Object.keys(SPACING_SCALES), preset.spacing ?? 'comfortable', 'theme.spacing', report);
  const density = nameOrDefault(input.density, Object.keys(DENSITY_SCALES), 'normal', 'theme.density', report);
  const container = nameOrDefault(input.container, Object.keys(CONTAINER_SCALES), 'normal', 'theme.container', report);

  const accent = colorOrNull(input.accent);
  if (input.accent && !accent) {
    report({
      severity: 'warning',
      code: ErrorCodes.THEME_INVALID,
      message: `Accent colour "${input.accent}" is not a valid CSS colour`,
      path: 'theme.accent',
      hint: 'Use a hex value such as "#4f46e5", or remove the key to keep the preset accent.',
    });
  }

  const baseTypography = { ...preset.typography };
  const typographyInput = input.typography ?? {};
  const typography = { ...baseTypography, ...typographyInput };
  const fontDisplay = typeof typography.fontDisplay === 'string' ? typography.fontDisplay : 'swap';
  const fontScale = clampNumber(typography.scale, 1, 0.5, 2);
  const headingWeight = Math.round(clampNumber(typography.headingWeight, 650, 300, 900));
  const densityScale = scaleValue(DENSITY_SCALES, density, DENSITY_SCALES.normal);

  const fontUrl = resolveFontUrl(typography, { mode, display: fontDisplay, onWarning: report });

  const light = resolvePalette(preset.colors.light, { ...preset.colors.light, accent: accent ?? preset.colors.light.accent });
  const dark = resolvePalette(preset.colors.dark, { ...preset.colors.dark, accent: input.accentDark ? colorOrNull(input.accentDark) ?? preset.colors.dark.accent : preset.colors.dark.accent });
  const secondary = colorOrNull(input.accentSecondary) ?? light.palette.secondary;

  if (accent) {
    light.palette.accent = accent;
    light.palette.accentInk = ensureContrast(accent, light.palette.background, { target: 4.5 });
    light.palette.accentSoft = withAlpha(accent, 0.12);
    light.palette.onAccent = readableOn(accent);
    light.onAccent = light.palette.onAccent;
    // The dark palette keeps the accent readable on a dark background.
    const darkAccent = input.accentDark ? colorOrNull(input.accentDark) : null;
    const resolvedDark = darkAccent ?? ensureContrast(accent, dark.palette.background, { target: 4.5 });
    dark.palette.accent = resolvedDark;
    dark.palette.accentInk = resolvedDark;
    dark.palette.accentSoft = withAlpha(resolvedDark, 0.18);
    dark.palette.onAccent = readableOn(resolvedDark);
    dark.onAccent = dark.palette.onAccent;
  }

  if (secondary) {
    light.palette.secondary = colorOrNull(input.accentSecondary) ?? secondary;
    dark.palette.secondary = colorOrNull(input.accentSecondary) ?? secondary;
  }

  checkContrast(light.palette, 'light', report);
  checkContrast(dark.palette, 'dark', report);

  /** @type {ResolvedTheme} */
  const theme = {
    name: preset.name,
    label: preset.label,
    description: preset.description,
    mode,
    modeLabel: mode === 'auto' ? 'System' : mode === 'dark' ? 'Dark' : 'Light',
    radius,
    radiusValue: `${radiusValue(radius)}px`,
    spacing,
    density,
    container,
    animations: input.animations !== false,
    gradients: input.gradients !== false,
    accent: light.palette.accent,
    accentSecondary: light.palette.secondary,
    secondary: light.palette.secondary,
    themeColor: mode === 'dark' ? dark.palette.background : light.palette.background,
    fontUrl,
    customCss: typeof input.customCss === 'string' && input.customCss.trim() ? input.customCss.trim() : null,
    typography: {
      heading: typography.heading ?? 'Inter',
      body: typography.body ?? 'Inter',
      mono: typography.mono ?? 'JetBrains Mono',
      scale: fontScale,
      headingWeight,
      fontDisplay,
      baseSize: `${densityScale.fontSize}px`,
      lineHeight: densityScale.lineHeight,
      fontUrl: typeof typography.fontUrl === 'string' ? typography.fontUrl : undefined,
    },
    light,
    dark,
    customProperties: sanitizeCustomProperties(input.customProperties),
    variables: {},
  };

  theme.variables = themeVariables(theme);
  return { theme, diagnostics };
}

/**
 * The flat `ap-*` variable map, light values first and dark overrides prefixed
 * with `dark-`. Keys carry no leading dashes.
 *
 * @param {ResolvedTheme} theme
 * @returns {Record<string, string>}
 */
export function themeVariables(theme) {
  /** @param {string} prefix @param {ResolvedPalette} palette */
  const paletteVars = (prefix, palette) => ({
    [`${prefix}bg`]: palette.background,
    [`${prefix}surface`]: palette.surface,
    [`${prefix}surface-2`]: palette.surfaceAlt,
    [`${prefix}text`]: palette.text,
    [`${prefix}text-muted`]: palette.muted,
    [`${prefix}border`]: palette.border,
    [`${prefix}accent`]: palette.accent,
    [`${prefix}accent-soft`]: palette.accentSoft,
    [`${prefix}accent-ink`]: palette.accentInk,
    [`${prefix}on-accent`]: palette.onAccent,
    [`${prefix}secondary`]: palette.secondary,
    [`${prefix}code-bg`]: palette.code,
    [`${prefix}marker`]: palette.marker,
    [`${prefix}shadow-color`]: palette.shadow,
    [`${prefix}focus`]: palette.focus,
  });

  const radius = radiusValue(theme.radius);
  const spacing = scaleValue(SPACING_SCALES, theme.spacing, SPACING_SCALES.comfortable);
  const shared = {
    'ap-radius-sm': `${Math.max(0, Math.round(radius * 0.6))}px`,
    'ap-radius-md': `${radius}px`,
    'ap-radius-lg': `${Math.round(radius * 1.6)}px`,
    'ap-radius-full': '999px',
    'ap-radius-pill': '999px',
    'ap-container': scaleValue(CONTAINER_SCALES, theme.container, CONTAINER_SCALES.normal),
    'ap-space-block': `${round(spacing)}rem`,
    'ap-space-section': `${round(spacing * 2.5)}rem`,
    'ap-space-inline': `${round(spacing * 0.5)}rem`,
    'ap-font-body': resolveFontStack(theme.typography.body, { fallback: FONT_STACKS.sans }),
    'ap-font-heading': resolveFontStack(theme.typography.heading, { fallback: FONT_STACKS.sans }),
    'ap-font-mono': resolveFontStack(theme.typography.mono, { fallback: FONT_STACKS.mono }),
    'ap-base-font-size': theme.typography.baseSize,
    'ap-font-scale': String(theme.typography.scale),
    'ap-line-height': String(theme.typography.lineHeight),
    'ap-heading-weight': String(theme.typography.headingWeight),
    'ap-font-display': theme.typography.fontDisplay,
    'ap-animation-duration': theme.animations ? '220ms' : '0ms',
    'ap-animation-easing': 'cubic-bezier(0.4, 0, 0.2, 1)',
  };

  const custom = Object.fromEntries(
    Object.entries(theme.customProperties).map(([name, value]) => [`ap-${name.replace(/^--?/, '').replace(/^ap-/, '')}`, value]),
  );

  return {
    ...paletteVars('ap-', theme.light.palette),
    ...paletteVars('dark-ap-', theme.dark.palette),
    ...shared,
    ...custom,
  };
}

/**
 * The theme as CSS. Light values live on `:root`, dark values are emitted both
 * behind `prefers-color-scheme` (unless the mode is pinned) and behind
 * `[data-theme="dark"]`, which is what the theme toggle in `client.js` sets.
 *
 * @param {ResolvedTheme} theme
 * @param {{minify?: boolean}} [options]
 * @returns {string}
 */
export function themeToCss(theme, options = {}) {
  const minify = options.minify === true;
  const gap = minify ? '' : ' ';
  const nl = minify ? '' : '\n';

  /** @param {(name: string) => boolean} filter */
  const declarations = (filter) =>
    Object.entries(theme.variables)
      .filter(([name]) => filter(name))
      .map(([name, value]) => `--${name.replace(/^dark-/, '')}:${gap}${value};`)
      .join(nl);

  const lightDecls = [
    declarations((name) => !name.startsWith('dark-')),
    `color-scheme:${gap}${theme.mode === 'dark' ? 'dark' : theme.mode === 'light' ? 'light' : 'light dark'};`,
  ].join(nl);
  const darkDecls = [declarations((name) => name.startsWith('dark-')), `color-scheme:${gap}dark;`].join(nl);

  /** @type {string[]} */
  const blocks = [];
  if (theme.mode === 'dark') {
    blocks.push(`:root{${darkDecls}}`);
  } else {
    blocks.push(`:root{${lightDecls}}`);
    if (theme.mode === 'auto') {
      blocks.push(`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkDecls}}}`);
    }
    blocks.push(`:root[data-theme="dark"]{${darkDecls}}`);
  }

  // A user can pin the mode to dark; the toggle then has nothing to switch to,
  // so the light values are dropped entirely to keep the output small.

  if (!theme.animations) {
    blocks.push(
      `*,*::before,*::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;transition-duration:0.001ms !important}`,
    );
  }

  return blocks.join(nl) + nl;
}

/**
 * Resolve the accent-independent parts of a palette: readable text, a tinted
 * accent background, code and marker colours, and a shadow.
 *
 * @param {ThemePalette} base
 * @param {ThemePalette} colors
 * @returns {ThemeSide}
 */
function resolvePalette(base, colors) {
  /** @type {ResolvedPalette} */
  const palette = {
    background: colors.background,
    surface: colors.surface,
    surfaceAlt: colors.surfaceAlt,
    text: colors.text,
    muted: colors.muted,
    border: colors.border,
    accent: colors.accent,
    secondary: colors.secondary ?? colors.accent,
    onAccent: readableOn(colors.accent),
    accentInk: ensureContrast(colors.accent, colors.background, { target: 4.5 }),
    accentSoft: withAlpha(colors.accent, 0.12),
    code: blend(colors.surface, colors.text, 0.06),
    marker: withAlpha(colors.accent, 0.28),
    shadow: withAlpha(base.text, 0.12),
    focus: withAlpha(colors.accent, 0.45),
  };
  return { palette, onAccent: palette.onAccent };
}

/**
 * Build a Google Fonts URL when the configured families are real web fonts and
 * loading them is enabled. Otherwise the configured stylesheet wins.
 *
 * @param {Record<string, any>} typography
 * @param {{mode: string, display: string, onWarning: (entry: any) => void}} options
 * @returns {string|null}
 */
function resolveFontUrl(typography, options) {
  const explicit = typeof typography.fontUrl === 'string' && /^https?:\/\//i.test(typography.fontUrl) ? typography.fontUrl : null;
  if (typography.googleFonts === false) return explicit;

  const families = [...new Set([typography.heading, typography.body, typography.mono].filter(Boolean))];
  const googleFamilies = families.filter((family) => GOOGLE_FONTS.has(String(family).toLowerCase()));
  if (!googleFamilies.length) return explicit;

  const params = googleFamilies
    .map((family) => {
      const name = String(family).trim().replace(/\s+/g, '+');
      const weights = String(family).toLowerCase().includes('mono') ? '400;500;600' : '400;500;600;700';
      return `family=${name}:wght@${weights}`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=${options.display}`;
}

/**
 * Report palettes whose text may be hard to read, which is the most common
 * theme mistake (a custom accent on a custom background).
 *
 * @param {ResolvedPalette} palette
 * @param {string} side
 * @param {(entry: any) => void} report
 */
function checkContrast(palette, side, report) {
  const ratio = contrastRatio(palette.text, palette.background);
  if (ratio < 4.5) {
    report({
      severity: 'warning',
      code: ErrorCodes.THEME_CONTRAST,
      message: `Text on the ${side} background only reaches a ${ratio.toFixed(1)}:1 contrast ratio`,
      path: `theme.${side}`,
      hint: 'Aim for 4.5:1 or higher; WCAG AA requires it for body text.',
    });
  }
}

/**
 * Extra custom properties arrive without the `ap-` prefix, e.g.
 * `{ 'space-block': '3rem' }`.
 *
 * @param {unknown} input
 * @returns {Record<string, string>}
 */
function sanitizeCustomProperties(input) {
  if (!input || typeof input !== 'object') return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const name = key.trim().replace(/^--?/, '').replace(/^ap-/, '');
    if (!name) continue;
    out[name] = String(value);
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} fallback
 * @param {string} path
 * @param {(entry: any) => void} report
 * @returns {string}
 */
function nameOrDefault(value, allowed, fallback, path, report) {
  if (value === undefined || value === null || value === '') return fallback;
  const name = String(value).trim().toLowerCase();
  if (allowed.includes(name)) return name;
  report({
    severity: 'warning',
    code: ErrorCodes.THEME_INVALID,
    message: `Unknown value "${value}" for \`${path}\``,
    path,
    hint: `Use one of: ${allowed.join(', ')}.`,
  });
  return fallback;
}

/** @param {unknown} value */
function colorOrNull(value) {
  return typeof value === 'string' && isColor(value) ? value : null;
}

/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max */
function clampNumber(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** @param {number} value */
function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Read a value out of one of the scale records above, falling back when the
 * name is unknown.
 *
 * @template T
 * @param {Record<string, T>} table
 * @param {string} name
 * @param {T} fallback
 * @returns {T}
 */
function scaleValue(table, name, fallback) {
  return Object.prototype.hasOwnProperty.call(table, name) ? /** @type {T} */ (table[name]) : fallback;
}

/**
 * Corner rounding in pixels, clamped to something a browser will honour.
 * @param {string} name
 * @returns {number}
 */
function radiusValue(name) {
  return scaleValue(RADIUS_SCALES, name, RADIUS_SCALES.md);
}

/**
 * Blend two colours by parsing them first; `mix` works on parsed values.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} weight
 * @returns {string}
 */
function blend(a, b, weight) {
  const first = parseColor(a);
  const second = parseColor(b);
  if (!first || !second) return a;
  return toHex(mix(first, second, weight));
}
