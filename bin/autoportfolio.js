#!/usr/bin/env node
/**
 * AutoPortfolio CLI entry point.
 *
 * All of the interesting logic lives in `src/cli/main.js`; this file only exists
 * so that `npx autoportfolio`, `npm exec autoportfolio` and a globally linked
 * `autoportfolio` command all resolve to the same executable.
 */
import { runCli } from '../src/cli/main.js';

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
