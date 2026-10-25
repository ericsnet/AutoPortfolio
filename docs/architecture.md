# Architecture

AutoPortfolio is a pipeline. Each stage takes a value, returns a value, and knows
nothing about the stages around it except the shape it is handed.

```
portfolio.yaml ─┐
                ├─► parse ──► validate ──► normalise ──► semantics ──► sections
config.yaml ────┘                                                        │
                                                                         ▼
                        theme ──────────────────────────────► view model ──┐
                                                                          │
                          template ───────────────────────────────────────┤
                                                                          ▼
                                                           generator ◄── assets
                                                                 │
                                                                 ▼
                                                        export target
                                                                 │
                                                                 ▼
                                                               dist/
```

## Why this shape

The single most common way a generator like this rots is **coupling**: templates
that read raw configuration, validators that know about HTML, a theme system that
reaches into the data model. Once that happens, adding a template means editing
five files, and users stop contributing templates.

So the design commits to three rules:

1. **Templates see the view model, never the document.** A template cannot import
   a user's key names, which is why changing the data format does not break
   templates.
2. **Validation returns diagnostics, never throws.** Everything the user could
   have written wrong is data, not an exception. That is what makes `--strict`,
   `--json` and the "did you mean" hints possible.
3. **Presentation is data too.** A theme resolves to a map of CSS custom
   properties. Anything that can be expressed as a variable does not belong in a
   template.

## The stages

### Loading — `src/config/`

| File | Responsibility |
|---|---|
| `yaml.js` | A YAML parser. Supports block and flow collections, block scalars, anchors and aliases, quoting rules, multi-line plain scalars, and comments — with line/column information on every error. |
| `toml.js` | A TOML parser: key/value pairs, tables, arrays of tables, inline tables, dotted keys, multi-line strings. |
| `parse.js` | Picks a format from the extension, parses, and turns a parser exception into an `AutoPortfolioError` carrying a diagnostic. |
| `load.js` | Finds the configuration file, resolves the data file, validates both, and returns a `LoadedProject`. Handles `--config` / `--data` overrides, including the common `--config portfolio.yaml` slip. |
| `validate-project.js` | Checks the things a schema cannot see: does the template exist, does the theme resolve, does a referenced asset exist on disk. |

Both parsers are written here rather than pulled in, which is what keeps the
dependency count at zero. They are also the two pieces most likely to disagree
with the rest of the world, so they are covered by differential tests against
independent implementations (`yaml` for YAML, Python's `tomllib` for TOML).

### Schema — `src/schema/`

A small field DSL (`fields.js`) that declares fields once and gets three things
from that declaration:

1. **Validation** (`validate.js`) — type checks, enum checks, aliases, defaults,
   unknown-key detection with suggestions.
2. **JSON Schema export** (`json-schema.js`) — for editor autocompletion.
3. **Documentation** — descriptions live next to the field, so they cannot drift.

```js
projects: list(
  obj({
    name: str({ required: true, description: 'Project name.' }),
    github: url({ aliases: ['repository', 'repo', 'source'] }),
    // ...
  }, { from: 'name' }),
  { unique: 'name' },
),
```

`validateDocument(input, schema, { strict })` returns `{ value, diagnostics }`:
the normalised value *and* the list of problems, so a partial failure still
produces usable output for everything that was correct.

### Model — `src/model/`

| File | Responsibility |
|---|---|
| `normalize.js` | Fill defaults, canonicalise dates, derive slugs, sort lists, expand image and link shorthands. After this, the shape is predictable. |
| `semantic.js` | Checks spanning several fields: an end before a start, a `featured: true` that matches nothing, an availability that contradicts a note. |
| `sections.js` | Decides which sections exist, in what order, with which labels. Fourteen builders, each returning a section model or `null` — `null` is how a section disappears. |
| `urls.js` | Link construction, pretty URLs, base paths, absolute canonical URLs. |
| `hosts.js` | Recognises hosts from a URL so a bare `https://github.com/ada` gets the right icon and label. |
| `format.js` | Locale-aware dates, ranges, durations, initials, byte sizes. |
| `view-model.js` | Assembles the documented object that templates render. This is the contract boundary. |

### Themes — `src/theme/`

`presets.js` declares seven presets as a handful of colours and names.
`theme.js` resolves a preset plus user overrides into:

- `variables` — a flat `ap-*` map (dark overrides prefixed `dark-`), used by the
  stylesheet, by `{{themeVar "ap-accent"}}` and by the build manifest.
- `light` / `dark` — each a `palette` of real colour values plus derived ones
  (`onAccent`, `accentInk`, `accentSoft`), for code that needs a colour rather
  than a variable: the social card, the web manifest, the contrast check.

Contrast is verified while resolving, and a palette that would fail WCAG AA is
reported as a warning rather than shipped silently.

### Templates — `src/template/` and `src/templates/`

`template/engine.js` and `template/runtime.js` are the engine: interpolation,
nested paths, `{{#if}}`, `{{#each}}`, partials, layout inheritance, helper
registration, and context-aware escaping (a `SafeHtml` value is not escaped
again).

`templates/registry.js` discovers and loads templates. A template is a directory
with a `template.json`, so a user template is found by the same code path as a
built-in one.

`templates/_shared/` holds partials every template can use — one per section and a
handful of components. A template overrides only what it wants to look different.

### Generation — `src/generator/`

| File | Responsibility |
|---|---|
| `generator.js` | Plans the pages (home, one per project, 404), renders each through the engine, writes the output, and assembles the build manifest. |
| `assets.js` | Collects image references, hashes and copies files, generates a monogram favicon and a social card when the user supplied neither. |
| `structured-data.js` | JSON-LD: `Person` for the site, `CreativeWork` for each project. |
| `helpers.js` | The helper set templates can call: date formatting, URL building, asset resolution, icons, Markdown, class names, theme variables. |

### Export — `src/export/`

`applyExportTarget({ project, outDir, target })` adds exactly the files a host
needs and returns what it did. Targets are a table, not a branch in the
generator, which is why adding one is a contained change.

### Preview — `src/preview/`

A development server that watches the project, rebuilds on change and reloads
the browser. It reuses the same `generateSite` the build command calls, so the
preview cannot drift from the output.

### CLI — `src/cli/`

`args.js` parses flags, `main.js` implements the commands, `scaffold.js` writes a
new project. The CLI owns no logic of its own: every command is a thin wrapper
over `src/index.js`, which is why the same operations are available to scripts.

## Where to make a change

| You want to | Change |
|---|---|
| Add a field to the portfolio data | `src/schema/portfolio-schema.js`, then expose it in `src/model/normalize.js` and pass it through in `src/model/view-model.js`. |
| Add a section type | `src/schema/config-schema.js` (`BUILTIN_SECTIONS`), `src/model/sections.js`, and `src/templates/_shared/partials/sections/`. |
| Add a theme preset | `src/theme/presets.js` only. |
| Add a whole template | A new directory in `src/templates/`. Nothing else changes. |
| Add an export target | `src/export/targets.js` and its name in `EXPORT_TARGETS`. |
| Add a template helper | `src/generator/helpers.js`. |
| Add a CLI flag | `src/cli/args.js` and the relevant command in `src/cli/main.js`. |

If a change needs edits in more than two of those rows, the seam is in the wrong
place — that is the signal to move the boundary rather than to spread the change.

## Testing strategy

| Layer | How it is tested |
|---|---|
| YAML / TOML | Fixtures for each construct, error cases, and a differential test against an independent implementation over every YAML file in the repository. |
| Schema | Required fields, types, enums, aliases, dates, URLs, unknown keys, duplicates, strict mode. |
| Model | Section omission for empty content, ordering, slug derivation, date canonicalisation. |
| Templates | The engine's own behaviour, plus end-to-end renders of all three shipped templates. |
| Generation | Page and asset planning, output file set, export target files. |
| Errors | That bad input produces diagnostics and exit codes rather than exceptions. |

The differential YAML test earns its place: a hand-written parser that only
agrees with itself proves nothing. It is how the strict plain-scalar colon rule
was found — the parser was accepting `description: a site: the best`, which real
YAML rejects.
