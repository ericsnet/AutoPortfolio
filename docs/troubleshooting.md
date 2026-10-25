# Troubleshooting

## Reading a diagnostic

Every problem AutoPortfolio finds is reported with a severity, the file it came
from, a message, usually a hint, and the path inside the document:

```console
$ autoportfolio build --strict
error portfolio.yaml — error: Unknown key `headlien`
  hint: Did you mean `headline`?
  at:  profile.headlien
warning portfolio.yaml — warning: No contact details, the Contact section will be hidden
  hint: Add at least `contact.email` or one entry under `social`.
  at:  contact
error 3 warnings treated as errors because of `--strict`
  Fix them, or drop --strict to build anyway.
```

| Severity | Means |
|---|---|
| `error` | Something is unusable. The build continues so you can see all the problems at once, but the exit code is non-zero. |
| `warning` | Something is probably not what you intended. Fails the build under `--strict`. |
| `info` | Worth knowing. Never fails the build. |

`--json` gives the same information as data, which is useful in CI:

```console
$ autoportfolio build --json | jq '.diagnostics[] | select(.severity=="error")'
```

## Diagnostic codes

| Code | Area | Typical cause |
|---|---|---|
| `AP0001`–`AP0004` | Internal / usage | File not found, bad CLI flags, unreadable input. |
| `AP1001`–`AP1005` | Configuration | Unknown key, wrong type, invalid enum value, missing custom CSS file. |
| `AP2001`–`AP2007` | Portfolio data | Missing required field, wrong type, bad format, unknown key, duplicate entry, empty document. |
| `AP3001`–`AP3006` | Templates | Template not found, missing manifest, missing entry template, bad option. |
| `AP4001`–`AP4002` | Themes | Unknown preset, low contrast. |
| `AP5001`–`AP5004` | Assets / export | Missing asset, unknown export target, unwritable output. |

## Common problems

### `Unknown key` on a field I am sure exists

Check the [data model](data-model.md) for the canonical name; a common cause is
using an alias in the configuration file, where aliases are not accepted. If the
hint suggests the key you meant, the alias usually works too:

```yaml
profile:
  shortBio: One line.      # bio: and tagline: are accepted here
```

### `must be an absolute URL`

URL fields require a scheme, because a relative URL is ambiguous once the site is
deployed under a base path:

```yaml
liveUrl: https://example.com/project    # not: example.com/project
```

Image and asset fields are the exception — those are document-relative by design.

### The Contact section does not appear

Sections with no content are omitted. The section needs something to render:

```yaml
contact:
  email: ada@example.com
social:
  github: https://github.com/ada
```

Either one is enough. Same rule for About (needs `shortBio` or `about`), Skills,
Technologies, and every other section.

### A project has no page of its own

Project pages are created for projects with `details`, `images` or `features`.
Add one, or force the behaviour:

```yaml
build:
  projectPagesMode: always     # auto | always | never
```

### Dates render more precisely than I want

Precision is preserved from what you wrote. `2024` renders as `2024`; to render a
year for a month-precision date, format it in the template:

```html
{{date job.start "yyyy"}}
```

### `--strict` fails on a warning I do not care about

That is the point of `--strict`: it is meant for CI. Fix the warning, or run
without it locally. Note that `info` diagnostics never fail the build, so a
project can be perfectly valid and still print notes.

### The preview does not reload

The preview reloads when a file inside the project directory changes. Files
outside it — an asset symlinked from elsewhere, a font in another folder — are not
watched. `Ctrl+C` and restart to force a full rebuild.

### `A colon followed by a space is not allowed inside a plain value`

Real YAML rejects a colon-space inside an unquoted scalar, even though the intent
is usually obvious:

```yaml
description: A search engine: crawler, index, ranking    # invalid YAML
```

Quote it, or use a block scalar:

```yaml
description: "A search engine: crawler, index, ranking"
description: >-
  A search engine: crawler, index, ranking
```

The parser refuses it rather than guessing, because a file that parses here must
parse everywhere else too — in your editor, in CI, and in whatever tool reads it
next.

### `Cannot find module` when running `npm test`

Install the development dependencies first:

```console
$ npm install
$ npm test
```

AutoPortfolio itself has no runtime dependencies, but the test suite uses the
`yaml` package as an independent reference implementation, and `typescript` for
`npm run typecheck`.

## Getting more detail

```console
$ autoportfolio dev --verbose          # rebuild logs and stack traces
$ autoportfolio validate --json        # every diagnostic, as data
$ autoportfolio info                   # resolved paths, template, theme, counts
$ autoportfolio schema portfolio       # the exact schema, for your editor
```

`autoportfolio info` is the quickest way to confirm what was actually loaded:

```console
$ autoportfolio info
  name             Eric Lönnrot
  template         developer
  theme            terminal (auto)
  output           dist
  projects         4
  …
```
