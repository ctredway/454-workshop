// The Z nudge moves Z at once, on a file that gives Z only once (a surfacing pass at one depth). The controller takes
// a new tool length offset only on a move that gives Z, so the nudge changed the Adjust panel and nothing moved until
// the lift at the end (Clint, 2026-10-23). Control's real files streaming to the simulated GRBL machine, which keeps
// the same rule; and, with a recorder, an arc carried on after a nudge.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GrblSim } from '../../../packages/grbl/dist/index.js';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function rig(lines) {
  const sim = new GrblSim({ start: { x: -400, y: -400, z: -50 } });
  const C = vm.createContext({});
  vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
  for (const f of ['recovery-state.js', 'overrides.js', 'job-streaming.js', 'job-run.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });
  const el = () => ({ style: {}, textContent: '', hidden: false, classList: { toggle() {} }, focus() {} });
  Object.assign(C, {
    SERIAL: { connected: true, state: 'Idle', ov: [100, 100, 100] }, PROBE: { active: false, tlo: 0 }, JOB: {},
    MODEL: { lines, lineFirstSeg: {}, segs: [] }, RX_CAP: 100, PROFILE: { run: { tc: {}, park: {} } },
    document: { getElementById: el, querySelectorAll: () => [] }, performance: { now: () => 0 }, localStorage: { getItem: () => null, setItem() {} },
    sendRT() {}, logC() {}, updateJobUI() {}, fmtTime: (s) => s, setTime() {}, qaBusy: () => false,
    sendLine: (s) => sim.write(s + '\n'),
  });
  const send = (l) => sim.write(l + '\n');
  send('$X'); send('G21 G90'); send('G10 L20 P1 X0 Y0 Z0');                // work zero here
  for (let t = 0; t < 1; t += 0.01) sim.step(0.01);
  sim.out.length = 0;
  Object.assign(C.JOB, { active: true, held: false, toolWait: null, idx: 0, acked: 0, inflight: [], startedAt: 0, clock: null,
    list: lines.map((text, i) => ({ text, ln: i + 1 })), total: lines.length });
  vm.runInContext('jobFill()', C);
  let seen = 0;
  const step = (secs) => {                                                   // the machine runs; each ok goes back to Control
    for (let t = 0; t < secs; t += 0.01) {
      sim.step(0.01);
      while (seen < sim.out.length) { const l = sim.out[seen++]; if (l === 'ok') vm.runInContext('onAck(true)', C); else if (/^error/.test(l)) C.errors = (C.errors || []).concat(l); }
    }
  };
  const workZ = () => { const m = /MPos:[-\d.]+,[-\d.]+,([-\d.]+).*WCO:[-\d.]+,[-\d.]+,([-\d.]+)/.exec(sim.status()); return +m[1] - (+m[2] - sim.tlo); };
  return { C, sim, step, workZ };
}
// a surfacing pass: down once to 0.5 mm, then rows at that depth, giving only X and Y
const rows = (n, inch) => {
  const u = (mm) => (inch ? (mm / 25.4).toFixed(4) : mm.toFixed(3));
  const L = [inch ? 'G20' : 'G21', 'G90', 'G0 Z' + u(5), 'G0 X0 Y0', 'G1 Z' + u(-0.5) + ' F' + (inch ? 24 : 600), 'G1 X' + u(60) + ' F' + (inch ? 60 : 1500)];
  for (let i = 1; i <= n; i++) { L.push('Y' + u(i * 2)); L.push('X' + u(i % 2 ? 0 : 60)); }
  return L.concat(['G0 Z' + u(5), 'M30']);
};

for (const inch of [false, true]) {
  test('a nudge down on a surfacing pass' + (inch ? ', in an inch file' : '') + ': Z goes down at once, and stays down', () => {
    const R = rig(rows(120, inch));
    R.step(30);                                                              // cutting along the rows at 0.5 mm
    assert.ok(Math.abs(R.workZ() + 0.5) < 1e-6, 'cutting at 0.5 mm: ' + R.workZ());
    R.C.run = (c) => vm.runInContext(c, R.C);
    R.C.run('znAdjust(-0.2)');
    R.step(60);                                                              // the moves already queued (rows of 2.4 s), then the nudge
    assert.ok(Math.abs(R.workZ() + 0.7) < 1e-6, 'nudged 0.2 mm deeper, though no line ahead gives Z: ' + R.workZ());
    R.step(10);
    assert.ok(Math.abs(R.workZ() + 0.7) < 1e-6 || R.workZ() > 0, 'still 0.7 mm deep further on: ' + R.workZ());
    const fs1 = +/FS:([\d.]+)/.exec(R.sim.status())[1];
    assert.ok(Math.abs(fs1 - (inch ? 60 * 25.4 : 1500)) < 1, 'cutting at the file’s feed again, not the nudge’s 400: ' + fs1);
    R.C.run('znAdjust(0.3)');                                                // and up: 0.4 mm
    R.step(60);
    assert.ok(Math.abs(R.workZ() + 0.4) < 1e-6, 'nudged up to 0.4 mm: ' + R.workZ());
    assert.deepEqual(R.C.errors || [], [], 'the controller took every line');
  });
}
test('in an arc: its G2 goes on the file’s next line (it can’t go on a line of its own), and the feed comes back', () => {
  const lines = ['G21', 'G90', 'G1 Z-1 F500', 'G2 X10 Y0 I5 J0 F800', 'X0 Y0 I-5 J0', 'X10 Y0 I5 J0', 'M30'];
  const C = vm.createContext({});
  vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
  for (const f of ['recovery-state.js', 'overrides.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });
  Object.assign(C, { PROBE: { tlo: 0 }, MODEL: { lines }, logC() {}, jobFill() {}, document: { getElementById: () => null },
    JOB: { active: true, idx: 4, list: lines.map((text, i) => ({ text, ln: i + 1 })) } });
  vm.runInContext('znAdjust(-0.1)', C);
  const sent = C.JOB.list.slice(4).map((it) => it.text);
  assert.deepEqual(sent.slice(0, 4), ['G43.1 Z-0.100', 'G90 G1 Z-1.000 F400', 'F800', 'G2 X0 Y0 I-5 J0']);
});
