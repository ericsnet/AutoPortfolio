/**
 * Known link hosts.
 *
 * The key a person uses in `social:` or `contact.links:` is what shows up as the
 * label and icon, so the list below is the whole mapping from "short key" to
 * "nicely presented link". Unknown keys still work — they are humanised — but
 * known ones get the right icon, label and handle URL.
 *
 * @module model/hosts
 */

/**
 * @typedef {object} Host
 * @property {string} key        Key used in the portfolio document.
 * @property {string} label      Human readable network name.
 * @property {string} icon       Icon name from `src/assets/icons.js`.
 * @property {string} [profile]  Template for a profile URL when only a handle is given.
 * @property {boolean} [primary] Highlighted in the hero.
 * @property {boolean} [contact] Shown in the contact section.
 * @property {string[]} [aliases] Alternative keys.
 */

/** @type {Host[]} */
export const HOSTS = [
  { key: 'github', label: 'GitHub', icon: 'github', profile: 'https://github.com/{handle}', primary: true, contact: true },
  { key: 'gitlab', label: 'GitLab', icon: 'gitlab', profile: 'https://gitlab.com/{handle}', primary: true },
  { key: 'codeberg', label: 'Codeberg', icon: 'codeberg', profile: 'https://codeberg.org/{handle}' },
  { key: 'bitbucket', label: 'Bitbucket', icon: 'bitbucket', profile: 'https://bitbucket.org/{handle}' },
  { key: 'sourcehut', label: 'SourceHut', icon: 'git', profile: 'https://git.sr.ht/~{handle}', aliases: ['srht'] },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', profile: 'https://www.linkedin.com/in/{handle}', primary: true, contact: true },
  { key: 'x', label: 'X', icon: 'x', profile: 'https://x.com/{handle}', primary: true, aliases: ['twitter'] },
  { key: 'mastodon', label: 'Mastodon', icon: 'mastodon', primary: true },
  { key: 'bluesky', label: 'Bluesky', icon: 'bluesky', profile: 'https://bsky.app/profile/{handle}', aliases: ['bsky'] },
  { key: 'threads', label: 'Threads', icon: 'threads', profile: 'https://www.threads.net/@{handle}' },
  { key: 'devto', label: 'DEV Community', icon: 'devdotto', profile: 'https://dev.to/{handle}', aliases: ['dev', 'dev.to', 'devcommunity'] },
  { key: 'hashnode', label: 'Hashnode', icon: 'hashnode', profile: 'https://hashnode.com/@{handle}' },
  { key: 'medium', label: 'Medium', icon: 'medium', profile: 'https://medium.com/@{handle}' },
  { key: 'substack', label: 'Substack', icon: 'rss', profile: 'https://{handle}.substack.com' },
  { key: 'youtube', label: 'YouTube', icon: 'youtube', profile: 'https://youtube.com/@{handle}', primary: true },
  { key: 'vimeo', label: 'Vimeo', icon: 'vimeo', profile: 'https://vimeo.com/{handle}' },
  { key: 'twitch', label: 'Twitch', icon: 'twitch', profile: 'https://twitch.tv/{handle}' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram', profile: 'https://instagram.com/{handle}' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook', profile: 'https://facebook.com/{handle}' },
  { key: 'tiktok', label: 'TikTok', icon: 'music', profile: 'https://tiktok.com/@{handle}' },
  { key: 'reddit', label: 'Reddit', icon: 'reddit', profile: 'https://reddit.com/user/{handle}' },
  { key: 'hackernews', label: 'Hacker News', icon: 'ycombinator', profile: 'https://news.ycombinator.com/user?id={handle}', aliases: ['hn'] },
  { key: 'lobsters', label: 'Lobsters', icon: 'lobsters', profile: 'https://lobste.rs/~{handle}' },
  { key: 'stackoverflow', label: 'Stack Overflow', icon: 'stackoverflow', profile: 'https://stackoverflow.com/users/{handle}', aliases: ['stack'] },
  { key: 'behance', label: 'Behance', icon: 'behance', profile: 'https://behance.net/{handle}' },
  { key: 'dribbble', label: 'Dribbble', icon: 'dribbble', profile: 'https://dribbble.com/{handle}' },
  { key: 'figma', label: 'Figma', icon: 'figma', profile: 'https://figma.com/@{handle}' },
  { key: 'npm', label: 'npm', icon: 'npm', profile: 'https://www.npmjs.com/~{handle}', aliases: ['npmjs'] },
  { key: 'pypi', label: 'PyPI', icon: 'python', profile: 'https://pypi.org/user/{handle}' },
  { key: 'crates', label: 'crates.io', icon: 'rust', profile: 'https://crates.io/users/{handle}', aliases: ['cratesio'] },
  { key: 'dockerhub', label: 'Docker Hub', icon: 'docker', profile: 'https://hub.docker.com/u/{handle}', aliases: ['docker'] },
  { key: 'kaggle', label: 'Kaggle', icon: 'kaggle', profile: 'https://kaggle.com/{handle}' },
  { key: 'orcid', label: 'ORCID', icon: 'academic', profile: 'https://orcid.org/{handle}' },
  { key: 'scholar', label: 'Google Scholar', icon: 'academic', aliases: ['googlescholar'] },
  { key: 'researchgate', label: 'ResearchGate', icon: 'academic' },
  { key: 'calendly', label: 'Calendly', icon: 'calendar', aliases: ['cal', 'calcom'] },
  { key: 'discord', label: 'Discord', icon: 'discord', profile: 'https://discord.gg/{handle}' },
  { key: 'telegram', label: 'Telegram', icon: 'telegram', profile: 'https://t.me/{handle}' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', profile: 'https://wa.me/{handle}' },
  { key: 'signal', label: 'Signal', icon: 'chat' },
  { key: 'matrix', label: 'Matrix', icon: 'chat', profile: 'https://matrix.to/#/@{handle}' },
  { key: 'keybase', label: 'Keybase', icon: 'key', profile: 'https://keybase.io/{handle}' },
  { key: 'patreon', label: 'Patreon', icon: 'heart', profile: 'https://patreon.com/{handle}' },
  { key: 'buymeacoffee', label: 'Buy Me a Coffee', icon: 'coffee', profile: 'https://buymeacoffee.com/{handle}', aliases: ['coffee'] },
  { key: 'email', label: 'Email', icon: 'mail', primary: true, contact: true },
  { key: 'rss', label: 'RSS', icon: 'rss' },
  { key: 'blog', label: 'Blog', icon: 'globe', primary: true },
  { key: 'website', label: 'Website', icon: 'globe' },
];

/** @type {Map<string, Host>} */
const BY_KEY = new Map();
for (const host of HOSTS) {
  BY_KEY.set(host.key, host);
  for (const alias of host.aliases ?? []) BY_KEY.set(alias, host);
}

/** Every key (and alias) that resolves to a known host, used by the schema docs. */
export const HOST_KEYS = HOSTS.map((host) => host.key);

/**
 * Look up a host by key. Unknown keys are not an error: a portfolio may link to
 * something this list has never heard of.
 *
 * @param {string} key
 * @returns {Host|null}
 */
export function findHost(key) {
  if (!key) return null;
  const normalized = String(key).trim().toLowerCase().replace(/[\s_.]+/g, '');
  return BY_KEY.get(normalized) ?? null;
}

/**
 * Label for a link whose key is not a known host: `my-blog` -> `My blog`.
 *
 * @param {string} key
 * @returns {string}
 */
export function humanizeKey(key) {
  const spaced = String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return 'Link';
  const words = spaced.split(/\s+/);
  const known = new Set(['github', 'gitlab', 'npm', 'pypi', 'rss', 'x', 'youtube', 'linkedin', 'doi', 'api']);
  return words
    .map((word) => (known.has(word.toLowerCase()) ? KNOWN_LABELS[word.toLowerCase()] ?? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** @type {Record<string, string>} */
const KNOWN_LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  npm: 'npm',
  pypi: 'PyPI',
  rss: 'RSS',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  doi: 'DOI',
  api: 'API',
};

/**
 * Where the icon for a link comes from: the host list, or a sensible guess.
 *
 * @param {string} key
 * @param {string} [explicit]
 * @returns {string}
 */
export function iconForKey(key, explicit) {
  if (explicit) return explicit;
  const host = findHost(key);
  if (host) return host.icon;
  if (/mail/i.test(key)) return 'mail';
  if (/phone|tel/i.test(key)) return 'phone';
  if (/resume|cv/i.test(key)) return 'file';
  if (/blog|post|writ/i.test(key)) return 'globe';
  if (/talk|speak|slide/i.test(key)) return 'mic';
  if (/video/i.test(key)) return 'video';
  if (/paper|publication|article/i.test(key)) return 'academic';
  if (/code|repo/i.test(key)) return 'code';
  return 'link';
}

/**
 * Sorted link keys by "how likely is this the important one", used to decide the
 * order of hero buttons and contact rows.
 *
 * @param {string[]} keys
 * @returns {string[]}
 */
export function sortLinkKeys(keys) {
  return [...keys].sort((a, b) => linkWeight(a) - linkWeight(b) || a.localeCompare(b));
}

/**
 * @param {string} key
 * @returns {number}
 */
export function linkWeight(key) {
  const host = findHost(key);
  if (!host) return 100;
  if (host.primary) return 0;
  if (host.contact) return 1;
  return 10;
}
