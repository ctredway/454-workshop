// A V-carve and its clearing pocket stay a pair through the toolpath editor, on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// An inlay's two toolpaths, and a V-carve with a max depth and the pocket added for it: opening either in the
// editor and pressing Update must not lose what the editor has no box for (the plug's start depth, and which
// V-carve a pocket clears for), and the pocket must keep standing off the walls by what the V-bit cuts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const TAN = Math.tan(30 * Math.PI / 180), S = 2.5, M = 5;
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const list = () => plain(D.run('tpList()'));
const byId = (id) => list().find((t) => t.id === id);
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 19, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]; D.DOC.toolpaths = [];
}
function inlay(half) {
  setup();
  D.SEL = [0]; D.cutOpen(null);
  D.run(`CUT.side = 'inlay'; CUT.inlayHalf = '${half}'; CUT.vAngle = 60; CUT.vTip = 0; CUT.inlayD = ${M}; CUT.inlayS = ${S}; CUT.inlayM = ${M}; CUT.dia = 12.7; CUT.toolChosen = true; inlayApply(); 1`);
  const l = list();
  return { v: l.find((t) => t.side === 'vcarve'), c: l.find((t) => t.side === 'pocket') };
}
// open a toolpath in the editor and press Update, changing nothing but what `change` does
function edit(id, change) {
  D.run(`cutOpen(tpList().filter(function (t) { return t.id === '${id}'; })[0]); 1`);
  if (change) change();
  D.CUT.toolChosen = true; D.cutApply();
}

test('an inlay’s clearing pocket knows which V-carve it clears for, so the V-carve can flatten what its cutter leaves', () => {
  for (const half of ['pocket', 'plug']) {
    const { v, c } = inlay(half);
    assert.equal(c.clearFor, v.id, half);
    edit(c.id, () => set('cutDia', 6));
    assert.equal(byId(c.id).dia, 6);
    assert.ok(byId(v.id).vcFloor > v.vcFloor, half + ': more to flatten after a larger cutter: ' + v.vcFloor + ' then ' + byId(v.id).vcFloor);
  }
});
test('choosing the clearing pocket’s cutter in the editor doesn’t unlink it from its V-carve', () => {
  const { v, c } = inlay('plug');
  edit(c.id, () => set('cutDia', 3));
  const after = byId(c.id);
  assert.equal(after.clearFor, v.id);
  // (the editor's Allowance box holds two decimal places, so 1.4434 comes back as 1.44)
  assert.ok(Math.abs(after.allowance - (M - S) * TAN) < 0.005, 'still standing off the walls by what the V-bit cuts: ' + after.allowance);
  // and then updating the V-carve keeps the one pocket in step, where an unlinked one got a second pocket added
  edit(v.id);
  assert.equal(list().filter((t) => t.side === 'pocket').length, 1, 'one clearing pocket, not two');
});
test('updating a plug’s V-carve keeps its start depth: the same cut as before (cutting)', () => {
  const { v } = inlay('plug');
  assert.equal(v.vcStart, S);
  edit(v.id, () => set('cutFeed', 900));
  const after = byId(v.id);
  assert.equal(after.vcStart, S, 'the walls still begin at the start depth');
  const xyz = (t) => t.moves.map((m) => [m.g, m.x, m.y, m.z]);
  assert.deepEqual(xyz(after), xyz(v), 'not a move is in a different place');
});
test('updating a V-carve keeps how far apart its floor passes are (from a VCarve project’s V-bit)', () => {
  const { v } = inlay('pocket');
  D.run(`(function(){ var t = tpList().filter(function (t) { return t.id === '${v.id}'; })[0]; t.vcStep = 0.3; tpGenerate(t); })()`);
  const wide = byId(v.id);
  assert.ok(wide.moves.length < v.moves.length, 'passes 0.3 mm apart are fewer than at 0.127: ' + v.moves.length + ' then ' + wide.moves.length);
  edit(v.id, () => set('cutFeed', 900));
  const after = byId(v.id);
  assert.equal(after.vcStep, 0.3);
  assert.equal(after.moves.length, wide.moves.length);
});
test('updating a plug’s V-carve leaves its clearing pocket standing off by what the V-bit cuts, from the start depth down', () => {
  const { v, c } = inlay('plug');
  edit(v.id);
  const after = byId(c.id);
  assert.ok(Math.abs(after.allowance - (M - S) * TAN) < 1e-9, '(5 - 2.5) x tan 30 = 1.443, not 5 x tan 30 = 2.887: ' + after.allowance);
  assert.equal(after.depth, M);
  assert.deepEqual(after.moves.map((m) => [m.g, m.x, m.y, m.z]), c.moves.map((m) => [m.g, m.x, m.y, m.z]), 'the pocket cuts where it did');
});
test('a V-carve with a max depth: its clearing pocket follows a change of depth, in step', () => {
  setup();
  const id = D.run(`(function(){
    var v = {id: tpNewId(), name: 'V-carve', side: 'vcarve', type: 'vcarve', ents: [entId(DOC.ents[0])], vAngle: 60, vTip: 0, vcMax: 3, dia: 12.7, step: 0,
             feed: 800, plunge: 300, safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true};
    tpGenerate(v); tpList().push(v); vcarveClearing(v); return v.id;
  })()`);
  const c0 = list().find((t) => t.clearFor === id);
  assert.ok(Math.abs(c0.allowance - 3 * TAN) < 1e-9);
  edit(c0.id, () => set('cutDia', 3));
  edit(id, () => set('cutVcMax', 4));
  const c1 = list().filter((t) => t.side === 'pocket');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].depth, 4);
  assert.ok(Math.abs(c1[0].allowance - 4 * TAN) < 1e-9, String(c1[0].allowance));
  assert.equal(c1[0].dia, 3, 'and keeps the cutter chosen for it');
});
