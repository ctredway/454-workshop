// The G-code parser's behaviour (packages/gcode/src/parser.cjs, shared by 454 Control and @454/gcode).
// Real job files are pinned move by move in packages/gcode/test/golden.test.ts; these cover what those
// files don't: units, modes, arcs, every kind of problem the parser reports, and reading CAM comments.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseGcode, splitGcodeComments, cleanForSend } = require('../../../packages/gcode/src/parser.cjs');

const parse = (...lines) => parseGcode(lines.join('\n'));
const end = (r) => { const s = r.segs.at(-1); return [s.x1, s.y1, s.z1].map((v) => +v.toFixed(4)); };
const issues = (r, sev) => r.issues.filter((i) => !sev || i.sev === sev).map((i) => i.msg);
const has = (r, sev, re) => r.issues.some((i) => i.sev === sev && re.test(i.msg));

// ---- positions ----
test('inches are converted to millimetres, and remembered for display', () => {
  const r = parse('G20 G90', 'M3 S18000', 'G0 X1 Y2 Z0.5', 'G1 Z-0.1 F10', 'M5');
  assert.deepEqual(end(r), [25.4, 50.8, -2.54]);
  assert.equal(r.segs[0].units, 'in');
});
test('relative moves (G91) add up', () => {
  const r = parse('G21 G91', 'M3', 'G0 X10 Y5', 'G0 X10', 'G1 Z-2 F100', 'M5');
  assert.deepEqual(end(r), [20, 5, -2]);
});
test('a move\u2019s line number is kept, for the Code tab and progress', () => {
  const r = parse('G21 G90', 'M3', 'G0 X0 Y0 Z5', '', '(comment)', 'G1 Z-1 F100');
  assert.deepEqual(r.segs.map((s) => s.line), [3, 6]);
});

// ---- arcs ----
test('an arc stays on its circle and ends where it says (G3, I/J)', () => {
  const r = parse('G21 G90', 'M3', 'G0 X10 Y0 Z0', 'G3 X0 Y10 I-10 J0 F500');
  for (const s of r.segs.slice(1)) assert.ok(Math.abs(Math.hypot(s.x1, s.y1) - 10) < 1e-9);
  assert.deepEqual(end(r), [0, 10, 0]);
});
test('clockwise and anticlockwise go opposite ways round', () => {
  const ccw = parse('G21 G90', 'M3', 'G0 X10 Y0 Z0', 'G3 X0 Y10 I-10 J0 F500');
  const cw = parse('G21 G90', 'M3', 'G0 X10 Y0 Z0', 'G2 X0 Y10 I-10 J0 F500');
  assert.ok(Math.abs(ccw.cutDist - Math.PI * 5) < 0.05, 'a quarter circle');
  assert.ok(Math.abs(cw.cutDist - Math.PI * 15) < 0.05, 'three quarters');
});
test('an arc back to its start with I/J is a full circle', () => {
  const r = parse('G21 G90', 'M3', 'G0 X10 Y0 Z0', 'G2 X10 Y0 I-10 J0 F500');
  assert.ok(Math.abs(r.cutDist - 2 * Math.PI * 10) < 0.05);
});
test('arc problems GRBL would reject are flagged', () => {
  assert.ok(has(parse('G21 G90', 'M3', 'G0 X0 Y0 Z0', 'G2 X30 Y0 R10 F500'), 'err', /radius too small/));
  assert.ok(has(parse('G21 G90', 'M3', 'G0 X10 Y0 Z0', 'G3 X0 Y12 I-10 J0 F500'), 'warn', /radii differ by 2\.000 mm/));
  assert.ok(has(parse('G21 G90', 'M3', 'G0 X0 Y0 Z0', 'G2 X10 Y0 F500'), 'err', /no I\/J\/K offsets and no R/));
});

// ---- problems in the file ----
test('a feed move with no feed rate is an error; cutting before the spindle starts is a warning', () => {
  assert.ok(has(parse('G21 G90', 'M3', 'G0 X0 Y0 Z0', 'G1 X10'), 'err', /no feed rate/));
  assert.ok(has(parse('G21 G90', 'G0 X0 Y0 Z0', 'G1 X10 F100'), 'warn', /before the spindle is started/));
  assert.ok(!has(parse('G21', 'G90', 'M3S20000', 'G0Z5', 'G1Z-1F200'), 'warn', /before the spindle/), 'M3S20000, no spaces');
});
test('axis words before any motion mode are an error', () => {
  const r = parse('G21 G90', 'X10 Y10');
  assert.ok(has(r, 'err', /no motion mode active/));
  assert.equal(r.segs.length, 0);
});
test('a file without G20 or G21 is warned about', () => {
  assert.ok(has(parse('G90', 'M3', 'G0 X0 Y0', 'G1 X5 F100', 'M5'), 'warn', /No G20\/G21/));
  assert.ok(!has(parse('G21 G90', 'M3', 'G0 X0 Y0', 'G1 X5 F100', 'M5'), 'warn', /No G20\/G21/));
});
test('what GRBL or Carbide Motion can\u2019t run is an error; what they ignore is noted', () => {
  const r = parse('G21 G90', 'M3', 'G81 X0 Y0 Z-5 R2 F100', 'G41 D1', 'M99', 'M5');
  assert.ok(has(r, 'err', /G81 canned cycle/));
  assert.ok(has(r, 'err', /G41 cutter compensation/));
  assert.ok(has(r, 'err', /M99 is not supported/));
  const n = parse('G21 G90', 'M7', 'M8', 'M4', 'G54');
  assert.ok(has(n, 'info', /^M7: mist coolant/));
  assert.ok(has(n, 'warn', /M8 flood coolant/));
  assert.ok(has(n, 'warn', /M4 \(reverse/));
  assert.ok(has(n, 'info', /^G54: work coordinate system/));
});
test('each message names its code once ("G40: cutter compensation off", not "G40: G40 ...")', () => {
  for (const m of issues(parse('G21 G90', 'G40', 'G43 H1', 'G49', 'M7', 'M9')))
    assert.ok(!/^([GM]\d+): \1\b/.test(m), m);
});
test('G28 and G53 moves aren\u2019t drawn: where they go depends on the machine', () => {
  const r = parse('G21 G90', 'M3', 'G0 X5 Y5 Z5', 'G28', 'G53 G0 Z0', 'M5');
  assert.ok(has(r, 'info', /G28 moves to a machine-defined position/));
  assert.ok(has(r, 'info', /G53 uses machine coordinates/));
  assert.deepEqual(end(r), [5, 5, 5]);
});
test('words GRBL doesn\u2019t know, and stray text, are warned about', () => {
  const r = parse('G21 G90', 'Q5', 'hello world');
  assert.ok(has(r, 'warn', /Word "Q5" is not part of the GRBL dialect/));
  assert.ok(has(r, 'warn', /Unrecognised text on line: "hello world"/));
});
test('a repeated problem is listed once, with how many times it happens', () => {
  const r = parse('G21 G90', 'M3', 'G81 X1', 'G81 X2', 'G81 X3', 'M5');
  const m = issues(r, 'err').filter((x) => /G81/.test(x));
  assert.equal(m.length, 1);
  assert.match(m[0], /\u00d73 occurrences/);
});

// ---- tools, toolpaths and comments ----
test('VCarve\u2019s comments name the tools and the toolpaths', () => {
  const r = parse('(Tools used in this file: )', '(1 = End Mill {6 mm})', '(2 = V-Bit {60 deg})', '(Toolpath:- Pocket 1)', '(End Mill {6 mm})',
                  'G21 G90', 'T1 M6', 'M3 S18000', 'G0 X0 Y0 Z5', 'G1 Z-1 F200', '(Toolpath:- V-Carve)', 'T2 M6', 'M3 S16000', 'G1 X5 F300', 'M5');
  assert.deepEqual(r.tools, [{ line: 7, tool: 1 }, { line: 12, tool: 2 }]);
  assert.deepEqual(r.toolInfo[1], { desc: 'End Mill {6 mm}', dia: 6 });
  assert.deepEqual(r.sections.map((s) => s.name), ['Pocket 1', 'V-Carve']);
  assert.equal(r.sections[0].tool, 'End Mill {6 mm}');
  assert.deepEqual([r.sMin, r.sMax], [16000, 18000]);
  assert.ok(has(r, 'info', /M6 tool change to T2 \(V-Bit \{60 deg\}\)/));
});
test('comments can nest, and a ; ends the line', () => {
  assert.deepEqual(splitGcodeComments('G1 X5 (Tool: End Mill (2.5 mm)) Y3 ; trailing'), { code: 'G1 X5   Y3', comments: ['Tool: End Mill (2.5 mm)', ' trailing'] });
  assert.equal(cleanForSend('G1 X1 (Tool: End Mill (2 mm)) Y2').replace(/\s+/g, ' '), 'G1 X1 Y2');
  assert.deepEqual(splitGcodeComments('G0 X1 (unclosed'), { code: 'G0 X1', comments: ['unclosed'] });
});

// ---- time ----
test('the plain time estimate: moves at their feed rate, plus dwells', () => {
  const r = parse('G21 G90', 'M3', 'G0 X0 Y0 Z0', 'G1 X100 F600', 'G4 P2', 'G1 Y100', 'M5');
  assert.ok(Math.abs(r.totalTime - 22) < 1e-9, '200 mm at 600 mm/min is 20 s, and a 2 s dwell');
});
