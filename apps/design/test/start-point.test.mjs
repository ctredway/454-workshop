// Choosing where a profile's cut starts (Set start in the toolpath editor; tp.startPts; startAt in cam.js's profile):
// the cut starts at the point on its path nearest the click, and is otherwise the same cut. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.VIEW.scale = 4;                                              // 4 pixels a mm: a click within 3 mm of an outline is on it
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
const plain = (v) => JSON.parse(JSON.stringify(v));
const R = 6.35 / 2, RECT = { t: 'rect', x: 20, y: 20, w: 100, h: 50 };

// open the editor on a rectangle: an outside profile, 6 mm deep in 2 passes
function open(o = {}) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [Object.assign({ layer: 'L1' }, RECT), { t: 'circle', cx: 160, cy: 60, r: 15, layer: 'L1' }]; D.DOC.toolpaths = [];
  D.SEL = o.sel || [0]; D.cutOpen(null); set('cutType', o.side || 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35);
  if (o.through) tick('cutThrough', true); else { set('cutDepth', 6); set('cutStep', 3); }
  if (o.lead) set('cutLead', o.lead, 'change');
  if (o.tabs) { tick('cutTabsOn', true); set('cutTabs', 1); set('cutTabLen', 6); set('cutTabThk', 2); D.CUT.tabPts = {}; }
}
const create = () => { D.CUT.toolChosen = true; D.cutApply(); return D.tpList().at(-1); };
const click = (x, y) => D.cutClick({ x, y });
// where the cutter first reaches the material: the first G0 to an XY
const firstXY = (tp) => { const m = tp.moves.find((mm) => mm.g === 0 && mm.x !== undefined); return [m.x, m.y]; };
// the length of cutting at each depth, round the path: the same cut, whichever point it starts at
function lengths(tp) {
  let x = 0, y = 0, z = 0; const at = {};
  for (const m of tp.moves) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1 && Math.abs(nz - z) < 1e-9) { const k = nz.toFixed(3); at[k] = (at[k] || 0) + Math.hypot(nx - x, ny - y); }
    x = nx; y = ny; z = nz;
  }
  return at;
}

test('Set start, click the outline: the cut starts at the nearest point on its path', () => {
  open();
  assert.ok(!el('cutStartRow').hidden, 'a Start row for profiles');
  assert.equal(el('cutStartSay').textContent, 'automatic');
  const auto = firstXY(D.tpGenerate(Object.assign({}, D.CUT, { ents: D.CUT.ents.slice() })));
  el('cutStartPlace').click();
  assert.equal(el('cutStartPlace').textContent, 'Done');
  click(70, 20.5);                                                  // near the middle of the bottom edge
  assert.equal(el('cutStartSay').textContent, '1 of 1 chosen');
  const tp = create();
  const [x, y] = firstXY(tp);
  assert.ok(Math.abs(x - 70) < 0.02 && Math.abs(y - (20 - R)) < 0.02, `starts at (${x.toFixed(3)}, ${y.toFixed(3)}), below (70, 20)`);
  assert.ok(Math.hypot(auto[0] - x, auto[1] - y) > 10, 'not where it started before: ' + auto);
  assert.deepEqual(plain(tp.startPts), { [tp.ents[0]]: [70, 20] });
});
test('otherwise the same cut: the same length at every depth, never closer than the cutter’s radius', () => {
  open(); const before = lengths(create());
  open(); el('cutStartPlace').click(); click(120, 45); const tp = create();
  const after = lengths(tp);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'the same depths');
  for (const k of Object.keys(before)) assert.ok(Math.abs(after[k] - before[k]) < 0.05, `at Z ${k}: ${after[k].toFixed(3)} against ${before[k].toFixed(3)}`);
  for (const m of tp.moves) if (m.g === 1 && m.x !== undefined) {
    const dx = Math.max(RECT.x - m.x, 0, m.x - (RECT.x + RECT.w)), dy = Math.max(RECT.y - m.y, 0, m.y - (RECT.y + RECT.h));
    assert.ok(Math.hypot(dx, dy) >= R - 1e-6, 'outside by the radius: ' + m.x + ', ' + m.y);
  }
});
test('one start per shape: clicking again moves it; Automatic clears them; each shape its own', () => {
  open({ sel: [0, 1] }); el('cutStartPlace').click();
  click(70, 20); click(20, 45);                                    // moved to the left edge
  click(160, 75);                                                  // the top of the circle
  assert.equal(el('cutStartSay').textContent, '2 of 2 chosen');
  const tp = create(), ids = tp.ents;
  assert.deepEqual(plain(tp.startPts[ids[0]]), [20, 45]);
  // the circle's cut starts at its top, the cutter's radius out
  const gos = tp.moves.filter((m) => m.g === 0 && m.x !== undefined);
  assert.ok(gos.some((m) => Math.abs(m.x - 160) < 0.1 && Math.abs(m.y - (75 + R)) < 0.05), 'the circle starts at its top (a circle is cut as short straight lines)');
  D.cutOpen(tp);
  assert.equal(el('cutStartSay').textContent, '2 of 2 chosen', 'editing shows them');
  el('cutStartPlace').click(); click(120, 45); D.cutClose();       // moved, then cancelled
  assert.deepEqual(plain(D.tpList().at(-1).startPts[ids[0]]), [20, 45], 'Cancel leaves the toolpath as it was');
  D.cutOpen(tp);
  el('cutStartClear').click();
  assert.equal(el('cutStartSay').textContent, 'automatic');
  assert.deepEqual(plain(create().startPts), {});
});
test('a click away from the outline sets nothing; start points only for profiles', () => {
  open(); el('cutStartPlace').click();
  click(70, 45);                                                   // the middle of the rectangle
  assert.equal(el('cutStartSay').textContent, 'automatic');
  click(70, 20);
  set('cutType', 'pocket', 'change');
  assert.ok(el('cutStartRow').hidden, 'no Start row for a pocket');
  assert.deepEqual(plain(create().startPts), {}, 'not kept on a pocket');
});
test('starting on a tab never cuts into it', () => {
  open({ through: true, tabs: true }); D.CUT.tabPts = { [D.CUT.ents[0]]: [[70, 20]] };
  el('cutStartPlace').click(); click(70, 20);
  const tp = create(), top = -12 + 2, half = 3 + R;
  let x = 0, y = 0, z = 0;
  for (const m of tp.moves) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1) for (let i = 0; i <= 20; i++) {
      const t = i / 20, px = x + (nx - x) * t, py = y + (ny - y) * t, pz = z + (nz - z) * t;
      if (Math.abs(py - (20 - R)) < 0.02 && Math.abs(px - 70) < half - 0.01) assert.ok(pz >= top - 1e-6, `into the tab at x ${px.toFixed(2)}: Z ${pz.toFixed(3)}`);
    }
    x = nx; y = ny; z = nz;
  }
});
test('with a lead-in: it sweeps in to the chosen point', () => {
  open({ lead: 'arc' }); D.CUT.rampOff = true; set('cutRamp', 'off', 'change');
  el('cutStartPlace').click(); click(70, 20);
  const tp = create();
  const firstCut = tp.moves.findIndex((m) => m.g === 1 && m.x !== undefined && m.z !== undefined && m.z < 0);
  const ends = tp.moves.slice(firstCut).filter((m) => m.x !== undefined).map((m) => [m.x, m.y]);
  assert.ok(ends.some(([ex, ey]) => Math.abs(ex - 70) < 0.02 && Math.abs(ey - (20 - R)) < 0.02), 'reaches (70, ' + (20 - R) + ')');
  const [sx, sy] = firstXY(tp);
  assert.ok(sy < 20 - R - 0.5, 'the lead starts in the waste, below the path: ' + sy);
});
test('a shape with several outlines: the start goes on the outline nearest the click', () => {
  const sq = (x0) => [[x0, 0], [x0 + 10, 0], [x0 + 10, 10], [x0, 10]];
  const out = D.tpStartLoops({ startPts: { a: [55, 0] } }, [{ id: 'a', loop: sq(0) }, { id: 'a', loop: sq(50) }, { id: 'b', loop: sq(100) }]);
  assert.deepEqual(plain(Array.from({ length: 3 }, (_, i) => out[i] || null)), [null, [55, 0], null]);
});
test('the editor’s hidden rows are hidden: one rule for every row (the tests’ page applies no styles, so this reads the rule)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/styles/design.css', import.meta.url), 'utf8');
  assert.match(css, /#cutPanel \.mirSlot\[hidden\]\{display:none\}/);
  assert.ok(el('cutStartRow').classList.contains('mirSlot') && el('cutRestRow').classList.contains('mirSlot'), 'the Start and Clean up after rows are rows it covers');
});
