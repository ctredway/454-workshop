// Floor a V-carve's clearing pocket can't reach: cam.js's pocket({floorCheck}) and the note Design puts on the
// clearing toolpath, on the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// What's said is checked against Preview in wood's simulation (wood-preview.js) of the clearing pocket and the
// V-carve cut one after the other: the area of floor left, and how high it stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const ANGLE = 60, TAN = Math.tan(ANGLE / 2 * Math.PI / 180), DEEP = 3, ALLOW = DEEP * TAN, DIA = 6;

const wallDist = (loops, x, y) => { let d = Infinity; for (const L of loops) for (let k = 0; k < L.length; k++) { const a = L[k], b = L[(k + 1) % L.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t)); } return d; };
const inside = (L, x, y) => { let c = false; for (let k = 0, j = L.length - 1; k < L.length; j = k++) { const a = L[k], b = L[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
// The clearing pocket and the V-carve, cut in wood: the floor (everything the allowance or more from the walls)
// that isn't down to depth, as an area and as the highest it stands above the floor.
function cutBoth(outline, dia = DIA) {
  const pk = D.Cam.pocket({ outline, islands: [], toolDia: dia, stepover: dia * 0.4, depth: DEEP, passDepth: DEEP, allowance: ALLOW, finishPass: false,
    z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: 0 }, floorCheck: true });
  const vc = D.Cam.vcarve({ loops: [outline], angle: ANGLE, tip: 0, maxDepth: DEEP, z0: 0, safeZ: 5, feed: 800, plunge: 300 });
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]), cell = 0.05;
  const box = { x0: Math.min(...xs) - 2, y0: Math.min(...ys) - 2, x1: Math.max(...xs) + 2, y1: Math.max(...ys) + 2, top: 0, bottom: -10 };
  const sim = D.woodSim([{ moves: pk.moves, tool: { kind: 'flat', r: dia / 2 } }, { moves: vc.moves, tool: { kind: 'v', r: 50, half: ANGLE / 2 * Math.PI / 180, tip: 0 } }], box, cell);
  let cells = 0, high = 0;
  for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) {
    const x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell;
    if (!inside(outline, x, y) || wallDist([outline], x, y) < ALLOW) continue;
    const up = sim.z[j * sim.nx + i] + DEEP;
    if (up > 0.05) cells++;
    if (up > high) high = up;
  }
  return { pk, area: cells * cell * cell, high, said: Math.min(DEEP, (pk.floorLeftIn || 0) / TAN) };
}
const circle = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, k) => { const a = k / n * 2 * Math.PI; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const SQUARE = [[0, 0], [40, 0], [40, 40], [0, 40]];
// two squares joined by a neck 8 mm wide: its floor is 8 - 2 x 1.73 = 4.5 mm wide, too narrow for a 6 mm cutter
const NECK = [[0, 0], [30, 0], [30, 11], [50, 11], [50, 0], [80, 0], [80, 30], [50, 30], [50, 19], [30, 19], [30, 30], [0, 30]];

test('a square: the clearing cutter leaves the floor’s four corners, and the engine says how much and how high', () => {
  const r = cutBoth(SQUARE);
  // each corner: a square of the cutter's radius less the quarter circle the cutter does clear
  const exact = 4 * (1 - Math.PI / 4) * 3.01 * 3.01;
  assert.ok(r.area > exact * 0.85 && r.area < exact * 1.1, 'cut in wood, about ' + exact.toFixed(2) + ' mm2 of floor is left: ' + r.area.toFixed(2));
  assert.ok(r.pk.floorLeft <= r.area + 0.05, 'the engine never says more is left than is: ' + r.pk.floorLeft.toFixed(2) + ' against ' + r.area.toFixed(2));
  assert.ok(r.pk.floorLeft > r.area * 0.6, 'and not much less: ' + r.pk.floorLeft.toFixed(2));
  assert.ok(r.high > 1.2 && r.high < 1.7, 'the corners stand about 1.5 mm above the floor: ' + r.high.toFixed(3));
  assert.ok(r.said <= r.high + 0.02 && r.said > r.high - 0.25, 'and the engine says so, within a grid cell: ' + r.said.toFixed(3) + ' against ' + r.high.toFixed(3));
});
test('a neck too narrow for the cutter: its floor is left at the full height', () => {
  const r = cutBoth(NECK);
  assert.ok(r.area > 60, 'cut in wood, most of the neck’s floor (4.5 x 20 mm) is left: ' + r.area.toFixed(2));
  assert.ok(r.pk.floorLeft <= r.area + 0.05 && r.pk.floorLeft > r.area * 0.8, r.pk.floorLeft.toFixed(2) + ' against ' + r.area.toFixed(2));
  assert.ok(r.high > DEEP - 0.01, 'the middle of it is never touched: ' + r.high.toFixed(3));
  assert.equal(r.said, DEEP, 'said as the pocket’s depth, never more');
});
test('a circle has no corners: nothing is left, and nothing is said', () => {
  const r = cutBoth(circle(25, 25, 22));
  // (the pocket keeps 0.01 mm off its line and the wood is in 0.05 mm cells, so a hair of a rim shows at the
  // floor's edge, where the V-bit's slope starts: a cell or two wide, so under 0.25 mm high)
  assert.ok(r.area < 0.5 && r.high < 0.25, 'cut in wood: ' + r.area.toFixed(3) + ' mm2, ' + r.high.toFixed(3) + ' high');
  assert.equal(r.pk.floorLeft, 0);
  assert.equal(r.pk.floorLeftIn, 0);
});
test('a cutter too big for the pocket leaves all of its floor', () => {
  const pk = D.Cam.pocket({ outline: [[0, 0], [9, 0], [9, 9], [0, 9]], islands: [], toolDia: DIA, stepover: 2.4, depth: DEEP, passDepth: DEEP, allowance: ALLOW,
    z0: 0, safeZ: 5, feed: 800, plunge: 300, floorCheck: true });
  const side = 9 - 2 * ALLOW;
  assert.equal(pk.warning, 'the cutter is too big for this pocket');
  assert.ok(Math.abs(pk.floorLeft - side * side) < 1.5, 'the floor is ' + (side * side).toFixed(2) + ' mm2: ' + pk.floorLeft.toFixed(2));
  assert.ok(Math.abs(pk.floorLeftIn - side / 2) < 0.1, 'its middle is ' + (side / 2).toFixed(2) + ' mm in: ' + pk.floorLeftIn.toFixed(3));
});
test('it’s only measured when asked for: any other pocket is as it was', () => {
  const o = { outline: SQUARE, islands: [], toolDia: DIA, stepover: 2.4, depth: DEEP, passDepth: DEEP, allowance: ALLOW, z0: 0, safeZ: 5, feed: 800, plunge: 300 };
  const a = D.Cam.pocket(o), b = D.Cam.pocket(Object.assign({ floorCheck: true }, o));
  assert.equal(a.floorLeft, undefined);
  assert.deepEqual(plain(a.moves), plain(b.moves), 'and asking changes no move');
});

// ---- in Design: the note on the clearing toolpath ----
function setup(ents) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 120, h: 80, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = ents; D.DOC.toolpaths = [];
  return D.run(`(function(){
    var v = {id: tpNewId(), name: 'V-carve', side: 'vcarve', type: 'vcarve', ents: [entId(DOC.ents[0])], vAngle: ${ANGLE}, vTip: 0, vcMax: ${DEEP}, dia: 12.7, step: 0,
             feed: 800, plunge: 300, safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true};
    tpGenerate(v); tpList().push(v);
    vcarveClearing(v);
    var c = tpList().filter(function (x) { return x.clearFor === v.id; })[0];
    c.dia = ${DIA}; c.toolChosen = true; tpGenerate(c);
    return c.id;
  })()`);
}
const tpOf = (id) => plain(D.run(`tpList().filter(function(t){ return t.id === '${id}'; })[0]`));
test('a V-carve’s clearing pocket says when it leaves floor, and how high, on its card', () => {
  const id = setup([{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]);
  const c = tpOf(id);
  assert.ok(c.floorLeft && c.floorLeft.high > 1.2 && c.floorLeft.high < 1.6, JSON.stringify(c.floorLeft));
  assert.match(c.warning, /^this cutter can’t get into some corners or narrow parts, and the floor there is left up to 1\.\d\d mm high\. The V-bit doesn’t flatten it: use a smaller cutter here, or pare it flat by hand before fitting an inlay$/);
  const rows = D.run(`tpRows(tpList().filter(function(t){ return t.id === '${id}'; })[0]).map(function(r){ return r.join(': '); }).join(' / ')`);
  assert.match(rows, /Note: this cutter can’t get into some corners/);
});
test('a smaller cutter leaves lower corners; a round carving leaves none and says nothing', () => {
  const id = setup([{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]);
  const before = tpOf(id).floorLeft.high;
  D.run(`(function(){ var c = tpList().filter(function(t){ return t.id === '${id}'; })[0]; c.dia = 2; tpGenerate(c); })()`);
  const after = tpOf(id).floorLeft.high;
  assert.ok(after < before / 2 && after > 0.3, '6 mm: ' + before + ', 2 mm: ' + after);
  const round = tpOf(setup([{ t: 'circle', cx: 40, cy: 40, r: 22, layer: 'L1' }]));
  assert.equal(round.floorLeft, null);
  assert.equal(round.warning, null);
});
test('an ordinary pocket isn’t measured, and has no such note', () => {
  setup([{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]);
  const p = plain(D.run(`(function(){
    var p = {id: tpNewId(), name: 'Pocket', side: 'pocket', type: 'pocket', ents: [entId(DOC.ents[0])], depth: 3, step: 3, allowance: 1, finishPass: false, stepoverPct: 40,
             dia: ${DIA}, feed: 800, plunge: 300, safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true};
    tpGenerate(p); return p;
  })()`));
  assert.equal(p.floorLeft, undefined);
  assert.equal(p.warning, null);
});
