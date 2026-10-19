// The Inlay wizard (inlay-wizard.js): both halves of an inlay from the bits chosen first, on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ': ' + a + ' against ' + b);
const $ = (id) => D.document.getElementById(id);
const type = (id, v) => { $(id).value = String(v); $(id).dispatchEvent(new D.Event('input', { bubbles: true })); };
const cut = (feed, stepdown, stepover) => ({ machine: 'M1', material: 'oak', feed, plunge: feed / 2, rpm: 18000, stepdown, stepover, rateUnits: 1, lengthUnits: 'mm' });
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 300, h: 200, t: 19, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 40, h: 30, layer: 'L1' }, { t: 'circle', cx: 120, cy: 40, r: 15, layer: 'L1' }];
  D.DOC.toolpaths = []; D.DOC.tpGroups = []; delete D.DOC.sheets; delete D.DOC.activeSheet;
  D.TOOLLIB_TEST = { source: { file: 'tools.vtdb', importedAt: 1 }, machines: [{ id: 'M1', name: 'XXL' }], materials: [{ id: 'oak', name: 'Oak' }], tree: [],
    tools: [{ id: 'v60', name: '60° V-bit', type: 3, typeName: 'V-Bit', units: 'mm', diameter: 12.7, angle: 60, flutes: 2, numbers: {}, cuts: [cut(1500, 3, 0.2)], notes: '' },
            { id: 'tbn', name: 'TBN1-32', type: 5, typeName: 'Tapered Ball Nose', units: 'in', diameter: 0.25, angle: 10.8, tipRadius: 0.03125, flutes: 2, numbers: {}, cuts: [], notes: '' },
            { id: 'em', name: '1/8 in end mill', type: 1, typeName: 'End Mill', units: 'in', diameter: 0.125, flutes: 2, numbers: {}, cuts: [cut(1000, 1.5, 1.25)], notes: '' }] };
  D.run("TOOLLIB = TOOLLIB_TEST; UICFG.libMachine = 'M1'; UICFG.libMaterial = 'oak'; delete UICFG.inlayWiz; UNDO = []; REDO = []; sheetsInit(); 1");
}
// open it the way it's opened: select the shapes, make a toolpath, choose Inlay
function openFromEditor(sel) {
  D.SEL = sel; D.cutOpen(null);
  $('cutType').value = 'inlay'; $('cutType').dispatchEvent(new D.Event('change', { bubbles: true }));
}
// choose a bit as the window's Choose… button does: the library opens to pick from
function choose(which, id) {
  $(which === 'vbit' ? 'inwBitBtn' : 'inwMillBtn').click();
  assert.equal($('libModal').hidden, false, 'the tool library opens');
  D.run(`LIBUI.sel = '${id}'; libPickNow(); 1`);
}
const list = () => plain(D.run('tpList()'));

test('choosing Inlay for a new toolpath opens the wizard with the shapes selected, and nothing can be made until the bits are chosen', () => {
  setup(); openFromEditor([0, 1]);
  assert.equal(D.run('CUT'), null, 'the toolpath editor closes');
  assert.equal($('inwModal').hidden, false);
  assert.equal($('inwShapes').textContent, '2 shapes');
  assert.equal($('inwCreate').disabled, true);
  assert.match($('inwProblem').textContent, /^Choose the bit that carves the inlay/);
  choose('vbit', 'v60');
  assert.match($('inwBit').textContent, /^60° V-bit · 60°$/);
  assert.match($('inwProblem').textContent, /^Choose the end mill that clears the floor/);
  choose('mill', 'em');
  assert.match($('inwMill').textContent, /^1\/8 in end mill · 3\.1[78] mm$/);   // (3.175 to two places)
  assert.equal($('inwProblem').textContent, ''); assert.equal($('inwCreate').disabled, false);
  assert.equal($('inwFit').textContent, 'The plug seats 2.50 mm into the pocket, with 2.50 mm underneath for glue, and stands 2.50 mm proud of the surface, to plane off.');
});
test('depths that can’t make an inlay say why, and stop Create', () => {
  setup(); openFromEditor([0]); choose('vbit', 'v60'); choose('mill', 'em');
  for (const [d, s, m, why] of [[5, 2.5, 2, /plug depth must be more than the start depth/], [2, 2.5, 5, /pocket must be deeper than the plug’s start depth/],
                                [25, 2.5, 5, /deeper than the material \(19\.00 mm/], ['', 2.5, 5, /Fill in all three depths/]]) {
    type('inwD', d); type('inwS', s); type('inwM', m);
    assert.match($('inwProblem').textContent, why, [d, s, m].join(', ')); assert.equal($('inwCreate').disabled, true);
  }
  type('inwD', 5); type('inwS', 2.5); type('inwM', 5);
  assert.equal($('inwCreate').disabled, false);
});
test('Create: both halves, each a clearing pocket and a V-carve in a group, the plug mirrored on a sheet of its own', async () => {
  setup(); openFromEditor([0]); choose('vbit', 'v60'); choose('mill', 'em');
  type('inwD', 4); type('inwS', 2); type('inwM', 5);
  $('inwCreate').click(); await D.run('busyIdle()');          // (the work runs with the Working panel up)
  assert.equal($('inwModal').hidden, true);
  const sheets = plain(D.run('DOC.sheets'));
  assert.deepEqual(sheets.map((s) => s.name), ['Sheet 1', 'Inlay plug']);
  assert.equal(D.run('DOC.activeSheet'), sheets[0].id, 'still showing the base');
  const groups = plain(D.run('tpGroups()')), tps = list();
  assert.deepEqual(groups.map((g) => g.name), ['Inlay pocket', 'Inlay plug']);
  const of = (g) => tps.filter((t) => t.group === groups[g].id);
  const [pc, pv] = [of(0).find((t) => t.side === 'pocket'), of(0).find((t) => t.side === 'vcarve')];
  const [qc, qv] = [of(1).find((t) => t.side === 'pocket'), of(1).find((t) => t.side === 'vcarve')];
  // the pocket: on the shapes, to 4 mm; the plug: from 2 mm down to 5 mm, on its sheet
  assert.equal(pv.vcMax, 4); assert.equal(pv.vcStart, undefined); assert.equal(pc.depth, 4);
  assert.equal(qv.vcMax, 5); assert.equal(qv.vcStart, 2); assert.equal(qc.depth, 5);
  assert.equal(pc.clearFor, pv.id); assert.equal(qc.clearFor, qv.id);
  assert.equal(D.run(`tpSheetOf(tpList().filter(function (t) { return t.id === '${pv.id}'; })[0])`), sheets[0].id);
  assert.equal(D.run(`tpSheetOf(tpList().filter(function (t) { return t.id === '${qv.id}'; })[0])`), sheets[1].id);
  // the bits, and their feeds for oak, from the library; the clearing stands off where the V-bit meets the floor
  assert.deepEqual([pv.toolId, pv.vAngle, pv.dia, pv.feed, pc.toolId, pc.dia, pc.feed, pc.step, pc.stepoverPct], ['v60', 60, 12.7, 1500, 'em', 3.175, 1000, 1.5, 39]);
  near(pc.allowance, 4 * Math.tan(Math.PI / 6), 1e-9, 'pocket'); near(qc.allowance, 3 * Math.tan(Math.PI / 6), 1e-9, 'plug, from its start depth down');
  assert.ok(pv.vcFloor > 0 && qv.vcFloor > 0, 'each V-carve flattens what its clearing cutter leaves');
  // the plug's shapes: a boundary and the rectangle mirrored about its own centre, on the plug's sheet, where it is
  const ents = plain(D.DOC.ents), plugEnts = ents.filter((e) => e.sheet === sheets[1].id);
  assert.equal(plugEnts.length, 2);
  const copy = plugEnts.find((e) => e.t === 'rect' && e.w === 40);
  assert.ok(copy && Math.abs(copy.x - 20) < 1e-9 && Math.abs(copy.y - 20) < 1e-9, 'mirrored in place: ' + JSON.stringify(copy));
  assert.ok(plugEnts.some((e) => e.t === 'rect' && e.w > 40), 'and a boundary round it');
  assert.ok(ents.filter((e) => e.sheet === sheets[0].id).length === 2, 'the base’s shapes stay on the base');
  // one undo: all of it gone, the sheet too
  D.run('doUndo(); 1');
  assert.equal(list().length, 0); assert.equal(plain(D.run('tpGroups()')).length, 0);
  assert.equal(D.run('multiSheet()'), false);
  assert.equal(plain(D.DOC.ents).length, 2);
});
test('a tapered ball nose: both V-carves are carved with its ball, and the clearing allows for it', async () => {
  setup(); openFromEditor([1]); choose('vbit', 'tbn'); choose('mill', 'em');
  assert.match($('inwBit').textContent, /10\.8°, 0\.79 mm tip radius/);
  type('inwD', 4); type('inwS', 2); type('inwM', 5);
  $('inwCreate').click(); await D.run('busyIdle()');          // (the work runs with the Working panel up)
  const vs = list().filter((t) => t.side === 'vcarve'), cs = list().filter((t) => t.side === 'pocket');
  assert.equal(vs.length, 2);
  vs.forEach((v) => { assert.equal(v.vBall, true); near(v.vTipR, 0.7938, 1e-4); });
  const b = D.Cam.vbitShape({ angle: 10.8, tipR: vs[0].vTipR });
  near(cs.find((c) => c.clearFor === vs.find((v) => !v.vcStart).id).allowance, b.reach(4), 1e-9, 'pocket');
  near(cs.find((c) => c.clearFor === vs.find((v) => v.vcStart).id).allowance, b.reach(3), 1e-9, 'plug');
});
test('the plug on the same sheet: beside the design, and the wizard remembers what was chosen', async () => {
  setup(); openFromEditor([0]); choose('vbit', 'v60'); choose('mill', 'em');
  type('inwD', 4); type('inwS', 2); type('inwM', 5);
  $('inwSheet').checked = false;
  $('inwCreate').click(); await D.run('busyIdle()');          // (the work runs with the Working panel up)
  assert.equal(D.run('multiSheet()'), false, 'no new sheet');
  const copy = plain(D.DOC.ents).find((e, i) => i > 1 && e.t === 'rect' && e.w === 40);
  assert.ok(copy.x > 60, 'set beside the design: ' + copy.x);
  assert.deepEqual(plain(D.run('tpGroups()')).map((g) => g.name), ['Inlay pocket', 'Inlay plug']);
  // next time: the same bits and depths, ready
  openFromEditor([1]);
  assert.match($('inwBit').textContent, /^60° V-bit/); assert.match($('inwMill').textContent, /^1\/8 in end mill/);
  assert.deepEqual([$('inwD').value, $('inwS').value, $('inwM').value, $('inwSheet').checked], ['4.00', '2.00', '5.00', false]);
  D.run('inwClose(); 1');
});
test('while it works, the Working panel says what it’s doing, step by step, and goes when it’s done', async () => {
  setup(); openFromEditor([0]); choose('vbit', 'v60'); choose('mill', 'em');
  $('inwCreate').click();
  assert.equal($('inwModal').hidden, true, 'the wizard closes at once');
  assert.equal($('busy').hidden, false, 'the panel is up');
  assert.equal($('busyTitle').textContent, 'Making the inlay…');
  assert.equal($('busyBarWrap').hidden, false, 'with a bar: five steps');
  const seen = new Set();
  while (D.run('busyNow()')) { seen.add($('busyStep').textContent); await new Promise((r) => setTimeout(r, 5)); }
  assert.ok(seen.has('1 of 5: the plug’s shapes') && seen.has('3 of 5: Inlay pocket: V-carve') && seen.has('5 of 5: Inlay plug: V-carve'), [...seen].join(' | '));
  assert.equal($('busy').hidden, true);
  assert.equal(list().length, 4);
});
test('Recalculate all and a toolpath’s Create show the panel too, and keys wait while it’s up', async () => {
  setup(); openFromEditor([0]); choose('vbit', 'v60'); choose('mill', 'em');
  $('inwCreate').click(); await D.run('busyIdle()');
  const p = D.run('tpRecalcAll()');
  assert.equal($('busy').hidden, false); assert.equal($('busyTitle').textContent, 'Recalculating the toolpaths…');
  assert.equal(D.run('busyNow()'), true);
  await p;
  assert.equal($('busy').hidden, true);
  // the editor's Create button
  D.SEL = [1]; D.cutOpen(null); D.run("CUT.side = 'outside'; CUT.dia = 6; CUT.toolChosen = true; CUT.depth = 3; 1");
  $('cutOk').click();
  assert.equal($('busyTitle').textContent, 'Working out the toolpath…'); assert.equal($('busy').hidden, false);
  await D.run('busyIdle()');
  assert.equal(list().filter((t) => t.side === 'outside').length, 1);
});
