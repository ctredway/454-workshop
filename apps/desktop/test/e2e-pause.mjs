// Pause & lift and Resume, end to end: the real app's 454 Control, a job made by the CAM engine, and the simulated GRBL
// machine inside the page (e2e-pause-page.js). Clint, 2026-10-23: Resume carried on from the start of the toolpath, or
// the next one, and then did nothing. Needs `npm run build` at the top (the simulator) and the app's packages.
//   node apps/desktop/test/e2e-pause.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), app = path.join(here, '..'), root = path.join(app, '..', '..');
const require = createRequire(import.meta.url);
const Cam = require(path.join(root, 'cam.js'));
const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const o = { side: 'outside', toolDia: 6.35, depth: 6, passDepth: 1.5, feed: 1500, plunge: 400, safeZ: 5, ramp: { length: 25 } };
const parts = [['First outline', sq(10, 10, 120, 80)], ['Second outline', sq(160, 10, 60, 60)]]
  .map(([name, outline]) => ({ moves: Cam.profile(Object.assign({ outline }, o)).moves, name, tool: 1, rpm: 12000, toolName: '1/4 in' }));
const gcode = Cam.toGcodeJob(parts, { safeZ: 5, notes: [] }).replace('M6 T1\n', '');   // no bit to fit at the start
const sim = fs.readFileSync(path.join(root, 'packages/grbl/dist/sim.js'), 'utf8').replace(/^export /m, '').replace(/\/\/# sourceMappingURL.*$/m, '');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-pause-'));
const script = path.join(tmp, 'run.js'), out = path.join(tmp, 'out.json');
fs.writeFileSync(script, sim + '\nvar GCODE = ' + JSON.stringify(gcode) + ';\n' + fs.readFileSync(path.join(here, 'e2e-pause-page.js'), 'utf8'));

spawnSync(process.execPath, ['scripts/build-app.js'], { cwd: app, stdio: 'ignore' });
const env = Object.assign({}, process.env, { APPDATA: path.join(tmp, 'appdata'), P454_E2E: script, P454_E2E_OUT: out });
delete env.ELECTRON_RUN_AS_NODE;
const electron = path.join(app, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
spawnSync(electron, ['.'].concat(process.platform === 'linux' ? ['--no-sandbox'] : []), { cwd: app, env, stdio: 'ignore', timeout: 300000, shell: process.platform === 'win32' });

const r = JSON.parse(fs.readFileSync(out, 'utf8'));
r.log.forEach((l) => console.log(' - ' + l));
const fail = [];
if (!r.ok) fail.push(r.error);
const line = (re) => { const m = (r.log.find((l) => re.test(l)) || '').match(re); return m ? +m[1] : null; };
const paused = line(/^paused: PAUSED\.line (\d+)/), asked1 = (r.asked[1] || '').match(/^Carry on from line (\d+)\?$/);
if (!asked1 || +asked1[1] !== paused) fail.push('Resume carried on from ' + (r.asked[1] || 'nowhere') + ', not the line it paused at, ' + paused);
const away = line(/^distance from where it stopped: ([\d.]+)/);
if (!(away < 40)) fail.push('cutting again ' + away + ' mm from where it stopped');
if (!/Carry on from line \d+\?/.test(r.asked[2] || '')) fail.push('the second Resume asked ' + r.asked[2]);
if (r.asked[3] !== 'Nothing to resume') fail.push('Resume after End job asked ' + r.asked[3]);
if (!r.log.some((l) => l === 'while lifting: Go to XY zero greyed, jog greyed, Resume greyed, STOP pressable')) fail.push('the buttons while lifting: ' + r.log.find((l) => /^while lifting/.test(l)));
if (fail.length){ console.log('FAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('ok: paused at line ' + paused + ', carried on from it; waited for the lift; paused and resumed again; said Nothing to resume after End job');
