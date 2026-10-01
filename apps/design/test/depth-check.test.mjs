// Every toolpath that goes past the bottom of the material says so (tpPastMaterial, from the deepest point actually
// cut): on its card, in the editor, before Save G-code and Preview in 454 Control, and when a change of material
// puts it through. Through cuts are left alone for their overcut. On Design's real sources:
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
const RECT = { t: 'rect', x: 20, y: 20, w: 60, h: 40 };

function drawing(t = 12, zero = 'top') {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t, zero });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [Object.assign({ layer: 'L1' }, RECT), { t: 'circle', cx: 150, cy: 60, r: 3, layer: 'L1' }]; D.DOC.toolpaths = []; D.DOC.name = 'Box';
  if (!el('dlgModal').hidden) el('dlgCancel').click();
}
// open the editor on a shape and set it up; returns the editor's hint before Create
function open(sel, type, o = {}) {
  D.SEL = [sel]; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', o.dia || 6.35);
  if (o.through) { tick('cutThrough', true); if (o.over !== undefined) set('cutOver', o.over); } else set('cutDepth', o.depth);
  if (o.vAngle) set('cutVcAngle', o.vAngle);
  D.CUT.toolChosen = true; D.cutRender();
  return el('cutHint').textContent;
}
const create = () => { D.CUT.toolChosen = true; D.cutApply(); return D.tpList().at(-1); };
const rows = (tp) => JSON.parse(JSON.stringify(D.tpRows(tp))).map((r) => r.join(': ')).join(' | ');

test('a pocket deeper than the material: said in the editor and on its card', () => {
  drawing();
  const hint = open(0, 'pocket', { depth: 15 });
  assert.match(hint, /^⚠ This goes 15\.00 mm deep: through the 12\.00 mm material and 3\.00 mm into the spoilboard\. Tick Through if that.s meant\./);
  const tp = create();
  near(tp.past.depth, 15); near(tp.past.past, 3);
  assert.match(rows(tp), /⚠ Depth: goes 15\.00 mm deep: through the 12\.00 mm material and 3\.00 mm into the spoilboard/);
});
test('within the material, or exactly to its bottom: nothing said', () => {
  drawing();
  for (const d of [11.9, 12]) {
    const hint = open(0, 'pocket', { depth: d });
    assert.doesNotMatch(hint, /⚠/, d + ' mm');
    assert.equal(create().past, null, d + ' mm');
  }
});
test('through cuts: their overcut is meant; and the same with Z zero on the spoilboard', () => {
  for (const zero of ['top', 'bottom']) {
    drawing(12, zero);
    open(0, 'outside', { through: true }); assert.equal(create().past, null, zero + ': 0.2 overcut');
    open(0, 'outside', { through: true, over: 1.5 }); assert.equal(create().past, null, zero + ': a 1.5 overcut, set on purpose');
    open(0, 'outside', { depth: 13 });
    const tp = create(); near(tp.past.past, 1, zero + ': a typed 13 mm, not through');
  }
});
test('every kind: a V-carve, drilling, a chamfer, from the deepest point really cut', () => {
  drawing(6);
  open(0, 'vcarve', { vAngle: 60, dia: 50 });                     // 40 mm across: 34.64 mm deep with a 60° bit
  let tp = create();
  assert.ok(tp.past && tp.past.depth > 30, 'the V-carve: ' + JSON.stringify(tp.past));
  assert.match(rows(tp), /into the spoilboard\. Set a max depth/);
  drawing(6);
  open(1, 'drill', { depth: 8, dia: 6 }); tp = create();
  near(tp.past.depth, 8, 'drilling'); near(tp.past.past, 2);
  drawing(6);
  open(0, 'chamfer', { dia: 12.7, vAngle: 90 }); set('cutChamW', 3); D.cutRender(); tp = create();
  assert.equal(tp.past, null, 'a 3 mm chamfer in 6 mm material');
});
test('Save G-code: lists what goes past and saves nothing unless told to', async () => {
  drawing(); open(0, 'pocket', { depth: 15 }); create();
  let saved = null;
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  try {
    D.tpExport(); await later();
    assert.ok(!el('dlgModal').hidden); assert.equal(el('dlgTitle').textContent, 'Cutting past the material');
    assert.match(el('dlgBody').textContent, /Pocket goes 15\.00 mm deep: through the 12\.00 mm material and 3\.00 mm into the spoilboard/);
    assert.equal(el('dlgOk').textContent, 'Save anyway');
    el('dlgCancel').click(); await later();
    assert.equal(saved, null, 'Cancel saves nothing');
    D.tpExport(); await later(); el('dlgOk').click(); await later(80);
    assert.ok(saved && /G21/.test(saved), 'Save anyway saves it');
  } finally { delete D.window.showSaveFilePicker; }
});
test('Preview in 454 Control asks the same', async () => {
  drawing(); open(0, 'pocket', { depth: 15 }); create();
  D.tpPreview(); await later();
  assert.equal(el('dlgTitle').textContent, 'Cutting past the material'); assert.equal(el('dlgOk').textContent, 'Preview anyway');
  el('dlgCancel').click();
});
test('a job within the material saves without asking', async () => {
  drawing(); open(0, 'pocket', { depth: 5 }); create();
  let saved = null;
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  try { D.tpExport(); await later(80); assert.ok(el('dlgModal').hidden, 'no question'); assert.ok(saved); }
  finally { delete D.window.showSaveFilePicker; }
});
test('no material thickness: the card and Save G-code say depths can’t be checked', async () => {
  drawing(0); open(0, 'pocket', { depth: 15 }); const tp = create();
  assert.equal(tp.past, null);
  assert.match(rows(tp), /depth isn.t checked against the material: set its thickness in Settings/);
  D.tpExport(); await later();
  assert.equal(el('dlgTitle').textContent, 'Depths not checked');
  assert.match(el('dlgBody').textContent, /Pocket, 15\.00 mm deep/);
  el('dlgCancel').click();
});
test('a thinner material in Settings names the toolpaths it puts through', () => {
  drawing(); open(0, 'pocket', { depth: 10 }); create();
  const toasts = [];
  const real = D.toast; D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
  try {
    set('stkT', '9', 'change');
    assert.ok(toasts.some((t) => /Pocket now cuts past the material \| Pocket goes 10\.00 mm deep: through the 9\.00 mm material and 1\.00 mm/.test(t)), toasts.join(' / '));
    toasts.length = 0; set('stkT', '8', 'change');
    assert.ok(!toasts.some((t) => /now cuts past/.test(t)), 'only once: it was already past');
  } finally { D.toast = real; }
});
