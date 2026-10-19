// V-carving with a tapered ball nose: a cone ending in a ball (cam.js vbitShape, vcarve({tipR})), and Design's use
// of it, on the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// The bit's shape is checked against its geometry; the carving, by cutting it in Preview in wood's simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ': ' + a + ' against ' + b);
// VCarve's own library's TBN1-32: "5.4°" per side, stored as 10.8° included, with a 1/32 in (0.794 mm) tip radius
const ANGLE = 10.8, R = 0.03125 * 25.4, HALF = ANGLE / 2 * Math.PI / 180;

test('the bit’s shape: a ball, then a cone that runs smoothly out of it; reach undoes rise', () => {
  const b = D.Cam.vbitShape({ angle: ANGLE, tipR: R });
  const rT = R * Math.cos(HALF), zT = R * (1 - Math.sin(HALF));
  near(b.rise(0), 0, 1e-12, 'the tip');
  near(b.rise(0.3), R - Math.sqrt(R * R - 0.09), 1e-12, 'on the ball');
  near(b.rise(rT), zT, 1e-12, 'where the cone meets it');
  near(b.rise(rT + 1e-6) - b.rise(rT), 1e-6 / Math.tan(HALF), 1e-9, 'the cone goes on at the ball’s own slope there');
  near(b.rise(3), zT + (3 - rT) / Math.tan(HALF), 1e-9, 'on the cone');
  for (const d of [0, 0.01, 0.05, zT, 0.5, 3, 12]) near(b.rise(b.reach(d)), d, 1e-9, 'rise(reach(' + d + '))');
  assert.equal(b.floorReach, 0, 'a ball touches a floor only at its centre');
  // a flat-tipped V-bit is as it always was
  const v = D.Cam.vbitShape({ angle: 60, tip: 0.4 }), t30 = Math.tan(Math.PI / 6);
  near(v.rise(1), (1 - 0.2) / t30, 1e-12); near(v.reach(2), 0.2 + 2 * t30, 1e-12); assert.equal(v.floorReach, 0.2);
});
test('a slot carved with it: as deep as the bit is when its sides touch both walls', () => {
  const b = D.Cam.vbitShape({ angle: ANGLE, tipR: R });
  for (const w of [0.6, 1, 2, 3]) {                          // narrower than the ball (0.6 mm), and wider
    const slot = [[0, 0], [40, 0], [40, w], [0, w]];
    const v = D.Cam.vcarve({ loops: [slot], angle: ANGLE, tipR: R, z0: 0, safeZ: 5, feed: 800, plunge: 300 });
    // (the engine lets the bit's side come within 0.002 mm of a wall: on a bit this narrow, that's 0.002 / tan 5.4°
    // = 0.02 mm of depth)
    near(v.depth, b.rise(w / 2), 0.002 / Math.tan(HALF) + 0.001, w + ' mm wide');
  }
});
test('cut in wood: nothing outside the outline is touched, the walls meet it at the surface, and a capped carve’s floor is flat', () => {
  const sq = [[0, 0], [20, 0], [20, 20], [0, 20]], deep = 2;
  const b = D.Cam.vbitShape({ angle: ANGLE, tipR: R }), edge = b.reach(deep);
  const v = D.Cam.vcarve({ loops: [sq], angle: ANGLE, tipR: R, maxDepth: deep, z0: 0, safeZ: 5, feed: 800, plunge: 300, clear: { toolDia: 3.175, allowance: edge } });
  const pk = D.Cam.pocket({ outline: sq, islands: [], toolDia: 3.175, stepover: 1.27, depth: deep, passDepth: deep, allowance: edge, z0: 0, safeZ: 5, feed: 800, plunge: 300, ramp: { length: 0 } });
  const box = { x0: -1, y0: -1, x1: 21, y1: 21, top: 0, bottom: -10 }, cell = 0.02;
  const sim = D.woodSim([{ moves: pk.moves, tool: { kind: 'flat', r: 3.175 / 2 } }, { moves: v.moves, tool: { kind: 'v', r: 3.175, half: HALF, tip: 0, tipR: R } }], box, cell);
  let outside = 0, past = 0, high = 0, wallTop = 0;
  for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) {
    const x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell, z = sim.z[j * sim.nx + i];
    const inside = x > 0 && x < 20 && y > 0 && y < 20, w = inside ? Math.min(x, y, 20 - x, 20 - y) : -1;
    if (!inside){ if (Math.min(Math.abs(x), Math.abs(y), Math.abs(x - 20), Math.abs(y - 20)) > 0.05 && z < -0.001) outside++; continue; }
    if (z < -deep - 0.001) past = Math.max(past, -deep - z);
    if (w > edge + 0.2) high = Math.max(high, z + deep);
    if (w > 0.1 && w < 0.12) wallTop = Math.max(wallTop, -z);   // just in from the outline: barely cut
  }
  assert.equal(outside, 0, 'nothing outside the square');
  assert.equal(past, 0, 'nothing below the floor');
  assert.ok(high < 0.05, 'the floor flat, to within 0.05 mm (a ball leaves only shallow scallops): ' + high.toFixed(3));
  assert.ok(wallTop < 1.3, 'the walls rise steeply to meet the outline at the surface: ' + wallTop.toFixed(3) + ' mm down, 0.1 mm in');
  assert.equal(sim.rapidsIn, 0);
});
test('the preview’s bit is the engine’s bit', () => {
  const tool = { kind: 'v', r: 3.175, half: HALF, tip: 0, tipR: R }, b = D.Cam.vbitShape({ angle: ANGLE, tipR: R });
  for (const d of [0, 0.2, 0.5, 0.78, 1, 2, 3]) near(D.woodEdge(tool, d), b.rise(d), 1e-9, 'rise at ' + d);
  for (const z of [0, 0.01, 0.05, 1, 5]) near(D.woodReach(tool, z), Math.min(3.175, b.reach(z)), 1e-9, 'reach at ' + z);
  // and the 3D picture of it: round its ball to where the cone meets it, then up the cone; every point on the bit
  const pts = plain(D.woodBitShape(tool, 12)), body = pts.slice(0, -2);
  near(body[8][0], R * Math.cos(HALF), 1e-9, 'the ball ends where the cone meets it');
  body.forEach((p) => near(p[1], b.rise(p[0]), 1e-9, 'a point at ' + p[0].toFixed(3) + ' from the axis'));
  near(body.at(-1)[0], Math.min(3.175, b.reach(12 + 3)), 1e-9, 'as wide as it could cut in 12 mm material (and 3 mm above), as a V-bit is drawn');
});

test('a flat or ball tip never cuts past the outline, even climbing to a corner of an outline made of short straight pieces', () => {
  // a circle as 48 straight pieces: at each corner the path climbs to the outline and back. Straight up, a curved
  // tip cut past the wall, 0.7 mm past a letter with this bit; it now follows the bit's shape on the way.
  const n = 48, circ = Array.from({ length: n }, (_, k) => [20 + 15 * Math.cos(k / n * 2 * Math.PI), 20 + 15 * Math.sin(k / n * 2 * Math.PI)]);
  const inside = (x, y) => Math.hypot(x - 20, y - 20) < 15 * Math.cos(Math.PI / n) - 0.03;   // inside every flat piece, less the cells' width
  for (const [what, opts, tool] of [['a tapered ball nose', { angle: ANGLE, tipR: R, maxDepth: 6 }, { kind: 'v', r: 3.175, half: HALF, tip: 0, tipR: R }],
                                    ['a 60° bit with a 0.4 mm flat tip', { angle: 60, tip: 0.4, maxDepth: 3 }, { kind: 'v', r: 4, half: Math.PI / 6, tip: 0.4 }]]) {
    const v = D.Cam.vcarve(Object.assign({ loops: [circ], z0: 0, safeZ: 5, feed: 800, plunge: 300 }, opts));
    const box = { x0: 3, y0: 3, x1: 37, y1: 37, top: 0, bottom: -30 }, cell = 0.05;
    const sim = D.woodSim([{ moves: plain(v.moves), tool }], box, cell);
    let past = 0;
    for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.nx; i++) {
      const x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell;
      if (Math.hypot(x - 20, y - 20) > 15.03 && sim.z[j * sim.nx + i] < -0.01) past++;
    }
    assert.equal(past, 0, what + ': ' + past + ' cells cut outside the circle');
  }
});
test('Preview in wood: the lowest a bit cuts a spot on a sloping move, worked out, is what a fine search finds', () => {
  // every kind of pointed or round bit, on 3000 random moves and spots, against 4000 places along each move
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tools = [{ kind: 'v', r: 6, half: Math.PI / 6, tip: 0 }, { kind: 'v', r: 6, half: Math.PI / 4, tip: 0.6 }, { kind: 'v', r: 3.175, half: HALF, tip: 0, tipR: R },
                 { kind: 'v', r: 4, half: 15 * Math.PI / 180, tip: 0, tipR: 1.5 }, { kind: 'ball', r: 3 }];
  let worst = 0, cases = 0;
  for (let n = 0; n < 3000; n++) {
    const tool = tools[n % tools.length], a = [rnd() * 10, rnd() * 10, -rnd() * 8], b = [rnd() * 10, rnd() * 10, -rnd() * 8], c = [rnd() * 10, rnd() * 10];
    if (n % 7 === 0) { b[0] = a[0] + rnd() * 0.3; b[1] = a[1] + rnd() * 0.3; }                // short, steep moves too
    const got = D.woodLowest(tool, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1]);
    let brute = Infinity;
    for (let k = 0; k <= 4000; k++) { const t = k / 4000, e = D.woodEdge(tool, Math.hypot(c[0] - a[0] - (b[0] - a[0]) * t, c[1] - a[1] - (b[1] - a[1]) * t)); if (e !== Infinity) brute = Math.min(brute, a[2] + (b[2] - a[2]) * t + e); }
    if (brute === Infinity) { assert.equal(got, Infinity); continue; }
    cases++;
    assert.ok(got <= brute + 1e-6, 'never shallower than the search: ' + got + ' against ' + brute);
    worst = Math.max(worst, brute - got);
  }
  assert.ok(cases > 1000, String(cases));
  assert.ok(worst < 0.02, 'and deeper only by what the search’s 4000 steps miss between them: ' + worst.toFixed(5));
});
test('Preview in wood: a V-bit running down a slope cuts beside its path as deep as it really does', () => {
  // a 60° bit from the surface down to 10 mm deep over 10 mm: a spot 1 mm to the side of the path is cut deepest some
  // way past where the path passes nearest it (where the bit is lower), not at that nearest point
  const tool = { kind: 'v', r: 50, half: Math.PI / 6, tip: 0 }, t30 = Math.tan(Math.PI / 6);
  const sim = D.woodSim([{ moves: [{ g: 0, x: 0, y: 0, z: 0 }, { g: 1, x: 10, y: 0, z: -10 }], tool }], { x0: -1, y0: -3, x1: 12, y1: 3, top: 0, bottom: -20 }, 0.05);
  const at = (x, y) => sim.z[Math.floor((y + 3) / 0.05) * sim.nx + Math.floor((x + 1) / 0.05)];
  // exact: the lowest of (tip height) + (the cone's height at that distance), along the move
  const exact = (x, y) => { let best = 0; for (let k = 0; k <= 100000; k++) { const t = k / 100000, d = Math.hypot(x - 10 * t, y); best = Math.min(best, -10 * t + d / t30); } return best; };
  for (const [x, y] of [[3.025, 1.025], [6.025, 2.025], [9.525, 0.525]]) near(at(x, y), exact(x, y), 0.01, 'at ' + x + ', ' + y);
  // and the old way, at the nearest point, would have said much less there
  assert.ok(exact(3.025, 1.025) < -3.025 + 1.025 / t30 - 0.1);
});

// ---- in Design ----
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 19, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 10, y: 10, w: 40, h: 40, layer: 'L1' }]; D.DOC.toolpaths = []; D.DOC.tpGroups = [];
  D.TOOLLIB_TEST = { source: { file: 'tools.vtdb', importedAt: 1 }, machines: [{ id: 'M1', name: 'XXL' }], materials: [], tree: [],
    tools: [{ id: 'tbn', name: 'TBN1-32 Tapered Ball Nose (5.4°, Tip 0.03125 - 1/4")', type: 5, typeName: 'Tapered Ball Nose', units: 'in', diameter: 0.25,
              angle: ANGLE, tipRadius: 0.03125, flutes: 2, numbers: {}, cuts: [], notes: '' },
            { id: 'v60', name: '60 Deg V-Groove', type: 3, typeName: 'V-Bit', units: 'in', diameter: 0.25, angle: 60, flutes: 3, numbers: {}, cuts: [], notes: '' }] };
  D.run("TOOLLIB = TOOLLIB_TEST; UICFG.libMachine = 'M1'; 1");
}
function carve(toolId) {
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'vcarve', 'change');
  D.run(`cutUseTool('${toolId}'); cutRender(); 1`);
  set('cutVcMax', 3);
  D.CUT.toolChosen = true; D.cutApply();
  return plain(D.run('tpList()')).at(-1);
}
test('choosing a tapered ball nose from the library: its ball’s radius, in millimetres, and the Tip box says so', () => {
  setup();
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'vcarve', 'change');
  D.run("cutUseTool('tbn'); cutRender(); 1");
  assert.equal(D.CUT.vBall, true); near(D.CUT.vTipR, R, 1e-4, 'tip radius'); assert.equal(D.CUT.vTip, 0); assert.equal(D.CUT.vAngle, ANGLE);
  assert.equal(D.document.getElementById('cutVcTipLbl').textContent, 'Tip radius');
  D.run("cutUseTool('v60'); cutRender(); 1");
  assert.equal(D.CUT.vBall, false); assert.equal(D.document.getElementById('cutVcTipLbl').textContent, 'Tip');
  D.run('cutClose(); 1');
});
test('its V-carve is carved with the ball, keeps it through the editor, and says so on its card', () => {
  setup();
  const tp = carve('tbn');
  assert.equal(tp.vBall, true); near(tp.vTipR, R, 1e-4);
  const b = D.Cam.vbitShape({ angle: ANGLE, tipR: tp.vTipR });   // (the library's 1/32 in, to 4 places of a mm)
  near(tp.vcDepth, 3, 1e-6, 'capped at 3 mm');
  // the floor starts where the ball’s side meets the walls at 3 mm: not 3 x tan(5.4°) as a sharp V-bit’s would
  const clr = plain(D.run('tpList()')).find((t) => t.clearFor === tp.id);
  near(clr.allowance, b.reach(3), 1e-9, 'the clearing pocket stands off by where the bit meets the walls');
  assert.ok(Math.abs(clr.allowance - 3 * Math.tan(HALF)) > 0.05);
  // edited (the feed changed) and updated: still a tapered ball nose
  D.run(`cutOpen(tpList().filter(function (t) { return t.id === '${tp.id}'; })[0]); 1`);
  set('cutFeed', 900); D.CUT.toolChosen = true; D.cutApply();
  const after = plain(D.run('tpList()')).find((t) => t.id === tp.id);
  assert.equal(after.vBall, true); near(after.vTipR, R, 1e-4);
  assert.deepEqual(after.moves.map((m) => [m.x, m.y, m.z]), tp.moves.map((m) => [m.x, m.y, m.z]), 'not a move different');
  const rows = D.run(`tpRows(tpList().filter(function(t){ return t.id === '${tp.id}'; })[0]).map(function(r){ return r.join(': '); }).join(' / ')`);
  assert.match(rows, /Carve: 10\.8° tapered ball nose \(0\.79 mm tip radius\), 3\.00 mm deep at most \(capped\)/);
  assert.doesNotMatch(rows, /Shapes/, 'a V-carve’s card has no Shapes line');
  // carved with the ball: the moves are the engine's with this tip radius, and not a sharp V-bit's of the same angle
  const loops = plain(D.run(`tpOutlinesById(tpList().filter(function (t) { return t.id === '${tp.id}'; })[0].ents).map(function (o) { return o.loop; })`));
  // (as Design asks for it: in its passes, flattening what its clearing pocket leaves)
  const opts = { loops, angle: ANGLE, z0: 0, safeZ: 6, feed: 900, plunge: tp.plunge, maxDepth: 3, passDepth: tp.step > 0 ? tp.step : 0,
    clear: { toolDia: clr.dia, allowance: clr.allowance } };
  const zs = (mv) => mv.filter((m) => m.z !== undefined).map((m) => +m.z.toFixed(6));
  const ball = plain(D.Cam.vcarve(Object.assign({ tipR: tp.vTipR }, opts)).moves), sharp = plain(D.Cam.vcarve(opts).moves);
  assert.deepEqual(zs(after.moves).slice(0, 400), zs(ball).slice(0, 400), 'the ball’s depths');
  assert.notDeepEqual(zs(ball).slice(0, 400), zs(sharp).slice(0, 400), 'which aren’t a sharp V-bit’s');
});
test('an inlay made with a tapered ball nose: both its V-carves are carved with the ball, and its clearing stands off to suit', () => {
  for (const half of ['pocket', 'plug']) {
    setup();
    D.SEL = [0]; D.cutOpen(null); set('cutType', 'inlay', 'change');
    D.run(`cutUseTool('tbn'); CUT.inlayHalf = '${half}'; CUT.inlayD = 4; CUT.inlayS = 2; CUT.inlayM = 4; CUT.toolChosen = true; inlayApply(); 1`);
    const l = plain(D.run('tpList()')), v = l.find((t) => t.side === 'vcarve'), c = l.find((t) => t.side === 'pocket');
    assert.equal(v.vBall, true, half); near(v.vTipR, 0.7938, 1e-4);
    const b = D.Cam.vbitShape({ angle: ANGLE, tipR: v.vTipR });
    near(c.allowance, b.reach(half === 'plug' ? 2 : 4), 1e-9, half + ': where the ball’s side meets the walls at the floor');
  }
});
test('a V-carve made before, with a tapered ball nose from the library, takes its ball when it’s recalculated', () => {
  setup();
  const tp = plain(D.run(`(function(){ var tp = {id: 'old', name: 'V-carve', side: 'vcarve', type: 'vcarve', ents: [entId(DOC.ents[0])], vAngle: ${ANGLE}, vTip: 0, vcMax: 0,
    dia: 6.35, step: 0, feed: 800, plunge: 300, safeZ: 6, rpm: 18000, tabPts: {}, hidden: false, exclude: false, through: false, toolChosen: true, toolId: 'tbn'};
    tpGenerate(tp); return tp; })()`));
  assert.equal(tp.vBall, true); near(tp.vTipR, 0.7938, 1e-4);
  // (uncapped, a 40 mm square goes absurdly deep with a bit this narrow: 204 mm with its ball, 212 as a sharp V-bit; the
  // corners are walked in steps, so it's a little short of the exact middle)
  near(tp.vcDepth, D.Cam.vbitShape({ angle: ANGLE, tipR: tp.vTipR }).rise(20), 1, 'as deep as the ball nose goes');
  assert.ok(tp.vcDepth < 20 / Math.tan(HALF) - 5, 'not as deep as a sharp V-bit would');
  const v = plain(D.run(`(function(){ var tp = {id: 'v', name: 'V', side: 'vcarve', type: 'vcarve', ents: [entId(DOC.ents[0])], vAngle: 60, vTip: 0, vcMax: 0,
    dia: 6.35, step: 0, feed: 800, plunge: 300, safeZ: 6, rpm: 18000, tabPts: {}, hidden: false, exclude: false, through: false, toolChosen: true, toolId: 'v60'};
    tpGenerate(tp); return tp; })()`));
  assert.equal(v.vBall, undefined, 'a V-bit’s is left alone');
});
test('a drilling card has no Shapes line either (it had one since beta.44, by mistake)', () => {
  setup();
  D.DOC.ents = [{ t: 'circle', cx: 30, cy: 30, r: 3, layer: 'L1' }];
  const rows = D.run(`(function(){ var tp = {id: 'd1', name: 'Holes', side: 'drill', type: 'drill', ents: [entId(DOC.ents[0])], depth: 5, step: 5, dia: 6, feed: 300, plunge: 300, peck: 0,
    safeZ: 6, rpm: 18000, tabPts: {}, hidden: false, exclude: false, through: false, toolChosen: true}; tpGenerate(tp); return tpRows(tp).map(function (r) { return r[0]; }).join(','); })()`);
  assert.doesNotMatch(rows, /Shapes/); assert.match(rows, /Holes/);
});
