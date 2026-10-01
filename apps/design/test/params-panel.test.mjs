// The Parameters list (params-panel.js), used as at the screen: add, change, rename, delete, with mistakes
// refused and dimensions following; and the material's thickness in Settings driving dimensions that use it.
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
function typeInto(input, v) { input.value = v; input.dispatchEvent(new D.Event('change', { bubbles: true })); }
// a rectangle whose width is a dimension, and an open, empty list
function fresh() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 18, zero: 'top'}); UICFG.stockUnits = 'mm';
    DOC.ents = [{t:'rect', x:10, y:10, w:50, h:30}]; DOC.params = []; DOC.dims = [];
    addDim({kind:'side', a:entId(DOC.ents[0]), at:hintOf(DOC.ents[0], {x:30, y:10})}); UNDO.length = 0; 1`);
  el('paramsBtn').click();
}
function add(name, expr) { el('paramNewName').value = name; el('paramNewExpr').value = expr; el('paramAdd').click(); }
const rows = () => [...el('paramList').querySelectorAll('.prow:not(.pbuilt)')];
const say = () => el('paramSay').textContent;
function link(expr) { D.run(`DOC.dims[0].expr = ${JSON.stringify(expr)}; DOC.dims[0].exprUnit = 'mm'; paramsApplyDims(); 1`); }
const width = () => D.run('DOC.ents[0].w');

test('the fx button opens the list, with the material’s thickness always there', () => {
  fresh();
  assert.ok(!el('paramModal').hidden);
  assert.match(el('paramList').textContent, /material.*18\.00 mm/);
  assert.ok(!el('paramEmpty').hidden, 'says there are none yet');
  el('paramDone').click(); assert.ok(el('paramModal').hidden);
});
test('add: a name and a value; mistakes are said and nothing is added', () => {
  fresh();
  add('thickness', '18.3');
  assert.deepEqual(plain(D.run('DOC.params')), [{ name: 'thickness', expr: '18.3', unit: 'mm', note: '' }]);
  assert.equal(rows().length, 1); assert.match(rows()[0].textContent, /= 18\.30 mm/);
  add('2nd', '5'); assert.match(say(), /starting with a letter/);
  add('Thickness', '5'); assert.match(say(), /already a parameter/);
  add('dado', 'thikness + 1'); assert.match(say(), /no parameter called .thikness./);
  add('dado', ''); assert.match(say(), /Give dado a value/);
  assert.equal(D.run('DOC.params.length'), 1, 'none of those added');
  add('dado', 'thickness + 0.2');
  assert.match(rows()[1].textContent, /= 18\.50 mm/);
});
test('change a value: the dimensions using it follow, as one Undo', () => {
  fresh(); add('thickness', '18');
  link('thickness * 2'); near(width(), 36);
  typeInto(rows()[0].querySelector('.pexpr'), '20');
  near(width(), 40, 'the rectangle followed');
  assert.match(say(), /thickness is now 20/);
  D.run('doUndo(); 1');
  near(width(), 36, 'Undo puts the value and the shape back'); assert.equal(D.run('DOC.params[0].expr'), '18');
});
test('a change that would loop, or has a mistake, is refused and nothing changes', () => {
  fresh(); add('a', '10'); add('b', 'a + 1');
  typeInto(rows()[0].querySelector('.pexpr'), 'b * 2');
  assert.match(say(), /depends on itself/); assert.equal(D.run('DOC.params[0].expr'), '10');
  assert.equal(rows()[0].querySelector('.pexpr').value, '10', 'the box shows the value it kept');
  typeInto(rows()[0].querySelector('.pexpr'), '3 +');
  assert.match(say(), /ends too soon/); assert.equal(D.run('DOC.params[0].expr'), '10');
});
test('rename: changed everywhere it’s used, dimensions included', () => {
  fresh(); add('thickness', '18'); add('dado', 'thickness + 0.2');
  link('thickness * 2');
  typeInto(rows()[0].querySelector('.pname'), 'ply');
  assert.equal(D.run('DOC.params[1].expr'), 'ply + 0.2'); assert.equal(D.run('DOC.dims[0].expr'), 'ply * 2');
  assert.match(say(), /thickness is now called ply/);
  typeInto(rows()[0].querySelector('.pname'), 'dado'); assert.match(say(), /already a parameter/);
  assert.equal(D.run('DOC.params[0].name'), 'ply');
});
test('delete: refused while it’s used, then allowed; Undo brings it back', () => {
  fresh(); add('thickness', '18'); add('dado', 'thickness + 0.2');
  link('dado');
  rows()[0].querySelector('.pdel').click();
  assert.match(say(), /thickness is used by dado/);
  rows()[1].querySelector('.pdel').click();
  assert.match(say(), /dado is used by 1 dimension/);
  assert.equal(D.run('DOC.params.length'), 2);
  link(''); D.run('delete DOC.dims[0].expr; 1');
  rows()[1].querySelector('.pdel').click();
  assert.equal(D.run('DOC.params.length'), 1); assert.match(say(), /dado deleted/);
  D.run('doUndo(); 1'); assert.equal(D.run('DOC.params.length'), 2);
});
test('typed in inches while the drawing shows inches: kept as inches', () => {
  fresh(); D.run(`UICFG.stockUnits = 'in'; 1`);
  try {
    add('thickness', '3/4');
    near(D.run(`paramValue('thickness')`), 19.05);
    assert.equal(D.run('DOC.params[0].unit'), 'in');
  } finally { D.run(`UICFG.stockUnits = 'mm'; 1`); }
});
test('the material’s thickness in Settings: dimensions using material follow, as one Undo', () => {
  fresh();
  link('material + 2'); near(width(), 20);
  typeInto(el('stkT'), '12');
  near(width(), 14, 'followed the new thickness');
  D.run('doUndo(); 1');
  near(width(), 20, 'Undo puts it back');
});
