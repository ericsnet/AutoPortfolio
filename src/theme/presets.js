/**
 * Theme presets.
 *
 * A preset only declares *defaults*; the theme system derives the full palette
 * from them, so a preset stays a readable thirteen-line object and a user can
 * override any single value without redefining the rest.
 *
 * @module theme/presets
 */

/**
 * @typedef {object} ThemePalette
 * @property {string} background   Page background.
 * @property {string} surface      Cards and raised panels.
 * @property {string} surfaceAlt   Secondary surfaces (code blocks, table stripes).
 * @property {string} text         Primary text.
 * @property {string} muted        Secondary text.
 * @property {string} border       Hairlines and outlines.
 * @property {string} accent       Brand colour.
 * @property {string} [secondary]  Secondary brand colour (gradients, highlights).
 */

/**
 * @typedef {object} ThemePreset
 * @property {string} name
 * @property {string} label
 * @property {string} description
 * @property {{heading: string, body: string, mono: string}} typography
 * @property {string} radius
 * @property {string} spacing
 * @property {{light: ThemePalette, dark: ThemePalette}} colors
 */

/** @type {Record<string, ThemePreset>} */
export const THEME_PRESETS = {
  default: {
    name: 'default',
    label: 'Default',
    description: 'Neutral surfaces with an indigo accent. A safe, professional starting point.',
    typography: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
    radius: 'md',
    spacing: 'comfortable',
    colors: {
      light: {
        background: '#ffffff',
        surface: '#f8fafc',
        surfaceAlt: '#f1f5f9',
        text: '#0f172a',
        muted: '#556070',
        border: '#e2e8f0',
        accent: '#4f46e5',
        secondary: '#0ea5e9',
      },
      dark: {
        background: '#0b1120',
        surface: '#131c31',
        surfaceAlt: '#1b2540',
        text: '#e8edf7',
        muted: '#9aa8bf',
        border: '#25314c',
        accent: '#8b93ff',
        secondary: '#38bdf8',
      },
    },
  },

  minimal: {
    name: 'minimal',
    label: 'Minimal',
    description: 'Quiet greys, serif headings and tight corners. Content first.',
    typography: {
      heading: 'Georgia',
      body: 'system-ui',
      mono: 'ui-monospace',
    },
    radius: 'sm',
    spacing: 'spacious',
    colors: {
      light: {
        background: '#ffffff',
        surface: '#fafafa',
        surfaceAlt: '#f4f4f5',
        text: '#18181b',
        muted: '#5b5b66',
        border: '#e4e4e7',
        accent: '#18181b',
        secondary: '#71717a',
      },
      dark: {
        background: '#101012',
        surface: '#17171a',
        surfaceAlt: '#1f1f23',
        text: '#f4f4f5',
        muted: '#a1a1aa',
        border: '#2c2c31',
        accent: '#fafafa',
        secondary: '#a1a1aa',
      },
    },
  },

  terminal: {
    name: 'terminal',
    label: 'Terminal',
    description: 'Monospaced green-on-black, built for people who ship in a shell.',
    typography: {
      heading: 'JetBrains Mono',
      body: 'JetBrains Mono',
      mono: 'JetBrains Mono',
    },
    radius: 'none',
    spacing: 'compact',
    colors: {
      light: {
        background: '#f6f8f4',
        surface: '#ffffff',
        surfaceAlt: '#eef2ea',
        text: '#0f1a12',
        muted: '#4c5a4f',
        border: '#d5ded3',
        accent: '#17803d',
        secondary: '#0f766e',
      },
      dark: {
        background: '#080d0a',
        surface: '#0f1712',
        surfaceAlt: '#15211a',
        text: '#d7f5df',
        muted: '#84a08b',
        border: '#1f2f24',
        accent: '#4ade80',
        secondary: '#22d3ee',
      },
    },
  },

  editorial: {
    name: 'editorial',
    label: 'Editorial',
    description: 'Warm paper tones and a strong serif voice, like a printed profile.',
    typography: {
      heading: 'Playfair Display',
      body: 'Source Serif',
      mono: 'IBM Plex Mono',
    },
    radius: 'sm',
    spacing: 'spacious',
    colors: {
      light: {
        background: '#fdfbf7',
        surface: '#ffffff',
        surfaceAlt: '#f6f1e7',
        text: '#1c1917',
        muted: '#6b6259',
        border: '#e7ddcd',
        accent: '#b45309',
        secondary: '#7c2d12',
      },
      dark: {
        background: '#151210',
        surface: '#1d1917',
        surfaceAlt: '#262020',
        text: '#f5efe6',
        muted: '#b3a596',
        border: '#332b26',
        accent: '#fbbf24',
        secondary: '#fb923c',
      },
    },
  },

  nord: {
    name: 'nord',
    label: 'Nord',
    description: 'Cool blue-grey palette with a calm, low-contrast feel.',
    typography: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
    radius: 'lg',
    spacing: 'comfortable',
    colors: {
      light: {
        background: '#fbfcfd',
        surface: '#f2f4f8',
        surfaceAlt: '#e8ecf3',
        text: '#2e3440',
        muted: '#5c6b80',
        border: '#d8dee9',
        accent: '#5e81ac',
        secondary: '#88c0d0',
      },
      dark: {
        background: '#2e3440',
        surface: '#3b4252',
        surfaceAlt: '#434c5e',
        text: '#eceff4',
        muted: '#aebacb',
        border: '#4c566a',
        accent: '#88c0d0',
        secondary: '#81a1c1',
      },
    },
  },

  sunset: {
    name: 'sunset',
    label: 'Sunset',
    description: 'High-energy coral and violet gradients for creative portfolios.',
    typography: {
      heading: 'Poppins',
      body: 'Inter',
      mono: 'Fira Code',
    },
    radius: 'xl',
    spacing: 'comfortable',
    colors: {
      light: {
        background: '#fffaf9',
        surface: '#ffffff',
        surfaceAlt: '#fff0ec',
        text: '#2b1216',
        muted: '#7a5a58',
        border: '#ffdcd2',
        accent: '#e11d48',
        secondary: '#7c3aed',
      },
      dark: {
        background: '#190a14',
        surface: '#25101d',
        surfaceAlt: '#321627',
        text: '#ffe9f1',
        muted: '#d0a3b8',
        border: '#3f1e33',
        accent: '#fb7185',
        secondary: '#a78bfa',
      },
    },
  },

  forest: {
    name: 'forest',
    label: 'Forest',
    description: 'Deep greens and soft neutrals; reads as calm and grounded.',
    typography: {
      heading: 'Fraunces',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
    radius: 'md',
    spacing: 'comfortable',
    colors: {
      light: {
        background: '#fbfdfa',
        surface: '#ffffff',
        surfaceAlt: '#eef5ee',
        text: '#10231a',
        muted: '#4f6355',
        border: '#d7e6da',
        accent: '#15803d',
        secondary: '#0d9488',
      },
      dark: {
        background: '#0a1410',
        surface: '#11201a',
        surfaceAlt: '#16291f',
        text: '#e5f3ea',
        muted: '#93ac9d',
        border: '#1e3528',
        accent: '#4ade80',
        secondary: '#2dd4bf',
      },
    },
  },
};

/** @type {string[]} */
export const THEME_PRESET_NAMES = Object.freeze(Object.keys(THEME_PRESETS));

/**
 * @param {string} name
 * @returns {ThemePreset}
 */
export function getPreset(name) {
  return THEME_PRESETS[name] ?? THEME_PRESETS.default;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function hasPreset(name) {
  return Object.prototype.hasOwnProperty.call(THEME_PRESETS, name);
}
