// Preview in wood in 3D (src/js/wood-3d.js): the block built from the simulation, on Design's real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
// a small simulation by hand: 6 x 4 cells of 1 mm, top 0, bottom -10, with a cut and a through-cut
function sim() {
  const nx = 6, ny = 4, z = new Float32Array(nx * ny).fill(0);
  z[1 * nx + 2] = -3;                                    // a cut at cell (2, 1)
  z[2 * nx + 4] = -10;                                   // cut through at cell (4, 2)
  return { nx, ny, cell: 1, x0: 100, y0: 50, top: 0, bottom: -10, z };
}
const vert = (m, v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
const colour = (m, v) => [m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]].map((c) => Math.round(c * 255));

test('the top is one point per cell, at its height, in three.js’s axes (up is height, the drawing’s y is towards you as -z)', () => {
  const s = sim(), m = D.woodMesh(s);
  assert.equal(m.k, 1); assert.equal(m.mx, 6); assert.equal(m.my, 4);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
    const [x, y, z] = vert(m, j * 6 + i);
    near(x, 100 + i + 0.5, 1e-6, 'x'); near(z, -(50 + j + 0.5), 1e-6, 'z'); near(y, s.z[j * 6 + i], 1e-6, 'height');
  }
  assert.equal(m.idx.length / 3 >= 5 * 3 * 2, true, 'two triangles per square of the top');
});
test('colours: the top is the lightest wood, a cut darker, a through-cut the spoilboard', () => {
  const m = D.woodMesh(sim());
  assert.deepEqual(colour(m, 0), [...D.WOOD_TOP], 'untouched top');
  assert.deepEqual(colour(m, 2 * 6 + 4), [...D.WOOD_BOARD], 'cut through');
  const cut = colour(m, 1 * 6 + 2);
  assert.ok(cut[0] < D.WOOD_TOP[0] && cut[0] > D.WOOD_DEEP[0] - 1, 'a 3 mm cut: between the top and the deepest wood');
});
test('the board’s four edges go from the top down to its bottom, all the way round', () => {
  const s = sim(), m = D.woodMesh(s), top = 6 * 4, n = m.pos.length / 3;
  assert.equal(n - top, 2 * (6 + 4) * 2, 'a top and a bottom point for every edge point');
  const xs = [], zs = [];
  for (let v = top; v < n; v++) {
    const [x, y, z] = vert(m, v);
    if ((v - top) % 2 === 1) { near(y, -10, 1e-6, 'the bottom of the board'); xs.push(x); zs.push(z); }
  }
  near(Math.min(...xs), 100.5, 1e-6, 'left edge'); near(Math.max(...xs), 105.5, 1e-6, 'right edge');
  near(Math.max(...zs), -50.5, 1e-6, 'front edge'); near(Math.min(...zs), -53.5, 1e-6, 'back edge');
  for (const i of m.idx) assert.ok(i < n, 'every triangle uses points that exist');
});
test('a big grid is thinned, each point taking the deepest cell in its patch, so no cut disappears', () => {
  const nx = 1200, ny = 900, z = new Float32Array(nx * ny).fill(0);
  z[451 * nx + 601] = -5;                                // one deep cell among a million
  const m = D.woodMesh({ nx, ny, cell: 0.1, x0: 0, y0: 0, top: 0, bottom: -12, z }, 100000);
  assert.ok(m.k > 1, 'thinned');
  assert.ok(m.mx * m.my <= 100000 * 1.1, 'to about the size asked: ' + m.mx * m.my);
  let lowest = 0; for (let v = 0; v < m.mx * m.my; v++) lowest = Math.min(lowest, m.pos[v * 3 + 1]);
  near(lowest, -5, 1e-6, 'the single deep cell still shows');
});
test('without three.js (or 3D graphics), the window shows the flat picture, and says why', async () => {
  // the harness has neither: the preview must still work, from above
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 100, h: 80, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 40, h: 30, layer: 'L1' }]; D.DOC.toolpaths = [];
  const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', 6); set('cutDepth', 3); D.CUT.toolChosen = true; D.cutApply();
  D.woodThree.failed = true;                             // as when the library can't be fetched
  D.woodPreviewOpen();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(D.document.getElementById('wood3d').hidden, true, 'no 3D');
  assert.equal(D.document.getElementById('woodCv').hidden, false, 'the flat picture');
  assert.equal(D.document.getElementById('woodViews').hidden, true, 'no view buttons');
  assert.match(D.document.getElementById('woodHow').textContent, /the 3D view needs a library that didn’t load/);
});
