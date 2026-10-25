/**
 * Project scaffolding for `autoportfolio init`.
 *
 * The generated files are written to be *read*: every key is commented, so the
 * starter project doubles as the quickest possible documentation.
 *
 * @module cli/scaffold
 */

import path from 'node:path';
import { ErrorCodes, AutoPortfolioError } from '../util/errors.js';
import { ensureDir, exists, writeFileAtomic } from '../util/fsx.js';

/**
 * @typedef {object} ScaffoldOptions
 * @property {string} directory
 * @property {string} [template]
 * @property {string} [theme]
 * @property {string} [accent]
 * @property {boolean} [force]
 * @property {boolean} [minimal]
 * @property {boolean} [withCi]
 * @property {string} [name]
 * @property {string} [title]
 */

/**
 * @param {ScaffoldOptions} options
 * @returns {Promise<{files: string[], skipped: string[]}>}
 */
export async function scaffoldProject(options) {
  const directory = path.resolve(options.directory);
  const template = options.template ?? 'modern';
  const theme = options.theme ?? 'default';
  const accent = options.accent ?? defaultAccentFor(theme);

  /** @type {Array<{file: string, content: string}>} */
  const files = [
    { file: 'autoportfolio.config.yaml', content: configTemplate({ template, theme, accent }) },
    {
      file: 'portfolio.yaml',
      content: options.minimal ? minimalPortfolio(options) : fullPortfolio(options),
    },
    { file: '.gitignore', content: GITIGNORE },
    { file: 'assets/README.md', content: ASSETS_README },
    { file: 'favicon.svg', content: faviconTemplate(accent) },
  ];

  if (options.withCi) {
    files.push({ file: '.github/workflows/deploy.yml', content: ciTemplate() });
  }

  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];

  await ensureDir(directory);

  for (const entry of files) {
    const target = path.join(directory, entry.file);
    if (!options.force && (await exists(target))) {
      skipped.push(entry.file);
      continue;
    }
    await writeFileAtomic(target, entry.content);
    written.push(entry.file);
  }

  return { files: written, skipped };
}

/**
 * @param {string} theme
 * @returns {string}
 */
function defaultAccentFor(theme) {
  switch (theme) {
    case 'terminal':
      return '#4ade80';
    case 'sunset':
      return '#e11d48';
    case 'forest':
      return '#15803d';
    case 'nord':
      return '#5e81ac';
    case 'editorial':
      return '#b45309';
    case 'minimal':
      return '#18181b';
    default:
      return '#4f46e5';
  }
}

/**
 * @param {{template: string, theme: string, accent: string}} options
 * @returns {string}
 */
function configTemplate(options) {
  return `# AutoPortfolio configuration.
# Everything about *how* the site is built lives here; the content lives in
# portfolio.yaml. Docs: https://github.com/Pickeric/AutoPortfolio#configuration

data: portfolio.yaml
template: ${options.template}

theme:
  preset: ${options.theme}
  mode: auto          # auto | light | dark
  accent: "${options.accent}"
  radius: md          # none | sm | md | lg | xl | full
  spacing: comfortable # compact | comfortable | spacious
  typography:
    heading: Inter
    body: Inter
    mono: JetBrains Mono
  # customProperties:
  #   --ap-container: 60rem
  # customCss: custom.css

sections:
  # Every section is optional: sections without content are skipped.
  order: [about, skills, technologies, projects, experience, education, certifications, contact]
  nav: true
  numbered: false
  # labels:
  #   projects: Selected work

site:
  # baseUrl: https://your-domain.example   # needed for sitemap.xml and canonical links
  trailingSlash: true

assets:
  directory: assets

build:
  output: dist
  minify: true
  prettyUrls: true
  projectPages: true
  sitemap: true
  robots: true
  # rss: true

content:
  markdown: true
  externalLinksNewTab: true

serve:
  port: 4173
`;
}

/**
 * @param {ScaffoldOptions} options
 * @returns {string}
 */
function minimalPortfolio(options) {
  const name = options.name ?? 'Your Name';
  return `# The portfolio document. Edit this file and run \`autoportfolio dev\`.

profile:
  name: ${name}
  headline: What you do, in one line
  shortBio: One or two sentences about you.
  location: City, Country
  # avatar: assets/avatar.jpg

contact:
  email: you@example.com

social:
  github: https://github.com/your-handle
  linkedin: https://linkedin.com/in/your-handle

skills:
  - TypeScript
  - Python

projects:
  - name: First project
    description: What it does and why it matters.
    technologies: [TypeScript]
    github: https://github.com/your-handle/first-project
`;
}

/**
 * @param {ScaffoldOptions} options
 * @returns {string}
 */
function fullPortfolio(options) {
  const name = options.name ?? 'Your Name';
  const title = options.title ?? `${name} — portfolio`;
  return `# The portfolio document.
#
# This is the only file you need to edit: AutoPortfolio reads it and generates
# the whole site. Every section is optional — remove what you do not need and
# the section disappears from the generated site.
#
# Docs: https://github.com/Pickeric/AutoPortfolio#configuration

version: "1.0"

meta:
  title: ${title}
  description: >
    A sentence or two describing what you do. This is what search engines and
    social previews show, so make it specific.
  language: en
  # siteUrl: https://your-domain.example    # set this before deploying

profile:
  name: ${name}
  headline: Your role · your focus        # shown under your name
  shortBio: One or two sentences for the top of the page.
  about: |
    A longer introduction. Markdown is supported, so you can use **bold**,
    [links](https://example.com) and lists.

    A second paragraph is a good place to say what you are looking for.
  # avatar: assets/avatar.jpg             # square images work best (512×512)
  location: City, Country
  # company: Company name
  # jobTitle: Your job title
  # availability: open-to-offers          # available | open-to-offers | open-to-freelance | employed | not-available
  # yearsOfExperience: 5
  # resume: /resume.pdf

contact:
  email: you@example.com
  # phone: "+351 912 345 678"
  # calendarUrl: https://cal.com/your-handle
  # preferred: email
  message: The best way to reach me is email.
  # formAction: https://formspree.io/f/xxxxxxx   # enables the contact form

social:
  # Keys become labels and icons: github, linkedin, gitlab, mastodon, bluesky,
  # x, devto, medium, youtube, dribbble, npm, stackoverflow, …
  github:
    url: https://github.com/your-handle
    handle: "@your-handle"
  # linkedin: https://linkedin.com/in/your-handle

skills:
  - name: Skill or area
    category: Grouping        # optional; groups skills into columns
    level: advanced           # optional: beginner | intermediate | advanced | expert
    years: 4
    featured: true
  - name: Another skill
    category: Grouping

# Programming languages
languages:
  - name: TypeScript
    level: advanced
    years: 6
  - name: Python
    level: intermediate

# Tools and platforms, shown as a tag cloud
technologies:
  - name: PostgreSQL
    url: https://www.postgresql.org
  - Docker
  - Kubernetes

projects:
  - name: Project name
    tagline: One line that makes someone want to click.
    description: >-
      Two or three sentences — what it does, who uses it, and what you did on it.
    details: |
      A longer write-up shown on the project's own page. Markdown works here:
      headings, lists, code blocks and images.

      ## Why I built it

      The problem, the constraints, and what you would do differently.
    features:
      - A feature worth mentioning
      - Another one
    technologies: [TypeScript, PostgreSQL]
    # images:
    #   - src: assets/screenshots/project.png
    #     alt: Describe what the screenshot shows
    github: https://github.com/your-handle/project-name
    # liveUrl: https://project.example.com
    # start: 2024-01
    # end: present
    status: active             # concept | planning | in-progress | active | maintained | archived
    role: Creator
    featured: true             # highlighted on the home page
    tags: [web, tooling]       # used by the project filter
    metrics:
      - label: Users
        value: 1.2k

experience:
  - company: Company name
    role: Your job title
    companyUrl: https://example.com
    location: City, Country
    workMode: hybrid           # onsite | hybrid | remote
    employmentType: full-time
    start: 2023-04
    end: present
    summary: One line describing your remit.
    description: |
      What you owned and what changed because of you.
    highlights:
      - Something you shipped, ideally with a number attached
      - Something you improved for the team
    technologies: [TypeScript, AWS]

education:
  - institution: University name
    degree: BSc
    field: Computer Science
    location: City, Country
    start: 2018-09
    end: 2022-06
    grade: 1.3
    highlights:
      - Thesis or project worth mentioning

certifications:
  - name: Certification name
    issuer: Issuing organisation
    date: 2024-03
    expires: 2027-03
    credentialId: ABC-1234
    credentialUrl: https://verify.example.com/ABC-1234

# Optional extras
# awards:
#   - title: Award name
#     issuer: Organisation
#     date: 2024-11
# publications:
#   - title: Paper title
#     publisher: Conference
#     date: 2023-06
#     authors: [Your Name, Co-author]
#     doi: 10.1000/example
# testimonials:
#   - quote: …
#     author: Someone
#     role: Their role
#     company: Their company
# spokenLanguages:
#   - name: English
#     proficiency: fluent    # native | fluent | professional | intermediate | basic

# Custom sections render with a built-in layout, so you can add anything:
# layout is one of prose | cards | timeline | list | links | stats | gallery
# sections:
#   - title: Speaking
#     layout: timeline
#     items:
#       - title: Talk title
#         subtitle: Conference
#         date: 2024-05
#         links:
#           slides: https://example.com/slides
`;
}

const GITIGNORE = `# AutoPortfolio output
dist/

# Dependencies
node_modules/

# Editor / OS
.DS_Store
`;

const ASSETS_README = `# Assets

Files in this directory are copied verbatim into the generated site.

Reference them from \`portfolio.yaml\` by their path relative to the
configuration file:

\`\`\`yaml
profile:
  avatar: assets/avatar.jpg

projects:
  - name: Example
    cover:
      src: assets/screenshots/example.png
      alt: The dashboard of the example app
\`\`\`

Tips
- Square images (512×512 or larger) work best for avatars and logos.
- Screenshots look best at a 16:9 ratio; anything larger than 1600px wide is
  usually wasted.
- Always write \`alt\` text — it is required for accessibility and used by search
  engines. Use \`alt: ""\` for purely decorative images.
- Prefer \`.svg\` for logos and diagrams, \`.webp\` or \`.jpg\` for photographs.
`;

/**
 * @param {string} accent
 * @returns {string}
 */
function faviconTemplate(accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Portfolio">
  <rect width="64" height="64" rx="14" fill="${accent}"/>
  <circle cx="32" cy="24" r="10" fill="#ffffff" opacity="0.95"/>
  <path d="M12 60c0-11 9-20 20-20s20 9 20 20z" fill="#ffffff" opacity="0.95"/>
</svg>
`;
}

function ciTemplate() {
  return `# Build the portfolio and publish it to GitHub Pages.
#
# Enable Pages in the repository settings (Source: GitHub Actions) and push to
# main. Remember to set \`site.baseUrl\` in autoportfolio.config.yaml.

name: Deploy portfolio

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx --yes autoportfolio@latest build --strict
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

export { configTemplate, fullPortfolio, minimalPortfolio };
