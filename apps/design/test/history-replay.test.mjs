// Changing a step on the History bar, and the steps after it done again (history-replay.js), on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// What matters most: done again with nothing changed, every step gives exactly the drawing it gave before; with a
// change, each step after it does what it did, to the shapes as they are, or turns red and does nothing. Never a
// guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const snap = () => D.run('docSnap()');
const names = () => plain(D.run('histSteps().map(function (s) { return s.name + (s.failed ? " (red)" : ""); })'));
const bbox = (i) => plain(D.run(`(function () { var b = entBBox(DOC.ents[${i}]); return {w: +(b.x1 - b.x0).toFixed(6), h: +(b.y1 - b.y0).toFixed(6), x0: +b.x0.toFixed(6), y0: +b.y0.toFixed(6)}; })()`));

function setup() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.params = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    UNDO = []; REDO = []; SEL = []; UICFG.stockUnits = 'mm'; UICFG.filletType = 'round'; UICFG.filletAllWhich = 'all'; 1`);
}
// a session with the real tools: every kind of step
function session() {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();            // 1 Rectangle
    pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 100, r: 20, layer: 'L1'}); persist();                     // 2 Circle
    SEL = [0]; UICFG.filletR = 8; fallOpen(); fallApply();                                                         // 3 Fillet corners 8 mm
    SEL = [1]; offOpen(); OFF.dist = 5; offRender(); offApply();                                                   // 4 Offset 5 mm (shape 2)
    SEL = [2]; selBoxDo('x', 150, {anchor: 'bl', lock: true});                                                     // 5 Move (the offset circle)
    SEL = [0]; selBoxDo('w', 120, {anchor: 'bl', lock: false});                                                    // 6 Resize the filleted rectangle
    SEL = [1]; selBoxDo('r', 30, {anchor: 'c', lock: true});                                                       // 7 Rotate the circle
    pushUndo(); DOC.toolpaths.push({id: 'tp1', name: 'Pocket 1', type: 'pocket', side: 'pocket', ents: [entId(DOC.ents[0])], dia: 6.35, depth: 3, step: 1, feed: 800, plunge: 300, toolChosen: true, rpm: 18000, safeZ: 6, over: 0.2}); persist();   // 8 toolpath
    pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 50, y2: 10, layer: 'L1'}); persist();                  // 9 Line
    pushUndo(); DOC.ents.splice(3, 1); persist();                                                                  // 10 Deleted line
    pushUndo(); DOC.stock.t = 18; persist();                                                                       // 11 Material
    SEL = []; 1`);
}

test('done again with nothing changed, every step gives exactly the drawing it gave the first time', () => {
  session();
  assert.deepEqual(names(), ['Rectangle', 'Circle', 'Fillet corners 8 mm', 'Offset 5 mm', 'Move', 'Resize', 'Rotate 30°',
    'Toolpath Pocket 1', 'Line', 'Deleted line', 'Material']);
  assert.equal(D.run('UNDO.filter(function (e) { return e.recipe; }).length'), 5, 'fillet, offset, move, resize, rotate have recipes');
  const before = plain(D.run('histLine().s.map(histJoin)'));
  const failed = D.run('(function () { var L = histLine(); var f = histReplay(L, 0); window.__after = L.s.map(histJoin); return f; })()');
  assert.equal(failed, 0);
  assert.deepEqual(plain(D.run('__after')), before);
  // and from every step
  for (let k = 1; k < before.length - 1; k++) {
    D.run(`(function () { var L = histLine(); histReplay(L, ${k}); window.__after = L.s.map(histJoin); })()`);
    assert.deepEqual(plain(D.run('__after')), before, 'from step ' + k);
  }
});

test('a rectangle made wider: its fillets, the resize and the toolpath follow; the steps that don’t touch it stay as they were', () => {
  session();
  const circleBefore = bbox(1);
  assert.equal(bbox(0).w, 120);
  const failed = D.run(`histEdit(0, {x: 20, y: 20, w: 150, h: 60})`);
  assert.equal(failed, 0);
  assert.deepEqual(names().slice(0, 3), ['Rectangle', 'Circle', 'Fillet corners 8 mm']);
  assert.equal(bbox(0).w, 120, 'the resize to 120 wide is done again (it set the width)');
  assert.equal(bbox(0).h, 60);
  assert.ok(D.run('DOC.ents[0].pts.length') > 20, 'still filleted');
  assert.deepEqual(bbox(1), circleBefore, 'the circle’s steps stay as they were');
  assert.equal(D.run('DOC.toolpaths[0].ents[0] === DOC.ents[0]._id'), true, 'the toolpath still cuts it');
  // at the step after the fillet, before the resize: 150 wide, filleted
  D.run('histGoTo(3); 1');
  assert.equal(bbox(0).w, 150);
  assert.ok(D.run('DOC.ents[0].pts.some(function (p) { return p[2]; })'), 'with its rounded corners (as arcs)');
  D.run('histGoTo(UNDO.length + REDO.length); 1');
});

test('an offset made bigger: the move of the shape it made still finds it', () => {
  session();
  D.run('histGoTo(4); 1');
  const r0 = bbox(2).w;
  D.run('histGoTo(UNDO.length + REDO.length); 1');
  const failed = D.run(`(function () { var L = histLine(); var i = L.steps.map(function (s) { return s.name; }).indexOf('Offset 5 mm'); return histEdit(i, {dist: 10}); })()`);
  assert.equal(failed, 0);
  assert.ok(names().includes('Offset 10 mm'));
  assert.equal(bbox(2).w, r0 + 10, 'twice the extra 5 mm across');
  assert.equal(bbox(2).x0, 150, 'and still moved to X 150');
});

test('a long way to go again is done in parts with the Working panel up, to exactly the same drawing', async () => {
  session();
  // (two sessions: their shapes' ids differ, and are left out)
  const states = () => plain(D.run('histLine().s.map(histJoin)')).map((t) => t.replace(/"_id":"[^"]*"/g, '').replace(/"ents":\["[^"]*"\]/g, ''));
  const sync = (D.run(`histEdit(0, {x: 20, y: 20, w: 150, h: 60})`), states());
  session();
  D.run('HIST_BUSY_STEPS = 2; HIST_BUSY_PART = 3; 1');                 // (four parts)
  const p = D.run(`histEdit(0, {x: 20, y: 20, w: 150, h: 60})`);
  assert.equal(typeof p.then, 'function', 'a promise');
  assert.equal(D.run('busyNow()'), true, 'the Working panel is up');
  assert.equal(await p, 0);
  D.run('HIST_BUSY_STEPS = 40; HIST_BUSY_PART = 25; 1');
  assert.deepEqual(states(), sync);
});

test('a step whose shape is gone turns red and is skipped, and comes back when the change that lost it is undone', () => {
  session();
  const at = (n) => D.run(`histLine().steps.map(function (s) { return s.name; }).indexOf(${JSON.stringify(n)})`);
  // an inward offset bigger than the circle makes nothing: the offset, and the move of what it made, can't be done
  D.run(`(function () { var L = histLine(), i = ${at('Offset 5 mm')}; L.steps[i].recipe.flip = true; return 1; })()`);
  const failed = D.run(`histEdit(${at('Offset 5 mm')}, {dist: 25})`);
  assert.equal(failed, 2);
  assert.ok(names().includes('Offset 25 mm (red)'));
  assert.ok(names().includes('Move (red)'));
  assert.equal(D.run('DOC.ents.length'), 2, 'nothing made, nothing moved');
  assert.match(D.run('histSteps().filter(function (s) { return s.failed; })[1].failed'), /gone/);
  D.run(`(function () { var L = histLine(); L.steps[${at('Offset 25 mm')}].recipe.flip = false; })(); histEdit(${at('Offset 25 mm')}, {dist: 5})`);
  assert.equal(names().filter((n) => n.endsWith('(red)')).length, 0, 'both done again');
  assert.equal(bbox(2).x0, 150);
});

test('a change made by hand to a shape that has since changed shape turns red: it never guesses', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'poly', pts: [[0, 0], [50, 0], [50, 40], [0, 40]], closed: true, layer: 'L1'}); persist();
    pushUndo(); DOC.ents[0].pts[2] = [60, 45]; persist();                                     // a point dragged by hand
    pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 100, r: 20, layer: 'L1'}); persist(); 1`);
  assert.deepEqual(names(), ['Shape', 'Changed shape', 'Circle']);
  assert.equal(D.run('histEditInfo(histLine(), 0)'), null, 'an outline drawn point by point can’t be changed by number');
  // change the circle: the hand-made change is to another shape, and stays
  assert.equal(D.run(`histEdit(2, {cx: 210, cy: 100, d: 40})`), 0);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts[2]')), [60, 45]);
  assert.equal(D.run('DOC.ents[1].cx'), 210);
});

test('a hand change to a shape an earlier step now makes differently is red, and the drawing is left as that step made it', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'}); persist();
    pushUndo(); DOC.ents[0].x = 5; persist();                                                 // changed by hand (no recipe)
    pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 100, r: 20, layer: 'L1'}); persist(); 1`);
  assert.equal(D.run(`histEdit(0, {x: 0, y: 0, w: 80, h: 40})`), 1);
  assert.deepEqual(names(), ['Rectangle', 'Changed rectangle (red)', 'Circle']);
  assert.equal(D.run('DOC.ents[0].w'), 80);
  assert.equal(D.run('DOC.ents[0].x'), 0, 'the hand change isn’t done to the new rectangle');
  assert.equal(D.run('DOC.ents[1].t'), 'circle', 'the steps after it still are');
  assert.equal(D.run(`histEdit(0, {x: 0, y: 0, w: 50, h: 40})`), 0, 'changed back: done again');
  assert.equal(D.run('DOC.ents[0].x'), 5);
});

test('a shape a step makes again goes on the sheet it went on the first time, not the sheet shown now', () => {
  setup();
  D.run(`DOC.sheets = [{id: 'S1', name: 'Sheet 1'}, {id: 'S2', name: 'Sheet 2'}]; DOC.activeSheet = 'S1';
    pushUndo(); DOC.ents.push({t: 'circle', cx: 50, cy: 50, r: 20, layer: 'L1', sheet: 'S1'}); persist();
    SEL = [0]; offOpen(); OFF.dist = 5; offRender(); offApply();
    pushUndo(); DOC.stock.t = 18; persist(); 1`);
  assert.equal(D.run('DOC.ents[1].sheet'), 'S1');
  D.run(`DOC.activeSheet = 'S2'; 1`);                                          // showing the other sheet
  assert.equal(D.run(`histEdit(1, {dist: 8})`), 0);
  assert.equal(D.run('DOC.ents[1].sheet'), 'S1');
  assert.equal(D.run('DOC.ents[1].r'), 28);
});

test('saved to a file and opened: the recipes, what each step did, and the red steps come too, and can be changed again', () => {
  session();
  const at = (n) => D.run(`histLine().steps.map(function (s) { return s.name; }).indexOf(${JSON.stringify(n)})`);
  D.run(`(function () { var L = histLine(); L.steps[${at('Offset 5 mm')}].recipe.flip = true; })(); histEdit(${at('Offset 5 mm')}, {dist: 25})`);
  const file = JSON.parse(D.run('histAttach(docForStorage(true))'));
  const drawing = snap();
  setup();
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'sign.454.json');
  assert.equal(snap(), drawing);
  assert.ok(names().includes('Offset 25 mm (red)'));
  assert.ok(names().includes('Move (red)'));
  D.run(`(function () { var L = histLine(); L.steps[${at('Offset 25 mm')}].recipe.flip = false; })(); histEdit(${at('Offset 25 mm')}, {dist: 5})`);
  assert.equal(names().filter((n) => n.endsWith('(red)')).length, 0);
  assert.equal(bbox(2).x0, 150);
});

test('steps before a drawing was opened are that drawing’s: changing one leaves the drawing open as it is', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'}); persist(); 1`);
  D.openDrawing(D.run(`({stock: {w: 100, h: 100}, ents: [{t: 'circle', cx: 5, cy: 5, r: 2, layer: 'L1'}], layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1'})`), 'other.454.json');
  const now = snap();
  assert.equal(D.run(`histEdit(0, {x: 0, y: 0, w: 70, h: 40})`), 0);
  assert.equal(snap(), now);
  D.run('histGoTo(1); 1');
  assert.equal(D.run('DOC.ents[0].w'), 70, 'the other drawing, as changed');
});

test('and when that’s done in parts with the Working panel up, too', async () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'}); persist();
    pushUndo(); DOC.stock.t = 15; persist(); 1`);
  D.openDrawing(D.run(`({stock: {w: 100, h: 100}, ents: [{t: 'circle', cx: 5, cy: 5, r: 2, layer: 'L1'}], layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1'})`), 'other.454.json');
  D.run(`pushUndo(); DOC.stock.t = 9; persist(); 1`);
  const now = snap();
  D.run('HIST_BUSY_STEPS = 0; HIST_BUSY_PART = 1; 1');                   // a part per step
  assert.equal(await D.run(`histEdit(0, {x: 0, y: 0, w: 70, h: 40})`), 0);
  D.run('HIST_BUSY_STEPS = 40; HIST_BUSY_PART = 25; 1');
  assert.equal(snap(), now);
  assert.deepEqual(names(), ['Rectangle', 'Material', 'Opened other.454.json', 'Material']);
});

test('the History bar: a double-click opens the step’s numbers; Change does it; a step that can’t be changed says so', () => {
  session();
  D.run('histRender(); 1');
  const chip = (name) => Array.from(D.document.querySelectorAll('#histSteps .hStep')).find((b) => b.textContent === name);
  // the second click of a double-click: on the button the first click's redraw put there
  let last = null;
  const dbl = () => chip(last).dispatchEvent(new D.window.Event('click'));
  last = 'Circle'; chip(last).dispatchEvent(new D.window.Event('click')); D.run('histRender(); 1'); dbl();
  const box = D.document.getElementById('histEdit');
  assert.ok(box, 'opened');
  const inputs = Array.from(box.querySelectorAll('input'));
  assert.deepEqual(Array.from(box.querySelectorAll('.heRow span:first-child')).map((s) => s.textContent), ['Centre X', 'Centre Y', 'Diameter']);
  assert.equal(inputs[2].value, '40.00');
  inputs[2].value = '50';
  Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Change').dispatchEvent(new D.window.Event('click'));
  assert.equal(D.document.getElementById('histEdit'), null, 'closed');
  D.run('histGoTo(2); 1');
  assert.equal(D.run('DOC.ents[1].r'), 25);
  // a step without numbers to change
  D.run('histRender(); 1');
  last = 'Material'; chip(last).dispatchEvent(new D.window.Event('click')); D.run('histRender(); 1'); dbl();
  assert.equal(D.document.getElementById('histEdit'), null);
  assert.equal(D.run('MSG_LOG[0].title'), 'This step can’t be changed');
  // a bad number: kept open
  last = 'Fillet corners 8 mm'; chip(last).dispatchEvent(new D.window.Event('click')); D.run('histRender(); 1'); dbl();
  const b2 = D.document.getElementById('histEdit');
  b2.querySelector('input').value = '-3';
  Array.from(b2.querySelectorAll('button')).find((b) => b.textContent === 'Change').dispatchEvent(new D.window.Event('click'));
  assert.ok(D.document.getElementById('histEdit'), 'kept open');
  Array.from(b2.querySelectorAll('button')).find((b) => b.textContent === 'Cancel').dispatchEvent(new D.window.Event('click'));
  assert.equal(D.document.getElementById('histEdit'), null);
});
