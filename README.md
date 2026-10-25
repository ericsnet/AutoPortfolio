# AutoPortfolio

**One structured file in, one complete portfolio website out.**

AutoPortfolio is a content-first portfolio generator. You describe yourself once —
name, bio, skills, projects, experience, education, certifications, contact — in a
readable YAML, JSON or TOML file, and AutoPortfolio renders a fast, accessible,
responsive static site from it. Templates and themes are separate concerns: change
the look without touching a word of your content.

```console
$ npx autoportfolio init my-portfolio
$ cd my-portfolio
$ npx autoportfolio dev
  ➜  http://localhost:4173
```

---

## Table of contents

- [Why AutoPortfolio exists](#why-autoportfolio-exists)
- [What you get](#what-you-get)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration reference](#configuration-reference)
- [Portfolio data reference](#portfolio-data-reference)
- [Templates](#templates)
- [Themes](#themes)
- [CLI reference](#cli-reference)
- [Deployment](#deployment)
- [Testing](#testing)
- [Development](#development)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why AutoPortfolio exists

Most portfolio builders make you choose between two bad options: a drag-and-drop
editor that locks your content in a proprietary blob, or a hand-written site where
your CV, your `index.html` and your LinkedIn profile slowly drift apart.

AutoPortfolio takes a third position. **The content is a data file you own**, in a
format that diffs cleanly in Git, and the presentation is a piece of software that
consumes it. That gives you:

- **One source of truth.** Update `portfolio.yaml`, rebuild, and every section —
  hero, projects, timeline, footer — is correct.
- **Separation of concerns.** Adding a template never means editing your content,
  and editing your content never means touching a template.
- **Content that outlives the tool.** YAML, JSON and TOML are formats you can read
  in ten years, with or without AutoPortfolio.
- **A real build you can inspect.** Static HTML, one stylesheet, a small
  progressive-enhancement script. No framework runtime shipped to your visitors.

### What it deliberately is not

- Not a hosted service. Your files stay in your repository.
- Not a black box. The generator is ~15 modules you can read in an afternoon.
- Not a wrapper around another static-site generator. The template engine, the
  YAML and TOML parsers, the theme system, the asset pipeline and the export layer
  are implemented here — **zero runtime dependencies**.

---

## What you get

From a single project directory, `autoportfolio build` writes:

```
dist/
├── index.html                     # the main page
├── 404.html                       # styled not-found page
├── projects/
│   ├── your-project/index.html    # one page per project (optional)
│   └── another-project/index.html
├── assets/
│   ├── css/site.css               # theme variables + base styles + template styles
│   └── js/autoportfolio.js        # theme toggle, nav, small enhancements (~6 kB unminified)
├── favicon.svg                    # generated monogram if you don't supply one
├── social-card.svg                # Open Graph image, generated from your data
├── manifest.webmanifest           # PWA manifest
├── robots.txt
├── sitemap.xml
└── rss.xml                        # opt-in
```

Every page is responsive, keyboard-navigable, semantic HTML with a skip link,
correct landmarks, `prefers-reduced-motion` support, JSON-LD structured data, and
Open Graph and Twitter Card metadata. **Sections with no content are omitted
entirely** — an empty education list produces no empty heading.

---

## Installation

AutoPortfolio needs **Node.js 18.17 or newer**. It has no runtime dependencies.

```console
# Clone and link it globally
git clone https://github.com/Pickeric/AutoPortfolio.git
cd AutoPortfolio
npm install
npm link          # makes the `autoportfolio` command available everywhere
```

Or run it straight from a checkout without linking:

```console
node /path/to/AutoPortfolio/bin/autoportfolio.js build
```

As a library, every layer is importable:

```js
import { loadProject, generateSite, resolveTheme } from './AutoPortfolio/src/index.js';

const project = await loadProject({ cwd: 'my-portfolio' });
const result = await generateSite(project, { outDir: 'public' });
console.log(result.pages.length, 'pages in', result.durationMs, 'ms');
```

---

## Quick start

```console
$ autoportfolio init my-portfolio --template developer --theme terminal --ci
✓ Created 7 files in my-portfolio
    autoportfolio.config.yaml
    portfolio.yaml
    .gitignore
    assets/README.md
    favicon.svg
    .github/workflows/deploy.yml

  Next steps
    autoportfolio dev my-portfolio     start the live preview
    autoportfolio build                write the static site to dist/

$ cd my-portfolio
$ autoportfolio dev
  AutoPortfolio v1.0.0
  http://localhost:4173
  watching for changes — press Ctrl+C to stop
```

Edit `portfolio.yaml`, save, and the browser reloads. When you are happy:

```console
$ autoportfolio build --strict
✓ Built 4 pages and 12 assets in 122ms
  output    dist
  template  developer · theme terminal
  size      123.4 kB
```

---

## How it works

The pipeline is a straight line, and each stage is a separate module you can use
on its own:

```
portfolio.yaml ─┐
                ├─► parse ──► validate ──► normalise ──► sections ──► view model
config.yaml ────┘   │          │            │             │            │
                    │          │            │             │            ▼
                    │          │            │             │      template engine
                    │          │            │             │            │
                    │          │            │             └── theme ───┤
                    │          │            │                          ▼
                    └──────────┴────────────┴───────────────────►  generator
                                                                      │
                                                                      ▼
                                                            assets · export target
                                                                      │
                                                                      ▼
                                                                    dist/
```

| Stage | Module | Responsibility |
|---|---|---|
| **Parse** | `src/config/` | Read YAML, JSON or TOML into a plain object, with real error messages and line numbers. |
| **Validate** | `src/schema/` | Check the document against a declared schema. Unknown keys, wrong types, bad dates and invalid URLs become diagnostics — errors or warnings, never a stack trace. |
| **Normalise** | `src/model/normalize.js` | Turn a loose, human-friendly document into a complete, predictable model: defaults filled, dates canonicalised, slugs assigned, lists sorted. |
| **Semantics** | `src/model/semantic.js` | Cross-field checks a schema cannot express: an end date before a start date, a featured project that does not exist, a contradictory availability. |
| **Sections** | `src/model/sections.js` | Decide which sections have content, in what order, with which labels. This is where "only render what exists" lives. |
| **View model** | `src/model/view-model.js` | Build the exact shape the templates read. Templates never touch the raw document. |
| **Theme** | `src/theme/` | Resolve a preset plus your overrides into CSS custom properties, light and dark. |
| **Template** | `src/template/` | Render `.html` templates: variables, `{{#if}}`, `{{#each}}`, partials, helpers, layout inheritance. |
| **Generate** | `src/generator/` | Plan pages, hash and copy assets, build structured data, minify, write files. |
| **Export** | `src/export/` | Add whatever a specific host needs: `netlify.toml`, `vercel.json`, `.nojekyll`, `CNAME`, `_headers`. |

### Diagnostics, not exceptions

Everything that can be wrong with your input is reported as a diagnostic with a
code, a path, and usually a suggestion:

```console
$ autoportfolio build --strict
error portfolio.yaml — error: Unknown key `headlien`
  hint: Did you mean `headline`?
  at:  profile.headlien
warning portfolio.yaml — warning: No contact details, the Contact section will be hidden
  hint: Add at least `contact.email` or one entry under `social`.
  at:  contact
```

Codes are namespaced so you can find them in the source: `AP1001–AP1005`
configuration, `AP2001–AP2007` portfolio data, `AP3001–AP3006` templates,
`AP4001–AP4002` themes, `AP5001–AP5004` assets and export.

---

## Configuration reference

`autoportfolio.config.yaml` describes the *build*, not the content.

```yaml
# Which file holds the portfolio data, and which template renders it.
data: portfolio.yaml
template: developer

theme:
  preset: terminal          # default | minimal | terminal | editorial | nord | sunset | forest
  mode: auto                # auto | light | dark
  accent: "#4ade80"         # overrides the preset accent
  radius: sm                # none | sm | md | lg | xl | full
  spacing: comfortable      # compact | comfortable | spacious
  density: normal           # compact | normal | relaxed
  container: normal         # narrow | normal | wide | full
  animations: true
  typography:
    heading: JetBrains Mono
    body: Inter
    mono: JetBrains Mono
    scale: 1
    headingWeight: 650
    googleFonts: true
    # fontUrl: https://example.com/fonts.css   # for self-hosted fonts
  customProperties:         # extra --ap-* variables, prefix added for you
    space-block: 3rem
  # customCss: custom.css   # appended to the generated stylesheet

sections:
  order: [about, skills, projects, experience, education, contact]
  hidden: [testimonials]
  labels:
    technologies: "Tools I reach for"
  nav: true
  navStyle: sticky          # sticky | static | none
  numbered: false

site:
  baseUrl: https://your-domain.example   # enables sitemap, canonical links, RSS
  trailingSlash: true

assets:
  directory: assets
  copy: true
  hashFilenames: false      # content-hash the generated CSS and JS
  inlineSvg: true

build:
  output: dist
  clean: true
  minify: true
  prettyUrls: true          # /projects/foo/ instead of /projects/foo.html
  projectPages: true        # a page per project
  sitemap: true
  robots: true
  rss: false
  analytics:
    provider: none          # none | plausible | umami | fathom | simple
    privacyFriendly: true

content:
  markdown: true
  emailObfuscation: entities   # none | entities
  dateFormat: auto

serve:
  port: 4173
  host: 0.0.0.0

deploy:
  target: static            # static | github-pages | netlify | vercel | cloudflare-pages | s3 | ipfs
  # basePath: /my-repo/     # for project pages served under a sub-path
  # files: [CNAME]          # extra files copied to the output root
```

Every value has a default, so a two-line configuration file is valid:

```yaml
data: portfolio.yaml
template: modern
```

Print the JSON Schema for autocompletion in your editor:

```console
$ autoportfolio schema config > .autoportfolio.config.schema.json
$ autoportfolio schema portfolio > .autoportfolio.portfolio.schema.json
```

---

## Portfolio data reference

`portfolio.yaml` describes *you*. Only `profile.name` is required — everything
else is optional, and sections without content are dropped.

```yaml
version: "1.0"

meta:
  title: Ada Lovelace — Analytical Engine Programmer
  description: Mathematician and writer, best known for the first published algorithm.
  siteUrl: https://ada.example.com
  language: en
  themeColor: "#4f46e5"

profile:
  name: Ada Lovelace
  headline: Mathematician · Writer · First programmer
  shortBio: One or two sentences that appear under your name.
  about: |
    Markdown is supported here.

    Use it for the longer story — paragraphs, lists, links, emphasis, even code.
  avatar: assets/avatar.jpg
  location: London, United Kingdom
  pronouns: she/her
  availability: open-to-offers    # see the enum list below
  yearsOfExperience: 12
  company: Analytical Engines Ltd
  jobTitle: Lead Mathematician
  resume: https://ada.example.com/cv.pdf   # a hosted file, so links never break

contact:
  email: ada@example.com
  phone: "+44 20 7946 0958"
  location: London, United Kingdom
  message: Prefer email — I reply within a couple of days.
  formAction: https://formspree.io/f/xxxx    # optional, renders a real form

social:                           # a mapping: any network, any URL
  github: https://github.com/ada
  linkedin: https://linkedin.com/in/ada
  mastodon: https://mastodon.social/@ada

skills:
  - name: Analytical engines
    level: expert                 # beginner | intermediate | advanced | expert
    category: Hardware
    keywords: [mechanics, notation]
    featured: true
  - name: Technical writing       # the long form is optional
    level: advanced

languages:                        # programming languages
  - name: Ada
    level: expert

spokenLanguages:
  - name: English
    proficiency: native           # native | fluent | professional | intermediate | basic

technologies:                     # bare strings are fine
  - name: PostgreSQL
    url: https://www.postgresql.org
  - Docker
  - Kubernetes

projects:
  - name: Analytical Engine Notes
    tagline: One line that makes someone want to click.
    description: >
      Two or three sentences about what it does, who uses it,
      and what you did on it.
    details: |
      The long write-up, rendered on the project's own page when
      `build.projectPages` is enabled. Markdown works.
    technologies: [Ada, Analytical Engine]
    features:
      - Computes Bernoulli numbers
      - Written for a machine that was never built
    images:
      - src: assets/images/engine.png
        alt: Diagram of the Analytical Engine
        caption: Figure 1 — the mill and the store
    cover: assets/images/engine-cover.png
    github: https://github.com/ada/analytical-engine
    liveUrl: https://ada.example.com/engine
    start: "1842-01"
    end: present
    status: active                # see the enum list below
    role: Author
    team: Solo
    featured: true
    tags: [history, computing]
    metrics:
      - label: Operations per minute
        value: "60"

experience:
  - company: University of London
    role: Mathematician
    location: London, United Kingdom
    employmentType: full-time    # see the enum list below
    workMode: hybrid
    start: "1842-01"
    end: present
    summary: Translated and annotated Menabrea's paper on the Analytical Engine.
    highlights:
      - Published the first algorithm intended for a machine.
    technologies: [Ada]

education:
  - institution: Private tuition
    degree: Mathematics and logic
    field: Mathematics
    location: London
    start: "1832"
    end: "1840"
    grade: —
    highlights: []
    url: https://example.com

certifications:
  - name: Certified Kubernetes Administrator
    issuer: CNCF
    date: "2022-03"                     # `issued` is accepted as an alias
    expires: "2025-03"
    credentialId: CKA-123456
    credentialUrl: https://example.com/verify/123456   # `url` works too

awards:
  - title: Best Paper
    issuer: Analytical Society
    date: "1843"
    summary: For the Notes on the Analytical Engine.   # `description` works too

publications:
  - title: Sketch of the Analytical Engine
    publisher: Scientific Memoirs          # `venue` and `journal` work too
    date: "1843"
    authors: [L. F. Menabrea, A. A. Lovelace]
    url: https://example.com/paper
    doi: 10.1000/xyz

testimonials:
  - quote: She saw further than anyone of her generation.
    author: Charles Babbage
    role: Inventor
    avatar: assets/babbage.jpg

sections:                          # your own sections, rendered like the built-in ones
  - title: Speaking
    layout: timeline               # prose | cards | timeline | list | links | stats | gallery
    icon: mic
    items:
      - title: On the Analytical Engine
        subtitle: Royal Society
        date: "1843"
        description: A talk about notation and machines.
        url: https://example.com/talk
  - title: By the numbers
    layout: stats
    items:
      - value: "1843"
        label: First algorithm published
      - value: "1"
        label: Machine it ran on

extra:                             # a name → value mapping of anything else
  ORCID: 0000-0000-0000-0000
```

### Fields that are derived, not written

The About section's "at a glance" list is built from what you already wrote —
location, company, job title, years of experience, availability, pronouns and
résumé. There is nothing to author twice; supply those fields and the list
appears. Likewise, section anchors come from `title` unless you set `id`, and
project URLs come from `id` unless you set it explicitly.

### Enumerated values

| Field | Accepted values |
|---|---|
| `skills[].level`, `languages[].level` | `beginner`, `intermediate`, `advanced`, `expert` |
| `spokenLanguages[].proficiency` | `native`, `fluent`, `professional`, `intermediate`, `basic` |
| `profile.availability` | `available`, `open-to-offers`, `open-to-freelance`, `employed`, `not-available` |
| `projects[].status` | `concept`, `planning`, `in-progress`, `active`, `maintained`, `archived` |
| `experience[].employmentType` | `full-time`, `part-time`, `contract`, `freelance`, `internship`, `apprenticeship`, `self-employed`, `volunteer` |
| `experience[].workMode` | `onsite`, `hybrid`, `remote` |
| `sections[].layout` | `prose`, `cards`, `timeline`, `list`, `links`, `stats`, `gallery` |

### Dates

Dates are flexible. All of these are understood and normalised:

```yaml
start: 2024              # → 2024
start: 2024-03           # → 2024-03
start: March 2024        # → 2024-03
start: 2024-03-15        # → 2024-03-15
start: 2024 Q1           # → 2024-01
end: present             # → present   (also: now, current)
```

Formats and labels adapt to `meta.language` and `content.dateFormat`.

### Aliases

Common alternatives are accepted so you don't have to remember exact key names:

| Written | Treated as |
|---|---|
| `bio`, `tagline` | `profile.shortBio` |
| `slug` | `projects[].id` |
| `repository`, `repo`, `source` | `projects[].github` |
| `url`, `website`, `demo`, `homepage` | `projects[].liveUrl` |
| `organization`, `employer` | `experience[].company` |
| `title`, `position` | `experience[].role` |
| `school`, `university` | `education[].institution` |
| `studyType`, `qualification` | `education[].degree` |
| `area`, `fieldOfStudy`, `major` | `education[].field` |
| `issued`, `issueDate` | `certifications[].date` |
| `verifyUrl`, `url` | `certifications[].credentialUrl` |
| `venue`, `journal` | `publications[].publisher` |
| `abstract` | `publications[].summary` |
| `text` | `testimonials[].quote` |

Unknown keys produce a warning with a suggestion rather than being ignored
silently.

---

## Templates

A template is a directory with a `template.json` manifest, page templates,
partials and its own CSS. **Templates consume the view model and nothing else**, so
they cannot become coupled to the data format.

| Template | Character |
|---|---|
| `modern` | Card-based layout with a gradient hero, sticky navigation and generous whitespace. |
| `minimal` | Typographic single-column layout for people who want the writing to do the talking. |
| `developer` | Terminal-inspired layout with a monospace type scale, sidebar navigation and dense project cards. |

```console
$ autoportfolio templates
  developer  Terminal-inspired layout with a monospace type scale, …
  minimal    Typographic single-column layout for people who want …
  modern     Card-based layout with a gradient hero, sticky navigation …

$ autoportfolio build --template minimal          # try one without editing config
```

### Writing your own template

Drop a directory in `templates/` next to your config and select it with a path:

```yaml
template: ./templates/my-template
```

```
templates/my-template/
├── template.json      # name, label, entry, layout, options
├── layout.html        # the shell every page is rendered into
├── page.html          # the home page
├── project.html       # a project detail page (optional)
├── not-found.html     # 404 (optional)
├── styles.css         # template-specific CSS, appended to the stylesheet
└── partials/
    ├── nav.html
    └── sections/      # override or add section partials
        └── about.html
```

Section partial lookup falls back gracefully: a template that defines
`sections/projects.html` gets its own version, and every section it does not
define comes from the shared built-ins. Adding a template never requires editing
the generator, the schema or your portfolio data.

---

## Themes

Seven presets ship with AutoPortfolio, and a theme is nothing more than CSS custom
properties — so overriding one value is a one-line change.

```console
$ autoportfolio themes
  default    Neutral surfaces with an indigo accent.                      accent #4f46e5
  minimal    Quiet greys, serif headings and tight corners.               accent #18181b
  terminal   Monospaced green-on-black.                                   accent #17803d
  editorial  Warm paper tones and a strong serif voice.                   accent #b45309
  nord       Cool blue-grey palette with a calm, low-contrast feel.       accent #5e81ac
  sunset     High-energy coral and violet gradients.                      accent #e11d48
  forest     Deep greens and soft neutrals.                               accent #15803d

$ autoportfolio themes nord
Nord — Cool blue-grey palette with a calm, low-contrast feel.
  accent             #5e81ac
  accent (dark)      #88c0d0
  background         #fbfcfd
  background (dark)  #2e3440
  radius             lg
  spacing            comfortable
  typography         Inter / Inter
```

Light and dark mode are both generated. `mode: auto` follows
`prefers-color-scheme` and offers a toggle; `mode: light` and `mode: dark` pin it
and drop the unused palette from the output. Contrast is checked when the theme
resolves, and a palette that would fail WCAG AA is reported.

Every derived variable is available to templates and to your own CSS:

```css
.my-badge {
  background: var(--ap-accent-soft);
  color: var(--ap-accent-ink);
  border-radius: var(--ap-radius-sm);
}
```

`var(--ap-*)` covers the light palette, `dark-ap-*` the dark one, plus
`--ap-radius-*`, `--ap-space-*`, `--ap-font-*`, `--ap-container`,
`--ap-animation-duration` and your own `theme.customProperties`.

---

## CLI reference

```
autoportfolio <command> [options]

  init [directory]     Create a new project (config, data, assets, CI workflow)
  build [directory]    Generate the static site
  dev [directory]      Live preview with rebuild on change
  validate [directory] Check the configuration and data without building
  info [directory]     Show the resolved project
  templates [name]     List the available templates
  themes [name]        List the available theme presets
  schema [what]        Print the JSON Schema (portfolio | config)
  help <command>       Show help for a command
```

**Global options:** `--help`, `--version`, `--verbose`, `--quiet`, `--no-color`,
`--json`.

**Build options:** `--config`, `--data`, `--output`, `--template`, `--theme`,
`--mode`, `--accent`, `--base-url`, `--minify` / `--no-minify`, `--strict`,
`--clean`, `--target`, `--drafts`.

`--json` makes every command machine-readable, which is what the generated GitHub
Actions workflow uses:

```console
$ autoportfolio build --json | jq '.pages | length'
4
```

---

## Deployment

The output is plain static files, so anything that serves a directory will host it.

```yaml
# autoportfolio.config.yaml
site:
  baseUrl: https://ada.example.com

deploy:
  target: github-pages
```

Each target adds exactly what that host needs:

| Target | Adds |
|---|---|
| `static` | nothing — the bare site |
| `github-pages` | `.nojekyll`, and `CNAME` when `site.baseUrl` is a custom domain |
| `netlify` | `netlify.toml`, `_headers` |
| `vercel` | `vercel.json` |
| `cloudflare-pages` | `_headers`, `_redirects` |
| `s3` | cache headers guidance in `_headers` |
| `ipfs` | relative-path safe output |

For a project page served under a sub-path (such as `user.github.io/repo/`),
AutoPortfolio derives `basePath` from `site.baseUrl` and rewrites links
accordingly — no manual fiddling.

---

## Testing

```console
$ npm test
# tests 63
# pass 63
# fail 0
```

The suite covers the parts most likely to break silently:

| Area | What is checked |
|---|---|
| **Configuration parsing** | YAML (blocks, flow, anchors, quoting, multi-line scalars) and TOML against fixtures, plus a differential test that parses **every YAML file in the repository** and compares the result with the reference `yaml` package. |
| **Data validation** | Required fields, types, enums, dates, URLs, emails, unknown keys with suggestions, aliases, strict mode, duplicate detection. |
| **Template rendering** | The engine's own tests: interpolation, escaping, conditionals, loops, partials, helpers, layout inheritance. |
| **Theme handling** | Preset resolution, accent overrides, CSS variable generation, dark-mode output, contrast warnings. |
| **Portfolio generation** | End-to-end builds of all three templates, page and asset planning, section omission, export targets. |
| **Error handling** | Diagnostics instead of exceptions, exit codes, malformed input, missing files. |

A differential test against an independent implementation is deliberate: a
hand-written parser that only agrees with itself proves nothing. That test is how
the strict plain-scalar colon check was found.

---

## Development

```console
$ npm test              # run the suite
$ npm run test:watch    # re-run on change
$ npm run typecheck     # tsc --noEmit over src, bin, test and scripts
$ npm run build:example # build examples/developer into examples/developer/dist
$ npm run dev:example   # live preview of the example project
$ npm run demo          # build all three templates and print a summary
```

The code is plain ES modules with JSDoc types — no build step, no transpiler, no
bundler. `npm run typecheck` runs TypeScript in `checkJs` mode over the JavaScript,
which is what catches mistakes in editors and in CI.

Adding a feature usually means adding a module and wiring it into one stage of the
pipeline. If a change needs edits in more than two layers, the seam is in the wrong
place.

---

## Project layout

```
AutoPortfolio/
├── bin/autoportfolio.js      # executable entry point
├── src/
│   ├── cli/                  # argument parsing, commands, scaffolding
│   ├── config/               # YAML and TOML parsers, loading, project validation
│   ├── schema/               # field DSL, portfolio + config schemas, JSON Schema export
│   ├── model/                # normalisation, semantics, sections, URLs, view model
│   ├── theme/                # presets and theme resolution
│   ├── template/             # the template engine and its runtime
│   ├── templates/            # modern, minimal, developer + shared partials
│   ├── generator/            # page planning, assets, structured data, helpers
│   ├── export/               # deployment targets
│   ├── preview/              # the development server
│   ├── assets/               # base stylesheet, client script, icon set
│   └── util/                 # colour, dates, HTML, Markdown, minifiers, filesystem
├── examples/developer/       # a complete worked example
├── test/                     # node:test suites
└── docs/                     # deeper documentation
```

---

## Roadmap

AutoPortfolio 1.0 targets static output and stops there deliberately, but the
export layer was designed as a seam rather than a special case. Directions that fit
without a rewrite:

- **More export targets** — a Node server preset, Docker image, or a JSON API for
  frameworks that prefer to render on demand.
- **A plugin system** — the configuration already reserves a `plugins` key;
  generators, helpers and export targets can all be registered from outside.
- **Additional data sources** — the GitHub repository already in your project
  file could be queried for stars, languages and latest releases; the schema has a
  place for it.
- **Templates from the community** — because a template is a directory and a
  manifest, a registry is a matter of distribution, not architecture.
- **Importers** — reading a `resume.json`, a LinkedIn export or a BibTeX file into
  the portfolio schema.
- **Multi-language portfolios** — the `meta.language` key exists and date
  formatting is already locale-aware.

---

## License

[MIT](LICENSE) © AutoPortfolio contributors.
