// 454 Design's toolpaths: made through its own toolpath editor, as you'd make them, with the CAM engine
// loaded, and checked against the geometry, worked out independently: where the cutter's centre must be,
// how deep, and that a pocket is cleared without touching its walls or islands. The G-code is read back by
// 454 Control's own parser.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDesign } from './harness.mjs';
const require = createRequire(import.meta.url);
const { parseGcode } = require('../../../packages/gcode/src/parser.cjs');

const D = loadDesign({ cam: true });
const R = 6.35 / 2;                                            // the cutter's radius in most tests

// A material, some shapes, and a toolpath made in the editor: select, open, type, Create.
function make(shapes, type, o = {}) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: o.t || 12, zero: o.zero || 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = shapes.map((e) => Object.assign({ layer: 'L1' }, e)); D.DOC.toolpaths = [];
  const set = (id, v, ev) => { const el = D.document.getElementById(id); if (!el) throw new Error('no field ' + id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  const tick = (id, on) => { const el = D.document.getElementById(id); if (el.checked !== on) el.click(); };
  D.SEL = o.sel || shapes.map((_, i) => i); D.cutOpen(null);
  set('cutType', type, 'change');
  D.CUT.toolChosen = true; set('cutDia', o.dia || 6.35);
  if (o.through) tick('cutThrough', true); else if (o.depth) set('cutDepth', o.depth);
  if (o.step) set('cutStep', o.step);
  if (o.vAngle) { set('cutVAngle', o.vAngle); set('cutVcAngle', o.vAngle); }
  if (o.chamW) set('cutChamW', o.chamW);
  if (o.tabs) { tick('cutTabsOn', true); set('cutTabs', o.tabs); set('cutTabThk', 0.5); D.document.getElementById('cutTabSpread').click(); }
  D.CUT.toolChosen = true;
  D.cutApply();
  const tp = D.tpList().at(-1);
  if (!tp) throw new Error('the editor made no toolpath: ' + (D.document.getElementById('cutHint') || {}).textContent);
  return tp;
}
// the moves, as cutting segments with their Z: {x0,y0,z0,x1,y1,z1}
function cuts(tp) {
  let x = 0, y = 0, z = 0; const out = [];
  for (const m of tp.moves) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1) out.push({ x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz });
    x = nx; y = ny; z = nz;
  }
  return out;
}
const deepest = (tp) => Math.min(...cuts(tp).map((c) => c.z1));
const levels = (tp) => [...new Set(cuts(tp).filter((c) => Math.abs(c.z1 - c.z0) < 1e-9 && Math.hypot(c.x1 - c.x0, c.y1 - c.y0) > 0.5).map((c) => +c.z1.toFixed(4)))].sort((a, b) => b - a);
// signed distance from a point to an axis-aligned rectangle's outline: + outside, - inside
function rectDist(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return -Math.min(px - r.x, r.x + r.w - px, py - r.y, r.y + r.h - py);
}
const RECT = { t: 'rect', x: 20, y: 20, w: 100, h: 50 };
const onFinal = (tp) => { const z = deepest(tp); return cuts(tp).filter((c) => Math.abs(c.z1 - z) < 1e-6 && Math.abs(c.z0 - z) < 1e-6); };

// ---- profiles ----
// The CAM engine pads a profile's offset by its simplifying tolerance (0.01 mm), so straightening the path
// can never bring the cutter closer than its radius: never closer, and at most 0.011 mm farther.
const PAD = 0.011;
test('outside profile: the cutter\u2019s centre never comes closer than its radius, in 2 mm passes', () => {
  const tp = make([RECT], 'outside', { depth: 6, step: 2 });
  assert.deepEqual(levels(tp), [-2, -4, -6]);
  for (const c of onFinal(tp)) for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y1]]) { const d = rectDist(x, y, RECT);
    assert.ok(d >= R - 1e-6 && d <= R + PAD, `(${x.toFixed(3)}, ${y.toFixed(3)}) is ${d.toFixed(4)} outside the outline`); }
});
test('inside profile: never closer than its radius, inside; on the line: on it', () => {
  const tp = make([RECT], 'inside', { depth: 3, step: 3 });
  for (const c of onFinal(tp)) { const d = -rectDist(c.x1, c.y1, RECT); assert.ok(d >= R - 1e-6 && d <= R + PAD, `inside: ${d.toFixed(4)}`); }
  const on = make([RECT], 'on', { depth: 3, step: 3 });
  for (const c of onFinal(on)) assert.ok(Math.abs(rectDist(c.x1, c.y1, RECT)) < 0.01, `on: ${rectDist(c.x1, c.y1, RECT).toFixed(4)}`);
});
test('cutting through: the material\u2019s thickness plus the overcut, whether Z zero is on top or on the spoilboard', () => {
  assert.ok(Math.abs(deepest(make([RECT], 'outside', { through: true, step: 4 })) - -12.2) < 1e-6, 'Z zero on top: -12.2');
  assert.ok(Math.abs(deepest(make([RECT], 'outside', { through: true, step: 4, zero: 'bottom' })) - -0.2) < 1e-6, 'Z zero on the spoilboard: -0.2');
});
test('tabs: the last passes rise over each tab, leaving the tab\u2019s thickness of material', () => {
  // 12 mm material, cut through with the 0.2 mm overcut: the material's bottom is Z -12, so a 0.5 mm tab's
  // top is Z -11.5, whatever the overcut
  for (const zero of ['top', 'bottom']) {
    const tp = make([RECT], 'outside', { through: true, step: 4, tabs: 4, zero });
    const bottom = deepest(tp), matBottom = zero === 'top' ? -12 : 0;
    const segs = cuts(tp).filter((c) => Math.hypot(c.x1 - c.x0, c.y1 - c.y0) > 1e-9);
    const lap = segs.slice(segs.findIndex((c) => Math.abs(c.z0 - bottom) < 1e-9 && Math.abs(c.z1 - bottom) < 1e-9));   // the last lap: from reaching the bottom
    let tabs = 0, up = false; const tops = new Set();
    for (const c of lap) { const raised = c.z1 > bottom + 0.05; if (raised){ tops.add(+c.z1.toFixed(4)); if (!up) tabs++; } up = raised; }
    assert.equal(tabs, 4, zero + ': four raised runs on the last lap');
    assert.deepEqual([...tops], [+(matBottom + 0.5).toFixed(4)], zero + ': each tab\u2019s top 0.5 mm above the material\u2019s bottom');
  }
});

// Tabs on the bottom edge of RECT (y = 20): the cutter's centre runs along y = 20 - R there. A tab of length L at
// x = c leaves L of wood along the middle of the cut, so the cutter stays up over c - L/2 - R .. c + L/2 + R.
// Its height there: for a flat tab, TOP all the way; for a 3D tab, TOP for R either side of the middle, then
// down a straight slope to the cut's floor at the ends. (The wood this leaves is checked in tab-length.test.mjs.)
function tabCheck(tp, centres, len, top, floor, shape) {
  const y = 20 - R, half = len / 2, surf = (x) => { let best = -Infinity;
    for (const c of centres) { const d = Math.abs(x - c); if (d < half + R) best = Math.max(best, shape === '3d' ? (d <= R ? top : floor + (top - floor) * (1 - (d - R) / half)) : top); } return best; };
  const onEdge = cuts(tp).filter((c) => Math.abs(c.y0 - y) < 0.02 && Math.abs(c.y1 - y) < 0.02);
  // along every move, not just its ends: a straight move between two points on a tab's slopes passes under
  // its peak (the tab comes to a point), so the ends alone can look fine while the middle cuts into it
  let lowest = Infinity;
  for (const c of onEdge) for (let i = 0; i <= 40; i++) {
    const t = i / 40, x = c.x0 + (c.x1 - c.x0) * t, z = c.z0 + (c.z1 - c.z0) * t, sf = surf(x);
    if (sf > -Infinity) lowest = Math.min(lowest, z - sf);
  }
  return { onEdge, surf, lowest };
}
test('3D tabs: a triangle, up to the tab\u2019s thickness at its middle, never cut into, without steps', () => {
  const tp = make([RECT], 'outside', { through: true, step: 4, tabs: 1 });
  tp.tabLen = 10; tp.tabStyle = '3d'; tp.tabPts = { [tp.ents[0]]: [[70, 20]] };            // one 10 mm tab, mid bottom edge
  D.tpGenerate(tp);
  const floor = deepest(tp), top = -11.5, { onEdge, lowest } = tabCheck(tp, [70], 10, top, floor, '3d');
  // within a micron: the engine places tabs by distance along its (simplified) path, so where exactly the
  // middle falls can differ by a fraction of a micron; the failure this guards against is 0.14 mm
  assert.ok(lowest >= -0.001, 'never below the tab: ' + lowest.toFixed(4));
  const lastLap = onEdge.filter((c) => c.z0 <= top + 0.001 && c.z1 <= top + 0.001);   // the passes that meet the tab: at or below its top
  for (const px of [70 - R, 70, 70 + R]) {
    const peak = lastLap.flatMap((c) => [[c.x0, c.z0], [c.x1, c.z1]]).filter(([x]) => Math.abs(x - px) < 0.001);
    assert.ok(peak.some(([, z]) => Math.abs(z - top) < 0.001), 'at its top, Z -11.5, from R before its middle to R after (within a micron): ' + px);
  }
  const lo = 70 - 5 - R, hi = 70 + 5 + R;
  const ends = onEdge.filter((c) => Math.abs(c.z1 - floor) < 1e-6 && (Math.abs(c.x1 - lo) < 1e-6 || Math.abs(c.x1 - hi) < 1e-6));
  assert.ok(ends.length >= 2, 'at the floor at both ends, the tab’s half-length and the cutter’s radius from its middle');
  const slope = (top - floor) / 5;
  for (const c of onEdge) {
    const run = Math.hypot(c.x1 - c.x0, c.y1 - c.y0), rise = Math.abs(c.z1 - c.z0);
    if (c.x1 > lo - 1e-6 && c.x1 < hi + 1e-6 && c.x0 > lo - 1e-6 && c.x0 < hi + 1e-6 && rise > 1e-9)
      assert.ok(run > 1e-9 && rise / run <= slope + 1e-6, 'climbs along the tab, no steeper than it: ' + (rise / (run || 1e-12)).toFixed(3));
  }
});
test('3D tabs: passes above the floor rise only where the triangle comes up through them', () => {
  const tp = make([RECT], 'outside', { through: true, step: 4, tabs: 1 });
  tp.tabLen = 10; tp.tabStyle = '3d'; tp.tabPts = { [tp.ents[0]]: [[70, 20]] }; D.tpGenerate(tp);
  // the pass at Z -12 (above the -12.2 floor): the cutter's slope reaches -12 at 0.2 / 0.7 of the way up from each end
  const floor = deepest(tp), top = -11.5, { onEdge } = tabCheck(tp, [70], 10, top, floor, '3d');
  const k = R + 5 * (1 - (-12 - floor) / (top - floor));
  const atPass = onEdge.filter((c) => Math.abs(c.z0 - -12) < 1e-6 && Math.abs(c.z1 - -12) < 1e-6).flatMap((c) => [c.x0, c.x1]);
  assert.ok(atPass.some((x) => Math.abs(x - (70 - k)) < 1e-6) && atPass.some((x) => Math.abs(x - (70 + k)) < 1e-6), 'leaves the pass exactly where the slope meets it');
  assert.ok(!atPass.some((x) => x > 70 - k + 1e-6 && x < 70 + k - 1e-6), 'and not over the part of the tab above it');
});
test('a finishing pass starting at a tab doesn\u2019t plunge into it, flat or 3D', () => {
  for (const shape of ['flat', '3d']) {
    const tp = make([RECT], 'outside', { through: true, step: 4, tabs: 1 });
    tp.tabLen = 10; tp.tabStyle = shape; tp.finishPass = true; tp.allowance = 0.3;
    // where the finishing lap starts: its first move down, after the roughing
    D.tpGenerate(tp); const all = cuts(tp);
    const first = tp.moves.findIndex((m, i) => i > tp.moves.length / 2 && m.g === 0 && m.x !== undefined);
    const st = tp.moves.slice(0, first + 1).reduce((p, m) => ({ x: m.x ?? p.x, y: m.y ?? p.y }), { x: 0, y: 0 });
    // put the tab on the outline right beside that start, and cut again
    const onOutline = [Math.min(Math.max(st.x, 20), 120), Math.min(Math.max(st.y, 20), 70)];
    tp.tabPts = { [tp.ents[0]]: [onOutline] }; D.tpGenerate(tp);
    const floor = deepest(tp), top = -11.5, near = cuts(tp).filter((c) => Math.hypot(c.x1 - st.x, c.y1 - st.y) < 1e-6 && c.z1 < c.z0);
    assert.ok(near.length, shape + ': the finishing lap goes down at its start');
    assert.ok(near.every((c) => c.z1 >= (shape === '3d' ? floor + (top - floor) * 0.5 : top) - 0.05 || Math.hypot(st.x - onOutline[0], st.y - onOutline[1]) > 5),
      shape + ': not into the tab: ' + near.map((c) => c.z1.toFixed(3)).join(', '));
  }
});

// ---- pockets ----
test('pocket with an island: never closer than the cutter\u2019s radius to a wall or the island, and all of it cleared', () => {
  const island = { t: 'circle', cx: 70, cy: 45, r: 8 };
  const tp = make([RECT, island], 'pocket', { depth: 3, step: 3 });
  const segs = onFinal(tp), dIsland = (x, y) => Math.hypot(x - island.cx, y - island.cy) - island.r;
  for (const c of segs) for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y1]]) {
    assert.ok(rectDist(x, y, RECT) <= -R + 0.01, `(${x.toFixed(3)}, ${y.toFixed(3)}) gouges the wall`);
    assert.ok(dIsland(x, y) >= R - 0.01, `(${x.toFixed(3)}, ${y.toFixed(3)}) gouges the island`);
  }
  // cleared: every point of the pocket floor the cutter can reach is within its radius of the path
  const segDist = (px, py, c) => { const dx = c.x1 - c.x0, dy = c.y1 - c.y0, L2 = dx*dx + dy*dy, t = L2 ? Math.max(0, Math.min(1, ((px - c.x0)*dx + (py - c.y0)*dy) / L2)) : 0; return Math.hypot(px - c.x0 - t*dx, py - c.y0 - t*dy); };
  let missed = 0, checked = 0;
  for (let x = RECT.x + R + 0.2; x < RECT.x + RECT.w - R; x += 1.3) for (let y = RECT.y + R + 0.2; y < RECT.y + RECT.h - R; y += 1.3) {
    if (dIsland(x, y) < R + 0.2) continue;
    checked++; if (!segs.some((c) => segDist(x, y, c) <= R + 1e-6)) missed++;
  }
  assert.ok(checked > 1000); assert.equal(missed, 0, missed + ' of ' + checked + ' floor points never under the cutter');
});

// ---- drilling, chamfers, V-carving ----
test('drilling: straight down at each hole\u2019s centre, to the depth', () => {
  const holes = [[40, 40], [80, 40], [100, 60]].map(([cx, cy]) => ({ t: 'circle', cx, cy, r: 3 }));
  const tp = make(holes, 'drill', { dia: 6, depth: 5 });
  for (const h of holes) {
    const down = cuts(tp).filter((c) => Math.abs(c.x1 - h.cx) < 1e-6 && Math.abs(c.y1 - h.cy) < 1e-6 && c.z1 < c.z0);
    assert.ok(down.length, `a plunge at (${h.cx}, ${h.cy})`);
    assert.ok(Math.abs(Math.min(...down.map((c) => c.z1)) - -5) < 1e-6, 'to Z -5');
  }
  assert.ok(cuts(tp).every((c) => holes.some((h) => Math.abs(c.x1 - h.cx) < 1e-6 && Math.abs(c.y1 - h.cy) < 1e-6)), 'no sideways cutting');
});
test('chamfer: a 90\u00b0 V-bit\u2019s tip runs along the edge, as deep as the bevel is wide', () => {
  const tp = make([RECT], 'chamfer', { dia: 12.7, vAngle: 90, chamW: 3 });
  assert.ok(Math.abs(deepest(tp) - -3) < 1e-6, 'a 3 mm bevel needs a 3 mm deep tip');
  for (const c of onFinal(tp)) assert.ok(Math.abs(rectDist(c.x1, c.y1, RECT)) < 0.01, 'on the edge');
});
test('V-carve: a 4 mm strip with a 60\u00b0 bit goes 2 / tan 30\u00b0 = 3.46 mm deep down its middle, and no deeper', () => {
  const strip = { t: 'rect', x: 20, y: 40, w: 80, h: 4 };
  const tp = make([strip], 'vcarve', { dia: 12.7, vAngle: 60 });
  const want = -2 / Math.tan(Math.PI / 6);
  assert.ok(deepest(tp) >= want - 0.02, 'never deeper than the strip\u2019s middle: ' + deepest(tp).toFixed(3));
  assert.ok(deepest(tp) <= want + 0.05, 'reaches it: ' + deepest(tp).toFixed(3));
  // the deepest cut is the strip's centre line: Y 42, from 2 mm in at one end to 2 mm in at the other
  const floor = onFinal(tp), xs = floor.flatMap((c) => [c.x0, c.x1]);
  assert.ok(floor.length && floor.every((c) => Math.abs(c.y0 - 42) < 0.01 && Math.abs(c.y1 - 42) < 0.01), 'along Y 42');
  assert.ok(Math.abs(Math.min(...xs) - 22) < 0.2 && Math.abs(Math.max(...xs) - 98) < 0.2, 'from X 22 to X 98: ' + Math.min(...xs).toFixed(2) + ' to ' + Math.max(...xs).toFixed(2));
});

// ---- the G-code ----
test('the G-code, read by 454 Control\u2019s own parser: nothing wrong, the same depths, a tool change per tool', () => {
  make([RECT, { t: 'circle', cx: 70, cy: 45, r: 8 }], 'pocket', { depth: 3, step: 3 });
  const pocket = D.tpList()[0];
  D.SEL = [0]; D.cutOpen(null);
  const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 3.175);
  const th = D.document.getElementById('cutThrough'); if (!th.checked) th.click();
  set('cutStep', 4); D.CUT.toolChosen = true; D.cutApply();
  assert.equal(D.tpList().length, 2);
  const job = D.tpJob(), r = parseGcode(job.gc);
  assert.deepEqual(r.issues.filter((i) => i.sev === 'err'), [], 'no errors');
  assert.equal(r.tools.length, 2, 'two tools, two tool changes');
  assert.ok(Math.abs(Math.min(...r.segs.map((s) => s.z1)) - -12.2) < 1e-6, 'through: -12.2');
  const pocketSegs = r.segs.filter((s) => !s.rapid && s.tool === r.tools[0].tool);
  assert.ok(Math.abs(Math.min(...pocketSegs.map((s) => s.z1)) - deepest(pocket)) < 1e-6, 'the pocket\u2019s depth, as generated');
  // each tool number named, as VCarve lists them, so Control can say which bit to put in at each change
  const byNumber = Object.fromEntries(r.tools.map((t) => [t.tool, (r.toolInfo[t.tool] || {}).desc]));
  assert.deepEqual(Object.values(byNumber), ['6.35 mm cutter', '3.17 mm cutter']);
  const lines = job.gc.split('\n');
  assert.ok(lines.indexOf(';Tools used in this file:') >= 0, 'the list is there');
  assert.ok(lines.indexOf(';Tools used in this file:') < lines.findIndex((l) => /^M6/.test(l)), 'before the first tool change');
  assert.equal(r.sections.map((s) => s.tool).join(', '), '6.35 mm cutter, 3.17 mm cutter', 'and each toolpath names its tool, as before');
});
