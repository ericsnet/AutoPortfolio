# Templates

A template is a directory. That is the whole contract: if it has a
`template.json` and a page template, AutoPortfolio can render it.

```
my-template/
├── template.json        # name, label, entry, layout, options
├── layout.html          # the shell every page renders into
├── page.html            # the home page
├── project.html         # a project detail page (optional)
├── not-found.html       # 404 (optional)
├── styles.css           # template CSS, appended to the generated stylesheet
├── static/              # files copied verbatim into the output
└── partials/
    ├── nav.html
    ├── footer.html
    ├── components/
    │   └── project-card.html
    └── sections/
        └── about.html
```

Put it in `templates/` next to your configuration and select it by path:

```yaml
template: ./templates/my-template
```

## `template.json`

```json
{
  "name": "my-template",
  "label": "My Template",
  "description": "One sentence shown by `autoportfolio templates`.",
  "version": "1.0.0",
  "entry": "page.html",
  "layout": "layout.html",
  "project": "project.html",
  "notFound": "not-found.html",
  "styles": ["styles.css"],
  "options": {
    "heroStyle": "split",
    "showPrompt": false
  }
}
```

Only `name` and `entry` are required. Anything in `options` is the default for
that template option and can be overridden from your configuration:

```yaml
templateOptions:
  heroStyle: centred
```

Read them in a template with the `option` helper:

```html
<body class="hero-{{option "heroStyle" "split"}}">
```

## The template language

The syntax is deliberately small. Anything complicated belongs in a helper, in the
view model, or in a section partial.

### Variables

```html
{{profile.name}}                 {# escaped #}
{{{profile.aboutHtml}}}          {# raw SafeHtml from the renderer #}
{{project.technologies.0.name}}  {# index into a list #}
```

Escaping is context-aware: a value produced by the Markdown renderer or an HTML
helper is a `SafeHtml` and is not escaped a second time. Everything else is
escaped, so `{{profile.name}}` cannot inject markup.

### Conditionals

```html
{{#if site.baseUrl}}<link rel="canonical" href="{{site.baseUrl}}">{{/if}}
{{#if profile.avatar}}…{{else}}…{{/if}}
```

Falsy means `false`, `null`, `undefined`, `''`, `0`, an empty array, or an empty
object — so an empty list behaves the way it reads.

### Iteration

```html
{{#each projects}}
  <li>{{name}}{{#if featured}} ★{{/if}}</li>
{{/each}}
```

Inside the loop, `this` is the current item. Loop metadata is available as
`@index`, `@i`, `@key`, `@first`, `@last` and `@length`.

### Partials

```html
{{> nav}}
{{> components/project-card}}
```

A partial receives the current context, and `{{include section.partials this}}`
renders a section through whichever partial the template resolved for it.

### Layouts

`page.html` is rendered, then wrapped in `layout.html`, with its own output
available as `{{{body}}}`:

```html
<!-- layout.html -->
<!doctype html>
<html lang="{{site.language}}">
<head>{{> head}}</head>
<body>{{{body}}}</body>
</html>
```

### Helpers

**Text**

| Helper | Example | Notes |
|---|---|---|
| `truncate` | `{{truncate profile.shortBio 140}}` | Cuts on a word boundary and adds an ellipsis. |
| `oneLine` | `{{oneLine summary}}` | Collapses newlines and runs of spaces. |
| `title` / `upper` / `lower` | `{{title tag}}` | Case helpers. |
| `plural` | `{{plural projects.length "project"}}` | `1 project` / `4 projects`. |
| `join` | `{{join tags ", "}}` | Comma-separated lists. |
| `count` | `{{count projects}}` | Length of a list or size of a mapping. |
| `contains` / `startsWith` | `{{#if (contains tags "rust")}}` | Predicates. |
| `default` | `{{default tagline "No tagline yet"}}` | Fallback for empty values. |
| `range` | `{{range 1 5}}` | Generates a list of numbers. |

**Dates and durations**

| Helper | Example | Notes |
|---|---|---|
| `date` | `{{date project.start "MMM yyyy"}}` | Locale-aware, using `meta.language`. |
| `dateRange` | `{{dateRange job.start job.end}}` | `2021 — present` |
| `duration` | `{{duration job.start job.end}}` | `2 yrs 3 mos` |
| `year` | `{{year project.start}}` | Just the year. |

**Markup and assets**

| Helper | Example | Notes |
|---|---|---|
| `markdown` | `{{markdown section.content}}` | Renders and returns `SafeHtml`. |
| `inline` | `{{inline tagline}}` | Inline Markdown, without a wrapping `<p>`. |
| `icon` | `{{icon "github"}}` | Inline SVG from the built-in set. |
| `sectionIcon` | `{{sectionIcon section}}` | The icon a section declared, or a sensible default. |
| `asset` | `{{asset "assets/me.jpg"}}` | Resolves a document reference or a hashed asset. |
| `attrs` | `{{attrs rel="noopener"}}` | Builds an attribute string, dropping empty values. |

**URLs**

| Helper | Example | Notes |
|---|---|---|
| `url` | `{{url "projects/foo"}}` | Joins the site base path correctly. |
| `absolute` | `{{absolute page.url}}` | A fully qualified URL for meta tags. |
| `prettyUrl` | `{{prettyUrl page.url}}` | Applies `trailingSlash` and pretty-URL rules. |
| `external` | `{{#if (external link.url)}}` | True for a link that leaves the site. |
| `mailto` | `{{mailto contact.email}}` | Obfuscates the address when configured to. |

**Layout, theme and build**

| Helper | Example | Notes |
|---|---|---|
| `class` | `{{class "card" featured="card--featured"}}` | Conditional classes without `{{#if}}` soup. |
| `option` | `{{option "heroStyle" "split"}}` | Template option with a fallback. |
| `themeVar` | `{{themeVar "ap-accent"}}` | The resolved variable, without the leading `--`. |
| `partial` / `include` | `{{include section.partials this}}` | Render a partial by name. |
| `json` | `{{json meta}}` | For embedding structured snippets. |
| `generator` | `{{generator}}` | The generator name and version, for a comment in the output. |
| `debug` | `{{debug someValue}}` | Prints a value during development. |

## The view model

This is the object a template receives. It is the only thing a template should
read — nothing here is named after a configuration key.

```
site          name, title, description, language, locale, url, basePath,
              themeColor, keywords, author, year, buildTime
page          title, description, url, canonical, type, isHome, isProject,
              project, image, breadcrumbs, jsonLd
profile       name, firstName, headline, shortBio, aboutHtml, bioHtml,
              avatar, location, company, jobTitle, availability, resume,
              pronouns, yearsOfExperience, facts
nav           items[], active, style, showsToggle
sections      (the rendered list, in order)
sections_data (the raw section models, for templates that want to look)
projects      items, featured, featuredProjects, rest, groups, technologies,
              filters, projectCount, hasDetailPages, hasImages
experience    items, current, totalYears
education     items
certifications items
awards        items
publications  items
testimonials  items
skills        groups, items, featured, levelOrder
languages     items
spokenLanguages items
technologies  name, url, href
contact       email, mailto, phone, location, availability, messageHtml,
              formAction, hasForm, links, resume, facts
social        items, groups
theme         name, label, mode, modeLabel, radius, spacing, container,
              animations, gradients, themeColor, typography, fontUrl,
              showsToggle
assets        stylesheets, scripts, favicon, faviconType, headScript, preload
meta          language, locale, buildTime, generator
extra         whatever you put under `extra:` in your document
```

Because templates read this and not the document, a field can move or be renamed
in the portfolio format without breaking a single template.

## Section partial resolution

Sections are rendered through partials, and lookup falls back in a defined order.
For a built-in section such as `projects`:

1. `partials/sections/projects.html` in **your** template.
2. `sections/projects.html` in the shared set — `templates/_shared/partials/sections/`.
3. The generic `default.html`.

For a custom section with `layout: timeline`:

1. `partials/sections/custom-timeline.html`
2. `partials/sections/custom-default.html`
3. the shared `sections/custom-timeline.html`
4. the shared `sections/default.html`

This is why `minimal` can restyle only `projects` and `contact` while inheriting
the other twelve sections, and why a template that defines nothing still renders a
complete site.

The shared set covers every built-in section: `about`, `skills`, `languages`,
`spokenLanguages`, `technologies`, `projects`, `experience`, `education`,
`certifications`, `awards`, `publications`, `testimonials`, `social`, `contact`,
plus `custom-prose`, `custom-cards`, `custom-timeline`, `custom-list`,
`custom-links`, `custom-stats`, `custom-gallery` and `custom-default`.

Shared components live in `partials/components/`: `avatar`, `chip`, `link`,
`project-card`, `social-list`, `tag` and `timeline-entry`.

### Calling a section partial

Sections are rendered by the generator with the `include` helper:

```html
{{#each sections}}
  {{include section.partials this}}
{{/each}}
```

`include` unwraps `scope.model` for you and marks the result as trusted HTML, so
inside a section partial you write `{{section.title}}` against the section model
directly. A missing partial renders an HTML comment naming the section rather
than failing the build.

## Styling a template

`styles.css` is appended to the generated stylesheet, after the theme variables
and the base styles. Use the `--ap-*` variables rather than literal values:

```css
.card {
  background: var(--ap-surface);
  border: 1px solid var(--ap-border);
  border-radius: var(--ap-radius-md);
  padding: var(--ap-space-block);
}
```

A template that respects the variables works with all seven themes, in both colour
modes, without a single theme-specific rule.

## Checklist for a new template

- [ ] `template.json` with at least `name` and `entry`.
- [ ] `layout.html` includes a skip link, a `<main>` landmark and the `{{{body}}}` placeholder.
- [ ] Headings start at `<h1>` on the page and descend without skipping levels.
- [ ] Sections come from `{{include section.partials this}}` so empty sections stay omitted.
- [ ] Colours and spacing come from `--ap-*` variables.
- [ ] Interactive elements are reachable by keyboard and have visible focus.
- [ ] `prefers-reduced-motion` is respected (the base stylesheet handles transitions).
- [ ] The page still makes sense with JavaScript disabled.
