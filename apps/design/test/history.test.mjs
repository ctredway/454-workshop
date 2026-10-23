// The history: every change a named step, kept with the drawing, shown in the History bar (history.js), on the real
// sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// What matters most: going to a step gives exactly the drawing as it was then, every time, however it got there
// (undo, redo, a click on the bar, a saved file, the browser's storage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
// docSnap as it was before the history (undo.js), word for word: what the pieces must join back into
const OLD_SNAP = `JSON.stringify({ents:DOC.ents, guides:DOC.guides, dims:DOC.dims || [], params:DOC.params || [], toolpaths:tpLean(DOC.toolpaths), tpGroups: DOC.tpGroups || [], vcConverted: !!DOC.vcConverted, stock: DOC.stock,
  layers: DOC.layers, activeLayer: DOC.activeLayer, images: DOC.images, sheets: DOC.sheets || null})`;

function setup() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 200, h: 120, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.params = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    UNDO = []; REDO = []; SEL = []; 1`);
}
const snap = () => D.run('docSnap()');
const names = () => plain(D.run('histSteps().map(function (s) { return s.name; })'));
// a step: record it, make the change
const step = (change, name) => D.run(`pushUndo(${name ? JSON.stringify(name) : ''}); ${change}; persist(); 1`);

// a seeded random drawing, with every kind of thing a drawing holds, and awkward values
function rnd(seed) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function randomDoc(r) {
  const n = () => Math.round((r() - 0.5) * 1e6) / (r() < 0.5 ? 1000 : 7);
  const str = () => ['Oak', 'a "quote"', 'back\\slash', 'line\nbreak', ' sep', 'été 🌲', ''][Math.floor(r() * 7)];
  const ent = () => {
    const k = Math.floor(r() * 7);
    if (k === 0) return {t: 'rect', x: n(), y: n(), w: n(), h: n(), layer: 'L1', _id: 'e' + Math.floor(r() * 1e9)};
    if (k === 1) return {t: 'circle', cx: n(), cy: n(), r: Math.abs(n()), skip: undefined};
    if (k === 2) return {t: 'poly', pts: Array.from({length: 1 + Math.floor(r() * 9)}, () => [n(), n()]), closed: r() < 0.5};
    if (k === 3) return {t: 'text', str: str(), font: 'roboto', h: 10, x: n(), y: n(), rot: -0, fy: r() < 0.5};
    if (k === 4) return {t: 'arc', cx: n(), cy: n(), r: 5, a0: n(), a1: n(), ccw: null};
    if (k === 5) return {t: 'path', segs: [{t: 'c', p: [n(), n(), n(), n()]}], closed: true};
    return {t: 'group', kids: [{t: 'line', x1: n(), y1: n(), x2: n(), y2: n()}], nested: {a: [1, [2, {b: str()}]]}};
  };
  const doc = {stock: {w: 300, h: 200, t: 19.05, origin: 'corner'}, ents: Array.from({length: Math.floor(r() * 30)}, ent)};
  if (r() < 0.7) doc.guides = [{t: 'gline', a: 1, b: 0, c: n()}];
  if (r() < 0.7) doc.dims = [{kind: 'side', a: 'e1', at: {x: n(), y: n()}}];
  if (r() < 0.5) doc.params = [{name: 'W', expr: '100 + 2', note: str()}];
  if (r() < 0.7) doc.toolpaths = [{id: 'tp' + Math.floor(r() * 99), name: str(), ents: ['e1'], tabPts: {e1: [[n(), n()]]}, moves: [{x: 1}], holes: [1], depth: 3, preview: [1]}];
  if (r() < 0.5) doc.tpGroups = [{id: 'g1', name: 'Inlay', folded: true}];
  if (r() < 0.5) doc.vcConverted = true;
  if (r() < 0.6){ doc.layers = [{id: 'L1', name: str(), visible: true, locked: false}]; doc.activeLayer = 'L1'; }
  if (r() < 0.4) doc.images = [{id: 'i1', x: n(), y: n(), w: 10, h: 10}];
  if (r() < 0.4) doc.sheets = [{id: 's1', name: 'Sheet 1'}, {id: 's2', name: str()}];
  return doc;
}

test('a step keeps the drawing exactly as undo always did: docSnap is word for word the same, on 400 drawings', () => {
  const r = rnd(454);
  for (let i = 0; i < 400; i++) {
    const doc = randomDoc(r);
    D.run(`DOC = ${JSON.stringify(doc)}; ${i % 9 === 0 ? 'DOC.ents.push(undefined, function () {});' : ''} 1`);
    assert.equal(snap(), D.run(OLD_SNAP), 'drawing ' + i);
  }
});

test('a step leaves out what’s worked out: a path’s cached outline, a toolpath’s results; and gives every shape its id and layer', () => {
  setup();
  D.run(`DOC.ents = [{t: 'path', pts: [[0, 0], [10, 0], [10, 10]], closed: true, _tess: [[1, 2]], _tess2: [[3, 4]]}, {t: 'group', ents: [{t: 'path', pts: [[0, 0]], _tess: [1]}]}];
    DOC.toolpaths = [{id: 'tp1', name: 'Pocket', depth: 3, sig: 'abc', warning: 'w', past: 1, vcDepth: 2, moves: [1], holes: [1]}]; 1`);
  const s = JSON.parse(snap());
  assert.equal(JSON.stringify(s).includes('_tess'), false);
  assert.deepEqual(s.toolpaths, [{id: 'tp1', name: 'Pocket', depth: 3}]);
  assert.ok(s.ents.every((e) => e._id && e.layer === 'L1'));
  assert.equal(D.run('DOC.ents[0]._tess.length'), 1, 'the drawing keeps its cache');
});

test('undo, redo and a click on the bar give exactly the drawing as it was at each step', () => {
  setup();
  const at = [snap()];
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`); at.push(snap());
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'})`); at.push(snap());
  step(`DOC.ents[0].w = 55`); at.push(snap());
  step(`DOC.ents.splice(1, 1)`); at.push(snap());
  step(`DOC.stock.t = 18`); at.push(snap());
  for (let k = 4; k >= 0; k--) { D.run('doUndo(); 1'); assert.equal(snap(), at[k], 'undo to ' + k); }
  D.run('doUndo(); 1'); assert.equal(snap(), at[0], 'nothing more to undo: stays');
  for (let k = 1; k <= 5; k++) { D.run('doRedo(); 1'); assert.equal(snap(), at[k], 'redo to ' + k); }
  for (const k of [2, 0, 5, 3, 4, 1, 5]) {                          // jumping about, as clicks on the bar do
    D.run(`histGoTo(${k}); 1`);
    assert.equal(snap(), at[k], 'go to ' + k);
    assert.equal(D.run('UNDO.length'), k);
    assert.equal(D.run('UNDO.length + REDO.length'), 5, 'no step lost or added');
  }
});

// Clint, 2026-10-20: "I clicked a previous step in the history timeline and then made a change and the history items
// that were after that change were removed, that shouldn't happen." As in Fusion: the change goes in there, and the
// steps after it stay, done again on top of it when the drawing goes forward to them.
const ents = () => plain(D.run('DOC.ents')).map((e) => { delete e._id; delete e.layer; return e; });
test('a change made after going back goes in there; the steps after it stay, and are done again on top of it', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  step(`DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 9, y2: 9})`);
  D.run('histGoTo(1); histRender(); 1');
  assert.equal(D.document.getElementById('histNote'), null, 'no note saying how far back: the marker shows it');
  assert.equal(D.run('REDO.length'), 2, 'back two steps');
  step(`DOC.ents[0].h = 99`, 'Taller');
  assert.deepEqual(names(), ['Rectangle', 'Taller', 'Circle', 'Line'], 'the steps after it are still there');
  assert.equal(D.run('UNDO.length'), 2, 'and still undone: the drawing is as it is just after the change');
  assert.deepEqual(ents(), [{t: 'rect', x: 10, y: 10, w: 40, h: 99}]);
  D.run('histGoTo(4); 1');
  assert.deepEqual(ents(), [{t: 'rect', x: 10, y: 10, w: 40, h: 99}, {t: 'circle', cx: 120, cy: 40, r: 15}, {t: 'line', x1: 0, y1: 0, x2: 9, y2: 9}],
    'going forward does them again, on top of it');
  assert.equal(D.run('HIST_STALE_FROM'), null);
  assert.deepEqual(plain(D.run('histSteps().map(function (s) { return !!s.failed; })')), [false, false, false, false]);
  // and back and forward again: each step's drawing as it is now
  D.run('histGoTo(2); 1');
  assert.deepEqual(ents(), [{t: 'rect', x: 10, y: 10, w: 40, h: 99}]);
  D.run('histGoTo(3); 1');
  assert.deepEqual(ents().map((e) => e.t), ['rect', 'circle']);
});
test('Redo goes forward one step at a time on top of the change, and Undo takes the change back', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  D.run('histGoTo(1); 1');
  step(`DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 9, y2: 9})`);
  D.run('doRedo(); 1');
  assert.deepEqual(ents().map((e) => e.t).sort(), ['circle', 'line', 'rect'], 'the circle, done again after the line');
  D.run('doUndo(); doUndo(); 1');
  assert.deepEqual(ents().map((e) => e.t), ['rect']);
  assert.deepEqual(names(), ['Rectangle', 'Line', 'Circle'], 'undone, still on the bar');
});
test('a later step that can’t be done on top of the change turns red and is skipped; the rest are done', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30}); DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  // move the rectangle (a recipe: done again on the same shape, by its id), then move the circle
  D.run(`SEL = [0]; pushUndo('Move'); histRecipe({op: 'move', ids: histIdsOf([0]), dx: 5, dy: 0}); moveEntity(DOC.ents[0], 5, 0); persist();
    SEL = [1]; pushUndo('Move'); histRecipe({op: 'move', ids: histIdsOf([1]), dx: 0, dy: 7}); moveEntity(DOC.ents[1], 0, 7); persist(); SEL = []; 1`);
  D.run('histGoTo(1); 1');
  step(`DOC.ents.splice(0, 1)`, 'Delete');                     // the rectangle the first move moved is gone
  D.run('histGoTo(4); 1');
  const st = plain(D.run('histSteps().map(function (s) { return [s.name, s.failed]; })'));
  assert.deepEqual(st.map((s) => s[0]), ['Added 2 shapes', 'Delete', 'Move', 'Move']);
  assert.ok(st[2][1], 'the rectangle’s move is red');
  assert.equal(st[3][1], null, 'the circle’s move is done');
  assert.deepEqual(ents(), [{t: 'circle', cx: 120, cy: 47, r: 15}]);
  assert.match(D.document.body.textContent, /A step can’t be done now/);
});
test('a drawing saved with steps waiting to be done again keeps them waiting, and opened, does them going forward', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  D.run('histGoTo(1); 1');
  step(`DOC.ents[0].w = 80`);
  const h = plain(D.run('histForKeeping()'));
  assert.equal(h.stale, 2, 'the circle (step 3) waits');
  D.run('UNDO = []; REDO = []; HIST_STALE_FROM = null; 1');
  assert.equal(D.run(`histTake(${JSON.stringify(h)})`), true);
  assert.equal(D.run('HIST_STALE_FROM'), 2);
  D.run('histGoTo(3); 1');
  assert.deepEqual(ents(), [{t: 'rect', x: 10, y: 10, w: 80, h: 30}, {t: 'circle', cx: 120, cy: 40, r: 15}]);
});
test('opening or starting a drawing still starts a history afresh, after going back', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  D.run(`histGoTo(1); pushUndo('New drawing', 'new'); DOC.ents = []; persist(); 1`);
  assert.equal(D.run('REDO.length'), 0);
  assert.equal(D.run('HIST_STALE_FROM'), null);
});

test('each step is named for what it did', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15}, {t: 'line', x1: 0, y1: 0, x2: 9, y2: 9})`);
  step(`entId(DOC.ents[1]); 1`);                                     // (an id given: every shape has one already)
  step(`DOC.ents[1].r = 20`);
  step(`DOC.ents.splice(2, 1)`);
  step(`DOC.ents.push({t: 'text', str: 'Welcome to the cabin', x: 0, y: 0, h: 10})`);
  step(`DOC.ents[0].x = 0`, 'Fillet 6 mm');
  step(`DOC.toolpaths.push({id: 'tp1', name: 'Pocket 1', ents: []})`);
  step(`DOC.toolpaths[0].depth = 4`);
  step(`DOC.toolpaths = []`);
  step(`DOC.stock.t = 18`);
  step(`DOC.guides.push({t: 'gline', a: 1, b: 0, c: 5})`);
  step(`DOC.ents.reverse()`);
  step(`1`);
  assert.deepEqual(names(), ['Rectangle', 'Added 2 shapes', 'No change', 'Changed circle', 'Deleted line',
    'Text “Welcome to the…”', 'Fillet 6 mm', 'Toolpath Pocket 1', 'Edited Pocket 1', 'Deleted Pocket 1', 'Material',
    'Guide lines', 'Shape order', 'No change']);
  // and the same names when undone (worked out the other way round)
  D.run('histGoTo(0); 1');
  assert.deepEqual(names().slice(0, 4), ['Rectangle', 'Added 2 shapes', 'No change', 'Changed circle']);
});

test('a drawing saved to a file keeps its history, and opening it brings back that history, exactly, and only that', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 1, y: 1, w: 2, h: 2, layer: 'L1'})`);       // another drawing's work, before this one
  D.run(`pushUndo('New drawing', 'new'); DOC.ents = []; DOC.toolpaths = []; 1`);
  const before = snap();
  const at = [snap()];
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`); at.push(snap());
  step(`DOC.ents[0].w = 60`, 'Width 60'); at.push(snap());
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'})`); at.push(snap());
  step(`DOC.stock.t = 18`); at.push(snap());
  step(`DOC.stock.t = 25`, 'Thicker'); at.push(snap());
  D.run('histGoTo(UNDO.length - 2); 1');                                   // left two steps back: those are kept too
  const text = D.run('histAttach(docForStorage(true))');
  const file = JSON.parse(text);
  assert.equal(file.history.steps.length, 5, 'only this drawing’s steps: not the one before New');
  assert.equal(file.history.at, 3);
  assert.equal(file.history.steps[1].name, 'Width 60');
  // open it over something else
  setup();
  D.run(`DOC.ents = [{t: 'line', x1: 0, y1: 0, x2: 5, y2: 5, layer: 'L1'}]; 1`);
  const other = snap();
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'shelf.454.json');
  assert.equal(D.run('DOC.history'), undefined, 'the history isn’t left in the drawing');
  assert.equal(snap(), at[3]);
  assert.deepEqual(names(), ['Rectangle', 'Width 60', 'Circle', 'Material', 'Thicker'], 'its own steps only');
  D.run('histGoTo(UNDO.length + 1); 1'); assert.equal(snap(), at[4], 'the steps left undone come back undone, in order');
  D.run('histGoTo(UNDO.length + 1); 1'); assert.equal(snap(), at[5]);
  D.run('histGoTo(UNDO.length - 1); 1');
  for (let k = 3; k >= 0; k--) { D.run('doUndo(); 1'); assert.equal(snap(), at[k], 'back to ' + k); }
  D.run('doUndo(); 1'); assert.equal(snap(), at[0], 'and no further: the drawing open before is in its file, or put aside');
  assert.notEqual(snap(), other);
  assert.equal(before, at[0]);
});

test('a file changed by an older Design, which kept the history but didn’t add to it: the change is a step of its own', () => {
  setup();
  D.run(`pushUndo('New drawing', 'new'); 1`);
  const at = [snap()];
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`); at.push(snap());
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'})`); at.push(snap());
  D.run('doUndo(); 1');
  const file = JSON.parse(D.run('histAttach(docForStorage(true))'));
  file.ents[0].w = 99;                                                       // changed elsewhere
  setup();
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'old.454.json');
  assert.deepEqual(names(), ['Rectangle', 'Changed rectangle']);
  assert.equal(D.run('REDO.length'), 0, 'the undone circle is left out: it was undone from another drawing');
  D.run('doUndo(); 1'); assert.equal(snap(), at[1]);
  D.run('doUndo(); 1'); assert.equal(snap(), at[0]);
});

test('a file with a damaged history opens as a drawing, without it', () => {
  setup();
  const doc = {stock: {w: 100, h: 100}, ents: [{t: 'rect', x: 0, y: 0, w: 5, h: 5}], history: {v: 1, pieces: [], states: [[0]], steps: [], at: 0}};
  D.openDrawing(D.run(`(${JSON.stringify(doc)})`), 'odd.454.json');
  assert.deepEqual(names(), []);
  assert.equal(D.run('DOC.ents.length'), 1);
  const doc2 = {stock: {w: 100, h: 100}, ents: [], history: {v: 2}};
  D.openDrawing(D.run(`(${JSON.stringify(doc2)})`), 'newer.454.json');
  assert.deepEqual(names(), []);
});

test('the browser’s storage keeps the history: it comes back at startup, for that drawing only', () => {
  setup();
  const at = [snap()];
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`); at.push(snap());
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`); at.push(snap());
  D.run('histStore(); UNDO = []; REDO = []; histRestoreStored(); 1');
  assert.deepEqual(names(), ['Rectangle', 'Circle']);
  D.run('histGoTo(0); 1'); assert.equal(snap(), at[0]);
  D.run('histGoTo(2); histStore(); UNDO = []; REDO = []; DOC.ents.pop(); histRestoreStored(); 1');
  assert.deepEqual(names(), [], 'a different drawing open: not its history');
});

test('pieces are shared: 200 steps on a drawing of 300 shapes keep about 200 new pieces, not 200 copies', () => {
  setup();
  D.run(`for (var i = 0; i < 300; i++) DOC.ents.push({t: 'rect', x: i, y: i, w: 5, h: 5}); 1`);
  const n0 = D.run('HIST_STR.length');
  const at = [];
  for (let i = 0; i < 200; i++) { step(`DOC.ents[${i}].w = ${6 + i}`); if (i % 50 === 0) at.push([i, snap()]); }
  assert.ok(D.run('HIST_STR.length') - n0 < 300 + 200 + 20, 'pieces: ' + (D.run('HIST_STR.length') - n0));
  // let go of unused pieces: every step still exact
  D.run('HIST_SWEEP_AT = 0; histSweep(); 1');
  for (const [i, s] of at) { D.run(`histGoTo(${i + 1}); 1`); assert.equal(snap(), s, 'step ' + i); }
});

test('the History bar: a Start and a button per step, the current one marked; clicking one goes there; it folds away', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  D.run('histRender(); 1');
  const bs = () => Array.from(D.document.querySelectorAll('#histSteps .hStep'));
  assert.deepEqual(bs().map((b) => b.getAttribute('aria-label')), ['Start', 'Rectangle', 'Circle']);
  assert.ok(bs()[2].classList.contains('now'));
  bs()[1].dispatchEvent(new D.window.Event('click'));
  assert.equal(D.run('DOC.ents.length'), 1);
  D.run('histRender(); 1');
  assert.ok(bs()[1].classList.contains('now'));
  assert.ok(bs()[2].classList.contains('undone'));
  bs()[0].dispatchEvent(new D.window.Event('click'));
  assert.equal(D.run('DOC.ents.length'), 0);
  D.document.getElementById('histFold').dispatchEvent(new D.window.Event('click'));
  assert.ok(D.document.getElementById('histBar').classList.contains('folded'));
  assert.equal(D.run('UICFG.histBar'), false, 'remembered');
  D.document.getElementById('histFold').dispatchEvent(new D.window.Event('click'));
  assert.equal(bs().length, 3);
});

test('a new drawing starts a new history; the one before is put aside for Recover, so it\u2019s safe', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'})`);
  D.run('markUnsaved(); newDrawing(); 1');
  assert.deepEqual(names(), []);
  assert.equal(D.run('UNDO.length + REDO.length'), 0);
  assert.ok(D.run('asideRead()'), 'put aside for Recover');
});

test('if the drawing before couldn\u2019t be put aside (storage full), its steps stay: Undo is the way back to it', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`);
  D.run(`markUnsaved(); var keep = asideKeep; asideKeep = function (t) { return !t; }; newDrawing(); asideKeep = keep; 1`);
  assert.deepEqual(names(), ['Rectangle', 'New drawing']);
  D.run('doUndo(); 1');
  assert.equal(D.run('DOC.ents.length'), 1, 'back');
});

test('the History bar shows each step as its tool’s icon, and its name on hover and on keyboard focus', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'})`);
  D.run(`SEL = [0]; UICFG.filletR = 5; fallOpen(); fallApply(); SEL = [1]; offOpen(); OFF.dist = 3; offRender(); offApply(); SEL = []; 1`);
  step(`DOC.ents.pop()`);
  step(`DOC.stock.t = 9`);
  D.run('histRender(); 1');
  const bs = Array.from(D.document.querySelectorAll('#histSteps .hStep'));
  const icon = (k) => D.run(`(HIST_ICON[${JSON.stringify(k)}] || ICON[${JSON.stringify(k)}])`);
  assert.deepEqual(bs.map((b) => b.getAttribute('aria-label')), ['Start', 'Rectangle', 'Circle', 'Fillet corners 5 mm', 'Offset 3 mm', 'Deleted circle', 'Material']);
  const same = (h) => h.replace(/\s*\/>/g, '/>');                         // (the page writes <path />)
  assert.deepEqual(bs.map((b) => same(b.innerHTML)), ['start', 'rect', 'circ', 'filletall', 'offs', 'trash', 'mach'].map(icon).map(same), 'each its tool’s icon');
  assert.equal(bs[1].textContent, '', 'no text on the bar itself');
  const tip = D.document.getElementById('histTip');
  assert.equal(tip.hidden, true);
  bs[3].dispatchEvent(new D.window.Event('mouseenter'));
  assert.equal(tip.hidden, false);
  assert.match(tip.textContent, /^Fillet corners 5 mm/);
  assert.match(tip.textContent, /Double-click to change it/);
  bs[3].dispatchEvent(new D.window.Event('mouseleave'));
  assert.equal(tip.hidden, true);
  bs[6].dispatchEvent(new D.window.Event('focus'));
  assert.match(tip.textContent, /^Material/);
  bs[6].dispatchEvent(new D.window.Event('blur'));
  assert.equal(tip.hidden, true);
});

test('a red step’s label says why it was skipped', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 0, y: 0, w: 50, h: 40, layer: 'L1'})`);
  step(`DOC.ents[0].x = 5`);
  D.run(`histEdit(0, {x: 0, y: 0, w: 80, h: 40}); histRender(); 1`);
  const b = D.document.querySelectorAll('#histSteps .hStep')[2];
  assert.ok(b.classList.contains('failed'));
  assert.equal(b.getAttribute('aria-label'), 'Changed rectangle (skipped)');
  b.dispatchEvent(new D.window.Event('mouseenter'));
  assert.match(D.document.getElementById('histTip').textContent, /Skipped: A shape it changes is different now/);
});
test('changing an earlier step while steps wait does them all again; Undo puts back the line as it was, still waiting', () => {
  setup();
  step(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 40, h: 30})`);
  step(`DOC.ents.push({t: 'circle', cx: 120, cy: 40, r: 15})`);
  D.run('histGoTo(1); 1');
  step(`DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 9, y2: 9})`);
  assert.equal(D.run('HIST_STALE_FROM'), 2);
  // the rectangle (step 1) made wider: every step after it done again, the circle included
  assert.equal(D.run('histEdit(0, {w: 60})'), 0);
  assert.equal(D.run('HIST_STALE_FROM'), null);
  D.run('histGoTo(3); 1');
  assert.deepEqual(ents().map((e) => e.t + (e.w ? e.w : '')).sort(), ['circle', 'line', 'rect60']);
  // Undo, Undo: back to before the change to the rectangle, the circle waiting again
  D.run('histGoTo(2); doUndo(); 1');
  assert.equal(D.run('HIST_STALE_FROM'), 2);
  assert.deepEqual(ents().map((e) => e.t + (e.w ? e.w : '')), ['rect40', 'line']);
});
