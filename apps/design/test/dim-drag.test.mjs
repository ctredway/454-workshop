// Dimensions can be dragged out of the way (Clint, 2026-10-22): a distance's line moves out square to itself, its
// value slides along it, and where it sits is kept relative to what it measures. Design's real sources, in Node.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const C = loadDesign();
const D = { run: (js) => vm.runInContext(js, C) };
const J = (js) => JSON.parse(D.run(`JSON.stringify(${js})`));
const r3 = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));

// a 40 x 20 rectangle with its bottom side dimensioned (its width), and a circle with its diameter
function setup() {
  D.run(`setTool('select'); DOC.ents = [{t:'rect', x:0, y:0, w:40, h:20}, {t:'circle', cx:80, cy:10, r:5}];
    DOC.dims = []; UNDO = []; REDO = []; SEL = []; DIMSEL = null; DRAW = null; VIEW.scale = 4;
    addDim({kind:'side', a:entId(DOC.ents[0]), at:{side:'bottom', t:0.5}}); addDim({kind:'dia', a:entId(DOC.ents[1])});`);
}

test('not dragged: drawn on what it measures, as before', () => {
  setup();
  const p = r3(J('dimPlaced(DOC.dims[0])'));
  assert.equal(p.placed, false);
  assert.deepEqual([p.a, p.b, { x: p.x, y: p.y }], [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 }]);
});

test('placed below the side: the line moves out square to it, the value slides along it', () => {
  setup();
  D.run('dimPlaceAt(DOC.dims[0], {x: 30, y: -8});');
  assert.deepEqual(r3(J('DOC.dims[0].place')), { n: -8, s: 10 });
  const p = r3(J('dimPlaced(DOC.dims[0])'));
  assert.deepEqual([p.a, p.b, { x: p.x, y: p.y }], [{ x: 0, y: -8 }, { x: 40, y: -8 }, { x: 30, y: -8 }]);
  assert.deepEqual([p.ea, p.eb], [{ x: 0, y: 0 }, { x: 40, y: 0 }], 'still measuring the side itself');
  assert.equal(J('dimValue(DOC.dims[0])'), 40, 'the value is unchanged');
});

test('it follows the shape: moved, or made wider', () => {
  setup();
  D.run('dimPlaceAt(DOC.dims[0], {x: 20, y: -8}); moveEntity(DOC.ents[0], 100, 50);');
  let p = r3(J('dimPlaced(DOC.dims[0])'));
  assert.deepEqual([p.a, p.b], [{ x: 100, y: 42 }, { x: 140, y: 42 }]);
  D.run('DOC.ents[0].w = 60;');
  p = r3(J('dimPlaced(DOC.dims[0])'));
  assert.deepEqual([p.a, p.b, { x: p.x, y: p.y }], [{ x: 100, y: 42 }, { x: 160, y: 42 }, { x: 130, y: 42 }]);
});

test('a diameter moves its value anywhere, keeping its offset from the circle', () => {
  setup();
  D.run('dimPlaceAt(DOC.dims[1], {x: 95, y: 25});');
  assert.deepEqual(r3(J('DOC.dims[1].place')), { dx: 15, dy: 15 });
  D.run('moveEntity(DOC.ents[1], 10, 0);');
  const p = r3(J('dimPlaced(DOC.dims[1])'));
  assert.deepEqual({ x: p.x, y: p.y }, { x: 105, y: 25 });
});

test('a drag: a small wobble only selects; a real drag moves it as one undo step; Esc puts it back', () => {
  setup();
  // grabbed at its value, which sits a little above the side until it's been dragged
  const lab = J('dimLabelWorld(DOC.dims[0])');
  D.run(`DRAW = {stage:'dimDrag', di:0, gx:0, gy:0, was:null, sx:100, sy:100, moved:false, pushed:false};`);
  D.run(`dimDragTo(DRAW, {x:${lab.x + 0.3}, y:${lab.y}}, 101, 100);`);
  assert.equal(J('DOC.dims[0].place || null'), null, 'a 1 px wobble moves nothing');
  assert.equal(J('UNDO.length'), 0);
  D.run(`dimDragTo(DRAW, {x:20, y:-10}, 100, 150); dimDragTo(DRAW, {x:25, y:-12}, 110, 160); dimDragEnd(DRAW); DRAW = null;`);
  assert.deepEqual(r3(J('DOC.dims[0].place')), { n: -12, s: 5 });
  assert.equal(J('UNDO.length'), 1, 'one undo step for the whole drag');
  D.run('doUndo();');
  assert.equal(J('DOC.dims[0].place || null'), null, 'undo puts it back');
  // Esc in the middle of a drag
  D.run(`DRAW = {stage:'dimDrag', di:0, gx:0, gy:0, was:null, sx:0, sy:0, moved:false, pushed:false};
    dimDragTo(DRAW, {x:20, y:-10}, 50, 50); dimDragCancel(DRAW); DRAW = null;`);
  assert.equal(J('DOC.dims[0].place || null'), null);
});

test('it is picked where it is drawn: on its moved line, not on the shape', () => {
  setup();
  D.run('VIEW.ox = 0; VIEW.oy = 400;');
  // a distance between the rectangle's top and a line above it, dragged off to the right
  D.run(`DOC.ents.push({t:'line', x1:0, y1:30, x2:40, y2:30}); DOC.dims.push({kind:'pair', a:entId(DOC.ents[0]), b:entId(DOC.ents[2]),
    aAt:{side:'top', t:0.5}, bAt:{lx:20, ly:0}}); dimPlaceAt(DOC.dims[2], {x: 60, y: 25});`);
  const p = r3(J('dimPlaced(DOC.dims[2])'));
  const mid = J(`w2s(${(p.a.x + p.b.x) / 2}, ${(p.a.y + p.b.y) / 2})`), was = J(`w2s(${(p.ea.x + p.eb.x) / 2}, ${(p.ea.y + p.eb.y) / 2})`);
  assert.equal(J(`pickDim(${mid.x}, ${mid.y})`), 2, 'on its moved line');
  assert.notEqual(J(`pickDim(${was.x}, ${was.y})`), 2, 'not where it used to be');
});
