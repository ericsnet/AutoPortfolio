/**
 * The preview server behind `autoportfolio dev`.
 *
 * It owns the loop that a portfolio generator actually needs: watch the
 * project, rebuild on change, and push the reload to the browser. Serving is
 * deliberately boring — files on disk, correct content types, directory URLs —
 * so what you see in the preview is what a static host will serve.
 *
 * @module preview/server
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { AutoPortfolioError, ErrorCodes } from '../util/errors.js';
import { countDiagnostics } from '../util/errors.js';
import { createTempDir, exists, isFile, removeDir, statOrNull } from '../util/fsx.js';
import { loadProject } from '../config/load.js';
import { generateSite } from '../generator/generator.js';

/** @typedef {import('../util/errors.js').Diagnostic} Diagnostic */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * @typedef {object} PreviewOptions
 * @param {string} [options.cwd]        Project directory.
 * @param {string} [options.config]     Explicit configuration file.
 * @param {string} [options.host]
 * @param {number} [options.port]
 * @param {boolean} [options.open]
 * @param {boolean} [options.watch]
 * @param {string} [options.data]       Explicit portfolio document.
 * @param {string} [options.template]   Template override.
 * @param {string} [options.theme]      Theme preset override.
 * @param {number} [options.debounce]
 * @param {(message: string) => void} [options.onLog]
 * @param {(diagnostics: Diagnostic[]) => void} [options.onDiagnostics]
 */

/**
 * Start the preview server.
 *
 * @param {PreviewOptions} [options]
 * @returns {Promise<{url: string, port: number, host: string, root: string, close: () => Promise<void>, rebuild: () => Promise<any>, on: (event: string, listener: Function) => void}>}
 */
export async function startPreviewServer(options = {}) {
  const log = options.onLog ?? (() => {});
  const outDir = await createTempDir('autoportfolio-preview-');
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @type {any} */
  let build = null;
  let building = false;
  let pending = false;
  let watchers = [];

  /** @param {string} event @param {any} payload */
  const emit = (event, payload) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };

  /**
   * Rebuild the site once; coalesces concurrent requests.
   * @returns {Promise<any>}
   */
  async function rebuild() {
    if (building) {
      pending = true;
      return build;
    }
    building = true;
    try {
      const project = await loadProject({
        cwd: options.cwd,
        config: options.config,
        data: options.data,
        template: options.template,
        theme: options.theme,
      });
      const result = await generateSite(project, { outDir, clean: true });
      build = { ...result, project, at: Date.now() };

      const sourceTexts = {};
      for (const [file, text] of Object.entries(project.sources)) sourceTexts[file.replace(project.root, '') || file] = text;
      emit('build', {
        ok: true,
        diagnostics: result.diagnostics,
        pages: result.pages.length,
        durationMs: result.durationMs,
      });
      if (options.onDiagnostics) options.onDiagnostics(result.diagnostics);
      return build;
    } catch (error) {
      const diagnostic = errorDiagnostic(error);
      emit('build', { ok: false, diagnostics: [diagnostic], errors: 1 });
      if (options.onDiagnostics) options.onDiagnostics([diagnostic]);
      return build;
    } finally {
      building = false;
      if (pending) {
        pending = false;
        setTimeout(() => {
          void rebuild().then(notifyReload);
        }, 20);
      }
    }
  }

  /** @param {any} result */
  function notifyReload(result) {
    for (const client of clients) {
      client.write(`data: ${JSON.stringify({ type: 'reload', at: Date.now() })}\n\n`);
    }
  }

  await rebuild();

  // --- http ----------------------------------------------------------------
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Preview error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  async function handleRequest(request, response) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (url.pathname === '/__autoportfolio/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      response.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }

    if (url.pathname === '/__autoportfolio/status') {
      const diagnostics = build?.diagnostics ?? [];
      const counts = countDiagnostics(diagnostics);
      response.writeHead(200, { 'content-type': MIME_TYPES['.json'], 'cache-control': 'no-store' });
      response.end(
        JSON.stringify(
          {
            ok: counts.errors === 0,
            builtAt: build?.at ?? null,
            template: build?.template ?? null,
            theme: build?.theme ?? null,
            pages: build?.pages ?? [],
            stats: build?.stats ?? null,
            counts,
            diagnostics,
          },
          null,
          2,
        ),
      );
      return;
    }

    const file = await resolveFile(outDir, url.pathname);
    if (!file) {
      response.writeHead(404, { 'content-type': MIME_TYPES['.html'], 'cache-control': 'no-store' });
      response.end(await notFoundPage(url.pathname));
      return;
    }

    const extension = path.extname(file).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';

    if (extension === '.html') {
      let html = await fs.readFile(file, 'utf8');
      html = injectLiveReload(html);
      const stats = await statOrNull(file);
      response.writeHead(200, {
        'content-type': contentType,
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
        etag: `W/"${stats?.mtimeMs ?? Date.now()}"`,
      });
      response.end(html);
      return;
    }

    const stats = await statOrNull(file);
    response.writeHead(200, {
      'content-type': contentType,
      'content-length': stats?.size ?? 0,
      'cache-control': extension === '.css' || extension === '.js' ? 'no-store' : 'public, max-age=60',
    });
    response.end(await fs.readFile(file));
  }

  // --- listen --------------------------------------------------------------
  const host = options.host ?? process.env.AUTOPORTFOLIO_HOST ?? '0.0.0.0';
  const port = await listen(server, host, options.port ?? 4173);
  log(`preview server listening on http://${host}:${port}`);

  // --- watching ------------------------------------------------------------
  if (options.watch !== false) {
    const projectDirectory = options.cwd ?? process.cwd();
    const ignored = [outDir, path.join(projectDirectory, build?.project?.config?.build?.output ?? 'dist')];
    watchers = await startWatching([projectDirectory], ignored, () => {
      void rebuild().then((result) => {
        if (result) notifyReload(result);
      });
    }, options.debounce ?? 150, log);
  }

  return {
    url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
    port,
    host,
    root: outDir,
    rebuild: async () => {
      await rebuild();
      notifyReload(build);
      return build;
    },
    close: async () => {
      for (const watcher of watchers) watcher.close();
      for (const client of clients) client.end();
      await new Promise((resolve) => server.close(resolve));
      await removeDir(outDir);
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      /** @type {Set<Function>} */ (listeners.get(event)).add(listener);
    },
  };
}

/**
 * Resolve a URL path to a file in the output directory.
 *
 * @param {string} outDir
 * @param {string} pathname
 * @returns {Promise<string|null>}
 */
async function resolveFile(outDir, pathname) {
  const decoded = decodeURIComponent(pathname);
  const safe = path.posix.normalize(`/${decoded}`).replace(/^(\.\.[/\\])+/, '');
  const relative = safe.replace(/^\/+/, '');
  const candidates = [];

  if (relative === '' || safe.endsWith('/')) {
    candidates.push(path.join(outDir, relative, 'index.html'));
  } else {
    candidates.push(path.join(outDir, relative));
    candidates.push(path.join(outDir, `${relative}.html`));
    candidates.push(path.join(outDir, relative, 'index.html'));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(outDir))) continue;
    if (await isFile(resolved)) return resolved;
  }
  return null;
}

/**
 * The preview injects a tiny live-reload client into every HTML response. The
 * generated files themselves stay clean.
 *
 * @param {string} html
 * @returns {string}
 */
function injectLiveReload(html) {
  const script = `<script data-autoportfolio-preview>(function(){if(!window.EventSource)return;var s=new EventSource('/__autoportfolio/events');s.onmessage=function(e){try{var d=JSON.parse(e.data);if(d.type==='reload'){s.close();location.reload();}}catch(err){}};})();</script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${script}</body>`);
  return `${html}${script}`;
}

/**
 * @param {string} pathname
 * @returns {Promise<string>}
 */
async function notFoundPage(pathname) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Preview — not found</title>
<style>body{font-family:system-ui,sans-serif;max-width:38rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6;color:#0f172a}
code{background:#f1f5f9;padding:.15rem .35rem;border-radius:4px}</style></head>
<body><h1>Nothing at <code>${escapeHtml(pathname)}</code></h1>
<p>The preview server looks for files in the generated output. If you expected a page here, check the build output printed in the terminal.</p>
<p><a href="/">Back to the home page</a></p></body></html>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/**
 * @param {import('node:http').Server} server
 * @param {string} host
 * @param {number} port
 * @returns {Promise<number>}
 */
async function listen(server, host, port) {
  const candidates = [port, port + 1, port + 2, 0];
  for (const candidate of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(undefined);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(candidate, host);
      });
      const address = server.address();
      return typeof address === 'object' && address ? address.port : candidate;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EADDRINUSE' || candidate === 0) {
        throw new AutoPortfolioError(`Cannot start the preview server on ${host}:${candidate}`, {
          code: ErrorCodes.INTERNAL,
          hint: 'Choose another port with `--port`.',
          cause: error,
        });
      }
    }
  }
  throw new AutoPortfolioError('Cannot start the preview server', { code: ErrorCodes.INTERNAL });
}

/**
 * Watch the project for changes, ignoring the output directory and dotfiles.
 *
 * @param {string[]} directories
 * @param {string[]} ignoredPaths
 * @param {() => void} onChange
 * @param {number} debounce
 * @param {(message: string) => void} log
 * @returns {Promise<Array<{close: () => void}>>}
 */
async function startWatching(directories, ignoredPaths, onChange, debounce, log) {
  /** @type {Array<{close: () => void}>} */
  const watchers = [];
  /** @type {NodeJS.Timeout|null} */
  let timer = null;

  /** @param {string} changed */
  const schedule = (changed) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      log(`change detected: ${changed}`);
      onChange();
    }, debounce);
  };

  for (const directory of directories) {
    const resolved = path.resolve(directory);
    if (!(await exists(resolved))) continue;
    try {
      const watcher = (await import('node:fs')).watch(resolved, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const value = String(filename);
        if (value.includes('node_modules') || value.includes('.git') || value.startsWith('.')) return;
        const absolute = path.resolve(resolved, value);
        if (ignoredPaths.some((ignored) => absolute.startsWith(path.resolve(ignored)))) return;
        if (value.endsWith('~') || value.endsWith('.swp') || value.endsWith('.tmp')) return;
        schedule(value);
      });
      watchers.push(watcher);
    } catch (error) {
      log(`could not watch ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return watchers;
}

/**
 * @param {unknown} error
 * @returns {Diagnostic}
 */
function errorDiagnostic(error) {
  if (error && typeof error === 'object' && 'toDiagnostic' in error && typeof error.toDiagnostic === 'function') {
    return /** @type {any} */ (error).toDiagnostic();
  }
  return {
    severity: 'error',
    code: ErrorCodes.INTERNAL,
    message: error instanceof Error ? error.message : String(error),
  };
}
