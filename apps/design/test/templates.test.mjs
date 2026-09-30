// Toolpath templates (templates.js): toolpaths saved without their shapes, and made again in another drawing on
// the layers of the same names. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
const plain = (v) => JSON.parse(JSON.stringify(v));
const later = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// a drawing: shapes on named layers
function drawing(shapes, layers = ['Carve', 'Cut out']) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 300, h: 200, t: 12, zero: 'top' });
  D.DOC.layers = layers.map((n, i) => ({ id: 'L' + (i + 1) + n.length, name: n, visible: true, locked: false }));
  D.DOC.activeLayer = D.DOC.layers[0].id; D.DOC.toolpaths = []; D.DOC.name = 'Sign';
  const lid = (n) => D.DOC.layers.find((l) => l.name === n).id;
  D.DOC.ents = shapes.map(([n, e]) => Object.assign({ layer: lid(n) }, e));
}
const A = [['Carve', { t: 'rect', x: 40, y: 40, w: 30, h: 20 }], ['Carve', { t: 'circle', cx: 110, cy: 60, r: 12 }],
           ['Cut out', { t: 'rect', x: 20, y: 20, w: 140, h: 80 }]];
function make(sel, type, o) {
  D.SEL = sel; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', o.dia);
  if (o.through) tick('cutThrough', true); else set('cutDepth', o.depth);
  if (o.rest) { set('cutRest', D.tpList().find((t) => t.name === o.rest).id, 'change'); }
  if (o.tabs) { tick('cutTabsOn', true); set('cutTabs', o.tabs); set('cutTabLen', 6); set('cutTabThk', 2); set('cutTabStyle', '3d', 'change'); el('cutTabSpread').click(); }
  D.CUT.toolChosen = true; D.cutApply();
  return D.tpList().at(-1);
}
function job() {
  drawing(A);
  make([0, 1], 'pocket', { dia: 6.35, depth: 4 });
  make([0, 1], 'pocket', { dia: 3.175, rest: 'Pocket' });
  make([2], 'outside', { dia: 6.35, through: true, tabs: 3 });
  return D.tpList().map(plain);
}
const SETTINGS = ['name', 'type', 'side', 'dia', 'depth', 'through', 'step', 'feed', 'plunge', 'tabsOn', 'tabCount', 'tabLen', 'tabThk', 'tabStyle', 'rampLen', 'allowance', 'climb', 'stepoverPct'];
const pick = (tp) => Object.fromEntries(SETTINGS.map((k) => [k, tp[k]]));

test('a template keeps each toolpath’s settings and its layers, not its shapes or tabs’ places', () => {
  const before = job();
  assert.equal(before[1].restFrom, before[0].id, 'the clean-up follows the pocket');
  const tpl = plain(D.tplMake());
  assert.equal(tpl.kind, '454-toolpath-template'); assert.equal(tpl.toolpaths.length, 3);
  tpl.toolpaths.forEach((t, i) => {
    for (const k of ['id', 'ents', 'tabPts', 'moves', 'restFrom']) assert.ok(!(k in t), 'no ' + k);
    assert.deepEqual(pick(t), pick(before[i]));
  });
  assert.deepEqual(tpl.toolpaths.map((t) => t.layers), [['Carve'], ['Carve'], ['Cut out']]);
  assert.equal(tpl.toolpaths[1].restAfter, 0, 'the clean-up, by its pocket’s place');
});
test('applied to the same drawing, it makes exactly the same toolpaths, move for move', () => {
  const before = job(), tpl = plain(D.tplMake());
  D.DOC.toolpaths = [];
  const made = D.tplMakeToolpaths(D.tplPlan(tpl));
  assert.equal(made.length, 3);
  const after = D.tpList().map(plain);
  after.forEach((tp, i) => {
    assert.deepEqual(pick(tp), pick(before[i]), tp.name);
    assert.deepEqual(tp.ents, before[i].ents, tp.name + ': the same shapes');
    assert.deepEqual(tp.moves, before[i].moves, tp.name + ': the same moves');
  });
  assert.equal(after[1].restFrom, after[0].id, 'the clean-up follows the new pocket');
  assert.equal(D.tpTabTotal(D.tpList()[2]), 3, 'tabs spaced evenly again');
});
test('in another drawing: the shapes on the layers of the same names, nothing else', () => {
  job(); const tpl = plain(D.tplMake());
  drawing([['Notes', { t: 'rect', x: 200, y: 150, w: 20, h: 20 }], ['Cut out', { t: 'circle', cx: 100, cy: 100, r: 60 }],
           ['Carve', { t: 'rect', x: 80, y: 90, w: 40, h: 15 }]], ['Notes', 'Carve', 'Cut out']);
  // already here: a profile, which new toolpaths made one by one would go ahead of
  make([0], 'outside', { dia: 3.175, through: true }).name = 'Already here';
  const plan = D.tplPlan(tpl);
  assert.deepEqual(plan.map((p) => p.skip), ['', '', '']);
  const made = D.tplMakeToolpaths(plan);
  const ids = D.DOC.ents.map((e) => D.entId(e));
  assert.deepEqual(plain(made.map((t) => t.ents)), [[ids[2]], [ids[2]], [ids[1]]]);
  assert.deepEqual(plain(D.tpList().map((t) => t.name)), ['Already here', 'Pocket', 'Pocket clean-up', 'Outside profile'], 'after what was there, in order');
  made.forEach((t) => assert.ok(t.moves.length > 10, t.name + ' has moves'));
  assert.ok(Math.min(...made[2].moves.filter((m) => m.z !== undefined).map((m) => m.z)) < -12, 'through this drawing’s 12 mm material');
});
test('a missing layer: that toolpath isn’t made, and nor is a clean-up after it', () => {
  job(); const tpl = plain(D.tplMake());
  drawing([['Cut out', { t: 'rect', x: 20, y: 20, w: 100, h: 60 }]], ['Cut out']);
  const plan = D.tplPlan(tpl);
  assert.match(plan[0].skip, /no shapes on .Carve./);
  assert.ok(plan[1].skip, 'nor its clean-up');
  assert.equal(plan[2].skip, '');
  assert.equal(D.tplMakeToolpaths(plan).length, 1);
  // a clean-up whose shapes are here but whose pocket can't be made
  const odd = plain(tpl); odd.toolpaths[0].layers = ['Gone'];
  drawing(A);
  const plan2 = D.tplPlan(odd);
  assert.match(plan2[0].skip, /no shapes on .Gone./);
  assert.match(plan2[1].skip, /cleans up after .Pocket., which can.t be made/);
  assert.equal(D.tplPlan({ kind: 'something else' }), null, 'not a template');
});
test('Apply template says what it will make, and Cancel makes nothing', async () => {
  job(); const text = JSON.stringify(D.tplMake());
  drawing([['Cut out', { t: 'rect', x: 20, y: 20, w: 100, h: 60 }]], ['Cut out']);
  let p = D.tplApplyText(text, 'Sign template.json'); await later();
  assert.ok(!el('dlgModal').hidden);
  const body = el('dlgBody').textContent;
  assert.match(body, /✗ Pocket, 6\.35 mm bit: not made, no shapes on .Carve./);
  assert.match(body, /✓ Outside profile, 6\.35 mm bit: 1 shape on .Cut out./);
  assert.equal(el('dlgOk').textContent, 'Make 1 toolpath');
  el('dlgCancel').click(); assert.equal((await p).length, 0); assert.equal(D.tpList().length, 0);
  p = D.tplApplyText(text, 'Sign template.json'); await later(); el('dlgOk').click();
  assert.equal((await p).length, 1); assert.equal(D.tpList().length, 1);
  D.doUndo(); assert.equal(D.tpList().length, 0, 'and Undo takes it back');
});
test('in a drawing with no toolpaths yet: Apply template is there and opens a file; Save template waits for toolpaths', async () => {
  job(); const text = JSON.stringify(D.tplMake());
  drawing(A); D.renderToolpathPanel();
  assert.equal(D.tpList().length, 0);
  assert.ok(el('tplApplyBtn'), 'Apply template… with no toolpaths');
  assert.ok(el('tplSaveBtn').disabled, 'nothing to save yet');
  D.window.showOpenFilePicker = async () => [{ getFile: async () => ({ name: 'Sign template.json', text: async () => text }) }];
  el('tplApplyBtn').click(); await later(80);
  assert.ok(!el('dlgModal').hidden && /Sign template\.json/.test(el('dlgTitle').textContent), 'asks: ' + el('dlgTitle').textContent);
  el('dlgOk').click(); await later(80);
  assert.equal(D.tpList().length, 3);
  D.renderToolpathPanel(); assert.ok(!el('tplSaveBtn').disabled, 'and now there is');
  delete D.window.showOpenFilePicker;
});
