// Dimensions that follow their shapes (dimension-follow.js): a tool that remakes a shape (Fillet corners turns a
// rectangle into an outline, Join makes lines one outline, Trim remakes what it cuts) moves its dimensions onto the
// shape that's there now, or removes them and says so; a toolpath drops a shape that's gone, and says so. Clint's
// bookstand, 2026-10-23: "5 dimensions lost their reference", and "adding a fillet shouldn't negate a dimension".
// On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.run('if (!HTMLInputElement.prototype.select) HTMLInputElement.prototype.select = function () {}; 1');
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
const toasts = [];
D.run('1'); const realToast = D.toast; D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };

// a 100 x 60 rectangle with its width and height dimensioned, and two lines with their lengths
function drawing() {
  toasts.length = 0;
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'});
    DOC.ents = [{t:'rect', x:20, y:20, w:100, h:60}, {t:'line', x1:150, y1:20, x2:200, y2:20}, {t:'line', x1:200, y1:20, x2:200, y2:90},
                {t:'circle', cx:250, cy:150, r:10}];
    DOC.dims = []; DOC.toolpaths = []; DOC.params = []; UNDO = []; REDO = []; SEL = [];
    persist();
    var R = DOC.ents[0];
    addDim({kind:'side', a:entId(R), at:hintOf(R, {x:70, y:20})});           // 0: the width, on the bottom side
    addDim({kind:'side', a:entId(R), at:hintOf(R, {x:20, y:50})});           // 1: the height, on the left side
    addDim({kind:'len', a:entId(DOC.ents[1])});                              // 2: a line, 50 long
    addDim({kind:'len', a:entId(DOC.ents[2])});                              // 3: a line, 70 long
    addDim({kind:'dia', a:entId(DOC.ents[3])});                              // 4: the circle
    persist(); 1`);
}
const values = () => plain(D.run('DOC.dims.map(function (d) { return dimValue(d); })'));
const kinds = () => plain(D.run('DOC.dims.map(function (d) { return d.kind; })'));
function typeInto(i, txt) { D.run(`DRAW = {stage:'dimValue', di:${i}}; DIMSEL = ${i}; toolCommitText(${JSON.stringify(txt)}); DRAW = null; 1`); }

test('Fillet corners on a rectangle: its width and height dimensions stay, measuring across it', () => {
  drawing();
  D.run('SEL = [0]; UICFG.filletR = 6; fallOpen(); fallApply(); SEL = []; 1');
  assert.notEqual(D.run('DOC.ents[0].t'), 'rect', 'the rectangle is an outline now');
  assert.equal(D.run('DOC.dims.length'), 5, 'no dimension removed');
  const v = values();
  near(v[0], 100, 'the width'); near(v[1], 60, 'the height');
  assert.deepEqual(kinds().slice(0, 2), ['pair', 'pair']);
  assert.equal(D.run('DOC.dims[0].a === DOC.dims[0].b && DOC.dims[0].a === DOC.ents[0]._id'), true, 'across its own two sides');
  assert.ok(!toasts.some((t) => /removed/.test(t)), toasts.join(' / '));
  assert.equal(D.run('DOC.dims.filter(function (d) { return dimLabel(d) === null; }).length'), 0, 'none lost: no warning');
});
test('typing a new width into the filleted outline stretches it, its rounded corners kept', () => {
  drawing();
  D.run('SEL = [0]; UICFG.filletR = 6; fallOpen(); fallApply(); SEL = []; 1');
  const before = plain(D.run('DOC.ents[0].pts'));
  typeInto(0, '130');
  near(values()[0], 130, 'the width'); near(values()[1], 60, 'the height, unchanged');
  const after = plain(D.run('DOC.ents[0].pts'));
  assert.equal(after.length, before.length);
  after.forEach((q, k) => { near(q[2] || 0, before[k][2] || 0, 'the bulge of ' + k); });   // arcs keep their shape
  const xs = after.map((q) => q[0]);
  near(Math.min(...xs), 20, 'the left side stays'); near(Math.max(...xs), 150, 'the right side moves out');
});
test('Join: the lines’ lengths stay, as the lengths of the outline’s edges', () => {
  drawing();
  D.run('SEL = [1, 2]; if (doJoin()) persist(); SEL = []; 1');   // as the Join button does
  assert.equal(D.run('DOC.ents.filter(function (e) { return e.t === "line"; }).length'), 0, 'joined into one outline');
  assert.equal(D.run('DOC.dims.length'), 5);
  assert.deepEqual(kinds().slice(2, 4), ['seg', 'seg']);
  const v = values(); near(v[2], 50); near(v[3], 70);
  typeInto(2, '40');
  near(values()[2], 40, 'typed: the edge is 40 long');
});
test('what can’t be found is removed, and said; Undo brings it back', () => {
  drawing();
  D.run('SEL = [3]; deleteSelection(); 1');                  // the circle, deleted as before: its dimension goes with it
  assert.equal(D.run('DOC.dims.length'), 4);
  drawing();
  D.run(`pushUndo('Remake'); DOC.ents[3] = {t:'circle', cx:40, cy:150, r:4, layer: DOC.ents[3].layer}; persist(); 1`);   // a different circle
  assert.equal(D.run('DOC.dims.length'), 4, 'the diameter of a circle that’s gone is removed');
  assert.ok(toasts.some((t) => /^A dimension was removed \| What it measured is no longer in the drawing\. Undo brings it back\./.test(t)), toasts.join(' / '));
  D.run('doUndo(); 1');
  assert.equal(D.run('DOC.dims.length'), 5, 'Undo');
});
test('the same circle remade (a new shape in the same place): the dimension moves onto it', () => {
  drawing();
  D.run(`pushUndo('Remake'); var c = DOC.ents[3]; DOC.ents[3] = {t:'circle', cx:c.cx, cy:c.cy, r:c.r, layer:c.layer}; persist(); 1`);
  assert.equal(D.run('DOC.dims.length'), 5);
  assert.equal(D.run('DOC.dims[4].a === DOC.ents[3]._id'), true);
  near(values()[4], 20);
});
test('dimensions stranded in a drawing saved before this are removed when it’s opened, and said', () => {
  drawing();
  const d = plain(D.run('JSON.parse(docForStorage())'));
  d.dims.push({ kind: 'side', a: 'gone1', at: { side: 'bottom', t: 0.5 } }, { kind: 'pair', a: 'gone2', b: d.ents[1]._id, aAt: { x: 0, y: 0 }, bAt: { x: 0, y: 0 } });
  toasts.length = 0;
  D.openDrawing(d, 'bookstand.json');
  assert.equal(D.run('DOC.dims.length'), 5);
  assert.ok(toasts.some((t) => /^2 dimensions were removed \| What they measured is no longer in the drawing \(left over from an earlier version\)\./.test(t)), toasts.join(' / '));
});
test('a toolpath that cut a shape that’s gone drops it, and says so', () => {
  drawing();
  D.run(`DOC.toolpaths = [{id:'tp1', name:'Legs Outside', side:'outside', ents:[DOC.ents[0]._id, DOC.ents[3]._id], tabPts:{}, sig:''}]; 1`);
  D.run(`DOC.toolpaths[0].tabPts[DOC.ents[3]._id] = [[1, 2]]; pushUndo('Remake'); DOC.ents.splice(3, 1); persist(); 1`);
  assert.equal(D.run('DOC.toolpaths[0].ents.length'), 1);
  assert.equal(D.run('Object.keys(DOC.toolpaths[0].tabPts).length'), 0, 'its tabs on the shape too');
  assert.ok(toasts.some((t) => /^Legs Outside lost a shape \| .*edit the toolpath and pick the new shape, or it won.t be cut\./.test(t)), toasts.join(' / '));
});

// ---- an outline's edges numbered afresh (Fillet corners, a point added or removed): dimensions found again by where
// their edges were. Clint's filament stand, 2026-10-26: Fillet corners on a joined outline sent five distances to the
// wrong edges, or none ----
// a stand's side, as a polyline: 120 wide, 80 tall, with a foot cut in the bottom; a distance across it (its own two
// sides) and one from its top to a line above
function outline() {
  toasts.length = 0;
  D.run(`DOC.ents = [{t:'poly', closed:true, pts:[[0,0],[30,0],[30,10],[90,10],[90,0],[120,0],[120,80],[0,80]]},
                     {t:'line', x1:0, y1:100, x2:120, y2:100}];
    DOC.dims = []; DOC.toolpaths = []; DOC.keeps = []; UNDO = []; REDO = []; SEL = []; persist();
    var P = DOC.ents[0];
    addDim({kind:'pair', a:entId(P), b:entId(P), edge:false, aAt:hintOf(P, {x:0, y:40}), bAt:hintOf(P, {x:120, y:40})});   // 0: 120 across
    addDim({kind:'pair', a:entId(DOC.ents[1]), b:entId(P), edge:false, aAt:hintOf(DOC.ents[1], {x:60, y:100}), bAt:hintOf(P, {x:60, y:80})});   // 1: 20 to the line
    persist(); 1`);
}
test('Fillet corners on an outline: its distances still measure the same edges', () => {
  outline();
  near(values()[0], 120); near(values()[1], 20);
  D.run('SEL = [0]; UICFG.filletR = 4; UICFG.filletType = "round"; UICFG.filletAllWhich = "all"; fallOpen(); fallApply(); SEL = []; 1');
  assert.ok(D.run('DOC.ents[0].pts.length') > 8, 'rounded: more points');
  assert.equal(D.run('DOC.dims.length'), 2);
  const v = values(); near(v[0], 120, 'across'); near(v[1], 20, 'to the line');
  typeInto(0, '140');
  near(values()[0], 140, 'and typing still stretches it');
  near(values()[1], 20, 'the other kept');
});
test('a point added on an edge: still the same edge; a point dragged: the dimension follows it', () => {
  outline();
  D.run(`pushUndo(); DOC.ents[0].pts.splice(7, 0, [0, 60]); persist(); 1`);       // a point on the left side
  near(values()[0], 120);
  D.run(`pushUndo(); DOC.ents[0].pts.forEach(function (p) { if (p[0] === 120) p[0] = 130; }); persist(); 1`);   // the right side dragged out
  near(values()[0], 130, 'follows the edge moved, as before');
});
test('the edge it measured is gone: removed, and said, not left measuring another', () => {
  outline();
  D.run(`pushUndo(); DOC.ents[0].pts = [[0,0],[120,0],[120,80]]; persist(); 1`);   // the left side and the top: gone
  assert.equal(D.run('DOC.dims.length'), 0, 'both removed');
  assert.ok(toasts.some((t) => /dimensions were removed/.test(t)), toasts.join(' / '));
});
test('a dimension from before outlines’ edges were counted: counted now, and followed after', () => {
  outline();
  D.run(`DOC.dims.forEach(function (d) { if (d.aAt) delete d.aAt.n; if (d.bAt) delete d.bAt.n; }); dimValue(DOC.dims[0]); dimValue(DOC.dims[1]); 1`);
  assert.equal(D.run('DOC.dims[0].aAt.n'), 8, 'counted');
  D.run('SEL = [0]; UICFG.filletR = 4; fallOpen(); fallApply(); SEL = []; 1');
  near(values()[0], 120); near(values()[1], 20);
});
test('a distance whose edges aren’t parallel any more (the shape turned): removed, and said', () => {
  outline();
  D.run(`pushUndo(); DOC.ents[1].y2 = 130; persist(); 1`);                    // the line above, tilted
  assert.equal(D.run('DOC.dims.length'), 1, 'the distance to it removed; the one across kept');
  assert.ok(toasts.some((t) => /aren’t parallel any more/.test(t)), toasts.join(' / '));
  D.run('doUndo(); 1');
  assert.equal(D.run('DOC.dims.length'), 2, 'Undo brings it back');
});
