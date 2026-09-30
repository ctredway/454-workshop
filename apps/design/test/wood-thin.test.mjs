// Preview in wood: tabs and nearly-cut-through wood in amber (woodColour, woodThinBand in wood-preview.js), in the
// flat picture and the 3D block, on a real tabbed profile from the editor. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { const el = D.document.getElementById(id); if (el.checked !== on) el.click(); };
function tabbed(style, thk) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 120, h: 70, layer: 'L1' }]; D.DOC.toolpaths = [];
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); tick('cutThrough', true);
  tick('cutTabsOn', true); set('cutTabs', 4); set('cutTabStyle', style, 'change'); if (thk) set('cutTabThk', thk);
  D.document.getElementById('cutTabSpread').click(); D.CUT.toolChosen = true; D.cutApply();
  const box = JSON.parse(JSON.stringify(D.woodBox())), s = D.woodSim(D.woodParts(), box, D.woodCell(box));
  s.thin = D.woodThinBand();
  return s;
}
const same = (c, want) => c[0] === want[0] && c[1] === want[1] && c[2] === want[2];

for (const style of ['flat', '3d']) {
  test(style + ' tabs show in amber, in the flat picture and in 3D; the cut-through kerf is spoilboard; the top is wood', () => {
    const s = tabbed(style);
    const px = D.woodShade(s);
    let amber = 0, board = 0, top = 0;
    for (let i = 0; i < s.nx * s.ny; i++) {
      const row = s.ny - 1 - Math.floor(i / s.nx), o = (row * s.nx + i % s.nx) * 4;   // the picture has the far side at the top
      const c = [px[o], px[o + 1], px[o + 2]];
      const h = s.z[i];
      const col = D.woodColour(s, h);
      // the drawn pixel itself: shading scales the colour, so compare its hue (green over red)
      const hue = c[1] / c[0];
      if (same(col, D.WOOD_THIN)) { amber++; assert.ok(Math.abs(hue - D.WOOD_THIN[1] / D.WOOD_THIN[0]) < 0.03, 'drawn amber: ' + c); }
      else if (same(col, D.WOOD_BOARD)) board++;
      else if (h === s.top) { top++; assert.ok(Math.abs(hue - D.WOOD_TOP[1] / D.WOOD_TOP[0]) < 0.03, 'drawn wood'); }
    }
    assert.ok(amber > 100, 'the tabs: ' + amber + ' amber cells');
    assert.ok(board > 100000, 'the kerf, cut through');
    assert.ok(top > 100000, 'the top');
    const m = D.woodMesh(s);
    let amber3 = 0;
    for (let v = 0; v < m.mx * m.my; v++) {
      const c = [m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]].map((x) => Math.round(x * 255));
      if (same(c, D.WOOD_THIN)) amber3++;
    }
    assert.ok(amber3 > 10, 'and in the 3D block, after thinning: ' + amber3);
  });
}
test('thin means 2 mm, or the thickest tab and a little: 3 mm tabs still show', () => {
  const s = tabbed('flat', 3);
  assert.equal(s.thin, 3.25);
  let amber = 0; for (const h of s.z) if (same(D.woodColour(s, h), D.WOOD_THIN)) amber++;
  assert.ok(amber > 100, '3 mm tabs in amber: ' + amber);
});
test('no amber where nothing is thin, or when the material’s thickness isn’t known', () => {
  const s = tabbed('flat');
  const plain = Object.assign({}, s, { thin: 0 });
  for (const h of s.z) assert.ok(!same(D.woodColour(plain, h), D.WOOD_THIN));
  assert.ok(!same(D.woodColour(s, s.top), D.WOOD_THIN), 'the top isn’t thin');
  assert.ok(!same(D.woodColour(s, s.bottom + 5), D.WOOD_THIN), '5 mm left isn’t thin');
});
test('the window says what amber means when there is some', async () => {
  tabbed('flat');
  D.woodThree.failed = true;
  D.woodPreviewOpen();
  await new Promise((r) => setTimeout(r, 120));
  assert.match(D.document.getElementById('woodNote').textContent, /Amber: wood thinner than 2\.00 mm, such as tabs, and anything nearly cut through\./);
});
