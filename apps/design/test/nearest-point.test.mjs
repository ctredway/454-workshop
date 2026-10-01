// "How far is this point from the outline, and where's the nearest point on it?" (Geom.pathIndex, in geom.js):
// what pockets, V-carves and offsets all ask, millions of times. It answers two ways, by a grid of cells for a
// point among many segments, and segment by segment for a short outline or a point outside it, and both must
// give the true nearest. Checked here against a plain measure-everything reference. (That the faster way cuts
// exactly as before was proven separately, old engine against new, on 59 pockets and V-carves: CHANGELOG.)
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const G = D.Geom;
let seed = 4540;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
// the plain way: every segment, the nearest point on each
function reference(path, closed, px, py) {
  let best = Infinity, at = null;
  const last = closed ? path.length : path.length - 1;
  for (let i = 0; i < last; i++) {
    const a = path[i], b = path[(i + 1) % path.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    let t = L2 < 1e-9 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(px - q[0], py - q[1]);
    if (d < best) { best = d; at = q; }
  }
  return { d: best, at };
}
const star = (cx, cy, ro, ri, n) => Array.from({ length: n * 2 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ri : ro; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const blob = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => { const a = 2 * Math.PI * i / n, rr = r * (0.6 + 0.4 * rnd()); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; });
const shapes = {
  'a square (4 segments)': [[0, 0], [40, 0], [40, 40], [0, 40]],
  'a star (10)': star(20, 20, 20, 8, 5),
  'a rough outline (24, the most measured segment by segment from inside)': blob(20, 20, 20, 24),
  'a rough outline (25, the fewest that use the grid from inside)': blob(20, 20, 20, 25),
  'a rough outline (300)': blob(20, 20, 20, 300),
  'a rough outline (600, the most measured segment by segment from outside)': blob(20, 20, 20, 600),
  'a rough outline (601)': blob(20, 20, 20, 601),
  'a rough outline (2000)': blob(20, 20, 20, 2000),
};

for (const [name, path] of Object.entries(shapes)) {
  test('the nearest point on ' + name + ', from inside, outside and far away', () => {
    const idx = G.pathIndex(path, true);
    for (let k = 0; k < 400; k++) {
      const far = k % 4 === 3, px = far ? -300 + rnd() * 700 : -15 + rnd() * 70, py = far ? -300 + rnd() * 700 : -15 + rnd() * 70;
      const want = reference(path, true, px, py);
      idx.lastNear = null;
      const got = idx.dist(px, py);
      assert.ok(Math.abs(got - want.d) < 1e-9, `distance from ${px.toFixed(2)}, ${py.toFixed(2)}: ${got} against ${want.d}`);
      assert.ok(idx.lastNear && Math.abs(Math.hypot(px - idx.lastNear[0], py - idx.lastNear[1]) - want.d) < 1e-9, 'and the point it names is that far');
      // looking no further than a cap that reaches it: the same answer
      idx.lastNear = null;
      assert.ok(Math.abs(idx.dist(px, py, want.d + 1) - want.d) < 1e-9, 'with a cap that reaches');
      // a cap that falls well short: "nothing that near", never a wrong nearer answer
      if (want.d > 5) assert.ok(idx.dist(px, py, want.d / 2) > want.d / 2, 'with a cap that falls short');
    }
  });
}
test('an open path: its ends aren’t joined', () => {
  const path = [[0, 0], [10, 0], [10, 10]], idx = G.pathIndex(path, false);
  for (const [px, py] of [[0, 10], [5, 5], [-3, 4], [20, 20], [10, 5], [2, 9]]) {
    assert.ok(Math.abs(idx.dist(px, py) - reference(path, false, px, py).d) < 1e-9, px + ', ' + py);
  }
  assert.ok(Math.abs(idx.dist(0, 10) - Math.hypot(5, 5)) > 1, 'not measured to a closing edge from 10,10 back to 0,0');
});
test('two different points equally near (the middle of a square): one of them, the right distance', () => {
  const idx = G.pathIndex([[0, 0], [40, 0], [40, 40], [0, 40]], true);
  idx.lastNear = null;
  assert.equal(idx.dist(20, 20), 20);
  assert.equal(Math.hypot(20 - idx.lastNear[0], 20 - idx.lastNear[1]), 20);
});
