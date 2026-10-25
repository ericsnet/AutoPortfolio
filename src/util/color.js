/**
 * Colour utilities used by the theme system.
 *
 * Supports creating accessible palettes from a single accent colour: the theme
 * only asks for one brand colour and AutoPortfolio derives a full, contrast
 * checked scale from it.
 *
 * @module util/color
 */

/**
 * @typedef {object} Rgba
 * @property {number} r 0-255
 * @property {number} g 0-255
 * @property {number} b 0-255
 * @property {number} a 0-1
 */

/** @type {Record<string, string>} */
const NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  transparent: '#00000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  navy: '#000080',
  teal: '#008080',
  purple: '#800080',
  orange: '#ffa500',
  yellow: '#ffff00',
  pink: '#ffc0cb',
  indigo: '#4b0082',
  crimson: '#dc143c',
  tomato: '#ff6347',
  slategray: '#708090',
  slategrey: '#708090',
  midnightblue: '#191970',
  seagreen: '#2e8b57',
  royalblue: '#4169e1',
  steelblue: '#4682b4',
  darkslateblue: '#483d8b',
  rebeccapurple: '#663399',
};

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse a CSS colour (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
 * `rgba()`, `hsl()`, `hsla()` or a small set of names).
 *
 * @param {string} input
 * @returns {Rgba|null}
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const named = NAMED_COLORS[value];
  if (named) return parseColor(named);

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = digits.split('');
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
        a: a ? parseInt(a + a, 16) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const functional = value.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
  if (functional) {
    const [, fn, body] = functional;
    const parts = body
      .replace(/\//g, ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (fn.startsWith('rgb')) {
      const [r, g, b, a] = parts;
      return {
        r: clamp(parseChannel(r), 0, 255),
        g: clamp(parseChannel(g), 0, 255),
        b: clamp(parseChannel(b), 0, 255),
        a: a === undefined ? 1 : clamp(Number.parseFloat(a), 0, 1),
      };
    }
    const hue = Number.parseFloat(parts[0]);
    const saturation = Number.parseFloat(parts[1]) / 100;
    const lightness = Number.parseFloat(parts[2]) / 100;
    const alpha = parts[3] === undefined ? 1 : clamp(Number.parseFloat(parts[3]), 0, 1);
    const rgb = hslToRgb(hue, clamp(saturation, 0, 1), clamp(lightness, 0, 1));
    return { ...rgb, a: clamp(alpha, 0, 1) };
  }

  return null;
}

/**
 * @param {string|undefined} value
 * @returns {number}
 */
function parseChannel(value) {
  if (value === undefined) return 0;
  if (value.endsWith('%')) return (Number.parseFloat(value) / 100) * 255;
  return Number.parseFloat(value);
}

/**
 * @param {number} hue 0-360
 * @param {number} saturation 0-1
 * @param {number} lightness 0-1
 * @returns {{r: number, g: number, b: number}}
 */
export function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  if (saturation === 0) {
    const v = Math.round(lightness * 255);
    return { r: v, g: v, b: v };
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  /** @param {number} t */
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

/**
 * @param {Rgba} color
 * @returns {{h: number, s: number, l: number, a: number}}
 */
export function rgbToHsl(color) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  return { h: hue * 360, s: saturation, l: lightness, a: color.a };
}

/**
 * @param {Rgba} color
 * @returns {string} `#rrggbb`
 */
export function toHex(color) {
  const hex = (/** @type {number} */ value) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/**
 * @param {Rgba} color
 * @returns {string} `#rrggbb` or `#rrggbbaa`
 */
export function toHexWithAlpha(color) {
  if (color.a >= 1) return toHex(color);
  const hex = (/** @type {number} */ value) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}${hex(color.a * 255)}`;
}

/**
 * @param {Rgba} color
 * @returns {string} `rgba(r, g, b, a)`
 */
export function toRgbaString(color) {
  const alpha = Number.isInteger(color.a) ? color.a.toFixed(1) : String(Number(color.a.toFixed(3)));
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

/**
 * Mix two colours; `weight` is how much of `b` ends up in the result.
 * @param {Rgba} a
 * @param {Rgba} b
 * @param {number} weight 0-1
 * @returns {Rgba}
 */
export function mix(a, b, weight) {
  const w = clamp(weight, 0, 1);
  return {
    r: Math.round(a.r * (1 - w) + b.r * w),
    g: Math.round(a.g * (1 - w) + b.g * w),
    b: Math.round(a.b * (1 - w) + b.b * w),
    a: a.a * (1 - w) + b.a * w,
  };
}

/**
 * @param {Rgba} color
 * @param {number} amount 0-1 (positive lightens)
 * @returns {Rgba}
 */
export function adjustLightness(color, amount) {
  const hsl = rgbToHsl(color);
  const lightness = clamp(hsl.l + amount, 0, 1);
  const rgb = hslToRgb(hsl.h, hsl.s, lightness);
  return { ...rgb, a: color.a };
}

/**
 * @param {string} value
 * @param {number} amount
 * @returns {string}
 */
export function lighten(value, amount = 0.1) {
  const color = parseColor(value);
  return color ? toHex(adjustLightness(color, Math.abs(amount))) : value;
}

/**
 * @param {string} value
 * @param {number} amount
 * @returns {string}
 */
export function darken(value, amount = 0.1) {
  const color = parseColor(value);
  return color ? toHex(adjustLightness(color, -Math.abs(amount))) : value;
}

/**
 * WCAG relative luminance.
 * @param {Rgba} color
 * @returns {number}
 */
export function relativeLuminance(color) {
  /** @param {number} channel */
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/**
 * WCAG contrast ratio between two colours (1-21).
 * @param {Rgba|string} a
 * @param {Rgba|string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const first = typeof a === 'string' ? parseColor(a) : a;
  const second = typeof b === 'string' ? parseColor(b) : b;
  if (!first || !second) return 0;
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (lightest + 0.05) / (darkest + 0.05);
}

/**
 * Pick whichever of `light`/`dark` has more contrast against `background` —
 * used to compute readable text on top of an accent colour.
 *
 * @param {string} background
 * @param {object} [options]
 * @param {string} [options.light]
 * @param {string} [options.dark]
 * @returns {string}
 */
export function readableOn(background, options = {}) {
  const light = options.light ?? '#ffffff';
  const dark = options.dark ?? '#0b1120';
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/**
 * Nudge a colour's lightness until it has at least `target` contrast against
 * `background`. Returns the original colour when no adjustment is needed, and
 * the best attempt when the target cannot be reached.
 *
 * @param {string} color
 * @param {string} background
 * @param {object} [options]
 * @param {number} [options.target] Minimum contrast ratio (default 4.5:1).
 * @param {string} [options.direction] `auto` follows the background's lightness.
 * @returns {string}
 */
export function ensureContrast(color, background, options = {}) {
  const target = options.target ?? 4.5;
  const parsed = parseColor(color);
  const bg = parseColor(background);
  if (!parsed || !bg) return color;
  if (contrastRatio(parsed, bg) >= target) return toHex(parsed);

  const backgroundIsDark = relativeLuminance(bg) < 0.5;
  const direction = options.direction ?? (backgroundIsDark ? 'lighten' : 'darken');
  let best = parsed;
  let bestRatio = contrastRatio(parsed, bg);
  for (let step = 1; step <= 40; step += 1) {
    const amount = (step / 40) * 0.9 * (direction === 'lighten' ? 1 : -1);
    const candidate = adjustLightness(parsed, amount);
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= target) return toHex(candidate);
  }
  return toHex(best);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isColor(value) {
  return parseColor(value) !== null;
}

/**
 * Convert a colour to `rgba()` with the given alpha, preserving the hue.
 * @param {string} value
 * @param {number} alpha
 * @returns {string}
 */
export function withAlpha(value, alpha) {
  const parsed = parseColor(value);
  if (!parsed) return value;
  return toRgbaString({ ...parsed, a: clamp(alpha, 0, 1) });
}
