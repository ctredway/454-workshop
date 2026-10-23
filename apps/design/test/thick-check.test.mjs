// A material thickness or a depth no machine could cut is asked about: in Job setup as it's typed, on opening a
// drawing, and before Save G-code (past the bit's cutting length, or deeper than THICK_ASK_MM). Clint's bookstand, twice
// (2026-10-22 and 23): 11.9 typed with Job setup in inches made it 302 mm thick, through cuts went 117 passes deep, and
// Design slowed to a crawl. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
const later = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const asking = () => !el('dlgModal').hidden;

function drawing(t = 12) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 60, h: 40, layer: 'L1' }]; D.DOC.toolpaths = []; D.DOC.name = 'Bookstand';
  D.run("UICFG.stockUnits = 'mm'; 1"); D.syncStockUI();
  if (asking()) el('dlgCancel').click();
}
function profile(o = {}) {
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 3.175);
  if (o.through) tick('cutThrough', true); else set('cutDepth', o.depth || 3);
  set('cutStep', 3);
  D.CUT.toolChosen = true; D.cutApply();
  const tp = D.tpList().at(-1);
  if (o.toolId) tp.toolId = o.toolId;
  return tp;
}
function thickness(txt, units) {
  D.run(`UICFG.stockUnits = '${units}'; 1`);
  set('stkT', txt, 'change');
}

test('11.9 typed in inches: asked, and Change it keeps the thickness it had', async () => {
  drawing(12);
  thickness('11.9', 'in');
  await later();
  assert.ok(asking(), 'asked');
  assert.equal(el('dlgTitle').textContent, 'Is the material really that thick?');
  assert.match(el('dlgBody').textContent, /You typed “11\.9” with Job setup in inches: that makes the material 302\.26 mm \(11\.9 in\) thick/);
  assert.match(el('dlgBody').textContent, /If you meant 11\.9 mm/);
  assert.equal(el('dlgCancel').textContent, 'Change it');
  assert.equal(D.DOC.stock.t, 12, 'nothing changed while it asks');
  el('dlgCancel').click(); await later();
  assert.equal(D.DOC.stock.t, 12, 'still 12 mm');
  assert.equal(el('stkT').value, D.run("fmtStockLen(12, 'in')"), 'the box shows it again');
});
test('Use it: the thickness is taken, as typed', async () => {
  drawing(12);
  thickness('150', 'mm');
  await later();
  assert.ok(asking());
  el('dlgOk').click(); await later(300);
  assert.equal(D.DOC.stock.t, 150);
});
test('an ordinary thickness is taken without asking', async () => {
  drawing(12);
  thickness('3/4', 'in');
  await later(300);
  assert.ok(!asking(), 'no question');
  assert.ok(Math.abs(D.DOC.stock.t - 19.05) < 1e-9);
});
test('Save G-code: a through cut in 302 mm material is asked about, and nothing saved until it’s confirmed', async () => {
  drawing(302.26); profile({ through: true });
  let saved = null;
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  try {
    D.tpExport(); await later();
    assert.ok(asking());
    assert.equal(el('dlgTitle').textContent, 'Too deep?');
    assert.match(el('dlgBody').textContent, /goes 302\.46 mm \(11\.908 in\) deep, more than most machines can reach/);
    el('dlgCancel').click(); await later(80);
    assert.equal(saved, null, 'not saved');
  } finally { delete D.window.showSaveFilePicker; }
});
test('Save G-code: deeper than the bit’s cutting length (from the tool library) is asked about', async () => {
  drawing(30);
  D.run("var realLibTool = libTool; libTool = function (id) { return id === 'T1' ? {fluteLength: 0.5, units: 'in'} : null; }; 1");
  try {
    profile({ depth: 20, toolId: 'T1' });
    D.tpExport(); await later();
    assert.ok(asking());
    assert.match(el('dlgBody').textContent, /goes 20\.00 mm deep, past its bit’s 12\.70 mm cutting length/);
    el('dlgCancel').click(); await later();
    D.DOC.toolpaths = []; profile({ depth: 12, toolId: 'T1' });
    assert.equal(D.tpTooDeep(D.tpList().at(-1)), null, 'within the cutting length');
  } finally { D.run('libTool = realLibTool; 1'); }
});
test('opening a drawing saved 302 mm thick says so', () => {
  drawing(12);
  const toasts = [], real = D.toast;
  D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };
  try {
    D.openDrawing(JSON.parse(JSON.stringify({ stock: Object.assign({}, D.DOC.stock, { t: 302.26 }), ents: [], dims: [], toolpaths: [] })), 'bookstand.json');
    assert.ok(toasts.some((t) => /Check the material’s thickness \| Job setup says 302\.26 mm \(11\.9 in\) thick/.test(t)), toasts.join(' / '));
  } finally { D.toast = real; }
});
