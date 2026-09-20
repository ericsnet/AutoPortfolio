/**
 * The export layer.
 *
 * Deployment targets are the part of AutoPortfolio that knows about *hosts*
 * rather than about *content* or *presentation*. Keeping them behind
 * `applyExportTarget` means the generator never has to grow a branch per host,
 * and a new target is one entry in `EXPORT_TARGETS`.
 *
 * @module export
 */

export {
  EXPORT_TARGETS,
  EXPORT_TARGET_NAMES,
  applyExportTarget,
  getExportTarget,
  normalizeBasePath,
} from './targets.js';
