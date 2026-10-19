// More tools whose steps are done again by the tool itself when an earlier step changes (history-replay.js): a single
// corner's fillet, Mirror, Weld (and Subtract, Intersect), and dragging the selection's handles. On the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// What matters most, as for every step: done again with nothing changed, exactly what it gave before; the shapes it
// made keep their ids, so the steps after them still find them; and when it can't tell what to do, it's red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const snap = () => D.run('docSnap()');
const names = () => plain(D.run('histSteps().map(function (s) { return s.name + (s.failed ? " (red)" : ""); })'));
const at = (n) => D.run(`histSteps().map(function (s) { return s.name; }).indexOf(${JSON.stringify(n)})`);
const box = (expr) => plain(D.run(`(function () { var b = entBBox(${expr}); return {x0: +b.x0.toFixed(4), y0: +b.y0.toFixed(4), w: +(b.x1 - b.x0).toFixed(4), h: +(b.y1 - b.y0).toFixed(4)}; })()`));
const byId = (id) => `entById(${JSON.stringify(id)})`;

function setup() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.params = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    UNDO = []; REDO = []; SEL = []; UICFG.stockUnits = 'mm'; UICFG.filletType = 'round'; VIEW.scale = 3; HANDLES.pivot = null; 1`);
}
// dragging a handle, as the pointer does: from the start to a point, then let go
function drag(kind, to, extra) {
  D.run(`(function () {
    var b0 = selBBox(), h = Object.assign({kind: ${JSON.stringify(kind)}}, ${JSON.stringify(extra || {})});
    var Dr = {stage: 'xform', h: h, b0: b0, start: ${JSON.stringify(to.from)}, pushed: false,
              pivot: {x: (b0.x0 + b0.x1) / 2, y: (b0.y0 + b0.y1) / 2}, snaps: SEL.map(function (si) { return snapJSON(DOC.ents[si]); })};
    xformApply(Dr, ${JSON.stringify(to.mid)}, false, false);
    xformApply(Dr, ${JSON.stringify(to.end)}, false, false);
    persist();
  })(); 1`);
}
function session() {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();             // Rectangle
    doFillet({x: 120, y: 80}, 10); persist();                                                                      // Fillet 10 mm (top right)
    pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 60, r: 20, layer: 'L1'}); persist();                      // Circle
    pushUndo(); DOC.ents.push({t: 'line', x1: 250, y1: 0, x2: 250, y2: 200, layer: 'L1'}); persist();              // Line (to mirror about)
    MIR = {objs: [1], line: 2, slot: 'objs'}; mirApply();                                                          // Mirror
    pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 150, w: 60, h: 40, layer: 'L1'}); persist();                   // Rectangle
    pushUndo(); DOC.ents.push({t: 'rect', x: 60, y: 170, w: 60, h: 40, layer: 'L1'}); persist();                   // Rectangle
    SEL = [4, 5]; boolApply('weld'); persist(); 1`);                                                               // Weld
  const weld = D.run('DOC.ents[DOC.ents.length - 1]._id'), mirrored = D.run('DOC.ents[3]._id');
  D.run(`pushUndo(); DOC.toolpaths.push({id: 'tp1', name: 'Profile 1', type: 'profile', side: 'outside', ents: [${JSON.stringify(weld)}], dia: 6.35, depth: 3, step: 1, feed: 800, plunge: 300, toolChosen: true, rpm: 18000, safeZ: 6, over: 0.2}); persist();
    SEL = [DOC.ents.indexOf(${byId(weld)})]; selBoxDo('x', 200, {anchor: 'bl', lock: true});                       // Move (the weld)
    SEL = [DOC.ents.indexOf(${byId(weld)})]; 1`);
  // Rotate the weld a quarter turn about its middle (250, 180): from the right of the middle to above it
  drag('rot', {from: {x: 300, y: 180}, mid: {x: 290, y: 200}, end: {x: 250, y: 230}});
  D.run(`SEL = [0]; 1`);
  drag('br', {from: {x: 120, y: 20}, mid: {x: 130, y: 15}, end: {x: 140, y: 20 - 12}}, {wx: 120, wy: 20, ax: 20, ay: 80});   // Scale (the rectangle)
  D.run('SEL = []; 1');
  return {weld, mirrored};
}

test('fillet, mirror, weld and the handles name their steps, and done again with nothing changed give exactly what they gave', () => {
  session();
  assert.deepEqual(names(), ['Rectangle', 'Fillet 10 mm', 'Circle', 'Line', 'Mirror', 'Rectangle', 'Rectangle', 'Weld',
    'Toolpath Profile 1', 'Move', 'Rotate 90°', 'Scale 120%']);
  const before = plain(D.run('histLine().s.map(histJoin)'));
  for (let k = 0; k < before.length - 1; k++) {
    const f = D.run(`(function () { var L = histLine(); var f = histReplay(L, ${k}); window.__after = L.s.map(histJoin); return f; })()`);
    assert.equal(f, 0, 'from step ' + k);
    assert.deepEqual(plain(D.run('__after')), before, 'from step ' + k);
  }
});

test('a rectangle made bigger: its corner is rounded again, the same corner, and so is everything after', () => {
  session();
  assert.equal(D.run(`histEdit(0, {x: 20, y: 20, w: 140, h: 60})`), 0);
  D.run(`histGoTo(${at('Fillet 10 mm') + 1}); 1`);
  const e = plain(D.run('DOC.ents[0]'));
  assert.equal(box('DOC.ents[0]').w, 140);
  // the rounded corner is still the top right one: the arc's ends are 10 mm from where the corner was
  const ends = e.pts.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  assert.ok(ends.some((p) => p[0] === 150 && p[1] === 80), 'arc starts 10 mm left of the top right corner');
  assert.ok(ends.some((p) => p[0] === 160 && p[1] === 70), 'and ends 10 mm below it');
  assert.ok(!ends.some((p) => p[0] === 160 && p[1] === 80), 'the corner itself is gone');
});

test('a fillet’s radius changed', () => {
  session();
  assert.equal(D.run(`histEdit(${at('Fillet 10 mm')}, {r: 20})`), 0);
  assert.ok(names().includes('Fillet 20 mm'));
  D.run(`histGoTo(${at('Fillet 20 mm') + 1}); 1`);
  const ends = plain(D.run('DOC.ents[0].pts')).map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  assert.ok(ends.some((p) => p[0] === 100 && p[1] === 80));
});

test('a circle made bigger: its mirror copy follows, and keeps its id', () => {
  const ids = session();
  assert.equal(D.run(`histEdit(${at('Circle')}, {cx: 200, cy: 60, d: 60})`), 0);
  assert.ok(D.run(`!!${byId(ids.mirrored)}`), 'the copy has the same id');
  assert.equal(D.run(`${byId(ids.mirrored)}.r`), 30);
  D.run(`histGoTo(${at('Mirror') + 1}); 1`);
  assert.deepEqual(box(byId(ids.mirrored)), {x0: 270, y0: 30, w: 60, h: 60}, 'mirrored about X 250');
});

test('a welded rectangle made wider: the weld is done again into the shape with the same id, and the move and toolpath follow it', () => {
  const ids = session();
  const firstRect = D.run(`histSteps().map(function (s) { return s.name; }).lastIndexOf('Rectangle') - 1`);
  assert.equal(D.run(`histEdit(${firstRect}, {x: 20, y: 150, w: 120, h: 40})`), 0);
  D.run(`histGoTo(${at('Move') + 1}); 1`);
  const w = box(byId(ids.weld));
  assert.equal(w.x0, 200, 'still moved to X 200');
  assert.equal(w.w, 120, 'now 120 wide: 20 to 140, past the second rectangle');
  D.run('histGoTo(UNDO.length + REDO.length); 1');
  assert.deepEqual(box(byId(ids.weld)), {x0: 230, y0: 120, w: 60, h: 120}, 'and turned a quarter about its new middle');
  assert.equal(D.run('DOC.toolpaths[0].ents[0]'), ids.weld);
  assert.equal(D.run('DOC.ents.filter(function (e) { return e.t === "rect" && e.y === 150; }).length'), 0, 'the rectangles welded away');
});

test('a corner whose outline now has a different number of corners turns red: it never rounds a guess', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();
    doFillet({x: 120, y: 80}, 10); persist();
    doFillet({x: 20, y: 20}, 10); persist(); 1`);
  assert.deepEqual(names(), ['Rectangle', 'Fillet 10 mm', 'Fillet 10 mm']);
  // the first fillet too big to fit: it's red, so the outline has 4 corners again, and the second can't tell which
  assert.equal(D.run(`histEdit(1, {r: 70})`), 2);
  assert.deepEqual(names(), ['Rectangle', 'Fillet 70 mm (red)', 'Fillet 10 mm (red)']);
  assert.match(D.run('histSteps()[2].failed'), /different number of corners/);
  assert.equal(D.run(`histEdit(1, {r: 10})`), 0, 'put right: both back');
});

test('a T-bone changed: it still goes into the edge it was clicked nearer to', () => {
  const tbone = (r) => {
    setup();
    D.run(`UICFG.filletType = 'tbone'; pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();
      doFillet({x: 120, y: 78}, ${r}); persist(); 1`);                    // just below the corner: into the right-hand (shorter) edge
    return plain(D.run('DOC.ents[0].pts'));
  };
  const fresh = tbone(4);
  tbone(3);
  assert.equal(D.run(`histEdit(1, {r: 4})`), 0);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts')), fresh);
  D.run(`UICFG.filletType = 'round'; 1`);
});

test('a mirror whose line has gone is red', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 60, r: 20, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 250, y1: 0, x2: 250, y2: 200, layer: 'L1'}); persist();
    MIR = {objs: [0], line: 1, slot: 'objs'}; mirApply(); 1`);
  // (no step can take the line away before it yet: as if one had)
  const f = D.run(`(function () { var L = histLine(); L.s[2] = L.s[1]; return histReplay(L, 2) + ' ' + L.steps[2].failed; })()`);
  assert.equal(f, '1 The line it mirrors about is gone.');
});

test('the handles’ drags: the angle and the scale can be changed, about the same point of the box', () => {
  const ids = session();
  assert.equal(D.run(`histEdit(${at('Scale 120%')}, {sx: 1.5, sy: 1.5})`), 0);
  assert.ok(names().includes('Scale 150%'));
  const r = box('DOC.ents[0]');
  assert.equal(r.w, 150);
  assert.equal(r.x0, 20, 'scaled away from the left edge, as dragged');
  assert.deepEqual(box(byId(ids.weld)), {x0: 220, y0: 130, w: 60, h: 100}, 'a quarter turn: 60 wide, 100 tall, about its middle');
  assert.equal(D.run(`histEdit(${at('Rotate 90°')}, {ang: 180})`), 0);
  assert.ok(names().includes('Rotate 180°'));
  assert.deepEqual(box(byId(ids.weld)), {x0: 200, y0: 150, w: 100, h: 60}, 'a half turn: as wide as it was, about the same middle');
});

test('a mirror whose line is gone, and a weld with nothing left to weld, turn red and say why', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 60, r: 20, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 250, y1: 0, x2: 250, y2: 200, layer: 'L1'}); persist();
    MIR = {objs: [0], line: 1, slot: 'objs'}; mirApply();
    pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 150, w: 60, h: 40, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'rect', x: 60, y: 170, w: 60, h: 40, layer: 'L1'}); persist();
    SEL = [3, 4]; boolApply('weld'); persist(); 1`);
  // the second rectangle moved off the first: they no longer overlap
  assert.equal(D.run(`histEdit(4, {x: 300, y: 250, w: 60, h: 40})`), 1);
  assert.match(D.run('histSteps()[5].failed'), /./);
  // the line made a point: nothing to mirror about
  assert.equal(D.run(`histEdit(1, {x1: 250, y1: 0, x2: 250, y2: 0})`), 2);
  assert.match(D.run('histSteps()[2].failed'), /no length/);
});

test('saved and opened: a weld done again still gives its shape the same id', () => {
  const ids = session();
  const file = JSON.parse(D.run('histAttach(docForStorage(true))'));
  setup();
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'w.454.json');
  const firstRect = D.run(`histSteps().map(function (s) { return s.name; }).lastIndexOf('Rectangle') - 1`);
  assert.equal(D.run(`histEdit(${firstRect}, {x: 20, y: 150, w: 90, h: 40})`), 0);
  assert.ok(D.run(`!!${byId(ids.weld)}`));
  assert.equal(D.run('DOC.toolpaths[0].ents[0]'), ids.weld);
});
