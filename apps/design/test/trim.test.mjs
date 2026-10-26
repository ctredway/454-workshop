// Trim (trim-extend.js): click the part of a shape to remove, up to where other shapes cross it. Every kind of
// shape that can be drawn can be trimmed, and every shape counts as a crossing, a group's shapes included.
// (Rectangles couldn't be trimmed, and groups didn't count as crossings: found by Clint, testing.)
// On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.VIEW.scale = 4;
D.run = (code) => vm.runInContext(code, D);
const plain = (v) => JSON.parse(JSON.stringify(v));
const ents = () => plain(D.DOC.ents);
function drawing(list) {
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1', ents: ${JSON.stringify(list)}};
    UNDO.length = 0; SEL = []; 1`);
}
const trim = (x, y) => D.doTrim({ x, y });
const near = (a, b) => Math.abs(a - b) < 1e-6;
// the points of an outline left after a trim, rounded
const pts = (e) => e.pts.map((q) => [+q[0].toFixed(4), +q[1].toFixed(4)]);

test('a line crossed by another: the piece clicked goes, the rest stays (as before)', () => {
  drawing([{ t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, { t: 'line', x1: 40, y1: -10, x2: 40, y2: 10 }, { t: 'line', x1: 70, y1: -10, x2: 70, y2: 10 }]);
  assert.equal(trim(55, 0), true);
  const lines = ents().filter((e) => e.y1 === 0 && e.y2 === 0).map((e) => [e.x1, e.x2]);
  assert.deepEqual(lines, [[0, 40], [70, 100]]);
});
test('a rectangle crossed by a line can be trimmed: the side clicked goes, up to the crossings', () => {
  // a 100 × 60 rectangle, and a line straight down through it at x = 30
  drawing([{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 80 }]);
  assert.equal(trim(0, 30), true, 'the left side');
  const out = ents(), left = out.filter((e) => e.t !== 'line');
  assert.equal(left.length, 1);
  assert.equal(left[0].t, 'poly');
  assert.equal(left[0].closed, false, 'an open outline now');
  // what's left runs from the crossing at the top, round the right-hand side, to the crossing at the bottom
  const p = pts(left[0]);
  assert.ok(p.some((q) => q[0] === 100 && q[1] === 0) && p.some((q) => q[0] === 100 && q[1] === 60), 'the right-hand corners are kept');
  assert.ok(!p.some((q) => q[0] === 0), 'nothing left of the line');
  const ends = [p[0], p[p.length - 1]].map(String).sort();
  assert.deepEqual(ends, ['30,0', '30,60'], 'it ends where the line crosses');
  assert.equal(out.filter((e) => e.t === 'line').length, 1, 'the line that crosses it is untouched');
});
test('two rectangles that overlap: a side of one is trimmed back to the other', () => {
  // the second's bottom edge crosses the first's right side at (60, 20); its left side crosses the first's top at (40, 40)
  drawing([{ t: 'rect', x: 0, y: 0, w: 60, h: 40 }, { t: 'rect', x: 40, y: 20, w: 60, h: 40 }]);
  assert.equal(trim(60, 30), true, 'the corner of the first that’s inside the second');
  const first = ents()[0], p = pts(first);
  assert.equal(first.t, 'poly');
  assert.deepEqual([String(p[0]), String(p[p.length - 1])].sort(), ['40,40', '60,20'], 'it ends at the two crossings');
  assert.ok(!p.some((q) => q[0] === 60 && q[1] === 40), 'the corner inside the second has gone');
  assert.ok(p.some((q) => q[0] === 0 && q[1] === 0) && p.some((q) => q[0] === 60 && q[1] === 0) && p.some((q) => q[0] === 0 && q[1] === 40), 'the other three corners stay');
  const second = ents()[1]; delete second._id; delete second.layer;       // (given to every shape when a step is recorded)
  assert.deepEqual(second, { t: 'rect', x: 40, y: 20, w: 60, h: 40 }, 'the second is untouched');
});
test('a closed outline trimmed across its start: the piece clicked goes, not the rest', () => {
  // a closed square outline starting at (0,0), and a line through it at x = 30; the left side runs past the start
  drawing([{ t: 'poly', closed: true, pts: [[0, 0], [100, 0], [100, 60], [0, 60]] }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 80 }]);
  assert.equal(trim(0, 30), true);
  const p = pts(ents()[0]);
  assert.ok(!p.some((q) => q[0] === 0), 'nothing left of the line');
  assert.ok(p.some((q) => q[0] === 100 && q[1] === 0) && p.some((q) => q[0] === 100 && q[1] === 60), 'the right-hand side stays');
});
test('a closed outline only touched once is left alone', () => {
  drawing([{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 30 }]);
  assert.equal(trim(0, 30), false);
  assert.deepEqual(ents()[0], { t: 'rect', x: 0, y: 0, w: 100, h: 60 });
});
test('a rectangle with nothing crossing it is left alone, and Trim says nothing crosses there', () => {
  drawing([{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }]);
  assert.equal(trim(0, 30), false);
  assert.deepEqual(ents(), [{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }], 'never deleted for want of a crossing');
});
test('a circle crossed by a line twice: the arc clicked goes (as before)', () => {
  drawing([{ t: 'circle', cx: 0, cy: 0, r: 20 }, { t: 'line', x1: 10, y1: -30, x2: 10, y2: 30 }]);
  assert.equal(trim(20, 0), true);
  const arc = ents().find((e) => e.t === 'arc');
  assert.ok(arc, 'an arc is left');
  assert.ok(near(Math.hypot(arc.cx, arc.cy), 0) && near(arc.r, 20));
});
test('a group’s shapes count as crossings: a line crossing a group can be trimmed', () => {
  drawing([{ t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
           { t: 'group', ents: [{ t: 'line', x1: 40, y1: -10, x2: 40, y2: 10 }, { t: 'circle', cx: 70, cy: 0, r: 5 }] }]);
  assert.equal(trim(20, 0), true, 'up to the group’s line');
  const line = ents().filter((e) => e.t === 'line');
  assert.deepEqual(line.map((e) => [e.x1, e.x2]), [[40, 100]]);
  assert.equal(trim(55, 0), true, 'between the group’s line and its circle');
  const xs = ents().filter((e) => e.t === 'line').map((e) => +e.x1.toFixed(6));
  assert.deepEqual(xs, [65], 'what’s left starts at the circle');
});
test('a rectangle crossed by a group can be trimmed', () => {
  drawing([{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'group', ents: [{ t: 'line', x1: 30, y1: -20, x2: 30, y2: 80 }] }]);
  assert.equal(trim(0, 30), true);
  assert.equal(ents().filter((e) => e.t === 'poly').length, 1);
});
test('a line can be extended to a group’s edge too', () => {
  drawing([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'group', ents: [{ t: 'line', x1: 50, y1: -10, x2: 50, y2: 10 }] }]);
  assert.equal(D.doExtend({ x: 9, y: 0 }), true);
  assert.equal(ents()[0].x2, 50);
});
test('clicking a group with Trim says to ungroup it first, and changes nothing', () => {
  drawing([{ t: 'group', ents: [{ t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, { t: 'line', x1: 40, y1: -10, x2: 40, y2: 10 }] }]);
  const before = JSON.stringify(ents());
  D.run(`setTool('trim'); 1`);
  D.toolClick({ x: 20, y: 0 }, { x: 20, y: 0 });
  assert.equal(JSON.stringify(ents()), before);
  assert.match(D.document.body.textContent, /Ungroup it first/);
  D.run(`setTool('select'); 1`);
});
test('the hover preview agrees: a rectangle shows what Trim would take', () => {
  drawing([{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 80 }]);
  D.run(`setTool('trim'); 1`);
  const h = plain(D.hoverTrim({ x: 0, y: 30 }) || null);
  assert.ok(h && h.action === 'do', JSON.stringify(h));
  assert.deepEqual(ents(), [{ t: 'rect', x: 0, y: 0, w: 100, h: 60 }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 80 }], 'the preview changes nothing');
  D.run(`setTool('select'); 1`);
});

// ---- Extend on the open end of a polyline or outline (trim-extend.js extendOutlineEnd). Clint, 2026-10-26: "if
// vectors are joined the end of one cannot be extended" ----
const ext = (x, y) => D.doExtend({ x, y });
test('Extend: a joined polyline’s end runs out to the next shape, along its last segment', () => {
  // an L joined from two lines: (0,0) to (40,0) to (40,30); a wall at y = 50
  drawing([{ t: 'poly', closed: false, pts: [[0, 0], [40, 0], [40, 30]], layer: 'L1' }, { t: 'line', x1: 0, y1: 50, x2: 100, y2: 50, layer: 'L1' }]);
  assert.equal(ext(40, 29), true);
  assert.deepEqual(pts(ents()[0]), [[0, 0], [40, 0], [40, 50]], 'up to the wall');
  assert.equal(D.run('UNDO.length'), 1, 'one step');
});
test('Extend: the other end, nearer the click; and nothing ahead, nothing done', () => {
  drawing([{ t: 'poly', closed: false, pts: [[10, 0], [40, 0], [40, 30]], layer: 'L1' }, { t: 'line', x1: -20, y1: -10, x2: -20, y2: 10, layer: 'L1' }]);
  assert.equal(ext(11, 0), true);
  assert.deepEqual(pts(ents()[0])[0], [-20, 0], 'the start, out to the line on the left');
  assert.equal(ext(40, 29), false, 'the top end: nothing above it');
});
test('Extend: an end runs into another part of its own outline', () => {
  // a hook: its end, going left at y = 20, meets its own upright at x = 0
  drawing([{ t: 'poly', closed: false, pts: [[0, 0], [0, 40], [30, 40], [30, 20], [20, 20]], layer: 'L1' }]);
  assert.equal(ext(21, 20), true);
  assert.deepEqual(pts(ents()[0])[4], [0, 20]);
});
test('Extend: a curved end goes on round its circle, the same circle', () => {
  // a quarter circle of radius 20 round (0,0), from (20,0) to (0,20), ending an outline from (20,-30); a wall at x = -15
  const b = Math.tan(Math.PI / 8);                                            // a quarter turn, counter-clockwise
  drawing([{ t: 'path', closed: false, pts: [[20, -30, 0], [20, 0, b], [0, 20, 0]], layer: 'L1' }, { t: 'line', x1: -15, y1: -40, x2: -15, y2: 40, layer: 'L1' }]);
  assert.equal(ext(1, 20), true);
  const e = ents()[0], end = e.pts[2];
  assert.ok(near(Math.hypot(end[0], end[1]), 20), 'still on the circle');
  assert.ok(near(end[0], -15), 'at the wall');
  const sweep = 4 * Math.atan(e.pts[1][2]);
  assert.ok(near(sweep, Math.PI / 2 + Math.acos(-15 / 20) - Math.PI / 2), 'the arc now sweeps that much further');
});
test('a closed outline has no end to extend', () => {
  drawing([{ t: 'poly', closed: true, pts: [[0, 0], [40, 0], [40, 30]], layer: 'L1' }, { t: 'line', x1: 0, y1: 50, x2: 100, y2: 50, layer: 'L1' }]);
  assert.equal(ext(40, 29), false);
});
