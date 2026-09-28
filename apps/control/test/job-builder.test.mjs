// The job builder's rules, one test each (apps/control/src/js/job-builder.js): what 454 Control adds to a
// file to make it safe to run. Plain Node, no browser:  node --test apps/control/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JobBuilder = require('../src/js/job-builder.js');

// ---- a small machine to build for ----
// the job's moves, as Control's parser gives them: straight G0/G1 moves in absolute mm, with line numbers
function movesOf(text) {
  const segs = []; let x = 0, y = 0, z = 0;
  text.split('\n').forEach((raw, i) => {
    const l = raw.replace(/\(.*?\)|;.*$/g, '');
    if (!/G0*[01](?![\d.])/i.test(l) && !/^[\s]*[XYZ]/i.test(l)) return;
    const v = (a) => { const m = new RegExp(a + '\\s*(-?[\\d.]+)', 'i').exec(l); return m ? parseFloat(m[1]) : null; };
    const nx = v('X') ?? x, ny = v('Y') ?? y, nz = v('Z') ?? z;
    if (nx !== x || ny !== y || nz !== z) segs.push({ line: i + 1, x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz });
    x = nx; y = ny; z = nz;
  });
  return segs;
}
// the moves off the part at the end: back to XY zero if not there, then park at the back centre
function endingMoves(at) {
  const cmds = []; let zeroed = 'already';
  if (!at || Math.hypot(at.x, at.y) > 0.02) { cmds.push('G90 G0 X0 Y0'); zeroed = true; }
  cmds.push('G53 G0 X-419.000 Y-10.000');
  return { cmds, zeroed, parked: { x: -419, y: -10 } };
}
const clean = (l) => l.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
// build a job: a homed Shapeoko, work zero 60 mm below the top of Z, traverse 5 mm and tool changes
// 2 mm below the top, "Start & stop high" on, 10 s spin-up; any of it can be changed per test
function build(text, over = {}) {
  const m = Object.assign({ homed: true, wcoZ: -60, stopHigh: true, spinup: 10, zMax: 0, travelZ: 5, topZ: 2, clean, endingMoves, segs: movesOf(text) }, over);
  return JobBuilder.build(text.split('\n'), m);
}
const texts = (list) => list.map((it) => it.m6 ? 'M6 T' + it.tool : it.text);
const added = (list) => list.filter((it) => it.syn).map((it) => it.text);
const job = (...lines) => ['G21 G90', ...lines].join('\n');

// ---- spin-up ----
test('a spin-up wait follows every spindle start', () => {
  const L = build(job('M3 S18000', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'M5', 'M30'));
  assert.deepEqual(texts(L).slice(1, 3), ['M3 S18000', 'G4 P10']);
  assert.equal(L.injected, 1);
});
test('a reverse (M4) spindle start gets the spin-up wait too', () => {
  const L = build(job('M4 S12000', 'G0 X0 Y0 Z5', 'G1 Z-1 F300', 'M5', 'M30'), { spinup: 7 });
  assert.deepEqual(texts(L).slice(1, 3), ['M4 S12000', 'G4 P7']);
  assert.equal(L.injected, 1);
});
test('no spin-up wait when it\u2019s set to 0', () => {
  const L = build(job('M3 S18000', 'G0 Z5', 'M5', 'M30'), { spinup: 0 });
  assert.ok(!texts(L).some((t) => /^G4/.test(t)));
});
test('the file\u2019s own wait counts only if it\u2019s at least as long', () => {
  const token = build(job('M3 S16000', 'G4 P1', 'G0 Z5', 'M5', 'M30'));
  assert.deepEqual(texts(token).slice(1, 4), ['M3 S16000', 'G4 P10', 'G4 P1'], 'a token 1 s wait doesn\u2019t replace ours');
  const long = build(job('M3 S16000', 'G4 P20', 'G0 Z5', 'M5', 'M30'));
  assert.deepEqual(texts(long).slice(1, 3), ['M3 S16000', 'G4 P20'], 'a 20 s wait is long enough');
  assert.equal(long.injected, 0);
});

// ---- lifting before a spindle stop ----
test('the tool lifts to traverse height before the spindle stops', () => {
  const L = build(job('M3 S12000', 'G0 X0 Y0 Z5', 'G1 Z-3 F200', 'G1 X10', 'M5', 'M30'));
  const i = texts(L).indexOf('M5');
  assert.equal(texts(L)[i - 1], 'G53 G0 Z-5.0', 'machine Z 5 mm below the top of travel');
});
test('a lift never moves the tool down', () => {
  // Thick stock: work zero only 10 mm below the top of travel. The tool stops at work Z6 (machine Z-4),
  // below the file's highest point (Z8), but already above traverse height (machine Z-5): "lifting" to
  // traverse height would drive it 1 mm down.
  const L = build(job('M3 S12000', 'G0 X0 Y0 Z8', 'G1 Z-1 F200', 'G0 Z6', 'M5', 'M30'), { wcoZ: -10 });
  const i = texts(L).indexOf('M5');
  assert.equal(texts(L)[i - 1], 'G0 Z6', 'no lift added: it would have gone down');
});
test('with the work offset unknown, or the machine not homed, the lift is relative: up only', () => {
  for (const over of [{ wcoZ: null }, { homed: false }]) {
    const L = build(job('M3 S12000', 'G0 X0 Y0 Z5', 'G1 Z-3 F200', 'M5', 'M30'), over);
    const i = texts(L).indexOf('M5');
    assert.deepEqual(texts(L).slice(i - 2, i), ['G91 G0 Z5.0', 'G90'], JSON.stringify(over));
  }
});
test('with "Start & stop high" off, a spindle still never stops in the material', () => {
  const clear = build(job('M3 S12000', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G0 Z5', 'M5', 'M30'), { stopHigh: false });
  assert.equal(texts(clear)[texts(clear).indexOf('M5') - 1], 'G0 Z5', 'clear of the material: no lift');
  const buried = build(job('M3 S12000', 'G0 X0 Y0 Z5', 'G1 Z-3', 'M5', 'M30'), { stopHigh: false });
  assert.equal(texts(buried)[texts(buried).indexOf('M5') - 1], 'G53 G0 Z-5.0', 'in the material: lifts anyway');
});
test('no lift when the tool is already at the file\u2019s own safe height', () => {
  const L = build(job('M3 S12000', 'G0 X0 Y0 Z8', 'G1 Z-2', 'G0 Z8', 'M5', 'M30'));
  assert.equal(texts(L)[texts(L).indexOf('M5') - 1], 'G0 Z8');
});

// ---- tool changes ----
test('a tool change lifts to near the top, stops the spindle, then marks the change', () => {
  const L = build(job('M3 S18000', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G0 Z5', 'T2 M6', 'M3 S16000', 'G0 X20 Y5', 'G1 Z-1', 'M5', 'M30'));
  const i = L.findIndex((it) => it.m6);
  assert.deepEqual(texts(L).slice(i - 2, i + 1), ['G53 G0 Z-2.0', 'M5', 'M6 T2']);
  assert.deepEqual(L[i].next, { x: 20, y: 5 }, 'where the file goes next, for the tool-change prompt');
});
test('no second M5 when the file stopped the spindle itself', () => {
  const L = build(job('M3 S18000', 'G0 Z5', 'M5', 'T2 M6', 'M3 S16000', 'G0 X5', 'M5', 'M30'));
  const i = L.findIndex((it) => it.m6);
  assert.equal(texts(L).slice(0, i).filter((t) => t === 'M5').length, 1);
});
test('after a change, the spindle restarts if the file assumes it\u2019s still running', () => {
  const L = build(job('T1 M6', 'M3 S18000', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G0 Z5', 'T2 M6', 'G0 X20 Y0', 'G1 Z-1', 'M30'));
  const i = L.findIndex((it) => it.m6 && it.tool === '2');
  assert.deepEqual(texts(L).slice(i + 1, i + 3), ['M3 S18000', 'G4 P10'], 'at the file\u2019s speed, with the spin-up wait, before any move');
});
test('...but not when the file starts it again itself', () => {
  const L = build(job('M3 S18000', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G0 Z5', 'T2 M6', 'M3 S16000', 'G0 X20 Y0', 'M30'));
  const i = L.findIndex((it) => it.m6);
  assert.equal(texts(L)[i + 1], 'M3 S16000');
});
test('a reverse (M4) spindle is restarted as M4', () => {
  const L = build(job('M4 S12000', 'G0 X0 Y0 Z5', 'G1 Z-1', 'G0 Z5', 'T2 M6', 'G0 X20 Y0', 'M30'));
  const i = L.findIndex((it) => it.m6);
  assert.equal(texts(L)[i + 1], 'M4 S12000');
});

// ---- the end of a job ----
test('the end: lift high, stop the spindle, back to XY zero, park, and the file\u2019s M30 last', () => {
  const L = build(job('M3 S18000', 'G0 X10 Y10 Z5', 'G1 Z-1', 'G1 X30', 'G0 Z5', 'M30'));
  assert.deepEqual(texts(L).slice(-5), ['G53 G0 Z-2.0', 'M5', 'G90 G0 X0 Y0', 'G53 G0 X-419.000 Y-10.000', 'M30']);
  assert.equal(L.zeroed, true);
  assert.deepEqual(L.parked, { x: -419, y: -10 });
});
test('a job that ends at XY zero doesn\u2019t move there again', () => {
  const L = build(job('M3 S18000', 'G0 X10 Y10 Z5', 'G1 Z-1', 'G1 X0 Y0', 'G0 Z5', 'M5', 'M30'));
  assert.ok(!texts(L).includes('G90 G0 X0 Y0'));
  assert.equal(L.zeroed, 'already');
});
test('M2 is kept last too; with neither, the ending moves close the job', () => {
  assert.equal(texts(build(job('M3 S18000', 'G0 X5 Y5 Z5', 'M5', 'M2'))).at(-1), 'M2');
  assert.equal(texts(build(job('M3 S18000', 'G0 X5 Y5 Z5', 'M5'))).at(-1), 'G53 G0 X-419.000 Y-10.000');
});
test('the end, not homed: lift relative, then back to XY zero, with no parking (machine coordinates mean nothing)', () => {
  const L = build(job('M3 S18000', 'G0 X10 Y10 Z5', 'G1 Z-1', 'G0 Z5', 'M5', 'M30'), { homed: false });
  assert.deepEqual(texts(L).slice(-4), ['G91 G0 Z5.0', 'G90', 'G90 G0 X0 Y0', 'M30']);
  assert.equal(L.parked, null);
});

// ---- the file itself ----
test('the file\u2019s own lines go through in order, cleaned, with their line numbers', () => {
  const L = build(['%', '(header)', 'G21 G90 ; units', '', 'M3 S18000 (spin)', 'G0 Z5', 'M5', '%', 'M30'].join('\n'), { spinup: 0 });
  const own = L.filter((it) => !it.syn);
  assert.deepEqual(own.map((it) => [it.ln, it.text]), [[3, 'G21 G90'], [5, 'M3 S18000'], [6, 'G0 Z5'], [7, 'M5'], [9, 'M30']]);
});
test('everything added is marked as added, so progress still follows the file\u2019s lines', () => {
  const L = build(job('T1 M6', 'M3 S18000', 'G0 X5 Y5 Z5', 'G1 Z-1', 'M5', 'M30'));
  for (const it of L) if (!it.m6) assert.ok(it.syn || !/^(G53|G91|G4 P10)/.test(it.text), 'unmarked: ' + it.text);
  assert.ok(L.every((it) => Number.isInteger(it.ln)));
});
