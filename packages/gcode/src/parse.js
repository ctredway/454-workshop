// @ts-nocheck
// The G-code parser is packages/gcode/src/parser.cjs: one file, shared with 454 Control, which includes it
// into its page. This loads it for the package.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('./parser.cjs');
export const { parseGcode, retimeWithPlanner, splitGcodeComments, cleanForSend, SUPPORTED_G, SUPPORTED_M } = P;
