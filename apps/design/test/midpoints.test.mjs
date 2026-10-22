// The middle of a side is a snap point, marked "Midpoint" (Clint, 2026-10-22): lines, rectangles' sides, polylines'
// and outlines' segments (the middle of the curve for a curved one) and arcs. Design's real sources, in Node.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const C = loadDesign();
const D = { run: (js) => vm.runInContext(js, C) };
const mids = (ent) => JSON.parse(D.run(`JSON.stringify(snapMids(${JSON.stringify(ent)}).map(function(p){ return [+p.x.toFixed(6), +p.y.toFixed(6)]; }))`));
const near = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-6 && Math.abs(p[1] - b[i][1]) < 1e-6);

test('a line, a rectangle and a polyline: the middle of each side', () => {
  assert.deepEqual(mids({ t: 'line', x1: 0, y1: 0, x2: 10, y2: 4 }), [[5, 2]]);
  assert.deepEqual(mids({ t: 'rect', x: 0, y: 0, w: 20, h: 10 }), [[10, 0], [20, 5], [10, 10], [0, 5]]);
  assert.deepEqual(mids({ t: 'poly', pts: [[0, 0], [10, 0], [10, 6]] }), [[5, 0], [10, 3]], 'open: no closing side');
  assert.deepEqual(mids({ t: 'poly', pts: [[0, 0], [10, 0], [10, 6]], closed: true }), [[5, 0], [10, 3], [5, 3]], 'closed: the closing side too');
});

test('a curved side of an outline: its middle is on the curve, as drawn', () => {
  for (const b of [1, -1, 0.4, -2.5]) {
    const e = { t: 'path', pts: [[0, 0, b], [10, 0]], closed: false };
    const [m] = mids(e);
    // the drawn curve, fine: its point halfway along must be the midpoint
    const tess = JSON.parse(D.run(`JSON.stringify(tessPath(${JSON.stringify(e)}, 0.001))`));
    let len = 0; const L = [0];
    for (let i = 1; i < tess.length; i++) L.push(len += Math.hypot(tess[i][0] - tess[i - 1][0], tess[i][1] - tess[i - 1][1]));
    let i = L.findIndex((v) => v >= len / 2);
    const want = tess[i];
    assert.ok(Math.hypot(m[0] - want[0], m[1] - want[1]) < 0.01, `bulge ${b}: ${m} vs ${want}`);
  }
  assert.deepEqual(mids({ t: 'path', pts: [[0, 0], [10, 0], [10, 10]], closed: true }), [[5, 0], [10, 5], [5, 5]], 'straight sides');
});

test('an arc: the middle of the arc, not its centre', () => {
  // a quarter circle from 0 to 90 degrees, anticlockwise, radius 10 about (0,0): middle at 45 degrees
  const [m] = mids({ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: Math.PI / 2, ccw: true });
  assert.ok(near([m], [[10 * Math.SQRT1_2, 10 * Math.SQRT1_2]]), String(m));
});

test('the cursor near a middle snaps to it, marked as a midpoint; near an end, an end', () => {
  D.run("DOC.ents = [{t:'rect', x:0, y:0, w:40, h:20}]; DOC.guides = []; VIEW.scale = 4;");
  const at = (x, y) => JSON.parse(D.run(`(function(){ var s = resolveSnap({x:${x}, y:${y}}); return JSON.stringify({x:s.x, y:s.y, k:s.k}); })()`));
  assert.deepEqual(at(20.6, 0.4), { x: 20, y: 0, k: 'mid' }, 'top side');
  assert.deepEqual(at(40.3, 9.7), { x: 40, y: 10, k: 'mid' }, 'right side');
  assert.notEqual(at(39.6, 19.6).k, 'mid', 'a corner is still a corner, not a midpoint');
});
