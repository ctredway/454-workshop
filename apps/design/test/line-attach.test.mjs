// Construction lines that stay attached to the point they were drawn from (line-attach.js, Design 0.160.0). Clint,
// 2026-10-25: "I draw a line from the center point of a circle or the midpoint of the line and make it a construction
// line, if I move the circle or shorten the line, the construction line doesn't move with the change".
// On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.toast = () => {};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);

// a circle at (50, 50) and a line from (100, 20) to (180, 20)
function drawing() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top', origin: 'fl'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1'; delete DOC.sheets;
    DOC.ents = [{t: 'circle', cx: 50, cy: 50, r: 10, layer: 'L1'}, {t: 'line', x1: 100, y1: 20, x2: 180, y2: 20, layer: 'L1'}];
    DOC.toolpaths = []; DOC.dims = []; DOC.keeps = []; UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = [];
    VIEW.scale = 2; persist(); 1`);
}
// draw a line with the Line tool, clicking at a then b (snapping as the mouse would), and make it construction (X)
function drawLine(a, b, con = true) {
  D.run(`setTool('line'); DRAW = null;
    toolClick(${JSON.stringify(a)}, resolveSnap(${JSON.stringify(a)})); toolClick(${JSON.stringify(b)}, resolveSnap(${JSON.stringify(b)}));
    DRAW = null; setTool('select'); 1`);
  const i = D.run('DOC.ents.length - 1');
  if (con) D.run(`SEL = [${i}]; pushUndo(); DOC.ents[${i}].con = true; persist(); SEL = []; 1`);
  return i;
}
const line = (i) => plain(D.run(`(function (e) { return {x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, a1: e.a1 || null, a2: e.a2 || null}; })(DOC.ents[${i}])`));
const move = (i, dx, dy) => D.run(`pushUndo('Move'); moveEntity(DOC.ents[${i}], ${dx}, ${dy}); persist(); 1`);

test('from a circle’s centre: the construction line’s end follows the circle; the other end stays', () => {
  drawing();
  const c = drawLine({ x: 50.3, y: 49.8 }, { x: 120, y: 90 });
  let l = line(c);
  near(l.x1, 50); near(l.y1, 50, 'snapped to the centre');
  assert.ok(l.a1 && l.a1.k === 'center', 'and attached to it');
  assert.equal(l.a2, null, 'the other end, on the grid: not attached');
  move(0, 30, -10);
  l = line(c);
  near(l.x1, 80); near(l.y1, 40, 'moved with the circle');
  near(l.x2, 120); near(l.y2, 90, 'the free end stays');
  D.run('doUndo(); 1');
  near(line(c).x1, 50, 'Undo: back together');
});

test('from a line’s midpoint: shorten the line, the construction line follows the middle', () => {
  drawing();
  const c = drawLine({ x: 140, y: 20.2 }, { x: 140, y: 80 });
  near(line(c).x1, 140); near(line(c).y1, 20);
  D.run(`pushUndo(); DOC.ents[1].x2 = 160; persist(); 1`);          // 100 to 160: the middle is 130
  near(line(c).x1, 130, 'onto the new middle'); near(line(c).y1, 20);
  D.run(`DOC.dims = []; addDim({kind: 'len', a: entId(DOC.ents[1])}); persist();
    DRAW = {stage: 'dimValue', di: 0}; DIMSEL = 0; toolCommitText('40'); DRAW = null; 1`);   // typed: 40 long
  near(line(c).x1, 120, 'a dimension typed: follows too');
});

test('a construction line moved by itself lets go; a shape deleted, it stays where it is', () => {
  drawing();
  const c = drawLine({ x: 50, y: 50 }, { x: 120, y: 90 });
  move(c, 5, 5);
  assert.equal(line(c).a1, null, 'moved on its own: no longer attached');
  move(0, 20, 0);
  near(line(c).x1, 55, 'and the circle no longer moves it');
  drawing();
  const d = drawLine({ x: 50, y: 50 }, { x: 120, y: 90 });
  D.run('SEL = [0]; deleteSelection(); SEL = []; 1');
  const k = D.run('DOC.ents.findIndex(function (e) { return e.t === "line" && e.con; })');
  assert.equal(line(k).a1, null); near(line(k).x1, 50, 'where it was');
  assert.ok(d >= 0);
});

test('moved together with its circle: still attached', () => {
  drawing();
  const c = drawLine({ x: 50, y: 50 }, { x: 120, y: 90 });
  D.run(`pushUndo('Move'); moveEntity(DOC.ents[0], 10, 10); moveEntity(DOC.ents[${c}], 10, 10); persist(); 1`);
  assert.ok(line(c).a1, 'still attached');
  move(0, 5, 0);
  near(line(c).x1, 65, 'and still follows');
});

test('a line that isn’t construction doesn’t follow, and doesn’t jump when made construction later', () => {
  drawing();
  const c = drawLine({ x: 50, y: 50 }, { x: 120, y: 90 }, false);
  move(0, 30, 0);
  near(line(c).x1, 50, 'a cutting line stays put');
  assert.equal(line(c).a1, null, 'and lets go');
  D.run(`pushUndo(); DOC.ents[${c}].con = true; persist(); 1`);
  near(line(c).x1, 50, 'made construction: no jump');
});

test('a step changed on the History bar: the construction line follows the circle there too', () => {
  drawing();
  D.run(`UNDO = []; REDO = []; pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 150, r: 8, layer: 'L1'}); persist(); 1`);   // step 0
  const c = drawLine({ x: 200, y: 150 }, { x: 260, y: 150 });
  // a small circle mirrored about the construction line, after it: done again about the line where it is then
  D.run(`pushUndo(); DOC.ents.push({t: 'circle', cx: 230, cy: 170, r: 5, layer: 'L1'}); persist(); 1`);
  const b = D.run('DOC.ents.length - 1');
  D.run(`SEL = [${b}, ${c}]; mirOpen(); mirApply(); SEL = []; 1`);
  const copy = D.run('DOC.ents.length - 1');
  near(D.run(`DOC.ents[${copy}].cy`), 130, 'mirrored across the line, as drawn');
  assert.equal(D.run(`histEdit(0, {cx: 210, cy: 140, d: 16})`), 0, 'no step turned red');
  near(line(c).x1, 210); near(line(c).y1, 140);
  // the mirror line now runs from (210, 140) to (260, 150): (230, 170) mirrored across it
  const ux = 50 / Math.hypot(50, 10), uy = 10 / Math.hypot(50, 10), px = 230 - 210, py = 170 - 140, t = px * ux + py * uy;
  near(D.run(`DOC.ents[${copy}].cx`), 210 + 2 * t * ux - px, 'the copy, across the line where it is now');
  near(D.run(`DOC.ents[${copy}].cy`), 140 + 2 * t * uy - py);
});

test('Fillet corners on a rectangle: a line from its centre stays on the middle; one from a rounded corner lets go', () => {
  drawing();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 150, y: 100, w: 60, h: 40, layer: 'L1'}); persist(); 1`);
  const r = D.run('DOC.ents.length - 1');
  const mid = drawLine({ x: 180, y: 120 }, { x: 250, y: 190 }), corner = drawLine({ x: 150, y: 100 }, { x: 120, y: 190 });
  D.run(`SEL = [${r}]; UICFG.filletR = 5; UICFG.filletType = 'round'; UICFG.filletAllWhich = 'all'; fallOpen(); fallApply(); SEL = []; 1`);
  assert.ok(line(mid).a1, 'the centre: still attached'); assert.equal(line(corner).a1, null, 'the rounded corner: let go');
  move(r, 10, 0);
  near(line(mid).x1, 190, 'follows the filleted shape’s middle');
  near(line(corner).x1, 150, 'the other stays');
});
