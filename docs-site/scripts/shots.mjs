// npm run shots: regenerate every documentation screenshot (see scripts/shots.cjs for the list).
// Builds the desktop app's pages first, so the shots show the current Design and Control, then runs the
// capture program in the desktop app's Electron. On Linux without a screen, run it under xvfb-run.
//   npm run shots                         all of them
//   SHOTS_ONLY=design-offset npm run shots   just one (or several, comma-separated)
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..', '..', 'apps', 'desktop');
console.log('Building the apps\u2019 pages\u2026');
execFileSync(process.execPath, [path.join(desktop, 'scripts', 'build-app.js')], { stdio: 'inherit' });
const electron = createRequire(path.join(desktop, 'package.json'))('electron');   // the path to its binary
console.log('Taking the screenshots\u2026');
const r = spawnSync(electron, [path.join(here, 'shots-electron.cjs'), '--no-sandbox'], { stdio: 'inherit', env: process.env });
process.exit(r.status === null ? 1 : r.status);
