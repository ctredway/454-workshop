// A pocket with a wide stepover leaves nothing standing down the middle of a channel: cam.js's pocket(), on the real
// sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// With a stepover over half the cutter, the rings from two sides of a channel could fail to meet, leaving a strip.
// Checked by cutting in wood (Preview in wood's simulation): the same pocket with a 40% stepover, which can't leave
// one, must come out the same, cell for cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
const DIA = 6, DEEP = 3;
const pocket = (outline, islands, pct, o = {}) => D.Cam.pocket(Object.assign({ outline, islands, toolDia: DIA, stepover: DIA * pct / 100, depth: DEEP, passDepth: o.pass || DEEP,
  z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: o.ramp || 0 } }, o.more || {}));
function wood(outline, moves) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const box = { x0: Math.min(...xs) - 1, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, top: 0, bottom: -10 };
  return D.woodSim([{ moves, tool: { kind: 'flat', r: DIA / 2 } }], box, 0.1);
}
// cells one pocket cut to depth and the other didn't, each way
function differ(a, b) {
  let left = 0, extra = 0;
  for (let i = 0; i < a.z.length; i++) { const da = a.z[i] < -DEEP + 0.01, db = b.z[i] < -DEEP + 0.01; if (db && !da) left++; if (da && !db) extra++; }
  return { left, extra };
}
// two 28 mm squares joined by a channel `w` wide and 24 mm long
const dumbbell = (w) => [[0, 0], [28, 0], [28, 14 - w / 2], [52, 14 - w / 2], [52, 0], [80, 0], [80, 28], [52, 28], [52, 14 + w / 2], [28, 14 + w / 2], [28, 28], [0, 28]];
const circle = (cx, cy, r, n = 64) => Array.from({ length: n }, (_, k) => { const a = -k / n * 2 * Math.PI; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

test('a channel 12.6 mm wide, a 6 mm cutter at 60%: the rings from each side are 6.58 mm apart, and the strip between them is cut', () => {
  // each side's ring is 3.01 mm in; the next would be 6.61 mm in, past the middle (6.3 mm), so there isn't one
  const shape = dumbbell(12.6), p = pocket(shape, [], 60), ref = pocket(shape, [], 40);
  const d = differ(wood(shape, p.moves), wood(shape, ref.moves));
  assert.equal(d.left, 0, 'nothing left standing that a 40% stepover clears (a strip here was about 0.6 x 24 mm: 1,400 cells)');
  assert.equal(d.extra, 0, 'and nothing cut that it doesn’t');
});
for (const pct of [60, 95]) {
  test('channels of every width, a wedge and an island, at a ' + pct + '% stepover: the same wood cut as at 40%', () => {
    const shapes = [];
    for (let w = 11.9; w < 18.2; w += 0.9) shapes.push([dumbbell(+w.toFixed(2)), []]);
    shapes.push([[[0, 0], [70, 0], [70, 26], [0, 8]], []]);                                   // a wedge: every width from 8 to 26 mm
    shapes.push([[[0, 0], [60, 0], [60, 44], [0, 44]], [circle(24, 21, 8), circle(45, 26, 4)]]);  // channels round and between islands
    let cells = 0;
    for (const [outline, islands] of shapes) {
      const p = pocket(outline, islands, pct), ref = pocket(outline, islands, 40), a = wood(outline, p.moves), d = differ(a, wood(outline, ref.moves));
      assert.equal(d.left, 0, 'left standing in shape ' + shapes.findIndex((s) => s[0] === outline));
      assert.equal(d.extra, 0);
      assert.equal(a.rapidsIn, 0, 'no rapid move goes into wood');
      cells += a.z.length;
    }
    assert.ok(cells > 4e5, String(cells));
  });
}
test('in passes, with a ramp: the middle is cut at every pass, no deeper than that pass, and ramped into', () => {
  const shape = dumbbell(12.6), p = pocket(shape, [], 60, { pass: 1, ramp: 6 }), ref = pocket(shape, [], 40, { pass: 1, ramp: 6 });
  const a = wood(shape, p.moves), d = differ(a, wood(shape, ref.moves));
  assert.equal(d.left, 0); assert.equal(d.extra, 0); assert.equal(a.rapidsIn, 0);
  // nothing goes below a pass's depth before that pass: the lowest point so far never drops more than 1 mm at once
  let z = 5, low = 0;
  for (const m of plain(p.moves)) { if (m.z !== undefined) z = m.z; if (m.g === 1 && z < low - 1 - 1e-6) assert.fail('a move to ' + z + ' when nothing was below ' + low); if (m.g === 1 && z < low) low = z; }
  assert.ok(Math.abs(low + DEEP) < 1e-9);
});
test('a stepover of half the cutter or less can’t leave a strip, and nothing is added for it', () => {
  // (that these pockets are, move for move, what they were is proven old against new, outside these tests)
  const shape = dumbbell(12.6);
  for (const pct of [30, 40, 50]) assert.equal(pocket(shape, [], pct).middles, 0, pct + '%');
  assert.ok(pocket(shape, [], 60).middles > 0);
  assert.equal(pocket(shape, [], 60, { more: { strategy: 'raster' } }).middles, 0, 'nor for raster clearing, whose lines are never further apart than the cutter');
  assert.equal(pocket(shape, [], 60, { more: { rest: { toolDia: 12, level: 6.01 } } }).middles, 0, 'nor for a clean-up, which goes only where the larger cutter couldn’t');
});
