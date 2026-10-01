// Parameters (params.js): named values and arithmetic, in mm or inches, saved with the drawing. On Design's real
// sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ` ${a} against ${b}`);
const ev = (src, unit = 'mm') => D.paramTry(src, unit);
function params(list, t) {
  D.DOC.params = list.map(([name, expr, unit = 'mm']) => ({ name, expr, unit, note: '' }));
  D.DOC.stock = Object.assign({}, D.DOC.stock, { t: t === undefined ? 18 : t });
}

test('arithmetic: + - * / and brackets, in the usual order, with minus signs', () => {
  params([]);
  near(ev('1 + 2 * 3').v, 7); near(ev('(1 + 2) * 3').v, 9); near(ev('10 / 4').v, 2.5);
  near(ev('-3 + 5').v, 2); near(ev('2 * -3').v, -6); near(ev('10 - 2 - 3').v, 5, 'left to right'); near(ev('24 / 2 / 3').v, 4);
  near(ev('.5 + 1.25').v, 1.75);
});
test('units: bare numbers are in the expression’s unit; a number can name its own', () => {
  params([]);
  near(ev('2', 'in').v, 50.8); near(ev('2', 'mm').v, 2);
  near(ev('18mm', 'in').v, 18); near(ev('1in', 'mm').v, 25.4); near(ev('2cm').v, 20); near(ev('1"').v, 25.4);
  near(ev('3/4in').v, 19.05, 'three quarters of an inch'); near(ev('3/4"').v, 19.05);
  near(ev('3/4', 'in').v, 19.05, 'a fraction in an inch expression');
  near(ev('1 + 3/4in', 'mm').v, 1 + 19.05);
});
test('parameters: by name (any case), using each other, worked out in each one’s own unit', () => {
  params([['thickness', '18.3'], ['dado', 'thickness + 0.2'], ['Height', '30', 'in'], ['gap', '(height - 3 * Thickness) / 2']]);
  near(D.paramValue('thickness'), 18.3); near(D.paramValue('DADO'), 18.5);
  near(D.paramValue('height'), 762);
  near(D.paramValue('gap'), (762 - 3 * 18.3) / 2);
  // an inch parameter using a mm one: converted into inches, worked out, back to mm
  params([['thickness', '18'], ['half', 'thickness / 2', 'in'], ['plus', 'thickness + 1', 'in']]);
  near(D.paramValue('half'), 9); near(D.paramValue('plus'), 18 + 25.4, 'the 1 is an inch');
});
test('material is the material’s thickness, from Settings', () => {
  params([['dado', 'material + 0.2']], 12.7);
  near(D.paramValue('dado'), 12.9); near(ev('material / 2').v, 6.35);
  params([['dado', 'material + 0.2']], 0);
  assert.match(D.paramTry('dado', 'mm').why, /material.*isn.t set/);
});
test('what’s wrong, in plain words', () => {
  params([['a', 'b + 1'], ['b', 'a * 2'], ['c', 'nope + 1'], ['d', '1 +']]);
  assert.match(ev('a').why, /depends on itself \(a → b → a\)/);
  assert.match(ev('c').why, /no parameter called .nope./);
  assert.match(ev('d').why, /ends too soon/);
  assert.match(ev('2 * (3 + 1').why, /bracket isn.t closed/);
  assert.match(ev('4 / (2 - 2)').why, /divides by zero/);
  assert.match(ev('3 $ 4').why, /Only numbers, names/);
  assert.match(ev('').why, /empty/);
  assert.match(ev('2 3').why, /missing before .3./);
  assert.match(ev('2 inner').why, /missing before .inner./, '"in" only as a unit, not the start of a name');
});
test('names: what’s allowed; renaming changes every use, but not units after numbers', () => {
  params([['thickness', '18'], ['dado', 'thickness + 0.2'], ['mmx', '2mm + Thickness']]);
  assert.equal(D.paramNameProblem('shelf_gap'), '');
  assert.match(D.paramNameProblem('2nd'), /starting with a letter/);
  assert.match(D.paramNameProblem('material'), /material/);
  assert.match(D.paramNameProblem('in'), /unit/);
  assert.match(D.paramNameProblem('DADO'), /already a parameter called .dado./);
  assert.equal(D.paramNameProblem('dado', D.paramByName('dado')), '', 'its own name');
  D.DOC.dims = [{ kind: 'side', a: 'x', expr: 'thickness * 2', exprUnit: 'mm' }];
  D.paramRename(D.paramByName('thickness'), 'ply');
  assert.deepEqual(JSON.parse(JSON.stringify(D.DOC.params.map((p) => p.expr))), ['18', 'ply + 0.2', '2mm + ply']);
  assert.equal(D.DOC.dims[0].expr, 'ply * 2');
  near(D.paramValue('dado'), 18.2);
  assert.deepEqual(JSON.parse(JSON.stringify(D.paramUsers(D.paramByName('ply')))), { params: ['dado', 'mmx'], dims: 1, tps: [] });
});
test('saved with the drawing, and Undo puts them back', () => {
  params([['thickness', '18']]);
  D.pushUndo();
  D.DOC.params[0].expr = '19';
  D.doUndo();
  assert.equal(D.DOC.params[0].expr, '18');
  assert.match(D.docForStorage(), /"params":\[\{"name":"thickness","expr":"18"/);
});
