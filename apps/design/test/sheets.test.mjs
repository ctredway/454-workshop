// Sheets (sheets.js): several pieces of material in one project. Add, rename and delete them; each shape, dimension
// and toolpath is on one sheet; only the sheet being shown is seen, picked, checked, nested, exported and saved as
// G-code. Sheets are separate from layers. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.VIEW.scale = 4;                                                   // the test page has no size, so no zoom: picking needs one
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const later = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));
const sheets = () => plain(D.DOC.sheets || null);
const onSheet = (id) => plain(D.DOC.ents).filter((e) => e.sheet === id).map((e) => e.x);
const seen = () => Array.from(D.DOC.ents).filter((e) => D.entVisible(e)).map((e) => e.x);
const cards = () => [...el('tpList').querySelectorAll('.tpCard, .tpItem, [data-tp]')].length;

// a plain drawing: two rectangles on two layers, 12 mm material
function drawing() {
  if (D.CUT) D.cutClose();
  if (!el('dlgModal').hidden) el('dlgCancel').click();
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Outline', visible: true, locked: false}, {id: 'L2', name: 'Pockets', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 20, y: 20, w: 60, h: 40, layer: 'L1'}, {t: 'rect', x: 120, y: 20, w: 60, h: 40, layer: 'L2'}], name: 'Cabinet'};
    UNDO.length = 0; SEL = []; CUTSEL = null; UICFG.stockUnits = 'mm'; renderToolpathPanel(); 1`);
}
function pocket(i, depth = 5) {
  D.SEL = [i]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); set('cutDepth', depth);
  D.CUT.toolChosen = true; D.cutRender(); const n = D.tpList().length; D.cutApply();
  return D.tpList().length > n ? D.tpList().at(-1) : null;
}
const draw = (x) => D.run(`DOC.ents.push({t: 'rect', x: ${x}, y: 100, w: 30, h: 20, layer: DOC.activeLayer}); persist(); layersInit(); 1`);
const saving = async (fn) => {
  const out = [];
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { out.push({ name: o.suggestedName, text: t }); }, close: async () => {} }) });
  try { await fn(); await later(80); } finally { delete D.window.showSaveFilePicker; }
  return out;
};

test('a plain drawing is one sheet: the bar shows it, with Add and nothing to choose or delete', () => {
  drawing();
  assert.equal(sheets(), null);
  assert.equal(el('tpSheetBar').hidden, false);
  assert.equal(el('tpSheet').disabled, true);
  assert.equal(el('tpSheet').options[0].textContent, 'Sheet 1');
  assert.equal(el('tpSheetRename').hidden, true); assert.equal(el('tpSheetDel').hidden, true);
  assert.deepEqual(seen(), [20, 120]);
});
test('Add sheet: what was drawn becomes Sheet 1, and Sheet 2 is shown, empty', () => {
  drawing();
  const tp = pocket(0);
  el('tpSheetAdd').click();
  assert.deepEqual(sheets(), [{ id: 'S1', name: 'Sheet 1' }, { id: 'S2', name: 'Sheet 2' }]);
  assert.equal(D.DOC.activeSheet, 'S2');
  assert.deepEqual(onSheet('S1'), [20, 120], 'the shapes stay on Sheet 1');
  assert.equal(tp.sheet, 'S1', 'and so does the toolpath');
  assert.equal(D.tpStale(tp), false, 'which isn’t out of date for it: nothing about its shapes changed');
  assert.deepEqual(seen(), [], 'Sheet 2 has nothing on it');
  D.selectAll(); assert.equal(D.SEL.length, 0, 'nothing on another sheet can be selected');
  assert.equal(el('tpSheet').disabled, false); assert.equal(el('tpSheet').value, 'S2');
  assert.equal(el('tpSheetDel').hidden, false);
  assert.equal(plain(D.DOC.ents)[0].layer, 'L1', 'layers are untouched');
  assert.equal(D.DOC.layers.length, 2);
});
test('new shapes go on the sheet being shown; each sheet shows only its own', () => {
  drawing();
  D.sheetAdd(); draw(200);
  assert.deepEqual(onSheet('S2'), [200]);
  assert.deepEqual(seen(), [200]);
  set('tpSheet', 'S1', 'change');
  assert.equal(D.DOC.activeSheet, 'S1'); assert.deepEqual(seen(), [20, 120]);
  D.selectAll(); assert.equal(D.SEL.length, 2);
  // a hidden layer still hides, on every sheet
  D.DOC.layers[1].visible = false; assert.deepEqual(seen(), [20]); D.DOC.layers[1].visible = true;
});
test('toolpaths belong to a sheet: the panel, Check and Save G-code cover the one shown', async () => {
  drawing();
  const a = pocket(0); a.name = 'First';
  D.sheetAdd(); draw(200);
  const b = pocket(2, 3); b.name = 'Second';
  assert.equal(b.sheet, 'S2');
  assert.deepEqual(Array.from(D.tpList()).filter((t) => D.tpOnSheet(t)).map((t) => t.name), ['Second']);
  assert.match(el('tpSheet').options[0].textContent, /^Sheet 1 \(1 toolpath\)$/);
  assert.equal(D.tpUncutIssues().length, 0, 'Check on Sheet 2: its one shape is cut, and Sheet 1’s uncut rectangle isn’t its business');
  let saved = await saving(() => D.tpExport());
  assert.equal(saved.length, 1); assert.match(saved[0].name, /Cabinet - Sheet 2/);
  assert.match(saved[0].text, /Second/); assert.doesNotMatch(saved[0].text, /First/);
  D.sheetShow('S1');
  saved = await saving(() => D.tpExport());
  assert.match(saved[0].name, /Cabinet - Sheet 1/); assert.match(saved[0].text, /First/); assert.doesNotMatch(saved[0].text, /Second/);
  // Check: the second rectangle on Sheet 1 has no toolpath; Sheet 2's shape is cut, and isn't Sheet 1's business
  const uncut = plain(D.tpUncutIssues());
  assert.equal(uncut.length, 1, JSON.stringify(uncut).slice(0, 300));
  // a sheet with shapes and no toolpaths yet says nothing, as a plain drawing with no toolpaths does
  D.sheetAdd(); draw(240);
  assert.equal(D.tpUncutIssues().length, 0, 'Sheet 3 has no toolpaths of its own yet');
});
test('a toolpath can’t take shapes from two sheets', () => {
  drawing();
  D.sheetAdd(); draw(200);
  const before = D.tpList().length;
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => toasts.push(t + ' | ' + b);
  try {
    D.SEL = [0, 2]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); set('cutDepth', 4);
    D.CUT.toolChosen = true; D.cutRender(); D.cutApply();
  } finally { D.toast = real; if (D.CUT) D.cutClose(); }
  assert.equal(D.tpList().length, before, 'not made');
  assert.ok(toasts.some((t) => /different sheets/.test(t) && /Sheet 1, Sheet 2/.test(t)), toasts.join(' / '));
});
test('rename: used in the list and the file name; an empty or taken name is refused', async () => {
  drawing();
  pocket(0); D.sheetAdd(); D.sheetShow('S1');
  el('tpSheetRename').click();
  assert.equal(el('tpSheetName').hidden, false); assert.equal(el('tpSheetName').value, 'Sheet 1');
  el('tpSheetName').value = 'Sides'; el('tpSheetName').dispatchEvent(new D.Event('blur'));
  assert.equal(sheets()[0].name, 'Sides');
  assert.equal(el('tpSheetName').hidden, true);
  assert.match(el('tpSheet').options[0].textContent, /^Sides/);
  const saved = await saving(() => D.tpExport());
  assert.match(saved[0].name, /Cabinet - Sides/);
  const real = D.toast; D.toast = () => {};
  try {
    assert.equal(D.sheetRename('S1', '  '), false); assert.equal(D.sheetRename('S1', 'sheet 2'), false, 'taken, whatever the capitals');
  } finally { D.toast = real; }
  assert.equal(sheets()[0].name, 'Sides');
  D.doUndo(); assert.equal(sheets()[0].name, 'Sheet 1', 'Undo takes the rename back');
});
test('delete: asks, then removes the sheet with its shapes, dimensions and toolpaths; Undo brings them back', async () => {
  drawing();
  D.sheetAdd(); draw(200);
  D.run(`addDim({kind: 'side', a: entId(DOC.ents[2]), at: hintOf(DOC.ents[2], {x: 215, y: 100})}); 1`);
  pocket(2, 3);
  assert.equal(D.DOC.dims.length, 1);
  el('tpSheetDel').click(); await later();
  assert.equal(el('dlgTitle').textContent, 'Delete “Sheet 2”?');
  assert.match(el('dlgBody').textContent, /the 1 shape and 1 toolpath on it/);
  el('dlgCancel').click(); await later();
  assert.equal(sheets().length, 2, 'Cancel deletes nothing');
  el('tpSheetDel').click(); await later(); el('dlgOk').click(); await later();
  assert.deepEqual(sheets(), [{ id: 'S1', name: 'Sheet 1' }]);
  assert.deepEqual(plain(D.DOC.ents).map((e) => e.x), [20, 120]);
  assert.equal(D.DOC.dims.length, 0); assert.equal(D.tpList().length, 0);
  assert.equal(D.DOC.activeSheet, 'S1'); assert.deepEqual(seen(), [20, 120]);
  assert.equal(el('tpSheetDel').hidden, true, 'the last sheet stays');
  D.doUndo();
  assert.equal(sheets().length, 2); assert.equal(D.DOC.ents.length, 3); assert.equal(D.DOC.dims.length, 1); assert.equal(D.tpList().length, 1);
});
test('an empty sheet is deleted without asking; Undo of Add sheet goes back to a plain drawing', async () => {
  drawing();
  D.sheetAdd();
  D.sheetDelete('S2'); await later();
  assert.ok(el('dlgModal').hidden, 'no question');
  assert.equal(sheets().length, 1);
  drawing();
  D.sheetAdd(); D.doUndo();
  assert.equal(sheets(), null); assert.deepEqual(seen(), [20, 120]);
  assert.equal(plain(D.DOC.ents)[0].sheet, undefined);
});
test('paste lands on the sheet being shown, in place, with its dimensions', () => {
  drawing();
  D.run(`addDim({kind: 'side', a: entId(DOC.ents[0]), at: hintOf(DOC.ents[0], {x: 50, y: 20})}); 1`);
  D.sheetAdd(); D.sheetShow('S1');
  D.SEL = [0]; assert.ok(D.clipCopy());
  D.sheetShow('S2');
  assert.ok(D.clipPaste(true));
  assert.deepEqual(onSheet('S2'), [20], 'the copy is on Sheet 2, where it was on Sheet 1');
  assert.deepEqual(seen(), [20]);
  assert.equal(D.DOC.dims.length, 2);
  assert.deepEqual(Array.from(D.DOC.dims).map((d) => D.dimOnSheet(d)), [false, true], 'each dimension shows with its own shape');
});
test('tools that look at other shapes don’t reach another sheet', () => {
  drawing();
  D.run(`DOC.ents = [{t: 'line', x1: 0, y1: 50, x2: 100, y2: 50, layer: 'L1'}, {t: 'line', x1: 50, y1: 0, x2: 50, y2: 100, layer: 'L1'}]; 1`);
  assert.equal(D.lineCuts(0).length, 1, 'on one sheet, the lines cross');
  D.sheetAdd();                                                    // both on Sheet 1
  D.run(`DOC.ents[1].sheet = 'S2'; 1`);                            // the crossing line is on Sheet 2 now
  D.sheetShow('S1');
  assert.equal(D.lineCuts(0).length, 0, 'a line on another sheet doesn’t cut it');
  assert.ok(!Array.from(D.allEdges()).some((o) => o.ent === 1), 'nor can its edges be picked');
  // a circle, and Extend, the same
  drawing();
  D.run(`DOC.ents = [{t: 'circle', cx: 50, cy: 50, r: 5, layer: 'L1'}, {t: 'line', x1: 0, y1: 50, x2: 40, y2: 50, layer: 'L1'}, {t: 'line', x1: 52, y1: 0, x2: 52, y2: 100, layer: 'L1'}]; 1`);
  assert.ok(D.circCuts(0).length > 0, 'on one sheet, the upright line crosses the circle');
  D.sheetAdd(); D.run(`DOC.ents[0].sheet = 'S2'; DOC.ents[2].sheet = 'S2'; 1`); D.sheetShow('S2');
  assert.ok(D.circCuts(0).length > 0, 'the circle and the upright line, both on Sheet 2');
  D.run(`DOC.ents[2].sheet = 'S1'; 1`);
  assert.equal(D.circCuts(0).length, 0, 'nothing on Sheet 2 crosses the circle now');
  D.sheetShow('S1');                                                // the two lines; the circle is on Sheet 2
  const real = D.toast; D.toast = () => {};
  try { D.doExtend({ x: 39, y: 50 }); } finally { D.toast = real; }
  assert.equal(plain(D.DOC.ents)[1].x2, 52, 'Extend runs to the line on its own sheet, not to the nearer circle (at 45) on the other');
});
test('a template is applied to the sheet being shown, by layer name', () => {
  drawing();
  D.sheetAdd(); draw(200);                                          // Sheet 2: one shape, on Outline
  const tpl = { kind: D.TPL_KIND, toolpaths: [{ name: 'Cut out', side: 'outside', dia: 6.35, depth: 3, layers: ['Outline'] }] };
  const plan = plain(D.tplPlan(tpl));
  assert.equal(plan[0].ents.length, 1, 'only Sheet 2’s shape on Outline, not Sheet 1’s');
});
test('a drawing saved when sheets were layers opens with sheets, and an ordinary layer', () => {
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12}), guides: [], dims: [], toolpaths: [{id: 'tpa', name: 'Old', ents: [], sheet: 'S2', side: 'pocket'}],
    layers: [{id: 'S1', name: 'Front', visible: true, locked: false, sheet: true, vcSheet: 'x'}, {id: 'S2', name: 'Back', visible: false, locked: false, sheet: true, vcSheet: 'y'}],
    activeLayer: 'S1', activeSheet: 'S1', ents: [{t: 'rect', x: 1, y: 1, w: 5, h: 5, layer: 'S1'}, {t: 'rect', x: 2, y: 1, w: 5, h: 5, layer: 'S2'}]}; layersInit(); 1`);
  assert.deepEqual(sheets(), [{ id: 'S1', name: 'Front' }, { id: 'S2', name: 'Back' }]);
  assert.deepEqual(plain(D.DOC.layers), [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]);
  assert.deepEqual(plain(D.DOC.ents).map((e) => [e.sheet, e.layer]), [['S1', 'L1'], ['S2', 'L1']]);
  assert.equal(D.DOC.activeLayer, 'L1'); assert.equal(D.DOC.activeSheet, 'S1');
  assert.deepEqual(seen(), [1]);
  assert.equal(D.tpSheetOf(D.tpList()[0]), 'S2', 'its toolpaths stay with their sheets');
});
test('a multi-sheet VCarve project comes in as sheets', () => {
  D.run(`DOC = {stock: Object.assign({}, DOC.stock), guides: [], dims: [], ents: [{t: 'rect', x: 1, y: 1, w: 5, h: 5, vcSheet: 'aa'}, {t: 'rect', x: 2, y: 1, w: 5, h: 5, vcSheet: 'bb'}, {t: 'rect', x: 3, y: 1, w: 5, h: 5, vcSheet: 'aa'}]}; 1`);
  const made = plain(D.sheetsFromCrv({ contourSheets: ['aa', 'bb', 'aa'], sheets: [{ id: 'aa', name: 'Letters' }, { id: 'bb', name: 'Backer' }] }));
  D.run('layersInit(); 1');
  assert.deepEqual(made.map((s) => s.name), ['Letters', 'Backer']);
  assert.deepEqual(plain(D.DOC.ents).map((e) => e.sheet), ['S1', 'S2', 'S1']);
  assert.deepEqual(seen(), [1, 3]);
  assert.equal(D.DOC.layers.length, 1); assert.equal(D.DOC.layers[0].name, 'Layer 1');
  assert.equal(D.sheetsFromCrv({ contourSheets: ['aa', 'aa'] }), null, 'one sheet: a plain drawing');
});
test('sheets wait while the toolpath editor is open', () => {
  drawing();
  D.sheetAdd(); D.sheetShow('S1');
  const real = D.toast; const toasts = []; D.toast = (k, t) => toasts.push(t);
  try {
    D.SEL = [0]; D.cutOpen(null);
    set('tpSheet', 'S2', 'change');
    assert.equal(D.DOC.activeSheet, 'S1', 'still on Sheet 1'); assert.equal(el('tpSheet').value, 'S1', 'and the list says so');
    assert.equal(D.sheetAdd(), null); assert.equal(sheets().length, 2);
    assert.ok(toasts.includes('Finish the toolpath first'));
  } finally { D.toast = real; D.cutClose(); }
});
test('DXF and SVG export, and Nest, take the sheet being shown', () => {
  drawing();
  D.sheetAdd(); draw(200);                                          // Sheet 1: two rectangles; Sheet 2: one
  assert.equal(D.dxfExport().count, 1, 'DXF: Sheet 2’s one shape');
  assert.equal(D.svgExport().count, 1, 'SVG: the same');
  D.SEL = []; D.openNestDialog();
  assert.equal(D.NEST.parts.length, 1, 'Nest everything: this sheet’s part');
  el('nestModal').hidden = true; D.NEST = null;
  D.sheetShow('S1');
  assert.equal(D.dxfExport().count, 2, 'DXF: Sheet 1’s two');
});
test('a toolpath moves up and down among its own sheet’s, and isn’t warned about another sheet’s profile', () => {
  drawing();
  const a = pocket(0); a.name = 'A1';
  D.sheetAdd(); draw(200);
  const b = pocket(2, 3); b.name = 'B2';
  D.sheetShow('S1');
  const c = pocket(1, 4); c.name = 'C1';
  const names = () => Array.from(D.tpList()).map((t) => t.name).join(' ');
  assert.equal(names(), 'A1 B2 C1');
  assert.equal(D.tpNeighbour(2, -1), 0, 'the one before C1 on Sheet 1 is A1, not Sheet 2’s B2');
  assert.equal(D.tpNeighbour(0, -1), -1); assert.equal(D.tpNeighbour(1, 1), -1, 'B2 is alone on Sheet 2');
  D.renderToolpathPanel();                                         // the cards, with the names just given
  const up = [...el('tpList').querySelectorAll('button')].filter((x) => /Move C1 earlier/.test(x.getAttribute('aria-label') || ''))[0];
  assert.ok(up && !up.disabled, 'C1 can run earlier');
  up.click();
  assert.equal(names(), 'C1 A1 B2', 'it went before A1');
  // an outside profile on Sheet 2, round where Sheet 1's pocket is: Sheet 1's pocket isn't inside that part
  D.sheetShow('S2');
  D.run(`DOC.ents.push({t: 'rect', x: 10, y: 10, w: 100, h: 80, layer: 'L1'}); persist(); layersInit(); 1`);
  D.SEL = [D.DOC.ents.length - 1]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); set('cutDepth', 3);
  D.CUT.toolChosen = true; D.cutRender(); D.cutApply();
  const list = Array.from(D.tpList()); const prof = list.findIndex((t) => t.side === 'outside');
  D.tpMoveTo(prof, 0);                                              // first in the list, before everything
  const at = Array.from(D.tpList()).findIndex((t) => t.name === 'A1');
  assert.equal(D.tpOrderNote(D.tpList()[at], at), null, 'no warning: the profile is on another sheet');
});
test('Fillet joins two lines on the same sheet, not one from each', () => {
  const corner = `DOC.ents = [{t: 'line', x1: 0, y1: 0, x2: 50, y2: 0, layer: 'L1'}, {t: 'line', x1: 50, y1: 0, x2: 50, y2: 50, layer: 'L1'}]; 1`;
  const real = D.toast; D.toast = () => {};
  try {
    drawing(); D.run(corner); D.UICFG.filletR = 5; D.UICFG.filletType = 'round';
    assert.equal(D.hoverFillet({ x: 50, y: 0 }).action, 'do', 'on one sheet: hovering the corner offers the fillet');
    D.doFillet({ x: 50, y: 0 }, 5);
    assert.equal(D.DOC.ents.length, 3, 'and clicking makes its arc');
    drawing(); D.run(corner);
    D.sheetAdd(); D.run(`DOC.ents[1].sheet = 'S2'; 1`); D.sheetShow('S1');
    assert.notEqual(D.hoverFillet({ x: 50, y: 0 }).action, 'do', 'the other line is on Sheet 2: nothing offered');
    D.doFillet({ x: 50, y: 0 }, 5);
    assert.equal(D.DOC.ents.length, 2, 'and nothing filleted');
    assert.equal(plain(D.DOC.ents)[0].x2, 50, 'and the line is untouched');
  } finally { D.toast = real; }
});
