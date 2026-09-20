# AutoPortfolio documentation

The [main README](../README.md) covers what AutoPortfolio is and how to get
started. These pages go deeper into the parts you are likely to want to change.

| Page | What it covers |
|---|---|
| [Architecture](architecture.md) | How the pipeline is put together, what each module owns, and where the seams are. |
| [Data model](data-model.md) | Every field in a portfolio document, what happens to it during normalisation, and what the templates end up seeing. |
| [Templates](templates.md) | The template engine, the view model templates consume, and how to write your own. |
| [Themes](themes.md) | Presets, how a theme resolves to CSS custom properties, and how to make one. |
| [Deployment](deployment.md) | Export targets, base paths, custom domains, and CI. |
| [Troubleshooting](troubleshooting.md) | Diagnostic codes, common mistakes, and what to do about them. |

## Reading order

If you want to **use** AutoPortfolio, start with the main README, then read
[Data model](data-model.md) when you hit a field you do not understand.

If you want to **extend** it, read [Architecture](architecture.md) first — it
explains which layer a change belongs in, which is usually the difference between
a two-line edit and a sprawling one.

If you want to **customise the look**, read [Themes](themes.md). Most visual
changes need no template edits at all: a theme is CSS custom properties, so
overriding one variable is often enough.
