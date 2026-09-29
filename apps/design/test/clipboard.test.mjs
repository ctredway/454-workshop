// Copy, cut and paste (src/js/clipboard.js), with the dimensions on the copied shapes. Run on Design's real
// source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh(from) {
  const D = loadDesign({ start: false });
  if (from) { const c = from.localStorage.getItem('d454DesignClip'); if (c) D.localStorage.setItem('d454DesignClip', c); }
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  return D;
}
// a drawing: two rectangles, the first one's width dimensioned, and the distance between them
function drawing(D) {
  D.run(`DOC.ents = [{t:'rect', x:0, y:0, w:40, h:20}, {t:'rect', x:60, y:0, w:30, h:20}]; DOC.dims = [];
    var r1 = DOC.ents[0], r2 = DOC.ents[1];
    addDim({kind:'side', a:entId(r1), at:hintOf(r1, {x:20, y:0})});
    addDim({kind:'pair', a:entId(r2), b:entId(r1), edge:false, aAt:hintOf(r2, {x:60, y:10}), bAt:hintOf(r1, {x:40, y:10})});
    SEL = []; 1`);
}
const ents = (D) => plain(D.run('DOC.ents'));
const dims = (D) => plain(D.run('DOC.dims'));
const value = (D, i) => D.run(`dimValue(DOC.dims[${i}])`);

test('copying one shape brings its own dimension, measuring the copy; the distance to a shape not copied stays behind', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]');
  assert.equal(D.clipCopy(), true);
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignClip')).dims.length, 1, 'only the width is copied');
  D.clipPaste(true);                                              // in place
  assert.equal(ents(D).length, 3);
  assert.equal(dims(D).length, 3, 'one new dimension: the width');
  const copy = ents(D)[2], nd = dims(D)[2];
  assert.equal(nd.kind, 'side');
  assert.equal(nd.a, copy._id, 'it measures the copy');
  assert.notEqual(copy._id, ents(D)[0]._id, 'the copy is a shape of its own');
  assert.equal(value(D, 2), 40);
  D.run('DOC.ents[2].w = 55');                                    // resize the copy: its dimension follows, the original's doesn't
  assert.equal(value(D, 2), 55);
  assert.equal(value(D, 0), 40);
});
test('copying both shapes brings the distance between them too, measuring the copies', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0, 1]'); D.clipCopy(); D.clipPaste(true);
  assert.equal(dims(D).length, 4);
  const [c1, c2] = ents(D).slice(2), pair = dims(D)[3];
  assert.equal(pair.kind, 'pair');
  assert.equal(pair.a, c2._id); assert.equal(pair.b, c1._id);
  assert.equal(value(D, 3), value(D, 1), 'the same distance');
  D.run('DOC.ents[3].x += 5');                                    // move the second copy: the copied distance grows by 5
  assert.equal(Math.round(value(D, 3) * 1000) / 1000, Math.round((value(D, 1) + 5) * 1000) / 1000);
});
test('Ctrl+V puts the copy centred on the pointer, and snapped', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]'); D.clipCopy();
  D.run('CLIP_OVER = true; MOUSE.snap = {x: 200, y: 100}');
  D.clipPaste(false);
  const c = ents(D)[2];
  assert.deepEqual([c.x + c.w / 2, c.y + c.h / 2], [200, 100]);
  assert.deepEqual([c.w, c.h], [40, 20]);
  assert.deepEqual(plain(D.run('SEL')), [2], 'the copy comes in selected');
});
test('with the pointer off the drawing, the copy goes 10 mm right and down', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]; CLIP_OVER = false'); D.clipCopy(); D.clipPaste(false);
  const c = ents(D)[2];
  assert.deepEqual([c.x, c.y], [10, -10]);
});
test('pasting twice makes two separate copies, each with its own dimension', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]'); D.clipCopy(); D.clipPaste(true); D.clipPaste(true);
  const e = ents(D), d = dims(D);
  assert.equal(e.length, 4); assert.equal(d.length, 4);
  assert.notEqual(e[2]._id, e[3]._id);
  assert.equal(d[2].a, e[2]._id); assert.equal(d[3].a, e[3]._id);
});
test('Cut removes the shapes and their dimensions; pasting brings both back', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]'); assert.equal(D.clipCut(), true);
  assert.equal(ents(D).length, 1);
  assert.equal(dims(D).length, 0, 'the width and the distance both measured the cut shape');
  D.clipPaste(true);
  assert.equal(ents(D).length, 2);
  assert.equal(dims(D).length, 1, 'the width comes back (the distance measured a shape that wasn’t cut)');
  assert.equal(dims(D)[0].a, ents(D)[1]._id);
});
test('Undo takes back a paste, and a cut', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [0]'); D.clipCopy(); D.clipPaste(true);
  D.run('doUndo()');
  assert.equal(ents(D).length, 2); assert.equal(dims(D).length, 2);
  D.run('SEL = [1]'); D.clipCut();
  D.run('doUndo()');
  assert.equal(ents(D).length, 2); assert.equal(dims(D).length, 2);
});
test('Delete removes the dimensions on the deleted shapes (as before), and Undo brings them back', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = [1]; deleteSelection()');
  assert.equal(ents(D).length, 1);
  assert.equal(dims(D).length, 1, 'the width of the first stays; the distance goes');
  D.run('doUndo()');
  assert.equal(dims(D).length, 2);
});
test('what’s copied can be pasted after reopening Design, or in another window', () => {
  const A = fresh(); drawing(A);
  A.run('SEL = [0, 1]'); A.clipCopy();
  const B = fresh(A);
  B.run('DOC.ents = []; DOC.dims = []');
  B.clipPaste(true);
  assert.equal(ents(B).length, 2);
  assert.equal(dims(B).length, 2);
  assert.equal(dims(B)[0].a, ents(B)[0]._id);
});
test('a copy whose layer is hidden or locked goes on the current layer, so it can be seen and edited', () => {
  const D = fresh(); drawing(D);
  D.run(`layersInit(); var L2 = layerNew(); DOC.ents[0].layer = L2; SEL = [0]; 1`);
  D.clipCopy();
  D.run(`layerById(DOC.ents[0].layer).visible = false; DOC.activeLayer = DOC.layers[0].id; 1`);
  D.clipPaste(true);
  assert.equal(ents(D)[2].layer, D.run('DOC.layers[0].id'));
});
test('nothing selected: Copy does nothing; nothing copied: Paste says so and changes nothing', () => {
  const D = fresh(); drawing(D);
  D.run('SEL = []');
  assert.equal(D.clipCopy(), false);
  assert.equal(D.clipPaste(false), false);
  assert.equal(ents(D).length, 2);
});
