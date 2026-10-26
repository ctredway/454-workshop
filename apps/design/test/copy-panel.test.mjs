// The Copy panel (copy-panel.js), used as at the screen: shapes picked before or clicked while it's open, moved by Across
// and Up typed or measured from one point to another on the drawing, one copy or several, shown before OK; OK makes
// exactly what it showed, as one Undo and one History step called Copy whose distance can be changed afterwards.
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
const open = () => !el('cpyPanel').hidden;
const okOn = () => !el('cpyOk').disabled;
const click = (x, y) => D.run(`toolClick({x: ${x}, y: ${y}}, {x: ${x}, y: ${y}}); 1`);
const ents = () => plain(D.run('DOC.ents'));
const lastStep = () => plain(D.run('histLine().steps[histLine().n - 1]'));

// a 20 x 10 rectangle and a circle, drawn as a step; the rectangle selected unless asked
function fresh(sel = [0], last) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 18, zero: 'top', units: 'mm'}); UICFG.stockUnits = 'mm';
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.keeps = []; VIEW.scale = 4;
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = [];
    pushUndo(); DOC.ents.push({t: 'rect', x: 10, y: 10, w: 20, h: 10, layer: 'L1'}, {t: 'circle', cx: 200, cy: 150, r: 5, layer: 'L1'}); persist();
    UICFG.cpyLast = ${JSON.stringify(last || null)}; setTool('select'); SEL = ${JSON.stringify(sel)}; setTool('copy'); 1`);
}

test('the tool opens its panel with the selected shapes, one copy beside them, ready to measure from a point', () => {
  fresh();
  assert.ok(open());
  assert.equal(el('cpyObjsVal').textContent, '1 shape');
  assert.equal(el('cpyDx').value, '30.00', 'their width and 10 mm');
  assert.equal(el('cpyDy').value, '0.00');
  assert.equal(el('cpyN').value, '1');
  assert.equal(el('cpyFrom').getAttribute('aria-pressed'), 'true');
  assert.match(el('cpyHint').textContent, /Click a point on the drawing to measure from/);
  const shown = plain(D.run('cpyResults()'));
  assert.equal(shown.length, 1); assert.equal(shown[0].x, 40);
});
test('typed: OK makes the copy shown, selected, as one Undo and one Copy step', () => {
  fresh();
  type('cpyDx', 50); type('cpyDy', -5);
  el('cpyOk').click();
  assert.ok(!open()); assert.equal(D.run('TOOL'), 'select');
  const e = ents();
  assert.equal(e.length, 3);
  assert.deepEqual([e[2].x, e[2].y, e[2].w, e[2].h], [60, 5, 20, 10]);
  assert.deepEqual(plain(D.run('SEL')), [2], 'the copy selected');
  const st = lastStep();
  assert.equal(st.name || 'Copy', 'Copy'); assert.equal(st.recipe.op, 'array'); assert.equal(st.recipe.copy, true); assert.equal(st.recipe.n, 2);
  assert.deepEqual(plain(D.run('histSteps().map(function (s) { return s.name; })')).at(-1), 'Copy');
  D.run('doUndo(); 1');
  assert.equal(ents().length, 2);
});
test('measured on the drawing: From, then To, fill in Across and Up', () => {
  fresh();
  click(10, 10);                                   // the rectangle's corner
  assert.equal(el('cpyTo').getAttribute('aria-pressed'), 'true', 'then To');
  assert.match(el('cpyHint').textContent, /Click where that point goes/);
  click(110, 60);
  assert.equal(el('cpyDx').value, '100.00'); assert.equal(el('cpyDy').value, '50.00');
  assert.match(el('cpyHint').textContent, /^Measured/);
  assert.equal(ents().length, 2, 'nothing added until OK');
  el('cpyOk').click();
  assert.deepEqual([ents()[2].x, ents()[2].y], [110, 60], 'the corner landed where it was clicked');
});
test('several copies, each the distance on from the last', () => {
  fresh();
  type('cpyDx', 0); type('cpyDy', 25); type('cpyN', 3);
  assert.equal(plain(D.run('cpyResults()')).length, 3);
  el('cpyOk').click();
  assert.deepEqual(ents().slice(2).map((e) => e.y), [35, 60, 85]);
  assert.equal(plain(D.run('histSteps().map(function (s) { return s.name; })')).at(-1), 'Copy ×3');
});
test('the History bar changes the distance', () => {
  fresh();
  type('cpyDx', 50); type('cpyDy', 0);
  el('cpyOk').click();
  assert.deepEqual(plain(D.run('histEditInfo(histLine(), histLine().n - 1).fields.map(function (f) { return f.label; })')), ['Across', 'Up'],
    'the History bar offers the distance (not Array’s How many, which counts the shapes copied)');
  assert.equal(D.run('histEdit(histLine().n - 1, {dx: 0, dy: 40})'), 0);
  const e = ents();
  assert.equal(e.length, 3);
  assert.deepEqual([e[2].x, e[2].y], [10, 50]);
});
test('mistakes are said and OK is off', () => {
  fresh([]);
  assert.ok(!okOn()); assert.match(el('cpyHint').textContent, /Click the shapes/);
  click(10, 15); assert.equal(el('cpyObjsVal').textContent, '1 shape');
  click(205, 150); assert.equal(el('cpyObjsVal').textContent, '2 shapes');
  click(205, 150); assert.equal(el('cpyObjsVal').textContent, '1 shape');
  type('cpyDx', 0); type('cpyDy', 0); assert.ok(!okOn()); assert.match(el('cpyHint').textContent, /on top of the shapes/);
  type('cpyDx', 'abc'); assert.ok(!okOn());
  type('cpyDx', 10); type('cpyN', 0); assert.ok(!okOn()); assert.match(el('cpyHint').textContent, /1 to 499/);
  type('cpyN', 2); assert.ok(okOn());
});
test('typed in inches, and typing "@dx,dy" with the panel open copies', () => {
  fresh();
  D.run(`DOC.stock.units = 'in'; 1`);
  try {
    type('cpyDx', '1 1/2'); near(D.run('CPY.dx'), 38.1);
    D.run(`toolCommitText('@2,0'); 1`);
    assert.ok(!open());
    near(ents()[2].x, 10 + 50.8);
  } finally { D.run(`DOC.stock.units = 'mm'; 1`); }
});
test('it opens as last used, and Cancel and the X add nothing', () => {
  fresh([0], { dx: 0, dy: 40, n: 2 });
  assert.equal(el('cpyDy').value, '40.00'); assert.equal(el('cpyN').value, '2');
  for (const how of ['cpyCancel', 'cpyX']) {
    fresh();
    el(how).click();
    assert.ok(!open(), how + ' closes it');
    assert.equal(ents().length, 2, how + ' adds nothing');
  }
});
