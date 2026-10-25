/**
 * Inline SVG icon set.
 *
 * Icons are inlined rather than loaded as a font or sprite for two reasons:
 * they work in every static host without extra requests, and they can inherit
 * `currentColor` so they follow the active theme.
 *
 * The set is deliberately generic (interface icons such as mail, phone, code,
 * briefcase). Social networks are rendered as labelled links with the generic
 * link icon, which stays accurate for any network, including ones that are not
 * bundled here.
 *
 * @module assets/icons
 */

/**
 * `viewBox 0 0 24 24`, stroke based, 1.7px stroke, round caps — the same
 * geometry Feather popularised.
 *
 * @type {Record<string, string>}
 */
export const ICONS = {
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 13 4.5a3.5 3.5 0 0 1 5 5l-2 2"/><path d="M13 17.5 11 19.5a3.5 3.5 0 0 1-5-5l2-2"/>',
  'external-link':
    '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.6 6.7 7.5 5.3a1.5 1.5 0 0 0 1.8 0l7.5-5.3"/>',
  phone:
    '<path d="M6.2 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.4 6.4l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2Z"/>',
  'map-pin': '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  'user-group':
    '<circle cx="9.5" cy="8.5" r="3"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6"/><path d="M18 19.5a5.2 5.2 0 0 0-1.6-3.7"/>',
  code: '<path d="m9 7.5-4.5 4.5L9 16.5"/><path d="m15 7.5 4.5 4.5L15 16.5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7.5 9.5 2.5 2.5-2.5 2.5"/><path d="M12.5 15h4"/>',
  'git-branch':
    '<path d="M7 4v10"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="7" r="3"/><path d="M17 10a7 7 0 0 1-7 7"/>',
  layers: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m4 12 8 4.3 8-4.3"/><path d="m4 16.2 8 4.3 8-4.3"/>',
  briefcase:
    '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7"/><path d="M3 12.5h18"/>',
  'graduation-cap':
    '<path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z"/><path d="M6.5 10.7V15c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.3"/><path d="M21 8.5v5"/>',
  award:
    '<circle cx="12" cy="9.5" r="5"/><path d="m8.6 13.8-1.3 6.4 4.7-2.6 4.7 2.6-1.3-6.4"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5Z"/><path d="M5 18V5.5"/><path d="M19 18v3H7.5"/>',
  quote: '<path d="M9.5 6.5c-3 1-4.5 3.3-4.5 6.5v4.5h5.5V12H7.6c0-2 .8-3.3 2.6-4Z"/><path d="M19 6.5c-3 1-4.5 3.3-4.5 6.5v4.5H20V12h-2.9c0-2 .8-3.3 2.6-4Z"/>',
  star: '<path d="m12 4 2.5 5.3 5.5.7-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.5-.7L12 4Z"/>',
  sparkles:
    '<path d="m12 3.5 1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7L12 3.5Z"/><path d="m18.5 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M8 3.5v4"/><path d="M16 3.5v4"/><path d="M3.5 10.5h17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  'arrow-right': '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  'arrow-up': '<path d="M12 19.5v-15"/><path d="m6 10.5 6-6 6 6"/>',
  'arrow-left': '<path d="M19.5 12h-15"/><path d="m10.5 6-6 6 6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  rss: '<circle cx="6" cy="18" r="1.8"/><path d="M4.5 11.5A8 8 0 0 1 12.5 19.5"/><path d="M4.5 5.5A14 14 0 0 1 18.5 19.5"/>',
  'file-text':
    '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z"/><path d="M13.5 3.5V9H19"/><path d="M9 13h6"/><path d="M9 16.5h4"/>',
  filter: '<path d="M4 5.5h16l-6 7v5.5l-4 2v-7.5l-6-7Z"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.7 5 3.3-5 3.3V8.7Z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17.5 4.8-4.3a1.6 1.6 0 0 1 2.2 0l3 2.8 1.7-1.5a1.6 1.6 0 0 1 2.2 0l1.9 1.8"/>',
  x: '<path d="m5 5 14 14"/><path d="M19 5 5 19"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m11 9.5 4 2.5-4 2.5v-5Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z"/>',
  zap: '<path d="M13.5 3 5.5 13.5H11l-.5 7.5 8-10.5H13l.5-7.5Z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.6-1.3-1.9-1.3-3 0-.8.7-1.4 1.6-1.4h1.8a4.4 4.4 0 0 0 4.4-4.4c0-3.5-3.6-6.4-8.5-6.4Z"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.6" r="1.2"/><circle cx="16" cy="10" r="1.2"/>',
  'shield-check': '<path d="M12 3.5 5.5 6v6c0 4.2 2.8 6.9 6.5 8.5 3.7-1.6 6.5-4.3 6.5-8.5V6L12 3.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  server: '<rect x="3.5" y="4.5" width="17" height="6" rx="1.6"/><rect x="3.5" y="13.5" width="17" height="6" rx="1.6"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>',
  database: '<ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  cloud: '<path d="M7.5 19h9.2a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.4 10.5 4.3 4.3 0 0 0 7.5 19Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  send: '<path d="M20.5 3.5 3.5 10.2l6.3 2.3 2.3 6.3L20.5 3.5Z"/><path d="m9.8 12.5 4.4-4.4"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h10.5l-1.2 3.6 1.2 3.6H6"/>',
  lightbulb: '<path d="M9 17.5h6"/><path d="M10 20.5h4"/><path d="M12 3.5a5.5 5.5 0 0 1 3.2 9.9c-.5.4-.7 1-.7 1.6v.5H9.5v-.5c0-.6-.2-1.2-.7-1.6A5.5 5.5 0 0 1 12 3.5Z"/>',
  puzzle:
    '<path d="M10.5 4.5h3v1.6a1.6 1.6 0 1 0 3.2 0V4.5h1.8v3.2h1.6a1.6 1.6 0 1 0 0 3.2h-1.6v3.4h-3.2v1.8a1.6 1.6 0 1 1-3.2 0v-1.8H7.3v-3.4H5.5a1.6 1.6 0 1 1 0-3.2h1.8V4.5Z"/>',
};

/** @type {string[]} */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** Aliases so templates can ask for the semantic name. */
const ALIASES = {
  website: 'globe',
  url: 'link',
  blog: 'file-text',
  email: 'mail',
  location: 'map-pin',
  company: 'briefcase',
  education: 'graduation-cap',
  certification: 'award',
  publications: 'book',
  testimonials: 'quote',
  projects: 'layers',
  experience: 'briefcase',
  skills: 'sparkles',
  technologies: 'code',
  languages: 'code',
  spokenLanguages: 'globe',
  contact: 'send',
  about: 'user',
  social: 'user-group',
  awards: 'award',
  twitter: 'x',
  gitlab: 'git-branch',
  stackoverflow: 'code',
  devto: 'file-text',
  hashnode: 'file-text',
  medium: 'file-text',
  dribbble: 'palette',
  behance: 'palette',
  figma: 'palette',
  npm: 'layers',
  pypi: 'layers',
  crates: 'layers',
  docker: 'server',
  linkedin: 'user-group',
  kaggle: 'database',
  researchgate: 'book',
  orcid: 'user',
  scholar: 'book',
  telegram: 'send',
  whatsapp: 'phone',
  discord: 'user-group',
  signal: 'phone',
  calendly: 'calendar',
  mastodon: 'user-group',
  bluesky: 'cloud',
  threads: 'user-group',
  twitch: 'play',
  instagram: 'image',
  github: 'code',
  resume: 'file-text',
  cv: 'file-text',
  rss: 'rss',
};

/**
 * Look up icon markup (without the wrapping `<svg>`).
 *
 * @param {string|undefined|null} name
 * @returns {string|undefined}
 */
export function iconPath(name) {
  if (!name) return undefined;
  const key = String(name).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (ICONS[key]) return ICONS[key];
  const alias = ALIASES[key];
  if (alias && ICONS[alias]) return ICONS[alias];
  return undefined;
}

/**
 * @param {string|undefined|null} name
 * @returns {boolean}
 */
export function hasIcon(name) {
  return iconPath(name) !== undefined;
}
