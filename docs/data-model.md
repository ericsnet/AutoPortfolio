# Data model

A portfolio document describes **you**. It is deliberately permissive about how
you write it and strict about what it means.

```yaml
version: "1.0"
```

The `version` key declares the data format, which is versioned separately from the
generator. Only `profile.name` is required; everything else is optional, and
sections with nothing in them are left out of the site entirely.

## What happens to your document

```
your YAML
   │
   ├─ parse ───────────► a plain object, or a parse error with a line number
   │
   ├─ validate ────────► { value, diagnostics }   ← errors do not stop the rest
   │
   ├─ normalise ───────► defaults filled, dates canonicalised, slugs derived,
   │                     shorthands expanded, lists sorted
   │
   ├─ semantics ───────► cross-field checks: end before start, dangling references
   │
   └─ view model ──────► the object templates actually render
```

Two consequences worth knowing:

- **A typo does not throw away your work.** Validation reports the problem and
  still returns a usable value, so a single bad date does not blank the site.
- **Templates never see your key names.** They read the view model, which is why
  the same three templates render from YAML, JSON or TOML, written with aliases,
  dates in any accepted form and lists as bare strings.

## Top-level keys

| Key | Kind | Purpose |
|---|---|---|
| `version` | string | Data format version. |
| `meta` | mapping | Site title, description, language, canonical URL, theme colour. |
| `profile` | mapping | **Required.** Name and the core biography fields. |
| `contact` | mapping | Email, phone, location, message, optional form. |
| `social` | mapping | Any network name to URL. Rendered with the right icon and label. |
| `skills` | list | Skills, grouped by `category`, optionally featured. |
| `languages` | list | Programming languages. |
| `spokenLanguages` | list | Spoken languages with proficiency. |
| `technologies` | list | Tools, frameworks, services. Bare strings allowed. |
| `projects` | list | The centrepiece: cards and optional detail pages. |
| `experience` | list | Roles, newest first after normalisation. |
| `education` | list | Degrees and programmes. |
| `certifications` | list | Credentials, with expiry handling. |
| `awards` | list | Honours and prizes. |
| `publications` | list | Papers, articles, books. |
| `testimonials` | list | Quotes from other people. |
| `sections` | list | Your own sections, using the built-in layouts. |
| `extra` | mapping | Anything else, available to custom templates as `doc.extra`. |

## Field reference

### `meta`

| Field | Type | Notes |
|---|---|---|
| `title` | string | Browser title and the Open Graph title. |
| `description` | string | Meta description. Falls back to your `shortBio`, then to the first text on the page. |
| `language` | string | BCP-47, e.g. `en`, `pt-BR`. Drives `<html lang>` and date formatting. |
| `locale` | string | Overrides date formatting without changing `language`. |
| `keywords` | list | Meta keywords. |
| `author` | string | Defaults to `profile.name`. |
| `siteUrl` | URL | Canonical base. Same effect as `site.baseUrl`; either enables sitemap and RSS. |
| `themeColor` | colour | Browser UI colour on mobile. Defaults to the theme background. |
| `image` | image | Social card. Generated from your data when omitted. |
| `robots` | string | Meta robots directive. |

### `profile`

| Field | Type | Notes |
|---|---|---|
| `name` | string | **Required.** |
| `firstName` | string | Used in informal copy. Derived from `name` when omitted. |
| `pronouns` | string | |
| `headline` | string | One line under your name. |
| `shortBio` | markdown | A sentence or two. Also the meta description fallback. |
| `about` | markdown | The full About section. |
| `avatar` | image | Shorthand: `avatar: assets/me.jpg` works. |
| `location` | string | |
| `company` | string | |
| `jobTitle` | string | |
| `availability` | enum | `available`, `open-to-offers`, `open-to-freelance`, `employed`, `not-available`. |
| `availabilityNote` | string | Free text next to the availability badge. |
| `yearsOfExperience` | number | |
| `resume` | URL | Must be absolute — a hosted file. See the note below. |
| `timezone` | string | |
| `logo` | image | For people who publish under a brand. |

> **`resume` needs a hosted file.** Résumés are usually shipped as a PDF next to
> the data and it would be more natural to write
> `resume: assets/ada-lovelace-cv.pdf`, but the current schema requires an
> absolute URL. Accepting a local path and copying the file into the output is
> planned; until then, host the file and link to it.

**Derived, not authored.** The About section's "at a glance" list is assembled
from `location`, `company`, `jobTitle`, `yearsOfExperience`, `availability`,
`contact.location`, `resume` and `pronouns`. Supply the fields and the list
appears; there is nothing to duplicate.

### `contact`

`email`, `phone`, `location`, `timezone`, `availability`, `preferred`, `message`
(markdown), `formAction` (renders a real form when set), `calendarUrl`, `links`
(a mapping). The Contact section is omitted entirely when nothing is set here and
there is no `social` entry.

`email` accepts `ada@example.com` or `mailto:ada@example.com`. With
`content.emailObfuscation: entities` the address is entity-encoded in the HTML so
naive scrapers do not collect it; it stays a working link for real visitors.

### `projects`

| Field | Type | Notes |
|---|---|---|
| `name` | string | **Required.** |
| `id` | string | Anchor and URL slug. Derived from `name`; alias `slug`. |
| `tagline` | string | One line for the card. Alias: `bio`. |
| `description` | markdown | The card body. |
| `details` | markdown | The long write-up. Its presence is what earns a project page. |
| `features` / `highlights` | list | Bullet points. |
| `technologies` | list | Names or `{ name, url }`. Bare strings allowed. |
| `images` | list | `{ src, alt, caption }`, or bare strings. |
| `cover` | image | Card and social image. |
| `github` | URL | Aliases: `repository`, `repo`, `source`. |
| `liveUrl` | URL | Aliases: `url`, `website`, `demo`, `homepage`. |
| `links` | mapping | Additional links, rendered as buttons. |
| `start` / `end` | date | Aliases for `start`: `date`, `year`. |
| `status` | enum | `concept`, `planning`, `in-progress`, `active`, `maintained`, `archived`. |
| `license` | string | |
| `role` / `team` | string | Your part and the team size. |
| `metrics` | list | `{ label, value }` pairs, shown as numbers. |
| `tags` | list | Chips, and the basis for the project filter. |
| `featured` | boolean | Pin it to the top and, where the template supports it, the hero. |
| `order` | number | Manual sort. |
| `draft` | boolean | Kept in the document, excluded from the build unless `--drafts`. |

A project page is created when the project has `details`, images or features, or
always/never with `build.projectPagesMode`.

### `experience`

`company` (aliases `organization`, `employer`), `role` (aliases `title`,
`position`), `companyUrl`, `employmentType` (`full-time`, `part-time`,
`contract`, `freelance`, `internship`, `apprenticeship`, `self-employed`,
`volunteer`), `workMode` (`onsite`, `hybrid`, `remote`), `location`, `start`,
`end`, `current`, `summary`, `description`, `highlights`, `technologies`,
`skills`, `companyLogo` / `logo`, `url`.

Roles are sorted newest first, and `current: true` (or `end: present`) marks the
current one.

### `education`

`institution` (aliases `school`, `university`), `degree` (aliases `studyType`,
`qualification`), `field` (aliases `area`, `fieldOfStudy`, `major`),
`institutionUrl`, `location`, `start`, `end`, `current`, `grade`, `summary`,
`description`, `highlights`, `activities`, `courses`, `logo`, `url`.

### `certifications`

`name`, `issuer` (aliases `organization`, `provider`, `authority`), `date`
(aliases `issued`, `issueDate`), `expires` (alias `expiryDate`), `credentialId`
(alias `licenseNumber`), `credentialUrl` (aliases `verifyUrl`, `url`), `logo`,
`skills`, `description`.

An expiry date in the past produces an informational note and templates mark the
credential as expired.

### `awards`, `publications`, `testimonials`

- **awards** — `title`, `issuer` (aliases `organization`, `awarder`), `date`,
  `summary` (alias `description`), `url`.
- **publications** — `title`, `publisher` (aliases `venue`, `journal`), `date`,
  `authors`, `url` (alias `link`), `doi`, `summary` (alias `abstract`).
- **testimonials** — `quote` (alias `text`), `author`, `role` (aliases `title`,
  `position`), `company` (alias `organization`), `avatar`, `url`.

### `sections` — your own sections

```yaml
sections:
  - title: Speaking                       # required
    id: speaking                          # anchor; derived from title otherwise
    subtitle: Conferences and meetups
    icon: mic
    layout: timeline                      # see below
    content: |                            # used by the `prose` layout
      Markdown text.
    items:
      - title: On the Analytical Engine
        subtitle: Royal Society
        date: "1843"
        description: A talk about notation and machines.
        url: https://example.com/talk
        icon: presentation
        tags: [history]
        links:
          Slides: https://example.com/slides
        metrics:
          - label: Attendees
            value: "200"
    order: 20
    hidden: false
    draft: false
```

| Layout | Renders |
|---|---|
| `prose` | `content` as Markdown. What you get by default for a text-only section. |
| `cards` | Items as cards. |
| `timeline` | Items as a dated timeline. |
| `list` | A compact list. |
| `links` | A grid of links. |
| `stats` | Big numbers, from `value` and `label`. |
| `gallery` | Images from `image`. |

Aliases: `grid`/`card` → `cards`, `history`/`milestones` → `timeline`,
`bullets` → `list`, `link-grid` → `links`, `numbers`/`metrics` → `stats`,
`text`/`markdown` → `prose`, `images`/`photos` → `gallery`.

A custom section is rendered through `custom-<layout>.html`, so a template can
style your sections without knowing anything about them.

## Dates

Accepted, in any field typed as a date:

| Written | Normalised to | Note |
|---|---|---|
| `2024` | `2024` | Year precision |
| `2024-03` | `2024-03` | Month precision |
| `March 2024` | `2024-03` | |
| `2024 Q1` | `2024-01` | |
| `2024-03-15` | `2024-03-15` | Day precision |
| `present`, `now`, `current` | `present` | Ongoing |

The original precision is preserved, so a year renders as `2024` rather than
`January 2024`. Display format follows `meta.language` and
`content.dateFormat`.

## Images

Four ways, all normalising to the same model:

```yaml
avatar: assets/me.jpg
avatar: /assets/me.jpg
avatar:
  src: assets/me.jpg
  alt: Ada Lovelace at the Analytical Engine
cover:
  src: assets/cover.png
  alt: Cover image
  caption: Annotated in 1843
```

`alt` falls back to a sensible default derived from the surrounding context — your
name for an avatar, the project name for a cover — so an image is never
unlabelled. Every non-remote image is checked against the filesystem during
validation, and a missing file is an error rather than a broken image in
production.

## Links and social

`social` is a mapping, not a list, so you can write whichever networks you use:

```yaml
social:
  github: https://github.com/ada
  linkedin: https://linkedin.com/in/ada
  mastodon: https://mastodon.social/@ada
  bluesky: https://bsky.app/profile/ada.example
  RSS: /rss.xml
```

AutoPortfolio recognises common hosts and picks the right icon and label; an
unknown key is still rendered, with a sensible icon and a label derived from the
key. Use a mapping under `contact.links` for the same treatment in the Contact
section, or `links` on a project for buttons.

## What the templates see

After normalisation, every list is a list, every entry has a stable `id`, and
optional single values are `null` rather than `undefined`. Templates can therefore
iterate without guarding and check with `{{#if}}` without worrying about the
difference between "absent" and "empty". The exact object is documented in
[Templates](templates.md#the-view-model).
