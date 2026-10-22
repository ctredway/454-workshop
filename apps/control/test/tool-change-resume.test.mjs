// Carrying on after a tool change in a job (jog-panel.js toolContinueNow): the BitSetter's measurement leaves the
// controller in millimetres (G21), relative then absolute, and at its slow touch's feed (F40), and the move back over
// the work is sent in millimetres too. The file then carries on as if nothing had changed: a file in inches that
// doesn't say G20 again after its tool change would run in millimetres, and a cut with no F of its own would run at
// F40 (Clint, 2026-10-22: "ran very very slowly"). Control's real code, run on the simulated GRBL machine.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GrblSim } from '../../../packages/grbl/dist/index.js';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

function rig(fileLines) {
  const sim = new GrblSim({ settings: { 22: 1 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 },
                            probe: { x: -100, y: -50, z: -60, radius: 3 } });
  const C = vm.createContext({});
  vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
  for (const f of ['recovery-state.js', 'probing.js', 'bitsetter.js', 'job-builder.js', 'jog-panel.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });
  const sent = [];
  const el = { hidden: true, style: {}, textContent: '', addEventListener() {}, focus() {} };
  Object.assign(C, {
    SERIAL: { connected: true, homedSeen: true, state: 'Idle', pins: '', unacked: 0, settings: { ...sim.settings }, axisSeen: {}, wco: { z: -60 } },
    PROFILE: { bitSetter: { enabled: true, x: -100, y: -50 }, run: { highStart: true }, spindle: { spinup: 1 } }, ZN: { val: 0 },
    document: { getElementById: () => el, querySelector: () => null },
    logC: () => {}, updateJobUI: () => {}, bzStatus: () => {}, bsRefNote: () => {}, travelZ: () => 5, topZ: () => 2,
    maybeToolPrompt: () => {}, uiNote: () => Promise.resolve(true),
    sendLine: (s) => { sent.push(s); sim.write(s + '\n'); },
    endingMoves: () => ({ cmds: [], zeroed: true, parked: null }),
  });
  const M = C.parseGcode(fileLines.join('\n')); C.MODEL = M;
  vm.runInContext('PROBE.refZ = -60; var JOB = {active: true, list: [], idx: 0, total: 0, useBS: true, toolWait: null};', C);
  let seen = 0;
  // the job's own lines go one at a time, as Control streams them; the probe's answers go to the probe
  C.jobFill = () => {
    const J = C.JOB;
    while (J.idx < J.total) {
      const it = J.list[J.idx++];
      if (it.m6) { J.toolWait = { line: it.ln, tool: it.tool, next: it.next }; return; }
      C.sendLine(it.text); pump(() => false, 600, true);
    }
  };
  function pump(until, secs, oneOk) {
    for (let t = 0; t < secs; t += 0.01) {
      sim.step(0.01);
      while (seen < sim.out.length) {
        const line = sim.out[seen++];
        const m = /^\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):(\d)\]/.exec(line);
        if (m) C.probeOnPRB(+m[3], m[4] === '1');
        else if (line === 'ok' && C.PROBE.active) C.probeNext();
        else if (line === 'ok' && oneOk) return;
        else if (/^error/.test(line)) throw new Error(line);
      }
      C.SERIAL.state = sim.state;
      if (until()) return;
    }
  }
  sim.write('$H\n'); pump(() => sim.homed && sim.state === 'Idle', 60);
  C.sendLine('G53 G0 X-400 Y-400 Z-60'); pump(() => false, 60, true); pump(() => sim.state === 'Idle', 60);
  C.sendLine('G10 L20 P1 X0 Y0 Z0'); pump(() => false, 5, true);
  const list = C.buildJobList(M.lines);
  vm.runInContext('JOB.list = ' + JSON.stringify(list) + '; JOB.total = JOB.list.length;', C);
  C.jobFill();                                     // up to the first tool change
  for (let n = 0; n < 10; n++) {                   // at each one: measured on the BitSetter, then on with the job
    pump(() => !C.PROBE.active && sim.state === 'Idle', 900);
    if (!C.JOB.toolWait) break;
    C.toolContinueNow();
  }
  pump(() => !C.PROBE.active && sim.state === 'Idle', 900);
  assert.ok(C.JOB.idx >= C.JOB.total, 'the whole job ran');
  return { sim, sent };
}
// the straight moves after the tool change, in the work's own units, with their feeds (mm/min)
function cutsAfterChange(sim) {
  const tl = sim.timeline, firstProbe = tl.findIndex((e) => e.kind === 'probe'), out = [];
  tl.forEach((e, i) => {
    if (i < firstProbe || e.kind !== 'move' || e.rapid || !tl[i + 1]) return;
    const a = sim.toWork(e.from, e.wco, e.tlo), b = sim.toWork(e.to, e.wco, e.tlo);
    const d = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y, e.to.z - e.from.z);
    if (d > 0.5) out.push({ to: [b.x, b.y, b.z].map((v) => Math.round(v * 100) / 100), feed: Math.round(d / (tl[i + 1].t - e.t) * 60) });
  });
  return out;
}

test('a file in inches, with no G20 after its tool change, carries on in inches', () => {
  const { sim } = rig(['G20 G90', 'M6 T1', 'M3 S18000', 'G0 Z0.2', 'G0 X1 Y1', 'G1 Z-0.1 F20', 'G1 X2 F40', 'G0 Z0.2',
                       'M5', 'M6 T2', 'M3 S18000', 'G0 X3 Y1', 'G1 Z-0.1 F20', 'G1 X4 F40', 'G0 Z0.2', 'M5', 'M30']);
  assert.deepEqual(sim.errors, []);
  const cuts = cutsAfterChange(sim), last = cuts[cuts.length - 1];
  assert.deepEqual(last.to, [101.6, 25.4, -2.54], 'X4 Y1 Z-0.1 inches, not millimetres');
  // Control's own lifts are millimetres below the top of travel (2 or 5 here), not inches (50.8 or 127)
  const lifts = sim.timeline.filter((e) => e.kind === 'move' && /^G53 G0 Z/.test(e.line));
  assert.ok(lifts.length >= 2);
  for (const e of lifts) assert.ok(e.to.z >= -5.01, e.line + ' went to machine Z ' + e.to.z.toFixed(1));
});

test('a cut with no F of its own after a tool change runs at the file’s feed, not the BitSetter’s', () => {
  const { sim } = rig(['G21 G90', 'M6 T1', 'M3 S18000', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-2 F1000', 'G1 X40', 'G0 Z5',
                       'M5', 'M6 T2', 'M3 S18000', 'G0 X60 Y10', 'G1 Z-2', 'G1 X90', 'G0 Z5', 'M5', 'M30']);
  assert.deepEqual(sim.errors, []);
  const cuts = cutsAfterChange(sim).filter((c) => c.to[2] === -2);
  assert.ok(cuts.length >= 2);
  for (const c of cuts) assert.ok(Math.abs(c.feed - 1000) < 60, 'cut at ' + c.feed + ' mm/min, not 1000');
});
