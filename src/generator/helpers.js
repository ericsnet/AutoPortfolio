/**
 * Template helpers.
 *
 * Helpers are the small vocabulary templates use on top of plain expressions.
 * They are registered for every build, so a template can rely on them being
 * present without importing anything.
 *
 * Helpers receive `(args, context)` where `args` is the array of evaluated
 * arguments and `context` exposes the current scope chain, the localisation
 * settings and a reference to the runtime itself.
 *
 * @module generator/helpers
 */

import { SafeHtml, attrs, classNames, escapeHtml, raw, stringify } from '../util/html.js';
import { markdownToText } from '../util/markdown.js';
import { oneLine, pluralize, titleCase, truncate } from '../util/text.js';
import { iconPath } from '../assets/icons.js';
import { GENERATOR } from '../version.js';

/**
 * @typedef {object} HelperOptions
 * @property {any} config
 * @property {any} data
 * @property {any} theme
 * @property {() => any} currentFormatter Returns the formatter bound to the page being rendered.
 * @property {import('../template/runtime.js').Runtime} runtime
 * @property {object} [build]
 */

/**
 * A section is passed to `include` as a whole (`{{include section.partials this}}`),
 * because that is what the page template has in hand. The partial itself wants
 * the section's model, so unwrap it here — in one place, for every template.
 *
 * @param {any} scope
 * @returns {any}
 */
function normalizeSectionScope(scope) {
  if (scope && typeof scope === 'object' && scope.model && typeof scope.model === 'object') {
    return { ...scope.model, section: scope };
  }
  return scope;
}

/**
 * @param {HelperOptions} options
 * @returns {Record<string, (args: any[], context: any) => any>}
 */
export function createHelpers(options) {
  const { config, theme } = options;
  const build = options.build ?? {};
  /** Helpers are shared by every page, so the formatter is resolved per call. */
  const formatter = () => options.currentFormatter();

  /** @param {unknown} value */
  const text = (value) => (value === null || value === undefined ? '' : String(value));

  return {
    // --- markup -----------------------------------------------------------
    /**
     * `{{icon "mail"}}` -> inline SVG. Unknown names fall back to a generic
     * glyph so a typo never breaks a build.
     */
    icon(args) {
      const name = text(args[0]);
      const size = args[1] ?? 20;
      const paths = iconPath(name) ?? iconPath('link');
      if (!paths) return raw('');
      const title = args[2] ? `<title>${escapeHtml(String(args[2]))}</title>` : '';
      return raw(
        `<svg class="icon icon--${escapeHtml(name || 'link')}" width="${escapeHtml(size)}" height="${escapeHtml(
          size,
        )}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${title}${paths}</svg>`,
      );
    },

    /**
     * `{{include section this}}` — render the first partial that exists from a
     * section's candidate list. This is what lets one page template render every
     * section, including custom ones, without a switch statement.
     */
    include(args, context) {
      const target = args[0];
      const scope = normalizeSectionScope(args[1]);
      const candidates = Array.isArray(target)
        ? target.map(String)
        : target && typeof target === 'object' && Array.isArray(target.partials)
          ? target.partials.map(String)
          : [text(target), 'sections/default'];

      for (const candidate of candidates) {
        if (context.partials.has(candidate)) return raw(context.partial(candidate, scope));
      }
      if (context.partials.has('sections/default')) return raw(context.partial('sections/default', scope));
      // A missing section partial is a template bug, not a reason to fail a
      // build: the comment survives minification and is easy to spot in devtools.
      return raw(`<!-- autoportfolio: no partial for ${escapeHtml(candidates[0] ?? '')} -->`);
    },

    /** `{{attrs href=url class="x" hidden=shown}}` */
    attrs(args, context) {
      const value = args[0] ?? context.this;
      return raw(value && typeof value === 'object' ? attrs(value) : '');
    },

    /** `{{class "a" active=isActive}}` */
    class(args, context) {
      const value = args[0];
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof SafeHtml)) {
        return raw(classNames(value));
      }
      return text(value);
    },

    /** `{{json value}}` — safe JSON for `<script type="application/ld+json">`. */
    json(args) {
      return raw(JSON.stringify(args[0] ?? null).replace(/</g, '\\u003c'));
    },

    /**
     * Link attributes for off-site links: `{{external url}}` renders
     * `rel="noopener noreferrer" target="_blank"` when appropriate.
     */
    external(args) {
      const url = text(args[0]);
      if (!/^https?:/i.test(url)) return raw('');
      const attrsList = { rel: 'noopener noreferrer' };
      if (config.content?.externalLinksNewTab !== false) attrsList.target = '_blank';
      return raw(attrs(attrsList));
    },

    /** `{{> partial}}` alternative for dynamic names: `{{partial "x" ctx}}`. */
    partial(args, context) {
      const name = text(args[0]);
      if (!name) return raw('');
      return raw(context.partial(name, args[1]));
    },

    // --- text -------------------------------------------------------------
    /** `{{truncate value 120}}` */
    truncate(args) {
      return truncate(text(args[0]), Number(args[1] ?? 140), { words: true });
    },
    /** `{{oneLine value}}` */
    oneLine(args) {
      return oneLine(markdownToText(text(args[0])));
    },
    /** `{{upper value}}` / `{{lower value}}` */
    upper(args) {
      return text(args[0]).toUpperCase();
    },
    lower(args) {
      return text(args[0]).toLowerCase();
    },
    /** `{{title value}}` */
    title(args) {
      return titleCase(text(args[0]));
    },
    /** `{{join list ", "}}` */
    join(args) {
      const list = args[0];
      const separator = args[1] ?? ', ';
      if (!Array.isArray(list)) return text(list);
      return list
        .map((entry) => (entry && typeof entry === 'object' ? entry.name ?? entry.label ?? stringify(entry) : text(entry)))
        .filter(Boolean)
        .join(String(separator));
    },
    /** `{{plural 3 "project" "projects"}}` */
    plural(args) {
      return pluralize(Number(args[0] ?? 0), text(args[1]), args[2] ? text(args[2]) : undefined);
    },
    /** `{{count list}}` */
    count(args) {
      const value = args[0];
      if (Array.isArray(value)) return value.length;
      if (value && typeof value === 'object') return Object.keys(value).length;
      return value ? 1 : 0;
    },
    /** `{{default value "fallback"}}` */
    default(args) {
      const value = args[0];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        return args[1];
      }
      return value;
    },
    /** `{{contains list value}}` / `{{startsWith text prefix}}` */
    contains(args) {
      const [haystack, needle] = args;
      if (Array.isArray(haystack)) return haystack.includes(needle);
      if (typeof haystack === 'string') return haystack.includes(text(needle));
      return false;
    },
    startsWith(args) {
      return text(args[0]).startsWith(text(args[1]));
    },
    /** `{{range 1 5}}` -> [1,2,3,4,5] */
    range(args) {
      const start = Number(args[0] ?? 1);
      const end = Number(args[1] ?? 0);
      const step = Number(args[2] ?? 1);
      /** @type {number[]} */
      const out = [];
      for (let value = start; step > 0 ? value <= end : value >= end; value += step) out.push(value);
      return out;
    },

    // --- formatting -------------------------------------------------------
    /** `{{markdown value}}` */
    markdown(args) {
      return formatter().markdown(text(args[0]));
    },
    /** `{{inline value}}` */
    inline(args) {
      return formatter().inline(text(args[0]));
    },
    /** `{{date value "month"}}` */
    date(args) {
      return formatter().date(text(args[0]), args[1] ? { precision: String(args[1]) } : {});
    },
    /** `{{dateRange start end "short"}}` — the numeric `range` helper keeps its name. */
    dateRange(args) {
      return formatter().range(text(args[0]), text(args[1]), args[2] ? { format: String(args[2]) } : {});
    },
    duration(args) {
      return formatter().duration(text(args[0]), text(args[1]));
    },
    /** `{{asset "images/logo.svg"}}` */
    asset(args) {
      return formatter().asset(text(args[0]));
    },
    /** `{{url "/projects/foo/"}}` — resolved relative to the current page. */
    url(args) {
      return formatter().link(text(args[0]));
    },
    /** `{{absolute "/projects/foo/"}}` */
    absolute(args) {
      return formatter().absolute(text(args[0]));
    },
    /** `{{mailto email}}` */
    mailto(args) {
      return formatter().mailto(text(args[0]));
    },
    /** `{{prettyUrl value}}` */
    prettyUrl(args) {
      return text(args[0]).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    },

    // --- misc -------------------------------------------------------------
    year() {
      return new Date().getUTCFullYear();
    },
    generator() {
      return GENERATOR;
    },
    /** `{{sectionIcon section}}` */
    sectionIcon(args) {
      const value = args[0];
      const name = typeof value === 'string' ? value : value?.icon;
      return name ? `icon--${name}` : '';
    },
    /** `{{debug value}}` prints a value during development. */
    debug(args) {
      return raw(`<pre class="debug">${escapeHtml(JSON.stringify(args[0], null, 2) ?? '')}</pre>`);
    },
    /** `{{option "showStats" true}}` — template options with a fallback. */
    option(args) {
      const key = text(args[0]);
      const options = config.templateOptions ?? {};
      if (key in options) return options[key];
      const defaults = build.templateOptions ?? {};
      if (key in defaults) return defaults[key];
      return args.length > 1 ? args[1] : undefined;
    },
    /** `{{themeVar "--ap-accent"}}` */
    themeVar(args) {
      const name = text(args[0]).replace(/^--/, '');
      return theme.variables[name] ?? '';
    },
  };
}

/**
 * Register a helper set on a runtime.
 *
 * @param {import('../template/runtime.js').Runtime} runtime
 * @param {Record<string, (args: any[], context: any) => any>} helpers
 */
export function registerHelpers(runtime, helpers) {
  for (const [name, fn] of Object.entries(helpers)) runtime.registerHelper(name, fn);
}
