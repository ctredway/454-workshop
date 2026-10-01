// Carbide Create's toolpaths as 454 toolpaths (c2d-toolpaths.js): each kind, its shapes found by Carbide Create's
// IDs or by layer, its depth, bit, feeds and tabs; what can't be converted for certain is left out and named.
// The projects are made here, in the older file's layout (one JSON text), which holds toolpaths the same way
// the database kind does. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, (msg || '') + `: ${a} against ${b}`);
const el = (id) => D.document.getElementById(id);
const deepest = (tp) => { let z = 0, d = 0; for (const m of tp.moves) { if (m.z !== undefined) z = m.z; if (m.g === 1) d = Math.min(d, z); } return -d; };

const box = (id, x, y, w, h, layer) => ({ id, position: [x + w / 2, y + h / 2], layer,
  points: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [0, 0]], point_type: [0, 1, 1, 1, 1, 4], cp1: [], cp2: [] });
const k = 0.5522847498 * 5;
const hole = { id: '{b}', position: [120, 40], points: [[-5, 0], [0, 5], [5, 0], [0, -5], [-5, 0], [0, 0]], point_type: [0, 3, 3, 3, 3, 4],
  cp1: [[0, 0], [-5, k], [k, 5], [5, -k], [-k, -5], [0, 0]], cp2: [[0, 0], [-k, 5], [5, k], [k, -5], [-5, -k], [0, 0]] };
const CARVE = { name: 'Carve', uuid: '{L2}', visible: true, locked: false };
const END_MILL = { diameter: 6.35, number: 201, type: 0, angle: 0 }, V60 = { diameter: 12.7, number: 302, type: 2, angle: 30 };
const SPEEDS = { feedrate: 1016, plungerate: 304.8, rpm: 16000 };
// a project: 200 by 120 by 12 mm, a part {a}, a round hole {b}, and two shapes to carve on their own layer
function project(toolpaths, more = {}) {
  const groups = {};
  toolpaths.forEach((t) => { const g = t.group || 'g1'; (groups[g] = groups[g] || []).push(Object.assign({ enabled: true, speeds: SPEEDS, tool: END_MILL, start_depth: 0 }, t, { group: undefined })); });
  const j = { CURVE_OBJECTS: [box('{a}', 20, 20, 60, 40), hole, box('{c}', 100, 70, 30, 20, CARVE), box('{d}', 140, 70, 30, 20, CARVE)],
    DOCUMENT_VALUES: Object.assign({ WIDTH: 200, HEIGHT: 120, THICKNESS: 12, DISPLAYMM: true, ZERO_X: 0, ZERO_Y: 0, ZERO_Z: 0, build_num: 648 }, more),
    layers: [{ name: 'DEFAULT', uuid: '', visible: true, locked: false }, CARVE], TEXT_OBJECTS: [],
    TOOLPATH_GROUP_OBJECTS: Object.keys(groups).map((g) => ({ name: g, uuid: '{' + g + '}', enabled: g !== 'off', TOOLPATH_OBJECTS: groups[g] })) };
  return new Uint8Array(Buffer.from(JSON.stringify(j)));
}
// the drawing and its converted toolpaths, without opening it as the drawing on screen
function convert(toolpaths, more) {
  const ex = D.c2dExtract(project(toolpaths, more));
  D.DOC = D.c2dToDoc(ex, 'Test.c2d').doc;
  D.UICFG.stockUnits = 'mm';
  const r = D.c2dToolpaths(ex);
  return { made: Array.from(r.made), left: plain(r.left), notes: plain(r.notes), id: (cc) => D.entId(Array.from(D.DOC.ents).find((e) => e.ccId === cc)) };
}
const A = [{ uuid: '{a}' }];

test('a contour: outside or inside, by the file’s own setting; its shapes by Carbide Create’s IDs', () => {
  const r = convert([{ name: 'Outside', type: 'contour', ofset_dir: 1, end_depth: 12.5, stepdown: 2, elements: A },
    { name: 'Hole', ofset_dir: -1, end_depth: '6.000', start_depth: '0.000', stepdown: 1.5, enable_ramping: true, elements: [{ uuid: '{b}' }] }]);
  assert.deepEqual(r.left, []); assert.equal(r.made.length, 2);
  const [out, inn] = r.made.map(plain);
  assert.equal(out.side, 'outside'); assert.equal(out.type, 'profile'); assert.deepEqual(out.ents, [r.id('{a}')]); assert.equal(out.name, 'Outside');
  assert.equal(out.through, true, '12.5 mm in 12 mm material: through, half a millimetre over'); near(out.over, 0.5); assert.equal(out.step, 2);
  assert.deepEqual([out.dia, out.feed, out.plunge, out.rpm], [6.35, 1016, 305, 16000]);
  assert.equal(out.toolChosen, true); assert.equal(out.toolId, null); assert.equal(out.ccTool, '#201');
  assert.equal(out.rampOff, true, 'Carbide Create plunges unless told to ramp'); assert.equal(out.exclude, false);
  assert.equal(inn.side, 'inside'); assert.deepEqual(inn.ents, [r.id('{b}')]);
  assert.equal(inn.through, false); assert.equal(inn.depth, 6, 'a depth written as text'); assert.equal(inn.rampOff, false);
});
test('built, a converted contour cuts where and as deep as it says', async () => {
  const bytes = project([{ name: 'Outside', type: 'contour', ofset_dir: 1, end_depth: 12.2, stepdown: 2, elements: A }]);
  const r = D.c2dOpen(bytes, 'Test.c2d');
  const tp = D.tpList()[0];
  assert.ok(!tp.moves || !tp.moves.length, 'the drawing is shown before the toolpaths are worked out');
  await r.built;
  assert.ok(tp.moves.length > 10); near(deepest(tp), 12.2, 'through, with the overcut');
  const xs = Array.from(tp.moves).filter((m) => m.g === 1 && m.x !== undefined).map((m) => m.x);
  near(Math.min(...xs), 20 - 3.175, 'the cutter’s centre runs its radius outside the part', 0.02); near(Math.max(...xs), 80 + 3.175, '', 0.02);
  assert.equal(D.tpStale(tp), false);
  if (!el('dlgModal').hidden) D.dlgEnd(true);
});
test('a pocket: its depth, passes and stepover', () => {
  const r = convert([{ name: 'Pocket', type: 'pocket_toolpath', end_depth: 4, stepdown: 1.5, stepover: 2.54, elements: A },
    { name: 'Old pocket', ofset_dir: 2, end_depth: -2.6, stepdown: 1.5, stepover: 1.55, elements: A, tool: { diameter: 3.1, number: 10 } },
    { name: 'Rest', type: 'pocket_toolpath', end_depth: 4, stepdown: 1, stepover: 1, enable_rest: true, rest_diameter: 6.35, elements: A, tool: { diameter: 3.175, number: 102 } }]);
  const [p, old, rest] = r.made.map(plain);
  assert.deepEqual([p.side, p.type, p.depth, p.step, p.stepoverPct, p.through], ['pocket', 'pocket', 4, 1.5, 40, false]);
  assert.deepEqual([old.side, old.depth, old.stepoverPct, old.dia], ['pocket', 2.6, 50, 3.1], 'the oldest files: no type, and depths written below zero');
  assert.equal(rest.side, 'pocket'); assert.equal(rest.restFrom, undefined);
  assert.match(r.notes.join(' | '), /Rest cleans up after a 6\.35 mm bit in Carbide Create; here it.s a whole pocket/);
});
test('a V-carve: the bit’s whole angle, its depth limit, and shapes picked by layer', () => {
  const r = convert([{ name: 'Carve', type: 'vcarve_toolpath', end_depth: 12, stepdown: 2, elements: [], toolpath_layers: ['{L2}'], tool: V60 },
    { name: 'Shallow', type: 'advanced_vcarve_toolpath', end_depth: '2.000', stepdown: 2, elements: [{ uuid: '{c}' }], tool: { diameter: 12.7, number: 301, type: 2, angle: 45 }, pocket_enabled: true, tool_pocket: { number: 102, diameter: 3.175 } },
    { name: 'Oldest', ofset_dir: 3, end_depth: 3, elements: [{ uuid: '{d}' }], tool: { diameter: 12.7, number: 301, type: 0, angle: 45 } },
    { name: 'Fine', type: 'advanced_vcarve_toolpath', end_depth: 12, elements: [{ uuid: '{c}' }], tool: { diameter: 0.127, number: 323, type: 3, angle: 15 } },
    { name: 'No angle', type: 'vcarve_toolpath', end_depth: 12, elements: [{ uuid: '{c}' }], tool: { diameter: 12.7, number: 9 } }]);
  const [c, s, o, f, n] = r.made.map(plain);
  assert.deepEqual([c.side, c.type, c.vAngle, c.vcMax, c.through], ['vcarve', 'vcarve', 60, 0, false], '#302 is a 60° bit, held as 30; a limit of the whole thickness is no limit');
  assert.deepEqual(c.ents.slice().sort(), [r.id('{c}'), r.id('{d}')].sort(), 'the shapes on its layer');
  assert.deepEqual([s.vAngle, s.vcMax], [90, 2]); assert.deepEqual([o.side, o.vAngle, o.vcMax], ['vcarve', 90, 3]);
  assert.deepEqual([f.vAngle, f.dia, f.vTip], [30, 6.35, 0.127]); assert.equal(n.vAngle, 90);
  const notes = r.notes.join(' | ');
  assert.match(notes, /Shallow clears its flat areas with a second bit in Carbide Create \(#102\); here the V bit does all of it/);
  assert.match(notes, /Fine: its bit is given as 0\.127 mm across, which looks like the tip/);
  assert.match(notes, /No angle: the bit.s angle isn.t in the project; it.s set to 90°/);
});
test('tabs: their size, and as many on each shape, spread evenly, and said', () => {
  const r = convert([{ name: 'Cut', type: 'contour', ofset_dir: 1, end_depth: 12.2, stepdown: 2, tab_height: 3, tab_width: 8, elements: [{ uuid: '{a}', tab_u: [0.1, 0.5, 0.9], tab_index: [0, 1, 2] }, { uuid: '{c}', tab_u: [0.5], tab_index: [0] }] },
    { name: 'None', type: 'contour', ofset_dir: 1, end_depth: 12.2, tab_height: 3, tab_width: 8, elements: [{ uuid: '{a}', tab_u: [], tab_index: [] }] },
    { name: 'Ignored', type: 'contour', ofset_dir: 1, end_depth: 12.2, ignore_tabs: true, tab_height: 3, tab_width: 8, elements: [{ uuid: '{a}', tab_u: [0.5], tab_index: [0] }] }]);
  const [cut, none, ign] = r.made;
  assert.equal(cut.tabsOn, true); assert.deepEqual([cut.tabThk, cut.tabLen, cut.tabCount], [3, 8, 3]);
  assert.equal(plain(cut.tabPts)[r.id('{a}')].length, 3); assert.equal(plain(cut.tabPts)[r.id('{c}')].length, 3);
  assert.equal(none.tabsOn, false); assert.equal(ign.tabsOn, false);
  assert.match(r.notes.join(' | '), /Cut: its tabs are spread evenly round each shape, 3 each, not where Carbide Create had them/);
  assert.equal(r.notes.length, 1);
});
test('switched off in Carbide Create, or in a group that is: brought in, and left out of the G-code', () => {
  const r = convert([{ name: 'On', type: 'contour', ofset_dir: 1, end_depth: 3, elements: A },
    { name: 'Off', type: 'contour', ofset_dir: 1, end_depth: 3, elements: A, enabled: false },
    { name: 'In a group that’s off', type: 'contour', ofset_dir: 1, end_depth: 3, elements: A, group: 'off' }]);
  assert.deepEqual(r.made.map((t) => t.exclude), [false, true, true]);
});
test('a start depth is said; the cut is as deep from the top', () => {
  const r = convert([{ name: 'Step', type: 'contour', ofset_dir: -1, start_depth: 2, end_depth: 6, elements: A }]);
  assert.equal(r.made[0].depth, 4);
  assert.match(r.notes[0], /Step starts 2\.00 mm below the top in Carbide Create; here it cuts 4\.00 mm from the top/);
});
test('what can’t be converted for certain is left out, with why', () => {
  const r = convert([{ name: 'New contour', type: 'cutout', path_type: 1, cut_depth: 12, elements: A },
    { name: 'Texture', type: 'texture_toolpath', end_depth: 1, elements: A },
    { name: 'On the line?', type: 'contour', ofset_dir: 0, end_depth: 3, elements: A },
    { name: 'Lost', type: 'contour', ofset_dir: 1, end_depth: 3, elements: [{ uuid: '{gone}' }] },
    { name: 'No bit', type: 'contour', ofset_dir: 1, end_depth: 3, elements: A, tool: { number: 5 } },
    { name: 'No depth', type: 'pocket_toolpath', end_depth: 0, elements: A },
    { type: 'contour', ofset_dir: 1, end_depth: 3, elements: A }]);
  assert.deepEqual(r.left.map((l) => l.name), ['New contour', 'Texture', 'On the line?', 'Lost', 'No bit', 'No depth']);
  const why = r.left.map((l) => l.why);
  assert.match(why[0], /can.t yet read which side of the line a contour cuts in this version of Carbide Create/);
  assert.match(why[1], /a kind of toolpath 454 doesn.t convert yet \(texture_toolpath\)/);
  assert.match(why[2], /can.t tell which side of the line it cuts/);
  assert.match(why[3], /the shapes it cuts weren.t found/); assert.match(why[4], /no bit size/); assert.match(why[5], /no depth/);
  assert.equal(r.made.length, 1); assert.equal(r.made[0].name, 'Toolpath 7', 'one with no name gets one');
});
test('opening: the toolpaths arrive, are built one at a time, and a window says what to check', async () => {
  const bytes = project([{ name: 'Pocket', type: 'pocket_toolpath', end_depth: 4, stepdown: 2, stepover: 2.54, elements: A },
    { name: 'New contour', type: 'cutout', path_type: 1, cut_depth: 12, elements: A },
    { name: 'Cut', type: 'contour', ofset_dir: 1, end_depth: 12.2, stepdown: 3, tab_height: 3, tab_width: 8, elements: [{ uuid: '{a}', tab_u: [0.2, 0.7], tab_index: [0, 2] }] }]);
  const toasts = []; const real = D.toast; D.toast = (kind, t) => toasts.push(t);
  try {
    const r = D.c2dOpen(bytes, 'Sign.c2d');
    assert.deepEqual(Array.from(D.tpList()).map((t) => t.name), ['Pocket', 'Cut']);
    assert.equal(r.made, 2); assert.equal(r.toolpaths, 3);
    assert.equal(el('dlgModal').hidden, false); assert.equal(el('dlgTitle').textContent, 'Opened Sign.c2d');
    const body = el('dlgBody').textContent;
    assert.match(body, /^4 shapes on 200\.00 × 120\.00 mm material, 12\.00 mm thick\. 2 toolpaths brought in, of 3\./);
    assert.match(body, /• Not brought in: New contour\. 454 can.t yet read which side.*Make it again in the Toolpaths panel\./);
    assert.match(body, /• Cut: its tabs are spread evenly/);
    assert.match(body, /bits come as sizes, not tools from your library\. Check each one, and air-cut/);
    assert.match(body, /being calculated now, one at a time/);
    assert.equal(el('dlgCancel').style.display, 'none', 'a window to read: OK only');
    await r.built;
    Array.from(D.tpList()).forEach((t) => assert.ok(t.moves.length > 10, t.name + ' is built'));
    assert.match(el('tpPanel').textContent, /Pocket/); assert.match(el('tpPanel').textContent, /Cut/);
    D.dlgEnd(true);
    assert.deepEqual(toasts, [], 'no notice as well as the window');
    // nothing to check: a notice, no window
    const quiet = D.c2dOpen(project([]), 'Plain.c2d'); await quiet.built;
    assert.equal(el('dlgModal').hidden, true); assert.deepEqual(toasts, ['Opened Plain.c2d']);
  } finally { D.toast = real; if (!el('dlgModal').hidden) D.dlgEnd(true); }
});
test('another drawing opened while the toolpaths are being built: the old ones are dropped, not built into it', async () => {
  const one = D.c2dOpen(project([{ name: 'First', type: 'pocket_toolpath', end_depth: 4, stepdown: 2, stepover: 2.54, elements: A }]), 'One.c2d');
  const firstTp = D.tpList()[0];
  const two = D.c2dOpen(project([{ name: 'Second', type: 'contour', ofset_dir: 1, end_depth: 3, elements: A }]), 'Two.c2d');
  await one.built; await two.built;
  assert.deepEqual(Array.from(D.tpList()).map((t) => t.name), ['Second']);
  assert.equal(firstTp.sig, undefined, 'the first drawing’s toolpath was never worked out');
  assert.ok(D.tpList()[0].moves.length > 10);
  if (!el('dlgModal').hidden) D.dlgEnd(true);
});
