// Cleaning up after a larger bit (rest machining): cam.js's pocket({rest}) and Design's Clean up after, on the
// real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
// The cut is checked with Preview in wood's simulation (wood-preview.js), cell by cell, against a full pocket
// with the small bit: the larger bit plus the clean-up must clear everything the small bit alone would, and
// never cut anywhere it wouldn't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const BIG = 12.7, SMALL = 3.175;

function compare(outline, islands = []) {
  const base = { outline, islands, depth: 6, passDepth: 2, z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: 8 } };
  const big = D.Cam.pocket(Object.assign({}, base, { toolDia: BIG, stepover: BIG * 0.4 }));
  const full = D.Cam.pocket(Object.assign({}, base, { toolDia: SMALL, stepover: SMALL * 0.4 }));
  const rest = D.Cam.pocket(Object.assign({}, base, { toolDia: SMALL, stepover: SMALL * 0.4, rest: { toolDia: BIG, level: BIG / 2 + 0.01 } }));
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]), cell = 0.05;
  const box = { x0: Math.min(...xs) - 3, y0: Math.min(...ys) - 3, x1: Math.max(...xs) + 3, y1: Math.max(...ys) + 3, top: 0, bottom: -12 };
  const flat = (d) => ({ kind: 'flat', r: d / 2 });
  const sFull = D.woodSim([{ moves: full.moves, tool: flat(SMALL) }], box, cell);
  const sBig = D.woodSim([{ moves: big.moves, tool: flat(BIG) }], box, cell);
  const sBoth = D.woodSim([{ moves: big.moves, tool: flat(BIG) }, { moves: rest.moves, tool: flat(SMALL) }], box, cell);
  const loops = [outline, ...islands];
  const wall = (x, y) => { let d = Infinity; for (const L of loops) for (let k = 0; k < L.length; k++) { const a = L[k], b = L[(k + 1) % L.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t)); } return d; };
  const out = { bigLeft: 0, missed: 0, missedFar: 0, over: 0, overFar: 0 };
  for (let j = 0; j < sFull.ny; j++) for (let i = 0; i < sFull.nx; i++) {
    const k = j * sFull.nx + i, x = box.x0 + (i + 0.5) * cell, y = box.y0 + (j + 0.5) * cell;
    if (sFull.z[k] < -5.99 && sBig.z[k] > -5.99) out.bigLeft++;
    if (sFull.z[k] < -5.99 && sBoth.z[k] > -5.99) { out.missed++; if (wall(x, y) > 0.02) out.missedFar++; }
    if (sBoth.z[k] < sFull.z[k] - 0.01) { out.over++; if (wall(x, y) > 0.02) out.overFar++; }
  }
  const len = (mv) => { let L = 0, x = null, y = null; for (const m of mv) { const nx = m.x ?? x, ny = m.y ?? y; if (m.g === 1 && x !== null) L += Math.hypot(nx - x, ny - y); x = nx; y = ny; } return L; };
  out.share = len(rest.moves) / len(full.moves); out.rapidsIn = sBoth.rapidsIn; out.runs = rest.restRuns;
  return out;
}
const circle = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, k) => { const a = -k / n * 2 * Math.PI; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

for (const [name, outline, islands] of [
  ['a rectangle: the four corners', [[0, 0], [60, 0], [60, 40], [0, 40]], []],
  ['a slot too narrow for the larger bit: all of it', [[0, 0], [60, 0], [60, 40], [33, 40], [33, 60], [27, 60], [27, 40], [0, 40]], []],
  ['round an island: nothing extra', [[0, 0], [60, 0], [60, 40], [0, 40]], [circle(30, 20, 6)]],
  ['a triangle’s sharp corners', [[0, 0], [60, 0], [30, 50]], []],
  ['an octagon’s wide corners: thin slivers, about 0.5 mm', Array.from({ length: 8 }, (_, k) => [30 + 30 * Math.cos(k * Math.PI / 4 + Math.PI / 8), 30 + 30 * Math.sin(k * Math.PI / 4 + Math.PI / 8)]), []],
]) {
  test('clean-up after a 12.7 mm bit with a 3.175 mm one, ' + name + ': everything cleared, nothing extra, about a quarter of the cutting', () => {
    const r = compare(outline, islands);
    assert.ok(r.bigLeft > 100, 'the larger bit really did leave some: ' + r.bigLeft + ' cells');
    assert.equal(r.missedFar, 0, 'nothing left that the small bit alone would clear (more than 0.02 mm from a wall): ' + r.missed + ' cells in all');
    assert.equal(r.overFar, 0, 'nothing cut that the small bit alone wouldn’t');
    assert.ok(r.share < 0.35, 'a fraction of a full pocket’s cutting: ' + r.share.toFixed(3));
    assert.equal(r.rapidsIn, 0, 'no rapid moves into wood');
    assert.ok(r.runs > 0);
  });
}
test('the clean-up steps down in passes, as its own per-pass depth says, not all at once', () => {
  const base = { outline: [[0, 0], [60, 0], [60, 40], [0, 40]], islands: [], depth: 6, passDepth: 2, z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: 8 } };
  const rest = D.Cam.pocket(Object.assign({}, base, { toolDia: SMALL, stepover: SMALL * 0.4, rest: { toolDia: BIG, level: BIG / 2 + 0.01 } }));
  let z = null; const levels = new Set(); let deepestFirst = null, lowestBefore = Infinity;
  for (const m of rest.moves) {
    const nz = m.z ?? z;
    if (m.g === 1 && m.x !== undefined && nz === z) { levels.add(+nz.toFixed(6)); if (deepestFirst === null) deepestFirst = nz; }
    if (deepestFirst === null && nz !== null) lowestBefore = Math.min(lowestBefore, nz);
    z = nz;
  }
  assert.ok(lowestBefore >= -2 - 1e-9, 'nothing deeper than the first pass before it is cut (the ramp in included): ' + lowestBefore);
  assert.deepEqual([...levels].sort((a, b) => b - a), [-2, -4, -6], 'cuts at 2, 4 and 6 mm');
  assert.equal(deepestFirst, -2, 'the first cutting is at the first pass’s depth');
});
test('a larger bit that reaches everywhere leaves nothing to clean up: no cutting', () => {
  const circ = circle(30, 30, 25, 96);
  const base = { outline: circ, islands: [], depth: 6, passDepth: 2, z0: 0, safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: { length: 8 } };
  const rest = D.Cam.pocket(Object.assign({}, base, { toolDia: SMALL, stepover: SMALL * 0.4, rest: { toolDia: BIG, level: BIG / 2 + 0.01 } }));
  assert.equal(rest.restRuns, 0);
  assert.equal(rest.moves.filter((m) => m.g === 1 && m.x !== undefined).length, 0, 'no cutting moves');
});

// ---- in Design: the setting, following the larger pocket, and saying when it can't ----
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
function make(sel, dia, o = {}) {
  D.SEL = sel; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', dia);
  if (o.depth) set('cutDepth', o.depth);
  if (o.rest !== undefined) set('cutRest', o.rest, 'change');
  D.CUT.toolChosen = true; D.cutApply();
  return D.tpList().at(-1);
}
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 120, h: 80, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 10, y: 10, w: 60, h: 40, layer: 'L1' }, { t: 'rect', x: 80, y: 10, w: 30, h: 30, layer: 'L1' }]; D.DOC.toolpaths = [];
}
test('Clean up after lists only larger bits’ pockets on the same shapes; the clean-up follows its depth and goes after it', () => {
  setup();
  const big = make([0], BIG, { depth: 6 });
  make([1], BIG, { depth: 4 });                                          // other shapes: not offered
  make([0], 2, { depth: 3 });                                            // a smaller bit: not offered for a 3.175 clean-up
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', SMALL);
  const opts = Array.from(D.document.getElementById('cutRest').options).map((o) => o.value);
  assert.deepEqual(opts, ['', big.id], 'nothing, or the 12.7 mm pocket on the same rectangle');
  assert.equal(D.document.getElementById('cutRestRow').hidden, false);
  set('cutRest', big.id, 'change');
  assert.equal(D.document.getElementById('cutDepth').disabled, true, 'the depth follows the larger pocket');
  assert.equal(D.document.getElementById('cutDepth').value, '6.00');
  assert.match(D.document.getElementById('cutHint').textContent, /Cleans up after “Pocket” \(12\.70 mm bit\): only its corners/);
  D.CUT.toolChosen = true; D.cutApply();
  const list = plain(D.run('tpList()')), clean = list.find((t) => t.restFrom === big.id);
  assert.ok(clean, 'made');
  assert.equal(clean.name, 'Pocket clean-up');
  assert.ok(list.findIndex((t) => t.id === clean.id) > list.findIndex((t) => t.id === big.id), 'after the larger pocket');
  assert.equal(D.run(`tpDepth(tpList().filter(function(t){ return t.restFrom; })[0])`), 6);
  assert.match(D.run(`tpRows(tpList().filter(function(t){ return t.restFrom; })[0]).map(function(r){ return r.join(': '); }).join(' / ')`), /Clearing: only what “Pocket” left/);
  assert.ok(!clean.warning, 'no warning: ' + clean.warning);
});
test('changing the larger pocket makes the clean-up out of date, and it follows; deleting it or unticking it is said', () => {
  const idOf = (f) => D.run(`tpList().filter(function(t){ return ${f}; })[0].id`);
  const cleanId = idOf('t.restFrom'), bigId = D.run(`tpList().filter(function(t){ return t.restFrom; })[0].restFrom`);
  const clean = () => D.run(`tpList().filter(function(t){ return t.id === '${cleanId}'; })[0]`);
  assert.equal(D.tpStale(clean()), false);
  D.run(`tpList().filter(function(t){ return t.id === '${bigId}'; })[0].depth = 8; 1`);
  assert.equal(D.tpStale(clean()), true, 'out of date when the larger pocket goes deeper');
  D.tpGenerate(clean());
  assert.equal(D.tpDepth(clean()), 8);
  const zs = clean().moves.filter((m) => m.z !== undefined).map((m) => m.z);
  assert.equal(Math.min(...zs), -8, 'and it cuts to 8 now');
  D.run(`tpList().filter(function(t){ return t.id === '${bigId}'; })[0].exclude = true; 1`);
  D.tpGenerate(clean());
  assert.match(clean().warning, /is unticked, so it won’t be cut/);
  D.run(`tpList().filter(function(t){ return t.id === '${bigId}'; })[0].exclude = false; 1`);
  const cutsBefore = clean().moves.length;
  // pointed at a pocket with a smaller bit: that can't be cleaned up after, so it clears the whole pocket
  D.run(`tpList().filter(function(t){ return t.id === '${bigId}'; })[0].dia = 2; 1`);
  D.tpGenerate(clean());
  assert.match(clean().warning, /doesn’t use a larger bit than this, so this clears the whole pocket/);
  assert.ok(clean().moves.length > cutsBefore * 2, 'a full pocket');
  D.run(`tpList().filter(function(t){ return t.id === '${bigId}'; })[0].dia = ${BIG}; 1`);
  D.run(`DOC.toolpaths = tpList().filter(function(t){ return t.id !== '${bigId}'; }); 1`);
  assert.equal(D.tpStale(clean()), true, 'out of date when the larger pocket goes');
  D.tpGenerate(clean());
  assert.match(clean().warning, /the larger bit’s pocket it cleaned up after is gone, so this clears the whole pocket/);
  assert.ok(clean().moves.length > cutsBefore * 2, 'and it does: a full pocket');
});
