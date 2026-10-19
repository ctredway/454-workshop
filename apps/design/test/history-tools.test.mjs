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

// the pointer on the drawing, as a mouse moves it: drawing X, Y (1 mm a pixel, zero at 100, 500 on the canvas)
function pointer(type, x, y, buttons) {
  D.run(`(function () { var e = new Event(${JSON.stringify(type)}); e.clientX = ${100 + x}; e.clientY = ${500 - y}; e.buttons = ${buttons}; e.button = 0; e.pointerId = 1; cv.dispatchEvent(e); })(); 1`);
}
function canvasReady() {
  D.run(`cv.setPointerCapture = function () {}; cv.getBoundingClientRect = function () { return {left: 0, top: 0, width: 800, height: 600}; };
    VIEW.scale = 1; VIEW.ox = 100; VIEW.oy = 500; 1`);
}
function dragPoint(ent, from, to) {
  D.run(`setTool('node'); NODE = {ent: ${ent}, drag: null}; 1`);
  pointer('pointermove', from[0], from[1], 0);
  pointer('pointerdown', from[0], from[1], 1);
  pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 1);
  pointer('pointermove', to[0], to[1], 1);
  pointer('pointerup', to[0], to[1], 0);
  D.run(`setTool('select'); persist(); 1`);
}

test('a point dragged with the Node tool: the same point, moved as far, after the shape was moved somewhere else; and how far can be changed', () => {
  setup(); canvasReady();
  D.run(`pushUndo(); DOC.ents.push({t: 'poly', pts: [[0, 0], [50, 0], [50, 40], [0, 40]], closed: true, layer: 'L1'}); persist();
    SEL = [0]; selBoxDo('x', 100, {anchor: 'bl', lock: true}); SEL = []; 1`);
  dragPoint(0, [150, 40], [160, 50]);
  assert.deepEqual(names(), ['Shape', 'Move', 'Move point 3']);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts[2]')), [160, 50]);
  assert.equal(D.run(`histEdit(1, {v: 200})`), 0);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts')), [[200, 0], [250, 0], [260, 50], [200, 40]]);
  assert.equal(D.run(`histEdit(2, {dx: 20, dy: 0})`), 0);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts[2]')), [270, 40]);
});

test('a point dragged on an outline that has a different number of points by then is red', () => {
  setup(); canvasReady();
  D.run(`pushUndo(); DOC.ents.push({t: 'poly', pts: [[0, 0], [50, 0], [50, 40], [0, 40]], closed: true, layer: 'L1'}); persist();
    VIEW.scale = 3; doFillet({x: 0, y: 0}, 5); VIEW.scale = 1; persist(); 1`);
  const n = D.run('DOC.ents[0].pts.length');
  dragPoint(0, [50, 40], [60, 50]);
  assert.equal(D.run('UNDO[2].recipe.n'), n);
  assert.equal(D.run(`histEdit(1, {r: 100})`), 2, 'the fillet doesn’t fit, so the outline has 4 points again');
  assert.match(D.run('histSteps()[2].failed'), /different number of points/);
});

test('Join done again on lines changed before it; as two pieces if they no longer meet', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 50, y2: 0, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 50, y1: 0, x2: 50, y2: 30, layer: 'L1'}); persist();
    SEL = [0, 1]; doJoin(); persist(); 1`);
  const joined = D.run('DOC.ents[0]._id');
  D.run(`SEL = [0]; selBoxDo('x', 100, {anchor: 'bl', lock: true}); SEL = []; 1`);
  assert.deepEqual(names().slice(0, 4), ['Line', 'Line', 'Join', 'Move']);
  // both lines longer, still meeting: joined again, the same shape, and still moved
  assert.equal(D.run(`histEdit(0, {x1: -20, y1: 0, x2: 50, y2: 0})`), 0);
  assert.equal(D.run(`histEdit(1, {x1: 50, y1: 0, x2: 50, y2: 60})`), 0);
  assert.equal(D.run('DOC.ents.length'), 1);
  assert.equal(D.run('DOC.ents[0]._id'), joined);
  assert.deepEqual(plain(D.run('DOC.ents[0].pts')), [[100, 0], [170, 0], [170, 60]]);
  // the second line moved away: they don't meet, so Join leaves them as two pieces, as it would if used on them now
  assert.equal(D.run(`histEdit(1, {x1: 80, y1: 0, x2: 80, y2: 60})`), 0);
  assert.equal(D.run('DOC.ents.length'), 2);
});

test('Explode done again on a rectangle made bigger: its lines keep their ids, so a move of one still finds it', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'}); persist();
    SEL = [0]; doExplode(); persist(); 1`);
  const top = D.run('DOC.ents.filter(function (e) { return e.t === "line" && e.y1 === 40 && e.y2 === 40; })[0]._id');
  D.run(`SEL = [DOC.ents.indexOf(entById(${JSON.stringify(top)}))]; selBoxDo('y', 60, {anchor: 'bl', lock: true}); SEL = []; 1`);
  assert.deepEqual(names(), ['Rectangle', 'Explode', 'Move']);
  assert.equal(D.run(`histEdit(0, {x: 0, y: 0, w: 80, h: 40})`), 0);
  const e = plain(D.run(`entById(${JSON.stringify(top)})`));
  assert.deepEqual([Math.min(e.x1, e.x2), Math.max(e.x1, e.x2), e.y1, e.y2], [0, 80, 60, 60], 'the top line, 80 long now, still moved up to 60');
});

test('dragging shapes with the Select tool is a Move whose distance can be changed', () => {
  setup(); canvasReady();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'}); persist(); setTool('select'); SEL = [0]; 1`);
  pointer('pointermove', 25, 0, 0);                                       // the pointer comes over its edge
  pointer('pointerdown', 25, 0, 1);
  pointer('pointermove', 35, 5, 1);
  pointer('pointermove', 45, 10, 1);
  pointer('pointerup', 45, 10, 0);
  D.run('persist(); 1');
  assert.deepEqual(names(), ['Rectangle', 'Move']);
  assert.deepEqual(plain(D.run('[DOC.ents[0].x, DOC.ents[0].y]')), [20, 10]);
  assert.deepEqual(plain(D.run('histEditInfo(histLine(), 1).fields.map(function (f) { return f.value; })')), [20, 10], 'as far as it was dragged');
  assert.equal(D.run(`histEdit(1, {dx: 5, dy: 0})`), 0);
  assert.deepEqual(plain(D.run('[DOC.ents[0].x, DOC.ents[0].y]')), [5, 0]);
});

test('Join that made two outlines: each keeps its id when done again, so a move of the second still moves the second', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 50, y2: 0, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 50, y1: 0, x2: 50, y2: 30, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 100, x2: 50, y2: 100, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 50, y1: 100, x2: 50, y2: 130, layer: 'L1'}); persist();
    SEL = [0, 1, 2, 3]; doJoin(); persist(); 1`);
  assert.equal(D.run('DOC.ents.length'), 2);
  const upper = D.run('DOC.ents.filter(function (e) { return e.pts[0][1] >= 100 || e.pts[1][1] >= 100; })[0]._id');
  D.run(`SEL = [DOC.ents.indexOf(entById(${JSON.stringify(upper)}))]; selBoxDo('x', 200, {anchor: 'bl', lock: true}); SEL = []; 1`);
  assert.equal(D.run(`histEdit(0, {x1: -20, y1: 0, x2: 50, y2: 0})`), 0);
  const lower = plain(D.run(`DOC.ents.filter(function (e) { return e._id !== ${JSON.stringify(upper)}; })[0].pts`));
  assert.ok(lower.some((q) => q[0] === -20), 'the lower one is longer, and where it was');
  const up = plain(D.run(`entById(${JSON.stringify(upper)}).pts`));
  assert.ok(up.every((q) => q[0] >= 200), 'the upper one still moved');
});

test('Trim, done again against a cutting line that has moved: the same side is trimmed, to where it crosses now; red if nothing does', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 60, y1: -20, x2: 60, y2: 20, layer: 'L1'}); persist();
    setTool('trim'); toolClick({x: 90, y: 0}, {x: 90, y: 0}); setTool('select'); 1`);
  assert.deepEqual(names(), ['Line', 'Line', 'Trim']);
  const piece = () => plain(D.run('DOC.ents.filter(function (e) { return e.y1 === 0 && e.y2 === 0; }).map(function (e) { return [e.x1, e.x2]; })'));
  assert.deepEqual(piece(), [[0, 60]]);
  assert.equal(D.run(`histEdit(1, {x1: 40, y1: -20, x2: 40, y2: 20})`), 0);
  assert.deepEqual(piece(), [[0, 40]], 'trimmed to the cutter where it is now');
  assert.equal(D.run(`histEdit(1, {x1: 140, y1: -20, x2: 140, y2: 20})`), 1, 'nothing crosses it now');
  assert.match(D.run('histSteps()[2].failed'), /no piece to trim/);
  assert.deepEqual(piece(), [[0, 100]], 'left whole');
});

test('Trim, done again on a rectangle made wider: the same side of it is trimmed', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'rect', x: 0, y: 0, w: 100, h: 40, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 60, y1: -20, x2: 60, y2: 60, layer: 'L1'}); persist();
    setTool('trim'); toolClick({x: 100, y: 20}, {x: 100, y: 20}); setTool('select'); 1`);
  assert.equal(D.run(`histEdit(0, {x: 0, y: 0, w: 150, h: 40})`), 0);
  const xs = plain(D.run('DOC.ents.filter(function (e) { return e.t !== "line"; })[0].pts.map(function (q) { return q[0]; })'));
  assert.ok(Math.max(...xs) <= 60 + 1e-9, 'the right-hand part, now 90 long, trimmed away at the line');
});

test('Extend, done again to a boundary that has moved; red if there’s nothing to reach', () => {
  setup();
  D.run(`pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 50, y2: 0, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'line', x1: 80, y1: -20, x2: 80, y2: 20, layer: 'L1'}); persist();
    setTool('extend'); toolClick({x: 45, y: 0}, {x: 45, y: 0}); setTool('select'); 1`);
  assert.deepEqual(names(), ['Line', 'Line', 'Extend']);
  assert.equal(D.run('DOC.ents[0].x2'), 80);
  assert.equal(D.run(`histEdit(1, {x1: 120, y1: -20, x2: 120, y2: 20})`), 0);
  assert.equal(D.run('DOC.ents[0].x2'), 120);
  assert.equal(D.run(`histEdit(1, {x1: 120, y1: 10, x2: 120, y2: 20})`), 1, 'it no longer reaches across the line’s path');
  assert.match(D.run('histSteps()[2].failed'), /nothing for it to reach/);
});
