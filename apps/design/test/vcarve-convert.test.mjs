// VCarve toolpaths made editable (src/js/vcarve-toolpaths.js, vcarve-read.js): what a project's toolpath becomes
// as a 454 toolpath. This moves a cutter, so each number here is one a real project gave:
// - a project in inches came across with its depths taken as millimetres (a 0.26 in cut: 0.26 mm deep);
// - newer VCarve keeps a pocket's settings under another name, so its depth wasn't found and 3 mm was used
//   without a word (pockets of 0.25 in and 0.125 in both; a 0.01 in skim would have been twelve times too deep);
// - the cutter's diameter was guessed from the tool's name, and 1/8 in used when the name didn't say.
// Found by Clint, checking a tutorial project. The tool and pocket numbers below are the ones in the G-code VCarve
// wrote for it: 0.254 mm deep, a 3/16 in cutter, 2032 and 1016 mm/min, passes 2.858 mm apart, a 12.7 mm ramp.
// On Design's real source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadDesign } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);

// ---- a tool, as the project records it ----
// units (one byte), diameter, pass depth, stepover, feed, plunge, the feeds' units; then speed, number and name
function toolRecord({ mm, dia, pass, over, feed, plunge, rate, rpm, num, name, kind = 1, cone = 0 }) {
  const b = new Uint8Array(70 + 12 + name.length + 1 + 8), dv = new DataView(b.buffer), at = 70;
  dv.setInt32(at - 61, kind, true); dv.setFloat32(at - 57, dia / 2, true); dv.setFloat32(at - 53, cone, true);
  b[at - 45] = mm ? 1 : 0;
  [dia, pass, over, feed, plunge].forEach((v, k) => dv.setFloat64(at - 44 + 8 * k, v, true));
  dv.setInt32(at - 4, rate, true); dv.setInt32(at, rpm, true); dv.setUint32(at + 4, num, true); dv.setUint32(at + 8, name.length + 1, true);
  for (let k = 0; k < name.length; k++) b[at + 12 + k] = name.charCodeAt(k);
  return b;
}
const D0 = loadDesign({ cam: true });
const readTool = (o) => plain(D0.vcDecode(toolRecord(o)).tools[0]);
test('a tool’s own numbers are read from the project: an inch tool, in mm', () => {
  // the tutorial project's end mill: 3/16 in, 80 and 40 in/min (2032 and 1016 mm/min in VCarve's G-code)
  const t = readTool({ mm: false, dia: 0.1875, pass: 0.25, over: 0.1125, feed: 80, plunge: 40, rate: 4, rpm: 18000, num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"' });
  assert.equal(t.name, 'UC2875 - Upcut - 3/16"x 3/4"'); assert.equal(t.rpm, 18000); assert.equal(t.num, 1);
  near(t.dia, 4.7625, 1e-9, 'diameter'); near(t.pass, 6.35, 1e-9, 'pass depth'); near(t.stepover, 2.8575, 1e-9, 'stepover');
  near(t.feed, 2032, 1e-9, 'feed'); near(t.plunge, 1016, 1e-9, 'plunge'); assert.equal(t.inches, true);
});
test('a mm tool: as it is; its feeds in inches a minute are still converted', () => {
  const a = readTool({ mm: true, dia: 3, pass: 0.6, over: 1.2, feed: 800, plunge: 240, rate: 1, rpm: 19000, num: 3, name: 'End Mill (3 mm)' });
  assert.deepEqual([a.dia, a.pass, a.stepover, a.feed, a.plunge, a.inches], [3, 0.6, 1.2, 800, 240, false]);
  const b = readTool({ mm: true, dia: 2, pass: 1, over: 0.8, feed: 20, plunge: 20, rate: 4, rpm: 22000, num: 2, name: 'End Mill (2 mm)' });
  assert.deepEqual([b.dia, b.feed, b.plunge], [2, 508, 508]);
});
test('feeds in units not seen yet aren’t read (the library’s or the default are used); numbers that aren’t a tool’s aren’t read at all', () => {
  const a = readTool({ mm: true, dia: 3, pass: 0.6, over: 1.2, feed: 13, plunge: 4, rate: 0, rpm: 19000, num: 3, name: 'End Mill (3 mm)' });
  assert.equal(a.dia, 3); assert.equal(a.feed, undefined); assert.equal(a.plunge, undefined);
  const b = readTool({ mm: true, dia: -3, pass: 0.6, over: 1.2, feed: 800, plunge: 240, rate: 1, rpm: 19000, num: 3, name: 'End Mill (3 mm)' });
  assert.equal(b.dia, undefined); assert.equal(b.feed, undefined); assert.equal(b.name, 'End Mill (3 mm)');
});

// ---- made editable ----
// a drawing with one square, known to VCarve as 'aa11', and the toolpaths given; returns the 454 toolpaths and what was said
function convert(toolpaths, { t = 12.7 } = {}) {
  const D = loadDesign({ cam: true });
  D.__tps = toolpaths;
  vm.runInContext(`DOC = {stock: {w: 300, h: 250, t: ${t}, zero: 'top', origin: 'corner'}, guides: [], dims: [], toolpaths: [],
    ents: [{t: 'rect', x: 50, y: 50, w: 100, h: 80, vcId: 'aa11'}], vcToolpaths: __tps, vcPreview: []}; vcMakeEditable(); 1`, D);
  return { tps: plain(D.DOC.toolpaths), said: [...D.document.querySelectorAll('.toast')].map((x) => x.textContent), D };
}
const INCH_MILL = { num: 3, name: 'End Mill (1/8")', rpm: 22000, dia: 3.175, pass: 0.762, stepover: 1.27, feed: 1016, plunge: 609.6, inches: true };
const tp = (name, set, tool = INCH_MILL) => ({ name, type: 'Toolpath', tool, set, vids: ['aa11'] });

test('a profile in a project in inches: its depth in mm (it was taken as mm: 0.26)', () => {
  // Kevan's pattern file: 0.26 in through 0.22 in material, in three passes
  const { tps } = convert([tp('Outside', { ToolpathType: 'Profile Outside', _ppdToolpathName: 'Outside', _ppdCutDepth: 0.26, _ppdProfileType: 0, _ppdInMM: false, _mctddNumPasses: 3, _mctddInMM: false })]);
  assert.equal(tps.length, 1);
  assert.equal(tps[0].side, 'outside');
  near(tps[0].depth, 6.604, 1e-9, 'depth'); near(tps[0].step, 2.2013, 1e-4, 'per pass');
  assert.equal(tps[0].dia, 3.175); assert.equal(tps[0].feed, 1016); assert.equal(tps[0].plunge, 610); assert.equal(tps[0].rpm, 22000);
  assert.equal(tps[0].ents.length, 1, 'its shape, by VCarve’s ID');
});
test('a project in mm is as it was', () => {
  const mill = { num: 2, name: 'End Mill (2 mm)', rpm: 22000, dia: 2, pass: 1, stepover: 0.8, feed: 508, plunge: 508, inches: false };
  const { tps } = convert([tp('Slot', { ToolpathType: 'Profile Inside', _ppdToolpathName: 'Slot', _ppdCutDepth: 3.1, _ppdProfileType: 1, _ppdInMM: true, _ppdAllowance: 0.2, _mctddNumPasses: 2, _mctddInMM: true }, mill)], { t: 3 });
  near(tps[0].depth, 3.1, 1e-9, 'depth'); near(tps[0].step, 1.55, 1e-9, 'per pass'); assert.equal(tps[0].allowance, 0.2);
  assert.equal(tps[0].side, 'inside'); assert.equal(tps[0].dia, 2); assert.equal(tps[0].through, true);
});
test('a pocket from newer VCarve: its depth is found (it wasn’t, and 3 mm was used)', () => {
  // Clint's squares: pockets of 0.25 in in three passes, and 0.125 in
  const set = (depth, n) => ({ ToolpathType: 'Pocket', mcBaseToolpathName: 'p', _mtpkpdBaseName: 'p', _mtpkpdCutDepth: depth, _mtpkpdStartDepth: 0, _mtpkpdAllowance: 0, _mtpkpdInMM: false,
    _mtpkptpdRampDistance: 0, _mtpkptpdDoRamping: false, _mtpkptpdCutDirection: 0, _mtpkptpdInMM: false, _mctddNumPasses: n, _mctddInMM: false });
  const { tps, said } = convert([Object.assign(tp('OneFourth', set(0.25, 3)), { type: 'Pocket' }), Object.assign(tp('OneEigth', set(0.125, 3)), { type: 'Pocket' })]);
  assert.deepEqual(tps.map((t) => t.side), ['pocket', 'pocket']);
  near(tps[0].depth, 6.35, 1e-9, 'a quarter inch'); near(tps[0].step, 2.1167, 1e-4, 'in three passes');
  near(tps[1].depth, 3.175, 1e-9, 'an eighth');
  assert.equal(tps[0].stepoverPct, 40, 'the tool’s own stepover: 0.05 in of 1/8 in');
  assert.equal(tps[0].rampLen, undefined, 'no ramp');
  assert.ok(!said.some((s) => /wasn’t converted|Check the cutter/.test(s)));
});
test('the tutorial’s skim pocket: as VCarve’s own G-code has it', () => {
  const mill = { num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"', rpm: 18000, dia: 4.7625, pass: 6.35, stepover: 2.8575, feed: 2032, plunge: 1016, inches: true };
  const { tps } = convert([Object.assign(tp('#5  Pocket .01" Deep 3/16" Bit', { ToolpathType: 'Pocket', _mtpkpdCutDepth: 0.01, _mtpkpdStartDepth: 0, _mtpkpdAllowance: 0, _mtpkpdRasterAngle: 90, _mtpkpdDoRaster: true, _mtpkpdInMM: false,
    _mtpkptpdRampDistance: 0.5, _mtpkptpdDoRamping: true, _mtpkptpdCutDirection: 0, _mtpkptpdInMM: false, _mctddNumPasses: 1, _mctddInMM: false }, mill), { type: 'Pocket' })]);
  const t = tps[0];
  near(t.depth, 0.254, 1e-9, 'a hundredth of an inch'); near(t.step, 0.254, 1e-9, 'in one pass');
  assert.equal(t.dia, 4.7625, 'three sixteenths'); assert.equal(t.feed, 2032); assert.equal(t.plunge, 1016); assert.equal(t.rpm, 18000);
  assert.equal(t.stepoverPct, 60, 'passes 2.8575 mm apart'); assert.equal(t.rampLen, 12.7, 'half an inch of ramp');
  assert.equal(t.pocketClear, 'raster'); assert.equal(t.rasterAngle, 90);
  // and its moves: no deeper than that
  const zs = t.moves.filter((m) => m.z !== undefined).map((m) => m.z);
  near(Math.min(...zs), -0.254, 1e-6, 'the deepest it goes');
});
test('a depth that can’t be read isn’t made up: the toolpath isn’t converted, and it says which', () => {
  const { tps, said } = convert([
    tp('Good', { ToolpathType: 'Profile Outside', _ppdCutDepth: 3, _ppdProfileType: 0, _ppdInMM: true }),
    Object.assign(tp('Mystery pocket', { ToolpathType: 'Pocket', _zzzCutDepth: 0.01, _zzzInMM: false }), { type: 'Pocket' }),
    tp('No depth', { ToolpathType: 'Profile Inside', _ppdCutDepth: 0, _ppdProfileType: 1, _ppdInMM: true })]);
  assert.deepEqual(tps.map((t) => t.name), ['Good']);
  const warn = said.find((s) => /2 toolpaths weren’t converted/.test(s));
  assert.ok(warn, said.join(' | '));
  assert.match(warn, /Mystery pocket, No depth: 454 couldn’t read their depths from the project, and won’t make one up/);
});
test('the cutter: the project’s own diameter first; from its name without; and if neither, 1/8 in and a warning', () => {
  const set = { ToolpathType: 'Profile Outside', _ppdCutDepth: 3, _ppdProfileType: 0, _ppdInMM: true };
  const own = convert([tp('A', set, { num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"', rpm: 18000, dia: 4.7625, pass: 6.35, stepover: 2.8575, inches: true })]);
  assert.equal(own.tps[0].dia, 4.7625);
  assert.equal(own.tps[0].feed, 800, 'no feed in the project, no library: the default');
  assert.ok(!own.said.some((s) => /Check the cutter/.test(s)));
  const named = convert([tp('B', set, { num: 1, name: 'End Mill (6 mm)', rpm: 18000 })]);
  assert.equal(named.tps[0].dia, 6);
  const none = convert([tp('C', set, { num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"', rpm: 18000 })]);
  assert.equal(none.tps[0].dia, 3.175);
  assert.match(none.said.find((s) => /Check the cutter/.test(s)) || '', /For C, 454 couldn’t tell the cutter’s diameter and has used 1\/8 in \(3\.175 mm\)/);
});
test('a V-carve’s flat depth, a ramp and tabs in a project in inches: in mm', () => {
  const vbit = { num: 5, name: 'V-Bit (60.0° - 1/4")', rpm: 16000, dia: 6.35, pass: 1.27, stepover: 0.127, feed: 1143, plunge: 381, inches: true };
  const v = convert([Object.assign(tp('Carve', { ToolpathType: 'VCarveToolpath', _vcpdToolpathName: 'Carve', _vcpdFlatDepth: 0.25, _vcpdDoFlatBottom: true, _vcpdInMM: false }, vbit), { type: 'V-Carve' })]).tps[0];
  assert.equal(v.side, 'vcarve'); assert.equal(v.vcMax, 6.35); assert.equal(v.vAngle, 60); assert.equal(v.dia, 6.35);
  const p = convert([tp('Cut', { ToolpathType: 'Profile Outside', _ppdCutDepth: 0.5, _ppdProfileType: 0, _ppdInMM: false, _ppdDoRamping: true, _ppdRampingDistance: 1, _ppdAllowance: 0.01,
    _ppdUseTabs: true, tabsInMM: false, _ppdTabLength: 0.25, _ppdTabThickness: 0.06, tabsNumTabs: 3 })]).tps[0];
  near(p.depth, 12.7, 1e-9, 'depth'); assert.equal(p.rampLen, 25.4); assert.equal(p.tabsOn, true);
  near(p.allowance, 0.254, 1e-9, 'the allowance left on the cut');
  near(p.tabLen, 6.35, 1e-9, 'tab length'); near(p.tabThk, 1.524, 1e-9, 'tab thickness');
});

// ---- a real project of Clint's: two pockets from newer VCarve, in inches ----
test('a real project (fixtures/vcarve-pockets.crv): its tools and its depths', () => {
  const D = loadDesign({ cam: true });
  const buf = fs.readFileSync(path.join(here, 'fixtures/vcarve-pockets.crv'));
  const ex = D.crvExtract(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const tps = plain(ex.toolpaths);
  assert.deepEqual(tps.map((t) => t.name), ['OneFourth', 'OneEigth']);
  assert.equal(tps[0].tool.name, 'End Mill (1/8")');
  near(tps[0].tool.dia, 3.175, 1e-9, 'its cutter'); near(tps[0].tool.feed, 1016, 1e-9, '40 in/min'); near(tps[0].tool.plunge, 609.6, 1e-9, '24 in/min');
  D.__ex = ex;
  vm.runInContext(`(function(){ var ex = __ex, d = crvToDoc({stockW: ex.stockW, stockH: ex.stockH, stockT: ex.stockT, stockZero: ex.stockZero, stockAt: ex.stockAt, contours: ex.contours, contourIds: ex.contourIds, contourSheets: ex.contourSheets, contourOpen: ex.contourOpen}, 25.4);
    DOC = {stock: d.stock, ents: d.ents, guides: [], dims: [], toolpaths: [], vcToolpaths: ex.toolpaths, vcPreview: []}; vcMakeEditable(); })()`, D);
  const made = plain(D.DOC.toolpaths);
  assert.deepEqual(made.map((t) => [t.name, t.side, t.dia, +t.depth.toFixed(4), t.feed, t.plunge, t.rpm, t.ents.length]),
    [['OneFourth', 'pocket', 3.175, 6.35, 1016, 610, 22000, 1], ['OneEigth', 'pocket', 3.175, 3.175, 1016, 610, 22000, 1]]);
  for (const t of made) near(Math.min(...t.moves.filter((m) => m.z !== undefined).map((m) => m.z)), -t.depth, 1e-6, t.name + ' goes as deep as it says');
});

// ---- the tutorial project's inlay: a V-carve with a start depth and a flat depth, and a second tool clearing its floor ----
test('a V-bit’s angle is read from the project: its radius and how tall its cone is', () => {
  // "30 Deg V-Groove - 3-Flute": the name has no degree sign, so its angle used to come out as 60
  const v = readTool({ mm: false, dia: 0.25, pass: 0.25, over: 0.005, feed: 60, plunge: 30, rate: 4, rpm: 18000, num: 1, name: '30 Deg V-Groove - 3-Flute', kind: 3, cone: 0.125 / Math.tan(15 * Math.PI / 180) });
  near(v.angle, 30, 1e-3, 'thirty degrees'); near(v.dia, 6.35, 1e-9, 'a quarter inch across');
  const v60 = readTool({ mm: false, dia: 0.25, pass: 0.05, over: 0.005, feed: 45, plunge: 15, rate: 4, rpm: 16000, num: 5, name: 'V-Bit (60.0\u00b0 - 1/4")', kind: 3, cone: 0.125 / Math.tan(30 * Math.PI / 180) });
  near(v60.angle, 60, 1e-3, 'sixty');
  assert.equal(readTool({ mm: false, dia: 0.1875, pass: 0.25, over: 0.1125, feed: 80, plunge: 40, rate: 4, rpm: 18000, num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"' }).angle, undefined, 'an end mill has none');
  assert.equal(readTool({ mm: false, dia: 0.1875, pass: 0.25, over: 0.1125, feed: 80, plunge: 40, rate: 4, rpm: 18000, num: 1, name: 'An end mill', kind: 1, cone: 0.3 }).angle, undefined,
    'nor one that isn’t a V-bit, whatever number sits where a cone’s height would');
});
// a ToolpathData stream: tool records and named settings, in order
function stream(items) {
  const bytes = [];
  const i32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); bytes.push(...b); };
  const f64 = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); bytes.push(...b); };
  const str = (t) => { bytes.push(0xFF, 0xFE, 0xFF, t.length); for (const c of t) bytes.push(c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8); };
  for (const it of items) {
    if (it.tool) bytes.push(...toolRecord(it.tool));
    else { const [k, v] = it; str(k); if (typeof v === 'string') { i32(3); str(v); } else if (typeof v === 'boolean') { i32(2); bytes.push(v ? 1 : 0); } else if (Number.isInteger(v) && /Index|Num|Type$/.test(k)) { i32(1); i32(v); } else { i32(0); f64(v); } }
    for (let k = 0; k < 6; k++) bytes.push(0);
  }
  return new Uint8Array(bytes);
}
const MILL = { mm: false, dia: 0.1875, pass: 0.25, over: 0.1125, feed: 80, plunge: 40, rate: 4, rpm: 18000, num: 1, name: 'UC2875 - Upcut - 3/16"x 3/4"' };
const VBIT = { mm: false, dia: 0.25, pass: 0.25, over: 0.005, feed: 60, plunge: 30, rate: 4, rpm: 18000, num: 1, name: '30 Deg V-Groove - 3-Flute', kind: 3, cone: 0.125 / Math.tan(15 * Math.PI / 180) };
test('a toolpath is read once, under its own name: the name in its settings is the one it had when calculated', () => {
  // as the tutorial project has them: the detail toolpath was renamed after it was calculated
  const td = stream([
    { tool: MILL }, ['ToolpathIndex', 0], ['EditingDialog', 'uiVCarvingForm'], ['mcBaseToolpathName', '#1 Female Clearout'], ['ToolpathType', 'AreaClearToolpath'],
    ['_vcpdToolpathName', '#1 Female Clearout [Clear 1]'], ['_vcpdFlatDepth', 0.25], ['_vcpdDoFlatBottom', true], ['_vcpdInMM', false], ['_pkpdToolpathName', '#1 Female Clearout [Clear 1]'], ['_pkpdCutDepth', 0.25],
    { tool: MILL }, { tool: MILL },
    { tool: VBIT }, ['ToolpathIndex', 1], ['EditingDialog', 'uiVCarvingForm'], ['mcBaseToolpathName', '#2 Female Detail'], ['ToolpathType', 'VCarveToolpath'],
    ['_vcpdToolpathName', '#1 Female Clearout'], ['_vcpdFlatDepth', 0.25], ['_vcpdDoFlatBottom', true], ['_vcpdInMM', false], ['_pkpdToolpathName', '#1 Female Clearout'],
    { tool: VBIT },
    // an older project's chamfer: no name of its own, only the one in its settings, after its tool
    { tool: VBIT }, ['_chpdToolpathName', 'Chamfers'], ['_chpdChamferDepth', 2], ['_chpdInMM', true],
  ]);
  const tps = plain(D0.vcToolpathsFrom(td));
  assert.deepEqual(tps.map((t) => [t.name, t.type, t.tool.name]), [
    ['#1 Female Clearout', 'AreaClear', MILL.name], ['#2 Female Detail', 'V-Carve', VBIT.name], ['Chamfers', 'Chamfer', VBIT.name]]);
  assert.equal(tps[1].set._vcpdToolpathName, '#1 Female Clearout', 'its old name is one of its settings, not a toolpath');
  near(tps[1].tool.angle, 30, 1e-3, 'the V-bit’s angle');
});
// a drawing whose shapes are in a group 'g1', with one block of text 'txt' (two letters) outside it
function convertIn(toolpaths, ents) {
  const D = loadDesign({ cam: true });
  D.__tps = toolpaths; D.__ents = ents || [
    { t: 'rect', x: 40, y: 40, w: 120, h: 90, vcId: 'a1', vcGroups: ['g1'] }, { t: 'rect', x: 70, y: 60, w: 30, h: 30, vcId: 'a2', vcGroups: ['g1'] },
    { t: 'rect', x: 200, y: 40, w: 10, h: 20, vcId: 'txt' }, { t: 'rect', x: 215, y: 40, w: 10, h: 20, vcId: 'txt' }];
  vm.runInContext(`DOC = {stock: {w: 300, h: 250, t: 31.75, zero: 'top', origin: 'corner'}, guides: [], dims: [], toolpaths: [], ents: __ents, vcToolpaths: __tps, vcPreview: []}; vcMakeEditable(); 1`, D);
  return { tps: plain(D.DOC.toolpaths), said: [...D.document.querySelectorAll('.toast')].map((x) => x.textContent), D };
}
const millT = { num: 1, name: MILL.name, rpm: 18000, dia: 4.7625, pass: 6.35, stepover: 2.8575, feed: 2032, plunge: 1016, inches: true };
const vbitT = { num: 1, name: VBIT.name, rpm: 18000, dia: 6.35, pass: 6.35, stepover: 0.127, feed: 1524, plunge: 762, inches: true, angle: 30 };
const vset = (name, start, flat, type) => ({ mcBaseToolpathName: name, ToolpathType: type, _vcpdToolpathName: 'old', _vcpdStartDepth: start, _vcpdFlatDepth: flat, _vcpdDoFlatBottom: true, _vcpdInMM: false,
  _pkpdToolpathName: 'old', _pkpdStartDepth: start, _pkpdCutDepth: flat, _pkpdInMM: false });
const pair = (n, start, flat, vids) => [
  { name: '#' + n + ' Clearout', type: 'AreaClear', tool: millT, set: vset('#' + n + ' Clearout', start, flat, 'AreaClearToolpath'), vids: [] },
  { name: '#' + (n + 1) + ' Detail', type: 'V-Carve', tool: vbitT, set: vset('#' + (n + 1) + ' Detail', start, flat, 'VCarveToolpath'), vids }];
test('the inlay’s base: a V-carve to its flat depth, and its clearing, as VCarve’s G-code has them', () => {
  // a 0.25 in flat depth from the surface: VCarve's G-code for both goes to 6.35 mm
  const { tps, said } = convertIn(pair(1, 0, 0.25, ['g1']));
  assert.deepEqual(tps.map((t) => [t.name, t.side]), [['#1 Clearout', 'pocket'], ['#2 Detail', 'vcarve']]);
  const [c, v] = tps;
  assert.equal(v.vAngle, 30); assert.equal(v.vcMax, 6.35); assert.equal(v.vcStart, undefined); assert.equal(v.dia, 6.35);
  assert.deepEqual([v.feed, v.plunge], [1524, 762]);
  assert.equal(v.ents.length, 2, 'everything in the group the toolpath names');
  near(c.depth, 6.35, 1e-9, 'the clearing: to the floor'); near(c.allowance, 6.35 * Math.tan(15 * Math.PI / 180), 1e-4, 'standing off as far as the cone reaches at the floor');
  near(c.step, 6.35, 1e-9, 'in passes no deeper than its tool’s'); assert.equal(c.dia, 4.7625); assert.deepEqual([c.feed, c.plunge], [2032, 1016]);
  assert.equal(c.clearFor, v.id, 'paired with its V-carve'); assert.deepEqual(c.ents, v.ents, 'on the same shapes');
  assert.equal(c.finishPass, false);
  assert.ok(!said.some((x) => /wasn’t converted|Check the/.test(x)), said.join(' | '));
  // knowing its V-carve, the clearing says what its 3/16 in cutter leaves in the floor's square corners: up to
  // 0.293 x its radius (1 - 1 / root 2) in from the floor's edge, which a 30 degree bit leaves 0.70 / tan 15 = 2.61 mm high
  assert.ok(c.floorLeft && c.floorLeft.high > 2.3 && c.floorLeft.high < 2.62, JSON.stringify(c.floorLeft));
  assert.match(c.warning, /the floor there is left up to 2\.\d\d mm high/);
  for (const t of tps) near(Math.min(...t.moves.filter((m) => m.z !== undefined).map((m) => m.z)), -6.35, 1e-6, t.name + ' goes no deeper than the floor');
});
test('the inlay’s plug: it starts below the surface, and its floor is the start depth and the flat depth together', () => {
  // 0.23 in down, 0.1 in flat depth: VCarve's G-code for both goes to 0.33 in, 8.382 mm
  const [c, v] = convertIn(pair(3, 0.23, 0.1, ['g1'])).tps;
  near(v.vcStart, 5.842, 1e-9, 'where it starts'); near(v.vcMax, 8.382, 1e-9, 'its floor');
  near(c.depth, 8.382, 1e-9, 'the clearing: to that floor, from the surface'); near(c.allowance, 2.54 * Math.tan(15 * Math.PI / 180), 1e-4, 'standing off by the flat depth’s reach');
  near(c.step, 6.35, 1e-9, 'in two passes, not one cut 8.4 mm deep');
  near(Math.min(...v.moves.filter((m) => m.z !== undefined).map((m) => m.z)), -8.382, 1e-6, 'the carve’s deepest');
});
test('a toolpath that names a block of text gets all its letters', () => {
  const tps = convertIn([{ name: 'Letters', type: 'V-Carve', tool: vbitT, set: vset('Letters', 0, 0.1, 'VCarveToolpath'), vids: ['txt'] }]).tps;
  assert.equal(tps[0].ents.length, 2);
});
test('a clearing toolpath with no V-carve after it isn’t converted (its stand-off needs the bit’s angle); a V-bit of unknown angle is said', () => {
  const alone = convertIn([pair(1, 0, 0.25, ['g1'])[0]]);
  assert.deepEqual(alone.tps, []);
  assert.match(alone.said.join(' | '), /One toolpath wasn’t converted#1 Clearout/);
  const blunt = convertIn([{ name: 'Carve', type: 'V-Carve', tool: Object.assign({}, vbitT, { angle: undefined, name: 'Engraving bit' }), set: vset('Carve', 0, 0.1, 'VCarveToolpath'), vids: ['g1'] }]);
  assert.equal(blunt.tps[0].vAngle, 60);
  assert.match(blunt.said.join(' | '), /Check the V-bitFor Carve, 454 couldn’t tell the bit’s angle and has used 60/);
});
test('shapes that aren’t in the drawing any more: the toolpath comes across without them, and says so', () => {
  const { tps, said } = convertIn(pair(3, 0.23, 0.1, ['gone']));
  assert.deepEqual(tps.map((t) => t.ents.length), [0, 0]);
  assert.match(said.join(' | '), /#3 Clearout \(shapes not found\), #4 Detail \(shapes not found\)/);
});
test('on a big project the slow search for shapes isn’t tried', () => {
  const D = loadDesign({ cam: true });
  const ents = []; for (let i = 0; i < 300; i++) ents.push({ t: 'rect', x: i, y: 0, w: 0.5, h: 0.5, vcId: 'x' + i });
  D.__ents = ents; D.__tps = [tp('Lost', { ToolpathType: 'Profile Outside', _ppdCutDepth: 3, _ppdProfileType: 0, _ppdInMM: true })].map((t) => Object.assign(t, { vids: ['nowhere'] }));
  D.__prev = []; for (let i = 0; i < 250; i++) D.__prev.push([[i, 0, 0], [i + 1, 0, 0], [i + 1, 1, 0]]);
  vm.runInContext(`vcPreviewMatches = function (){ throw new Error('the slow search was tried'); };
    DOC = {stock: {w: 300, h: 250, t: 12, zero: 'top', origin: 'corner'}, guides: [], dims: [], toolpaths: [], ents: __ents, vcToolpaths: __tps, vcPreview: __prev}; vcMakeEditable(); 1`, D);
  assert.equal(D.DOC.toolpaths.length, 1); assert.equal(D.DOC.toolpaths[0].ents.length, 0);
});

// ---- the drawing's objects: shapes, blocks of text and groups, by their headers ----
function objects(list) {
  const bytes = [];
  const i32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); bytes.push(...b); };
  const tag = () => { i32(16); for (const c of 'Vectric__Version') bytes.push(c.charCodeAt(0)); i32(1); i32(36); for (let k = 0; k < 36; k++) bytes.push(97); };
  const ats = [];
  for (const o of list) {
    ats.push(bytes.length);
    bytes.push(0x17, 0x87); i32(10); for (let k = 0; k < 16; k++) bytes.push(o.id); for (let k = 0; k < 16; k++) bytes.push(1); i32(0); i32(0); i32(130); i32(42); i32(o.third || 49); i32(-1);
    for (let k = 0; k < 22; k++) bytes.push(0);                      // six bytes and its centre
    tag(); i32(1); for (let k = 0; k < 32 + 72; k++) bytes.push(0); tag();
    if (o.kids) { i32(1); i32(o.kids); } else for (let k = 0; k < 40; k++) bytes.push(7);     // a group goes straight on to its first child
  }
  const vd = new Uint8Array(bytes);
  return { heads: plain(D0.crvObjects(vd, new DataView(vd.buffer), 0)), ats };
}
const id16 = (n) => (n < 16 ? '0' : '') + n.toString(16);
test('objects are found by their headers; a group’s children are the ones after it, a group inside it taking its own first', () => {
  // a shape; a group of three: a shape, a group of two shapes, a shape; then a shape outside
  const { heads, ats } = objects([{ id: 1 }, { id: 2, kids: 3 }, { id: 3 }, { id: 4, kids: 2 }, { id: 5 }, { id: 6, third: 470 }, { id: 7 }, { id: 8 }]);
  assert.deepEqual(heads.map((h) => h.at), ats);
  assert.deepEqual(heads.map((h) => h.id), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => id16(n).repeat(16)));
  assert.deepEqual(heads.map((h) => h.kids), [0, 3, 0, 2, 0, 0, 0, 0]);
  const g = (n) => id16(n).repeat(16);
  assert.deepEqual(heads.map((h) => h.groups), [[], [], [g(2)], [g(2)], [g(2), g(4)], [g(2), g(4)], [g(2)], []]);
});
test('a group that says it has more children than there are takes what there is', () => {
  const { heads } = objects([{ id: 2, kids: 5 }, { id: 3 }, { id: 4 }]);
  assert.deepEqual(heads.map((h) => h.groups.length), [0, 1, 1]);
});
test('each outline takes its object’s ID if it has none, and the IDs of the groups its object is in', () => {
  // objects at 100 (a shape), 200 (a group), 300 (a shape in it), 400 (a block of text in it), 900 (a shape after)
  const heads = [{ at: 100, id: 'A', kids: 0, groups: [] }, { at: 200, id: 'G', kids: 2, groups: [] }, { at: 300, id: 'B', kids: 0, groups: ['G'] },
    { at: 400, id: 'T', kids: 0, groups: ['G'] }, { at: 900, id: 'C', kids: 0, groups: [] }];
  // outlines: before any object; the first shape; the grouped shape; three letters of the text, one of them to be left alone; the last shape
  const ats = [50, 150, 350, 450, 500, 550, 950], ids = [null, 'A', 'B', null, null, null, 'C'];
  const groups = plain(D0.crvOwners(heads, ats, ids, { 5: true }));
  assert.deepEqual(groups, [null, null, ['G'], ['G'], ['G'], null, null]);
  assert.deepEqual(ids, [null, 'A', 'B', 'T', 'T', null, 'C'], 'the letters take their block’s ID; a shape keeps its own; the one left alone is left');
  // an outline straight after a group's header, before any child: it isn't given the group's ID as its own
  const ids2 = [null];
  D0.crvOwners([{ at: 10, id: 'G', kids: 1, groups: [] }], [20], ids2, null);
  assert.deepEqual(ids2, [null]);
});
test('a real project’s text: its letters carry their block’s ID, so a toolpath can name the block', () => {
  const buf = fs.readFileSync(path.join(here, 'fixtures/vcarve-text.crv'));
  const ex = D0.crvExtract(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), ids = plain(ex.contourIds);
  assert.equal(ids.length, 75); assert.ok(ids.every(Boolean), 'every shape has one');
  const counts = Object.values(ids.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {})).sort((a, b) => a - b);
  assert.deepEqual(counts, [1, 1, 1, 1, 11, 21, 39], 'four shapes of their own, and three blocks of text');
  assert.deepEqual(plain(ex.contourGroups).filter(Boolean), [], 'nothing in it is grouped');
});
