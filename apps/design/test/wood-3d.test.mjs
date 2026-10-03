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
// ---- the block while the cut is played: only the part that changed is moved ----
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const BOX = { x0: 0, y0: 0, x1: 60, y1: 40, top: 0, bottom: -12 };
let seed = 777;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function madeUp() {
  const moves = [{ g: 0, z: 5 }];
  for (let i = 0; i < 30; i++) {
    const m = { g: rnd() < 0.2 ? 0 : 1 };
    if (rnd() < 0.8) m.x = -5 + rnd() * 70;                // past the board's edges too
    if (rnd() < 0.8) m.y = -5 + rnd() * 50;
    if (rnd() < 0.6) m.z = 3 - rnd() * 16;                 // above the top, and through the bottom
    moves.push(m);
  }
  return [{ moves, tool: { kind: 'flat', r: 2 }, feed: 900 }];
}
// what three.js's computeVertexNormals makes of a mesh's top: every triangle's (c - b) x (a - b), added to its
// three points, then each made one long. Written out here on its own, to hold woodMeshNormals to it.
function threeNormals(m) {
  const n = new Float64Array(m.pos.length), P = (v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]], A = P(a), B = P(b), C = P(c);
    const u = [C[0] - B[0], C[1] - B[1], C[2] - B[2]], v = [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
    const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const p of [a, b, c]) for (let q = 0; q < 3; q++) n[p * 3 + q] += x[q];
  }
  for (let v = 0; v < m.nTop; v++) { const l = Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) || 1; for (let q = 0; q < 3; q++) n[v * 3 + q] /= l; }
  return n;
}
for (const maxVerts of [500000, 1500]) {
  test(`played, the block is moved a patch at a time and is always what a fresh one would be (${maxVerts === 1500 ? 'thinned' : 'every cell a point'})`, () => {
    for (let t = 0; t < 6; t++) {
      const parts = madeUp(), job = D.woodJob(parts, BOX, 0.5), keeps = [];
      job.thin = 2;
      const m = D.woodMesh(job, maxVerts), nor = new Float32Array(m.pos.length);
      assert.equal(m.k > 1, maxVerts === 1500);
      D.woodMeshNormals(m, nor, 0, 0, m.mx - 1, m.my - 1);
      let edges = 0;
      for (let step = 0; step < 40; step++) {
        const how = D.woodSeek(job, keeps, step === 39 ? job.total : job.total * rnd());       // forwards and back
        const d = how === 'all' ? { i0: 0, j0: 0, i1: job.nx - 1, j1: job.ny - 1 } : job.dirty;
        job.dirty = null;
        if (!d) continue;
        const r = D.woodMeshUpdate(job, m, d.i0, d.j0, d.i1, d.j1);
        if (!r) continue;
        if (r.edge) edges++;
        D.woodMeshNormals(m, nor, r.a0, r.b0, r.a1, r.b1);
        if (step % 8 === 0 || step === 39) {
          const fresh = D.woodMesh(job, maxVerts);
          assert.ok(bytes(m.pos).equals(bytes(fresh.pos)), `job ${t} step ${step}: every point where a fresh block has it`);
          assert.ok(bytes(m.col).equals(bytes(fresh.col)), `job ${t} step ${step}: and its colour`);
          const want = threeNormals(fresh);
          for (let v = 0; v < m.nTop * 3; v++) assert.ok(Math.abs(nor[v] - want[v]) < 1e-5, `job ${t} step ${step}: lighting at ${v}: ${nor[v]} is not ${want[v]}`);
        }
      }
      assert.ok(edges > 0, 'cuts reached the board’s sides, which moved too');
    }
  });
}
test('a patch of cells off the board moves nothing', () => {
  const job = D.woodJob(madeUp(), BOX, 0.5), m = D.woodMesh(job);
  assert.equal(D.woodMeshUpdate(job, m, 500, 500, 600, 600), null);
});
test('the bit’s outline: a flat end, a ball, a V at its angle; the shank stands clear of the material', () => {
  const pts = (tool, thick = 12) => JSON.parse(JSON.stringify(D.woodBitShape(tool, thick)));
  const flat = pts({ kind: 'flat', r: 3 });
  assert.deepEqual(flat, [[0, 0], [3, 0], [3, 18], [0, 18]], 'a cylinder, half as tall again as the material');
  const ball = pts({ kind: 'ball', r: 3 });
  assert.deepEqual(ball[0], [0, 0]);
  for (const [d, h] of ball.slice(1, 9)) near(Math.hypot(d, h - 3), 3, 1e-9, 'on the ball');
  near(ball[8][0], 3, 1e-9, 'the ball ends at its full width'); near(ball[8][1], 3, 1e-9, 'a radius up');
  const v = pts({ kind: 'v', r: 6.35, half: Math.PI / 4, tip: 0 });                     // 90 degrees: one out for one up
  assert.deepEqual(v.slice(0, 2).map((p) => p.map((n) => +n.toFixed(6))), [[0, 0], [6.35, 6.35]]);
  const tipped = pts({ kind: 'v', r: 6.35, half: Math.PI / 6, tip: 1 });
  assert.deepEqual(tipped[1], [0.5, 0], 'its flat tip');
  near(tipped[2][1], (6.35 - 0.5) / Math.tan(Math.PI / 6), 1e-9, 'a 60-degree bit: steeper');
  const unknown = pts({ kind: 'v', r: 50, half: Math.PI / 6, tip: 0 }, 10);              // no diameter given
  near(unknown[1][0], 13 * Math.tan(Math.PI / 6), 1e-9, 'as wide as it could cut in this material, and a little');
  for (const p of [flat, ball, v, tipped, unknown]) {
    const top = p[p.length - 1];
    assert.equal(top[0], 0, 'closed at the top');
    assert.ok(top[1] >= 12 && top[1] >= p[p.length - 3][1] + 4, 'the shank goes on above the cutting part');
  }
});
// ---- the view cube (src/js/wood-cube.js) ----
test('the view cube sits in the view’s top right corner; a point outside its square isn’t on it', () => {
  const C = D.WOODCUBE, w = 900, left = w - C.px - C.pad;
  assert.equal(D.woodCubeAt(left - 1, C.pad + 10, w), null, 'just left of it');
  assert.equal(D.woodCubeAt(left + 10, C.pad + C.px + 1, w), null, 'just below it');
  assert.equal(D.woodCubeAt(400, 300, w), null, 'the middle of the view');
  const mid = JSON.parse(JSON.stringify(D.woodCubeAt(left + C.px / 2, C.pad + C.px / 2, w)));
  near(mid.x, 0, 1e-9, 'its middle, across'); near(mid.y, 0, 1e-9, 'its middle, up');
  const tl = JSON.parse(JSON.stringify(D.woodCubeAt(left, C.pad, w)));
  assert.deepEqual([tl.x, tl.y], [-1, 1], 'its top left: up is up');
});
test('a click on the view cube: a face looks square on, an edge or corner from there, never from below the board', () => {
  const h = D.WOODCUBE.half, lowest = Math.PI / 2 - 0.02;
  const dir = (p) => JSON.parse(JSON.stringify(D.woodCubeDir(...p)));
  const top = dir([0.1, h, -0.1]);
  near(top.phi, 0.001, 1e-9, 'Top: straight down'); assert.equal(top.theta, 0, 'with the far side at the top');
  const front = dir([0.1, 0.1, h]);
  near(front.theta, 0, 1e-9, 'Front'); near(front.phi, lowest, 1e-9, 'level with the board, as low as the view goes');
  near(dir([h, 0, 0.1]).theta, Math.PI / 2, 1e-9, 'Right');
  near(dir([-h, 0, 0.1]).theta, -Math.PI / 2, 1e-9, 'Left');
  near(Math.abs(dir([0.1, 0, -h]).theta), Math.PI, 1e-9, 'Back');
  const corner = dir([h, h, h * 0.9]);                                    // near the top front right corner
  near(corner.theta, Math.PI / 4, 1e-9, 'a corner: between front and right'); near(corner.phi, Math.acos(1 / Math.sqrt(3)), 1e-9, 'and from above');
  const edge = dir([0, h, h * 0.9]);                                      // the top front edge
  near(edge.theta, 0, 1e-9, 'an edge: from the front'); near(edge.phi, Math.PI / 4, 1e-9, 'half way up');
  near(dir([0.1, -h, 0.1]).phi, lowest, 1e-9, 'Bottom: the lowest side view, not from underneath');
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
