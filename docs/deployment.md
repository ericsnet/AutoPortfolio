# Deployment

`autoportfolio build` writes a directory of static files. Anything that serves a
directory will host it, so for many people deployment is "copy `dist/` somewhere".

The export layer exists for the cases where that is not quite enough: a host that
needs a marker file, a project served under a sub-path, or a domain that has to be
declared somewhere.

## Output

```
dist/
├── index.html
├── 404.html
├── projects/<slug>/index.html
├── assets/css/site.css
├── assets/js/autoportfolio.js
├── assets/…                        # your images and other assets
├── favicon.svg
├── social-card.svg
├── manifest.webmanifest
├── robots.txt
├── sitemap.xml
├── rss.xml                         # when build.rss is on
└── <target files>                  # .nojekyll, netlify.toml, …
```

Enable `assets.hashFilenames` and the generated CSS and JS get a content hash in
their name (`site.371ceeed.css`), which makes long cache lifetimes safe. The theme
token manifest is still written to `assets/css/site.css.map.json` either way.

## Targets

```yaml
deploy:
  target: github-pages
```

| Target | Adds | Notes |
|---|---|---|
| `static` | — | The bare site. Default. |
| `github-pages` | `.nojekyll`, `CNAME` | `.nojekyll` stops Jekyll from eating directories that start with `_`. `CNAME` is written when `site.baseUrl` is a custom domain. |
| `netlify` | `netlify.toml`, `_headers` | |
| `vercel` | `vercel.json` | |
| `cloudflare-pages` | `_headers`, `_redirects` | |
| `s3` | — | Recommended headers are reported as notes rather than written blindly. |
| `ipfs` | — | Output is checked to be relative-path safe. |

Aliases are accepted: `gh`, `github`, `pages` → `github-pages`; `cf`,
`cloudflare` → `cloudflare-pages`; `aws`, `amazon` → `s3`.

You can also set the target for one build without editing the configuration:

```console
$ autoportfolio build --target netlify
```

### Set `site.baseUrl`

```yaml
site:
  baseUrl: https://ada.example.com
```

With it set, the build emits canonical links, `sitemap.xml`, `rss.xml` and
absolute Open Graph URLs. Without it, those are skipped — and the build says so,
because a missing canonical link is easy to not notice:

```console
  hint  Set `site.baseUrl` before deploying so sitemap.xml and canonical links are correct.
```

## Sub-path deployments

A project page lives at `https://user.github.io/repo/`, not at the domain root.
AutoPortfolio derives the base path from `site.baseUrl` and rewrites links,
stylesheets, scripts and canonical URLs accordingly — there is nothing to
configure by hand. To be explicit:

```yaml
site:
  baseUrl: https://user.github.io/repo/

deploy:
  basePath: /repo/
```

Every generated link is relative or base-path aware, so the same output also works
opened directly from the filesystem.

## GitHub Pages in CI

`autoportfolio init --ci` writes this workflow for you:

```yaml
name: Deploy portfolio

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx autoportfolio build --strict --clean --target github-pages
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

`--strict` makes warnings fail the build, which is what you want in CI: a typo
that produces a warning locally should not reach production.

Then set **Settings → Pages → Source** to *GitHub Actions*.

## Other hosts

**Netlify.** Build command `npx autoportfolio build --target netlify`, publish
directory `dist`.

**Vercel.** Framework preset *Other*, build command
`npx autoportfolio build --target vercel`, output directory `dist`.

**Cloudflare Pages.** Build command
`npx autoportfolio build --target cloudflare-pages`, output directory `dist`.

**Anything else.** `autoportfolio build` and upload `dist/`. It is a directory of
files with no server requirement, no runtime and no rewrites.

## Custom domains

Set `site.baseUrl` to the domain, choose the `github-pages` target if you want a
generated `CNAME`, and point DNS at your host. Because canonical URLs come from
`site.baseUrl`, changing the domain is a one-line edit plus a rebuild.

## Caching

Hashed assets are safe to cache indefinitely. A minimal `_headers`-style policy:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
```

The `netlify` and `cloudflare-pages` targets write a `_headers` file with this
already in it.

## Checking a build before you ship

```console
$ autoportfolio build --strict --clean
$ autoportfolio validate
$ npm run demo            # builds every template, to confirm none regressed
```

Two things worth verifying in the output itself, both easy to automate:

- Every page has exactly one `<h1>` and a `<main>` landmark.
- No internal link points at a file that was not written.

Serve the directory with any static server before pushing — `autoportfolio dev`
does this for you, and it rebuilds on change, so what you see is what will ship.
