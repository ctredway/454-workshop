// The line Recover and Resume (after Pause & lift) carry on from (recovery-state.js recoverySnap), and the move put on
// it (recovery.js). It went back to the last line saying G0 to G3; Design writes G1 once and only coordinates after,
// so it went back to the start of the cut, or before it (Clint, 2026-10-23: Resume "skipped to the next tool path").
// Control's real files.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control(lines) {
  const C = vm.createContext({});
  vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
  vm.runInContext(read('../src/js/recovery-state.js'), C, { filename: 'recovery-state.js' });
  const first = {};                                        // lines that move: the parser's lineFirstSeg, for these
  lines.forEach((l, i) => { if (/[XYZ]/.test(C.splitGcodeComments(l).code)) first[i + 1] = i; });
  C.MODEL = { lines, lineFirstSeg: first };
  return C;
}
const FILE = ['G21', 'G90', ';Toolpath: Outline', 'M3 S12000', 'G0Z5', 'X10Y10', 'G1Z-1F400', 'X50F1500', 'Y30', '(a comment)', 'X10', 'Y10',
              ';Toolpath: Arc', 'G0Z5', 'G2X30Y10I10J0F800', 'X10Y10I-10J0', 'M5', 'M30'];

test('carries on from the line itself, though it only gives coordinates', () => {
  const C = control(FILE);
  assert.equal(C.recoverySnap(9), 9, 'Y30, cut in G1 from line 7');
  assert.equal(C.recoverySnap(12), 12);
  assert.equal(C.recoverySnap(10), 9, 'a line that doesn’t move: the one before it that does');
  assert.equal(C.recoverySnap(16), 16, 'an arc carried on from the line before');
  assert.equal(C.recoverySnap(2), null, 'nothing moves before it');
});
test('what it knows about the move there, to put on the line', () => {
  const C = control(FILE);
  assert.equal(C.stateAtLine(9).motion, 1);
  assert.equal(C.stateAtLine(16).motion, 2);
  assert.equal(C.lineHasMotionWord(9), false); assert.equal(C.lineHasMotionWord(7), true); assert.equal(C.lineHasMotionWord(15), true);
});

// where a job stopped (recovery.js recoveryNote): the nearest place to the machine on a line it could be on
function stopping() {
  const C = vm.createContext({});
  vm.runInContext(read('../src/js/recovery.js'), C, { filename: 'recovery.js' });
  // two passes along the same edge, 1 mm a line: lines 100-199 at 1.5 mm deep, then 200-299 at 3 mm
  const segs = [];
  for (let ln = 100; ln < 300; ln++) { const y = ln % 100, z = ln < 200 ? -1.5 : -3; segs.push({ line: ln, x0: 0, y0: y, z0: z, x1: 0, y1: y + 1, z1: z }); }
  C.MODEL = { segs, lines: [] };
  Object.assign(C, { logC: () => {}, jumpToLine: () => {}, document: { getElementById: () => null } });
  return C;
}
const items = (from, to) => { const l = []; for (let ln = from; ln < to; ln++) l.push({ ln }); return l; };
test('stopped on the second pass, between the depths: found on the second pass, not the first', () => {
  const C = stopping();
  // the controller has taken lines up to 252, and Control sent up to 260; the machine is over line 250's stretch
  C.JOB = { active: true, lastLn: 260, acked: 153, list: items(100, 300) };
  C.SERIAL = { wpos: { x: 0, y: 50.5, z: -2.2 } };
  C.recoveryNote('paused');
  assert.equal(C.JOB.stopInfo.line, 250);
});
test('carrying on after a Resume, still coming back down: the line it carries on from', () => {
  const C = stopping();
  C.JOB = { active: true, lastLn: 260, acked: 2, list: [{ ln: 0, syn: true }, { ln: 0, syn: true }].concat(items(250, 300)) };
  C.SERIAL = { wpos: { x: 0, y: 50, z: -2 } };
  C.recoveryNote('paused');
  assert.equal(C.JOB.stopInfo.line, 250);
});
