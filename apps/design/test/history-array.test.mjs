// Array on the History bar (history-replay.js 'array', Design 0.150.0), and counts, angles and percentages that follow
// parameters (paramTryNumber: each parameter as the number it was typed as). On the real sources (test/harness.mjs):
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const names = () => plain(D.run('histSteps().map(function (s) { return s.name + (s.failed ? " (red)" : ""); })'));
const circles = () => plain(D.run(`DOC.ents.filter(function (e) { return e.t === 'circle'; }).map(function (e) { return [+e.cx.toFixed(6), +e.cy.toFixed(6)]; })`));

function setup(units = 'mm') {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    DOC.params = [{name: 'count', expr: '4', unit: ${JSON.stringify(units)}, note: ''}, {name: 'pitch', expr: '${units === 'in' ? '1' : '25'}', unit: ${JSON.stringify(units)}, note: ''},
                  {name: 'angle', expr: '45', unit: ${JSON.stringify(units)}, note: ''}];
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = []; UICFG.stockUnits = DOC.stock.units = ${JSON.stringify(units)};
    pushUndo(); DOC.ents.push({t: 'circle', cx: 20, cy: 20, r: 3, layer: 'L1'}); persist(); SEL = [0]; 1`);
}
// the Array tool, as typed: "N@dx,dy" for a row, or a centre clicked then "N<step"
const typeArray = (txt, centre) => D.run(`setTool('array'); SEL = [0]; ${centre ? `DRAW = {stage: 1, cx: ${centre.x}, cy: ${centre.y}};` : 'DRAW = null;'} toolCommitText(${JSON.stringify(txt)}); SEL = []; 1`);
const setParam = (name, expr) => { D.run(`paramPanelSetExpr(paramByName(${JSON.stringify(name)}), ${JSON.stringify(expr)}, {value: ''}); 1`); return D.run('busyIdle()'); };

test('a row made with Array is a step that can be changed: how many, and how far apart', () => {
  setup();
  typeArray('3@25,0');
  assert.deepEqual(names(), ['Circle', 'Array 3']);
  assert.deepEqual(circles(), [[20, 20], [45, 20], [70, 20]]);
  assert.equal(D.run(`histEdit(1, {n: 5, dx: 10, dy: 5})`), 0);
  assert.deepEqual(circles(), [[20, 20], [30, 25], [40, 30], [50, 35], [60, 40]]);
  assert.deepEqual(names(), ['Circle', 'Array 5']);
});

test('done again with nothing changed, an array gives exactly what the tool gave (around a centre too)', () => {
  setup();
  typeArray('6<60', { x: 50, y: 50 });
  const before = plain(D.run('histLine().s.map(histJoin)'));
  assert.equal(D.run('(function () { var L = histLine(); var f = histReplay(L, 0); window.__after = L.s.map(histJoin); return f; })()'), 0);
  assert.deepEqual(plain(D.run('__after')), before);
});

test('the count and spacing follow parameters; the row grows and shrinks with them', async () => {
  setup();
  typeArray('3@25,0');
  assert.equal(D.run(`histEdit(1, {n: 4, dx: 25, dy: 0}, {n: {e: 'count', u: 'num'}, dx: {e: 'pitch', u: 'mm'}})`), 0);
  await setParam('count', '6');
  assert.equal(circles().length, 6);
  await setParam('pitch', '10');
  assert.deepEqual(circles().map((c) => c[0]), [20, 30, 40, 50, 60, 70]);
  D.run('doUndo(); 1');
  assert.deepEqual(circles().map((c) => c[0]), [20, 45, 70, 95, 120, 145], 'Undo: back to 25 apart');
});

test('a count or angle from a parameter typed in inches is its number, not a length: 4 is 4, 45 is 45°', async () => {
  setup('in');
  typeArray('3<30', { x: 50, y: 20 });
  assert.equal(D.run(`histEdit(1, {n: 4, step: 45, cx: 50, cy: 20}, {n: {e: 'count', u: 'num'}, step: {e: 'angle', u: 'num'}})`), 0);
  await setParam('count', '5');                              // worked out from the parameters now
  assert.equal(circles().length, 5, 'count = 5 (typed in inches): 5 copies, not 127');
  await setParam('angle', '90');
  const turned = (c) => (Math.atan2(c[1] - 20, c[0] - 50) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(turned(circles()[1]) - 270) < 1e-6, 'the first copy turned 90° from the circle (at 180°): ' + circles()[1]);
});

test('in the step’s box: a count from a parameter is remembered; one that isn’t a whole number from 2 is refused', () => {
  setup();
  typeArray('3@25,0');
  const type = (text) => {
    D.run('histEditOpen(1, null); 1');
    el('histEdit').querySelector('input').value = text;
    [...el('histEdit').querySelectorAll('button')].find((b) => b.textContent === 'Change').click();
  };
  type('count + 1');
  assert.deepEqual(plain(D.run('UNDO[1].exprs')), { n: { e: 'count + 1', u: 'num' } });
  assert.equal(circles().length, 5);
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
  try { type('count / 3'); } finally { D.toast = real; }
  assert.ok(toasts.some((t) => /whole number from 2/.test(t)), toasts.join(' / '));
  assert.equal(circles().length, 5, 'unchanged');
  D.run('histEditClose(); 1');
});

// Clint, 2026-10-26 ("go ahead and fix it"): copies beyond the count an Array step was first made with got new ids each
// time the steps were done again, so a dimension or toolpath on one lost it at the next change to an earlier step.
const ids = () => plain(D.run('DOC.ents.map(function (e) { return e._id; })'));
test('copies past the count an array was made with keep their ids, through changes, saving and opening', () => {
  setup();
  typeArray('3@25,0');
  assert.equal(D.run('histEdit(1, {n: 6, dx: 25, dy: 0})'), 0);
  const six = ids();
  assert.equal(six.length, 6);
  D.run('histReplay(histLine(), 0); 1');
  assert.deepEqual(ids(), six, 'done again: the same ids');
  // a dimension on the sixth, then a change to the step before the array: still measuring it
  D.run(`pushUndo(); addDim({kind: 'dia', a: ${JSON.stringify(six[5])}}); 1`);
  assert.equal(D.run('histEdit(0, {r: 5})'), 0);
  assert.deepEqual(ids(), six, 'an earlier step changed: the copies keep their ids');
  assert.equal(D.run('DOC.dims.length'), 1);
  assert.equal(D.run('dimRefOk(DOC.dims[0])'), true, 'the dimension on the sixth still finds it');
  assert.equal(D.run('dimValue(DOC.dims[0])'), 10, 'and measures it: Ø10 now');
  // fewer, then more again: the same ids come back
  assert.equal(D.run('histEdit(1, {n: 4, dx: 25, dy: 0})'), 0);
  assert.deepEqual(ids(), six.slice(0, 4));
  assert.equal(D.run('histEdit(1, {n: 6, dx: 25, dy: 0})'), 0);
  assert.deepEqual(ids(), six, 'back to six: the ids they had');
  // saved and opened again: still so
  const file = JSON.parse(D.run('histAttach(docForStorage(true))'));
  setup();
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'row.454.json');
  D.run('histReplay(histLine(), 0); 1');
  assert.deepEqual(ids(), six, 'opened from a file and done again: the same ids');
});
