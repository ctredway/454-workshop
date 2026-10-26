// The Polygon and Star panel (shape-panel.js), used as at the screen: open while the tool is, the sides or points
// (typed, or one fewer and one more), a size that makes each click place one centred there (a dashed one following the
// pointer), across the flats or the corners, and the star's inner corners.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + `: ${a} against ${b}`);
function type(id, v) { el(id).value = String(v); el(id).dispatchEvent(new D.Event('input', { bubbles: true })); }
const open = () => !el('shpPanel').hidden;
const click = (x, y) => D.run(`toolClick({x: ${x}, y: ${y}}, {x: ${x}, y: ${y}}); 1`);
const ents = () => plain(D.run('DOC.ents'));
const span = (e, k) => { const v = e.pts.map((p) => p[k]); return Math.max(...v) - Math.min(...v); };

function fresh(tool) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 18, zero: 'top', units: 'mm'}); UICFG.stockUnits = 'mm';
    DOC.ents = []; DOC.dims = []; UNDO = []; REDO = []; VIEW.scale = 4;
    UICFG.polySides = 6; UICFG.starPoints = 5; delete UICFG.polySize; delete UICFG.starSize; delete UICFG.starInner;
    setTool('select'); setTool(${JSON.stringify(tool)}); 1`);
}

test('the panel opens with Polygon, stays while it’s used, and closes with another tool', () => {
  fresh('polygon');
  assert.ok(open());
  assert.equal(el('shpTitle').textContent, 'Polygon');
  assert.ok(!el('shpPoly').hidden && el('shpStar').hidden);
  assert.equal(el('shpSides').value, '6');
  assert.equal(el('shpPolySize').value, '', 'no size: drawn by eye');
  assert.match(el('shpHint').textContent, /Click the centre, then a corner/);
  click(0, 0); click(10, 0);
  assert.equal(ents().length, 1); assert.ok(open(), 'still open');
  D.run(`setTool('star'); 1`);
  assert.equal(el('shpTitle').textContent, 'Star'); assert.ok(el('shpPoly').hidden && !el('shpStar').hidden);
  assert.ok(el('shpPanel').querySelector('.modalHead h3 .helpI'), 'the help button is still beside the title once it says Star');
  D.run(`setTool('rect'); 1`);
  assert.ok(!open());
});
test('sides: typed, or one fewer and one more; 3 to 100; kept for next time', () => {
  fresh('polygon');
  el('shpSidesMore').click(); el('shpSidesMore').click();
  assert.equal(D.run('UICFG.polySides'), 8); assert.equal(el('shpSides').value, '8');
  assert.match(el('promptLbl').textContent, /8 sides/, 'the prompt says so');
  type('shpSides', 3); el('shpSidesLess').click();
  assert.equal(D.run('UICFG.polySides'), 3, 'not fewer than 3');
  type('shpSides', 12);
  click(0, 0); click(10, 0);
  assert.equal(ents()[0].pts.length, 12);
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignUI')).polySides, 12);
});
test('a size across the flats: each click places one there, standing on a flat', () => {
  fresh('polygon');
  type('shpPolySize', 50);
  assert.match(el('shpHint').textContent, /Click the drawing to place one/);
  assert.match(el('promptLbl').textContent, /click to place one, centred where you click/);
  assert.ok(D.run('shpStamp({x: 5, y: 5}) !== null'), 'a dashed one follows the pointer');
  click(100, 100); click(200, 100);
  const e = ents();
  assert.equal(e.length, 2, 'two clicks, two hexagons');
  near(span(e[0], 1), 50, 'across the flats, top to bottom');
  const ys = e[0].pts.map((p) => p[1]);
  assert.equal(ys.filter((y) => Math.abs(y - Math.min(...ys)) < 1e-9).length, 2, 'two corners on the bottom: standing on a flat');
  near(e[1].pts.reduce((a, p) => a + p[0], 0) / 6, 200, 'centred where clicked');
  type('shpSides', 5); click(300, 100);
  const ys5 = ents()[2].pts.map((p) => p[1]);
  assert.equal(ys5.filter((y) => Math.abs(y - Math.min(...ys5)) < 1e-9).length, 2, 'a pentagon stands on a flat too, a point at the top');
  type('shpPolySize', '');
  click(0, 0);
  assert.equal(ents().length, 3, 'size cleared: the next click is a centre again');
});
test('across the corners', () => {
  fresh('polygon');
  el('shpBy').querySelector('[data-by=corners]').click();
  type('shpPolySize', 40);
  click(0, 0);
  ents()[0].pts.forEach((p) => near(Math.hypot(p[0], p[1]), 20, 'every corner 20 from the centre'));
});
test('Star: points, a size across the tips, and the inner corners', () => {
  fresh('star');
  assert.equal(el('shpPoints').value, '5'); assert.equal(el('shpInner').value, '50'); assert.equal(el('shpInnerVal').textContent, '50%');
  el('shpPointsMore').click();
  type('shpStarSize', 60); type('shpInner', 25);
  assert.equal(el('shpInnerVal').textContent, '25%');
  click(10, 10);
  const e = ents()[0];
  assert.equal(e.pts.length, 12);
  e.pts.forEach((p, i) => near(Math.hypot(p[0] - 10, p[1] - 10), i % 2 ? 7.5 : 30, 'corner ' + i));
  near(e.pts[0][0], 10, 'a point straight up'); near(e.pts[0][1], 40, 'a point straight up');
});
test('in inches, the size is inches', () => {
  fresh('polygon');
  D.run(`DOC.stock.units = 'in'; 1`);
  try {
    type('shpPolySize', '2 1/2');
    near(D.run('UICFG.polySize.v'), 63.5);
    assert.equal(el('shpPanel').querySelector('.panelU').textContent, 'in');
  } finally { D.run(`DOC.stock.units = 'mm'; 1`); }
});
test('the X closes it and goes back to Select', () => {
  fresh('star');
  el('shpX').click();
  assert.ok(!open()); assert.equal(D.run('TOOL'), 'select');
});
test('the sizes and the inner corners are remembered from one visit to the next', () => {
  const K = loadDesign({ start: false });
  K.localStorage.setItem('d454DesignUI', JSON.stringify({ polySize: { by: 'corners', v: 30 }, starSize: 80, starInner: 0.4 }));
  K.wire();
  assert.equal(vm.runInContext('JSON.stringify([UICFG.polySize, UICFG.starSize, UICFG.starInner])', K), '[{"by":"corners","v":30},80,0.4]');
});
