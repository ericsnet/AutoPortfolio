# Themes

A theme is a map of CSS custom properties. That is the entire design: no theme
file is loaded at runtime, no template branches on the theme name, and overriding
one value costs one line.

```yaml
theme:
  preset: terminal
  mode: auto
  accent: "#4ade80"
```

Those three keys produce a complete light-and-dark palette, because a preset only
declares *defaults* and everything else is derived from them.

## Presets

| Preset | Character | Radius | Spacing |
|---|---|---|---|
| `default` | Neutral surfaces with an indigo accent. A safe, professional starting point. | `md` | comfortable |
| `minimal` | Quiet greys, serif headings and tight corners. Content first. | `sm` | spacious |
| `terminal` | Monospaced green-on-black, built for people who ship in a shell. | `none` | compact |
| `editorial` | Warm paper tones and a strong serif voice, like a printed profile. | `sm` | spacious |
| `nord` | Cool blue-grey palette with a calm, low-contrast feel. | `lg` | comfortable |
| `sunset` | High-energy coral and violet gradients for creative portfolios. | `xl` | comfortable |
| `forest` | Deep greens and soft neutrals; reads as calm and grounded. | `md` | comfortable |

```console
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

## What you can override

```yaml
theme:
  preset: default
  mode: auto               # auto | light | dark
  accent: "#4f46e5"        # light accent
  accentDark: "#8b93ff"    # optional; derived from `accent` when omitted
  accentSecondary: "#0ea5e9"
  radius: md               # none | sm | md | lg | xl | full
  spacing: comfortable     # compact | comfortable | spacious
  density: normal          # compact | normal | relaxed
  container: normal        # narrow | normal | wide | full
  animations: true
  gradients: true

  typography:
    heading: Playfair Display
    body: Inter
    mono: JetBrains Mono
    scale: 1
    headingWeight: 650
    fontDisplay: swap
    googleFonts: true
    # fontUrl: https://example.com/fonts.css

  customProperties:
    space-block: 3rem
    radius-card: 6px

  customCss: custom.css
```

### Colour modes

| `mode` | Behaviour |
|---|---|
| `auto` | Follows `prefers-color-scheme`, and the page ships a toggle that writes `data-theme` on `<html>`. |
| `light` | Pinned. The dark palette is not emitted at all. |
| `dark` | Pinned, and `color-scheme: dark` is set so form controls and scrollbars follow. |

Under `auto`, the stylesheet contains the light values on `:root`, the dark values
twice — once behind the media query, once behind `:root[data-theme="dark"]`. The
toggle then works without a flash of the wrong theme, because the media query has
already applied before the script runs.

### Accents and contrast

When you set `accent`, AutoPortfolio derives everything that has to agree with it:

- `--ap-accent` — your colour, unchanged.
- `--ap-on-accent` — white or near-black, whichever reads on top of it.
- `--ap-accent-ink` — your colour nudged in lightness until it reaches 4.5:1
  against the background. Use this for *text*; use `--ap-accent` for fills.
- `--ap-accent-soft` — your colour at 12 % alpha, for tinted backgrounds.
- `--ap-focus` / `--ap-ring` — a translucent version for focus outlines.

For dark mode, the accent is adjusted so it stays legible on a dark background,
unless you set `accentDark` yourself.

Palettes are contrast-checked when the theme resolves. A combination that would
fail WCAG AA produces a warning rather than shipping quietly:

```console
warning autoportfolio.config.yaml — warning: Text on the light background only reaches a 3.1:1 contrast ratio
  hint: Aim for 4.5:1 or higher; WCAG AA requires it for body text.
  at:  theme.light
```

## The generated variables

Every resolved theme exposes the same set of names. `{{themeVar "ap-accent"}}`
reads one from a template; `var(--ap-accent)` reads it from CSS.

### Colours — light

`--ap-bg`, `--ap-surface`, `--ap-surface-2`, `--ap-text`, `--ap-text-muted`,
`--ap-border`, `--ap-accent`, `--ap-accent-soft`, `--ap-accent-ink`,
`--ap-on-accent`, `--ap-secondary`, `--ap-code-bg`, `--ap-marker`,
`--ap-shadow-color`, `--ap-focus`

### Colours — dark

The same names, resolved from the dark palette, are written as `dark-ap-*`
internally and emitted as plain `--ap-*` inside the dark blocks.

### Layout

`--ap-radius-sm`, `--ap-radius-md`, `--ap-radius-lg`, `--ap-radius-full`,
`--ap-radius-pill`, `--ap-container`, `--ap-space-block`, `--ap-space-section`,
`--ap-space-inline`

### Type

`--ap-font-body`, `--ap-font-heading`, `--ap-font-mono`, `--ap-base-font-size`,
`--ap-font-scale`, `--ap-line-height`, `--ap-heading-weight`, `--ap-font-display`

### Motion

`--ap-animation-duration`, `--ap-animation-easing`

`--ap-animation-duration` becomes `0ms` when `animations: false`, and an extra
rule disables transitions and animations globally — which is also what the base
stylesheet does under `prefers-reduced-motion: reduce`.

### Custom

Anything under `theme.customProperties` becomes a variable. The `--ap-` prefix is
added for you, so `space-block: 3rem` gives you `var(--ap-space-block)`, which
also overrides the built-in value of that name.

## Custom CSS

For anything that is not a variable — a new rule, an adjustment to a component —
point `theme.customCss` at a file:

```css
/* custom.css */
.project-card {
  border-left: 3px solid var(--ap-accent);
}

@media (min-width: 60rem) {
  .project-grid { grid-template-columns: repeat(3, 1fr); }
}
```

The file is appended to the generated stylesheet, so it comes last and wins on
equal specificity. It is written in source order into `dist/assets/css/site.css`,
which keeps the page to a single stylesheet request.

## Adding a preset

Add an entry to `THEME_PRESETS` in `src/theme/presets.js`:

```js
moss: {
  name: 'moss',
  label: 'Moss',
  description: 'Soft greens with warm neutrals.',
  typography: { heading: 'Fraunces', body: 'Inter', mono: 'JetBrains Mono' },
  radius: 'md',
  spacing: 'comfortable',
  colors: {
    light: {
      background: '#fbfdf9', surface: '#ffffff', surfaceAlt: '#eef4ec',
      text: '#16221a', muted: '#53655a', border: '#dbe7dc',
      accent: '#3f6212', secondary: '#0f766e',
    },
    dark: {
      background: '#0b120d', surface: '#121a14', surfaceAlt: '#18221b',
      text: '#e8f2ea', muted: '#9bb0a1', border: '#243027',
      accent: '#a3e635', secondary: '#2dd4bf',
    },
  },
},
```

That is the whole change. It appears in `autoportfolio themes`, works with every
template, and needs no engine edit — derived values, contrast checks and the
CSS output all follow from the palette you declared.
