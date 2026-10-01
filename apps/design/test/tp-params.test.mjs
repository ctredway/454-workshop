// Parameters in toolpaths (tp-params.js): a depth, tab length or tab thickness typed as a parameter is remembered
// and follows it; a depth from a parameter needs the material's thickness; anything that can't be worked out stops
// Save G-code; and every length box takes arithmetic and parameters, worked out once. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
const later = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
const plain = (v) => JSON.parse(JSON.stringify(v));

function drawing(t = 12, params = [['pk', '5']]) {
  if (!el('dlgModal').hidden) el('dlgCancel').click();
  if (!el('paramModal').hidden) el('paramDone').click();
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 60, h: 40, layer: 'L1' }]; D.DOC.toolpaths = []; D.DOC.dims = [];
  D.DOC.params = params.map(([name, expr]) => ({ name, expr, unit: 'mm', note: '' }));
  D.UICFG.stockUnits = 'mm';
}
function open(type, o = {}) {
  D.SEL = [0]; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35);
  if (o.through) tick('cutThrough', true); else if (o.depth !== undefined) set('cutDepth', o.depth);
  if (o.tabThk !== undefined) { tick('cutTabsOn', true); set('cutTabs', 2); set('cutTabThk', o.tabThk); el('cutTabSpread').click(); }
  D.CUT.toolChosen = true; D.cutRender();
  return el('cutHint').textContent;
}
const create = () => { const n = D.tpList().length; D.CUT.toolChosen = true; D.cutApply(); return D.tpList().length > n ? D.tpList().at(-1) : null; };
const deepest = (tp) => { let z = 0, d = 0; for (const m of tp.moves) { if (m.z !== undefined) z = m.z; if (m.g === 1) d = Math.min(d, z); } return -d; };
const rows = (tp) => plain(D.tpRows(tp)).map((r) => r.join(': ')).join(' | ');
function paramTo(name, expr) {                                       // in the Parameters list, as at the screen
  el('paramsBtn').click();
  const row = [...el('paramList').querySelectorAll('.prow:not(.pbuilt)')].find((r) => r.querySelector('.pname').value === name);
  const ex = row.querySelector('.pexpr'); ex.value = expr; ex.dispatchEvent(new D.Event('change', { bubbles: true }));
  el('paramDone').click();
}

test('a depth typed as a parameter: cut at its value, remembered, shown on the card and when editing', () => {
  drawing();
  open('pocket', { depth: 'material / 2' });
  const tp = create();
  near(tp.depth, 6); near(deepest(tp), 6, 'cut 6 mm deep');
  assert.deepEqual(plain(tp.exprs), { depth: { e: 'material / 2', u: 'mm' } });
  assert.match(rows(tp), /Depth: 6\.00 mm = material \/ 2 in/);
  D.cutOpen(tp); assert.equal(el('cutDepth').value, 'material / 2', 'editing shows it'); D.cutClose();
});
test('change the parameter, or the material: the toolpath is recalculated', () => {
  drawing();
  open('pocket', { depth: 'pk' }); const tp = create(); near(deepest(tp), 5);
  paramTo('pk', '7'); near(tp.depth, 7); near(deepest(tp), 7, 'cut 7 mm deep now');
  open('pocket', { depth: 'material - 2' }); const tp2 = create(); near(deepest(tp2), 10);
  set('stkT', '18', 'change'); near(deepest(tp2), 16, 'the material went to 18');
  D.doUndo(); near(D.tpList()[1].depth, 10, 'Undo puts it back');
});
test('a parameter change that puts a toolpath past the material says so', () => {
  drawing();
  open('pocket', { depth: 'pk' }); const tp = create();
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => toasts.push(t + ' | ' + b);
  try { paramTo('pk', '14'); } finally { D.toast = real; }
  near(deepest(tp), 14);
  assert.ok(toasts.some((t) => /Pocket now cuts past the material \| Pocket goes 14\.00 mm deep: through the 12\.00 mm material and 2\.00 mm/.test(t)), toasts.join(' / '));
  assert.match(rows(tp), /⚠ Depth: goes 14\.00 mm deep/);
});
test('a depth from a parameter needs the material’s thickness: refused without it', () => {
  drawing(0);
  const hint = open('pocket', { depth: 'pk' });
  assert.match(hint, /^⚠ Depth: a depth from a parameter needs the material.s thickness/);
  assert.equal(create(), null, 'Create does nothing');
  open('pocket', { depth: '3 + 2' });
  near(create().depth, 5, 'arithmetic alone is fine: worked out once');
});
test('mistakes are refused in the editor', () => {
  drawing();
  assert.match(open('pocket', { depth: 'nope + 1' }), /^⚠ Depth: there.s no parameter called .nope./);
  assert.equal(create(), null);
  assert.match(open('pocket', { depth: 'pk - 9' }), /^⚠ Depth: pk - 9 comes to -4\.00 mm, and it has to be more than 0/);
  assert.equal(create(), null);
  // a good depth first, then a mistake: Create mustn’t quietly use the old one
  open('pocket', { depth: 4 }); set('cutDepth', 'nope'); D.cutRender();
  assert.equal(create(), null, 'refused, not cut 4 mm deep');
});
test('arithmetic without names is worked out once; a plain number unlinks', () => {
  drawing();
  open('pocket', { depth: '6 + 2' }); const tp = create();
  near(tp.depth, 8); assert.deepEqual(plain(tp.exprs), {}, 'not linked');
  open('pocket', { depth: 'pk' }); const tp2 = create();
  D.cutOpen(tp2); set('cutDepth', '4'); D.cutApply();
  const after = D.tpList().find((t) => t.id === tp2.id);
  near(after.depth, 4); assert.deepEqual(plain(after.exprs), {}, 'unlinked by a plain number');
});
test('tab thickness from a parameter follows it', () => {
  drawing(12, [['tab_thk', '1.5']]);
  open('outside', { through: true, tabThk: 'tab_thk' }); const tp = create();
  near(tp.tabThk, 1.5);
  paramTo('tab_thk', '2.5'); near(tp.tabThk, 2.5);
  assert.ok(tp.moves.some((m) => m.z !== undefined && Math.abs(m.z - (-12 + 2.5)) < 1e-6), 'the tabs are cut 2.5 mm thick');
});
test('a through cut’s depth is the material’s, whatever was typed before', () => {
  drawing();
  open('outside', { depth: 'pk' }); tick('cutThrough', true); D.cutRender(); const tp = create();
  near(deepest(tp), 12.2);
  D.DOC.params = [];                                              // the parameter it once had is gone
  assert.equal(D.tpExprProblem(tp), '', 'a through cut doesn’t use it');
});
test('parameters that can’t be worked out stop Save G-code, with no way past', async () => {
  drawing();
  open('pocket', { depth: 'pk' }); const tp = create();
  set('stkT', '', 'change');                                       // the thickness cleared
  assert.match(D.tpExprProblem(tp), /Depth \(pk\): a depth from a parameter needs the material.s thickness/);
  assert.match(rows(tp), /⚠ Parameters: Depth \(pk\)/);
  let saved = null;
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  try {
    D.tpExport(); await later();
    assert.equal(el('dlgTitle').textContent, 'Parameters can’t be worked out');
    assert.ok(el('dlgCancel').style.display === 'none', 'only OK: no Save anyway');
    el('dlgOk').click(); await later(80);
    assert.equal(saved, null, 'nothing saved');
  } finally { delete D.window.showSaveFilePicker; }
});
test('a parameter used by a toolpath can’t be deleted; renaming changes the toolpath too', () => {
  drawing();
  open('pocket', { depth: 'pk * 2' }); const tp = create();
  el('paramsBtn').click();
  const row = () => el('paramList').querySelector('.prow:not(.pbuilt)');
  row().querySelector('.pdel').click();
  assert.match(el('paramSay').textContent, /pk is used by the toolpath Pocket/);
  const nm = row().querySelector('.pname'); nm.value = 'pocket_d'; nm.dispatchEvent(new D.Event('change', { bubbles: true }));
  el('paramDone').click();
  assert.equal(tp.exprs.depth.e, 'pocket_d * 2'); near(tp.depth, 10);
});
test('every length box takes arithmetic and parameters, worked out once', () => {
  drawing(18, [['thickness', '18'], ['shelf', '600 - 2 * thickness']]);
  near(D.lenIn('600 - 2 * thickness'), 564); near(D.lenIn('shelf / 2'), 282); near(D.lenIn('3/4'), 0.75); near(D.lenIn('12 1/2'), 12.5);
  assert.ok(isNaN(D.lenIn('nope')));
  D.SEL = [0]; D.selBoxApply('w', 'thickness * 2');
  near(D.DOC.ents[0].w, 36, 'the selection box’s W');
});
