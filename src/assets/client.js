/* AutoPortfolio — progressive enhancement.
 *
 * Everything on the page works without JavaScript: the theme falls back to the
 * `prefers-color-scheme` media query, the navigation is a plain list of anchor
 * links, and projects are all visible. This file only adds the niceties.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'autoportfolio:theme';

  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* --- theme ------------------------------------------------------------ */

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function writePreference(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      /* storage disabled — the choice simply does not persist */
    }
    document.dispatchEvent(new CustomEvent('autoportfolio:themechange', { detail: { theme: value } }));
  }

  function applyTheme(value) {
    if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
    updateToggleLabel(value === 'light' || value === 'dark' ? value : prefersDark() ? 'dark' : 'light');
  }

  function currentTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit) return explicit;
    return prefersDark() ? 'dark' : 'light';
  }

  function updateToggleLabel(theme) {
    var toggles = document.querySelectorAll('[data-theme-toggle]');
    for (var index = 0; index < toggles.length; index += 1) {
      var toggle = toggles[index];
      var next = theme === 'dark' ? 'light' : 'dark';
      toggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      toggle.setAttribute('title', 'Switch to ' + next + ' theme');
      var glyphs = toggle.querySelectorAll('[data-theme-icon]');
      for (var g = 0; g < glyphs.length; g += 1) {
        glyphs[g].hidden = glyphs[g].getAttribute('data-theme-icon') !== theme;
      }
    }
  }

  function initTheme() {
    applyTheme(readPreference());

    document.addEventListener('click', function (event) {
      var toggle = event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
      if (!toggle) return;
      event.preventDefault();
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writePreference(next);
    });

    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-color-scheme: dark)');
      var listener = function () {
        if (!readPreference()) applyTheme(null);
      };
      if (media.addEventListener) media.addEventListener('change', listener);
      else if (media.addListener) media.addListener(listener);
    }
  }

  /* --- navigation ------------------------------------------------------- */

  function initNav() {
    var nav = document.querySelector('[data-nav]');
    if (!nav) return;

    var toggle = nav.querySelector('[data-nav-toggle]');
    var menu = nav.querySelector('[data-nav-menu]');
    if (!toggle || !menu) return;

    toggle.hidden = false;

    function close() {
      menu.setAttribute('data-open', 'false');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      var open = menu.getAttribute('data-open') === 'true';
      menu.setAttribute('data-open', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('a')) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    // Highlight the section currently in view.
    var links = menu.querySelectorAll('a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    var sections = [];
    for (var index = 0; index < links.length; index += 1) {
      var id = links[index].getAttribute('href').slice(1);
      var section = id ? document.getElementById(id) : null;
      if (!section) continue;
      map[id] = links[index];
      sections.push(section);
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = map[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            for (var key in map) map[key].removeAttribute('aria-current');
            link.setAttribute('aria-current', 'true');
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* --- scroll reveal ---------------------------------------------------- */

  function initReveal() {
    var targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      for (var index = 0; index < targets.length; index += 1) targets[index].classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );

    for (var index = 0; index < targets.length; index += 1) observer.observe(targets[index]);
  }

  /* --- project filters -------------------------------------------------- */

  function initFilters() {
    var groups = document.querySelectorAll('[data-project-filter]');
    if (!groups.length) return;

    for (var index = 0; index < groups.length; index += 1) {
      (function (group) {
        var buttons = group.querySelectorAll('[data-filter-value]');
        var cards = group.querySelectorAll('[data-project-tags]');
        var counter = group.querySelector('[data-filter-count]');

        function apply(value) {
          var visible = 0;
          for (var c = 0; c < cards.length; c += 1) {
            var tags = (cards[c].getAttribute('data-project-tags') || '').split('|');
            var match = value === '*' || tags.indexOf(value) !== -1;
            cards[c].hidden = !match;
            if (match) visible += 1;
          }
          if (counter) counter.textContent = String(visible);
        }

        for (var b = 0; b < buttons.length; b += 1) {
          buttons[b].addEventListener('click', function (event) {
            var button = event.currentTarget;
            for (var other = 0; other < buttons.length; other += 1) {
              buttons[other].setAttribute('aria-pressed', buttons[other] === button ? 'true' : 'false');
            }
            apply(button.getAttribute('data-filter-value') || '*');
          });
        }
      })(groups[index]);
    }
  }

  /* --- copy button on code blocks --------------------------------------- */

  function initCopyButtons() {
    if (!navigator.clipboard) return;
    var blocks = document.querySelectorAll('pre.md-code');
    for (var index = 0; index < blocks.length; index += 1) {
      (function (block) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'code-copy';
        button.textContent = 'Copy';
        button.addEventListener('click', function () {
          var code = block.querySelector('code');
          navigator.clipboard.writeText(code ? code.textContent : '').then(function () {
            button.textContent = 'Copied';
            window.setTimeout(function () {
              button.textContent = 'Copy';
            }, 1600);
          });
        });
        block.appendChild(button);
      })(blocks[index]);
    }
  }

  /* --- bootstrap -------------------------------------------------------- */

  function boot() {
    document.body.classList.remove('no-js');
    initTheme();
    initNav();
    initReveal();
    initFilters();
    initCopyButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // The inline script in <head> already applied the stored theme; keep the
  // toggle label in sync even if that script is blocked.
  updateToggleLabel(currentTheme());
})();
