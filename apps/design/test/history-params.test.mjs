// Parameters in the History bar's steps (history-replay.js, Design 0.149.0): a step's length can be a parameter or
// arithmetic with one, which the step remembers; change the parameter (or the material's thickness) and the step takes
// the new value, and every step after it is done again, so what was made from it follows. On the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const bbox = (i) => plain(D.run(`(function () { var b = entBBox(DOC.ents[${i}]); return {w: +(b.x1 - b.x0).toFixed(6), h: +(b.y1 - b.y0).toFixed(6)}; })()`));
const names = () => plain(D.run('histSteps().map(function (s) { return s.name + (s.failed ? " (red)" : ""); })'));

// a drawing made with parameters: width = 100, wall = 6; a rectangle, an offset round it, and fillets on the offset
function session() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    DOC.params = [{name: 'width', expr: '100', unit: 'mm', note: ''}, {name: 'wall', expr: '6', unit: 'mm', note: ''}];
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = []; UICFG.stockUnits = 'mm'; UICFG.filletType = 'round'; UICFG.filletAllWhich = 'all';
    pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();                 // 0 Rectangle
    SEL = [0]; offOpen(); OFF.dist = 6; offRender(); offApply();                                                    // 1 Offset 6 mm
    SEL = [1]; UICFG.filletR = 2; fallOpen(); fallApply();                                                          // 2 Fillet corners 2 mm
    SEL = []; 1`);
  // linked: the rectangle's width to "width", the offset's distance to "wall"
  assert.equal(D.run(`histEdit(0, {x: 20, y: 20, w: 100, h: 60}, {w: {e: 'width', u: 'mm'}})`), 0);
  assert.equal(D.run(`histEdit(1, {dist: 6}, {dist: {e: 'wall', u: 'mm'}})`), 0);
}
// change a parameter in the Parameters panel, as typing there does
function setParam(name, expr) {
  D.run(`(function () { var p = paramByName(${JSON.stringify(name)}); paramPanelSetExpr(p, ${JSON.stringify(expr)}, {value: ''}); })(); 1`);
  return D.run('busyIdle()');
}

test('a parameter change: the step using it takes the new value, and what was made from it follows', async () => {
  session();
  assert.deepEqual(bbox(0), { w: 100, h: 60 });
  assert.deepEqual(bbox(1), { w: 112, h: 72 }, 'the offset: 6 mm all round');
  await setParam('width', '150');
  assert.deepEqual(bbox(0), { w: 150, h: 60 }, 'the rectangle follows width');
  assert.deepEqual(bbox(1), { w: 162, h: 72 }, 'the offset, made from it, follows too');
  assert.equal(D.run('DOC.ents[1].t'), 'path', 'still filleted (an outline), not a plain offset');
  await setParam('wall', '10');
  assert.deepEqual(bbox(1), { w: 170, h: 80 }, 'the offset follows wall');
  assert.deepEqual(names().filter((n) => /red/.test(n)), []);
});

test('Undo takes back a parameter change and the steps it did again, at once', async () => {
  session();
  await setParam('width', '150');
  D.run('doUndo(); 1');
  assert.equal(D.run(`paramByName('width').expr`), '100');
  assert.deepEqual(bbox(0), { w: 100, h: 60 });
  assert.deepEqual(bbox(1), { w: 112, h: 72 });
});

test('in the step’s box: a parameter or arithmetic with one is remembered; a plain number unlinks; mistakes are said', () => {
  session();
  const type = (i, text) => {
    D.run(`histEditOpen(${i}, null); 1`);
    const inp = el('histEdit').querySelector('input');
    inp.value = text;
    [...el('histEdit').querySelectorAll('button')].find((b) => b.textContent === 'Change').click();
  };
  D.run('histEditOpen(1, null); 1');
  assert.equal(el('histEdit').querySelector('input').value, 'wall', 'the box shows what it follows');
  assert.match(el('histEdit').querySelector('.heUnit').textContent, /= 6\.00 mm/);
  D.run('histEditClose(); 1');
  type(1, 'wall * 2');
  assert.deepEqual(plain(D.run('UNDO[1].exprs')), { dist: { e: 'wall * 2', u: 'mm' } });
  assert.deepEqual(bbox(1), { w: 124, h: 84 }, '12 mm all round');
  type(1, '5');
  assert.equal(D.run('UNDO[1].exprs'), undefined, 'a plain number: unlinked');
  assert.deepEqual(bbox(1), { w: 110, h: 70 });
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
  try { type(1, 'nosuch + 1'); } finally { D.toast = real; }
  assert.ok(toasts.some((t) => /no parameter called .nosuch./i.test(t)), toasts.join(' / '));
  D.run('histEditClose(); 1');
});

test('saved to a file and opened: the steps still follow their parameters', async () => {
  session();
  const file = JSON.parse(D.run('histAttach(docForStorage(true))'));
  D.run(`DOC.ents = []; UNDO = []; REDO = []; 1`);
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'box.454.json');
  assert.deepEqual(plain(D.run('UNDO[1].exprs')), { dist: { e: 'wall', u: 'mm' } });
  await setParam('wall', '8');
  assert.deepEqual(bbox(1), { w: 116, h: 76 });
});

test('renaming a parameter changes it in the steps; deleting one a step uses is refused', () => {
  session();
  D.run(`paramPanelRename(paramByName('wall'), 'thick', {value: ''}); 1`);
  assert.deepEqual(plain(D.run('UNDO[1].exprs')), { dist: { e: 'thick', u: 'mm' } });
  assert.equal(D.run(`paramUsers(paramByName('thick')).steps`), 1);
  D.run(`paramPanelDelete(paramByName('thick')); 1`);
  assert.ok(D.run(`!!paramByName('thick')`), 'still there');
  assert.match(el('paramSay') ? el('paramSay').textContent : D.run(`paramUsersSay(paramUsers(paramByName('thick')))`), /1 step on the History bar/);
});

test('the material’s thickness: a step using "material" follows Job setup', async () => {
  session();
  assert.equal(D.run(`histEdit(1, {dist: 6}, {dist: {e: 'material / 2', u: 'mm'}})`), 0);
  el('stkT').value = '20'; el('stkT').dispatchEvent(new D.Event('change', { bubbles: true }));
  await D.run('busyIdle()');
  assert.deepEqual(bbox(1), { w: 120, h: 80 }, '10 mm all round: half of 20');
  D.run('doUndo(); 1');
  assert.equal(D.run('DOC.stock.t'), 12, 'one Undo takes back the thickness');
  assert.deepEqual(bbox(1), { w: 112, h: 72 }, 'and the offset with it');
});

test('a value it can’t use (not more than 0): said, and the step keeps its last value', async () => {
  session();
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
  try { await setParam('wall', '0'); } finally { D.toast = real; }
  assert.deepEqual(bbox(1), { w: 112, h: 72 }, 'still 6 mm');
  assert.ok(toasts.some((t) => /can’t be worked out .*Offset.*wall.*more than 0/.test(t)), toasts.join(' / '));
});
