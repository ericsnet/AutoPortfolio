/**
 * Single source of truth for the version strings AutoPortfolio prints.
 *
 * `test/version.test.js` asserts that `VERSION` matches `package.json`, so the
 * two can never drift apart silently.
 *
 * @module version
 */

/** Semantic version of AutoPortfolio. */
export const VERSION = '1.0.0';

/** Value written to `<meta name="generator">` and into generated feeds. */
export const GENERATOR = `AutoPortfolio v${VERSION}`;

/** Home page of the project, used in generated files and diagnostics. */
export const HOMEPAGE = 'https://github.com/Pickeric/AutoPortfolio';
