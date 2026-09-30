// Weld, Subtract and Intersect (src/js/booleans.js), on Design's real source files (test/harness.mjs):
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh() {
  const D = loadDesign({ start: false });
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  return D;
}
const PI = Math.PI;
// net area of a drawing's shapes taken together, even-odd (holes subtract), from their exact outlines
function netArea(D, ents) {
  return D.run(`(function (list) {
    var pcs = list.map(boolPieceOf), a = 0;
    pcs.forEach(function (p, i) {
      var depth = 0, x = p.loops[0][0].x0, y = p.loops[0][0].y0;
      pcs.forEach(function (q, j) { if (j !== i && boolInside(q, x, y)) depth++; });
      a += (depth % 2 ? -1 : 1) * Math.abs(boolLoopArea(p.loops[0]));
    });
    return a;
  })(${JSON.stringify(ents)})`);
}
function apply(D, ents, sel, kind) {
  D.run(`DOC.ents = ${JSON.stringify(ents)}; DOC.dims = []; DOC.toolpaths = []; SEL = ${JSON.stringify(sel)}; 1`);
  const r = plain(D.boolApply(kind));
  return { r, ents: plain(D.run('DOC.ents')), sel: plain(D.run('SEL')) };
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);

test('Weld: two overlapping rectangles become one outline with the corner where they cross', () => {
  const D = fresh();
  const { r, ents, sel } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, {t:'rect', x:30, y:10, w:20, h:20}], [0, 1], 'weld');
  assert.equal(r.ok, true, r.detail);
  assert.equal(ents.length, 1);
  assert.equal(ents[0].t, 'poly');
  assert.equal(ents[0].pts.length, 8, 'eight corners: no extra points along the edges');
  near(netArea(D, ents), 800 + 400 - 100, 1e-9, 'area');
  assert.deepEqual(sel, [0], 'the result is selected');
  assert.ok(ents[0].pts.some((p) => p[0] === 40 && p[1] === 10) || ents[0].pts.some((p) => Math.abs(p[0] - 40) < 1e-9 && Math.abs(p[1] - 10) < 1e-9), 'a corner where the edges cross, at (40, 10)');
});
test('Weld: a rectangle and a circle keep the circle as a true arc, exactly on the circle', () => {
  const D = fresh();
  const { ents } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, {t:'circle', cx:40, cy:10, r:10}], [0, 1], 'weld');
  assert.equal(ents.length, 1);
  assert.equal(ents[0].t, 'path');
  const arcs = ents[0].pts.filter((p) => Math.abs(p[2]) > 1e-9);
  assert.ok(arcs.length >= 1 && arcs.length <= 2, 'the outside half of the circle is one or two arcs, not many short lines');
  near(netArea(D, ents), 800 + PI * 100 / 2, 1e-9, 'area: the rectangle and the half of the circle outside it');
  ents[0].pts.forEach((p) => { if (p[0] > 40 + 1e-9) near(Math.hypot(p[0] - 40, p[1] - 10), 10, 1e-9, 'every point past the rectangle is on the circle'); });
});
test('Weld: rectangles side by side become one rectangle (the shared edge goes)', () => {
  const D = fresh();
  const { ents } = apply(D, [{t:'rect', x:0, y:0, w:20, h:20}, {t:'rect', x:20, y:0, w:20, h:20}], [0, 1], 'weld');
  assert.equal(ents.length, 1);
  assert.equal(ents[0].t, 'rect');
  assert.deepEqual([ents[0].x, ents[0].y, ents[0].w, ents[0].h], [0, 0, 40, 20]);
});
test('Weld: squares touching at one corner stay two outlines, not one figure-8', () => {
  const D = fresh();
  const { r, ents } = apply(D, [{t:'rect', x:0, y:0, w:10, h:10}, {t:'rect', x:10, y:10, w:10, h:10}], [0, 1], 'weld');
  assert.equal(r.ok, true);
  assert.deepEqual(ents.map((e) => [e.t, e.x, e.y, e.w, e.h]).sort(), [['rect', 0, 0, 10, 10], ['rect', 10, 10, 10, 10]]);
});
test('Weld: a shape that meets nothing stays exactly as it was', () => {
  const D = fresh();
  const lone = {t:'circle', cx:200, cy:200, r:5, _id:'lone'};
  const { r, ents, sel } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, lone, {t:'rect', x:30, y:10, w:20, h:20}], [0, 1, 2], 'weld');
  assert.equal(r.ok, true);
  assert.equal(ents.length, 2);
  assert.deepEqual(ents[0], lone, 'untouched');
  assert.deepEqual(sel, [1]);
});
test('Weld: nothing overlapping, nothing changes, and it says why', () => {
  const D = fresh();
  const before = [{t:'rect', x:0, y:0, w:10, h:10}, {t:'rect', x:50, y:0, w:10, h:10}];
  const { r, ents } = apply(D, before, [0, 1], 'weld');
  assert.equal(r.ok, false);
  assert.match(r.detail, /overlap or touch/);
  assert.deepEqual(ents, before);
});
test('Weld: a group with a hole (a letter) keeps its hole where the bar doesn\'t cover it', () => {
  const D = fresh();
  const ring = {t:'group', ents:[{t:'rect', x:0, y:0, w:40, h:40}, {t:'rect', x:10, y:10, w:20, h:20}]};
  const bar = {t:'rect', x:15, y:-10, w:10, h:60};
  const { ents } = apply(D, [ring, bar], [0, 1], 'weld');
  assert.equal(ents.length, 3, 'the outline and the two holes either side of the bar');
  near(netArea(D, ents), 1600 - 400 + 200 + 200, 1e-9, 'area');
  const holes = ents.filter((e) => e.t === 'rect' && e.w === 5);
  assert.equal(holes.length, 2, 'two 5 x 20 holes');
});
test('Subtract: a circle inside a rectangle becomes a hole, and the biggest shape is kept whatever order they were picked', () => {
  const D = fresh();
  const { r, ents } = apply(D, [{t:'circle', cx:20, cy:10, r:5}, {t:'rect', x:0, y:0, w:40, h:20}], [0, 1], 'subtract');
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(ents.map((e) => e.t).sort(), ['circle', 'rect'], 'the rectangle, and the circle as its hole');
  near(netArea(D, ents), 800 - PI * 25, 1e-9, 'area');
});
test('Subtract: a notch out of an edge', () => {
  const D = fresh();
  const { ents } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, {t:'rect', x:15, y:15, w:10, h:10}], [0, 1], 'subtract');
  assert.equal(ents.length, 1);
  assert.equal(ents[0].pts.length, 8);
  near(netArea(D, ents), 800 - 50, 1e-9, 'area');
});
test('Subtract: two circles the same size make a crescent from the one picked first', () => {
  const D = fresh();
  const { ents } = apply(D, [{t:'circle', cx:10, cy:0, r:10}, {t:'circle', cx:0, cy:0, r:10}], [1, 0], 'subtract');
  assert.equal(ents.length, 1);
  const lens = 2 * 100 * Math.acos(10 / 20) - 10 / 2 * Math.sqrt(4 * 100 - 100);
  near(netArea(D, ents), PI * 100 - lens, 1e-9, 'crescent area');
  assert.ok(ents[0].pts.every((p) => p[0] <= 5 + 1e-9), 'the crescent is on the left: circle 0,0 was kept');
});
test('Intersect: two circles leave the lens between them, as two arcs', () => {
  const D = fresh();
  const { ents } = apply(D, [{t:'circle', cx:0, cy:0, r:10}, {t:'circle', cx:10, cy:0, r:10}], [0, 1], 'intersect');
  assert.equal(ents.length, 1);
  assert.equal(ents[0].pts.length, 2);
  const lens = 2 * 100 * Math.acos(10 / 20) - 10 / 2 * Math.sqrt(4 * 100 - 100);
  near(netArea(D, ents), lens, 1e-9, 'lens area');
});
test('Intersect: shapes that don\'t overlap change nothing', () => {
  const D = fresh();
  const before = [{t:'rect', x:0, y:0, w:10, h:10}, {t:'rect', x:50, y:0, w:10, h:10}];
  const { r, ents } = apply(D, before, [0, 1], 'intersect');
  assert.equal(r.ok, false);
  assert.deepEqual(ents, before);
});
test('open shapes take no part, and it says so', () => {
  const D = fresh();
  const { r, ents } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, {t:'line', x1:0, y1:0, x2:50, y2:50}, {t:'rect', x:30, y:10, w:20, h:20}], [0, 1, 2], 'weld');
  assert.equal(r.ok, true);
  assert.match(r.detail, /1 selected shape is open/);
  assert.ok(ents.some((e) => e.t === 'line'), 'the line is still there');
  const { r: r2 } = apply(D, [{t:'rect', x:0, y:0, w:40, h:20}, {t:'line', x1:0, y1:0, x2:50, y2:50}], [0, 1], 'weld');
  assert.equal(r2.ok, false);
});
test('a toolpath that cut a welded shape cuts the result; dimensions on it go; undo puts it all back', () => {
  const D = loadDesign({ cam: true }); D.wire(); D.run = (code) => vm.runInContext(code, D);
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w:200, h:120, t:12, zero:'top'});
    DOC.layers = [{id:'L1', name:'Layer 1', visible:true, locked:false}]; DOC.activeLayer = 'L1';
    DOC.ents = [{t:'rect', x:0, y:0, w:40, h:20, layer:'L1'}, {t:'rect', x:30, y:10, w:20, h:20, layer:'L1'}, {t:'circle', cx:100, cy:80, r:5, layer:'L1'}];
    DOC.ents.forEach(entId); DOC.dims = []; addDim({kind:'side', a:entId(DOC.ents[0]), at:hintOf(DOC.ents[0], {x:20, y:0})}); DOC.toolpaths = []; SEL = [0, 2]; 1`);
  D.cutOpen(null);
  const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  set('cutType', 'profile', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); set('cutDepth', 3); D.CUT.toolChosen = true;
  D.cutApply();
  const maxX = () => Math.max(...plain(D.run('DOC.toolpaths[0].moves')).filter((m) => m.x !== undefined && m.x < 90).map((m) => m.x));
  assert.ok(maxX() < 45, 'before: the profile goes round the first rectangle only');
  const before = plain(D.run('DOC.ents'));
  D.run('SEL = [0, 1]');
  D.boolBtnClick('weld');
  const ents = plain(D.run('DOC.ents')), tp = plain(D.run('DOC.toolpaths[0]'));
  assert.deepEqual(tp.ents, [ents[1]._id, before[2]._id], 'the welded outline in place of the rectangle, and the circle still');
  assert.ok(Math.abs(maxX() - (50 + 6.35 / 2)) < 0.05, `after: the profile goes round the welded outline (reaches x ${maxX()})`);
  assert.equal(plain(D.run('DOC.dims')).length, 0, 'the dimension on the rectangle went with it');
  D.run('doUndo()');
  assert.deepEqual(plain(D.run('DOC.ents')), before);
  assert.equal(plain(D.run('DOC.dims')).length, 1);
  assert.ok(maxX() < 45, 'undone: round the rectangle again');
});

// ---- against brute force: many random pairs, checked at many points -------------------
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function randomShape(R) {
  const k = Math.floor(R() * 4), x = R() * 40, y = R() * 40;
  if (k === 0) return {t:'rect', x, y, w:5 + R() * 30, h:5 + R() * 30};
  if (k === 1) return {t:'circle', cx:x + 10, cy:y + 10, r:3 + R() * 20};
  if (k === 2) {                                           // a star-ish polygon, maybe concave
    const n = 3 + Math.floor(R() * 7), pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * PI, r = 5 + R() * 20; pts.push([x + 20 + r * Math.cos(a), y + 20 + r * Math.sin(a)]); }
    return {t:'poly', closed:true, pts};
  }
  const n = 3 + Math.floor(R() * 4), pts = [];               // a path with arcs, either winding
  for (let i = 0; i < n; i++) { const a = i / n * 2 * PI, r = 8 + R() * 15; pts.push([x + 20 + r * Math.cos(a), y + 20 + r * Math.sin(a), (R() - 0.5) * 0.8]); }
  if (R() < 0.5) pts.reverse();
  return {t:'path', closed:true, pts};
}
test('random pairs: inside the result exactly where the rule says, at thousands of points; areas add up', () => {
  const D = fresh(), R = rng(454);
  let cases = 0, pointsChecked = 0;
  for (let n = 0; n < 150; n++) {
    const A = randomShape(R), B = randomShape(R);
    const res = plain(D.run(`(function (A, B) {
      var pa = boolPieceOf(A), pb = boolPieceOf(B), out = {};
      [['weld', function (f){ return f[0] || f[1]; }], ['subtract', function (f){ return f[0] && !f[1]; }],
       ['intersect', function (f){ return f[0] && f[1]; }]].forEach(function (op) {
        var loops = boolCombine([pa, pb], op[1]);
        out[op[0]] = {shapes: loops.map(boolShapeOf), net: loops.reduce(function (s, l){ return s + boolLoopArea(l); }, 0)};
      });
      // each shape's own area, even-odd (a random path can cross itself): the shape combined with nothing
      var own = function (p){ return boolCombine([p], function (f){ return f[0]; }).reduce(function (s, l){ return s + boolLoopArea(l); }, 0); };
      out.a = own(pa); out.b = own(pb);
      return out;
    })(${JSON.stringify(A)}, ${JSON.stringify(B)})`));
    const aA = Math.abs(res.a), aB = Math.abs(res.b);
    near(res.weld.net, aA + aB - res.intersect.net, 1e-6, `case ${n}: union = A + B - both`);
    near(res.subtract.net, aA - res.intersect.net, 1e-6, `case ${n}: A - B = A - both`);
    // pointwise, away from edges: the result's shapes (as drawn, even-odd) agree with the rule
    const probe = D.run(`(function (A, B, W, S, I, pts) {
      var pa = boolPieceOf(A), pb = boolPieceOf(B), bad = [];
      var pw = boolPieceOf({t:'group', ents:W}), ps = boolPieceOf({t:'group', ents:S}), pi = boolPieceOf({t:'group', ents:I});
      function edge(x, y) {             // too close to any edge to call
        return [pa, pb].some(function (p) { return p.loops.some(function (l) { return l.some(function (sp) {
          var s = boolParamOf(sp, [x, y]), m = boolSpanMax(sp); s = Math.max(0, Math.min(m, s));
          var q = boolPtAt(sp, s); return Math.hypot(q[0] - x, q[1] - y) < 1e-3 || Math.hypot(sp.x0 - x, sp.y0 - y) < 1e-3; }); }); });
      }
      var n = 0;
      pts.forEach(function (q) {
        if (edge(q[0], q[1])) return; n++;
        var a = boolInside(pa, q[0], q[1]), b = boolInside(pb, q[0], q[1]);
        var w = pw ? boolInside(pw, q[0], q[1]) : false, s = ps ? boolInside(ps, q[0], q[1]) : false, i = pi ? boolInside(pi, q[0], q[1]) : false;
        if (w !== (a || b)) bad.push(['weld', q]);
        if (s !== (a && !b)) bad.push(['subtract', q]);
        if (i !== (a && b)) bad.push(['intersect', q]);
      });
      return {bad: bad.slice(0, 3), n: n};
    })(${JSON.stringify(A)}, ${JSON.stringify(B)}, ${JSON.stringify(res.weld.shapes)}, ${JSON.stringify(res.subtract.shapes)},
       ${JSON.stringify(res.intersect.shapes)}, ${JSON.stringify(Array.from({length: 400}, () => [-25 + R() * 110, -25 + R() * 110]))})`);
    const p = plain(probe);
    assert.deepEqual(p.bad, [], `case ${n}: ${JSON.stringify(A)} with ${JSON.stringify(B)}`);
    pointsChecked += p.n; cases++;
  }
  assert.equal(cases, 150);
  assert.ok(pointsChecked > 50000, `points checked: ${pointsChecked}`);
});
test('random pairs sharing edges and corners (the hard cases): a grid of squares and circles on the same lines', () => {
  const D = fresh(), R = rng(7);
  for (let n = 0; n < 120; n++) {
    const g = () => Math.round(R() * 4) * 10;          // everything on a 10 mm grid, so edges and corners coincide
    const pick = () => R() < 0.7 ? {t:'rect', x:g(), y:g(), w:10 + g(), h:10 + g()} : {t:'circle', cx:g(), cy:g(), r:10};
    const A = pick(), B = pick();
    const res = plain(D.run(`(function (A, B) {
      var pa = boolPieceOf(A), pb = boolPieceOf(B), out = {};
      [['w', function (f){ return f[0] || f[1]; }], ['s', function (f){ return f[0] && !f[1]; }], ['i', function (f){ return f[0] && f[1]; }]]
        .forEach(function (op) { out[op[0]] = boolCombine([pa, pb], op[1]).reduce(function (s, l){ return s + boolLoopArea(l); }, 0); });
      out.a = Math.abs(boolLoopArea(pa.loops[0])); out.b = Math.abs(boolLoopArea(pb.loops[0]));
      // the shared area by brute force, on a fine grid of cell centres
      var both = 0, h = 0.25;
      for (var x = -20 + h / 2; x < 90; x += h) for (var y = -20 + h / 2; y < 90; y += h) if (boolInside(pa, x, y) && boolInside(pb, x, y)) both += h * h;
      out.brute = both;
      return out;
    })(${JSON.stringify(A)}, ${JSON.stringify(B)})`));
    const tol = (A.t === 'circle' || B.t === 'circle') ? 2 : 1e-6;   // squares on the grid are exact; circles only near
    near(res.i, res.brute, tol, `case ${n} ${JSON.stringify([A, B])}: shared area`);
    near(res.w, res.a + res.b - res.i, 1e-6, `case ${n} ${JSON.stringify([A, B])}: union`);
    near(res.s, res.a - res.i, 1e-6, `case ${n} ${JSON.stringify([A, B])}: difference`);
  }
});
