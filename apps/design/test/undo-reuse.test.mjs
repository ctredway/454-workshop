// Undo and redo use toolpaths worked out before, for exactly the same settings, shapes and material, instead of
// working every one out again (undo.js tpDoneKeep, tpDoneReuse, tpRebuildAll), on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// What matters most: a toolpath is never given moves worked out for anything else. Each check compares what undo
// or redo gives with the same toolpath worked out from scratch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
function setup() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 200, h: 120, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = [{t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1'}, {t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1'}]; DOC.toolpaths = []; UNDO = []; REDO = [];
    TP_DONE = {}; TP_DONE_KEYS = [];
    ['pk', 'pr'].forEach(function (id, i) {
      var tp = {id: id, name: id === 'pk' ? 'Pocket' : 'Profile', side: id === 'pk' ? 'pocket' : 'outside', type: id === 'pk' ? 'pocket' : 'profile', ents: [entId(DOC.ents[i])],
                depth: 3, step: 3, dia: 6, feed: 800, plunge: 300, safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false,
                through: id === 'pr', over: 0.2, toolChosen: true, stepoverPct: 40};
      tpGenerate(tp); tpList().push(tp);
    }); 1`);
}
const tp = (id) => plain(D.run(`tpList().filter(function (t) { return t.id === '${id}'; })[0]`));
// the same toolpath worked out now, from scratch, on a copy
const fresh = (id) => plain(D.run(`(function () { var c = JSON.parse(JSON.stringify(tpList().filter(function (t) { return t.id === '${id}'; })[0])); delete c.moves; return tpGenerate(c).moves; })()`));
const deepest = (t) => Math.min(...t.moves.filter((m) => m.z !== undefined).map((m) => m.z));

test('undoing a change of depth: the old moves come straight back, exactly as worked out from scratch', () => {
  setup();
  D.run(`pushUndo(); var t = tpList()[0]; t.depth = 6; tpGenerate(t); 1`);          // (the depth alone: 3 mm passes, as before)
  assert.equal(deepest(tp('pk')), -6);
  D.run('doUndo(); 1');
  assert.equal(D.run('busyNow()'), false, 'nothing to work out: it was worked out before');
  assert.equal(deepest(tp('pk')), -3);
  assert.deepEqual(tp('pk').moves, fresh('pk'));
  D.run('doRedo(); 1');
  assert.equal(D.run('busyNow()'), false);
  assert.equal(deepest(tp('pk')), -6); assert.deepEqual(tp('pk').moves, fresh('pk'));
});
test('undoing a move of the shape: its toolpath goes back round the shape where it was', () => {
  setup();
  const before = tp('pk').moves;
  D.run(`pushUndo(); moveEntity(DOC.ents[0], 30, 0); tpGenerate(tpList()[0]); 1`);
  assert.notDeepEqual(tp('pk').moves, before);
  D.run('doUndo(); 1');
  assert.equal(D.run('busyNow()'), false);
  assert.deepEqual(tp('pk').moves, before);
  assert.deepEqual(tp('pk').moves, fresh('pk'));
});
test('something not worked out before is worked out, with the Working panel; a through cut follows the thickness', async () => {
  setup();
  D.run(`pushUndo(); DOC.stock.t = 18; 1`);
  D.run('doUndo(); doRedo(); 1');                                     // 18 mm: never worked out for that
  assert.equal(D.run('busyNow()'), true, 'the panel is up');
  await D.run('busyIdle()');
  assert.ok(Math.abs(deepest(tp('pr')) + 18.2) < 1e-9, 'through 18 mm and the 0.2 mm overcut: ' + deepest(tp('pr')));
  assert.deepEqual(tp('pr').moves, fresh('pr'));
  assert.ok(Math.abs(deepest(tp('pk')) + 3) < 1e-9, 'the pocket: the same as before');
});
test('a change that doesn’t touch the moves (the name, hidden, unticked) needs nothing worked out', () => {
  setup();
  D.run(`pushUndo(); var t = tpList()[0]; t.name = 'Renamed'; t.hidden = true; t.exclude = true; 1`);
  D.run('doUndo(); doRedo(); 1');
  assert.equal(D.run('busyNow()'), false);
  assert.deepEqual(tp('pk').moves, fresh('pk'));
});
test('only the last 200 are kept', () => {
  setup();
  D.run(`var t = tpList()[0]; for (var d = 1; d <= 210; d++){ t.depth = d / 10; t.step = d / 10; tpGenerate(t); } 1`);
  assert.equal(D.run('TP_DONE_KEYS.length'), 200);
  assert.equal(D.run('Object.keys(TP_DONE).length'), 200);
});
test('a toolpath given its sheet and its V-carve after it’s worked out (as Make editable does) is still used again', () => {
  setup();
  D.run(`var t = tpList()[0]; t.sheet = 'S1'; t.clearFor = 'pr'; pushUndo(); t.depth = 6; tpGenerate(t); 1`);
  D.run('doUndo(); 1');
  assert.equal(D.run('busyNow()'), false, 'used again: neither changes its moves');
  assert.equal(deepest(tp('pk')), -3); assert.deepEqual(tp('pk').moves, fresh('pk'));
});
test('while the panel works toolpaths out, one still waiting counts as out of date: anything that needs it works it out', async () => {
  setup();
  D.run(`pushUndo(); DOC.stock.t = 20; 1`);
  D.run('doUndo(); doRedo(); 1');
  assert.equal(D.run('busyNow()'), true);
  assert.equal(D.run(`tpStale(tpList().filter(function (t) { return t.id === 'pr'; })[0])`), true);
  const parts = plain(D.run('tpJob().parts.map(function (p) { return p.moves.length; })'));
  assert.ok(parts.every((n) => n > 0), 'Save G-code gets every toolpath, worked out: ' + parts);
  await D.run('busyIdle()');
});
