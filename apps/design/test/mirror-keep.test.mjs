// Mirrored copies that stay mirrored (mirror-keep.js, Design 0.160.0). Clint, 2026-10-25: "I draw a set of circles and I
// use the dimension tool to set them a certain distance from a line, if I mirror those circles, if I move the originals
// or change the dimension value, the mirrored vectors should move as well". On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.run('if (!HTMLInputElement.prototype.select) HTMLInputElement.prototype.select = function () {}; 1');
const toasts = [];
D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);

// a line (0) along y = 20, two circles (1, 2) above it, the first held 30 mm from the line by a dimension, and a
// construction line (3) at x = 150 to mirror about
function drawing(keep = true) {
  toasts.length = 0;
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top', origin: 'fl'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1'; delete DOC.sheets;
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.keeps = []; DOC.params = []; UNDO = []; REDO = []; SEL = [];
    HIST_EDITS = []; HIST_EDITS_UNDONE = []; UICFG.mirrorKeep = ${keep}; UICFG.stockUnits = 'mm';
    pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 20, x2: 140, y2: 20, layer: 'L1'}); persist();                 // step 0
    pushUndo(); DOC.ents.push({t: 'circle', cx: 40, cy: 50, r: 6, layer: 'L1'}); persist();                         // step 1
    pushUndo(); DOC.ents.push({t: 'circle', cx: 90, cy: 70, r: 4, layer: 'L1'}); persist();                         // step 2
    pushUndo(); DOC.ents.push({t: 'line', x1: 150, y1: 0, x2: 150, y2: 200, con: true, layer: 'L1'}); persist();    // step 3
    addDim({kind: 'pair', a: entId(DOC.ents[0]), b: entId(DOC.ents[1]), edge: false}); persist();
    SEL = [1, 2, 3]; mirOpen(); mirApply(); SEL = []; 1`);
}
const c = (i) => plain(D.run(`(function (e) { return {cx: e.cx, cy: e.cy, r: e.r}; })(DOC.ents[${i}])`));
function typeDim(i, txt) { D.run(`SEL = []; DRAW = {stage:'dimValue', di:${i}}; DIMSEL = ${i}; toolCommitText(${JSON.stringify(txt)}); DRAW = null; 1`); }

test('mirrored: the copies are across the line, and kept', () => {
  drawing();
  assert.equal(D.run('DOC.ents.length'), 6);
  near(c(4).cx, 260); near(c(4).cy, 50); near(c(5).cx, 210); near(c(5).cy, 70);
  assert.equal(D.run('DOC.keeps.filter(function (k) { return k.op === "mirror"; }).length'), 2);
});

test('the dimension changed: the original moves, and its copy with it', () => {
  drawing();
  typeDim(0, '45');
  near(c(1).cy, 65, 'the original, 45 from the line');
  near(c(4).cy, 65, 'the copy too'); near(c(4).cx, 260);
  D.run('doUndo(); 1');
  near(c(4).cy, 50, 'Undo: back');
});

test('an original moved or made bigger, or the mirror line moved: the copies follow', () => {
  drawing();
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[2], 20, 0); persist(); 1`);
  near(c(5).cx, 190, 'moved right: the copy moves left'); near(c(5).cy, 70);
  D.run(`pushUndo(); DOC.ents[1].r = 9; persist(); 1`);
  near(c(4).r, 9, 'bigger: the copy too');
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[3], 10, 0); persist(); 1`);
  near(c(4).cx, 280, 'the mirror line 10 to the right: 20 further across'); near(c(5).cx, 210);
});

test('a copy changed by itself lets go, and says so; the original then moves on its own', () => {
  drawing();
  D.run(`SEL = [4]; pushUndo('Move'); moveEntity(DOC.ents[4], 0, -15); persist(); SEL = []; 1`);
  assert.ok(toasts.some((t) => /no longer kept mirrored/.test(t)), toasts.join(' / '));
  assert.equal(D.run('DOC.keeps.length'), 1, 'that one let go; the other still kept');
  near(c(4).cy, 35, 'where it was moved');
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[1], 0, 5); persist(); 1`);
  near(c(4).cy, 35, 'the original moving no longer moves it');
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[2], 0, 5); persist(); 1`);
  near(c(5).cy, 75, 'the other still follows');
});

test('everything moved together, the line too: still kept', () => {
  drawing();
  D.run(`pushUndo('Move'); [0, 1, 2, 3, 4, 5].forEach(function (i) { moveEntity(DOC.ents[i], 7, 3); }); persist(); 1`);
  assert.equal(D.run('DOC.keeps.length'), 2);
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[1], 0, 10); persist(); 1`);
  near(c(4).cy, 63, 'and still follows');
});

test('unticked: plain copies, nothing kept', () => {
  drawing(false);
  assert.equal(D.run('DOC.keeps.length'), 0);
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[1], 0, 10); persist(); 1`);
  near(c(4).cy, 50, 'the copy stays');
});

test('an original deleted: the copy stays as it is, and it says so', () => {
  drawing();
  D.run('SEL = [1]; deleteSelection(); SEL = []; 1');
  assert.ok(toasts.some((t) => /no longer kept mirrored/.test(t)), toasts.join(' / '));
  const copy = plain(D.run('DOC.ents.filter(function (e) { return e.t === "circle" && e.cx === 260; }).map(function (e) { return e.cy; })'));
  assert.deepEqual(copy, [50]);
});

test('a step changed on the History bar: the copy is mirrored from the original as it is then', () => {
  drawing();
  assert.equal(D.run('histEdit(2, {cx: 100, cy: 90, d: 10})'), 0, 'no step turned red');
  near(c(5).cx, 200); near(c(5).cy, 90); near(c(5).r, 5);
  assert.equal(D.run('DOC.keeps.filter(function (k) { return k.op === "mirror"; }).length'), 2, 'still kept');
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[2], 0, -10); persist(); 1`);
  near(c(5).cy, 80, 'and still follows');
});

test('saved and opened: still kept', () => {
  drawing();
  const text = D.run('docForStorage()');
  D.run(`DOC = JSON.parse(${JSON.stringify(text)}); UNDO = []; REDO = []; persist(); 1`);
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[2], 0, 10); persist(); 1`);
  near(c(5).cy, 80);
});

test('a later step works on the copy where it’s kept: an offset round it, after its original moved', () => {
  drawing();
  D.run(`pushUndo('Move'); histRecipe({op: 'move', ids: [entId(DOC.ents[2])], dx: 0, dy: 20}); moveEntity(DOC.ents[2], 0, 20); persist(); 1`);
  near(c(5).cy, 90, 'the copy followed');
  D.run('SEL = [5]; offOpen(); OFF.dist = 3; offRender(); offApply(); SEL = []; 1');
  const ring = D.run('DOC.ents.length - 1');
  near(c(ring).cy, 90, 'a ring round the copy, where it is');
  assert.equal(D.run('histEdit(2, {cx: 90, cy: 60, d: 8})'), 0, 'no step turned red');
  near(c(5).cy, 80, 'the copy: the original from 60, moved 20');
  near(c(ring).cy, 80, 'and the ring made round it there');
});
