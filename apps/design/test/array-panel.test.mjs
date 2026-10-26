// The Array panel (array-panel.js), used as at the screen: shapes picked before or clicked while it's open, a row or
// copies around a centre, the copies shown before OK, and OK making exactly what it showed, as one Undo and one
// step on the History bar. Clint (2026-10-26) couldn't work out the typed "5@12,0" way.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
function type(id, v) { el(id).value = String(v); el(id).dispatchEvent(new D.Event('input', { bubbles: true })); }
const ents = () => plain(D.run('DOC.ents'));
const open = () => !el('arrPanel').hidden;
const okOn = () => !el('arrOk').disabled;
const click = (x, y) => D.run(`toolClick({x: ${x}, y: ${y}}, {x: ${x}, y: ${y}}); 1`);

// a 20 x 10 rectangle and a circle; the rectangle selected unless asked
function fresh(sel = [0], last) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 18, zero: 'top', units: 'mm'}); UICFG.stockUnits = 'mm';
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = [{t: 'rect', x: 10, y: 10, w: 20, h: 10, layer: 'L1'}, {t: 'circle', cx: 200, cy: 150, r: 5, layer: 'L1'}]; DOC.dims = []; DOC.keeps = [];
    VIEW.scale = 4; UNDO.length = 0; UICFG.arrLast = ${JSON.stringify(last || null)}; setTool('select'); SEL = ${JSON.stringify(sel)}; setTool('array'); 1`);
}

test('the tool opens its panel with the selected shapes, a row to the right to start with', () => {
  fresh();
  assert.ok(open());
  assert.equal(el('arrObjsVal').textContent, '1 shape');
  assert.equal(el('arrN').value, '3');
  assert.equal(el('arrDx').value, '30.00', 'the shapes’ width and 10 mm');
  assert.ok(!el('arrRow').hidden && el('arrRound').hidden);
  assert.equal(D.run('arrResults().length'), 2, 'two copies shown');
  assert.match(el('arrHint').textContent, /the shapes you picked and 2 copies/i);
});
test('a row: How many and the distances, and OK makes what was shown, as one Undo and one History step', () => {
  fresh();
  type('arrN', 4); type('arrDx', 25); type('arrDy', 5);
  const shown = plain(D.run('arrResults()'));
  assert.equal(shown.length, 3);
  el('arrOk').click();
  assert.ok(!open(), 'the panel closes');
  assert.equal(D.run('TOOL'), 'select');
  const now = ents();
  assert.equal(now.length, 5);
  assert.deepEqual(now.slice(2).map((e) => [e.x, e.y, e.w, e.h]), [[35, 15, 20, 10], [60, 20, 20, 10], [85, 25, 20, 10]]);
  assert.deepEqual(now.slice(2).map((e) => [e.x, e.y]), shown.map((e) => [e.x, e.y]), 'what the preview showed');
  assert.deepEqual(plain(D.run('SEL')), [0, 2, 3, 4], 'the shapes and their copies selected');
  const step = plain(D.run('histLine().steps[histLine().n - 1].recipe'));
  assert.equal(step.op, 'array'); assert.equal(step.kind, 'lin'); assert.equal(step.n, 4); assert.equal(step.dx, 25); assert.equal(step.dy, 5);
  D.run('doUndo(); 1');
  assert.equal(ents().length, 2, 'one Undo takes them all off');
});
test('mistakes are said and OK is off: nothing apart, too few, not a number', () => {
  fresh();
  type('arrDx', 0); type('arrDy', 0);
  assert.ok(!okOn()); assert.match(el('arrHint').textContent, /on top of each other/);
  type('arrDx', 12); type('arrN', 1);
  assert.ok(!okOn()); assert.match(el('arrHint').textContent, /2 to 500/);
  type('arrN', 'five');
  assert.ok(!okOn());
  type('arrN', 2); assert.ok(okOn());
});
test('in inches, the distances are inches, fractions too', () => {
  fresh();
  D.run(`DOC.stock.units = 'in'; 1`);
  try {
    type('arrDx', '1 1/2'); type('arrN', 2);
    near(D.run('ARR.dx'), 38.1);
    el('arrOk').click();
    near(ents()[2].x, 10 + 38.1);
  } finally { D.run(`DOC.stock.units = 'mm'; 1`); }
});
test('with nothing selected: clicking shapes adds them, and clicking again takes them off', () => {
  fresh([]);
  assert.ok(!okOn()); assert.match(el('arrHint').textContent, /Click the shapes/);
  click(10, 15);                                   // the rectangle's left side
  assert.equal(el('arrObjsVal').textContent, '1 shape');
  click(205, 150);                                 // the circle's edge
  assert.equal(el('arrObjsVal').textContent, '2 shapes');
  click(205, 150);
  assert.equal(el('arrObjsVal').textContent, '1 shape');
  assert.ok(okOn());
});
test('around a centre: the next click is the centre, and a full circle spreads them evenly', () => {
  fresh();
  el('arrKind').querySelector('[data-k=circ]').click();
  assert.ok(el('arrRow').hidden && !el('arrRound').hidden);
  assert.equal(el('arrCentre').getAttribute('aria-pressed'), 'true', 'waiting for the centre');
  assert.ok(!okOn()); assert.match(el('arrHint').textContent, /Click the centre/);
  click(100, 15);
  assert.equal(el('arrCx').value, '100.00'); assert.equal(el('arrCy').value, '15.00');
  assert.equal(ents().length, 2, 'clicking the centre adds nothing yet');
  type('arrNc', 4);
  assert.ok(el('arrFull').checked); assert.ok(el('arrStep').disabled); assert.equal(el('arrStep').value, '90');
  el('arrOk').click();
  const c = ents().slice(2);
  assert.equal(c.length, 3);
  // the rectangle's centre (20, 15) is 80 left of (100, 15): turned 90, 180 and 270 degrees
  const mid = (e) => { const b = plain(D.run(`entBBox(${JSON.stringify(e)})`)); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
  [[100, -65], [180, 15], [100, 95]].forEach(([x, y], k) => { near(mid(c[k])[0], x, 'copy ' + k + ' x'); near(mid(c[k])[1], y, 'copy ' + k + ' y'); });
  const step = plain(D.run('histLine().steps[histLine().n - 1].recipe'));
  assert.equal(step.kind, 'circ'); assert.equal(step.step, 90); assert.equal(step.cx, 100);
});
test('around a centre: a typed centre, and a set angle between them when it isn’t a full circle', () => {
  fresh();
  el('arrKind').querySelector('[data-k=circ]').click();
  type('arrCx', 20); type('arrCy', 50); type('arrNc', 3);
  el('arrFull').click();
  assert.ok(!el('arrStep').disabled);
  type('arrStep', -30);
  assert.match(el('arrHint').textContent, /negative clockwise/);
  el('arrOk').click();
  const step = plain(D.run('histLine().steps[histLine().n - 1].recipe'));
  assert.equal(step.n, 3); assert.equal(step.step, -30); assert.equal(step.cx, 20); assert.equal(step.cy, 50);
});
test('it opens as it was last used', () => {
  fresh([0], { kind: 'lin', n: 7, dx: 0, dy: 40, nc: 6, full: true, step: 60 });
  assert.equal(el('arrN').value, '7'); assert.equal(el('arrDy').value, '40.00'); assert.equal(el('arrDx').value, '0.00');
  type('arrN', 2); el('arrOk').click();
  assert.equal(plain(D.run('UICFG.arrLast')).n, 2, 'kept for next time');
});
test('Cancel and the X add nothing', () => {
  for (const how of ['arrCancel', 'arrX']) {
    fresh();
    el(how).click();
    assert.ok(!open(), how + ' closes it');
    assert.equal(ents().length, 2, how + ' adds nothing');
    assert.equal(D.run('TOOL'), 'select');
  }
});
test('Esc closes it and adds nothing', () => {
  // a page of its own that keeps the window's key listeners, as keys.test.mjs does
  const K = loadDesign({ start: false }), keydown = [];
  K.addEventListener = (type, f) => { if (type === 'keydown') keydown.push(f); };
  K.wire();
  const run = (code) => vm.runInContext(code, K);
  run(`DOC.ents = [{t: 'rect', x: 10, y: 10, w: 20, h: 10}]; SEL = [0]; setTool('array'); 1`);
  assert.ok(!K.document.getElementById('arrPanel').hidden);
  const ev = { key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, code: '', target: K.document.body,
               preventDefault() {}, stopPropagation() {} };
  keydown.forEach((f) => f(ev));
  assert.ok(K.document.getElementById('arrPanel').hidden, 'closed');
  assert.equal(run('TOOL'), 'select');
  assert.equal(run('DOC.ents.length'), 1);
});
