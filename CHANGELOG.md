# Changelog

All notable changes to AutoPortfolio are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The portfolio **data format** has its own version, declared as `version:` at the
top of a portfolio document. It is versioned separately from the generator, so a
generator upgrade never silently changes the meaning of your content.

---

## [Unreleased]

### Added

- `docs/` — deeper documentation for the data model, templates, themes and CLI.
- `scripts/demo.js` (`npm run demo`) — builds the example project with all three
  templates and prints a comparison.

### Fixed

- `autoportfolio templates` listed nothing. Template discovery walked the
  builtin directory without asking for directory entries, so it never saw a
  single `template.json`. This also rejected every `autoportfolio init --template
  <name>` with "Unknown template".
- `autoportfolio themes` printed `accent —` and `background —` for every preset,
  because the command read a flat `preset.accent` while presets nest their
  colours under `colors.light` / `colors.dark`.
- The project scaffolded by `autoportfolio init` contained an unquoted colon
  inside a plain YAML scalar (`description: Two or three sentences: ...`), which
  is invalid YAML. The scaffold now emits a block scalar, so a freshly initialised
  project validates without edits.
- `autoportfolio validate` crashed with `validateProject.diagnostics is not
  iterable` — the async `validateProject` was called without `await`.
- `--strict` treated informational notes as failures, so a project with no
  warnings could still exit non-zero. It now means "warnings are errors",
  matching its documentation, and says so when it fails.
- Diagnostics were printed twice during `build`, once per pass. They are now
  deduplicated by severity, code, path and message.
- `npm test` failed with `MODULE_NOT_FOUND` because `node --test test/` is not a
  valid invocation on current Node; the script is now `node --test`.

## [1.0.0]

The first release. Content-first portfolio generation with no runtime
dependencies.

### Added

- **Loading.** Portfolio and configuration documents in YAML, JSON or TOML.
  Directory-based projects with a configurable data file, and single-file mode
  with `--config` and `--data`.
- **Configuration schema.** Templates, themes, sections, site metadata, assets,
  build output, content handling, preview server and deployment targets. Every
  key has a default, and unknown keys are reported with a suggestion.
- **Portfolio schema.** `profile`, `meta`, `contact`, `social`, `skills`,
  `languages`, `spokenLanguages`, `technologies`, `projects`, `experience`,
  `education`, `certifications`, `awards`, `publications`, `testimonials`,
  custom `sections` and a free-form `extra` mapping. Only `profile.name` is
  required.
- **Validation.** Types, enums, dates, absolute URLs, email addresses, colours,
  duplicate detection, unknown-key warnings with "did you mean" suggestions,
  strict mode, and cross-field semantic checks.
- **Diagnostics.** A stable `APnnnn` code space, severities, source locations
  and actionable hints. Problems are reported, never thrown at the user as stack
  traces.
- **Normalisation.** Defaults, canonical dates, slug generation, list sorting,
  image shorthands and link normalisation, so templates see one predictable
  shape regardless of how the document was written.
- **Sections.** Fourteen built-in section builders, seven layouts, ordering,
  labels, subtitles, numbering and hiding. Sections with no content are omitted
  entirely.
- **Themes.** Seven presets (`default`, `minimal`, `terminal`, `editorial`,
  `nord`, `sunset`, `forest`), light and dark palettes, automatic contrast
  adjustment, accent overrides, typography, radius, spacing, density, container
  width, custom properties and custom CSS. Everything resolves to `--ap-*` CSS
  custom properties.
- **Templates.** `modern`, `minimal` and `developer`, sharing one view model and
  one stylesheet, each with section partial overrides and its own CSS.
- **Template engine.** Variables, nested paths, conditionals, iteration,
  partials, layout inheritance, helpers and context-aware HTML escaping. Written
  for this project; no runtime dependencies.
- **Generation.** Page planning, project detail pages, pretty URLs, hashed asset
  filenames with a content map, image handling, monogram favicon generation,
  social card generation, web manifest, `robots.txt`, `sitemap.xml`, RSS,
  JSON-LD structured data, Open Graph and Twitter Card metadata, and optional
  HTML/CSS/JS minification.
- **Preview server.** A local server with rebuild-on-change and live reload.
- **Export targets.** `static`, `github-pages`, `netlify`, `vercel`,
  `cloudflare-pages`, `s3` and `ipfs`, each adding exactly the files its host
  needs, plus base-path handling for sub-path deployments.
- **CLI.** `init`, `build`, `dev`, `validate`, `info`, `templates`, `themes`,
  `schema` and `help`, with `--json` output for every command.
- **Public API.** Every layer importable on its own, with the CLI as a thin
  wrapper over it.
- **Tests.** 63 tests over YAML and TOML parsing, schema validation, Markdown
  rendering, utility behaviour, theme resolution and end-to-end generation,
  including a differential test that compares the YAML parser against the
  reference implementation on every YAML file in the repository.
- **Type checking.** `npm run typecheck` runs TypeScript with `checkJs` over the
  JavaScript sources and tests.
- **Documentation.** A README covering what AutoPortfolio is, why it exists, how
  it works, and how to install, use, configure and extend it.

### Known limitations

- `profile.resume` must be an absolute URL. Résumés are commonly shipped as a
  local PDF next to the portfolio data; accepting a document-relative path and
  copying the file into the output is planned for a future release.
- `profile.facts` is derived from the other profile fields rather than authored
  directly, so a "fact" that does not map to an existing field needs a custom
  section.
- `plugins` is reserved in the configuration schema but no plugin loading is
  implemented yet.

[Unreleased]: https://github.com/Pickeric/AutoPortfolio/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Pickeric/AutoPortfolio/releases/tag/v1.0.0
