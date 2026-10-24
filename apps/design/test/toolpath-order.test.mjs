// The order a toolpath cuts its shapes in, and the lift between them inside a part (Design 0.159.0). Clint, 2026-10-23,
// on his arm inserts (90 holes in 1.2 mm material): "how the tool path chose the order in which the holes and the
// chamfers are completed in. IMO its very inefficient". Chamfers and profiles went in the order the shapes were picked
// (5.1 m between the chamfers, where 1.9 m will do), drilling nearest-next (2.2 m), and every hop lifted 6 mm.
// On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
D.toast = () => {};

function setup(ents, hop) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 1.2, zero: 'top', origin: 'fl'}); delete DOC.stock.hop;
    ${hop ? `DOC.stock.hop = ${hop};` : ''}
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1'; delete DOC.sheets;
    DOC.ents = ${JSON.stringify(ents)}.map(function (e) { e.layer = 'L1'; return e; });
    DOC.toolpaths = []; DOC.dims = []; DOC.keeps = []; UNDO = []; REDO = []; SEL = []; 1`);
}
// a toolpath on shapes (by index), added to the drawing and worked out
function make(side, idx, more) {
  return D.run(`(function () {
    var tp = Object.assign({id: 't' + DOC.toolpaths.length, name: '${side} ' + DOC.toolpaths.length, side: '${side}', type: '${side}',
      ents: ${JSON.stringify(idx)}.map(function (i) { return entId(DOC.ents[i]); }), depth: 1.35, step: 1.35, dia: 2, feed: 500, plunge: 400, peck: 0,
      vAngle: 60, chamW: 0.5, chamMode: 'edge', safeZ: 6, rpm: 18000, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true},
      ${JSON.stringify(more || {})});
    DOC.toolpaths.push(tp); tpGenerate(tp); return DOC.toolpaths.length - 1; })()`);
}
const movesOf = (i) => plain(D.run(`DOC.toolpaths[${i}].moves`));
// where each cut goes down (the XY it's at when it first goes below the material), and the rapids' XY travel
function walk(moves) {
  let x = 0, y = 0, z = 6, travel = 0; const downs = [], lifts = [];
  moves.forEach((m) => {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 0) travel += Math.hypot(nx - x, ny - y);
    if (m.g === 0 && m.x === undefined && m.y === undefined && m.z !== undefined && nz > z) lifts.push(+nz.toFixed(6));
    if (nz < 0 && z >= 0) downs.push([+nx.toFixed(3), +ny.toFixed(3)]);
    x = nx; y = ny; z = nz;
  });
  return { travel, downs, lifts };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const tour = (pts) => { let s = 0, c = [0, 0]; pts.forEach((p) => { s += dist(c, p); c = p; }); return s; };
function nearestTour(pts) { const left = pts.slice(), out = []; let c = [0, 0]; while (left.length) { let bi = 0; left.forEach((p, i) => { if (dist(c, p) < dist(c, left[bi])) bi = i; }); c = left.splice(bi, 1)[0]; out.push(c); } return out; }

// 40 holes, 2.5 mm, picked in a scrambled order
const HOLES = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) HOLES.push([20 + c * 30 + (r % 2) * 7, 20 + r * 35 + (c % 3) * 4]);
const SCRAMBLED = HOLES.map((p, i) => [p, (i * 17) % 40]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
const circles = (pts) => pts.map((p) => ({ t: 'circle', cx: p[0], cy: p[1], r: 1.25 }));
const idx = (n, from = 0) => Array.from({ length: n }, (_, i) => i + from);

test('drilling: every hole once, and a shorter way round than nearest-next', () => {
  setup(circles(SCRAMBLED));
  const w = walk(movesOf(make('drill', idx(40))));
  assert.equal(w.downs.length, 40, 'each hole drilled');
  assert.equal(new Set(w.downs.map(String)).size, 40, 'none twice');
  const nn = tour(nearestTour(SCRAMBLED));
  assert.ok(w.travel <= nn + 1e-6, `${w.travel.toFixed(1)} mm, against nearest-next’s ${nn.toFixed(1)}`);
  assert.ok(w.travel < tour(SCRAMBLED) * 0.6, 'far less than in the order picked');
});

test('chamfers: in a short order, not the order picked', () => {
  setup(circles(SCRAMBLED));
  const w = walk(movesOf(make('chamfer', idx(40), { dia: 6.35 })));
  assert.equal(w.downs.length, 40, 'each hole chamfered once');
  const picked = tour(SCRAMBLED), nn = tour(nearestTour(SCRAMBLED));
  assert.ok(w.travel < picked * 0.6, `${w.travel.toFixed(1)} mm, against ${picked.toFixed(1)} in the order picked`);
  assert.ok(w.travel <= nn * 1.1, `close to nearest-next or better (${nn.toFixed(1)})`);
});

test('a profile cuts a shape inside another first, even when the outer one is nearer', () => {
  // the outer square's middle is nearer X0 Y0 than the small one in its far corner
  setup([{ t: 'rect', x: 5, y: 5, w: 100, h: 100 }, { t: 'rect', x: 85, y: 85, w: 10, h: 10 }, { t: 'rect', x: 150, y: 150, w: 10, h: 10 }]);
  const w = walk(movesOf(make('inside', [0, 1, 2])));
  assert.equal(w.downs.length, 3);
  const inSmall = (p) => p[0] >= 84 && p[0] <= 96 && p[1] >= 84 && p[1] <= 96;
  const inOuter = (p) => !inSmall(p) && p[0] <= 106 && p[1] <= 106;
  assert.ok(inSmall(w.downs[0]) || !inOuter(w.downs[0]), 'not the outer square first: ' + JSON.stringify(w.downs));
  assert.ok(w.downs.findIndex(inSmall) < w.downs.findIndex(inOuter), 'the small one before the square round it: ' + JSON.stringify(w.downs));
});

// two parts, cut out by an Outside profile, three holes in each
const PARTS = [{ t: 'rect', x: 10, y: 10, w: 100, h: 60 }, { t: 'rect', x: 140, y: 10, w: 100, h: 60 }]
  .concat(circles([[30, 30], [60, 50], [90, 30], [160, 30], [190, 50], [220, 30]]));

test('Lift inside a part: hops between holes in a part lift that far; onto and between parts, 6 mm', () => {
  setup(PARTS, 2);
  make('outside', [0, 1]);
  const w = walk(movesOf(make('drill', idx(6, 2))));
  assert.equal(w.downs.length, 6);
  const low = w.lifts.filter((z) => z === 2).length, high = w.lifts.filter((z) => z === 6).length;
  assert.equal(low, 4, 'two hops in each part, at 2 mm: ' + JSON.stringify(w.lifts));
  assert.ok(high >= 2, 'the hop between the parts, and the last lift, at 6 mm: ' + JSON.stringify(w.lifts));
  const m = movesOf(1), firstXY = m.findIndex((q) => q.x !== undefined);
  assert.ok(m.slice(0, firstXY).every((q) => q.z === undefined || q.z === 6), 'onto the first part at 6 mm');
  // chamfers and slots the same
  const c = walk(movesOf(make('chamfer', idx(6, 2), { dia: 6.35 })));
  assert.equal(c.lifts.filter((z) => z === 2).length, 4, 'chamfers: ' + JSON.stringify(c.lifts));
});

test('Lift inside a part does nothing when it isn’t set, or with no Outside profile', () => {
  setup(PARTS);
  make('outside', [0, 1]);
  assert.deepEqual([...new Set(walk(movesOf(make('drill', idx(6, 2)))).lifts)], [6], 'not set: 6 mm everywhere');
  setup(PARTS, 2);
  assert.deepEqual([...new Set(walk(movesOf(make('drill', idx(6, 2)))).lifts)], [6], 'no parts: 6 mm everywhere');
});

test('a hop across the bay of an L-shaped part lifts 6 mm: it would leave the part', () => {
  // an L: the bay is the top right; the two holes are at the ends of the L's arms, so the straight line between them
  // runs over the bay, off the part
  setup([{ t: 'poly', closed: true, pts: [[0, 0], [100, 0], [100, 30], [30, 30], [30, 100], [0, 100]] }].concat(circles([[90, 15], [15, 90]])), 2);
  make('outside', [0]);
  assert.deepEqual(walk(movesOf(make('drill', [1, 2]))).lifts, [6, 6], 'both at 6 mm');
});

test('changing the lift puts the toolpaths it changes out of date, so they’re worked out again', () => {
  setup(PARTS, 2);
  make('outside', [0, 1]);
  make('drill', idx(6, 2));
  assert.equal(D.run('tpStale(DOC.toolpaths[1])'), false);
  D.run('DOC.stock.hop = 3; 1');
  assert.equal(D.run('tpStale(DOC.toolpaths[1])'), true, 'the drilling');
  assert.equal(D.run('tpStale(DOC.toolpaths[0])'), false, 'not the Outside profile');
  D.run('tpGenerate(DOC.toolpaths[1]); DOC.ents[0].w = 90; 1');
  assert.equal(D.run('tpStale(DOC.toolpaths[1])'), true, 'and a part changed');
});

test('the route: every point once, shorter than nearest-next on scattered points, and shapes inside first', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 80 }, () => [+(rnd() * 300).toFixed(2), +(rnd() * 200).toFixed(2)]);
  const order = plain(D.run(`Cam.routeOrder(${JSON.stringify(pts)}, [0, 0])`));
  assert.deepEqual(order.slice().sort((a, b) => a - b), idx(80), 'each point once');
  const got = tour(order.map((i) => pts[i])), nn = tour(nearestTour(pts));
  assert.ok(got < nn - 1, `untangled: ${got.toFixed(1)} mm, against nearest-next’s ${nn.toFixed(1)}`);
  // point 0 is nearest, but 2 and 3 are inside it: they come first
  const nested = plain(D.run(`Cam.routeOrder([[1, 1], [50, 50], [5, 5], [6, 6]], [0, 0], [[2, 3], [], [], []])`));
  assert.ok(nested.indexOf(0) > nested.indexOf(2) && nested.indexOf(0) > nested.indexOf(3), JSON.stringify(nested));
});
