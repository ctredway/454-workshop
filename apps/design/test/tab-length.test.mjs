// A tab's Length is the wood it leaves: measured in the wood itself, cut by Preview in wood's simulation from a
// tabbed profile made in the toolpath editor. Along the middle of the cut a flat tab is its full thickness for its
// whole length, whatever the cutter's size; a 3D tab is a triangle that long, its full thickness at the middle.
// (A tab used to be its length along the cutter's path, so a 4 mm tab with a 1/4" cutter left two slivers and
// nothing in the middle.) On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { const el = D.document.getElementById(id); if (el.checked !== on) el.click(); };

// 12 mm material, Z zero on top: the bottom is Z -12 and a 1 mm tab's top Z -11. One tab, placed by hand in the
// middle of the rectangle's bottom edge (x = 70, y = 20), where the cutter's centre runs along y = 20 - r.
const THK = 1, TOP = -11, BOTTOM = -12, CELL = 0.05;
function wood(len, dia, style) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 100, h: 50, layer: 'L1' }]; D.DOC.toolpaths = [];
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', dia);
  tick('cutThrough', true); set('cutStep', 4);
  tick('cutTabsOn', true); set('cutTabs', 1); set('cutTabLen', len); set('cutTabThk', THK); set('cutTabStyle', style, 'change');
  D.document.getElementById('cutTabSpread').click(); D.CUT.toolChosen = true; D.cutApply();
  const tp = D.tpList().at(-1);
  tp.tabPts = { [tp.ents[0]]: [[70, 20]] }; D.tpGenerate(tp);
  assert.ok(tp.tabsOn, 'tabs on');
  assert.equal(tp.tabLen, len, 'the length typed');
  const box = { x0: 40, y0: 20 - dia - 2, x1: 100, y1: 21, top: 0, bottom: BOTTOM };
  const s = D.woodSim(D.woodParts(), box, CELL);
  // the wood's height at x along the line y: from the nearest cell
  const at = (x, y) => { const i = Math.floor((x - s.x0) / CELL), j = Math.floor((y - s.y0) / CELL); return s.z[j * s.nx + i]; };
  // how far along y the wood stands at least h: the longest run of cells
  const run = (y, h) => { let best = 0, n = 0; for (let x = s.x0 + CELL / 2; x < box.x1; x += CELL) { n = at(x, y) >= h - 0.01 ? n + 1 : 0; best = Math.max(best, n); } return best * CELL; };
  return { at, run, mid: 20 - dia / 2 };
}

for (const dia of [6.35, 3.175]) for (const len of [4, 10]) {
  test(`flat tab, ${len} mm with a ${dia} mm cutter: ${len} mm of wood its full thickness along the middle of the cut`, () => {
    const w = wood(len, dia, 'flat');
    const mid = w.run(w.mid, TOP);
    assert.ok(Math.abs(mid - len) <= 2 * CELL, 'along the middle: ' + mid.toFixed(2) + ' mm');
    // and longer at the part's edge, where the cutter's round end only just reaches
    const edge = w.run(20 - CELL, TOP);
    assert.ok(edge >= len + dia / 2, 'at the part’s edge: ' + edge.toFixed(2) + ' mm');
    // no thicker than asked: it isn't left any taller than the tab's top
    assert.ok(Math.abs(w.at(70, w.mid) - TOP) < 0.01, 'its top: ' + w.at(70, w.mid));
    // and cut through either side of it
    assert.ok(w.at(70 - len / 2 - dia, w.mid) <= BOTTOM, 'cut through beside it');
  });
}

for (const dia of [6.35, 3.175]) {
  test(`3D tab, 10 mm with a ${dia} mm cutter: a triangle of wood 10 mm long, its full thickness at the middle`, () => {
    const w = wood(10, dia, '3d');
    assert.ok(Math.abs(w.at(70, w.mid) - TOP) < 0.02, 'full thickness at its middle: ' + w.at(70, w.mid));
    // the triangle's sides: from the cut's floor (Z -12.2, with the overcut) at 5 mm either side up to the top
    const floor = BOTTOM - 0.2;
    for (const d of [1, 2, 3, 4]) for (const x of [70 - d, 70 + d]) {
      const want = floor + (TOP - floor) * (1 - d / 5), got = w.at(x, w.mid);
      assert.ok(Math.abs(got - want) < 0.03, `at ${d} mm from its middle: Z ${got.toFixed(3)}, want ${want.toFixed(3)}`);
    }
    assert.ok(w.at(70 - 5.2, w.mid) <= BOTTOM && w.at(70 + 5.2, w.mid) <= BOTTOM, 'cut through past its ends');
  });
}
