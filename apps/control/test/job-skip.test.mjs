// Running only some toolpaths (job-skip.js): a real three-toolpath file, as 454 Design writes it, through Control's
// own parser, Toolpaths tab, job builder and skip code, then run on the simulated GRBL machine (packages/grbl, built
// by `npm run build`). What the machine actually cut must be exactly the ticked toolpaths' cuts, each with the spindle
// on at its own speed and the right tool in, and nothing dragged through the work.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GrblSim } from '../../../packages/grbl/dist/index.js';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const C = vm.createContext({});
vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
for (const f of ['recovery-state.js', 'job-summary.js', 'job-builder.js', 'job-skip.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });

// 454 Design's layout (cam.js toGcodeJob): tools listed, then each toolpath named, a tool change only when the tool changes
const FILE = [
  '(454 CAM)', ';Tools used in this file:', ';1 = 6.35 mm end mill', ';2 = 3.175 mm end mill', 'G21', 'G90', 'G17',
  ';Toolpath: Pocket', ';Tool: 6.35 mm end mill', 'M6 T1', 'M3 S18000',
  'G0 Z5', 'G0 X10 Y10', 'G1 Z-3 F300', 'G1 X40 F1200', 'Y40', 'X10', 'Y10', 'G0 Z5',
  ';Toolpath: Profile A', ';Tool: 6.35 mm end mill',
  'G0 X60 Y10', 'G1 Z-6 F300', 'G1 X90 F1000', 'Y40', 'X60', 'Y10', 'G0 Z5',
  'G0 Z5', 'M5', ';Toolpath: Profile B', ';Tool: 3.175 mm end mill', 'M6 T2', 'M3 S16000',
  'G0 X110 Y10', 'G1 Z-4 F250', 'G1 X140 F800', 'Y40', 'X110', 'Y10', 'G0 Z5',
  'G0 Z5', 'M5', 'M30'];
const TOOL = { Pocket: '1', 'Profile A': '1', 'Profile B': '2' };
const RPM = { Pocket: 18000, 'Profile A': 18000, 'Profile B': 16000 };

function model() {
  const text = FILE.join('\n');
  const M = C.parseGcode(text);
  C.MODEL = M;
  return M;
}
function endingMoves(at) {
  const cmds = []; if (!at || Math.hypot(at.x, at.y) > 0.02) cmds.push('G90 G0 X0 Y0');
  cmds.push('G53 G0 X-419.000 Y-10.000');
  return { cmds, zeroed: true, parked: { x: -419, y: -10 } };
}
const WCO = { x: -500, y: -500, z: -60 };
// the job Control would send, with these toolpaths left out (by name)
function jobFor(skipNames) {
  const M = model(), sum = C.jobSummary(M);
  const sections = sum.list.map((r) => ({ from: r.from, to: r.to, name: r.name }));
  const p = C.JobSkip.plan({ lines: M.lines, sections, skip: sections.map((s) => skipNames.includes(s.name)), segs: M.segs,
                             stateAt: C.stateAtLine, clean: C.cleanForSend });
  if (p && p.why) return { why: p.why };
  const list = C.JobBuilder.build(p ? p.lines : M.lines, { homed: true, wcoZ: WCO.z, stopHigh: true, spinup: 1, zMax: 0, travelZ: 5, topZ: 2,
    clean: C.cleanForSend, endingMoves, segs: p ? p.segs : M.segs });
  if (p) C.JobSkip.apply(list, p, { zHigh: 'G53 G0 Z-5.0', spinup: 1 });
  return { list, sections, plan: p, M };
}
// run a job on the simulated machine: lines one at a time, each when the last is answered; a tool change loads its tool
function runOnSim(list) {
  const sim = new GrblSim({ settings: { 22: 1 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 } });
  let seen = 0;
  const pump = (until, secs) => {
    for (let t = 0; t < secs; t += 0.01) {
      sim.step(0.01);
      while (seen < sim.out.length) { const l = sim.out[seen++]; if (l === 'ok' || /^error/.test(l)) return l; }
      if (until && until()) return 'until';
    }
    throw new Error('the machine didn’t answer');
  };
  const send = (t) => { sim.write(t + '\n'); return pump(null, 600); };
  sim.write('$H\n'); pump(() => sim.homed && sim.state === 'Idle', 60);
  send('G53 G0 X' + WCO.x + ' Y' + WCO.y + ' Z' + WCO.z); pump(() => sim.state === 'Idle', 60);
  send('G10 L20 P1 X0 Y0 Z0');
  let tool = '?'; const tools = [];
  for (const it of list) {
    if (it.m6) { pump(() => sim.state === 'Idle', 600); tool = it.tool; tools.push({ t: sim.t, tool }); continue; }
    const r = send(it.text);
    if (r !== 'ok') throw new Error(r + ' on ' + it.text);
  }
  pump(() => sim.state === 'Idle', 600);
  const toolAt = (t) => { let v = '?'; for (const x of tools) if (x.t <= t) v = x.tool; return v; };
  const moves = sim.timeline.filter((e) => e.kind === 'move').map((e) => ({ ...e, wf: sim.toWork(e.from, e.wco, e.tlo), wt: sim.toWork(e.to, e.wco, e.tlo), tool: toolAt(e.t) }));
  return { sim, moves };
}
const r3 = (v) => Math.round(v * 1000) / 1000;
// where a cut goes (a plunge's starting height is left out: after a tool change it starts from wherever the change left it)
const key = (a, b) => [a.x, a.y, b.x, b.y, b.z].map(r3).join(',');

// what a full run cuts, per toolpath (the parser's own moves), to compare against
function cutsOf(M, sections, names) {
  return [...M.segs].filter((g) => !g.rapid && sections.some((s) => names.includes(s.name) && g.line >= s.from && g.line <= s.to))
    .map((g) => key({ x: g.x0, y: g.y0, z: g.z0 }, { x: g.x1, y: g.y1, z: g.z1 }));
}
function check(skip) {
  const j = jobFor(skip);
  const names = j.sections.map((s) => s.name), kept = names.filter((n) => !skip.includes(n));
  const { sim, moves } = runOnSim(j.list);
  assert.deepEqual(sim.errors, [], 'no errors from the machine');
  const cuts = moves.filter((m) => !m.rapid);
  assert.deepEqual(cuts.map((m) => key(m.wf, m.wt)), cutsOf(j.M, j.sections, kept), 'cut exactly the ticked toolpaths, in order');
  // each cut with the spindle on at its toolpath's speed, and its toolpath's tool in
  const owner = (m) => j.sections.find((s) => cutsOf(j.M, j.sections, [s.name]).includes(key(m.wf, m.wt))).name;
  for (const m of cuts) {
    const n = owner(m);
    assert.ok(m.spindleOn, 'spindle on for ' + n);
    assert.equal(m.rpm, RPM[n], 'speed for ' + n);
    assert.equal(m.tool, TOOL[n], 'tool for ' + n);
  }
  // no rapid sideways below the top of the work
  for (const m of moves.filter((x) => x.rapid)) {
    const sideways = Math.hypot(m.wt.x - m.wf.x, m.wt.y - m.wf.y) > 0.001;
    if (sideways) assert.ok(Math.min(m.wf.z, m.wt.z) >= -0.001, 'rapid sideways at Z ' + m.wf.z + ' → ' + m.wt.z);
  }
  return j;
}

test('the file is found as three named toolpaths', () => {
  const M = model(), sum = C.jobSummary(M);
  assert.equal(sum.how, 'named');
  assert.deepEqual(JSON.parse(JSON.stringify(sum.list.map((r) => r.name))), ['Pocket', 'Profile A', 'Profile B']);
});

test('nothing left out: no plan, the normal job', () => {
  const j = jobFor([]);
  assert.equal(j.plan, null);
  check([]);
});

test('only the last toolpath: its own tool change, then just its cuts', () => {
  const j = check(['Pocket', 'Profile A']);
  assert.equal(j.list.filter((it) => it.m6).length, 1);
});

test('only the middle toolpath: the tool the left-out first one loaded is loaded for it, with the spindle at its speed', () => {
  const j = check(['Pocket', 'Profile B']);
  const m6 = j.list.filter((it) => it.m6);
  assert.deepEqual(JSON.parse(JSON.stringify(m6.map((it) => it.tool))), ['1'], 'T1 asked for, as the left-out Pocket would have');
});

test('the first and last, leaving out the middle: it never goes over the left-out toolpath', () => {
  const j = check(['Profile A']);
  const { moves } = runOnSim(j.list);
  const visits = moves.filter((m) => Math.abs(m.wt.x - 60) < 0.01 && Math.abs(m.wt.y - 10) < 0.01);
  assert.deepEqual(visits.length, 0, 'not to X60 Y10, where Profile A starts and ends');
});

test('only the first', () => { check(['Profile A', 'Profile B']); });

test('the first two, leaving out the last', () => { check(['Profile B']); });

test('a toolpath that starts by plunging where the last one ended: run alone, it goes there first', () => {
  const lines = ['G21 G90', ';Toolpath: Slot', 'M3 S12000', 'G0 Z5', 'G0 X20 Y30', 'G1 Z-2 F300', 'G1 X50 F900', 'G0 Z5',
                 ';Toolpath: Notch', 'G1 Z-1 F300', 'G1 Y60 F900', 'G0 Z5', 'M5', 'M30'];
  const M = C.parseGcode(lines.join('\n')); C.MODEL = M;
  const sum = C.jobSummary(M), sections = sum.list.map((r) => ({ from: r.from, to: r.to, name: r.name }));
  const p = C.JobSkip.plan({ lines: M.lines, sections, skip: [true, false], segs: M.segs, stateAt: C.stateAtLine, clean: C.cleanForSend });
  const list = C.JobBuilder.build(p.lines, { homed: true, wcoZ: WCO.z, stopHigh: true, spinup: 1, zMax: 0, travelZ: 5, topZ: 2,
    clean: C.cleanForSend, endingMoves, segs: p.segs });
  C.JobSkip.apply(list, p, { zHigh: 'G53 G0 Z-5.0', spinup: 1 });
  const { sim, moves } = runOnSim(list);
  assert.deepEqual(sim.errors, []);
  const cuts = moves.filter((m) => !m.rapid);
  assert.deepEqual(cuts.map((m) => key(m.wf, m.wt)), ['50,30,50,30,-1', '50,30,50,60,-1'], 'down at X50 Y30, where Slot ended, then along');
  assert.ok(cuts.every((m) => m.spindleOn && m.rpm === 12000), 'with the spindle on at Slot’s speed');
});

// Clint, 2026-10-22: the toolpath that ran "ran very very slowly". Design writes F only when it changes, so a toolpath
// at the same feed as the one before has none of its own; and the BitSetter's slow touch leaves the controller at F40.
test('a toolpath with no feed of its own, after the BitSetter: it cuts at the file’s feed, not the probe’s', () => {
  const lines = ['G21 G90', ';Tools used in this file:', ';1 = 6.35 mm end mill',
    ';Toolpath: Rough', 'M6 T1', 'M3 S18000', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-3 F1000', 'G1 X40', 'Y40', 'G0 Z5',
    ';Toolpath: Finish', 'G0 X60 Y10', 'G1 Z-3', 'G1 X90', 'Y40', 'G0 Z5', 'M5', 'M30'];
  const M = C.parseGcode(lines.join('\n')); C.MODEL = M;
  const sum = C.jobSummary(M), sections = sum.list.map((r) => ({ from: r.from, to: r.to, name: r.name }));
  const p = C.JobSkip.plan({ lines: M.lines, sections, skip: [true, false], segs: M.segs, stateAt: C.stateAtLine, clean: C.cleanForSend });
  const list = C.JobBuilder.build(p.lines, { homed: true, wcoZ: WCO.z, stopHigh: true, spinup: 1, zMax: 0, travelZ: 5, topZ: 2,
    clean: C.cleanForSend, endingMoves, segs: p.segs });
  C.JobSkip.apply(list, p, { zHigh: 'G53 G0 Z-5.0', spinup: 1 });
  // the tool change measures on the BitSetter, whose last, slow touch is at F40: the controller is left there
  const withProbe = [];
  for (const it of list) { withProbe.push(it); if (it.m6) withProbe.push({ text: 'G91 G1 Z-0.001 F40', syn: true }, { text: 'G90', syn: true }); }
  const { sim, moves } = runOnSim(withProbe);
  assert.deepEqual(sim.errors, []);
  const tl = sim.timeline, cuts = [];
  tl.forEach((e, i) => {
    if (e.kind !== 'move' || e.rapid || !tl[i + 1]) return;
    const d = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y, e.to.z - e.from.z);
    if (d > 1 && Math.abs(e.to.z - e.from.z) < 1e-6) cuts.push(Math.round(d / (tl[i + 1].t - e.t) * 60));
  });
  assert.ok(cuts.length >= 2, 'Finish’s cuts ran');
  for (const f of cuts) assert.ok(Math.abs(f - 1000) < 60, 'cut at ' + f + ' mm/min, not 1000');
  assert.ok(moves.length);
});

test('everything left out: refused', () => {
  assert.match(jobFor(['Pocket', 'Profile A', 'Profile B']).why, /nothing to run/);
});

test('a toolpath that starts partway along an arc can’t be run on its own', () => {
  const lines = ['G21 G90', ';Toolpath: One', 'M3 S10000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F100', 'G2 X10 Y0 I5 J0 F500', ';Toolpath: Two', 'X0 Y0 I-5 J0', 'G0 Z5', 'M5'];
  const M = C.parseGcode(lines.join('\n')); C.MODEL = M;
  const sum = C.jobSummary(M), sections = sum.list.map((r) => ({ from: r.from, to: r.to, name: r.name }));
  const p = C.JobSkip.plan({ lines: M.lines, sections, skip: [true, false], segs: M.segs, stateAt: C.stateAtLine, clean: C.cleanForSend });
  assert.match(p.why, /partway along an arc/);
});
