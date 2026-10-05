// The V-bit flattens the floor its clearing pocket's cutter can't get to: cam.js's vcarve({clear}) and Design's
// use of it, on the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// Checked by cutting in wood (Preview in wood's simulation, wood-preview.js): the clearing pocket, then the V-carve.
// The floor must end up flat to within the ridges a pointed tip leaves, and nothing may be cut that the V-carve's
// own shape doesn't allow: no deeper than the floor, no nearer a wall than the cone's slope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const ANGLE = 60, TAN = Math.tan(ANGLE / 2 * Math.PI / 180), DEEP = 3, DIA = 6, STEP = 0.127;
const RIDGE = STEP / 2 / TAN;                                   // what a pointed tip leaves between passes 0.127 mm apart: 0.11 mm
// Along the line into a square corner the passes turn, and the ridge between two turns is up to a fifth higher
// (0.13 mm). TOP: that, and 0.06 mm for the wood being in 0.05 mm cells.
const TOP = RIDGE * 1.2 + 0.06;

const wallDist = (loops, x, y) => { let d = Infinity; for (const L of loops) for (let k = 0; k < L.length; k++) { const a = L[k], b = L[(k + 1) % L.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t)); } return d; };
const inLoop = (L, x, y) => { let c = false; for (let k = 0, j = L.length - 1; k < L.length; j = k++) { const a = L[k], b = L[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const inside = (loops, x, y) => loops.filter((L) => inLoop(L, x, y)).length % 2 === 1;
const circle = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, k) => { const a = k / n * 2 * Math.PI; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const star = (cx, cy, r, n) => Array.from({ length: 2 * n }, (_, k) => { const rr = k % 2 ? r * 0.5 : r; return [cx + rr * Math.cos(k / n * Math.PI), cy + rr * Math.sin(k / n * Math.PI)]; });
const SQUARE = [[0, 0], [40, 0], [40, 40], [0, 40]];
// two squares joined by a neck 8 mm wide: its floor is 8 - 2 x 1.73 = 4.5 mm wide, too narrow for a 6 mm cutter
const NECK = [[0, 0], [30, 0], [30, 11], [50, 11], [50, 0], [80, 0], [80, 30], [50, 30], [50, 19], [30, 19], [30, 30], [0, 30]];

// The clearing pocket and the V-carve, cut in wood. start: a plug's start depth. Returns what's left of the floor
// (area standing more than `over` above it, and the highest), and the worst cut past what the V-carve's shape allows.
function cutBoth(loops, o = {}) {
  const start = o.start || 0, dia = o.dia || DIA, allow = (DEEP - start) * TAN;
  const [outline, ...islands] = loops;
  const pk = D.Cam.pocket({ outline, islands, toolDia: dia, stepover: dia * 0.4, depth: DEEP, passDepth: DEEP, allowance: allow, finishPass: false,
    z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: 0 } });
  const vo = { loops, angle: ANGLE, tip: 0, maxDepth: DEEP, startDepth: start, z0: 0, safeZ: 5, feed: 800, plunge: 300 };
  if (o.clear !== false) { vo.clear = { toolDia: dia, allowance: allow }; if (o.step) vo.floorStep = o.step; }
  const vc = D.Cam.vcarve(vo);
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]), cell = 0.05;
  const box = { x0: Math.min(...xs) - 2, y0: Math.min(...ys) - 2, x1: Math.max(...xs) + 2, y1: Math.max(...ys) + 2, top: 0, bottom: -10 };
  const sim = D.woodSim([{ moves: pk.moves, tool: { kind: 'flat', r: dia / 2 } }, { moves: vc.moves, tool: { kind: 'v', r: 50, half: ANGLE / 2 * Math.PI / 180, tip: 0 } }], box, cell);
  let left = 0, high = 0, past = 0, outside = 0;
  for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) {
    const x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell, z = sim.z[j * sim.nx + i], w = wallDist(loops, x, y), isIn = inside(loops, x, y);
    if (!isIn) { if (w > 0.08 && z < -0.001) outside++; continue; }
    // the deepest the V-carve's shape allows here: down the cone's slope from the wall (from the start depth, for a
    // plug), no deeper than the floor. A cell's width of slope is allowed for: the wood is in 0.05 mm cells.
    const allowed = -Math.min(DEEP, start + (w + cell * 1.5) / TAN);
    if (z < allowed - 0.01) past = Math.max(past, allowed - z);
    if (w < allow + 0.1) continue;                               // the floor proper, clear of the slope at its edge
    const up = z + DEEP;
    if (up > (o.over || TOP)) left++;
    if (up > high) high = up;
  }
  return { pk, vc, left: left * cell * cell, high, past, outside, rapidsIn: sim.rapidsIn, sim };
}

for (const [name, loops, min] of [
  ['a square: the floor’s four corners', [SQUARE], 4],
  ['a neck too narrow for the cutter: all of its floor', [NECK], 60],
  ['a square with a star-shaped island: the corners, and between the star’s points', [[[0, 0], [60, 0], [60, 60], [0, 60]], star(30, 30, 16, 5).reverse()], 5],
]) {
  test('the V-bit flattens what a 6 mm clearing cutter leaves, ' + name, () => {
    const before = cutBoth(loops, { clear: false });
    assert.ok(before.left > min, 'without it, floor is left: ' + before.left.toFixed(2) + ' mm2, up to ' + before.high.toFixed(2) + ' mm high');
    const r = cutBoth(loops);
    assert.ok(r.vc.floorRuns > 0 && r.vc.floorArea > min * 0.6, r.vc.floorRuns + ' lines over ' + r.vc.floorArea.toFixed(2) + ' mm2');
    assert.equal(r.left, 0, 'with it, none stands more than a ridge (0.11 to 0.13 mm) and a little above the floor; the highest is ' + r.high.toFixed(3));
    assert.ok(r.high < TOP, r.high.toFixed(3));
    assert.equal(r.past, 0, 'and nothing is cut that the V-carve’s shape doesn’t allow: no deeper than the floor, no nearer a wall than the slope');
    assert.equal(r.outside, 0, 'nothing outside the shape is touched');
    assert.equal(r.rapidsIn, 0, 'no rapid move goes into wood');
  });
}
test('down the middle of a narrow part, where the passes from the two sides meet, an extra pass keeps the ridge down', () => {
  // passes 0.4 mm apart (ridges 0.35 mm high), in a neck whose floor is 4.78 mm wide: 5 passes in from each side
  // leave 0.78 mm between the innermost two, nearly two steps, and nothing fits between them a whole step on.
  // Unfilled, that's a ridge 0.68 mm high down the middle.
  const W = 8.244, neck = [[0, 0], [30, 0], [30, 15 - W / 2], [50, 15 - W / 2], [50, 0], [80, 0], [80, 30], [50, 30], [50, 15 + W / 2], [30, 15 + W / 2], [30, 30], [0, 30]];
  const top = 1.2 * (0.4 / 2 / TAN) + 0.06;                          // 0.476
  const r = cutBoth([neck], { step: 0.4, over: top });
  assert.equal(r.left, 0, 'the highest is ' + r.high.toFixed(3));
  assert.ok(r.high < top && r.high > 0.2, r.high.toFixed(3));
  assert.equal(r.past, 0);
});
test('the tip never crosses a wall to get from one place to the next: it lifts', () => {
  // two squares 1 mm apart, carved 0.8 mm deep and cleared with a 1 mm cutter: the floor corners either side of the
  // gap are 1.9 mm from each other, and what's left in them is small, so the nearest place to go next is straight
  // across the gap, at depth, if nothing stopped it
  const A = [[0, 0], [30, 0], [30, 30], [0, 30]], B = [[31, 0], [61, 0], [61, 30], [31, 30]], deep = 0.8, edge = deep * TAN;
  const v = D.Cam.vcarve({ loops: [A, B], angle: ANGLE, tip: 0, maxDepth: deep, z0: 0, safeZ: 5, feed: 800, plunge: 300, clear: { toolDia: 1, allowance: edge } });
  assert.ok(v.floorRuns >= 8, String(v.floorRuns));
  let x = null, y = null, z = null, worst = Infinity, n = 0;
  for (const m of plain(v.moves)) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1 && m.x !== undefined && nz === -deep && z === -deep) {
      const k = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 0.02));
      for (let q = 0; q <= k; q++) { const px = x + (nx - x) * q / k, py = y + (ny - y) * q / k; n++; worst = Math.min(worst, inLoop(A, px, py) || inLoop(B, px, py) ? wallDist([A, B], px, py) : -wallDist([A, B], px, py)); }
    }
    x = nx; y = ny; z = nz;
  }
  assert.ok(n > 100, String(n));
  assert.ok(worst > edge - 0.01, 'at the floor’s depth the tip stays on the floor, ' + edge.toFixed(3) + ' mm or more from every wall: ' + worst.toFixed(3));
});
test('an inlay plug (a start depth): the floor is flattened the same, and its walls are left alone', () => {
  const loops = [[[0, 0], [60, 0], [60, 60], [0, 60]], star(30, 30, 16, 5).reverse()];
  const before = cutBoth(loops, { clear: false, start: 1.5 }), r = cutBoth(loops, { start: 1.5 });
  assert.ok(before.left > 5, before.left.toFixed(2));
  assert.equal(r.left, 0, 'the highest is ' + r.high.toFixed(3));
  assert.equal(r.past, 0);
  // (a plug's walls begin below the surface, so its cone always cuts past the outline above that: no more than before)
  assert.ok(before.outside > 0); assert.equal(r.outside, before.outside);
});
test('every floor pass is at the floor’s depth, goes straight down to it, and keeps the tip on the floor', () => {
  const o = { loops: [SQUARE], angle: ANGLE, tip: 0, maxDepth: DEEP, z0: 0, safeZ: 5, feed: 800, plunge: 300 };
  const a = plain(D.Cam.vcarve(o).moves), b = plain(D.Cam.vcarve(Object.assign({ clear: { toolDia: DIA, allowance: DEEP * TAN } }, o)).moves);
  // the walls are carved exactly as before; the floor passes come after, before the last lift
  assert.deepEqual(b.slice(0, a.length - 1), a.slice(0, -1), 'the walls first, not a move changed');
  const extra = b.slice(a.length - 1);
  let x = null, y = null, z = null, plunges = 0, worst = Infinity;
  for (const m of extra) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1 && m.x === undefined) { plunges++; assert.equal(nz, -DEEP, 'straight down to the floor in one go, as VCarve does'); assert.equal(m.f, 300); }
    if (m.g === 1 && m.x !== undefined) {
      assert.equal(nz, -DEEP); assert.equal(z, -DEEP, 'a cutting move starts at the floor too');
      const n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 0.02));
      for (let k = 0; k <= n; k++) worst = Math.min(worst, wallDist([SQUARE], x + (nx - x) * k / n, y + (ny - y) * k / n));
    }
    x = nx; y = ny; z = nz;
  }
  assert.equal(plunges, 4, 'one plunge for each corner');
  // the tip may go no nearer a wall than the floor's edge, 3 x tan 30 = 1.73 mm; the passes begin one step in from it
  assert.ok(worst > DEEP * TAN + STEP - 0.03, 'the nearest the tip comes to a wall: ' + worst.toFixed(3));
});
test('the passes are as far apart as asked: twice the step, about half the passes, and ridges twice as high', () => {
  const fine = cutBoth([SQUARE]), coarse = cutBoth([SQUARE], { step: 0.254, over: 2 * TOP - 0.06 });
  assert.ok(coarse.vc.floorRuns < fine.vc.floorRuns * 0.65 && coarse.vc.floorRuns > fine.vc.floorRuns * 0.35, fine.vc.floorRuns + ' and ' + coarse.vc.floorRuns);
  assert.equal(coarse.left, 0);
  assert.ok(coarse.high > fine.high + 0.03 && coarse.high < 2 * TOP - 0.06, fine.high.toFixed(3) + ' and ' + coarse.high.toFixed(3));
});
test('nothing to flatten, nothing added: a circle; no clearing cutter; no max depth', () => {
  const o = { loops: [circle(25, 25, 22)], angle: ANGLE, tip: 0, maxDepth: DEEP, z0: 0, safeZ: 5, feed: 800, plunge: 300 };
  const a = D.Cam.vcarve(o), b = D.Cam.vcarve(Object.assign({ clear: { toolDia: DIA, allowance: DEEP * TAN } }, o));
  assert.equal(b.floorRuns, 0); assert.deepEqual(plain(b.moves), plain(a.moves));
  assert.equal(a.floorRuns, 0);
  const noCap = { loops: [SQUARE], angle: ANGLE, tip: 0, z0: 0, safeZ: 5, feed: 800, plunge: 300 };
  assert.deepEqual(plain(D.Cam.vcarve(Object.assign({ clear: { toolDia: DIA, allowance: 0 } }, noCap)).moves), plain(D.Cam.vcarve(noCap).moves));
});
test('a clearing cutter too big to go anywhere: the V-bit flattens the whole floor', () => {
  const sq = [[0, 0], [9, 0], [9, 9], [0, 9]], side = 9 - 2 * DEEP * TAN;                   // the floor is 5.5 mm square
  const v = D.Cam.vcarve({ loops: [sq], angle: ANGLE, tip: 0, maxDepth: DEEP, z0: 0, safeZ: 5, feed: 800, plunge: 300, clear: { toolDia: DIA, allowance: DEEP * TAN } });
  assert.ok(Math.abs(v.floorArea - side * side) < 2, v.floorArea.toFixed(2) + ' of ' + (side * side).toFixed(2));
  const box = { x0: -2, y0: -2, x1: 11, y1: 11, top: 0, bottom: -10 }, cell = 0.05;
  const sim = D.woodSim([{ moves: v.moves, tool: { kind: 'v', r: 50, half: ANGLE / 2 * Math.PI / 180, tip: 0 } }], box, cell);
  let high = 0;
  for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) { const x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell; if (inLoop(sq, x, y) && wallDist([sq], x, y) > DEEP * TAN + 0.1) high = Math.max(high, sim.z[j * sim.nx + i] + DEEP); }
  assert.ok(high < TOP, 'the highest: ' + high.toFixed(3));
});

// ---- in Design ----
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const list = () => plain(D.run('tpList()'));
function inlay(half) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 19, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]; D.DOC.toolpaths = [];
  D.SEL = [0]; D.cutOpen(null);
  D.run(`CUT.side = 'inlay'; CUT.inlayHalf = '${half}'; CUT.vAngle = 60; CUT.vTip = 0; CUT.inlayD = 5; CUT.inlayS = 2.5; CUT.inlayM = 5; CUT.dia = 12.7; CUT.toolChosen = true; inlayApply(); 1`);
  const l = list();
  return { v: l.find((t) => t.side === 'vcarve'), c: l.find((t) => t.side === 'pocket') };
}
const floorMoves = (t) => t.moves.filter((m) => m.g === 1 && m.x !== undefined && Math.abs(m.z - Math.min(...t.moves.filter((q) => q.z !== undefined).map((q) => q.z))) < 1e-9).length;
test('an inlay’s V-carve flattens what its clearing pocket’s cutter leaves, and its card says so', () => {
  for (const half of ['pocket', 'plug']) {
    const { v, c } = inlay(half);
    assert.ok(v.vcFloor > 0.5, half + ': ' + v.vcFloor + ' mm2 with the 3.175 mm cutter the clearing starts with');
    const rows = D.run(`tpRows(tpList().filter(function(t){ return t.id === '${v.id}'; })[0]).map(function(r){ return r.join(': '); }).join(' / ')`);
    assert.match(rows, new RegExp('Floor: also flattens what “' + c.name + '” can’t reach: its corners and narrow parts'), half);
    assert.equal(c.warning, null, 'and the clearing pocket has nothing to warn of');
  }
});
test('choosing another cutter for the clearing pocket works the V-carve out again', () => {
  const { v, c } = inlay('pocket');
  D.run(`cutOpen(tpList().filter(function (t) { return t.id === '${c.id}'; })[0]); 1`);
  set('cutDia', 6); D.CUT.toolChosen = true; D.cutApply();
  const after = list().find((t) => t.id === v.id);
  assert.ok(after.vcFloor > v.vcFloor * 2, 'a 6 mm cutter leaves more than a 3.175 mm one: ' + v.vcFloor + ' then ' + after.vcFloor);
  assert.ok(floorMoves(after) > floorMoves(v), floorMoves(v) + ' then ' + floorMoves(after));
  assert.equal(D.run(`tpStale(tpList().filter(function (t) { return t.id === '${v.id}'; })[0])`), false);
});
test('a V-carve with no clearing pocket of its own is carved as it always was', () => {
  inlay('pocket');
  const lone = plain(D.run(`(function(){
    var v = {id: tpNewId(), name: 'V-carve', side: 'vcarve', type: 'vcarve', ents: [entId(DOC.ents[0])], vAngle: 60, vTip: 0, vcMax: 5, dia: 12.7, step: 0,
             feed: 800, plunge: 300, safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true};
    tpGenerate(v); return v;
  })()`));
  assert.equal(lone.vcFloor, 0);
  const walls = plain(D.Cam.vcarve({ loops: [[[10, 10], [50, 10], [50, 50], [10, 50]]], angle: 60, tip: 0, maxDepth: 5, z0: 0, safeZ: 6, feed: 800, plunge: 300 }).moves);
  assert.equal(lone.moves.length, walls.length);
});
