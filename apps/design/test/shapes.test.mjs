// The Ellipse, Polygon and Star tools (src/js/shapes.js), on Design's real source files (test/harness.mjs):
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
  D.run('DOC.ents = []; DOC.dims = []; 1');
  return D;
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
const click = (D, x, y) => D.run(`toolClick({x:${x}, y:${y}}, {x:${x}, y:${y}}); 1`);
const type = (D, s) => D.run(`toolCommitText(${JSON.stringify(s)}); 1`);
const ents = (D) => plain(D.run('DOC.ents'));
const radii = (e, cx, cy) => e.pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));

test('the three tools are in Create Vectors, after Circle', () => {
  const D = fresh();
  const ids = plain(D.run(`Array.prototype.map.call(document.querySelectorAll('button.tool, .iconBtn'), function (b){ return b.dataset.tool || b.id; })`));
  const i = ids.indexOf('circle');
  assert.ok(i >= 0, 'the circle button');
  assert.deepEqual(ids.slice(i, i + 4), ['circle', 'ellipse', 'polygon', 'star']);
});
test('Polygon: centre and a corner make a regular polygon with that corner; S8 sets eight sides and is remembered', () => {
  const D = fresh();
  D.setTool('polygon');
  assert.match(D.document.getElementById('promptLbl').textContent, /^Polygon — 6 sides/);
  click(D, 50, 50); click(D, 80, 50);
  let e = ents(D)[0];
  assert.equal(e.t, 'poly'); assert.equal(e.closed, true); assert.equal(e.pts.length, 6);
  radii(e, 50, 50).forEach((r) => near(r, 30, 1e-9, 'every corner 30 from the centre'));
  near(e.pts[0][0], 80, 1e-9, 'a corner where clicked'); near(e.pts[0][1], 50, 1e-9, 'a corner where clicked');
  type(D, 'S8');
  assert.equal(D.run('UICFG.polySides'), 8);
  assert.match(D.document.getElementById('promptLbl').textContent, /8 sides/, 'the prompt says so');
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignUI')).polySides, 8, 'kept for next time');
  click(D, 0, 0); click(D, 0, 10);
  assert.equal(ents(D)[1].pts.length, 8);
  type(D, 'S2');
  assert.equal(D.run('UICFG.polySides'), 8, 'fewer than 3 sides is refused');
});
test('Polygon: F is across the flats, standing on a flat; R to the corners; D across them', () => {
  const D = fresh();
  D.setTool('polygon');
  type(D, 'S6'); type(D, '100,100'); type(D, 'F50');
  const e = ents(D)[0], ys = e.pts.map((p) => p[1]);
  near(Math.max(...ys) - Math.min(...ys), 50, 1e-9, 'a hexagon 50 across the flats, measured top to bottom');
  assert.equal(ys.filter((y) => Math.abs(y - Math.min(...ys)) < 1e-9).length, 2, 'two corners on the bottom: it stands on a flat');
  type(D, '0,0'); type(D, 'R20');
  radii(ents(D)[1], 0, 0).forEach((r) => near(r, 20, 1e-9, 'R: to the corners'));
  type(D, '0,0'); type(D, 'D20');
  radii(ents(D)[2], 0, 0).forEach((r) => near(r, 10, 1e-9, 'D: across the corners'));
});
test('Star: centre, tip, inner corners; points alternate between the two radii', () => {
  const D = fresh();
  D.setTool('star');
  click(D, 0, 0); click(D, 0, 40);
  assert.equal(ents(D).length, 0, 'not made until the inner corners are placed');
  click(D, 15, 0);
  const e = ents(D)[0];
  assert.equal(e.pts.length, 10, 'five points, five inner corners');
  radii(e, 0, 0).forEach((r, i) => near(r, i % 2 ? 15 : 40, 1e-9, `corner ${i}`));
  near(e.pts[0][0], 0, 1e-9, 'the first tip where clicked'); near(e.pts[0][1], 40, 1e-9, 'the first tip where clicked');
});
test('Star: typed sizes, S for the number of points, and inner corners must be inside the tips', () => {
  const D = fresh();
  D.setTool('star');
  type(D, 'S6'); type(D, '10,10'); type(D, 'R30'); type(D, '40');
  assert.equal(ents(D).length, 0, 'an inner radius past the tips is refused');
  type(D, 'R12');
  const e = ents(D)[0];
  assert.equal(e.pts.length, 12);
  near(e.pts[0][0], 10, 1e-9, 'a point straight up'); near(e.pts[0][1], 40, 1e-9, 'a point straight up');
  radii(e, 10, 10).forEach((r, i) => near(r, i % 2 ? 12 : 30, 1e-9, `corner ${i}`));
});
test('Ellipse: typed width and height; every point of it within 0.0005 mm of the true ellipse; area right', () => {
  const D = fresh();
  D.setTool('ellipse');
  type(D, '50,40'); type(D, '120,60');
  const e = ents(D)[0];
  assert.equal(e.t, 'path'); assert.equal(e.closed, true);
  e.pts.forEach((p) => near(((p[0] - 50) / 60) ** 2 + ((p[1] - 40) / 30) ** 2, 1, 1e-12, 'nodes on the ellipse'));
  const exact = plain(D.run(`(function(){ var p = boolPieceOf(DOC.ents[0]), w = 0;
    p.loops[0].forEach(function (sp){ for (var q = 1; q < 16; q++){ var P = boolPtAt(sp, boolSpanMax(sp) * q / 16);
      var X = (P[0] - 50) / 60, Y = (P[1] - 40) / 30, f = Math.sqrt(X * X + Y * Y);
      // distance along the normal, near enough, for points this close to the curve
      var gx = 2 * X / 60, gy = 2 * Y / 30; w = Math.max(w, Math.abs(f * f - 1) / Math.hypot(gx, gy)); } });
    return {w: w, area: Math.abs(boolLoopArea(p.loops[0]))}; })()`));
  assert.ok(exact.w <= 0.0005, 'within 0.0005 mm everywhere: ' + exact.w);
  near(exact.area, Math.PI * 60 * 30, 0.05, 'area');
  assert.ok(e.pts.length <= 128, 'not more arcs than it needs: ' + e.pts.length);
});
test('Ellipse: clicking a corner of its box; a round one is a circle; a flat one is refused', () => {
  const D = fresh();
  D.setTool('ellipse');
  click(D, 0, 0); click(D, 30, -10);
  const e = ents(D)[0];
  const xs = e.pts.map((p) => p[0]), ys = e.pts.map((p) => p[1]);
  near(Math.max(...xs), 30, 1e-9, 'reaches the corner across'); near(Math.min(...ys), -10, 1e-9, 'and down');
  click(D, 0, 0); click(D, 10, 10);
  assert.deepEqual(ents(D)[1], { t: 'circle', cx: 0, cy: 0, r: 10 });
  click(D, 0, 0); click(D, 10, 0);
  assert.equal(ents(D).length, 2, 'no height: nothing made');
});
test('each shape is one undo step', () => {
  const D = fresh();
  D.setTool('polygon'); click(D, 0, 0); click(D, 10, 0);
  D.setTool('star'); click(D, 0, 0); click(D, 0, 10); click(D, 3, 0);
  assert.equal(ents(D).length, 2);
  D.run('doUndo()'); assert.equal(ents(D).length, 1);
  D.run('doUndo()'); assert.equal(ents(D).length, 0);
});
