// Shapes kept lined up (keep-lined-up.js, Design 0.157.0): with Keep lined up on, the Align buttons also keep shapes
// that way, so a hole centred on a board stays centred when the board changes: by a dimension, a parameter, a step
// changed on the History bar, a move, or the material. Clint, 2026-10-23: "useful when needing to make sure things
// stay where they should when something changes". On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
D.run('if (!HTMLInputElement.prototype.select) HTMLInputElement.prototype.select = function () {}; 1');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
const toasts = [];
D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
const box = (i) => plain(D.run(`(function () { var b = entBBox(DOC.ents[${i}]); return {x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2}; })()`));

// a 200 x 100 board (0), a 10 mm hole (1) and a 30 x 20 slot (2), well off centre; the board's width dimensioned
function drawing(keep) {
  toasts.length = 0;
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 12, zero: 'top', origin: 'fl'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    DOC.keeps = []; DOC.params = [{name: 'width', expr: '200', unit: 'mm', note: ''}];
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = []; UICFG.stockUnits = 'mm';
    UICFG.alignKeep = ${keep ? 'true' : 'false'};
    pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 200, h: 100, layer: 'L1'}); persist();   // step 0
    pushUndo(); DOC.ents.push({t: 'circle', cx: 40, cy: 30, r: 5, layer: 'L1'}); persist();          // step 1
    pushUndo(); DOC.ents.push({t: 'rect', x: 150, y: 90, w: 30, h: 20, layer: 'L1'}); persist();     // step 2
    addDim({kind: 'side', a: entId(DOC.ents[0]), at: hintOf(DOC.ents[0], {x: 100, y: 20})}); persist();
    SEL = []; 1`);
}
function align(sel, op) { D.run(`SEL = ${JSON.stringify(sel)}; alignBtnClick(${JSON.stringify(op)}); 1`); }
function typeDim(i, txt) { D.run(`SEL = []; DRAW = {stage:'dimValue', di:${i}}; DIMSEL = ${i}; toolCommitText(${JSON.stringify(txt)}); DRAW = null; 1`); }

test('Align with Keep lined up off: lined up once, then they come apart (as before)', () => {
  drawing(false);
  align([1, 0], 'center');
  near(box(1).cx, 120); near(box(1).cy, 70);
  assert.equal(D.run('DOC.keeps.length'), 0);
  typeDim(0, '300');
  near(box(1).cx, 120, 'the hole stays where it was');
});

test('centred, and kept: the board made wider by its dimension, the hole stays centred', () => {
  drawing(true);
  align([1, 0], 'center');
  near(box(1).cx, 120); near(box(1).cy, 70);
  assert.equal(D.run('DOC.keeps.length'), 1);
  assert.ok(toasts.some((t) => /^Kept lined up/.test(t)), toasts.join(' / '));
  typeDim(0, '300');
  near(box(0).x1 - box(0).x0, 300, 'the board is 300 wide');
  near(box(1).cx, 170, 'the hole is in the middle of it again'); near(box(1).cy, 70);
  near(box(1).x1 - box(1).x0, 10, 'and the same size');
  D.run('doUndo(); 1');
  near(box(0).x1 - box(0).x0, 200, 'Undo: the board back'); near(box(1).cx, 120, 'and the hole with it');
});

test('an edge in line: kept in that direction only, free in the other', () => {
  drawing(true);
  align([2, 0], 'left');
  near(box(2).x0, 20, 'the slot’s left edge on the board’s');
  D.run(`SEL = [0]; pushUndo('Move'); moveEntity(DOC.ents[0], 15, 7); persist(); 1`);
  near(box(2).x0, 35, 'the board moved: the slot follows across'); near(box(2).y0, 90, 'not up');
  D.run(`SEL = [2]; pushUndo('Move'); moveEntity(DOC.ents[2], 40, -30); persist(); 1`);
  near(box(2).x0, 35, 'moved on its own: put back in line'); near(box(2).y0, 60, 'up and down is its own');
  assert.ok(toasts.some((t) => /stays in line/.test(t)), 'and it says why: ' + toasts.join(' / '));
});

test('a parameter change: the hole follows the board', () => {
  drawing(true);
  align([1, 0], 'hcenter');
  typeDim(0, 'width');                                        // the board's width is the parameter "width"
  D.run(`paramByName('width').expr = '260'; paramsApplyDims(); persist(); 1`);
  near(box(0).x1 - box(0).x0, 260); near(box(1).cx, 150, 'centred left-right'); near(box(1).cy, 30, 'up and down not kept');
});

test('a step changed on the History bar: the steps after it done again, kept in line', () => {
  drawing(true);
  align([1, 0], 'center');
  assert.equal(D.run('histEdit(0, {x: 20, y: 20, w: 300, h: 160})'), 0, 'no step turned red');
  near(box(0).x1 - box(0).x0, 300);
  near(box(1).cx, 170, 'centred across'); near(box(1).cy, 100, 'and up and down');
});

test('a step after it works on the hole where it’s kept, not where it was', () => {
  drawing(true);
  align([1, 0], 'center');
  D.run('SEL = [1]; offOpen(); OFF.dist = 3; offRender(); offApply(); SEL = []; 1');   // a ring 3 mm round the hole
  const ring = D.run('DOC.ents.length - 1');
  near(box(ring).cx, 120);
  assert.equal(D.run('histEdit(0, {x: 20, y: 20, w: 300, h: 160})'), 0, 'no step turned red');
  near(box(1).cx, 170, 'the hole');
  near(box(ring).cx, 170, 'the ring, made from the hole after it was kept in line'); near(box(ring).cy, 100);
});

test('the material: a shape kept centred in it follows when it changes size', () => {
  drawing(true);
  align([0], 'mat');
  near(box(0).cx, 200); near(box(0).cy, 150);
  D.run(`pushUndo(); DOC.stock.w = 600; persist(); 1`);
  near(box(0).cx, 300, 'centred in the wider material');
  toasts.length = 0;
  align([1, 2], 'matx');
  assert.equal(D.run('DOC.keeps.length'), 1, 'two shapes centred as a block: lined up, not kept');
  assert.ok(toasts.some((t) => /group them first/.test(t)), toasts.join(' / '));
});

test('chains: the slot follows the hole, which follows the board', () => {
  drawing(true);
  align([1, 0], 'center');
  align([2, 1], 'vcenter');
  near(box(2).cy, 70);
  D.run(`pushUndo(); DOC.ents[0].h = 200; persist(); 1`);
  near(box(1).cy, 120, 'the hole'); near(box(2).cy, 120, 'and the slot, through it');
});

test('a shape can’t follow itself through others: refused, and said', () => {
  drawing(true);
  align([1, 0], 'center');
  toasts.length = 0;
  const before = D.run('UNDO.length');
  align([0, 1], 'hcenter');                                   // the board following the hole that follows it
  assert.equal(D.run('DOC.keeps.length'), 1, 'not kept');
  assert.equal(D.run('UNDO.length'), before, 'and nothing done: no step');
  assert.ok(toasts.some((t) => /^Not kept lined up/.test(t)), toasts.join(' / '));
  align([1, 0], 'left');                                      // the hole lined up again, another way: the newest wins
  assert.deepEqual(plain(D.run('DOC.keeps.map(function (k) { return k.op; })')), ['left'], 'replaced, across');
});

test('Fillet corners remakes the board: the link moves to the outline that replaced it', () => {
  drawing(true);
  align([1, 0], 'center');
  D.run('SEL = [0]; UICFG.filletR = 6; UICFG.filletType = "round"; UICFG.filletAllWhich = "all"; fallOpen(); fallApply(); SEL = []; 1');
  assert.equal(D.run('DOC.keeps.length'), 1, 'still kept');
  const board = D.run('DOC.ents.findIndex(function (e) { return e._id === DOC.keeps[0].b; })');
  assert.ok(board >= 0, 'on a shape that’s there');
  D.run(`pushUndo(); moveEntity(DOC.ents[${board}], 0, 25); persist(); 1`);
  near(box(D.run('DOC.ents.findIndex(function (e) { return e.t === "circle"; })')).cy, 95, 'and the hole follows it');
  // a tool that makes a new shape where the old one was (as Weld, Join and Trim do): the link moves onto it
  drawing(true);
  align([1, 0], 'center');
  D.run(`pushUndo(); var o = DOC.ents[0]; DOC.ents[0] = {t: 'poly', closed: true, layer: 'L1',
    pts: [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]}; persist(); 1`);
  assert.equal(D.run('DOC.keeps.length && DOC.keeps[0].b === DOC.ents[0]._id'), true, 'onto the new outline');
  D.run(`pushUndo(); moveEntity(DOC.ents[0], -10, 0); persist(); 1`);
  near(box(1).cx, 110, 'and the hole follows it');
});

test('the board deleted: the link goes, and it says so; the marker removes one', () => {
  drawing(true);
  align([1, 0], 'center');
  toasts.length = 0;
  D.run('SEL = [0]; deleteSelection(); 1');
  assert.equal(D.run('DOC.keeps.length'), 0);
  assert.ok(toasts.some((t) => /no longer kept lined up/.test(t)), toasts.join(' / '));
  drawing(true);
  align([1, 0], 'center');
  assert.equal(D.run('SEL = [1]; draw(); keepsShown().length'), 1, 'shown while the hole is selected');
  D.run('keepRemove(DOC.keeps[0]); 1');
  assert.equal(D.run('DOC.keeps.length'), 0);
  typeDim(0, '300');
  near(box(1).cx, 120, 'no longer follows');
  D.run('doUndo(); doUndo(); 1');
  assert.equal(D.run('DOC.keeps.length'), 1, 'Undo brings the link back');
});

test('saved and opened: the links come back; a history kept before links still opens', () => {
  drawing(true);
  align([1, 0], 'center');
  const text = D.run('histAttach(docForStorage(true))');
  const doc = JSON.parse(text);
  assert.equal(doc.keeps.length, 1, 'in the file');
  // a history from before links: one fewer piece in each drawing
  const h = doc.history;
  h.states = h.states.map((s) => s.slice(0, 12)); h.extra = (h.extra || []).map((s) => s.slice(0, 12));
  delete doc.history; delete doc.keeps;
  D.run(`DOC = ${JSON.stringify(doc)}; UNDO = []; REDO = []; 1`);
  assert.equal(D.run(`histTake(${JSON.stringify(h)})`), true, 'the old history is read');
  assert.ok(D.run('UNDO.length') >= 3, 'with its steps');
});

// ---- Concentric, Same width, Same height, Same size (Design 0.158.0) ----
const add = (js) => D.run(`pushUndo(); DOC.ents.push(Object.assign(${js}, {layer: 'L1'})); persist(); DOC.ents.length - 1`);
const size = (i) => { const b = box(i); return { w: +(b.x1 - b.x0).toFixed(6), h: +(b.y1 - b.y0).toFixed(6) }; };

test('Same size, once: the slot made the size of the board, about its own centre; nothing kept', () => {
  drawing(false);
  const c = box(2);
  align([2, 0], 'same');
  assert.deepEqual(size(2), { w: 200, h: 100 });
  near(box(2).cx, c.cx, 'its centre stays'); near(box(2).cy, c.cy);
  assert.equal(D.run('DOC.keeps.length'), 0);
  assert.equal(D.run('UNDO[UNDO.length - 1].name'), 'Same size');
});

test('Same width, kept: the board made wider, the slot follows its width, not its height', () => {
  drawing(true);
  align([2, 0], 'sameW');
  assert.deepEqual(size(2), { w: 200, h: 20 });
  typeDim(0, '260');
  assert.deepEqual(size(2), { w: 260, h: 20 }, 'as wide as the board again, as tall as it was');
  D.run(`pushUndo(); DOC.ents[0].h = 150; persist(); 1`);
  assert.deepEqual(size(2), { w: 260, h: 20 }, 'the board’s height isn’t kept');
});

test('Same size on holes: change one hole’s diameter and the others follow', () => {
  drawing(true);
  const h2 = add(`{t: 'circle', cx: 100, cy: 60, r: 8}`), h3 = add(`{t: 'circle', cx: 160, cy: 60, r: 3}`);
  align([h2, h3, 1], 'same');
  near(D.run(`DOC.ents[${h2}].r`), 5); near(D.run(`DOC.ents[${h3}].r`), 5);
  D.run(`addDim({kind: 'dia', a: entId(DOC.ents[1])}); persist(); 1`);
  typeDim(1, '12');
  near(D.run('DOC.ents[1].r'), 6, 'the first hole');
  near(D.run(`DOC.ents[${h2}].r`), 6, 'the second follows'); near(D.run(`DOC.ents[${h3}].r`), 6, 'and the third');
  near(D.run(`DOC.ents[${h2}].cx`), 100, 'where they were');
});

test('Concentric: an arc’s own centre on the hole’s, not the middle of its box; it follows the hole', () => {
  drawing(true);
  const arc = add(`{t: 'arc', cx: 150, cy: 50, r: 15, a0: 0, a1: Math.PI / 2, ccw: true}`);
  align([arc, 1], 'conc');
  near(D.run(`DOC.ents[${arc}].cx`), 40); near(D.run(`DOC.ents[${arc}].cy`), 30);
  D.run(`SEL = [1]; pushUndo('Move'); moveEntity(DOC.ents[1], 25, 10); persist(); SEL = []; 1`);
  near(D.run(`DOC.ents[${arc}].cx`), 65, 'followed'); near(D.run(`DOC.ents[${arc}].cy`), 40);
  near(D.run(`DOC.ents[${arc}].r`), 15, 'its own size');
});

test('size and place kept together: the slot the size of a block, its left edge on the board’s', () => {
  drawing(true);
  const blk = add(`{t: 'rect', x: 250, y: 150, w: 40, h: 25}`);
  align([2, blk], 'same');
  align([2, 0], 'left');
  D.run(`pushUndo(); DOC.ents[${blk}].w = 80; persist(); 1`);
  assert.deepEqual(size(2), { w: 80, h: 25 }, 'resized');
  near(box(2).x0, 20, 'and still in line with the board, after');
});

test('shapes Same size can’t resize: said, and nothing done; a size can’t follow itself', () => {
  drawing(true);
  const pl = add(`{t: 'poly', closed: true, pts: [[10, 10], [40, 10], [25, 40]]}`);
  toasts.length = 0;
  const before = D.run('UNDO.length');
  align([pl, 0], 'same');
  assert.equal(D.run('UNDO.length'), before, 'no step');
  assert.ok(toasts.some((t) => /^Not those shapes/.test(t)), toasts.join(' / '));
  align([1, 0], 'same');                                      // a hole the size of a board: which way?
  near(D.run('DOC.ents[1].r'), 5, 'a circle takes only a circle’s or an arc’s size');
  align([2, 0], 'sameW');
  toasts.length = 0;
  align([0, 2], 'sameW');
  assert.equal(D.run('DOC.keeps.length'), 1, 'not kept the other way round');
  assert.ok(toasts.some((t) => /^Not kept lined up/.test(t)), toasts.join(' / '));
});
