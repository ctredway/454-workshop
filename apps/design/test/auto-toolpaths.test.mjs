// Make toolpaths (auto-toolpaths.js, Design 0.163.0): proposed from the drawing, added only on OK. Clint, 2026-10-26: "Can
// we create a routine that looks at a drawing and generate tool paths and give a short summary of what was generated."
// His rules: holes and slots cut through; a round hole a library bit fits, drilled; the bit used last; the parts cut
// out through with the tabs used last. On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const toasts = [];
D.toast = (k, t, b) => { toasts.push(t + ' | ' + b); };

// a library: a 1/4 in end mill (with feeds), a 1/8 in end mill (none), a 60° V-bit, and a 5 mm drill
const LIB = { machines: [{ id: 'm1', name: 'XXL' }], materials: [{ id: 'mat1', name: 'Plywood' }], tools: [
  { id: 'em14', name: '1/4 in end mill', diameter: 0.25, units: 'in', typeName: 'End Mill', angle: 0, flat: 0, type: 0, numbers: {}, fluteLength: 1,
    cuts: [{ machine: 'm1', material: 'mat1', feed: 60, plunge: 20, rpm: 18000, stepdown: 0.125, stepover: 0.1, rateUnits: 4, lengthUnits: 'in' }] },
  { id: 'em18', name: '1/8 in end mill', diameter: 3.175, units: 'mm', typeName: 'End Mill', angle: 0, flat: 0, type: 0, numbers: {}, fluteLength: 12, cuts: [] },
  { id: 'v60', name: '60° V-bit', diameter: 12.7, units: 'mm', typeName: 'V-Bit', angle: 60, flat: 0, type: 2, numbers: {}, fluteLength: 10, cuts: [] },
  { id: 'dr5', name: '5 mm drill', diameter: 5, units: 'mm', typeName: 'Drill', angle: 0, flat: 0, type: 3, numbers: {}, fluteLength: 40, cuts: [] },
] };
// a 200 x 120 plate (0) with: two 5 mm holes (1, 2), a 20 mm hole (3), a slot (4), a 4 mm hole (5, narrower than 1/4 in),
// a part inside the 20 mm hole... no: a small square island in a big cut-out (6 cut-out, 7 island); text (8), an open
// line (9), a construction line (10); and a second plate (11) already cut by a toolpath
function drawing({ thick = 12, lib = true, recent = ['em14'] } = {}) {
  toasts.length = 0;
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 500, h: 300, t: ${thick}, zero: 'top', origin: 'fl'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1'; delete DOC.sheets;
    DOC.ents = [
      {t:'rect', x:10, y:10, w:200, h:120},
      {t:'circle', cx:30, cy:30, r:2.5}, {t:'circle', cx:30, cy:110, r:2.5},
      {t:'circle', cx:70, cy:70, r:10},
      {t:'path', closed:true, pts:[[100,30,0],[140,30,1],[140,40,0],[100,40,1]]},
      {t:'circle', cx:190, cy:30, r:2},
      {t:'rect', x:120, y:60, w:70, h:55}, {t:'rect', x:140, y:75, w:20, h:20},
      {t:'text', str:'A', x:30, y:60, h:10, font:'roboto'},
      {t:'line', x1:20, y1:125, x2:60, y2:125},
      {t:'line', x1:0, y1:0, x2:10, y2:10, con:true},
      {t:'rect', x:260, y:10, w:100, h:60}
    ].map(function (e) { e.layer = 'L1'; return e; });
    DOC.dims = []; DOC.keeps = []; DOC.toolpaths = []; UNDO = []; REDO = []; SEL = [];
    TOOLLIB = ${lib ? JSON.stringify(LIB) : 'null'}; UICFG.recentTools = ${JSON.stringify(recent)}; UICFG.libMachine = 'm1'; UICFG.libMaterial = 'mat1';
    UICFG.tabs = {count: 3, len: 6, thk: 2, style: 'flat'};
    persist();
    DOC.toolpaths.push({id: 'old', name: 'Old cut', side: 'outside', type: 'profile', ents: [entId(DOC.ents[11])], dia: 6.35, through: true, over: 0.2, depth: 0,
      step: 3, feed: 800, plunge: 300, safeZ: 6, rpm: 18000, tabPts: {}, tabsOn: false, hidden: false, exclude: false, toolChosen: true});
    1`);
}
const plan = (bit) => plain(D.run(`(function () { var p = autoPlan(${JSON.stringify(bit)});
  return {stop: p.stop, left: p.left, tps: p.tps.map(function (it) { var t = it.tp; return {name: t.name, side: t.side, n: t.ents.length, ids: t.ents,
    toolId: t.toolId, dia: t.dia, feed: t.feed, plunge: t.plunge, step: t.step, through: t.through, depth: tpDepth(t), tabsOn: !!t.tabsOn,
    tabCount: t.tabCount, tabThk: t.tabThk, peck: t.peck, moves: (t.moves || []).length, warn: it.warn, what: it.what, time: it.time}; })}; })()`));
const idOf = (i) => D.run(`entId(DOC.ents[${i}])`);

test('the plate: its 5 mm holes drilled, the other holes and slots cut round inside, the parts cut out', () => {
  drawing();
  const p = plan('em14');
  assert.equal(p.stop, '');
  assert.deepEqual(p.tps.map((t) => t.side), ['drill', 'inside', 'outside']);
  const [dr, ins, out] = p.tps;
  assert.deepEqual(dr.ids.sort(), [idOf(1), idOf(2)].sort(), 'the two 5 mm holes, drilled');
  assert.equal(dr.toolId, 'dr5'); assert.equal(dr.dia, 5);
  assert.deepEqual(ins.ids.sort(), [idOf(3), idOf(4), idOf(6)].sort(), 'the 20 mm hole, the slot and the big cut-out');
  assert.deepEqual(out.ids.sort(), [idOf(0), idOf(7)].sort(), 'the plate, and the island in the cut-out: another part');
  [ins, out].forEach((t) => {
    assert.equal(t.toolId, 'em14'); assert.equal(t.dia, 6.35);
    assert.equal(t.feed, 1524, 'from the library: 60 in/min'); assert.equal(t.plunge, 508); assert.equal(t.step, 3.175, '1/8 in a pass');
    assert.equal(t.through, true); assert.ok(Math.abs(t.depth - 12.2) < 1e-9, 'through: 12 mm and the overcut');
    assert.ok(t.moves > 0, 'worked out');
  });
  assert.equal(out.tabsOn, true); assert.equal(out.tabCount, 3); assert.equal(out.tabThk, 2, 'the tabs used last');
  assert.equal(ins.tabsOn, false, 'no tabs in the holes');
  assert.ok(p.tps.every((t) => t.time > 0), 'each with a time');
});

test('left out, each said: the narrow hole, text, the open line, the shape already cut; construction lines unsaid', () => {
  drawing();
  const why = plan('em14').left.map((l) => l.n + ' ' + l.why).join(' / ');
  assert.match(why, /1 narrower than the 1\/4 in end mill/);
  assert.match(why, /1 text/);
  assert.match(why, /1 not closed/);
  assert.match(why, /1 already cut by a toolpath/);
  assert.doesNotMatch(why, /construction/);
  const all = plan('em14').tps.flatMap((t) => t.ids);
  [5, 8, 9, 10, 11].forEach((i) => assert.ok(!all.includes(idOf(i)), 'shape ' + i + ' not cut'));
});

test('the bit used last is the one offered; a smaller bit gets into the narrow hole', () => {
  drawing({ recent: ['em18', 'em14'] });
  assert.equal(D.run('autoCutters()[0].id'), 'em18', 'the 1/8 in, used last, first');
  assert.ok(!plain(D.run('autoCutters().map(function (t) { return t.id; })')).includes('v60'), 'no V-bits');
  const p = plan('em18');
  assert.ok(p.tps[1].ids.includes(idOf(5)), 'the 4 mm hole: cut with the 1/8 in');
  assert.ok(p.tps[1].warn.some((w) => /no feeds/.test(w)) && p.tps[1].warn.some((w) => /half the bit/.test(w)), 'its guessed feeds said: ' + p.tps[1].warn.join(' / '));
});

test('nothing made without the thickness, or a library; without a cutting bit, only the drilling', () => {
  drawing({ thick: 0 });
  assert.match(plan('em14').stop, /thickness/); assert.equal(plan('em14').tps.length, 0);
  drawing({ lib: false });
  assert.match(plan(null).stop, /no bits in the tool library/);
  drawing();
  const p = plan(null);
  assert.match(p.stop, /Choose the bit/);
  assert.deepEqual(p.tps.map((t) => t.side), ['drill']);
});

test('too deep for the bit: said', () => {
  drawing({ thick: 30 });                                         // the 1/4 in bit cuts 1 in (25.4 mm)
  const out = plan('em14').tps.find((t) => t.side === 'outside');
  assert.ok(out.warn.some((w) => /past its bit/.test(w)), out.warn.join(' / '));
});

test('nothing added until Add; then one step, in the cutting order, and said', () => {
  drawing();
  D.run('setTool("select"); autoOpen(); 1');
  assert.equal(D.run('DOC.toolpaths.length'), 1, 'only the old one, while the summary is open');
  assert.match(D.run('document.getElementById("autoAdd").textContent'), /Add 3 toolpaths/);
  D.run(`document.querySelectorAll('#autoList input')[1].click(); 1`);   // the inside cuts unticked
  assert.match(D.run('document.getElementById("autoAdd").textContent'), /Add 2 toolpaths/);
  const before = D.run('UNDO.length');
  D.run('autoApply(); 1');
  assert.deepEqual(plain(D.run('DOC.toolpaths.map(function (t) { return t.name; })')), ['Holes, 5.00 mm drilled', 'Old cut', 'Parts']);
  assert.equal(D.run('UNDO.length'), before + 1, 'one step');
  assert.equal(D.run('document.getElementById("autoModal").hidden'), true);
  assert.ok(toasts.some((t) => /2 toolpaths were made/.test(t)), toasts.join(' / '));
  D.run('doUndo(); 1');
  assert.equal(D.run('DOC.toolpaths.length'), 1, 'Undo takes them back');
});

// Make editable's leftovers, as on Clint's arm inserts: a second copy of a hole, a drill mark (a circle with a cross,
// doubling back on itself), and an outline 1 mm outside a part. Each set aside and said, and the part and its hole cut once.
test('copies, drill marks and outlines hugging a part: set aside, said; the part and its hole made once', () => {
  drawing();
  D.run(`DOC.ents = [
      {t:'rect', x:10, y:10, w:100, h:60, layer:'L1'},
      {t:'circle', cx:40, cy:40, r:10, layer:'L1'}, {t:'circle', cx:40, cy:40, r:10, layer:'L1'},
      {t:'path', closed:true, layer:'L1', pts:[[40,40,0],[40,50,-0.414],[50,40,-0.414],[40,30,-0.414],[30,40,-0.414],[40,50,0],[40,30,0],[40,40,0],[50,40,0]]},
      {t:'rect', x:9, y:9, w:102, h:62, layer:'L1'}];
    DOC.toolpaths = []; persist(); 1`);
  const p = plan('em14');
  assert.deepEqual(p.tps.map((t) => t.side + ' ' + t.n), ['inside 1', 'outside 1'], JSON.stringify(p.tps.map((t) => t.name)));
  assert.deepEqual(p.tps[1].ids, [idOf(0)], 'the part, not the outline round it');
  const why = p.left.map((l) => l.n + ' ' + l.why).join(' / ');
  assert.match(why, /1 stacked on another shape/);
  assert.match(why, /1 crosses itself/);
  assert.match(why, /1 drawn round another shape closer than/);
});
