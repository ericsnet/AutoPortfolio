/**
 * Filesystem helpers.
 *
 * Only the operations AutoPortfolio actually needs are implemented here so that
 * behaviour (atomic writes, stable walk order, symlink policy) is consistent
 * everywhere in the codebase.
 *
 * @module util/fsx
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

/**
 * @typedef {object} WalkEntry
 * @property {string} path      Absolute path.
 * @property {string} relative  Path relative to the walk root, POSIX separators.
 * @property {boolean} directory
 * @property {number} size
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function toPosix(value) {
  return value.split(path.sep).join('/');
}

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} file
 * @returns {Promise<import('node:fs').Stats|null>}
 */
export async function statOrNull(file) {
  try {
    return await fs.stat(file);
  } catch {
    return null;
  }
}

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function isFile(file) {
  const stats = await statOrNull(file);
  return Boolean(stats?.isFile());
}

/**
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isDirectory(dir) {
  const stats = await statOrNull(dir);
  return Boolean(stats?.isDirectory());
}

/**
 * Read a UTF-8 file, returning `null` when it does not exist.
 * @param {string} file
 * @returns {Promise<string|null>}
 */
export async function readTextOrNull(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Read a file as a Buffer, returning `null` when it does not exist.
 * @param {string} file
 * @returns {Promise<Buffer|null>}
 */
export async function readBufferOrNull(file) {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Write a file atomically: the content is written to a temporary file in the
 * same directory and then renamed over the target, so a crashed build never
 * leaves a half-written page on disk.
 *
 * @param {string} file
 * @param {string|Buffer|Uint8Array} content
 * @returns {Promise<void>}
 */
export async function writeFileAtomic(file, content) {
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temporary, content);
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Recursively list files under `root` in a stable (sorted) order.
 *
 * @param {string} root
 * @param {object} [options]
 * @param {boolean} [options.includeDirectories]
 * @param {(entry: WalkEntry) => boolean} [options.filter]
 * @param {number} [options.maxDepth]
 * @returns {Promise<WalkEntry[]>}
 */
export async function walk(root, options = {}) {
  /** @type {WalkEntry[]} */
  const entries = [];
  const maxDepth = options.maxDepth ?? Infinity;

  /**
   * @param {string} dir
   * @param {number} depth
   */
  async function visit(dir, depth) {
    /** @type {import('node:fs').Dirent[]} */
    let children;
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
      throw error;
    }
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (child.name === '.git' || child.name === 'node_modules' || child.name.startsWith('.')) {
        if (child.isDirectory()) continue;
      }
      const absolute = path.join(dir, child.name);
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) {
        if (options.includeDirectories) {
          const entry = {
            path: absolute,
            relative: toPosix(path.relative(root, absolute)),
            directory: true,
            size: 0,
          };
          if (!options.filter || options.filter(entry)) entries.push(entry);
        }
        if (depth < maxDepth) await visit(absolute, depth + 1);
        continue;
      }
      if (!child.isFile()) continue;
      const stats = await fs.stat(absolute);
      const entry = {
        path: absolute,
        relative: toPosix(path.relative(root, absolute)),
        directory: false,
        size: stats.size,
      };
      if (!options.filter || options.filter(entry)) entries.push(entry);
    }
  }

  if (await isDirectory(root)) await visit(root, 0);
  return entries;
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function removeDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Remove a file if it exists.
 * @param {string} file
 * @returns {Promise<void>}
 */
export async function removeFile(file) {
  await fs.rm(file, { force: true });
}

/**
 * Create a unique temporary directory inside the OS temp folder.
 * @param {string} [prefix]
 * @returns {Promise<string>}
 */
export async function createTempDir(prefix = 'autoportfolio-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Content digest of a string or buffer.
 * @param {string|Buffer|Uint8Array} content
 * @param {number} [length] Truncate the hex digest.
 * @returns {string}
 */
export function hashContent(content, length = 8) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, length);
}

/**
 * Copy a file, creating parent directories.
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
export async function copyFile(from, to) {
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
}

/**
 * Resolve `candidate` inside `root`, refusing to escape it. Returns `null` for
 * paths that leave the root — used for user supplied asset paths.
 *
 * @param {string} root
 * @param {string} candidate
 * @returns {string|null}
 */
export function resolveWithin(root, candidate) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

/**
 * Synchronous existence check, for code paths that cannot be async (CLI boot).
 * @param {string} file
 * @returns {boolean}
 */
export function existsSync(file) {
  return fsSync.existsSync(file);
}

/**
 * Byte-size formatting for build reports.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
