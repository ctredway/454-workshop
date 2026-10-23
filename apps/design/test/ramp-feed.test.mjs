// Ramps at the cutting feed: a ramp goes as fast as the feed allows while the bit comes down no faster than the
// plunge rate; Ramp, slowly keeps the plunge rate all the way down. Only the speeds change, never the path.
// Toolpaths made through Design's own editor, and the CAM engine directly (test/harness.mjs).
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const plain = (v) => JSON.parse(JSON.stringify(v));
const RECT = { t: 'rect', x: 20, y: 20, w: 80, h: 50 };
const FEED = 1500, PLUNGE = 400;

function make(type, o = {}) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [Object.assign({ layer: 'L1' }, RECT)]; D.DOC.toolpaths = [];
  const set = (id, v, ev) => { const el = D.document.getElementById(id); if (!el) throw new Error('no field ' + id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  D.SEL = [0]; D.cutOpen(null);
  set('cutType', type, 'change');
  D.CUT.toolChosen = true; set('cutDia', 6.35);
  set('cutDepth', 3); set('cutStep', 1);
  if (o.clear) set('cutClear', o.clear, 'change');
  if (o.ramp) set('cutRamp', o.ramp, 'change');
  D.CUT.feed = FEED; D.CUT.plunge = PLUNGE; D.CUT.toolChosen = true;
  const hint = D.document.getElementById('cutHint').textContent;
  D.cutApply();
  const tp = D.tpList().at(-1);
  if (!tp) throw new Error('no toolpath: ' + hint);
  return { tp, hint };
}
// cutting moves as segments, each with its feed and how fast it comes down (mm/min)
function segs(moves) {
  let x = 0, y = 0, z = 0, f = 0; const out = [];
  for (const m of moves) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1) {
      f = m.f ?? f;
      const xy = Math.hypot(nx - x, ny - y), dz = nz - z, len = Math.hypot(xy, dz);
      out.push({ xy, dz, f, down: dz < 0 && len > 0 ? f * -dz / len : 0 });
    }
    x = nx; y = ny; z = nz;
  }
  return out;
}
const sloped = (moves) => segs(moves).filter((s) => s.xy > 1e-6 && s.dz < -1e-6);
// the bit never comes down faster than the plunge rate, and nothing goes slower than it or faster than the feed
function holds(moves, what) {
  const all = segs(moves);
  assert.ok(sloped(moves).length > 0, what + ': it ramps');
  for (const s of all) {
    assert.ok(s.down <= PLUNGE + 1e-6, what + ': comes down at ' + s.down.toFixed(1) + ' mm/min, over the plunge rate');
    assert.ok(s.f >= PLUNGE && s.f <= FEED, what + ': a move at F' + s.f);
  }
}
const noF = (moves) => plain(moves).map((m) => { delete m.f; return m; });
const minutes = (moves) => segs(moves).reduce((a, s) => a + Math.hypot(s.xy, s.dz) / s.f, 0);

for (const [type, clear] of [['outside'], ['inside'], ['pocket', 'offset'], ['pocket', 'raster']]) {
  const what = type + (clear ? ' (' + clear + ')' : '');
  test(what + ': ramps faster than the plunge rate by default, the bit coming down no faster than it', () => {
    const { tp, hint } = make(type, { clear });
    holds(tp.moves, what);
    assert.ok(sloped(tp.moves).some((s) => s.f > PLUNGE * 1.5), what + ': the ramp goes faster than the plunge rate');
    if (type !== 'pocket') assert.match(hint, /as fast as the feed allows/);
  });
  test(what + ': Ramp, slowly ramps at the plunge rate, and only the speeds differ from the default', () => {
    const fast = make(type, { clear }).tp, { tp, hint } = make(type, { clear, ramp: 'slow' });
    assert.equal(tp.rampSlow, true);
    assert.ok(sloped(tp.moves).every((s) => s.f === PLUNGE), what + ': every ramp move at the plunge rate');
    assert.deepEqual(noF(fast.moves), noF(tp.moves), what + ': the same path');
    assert.ok(minutes(fast.moves) < minutes(tp.moves), what + ': the default takes less time');
    if (type !== 'pocket') assert.match(hint, /at the plunge rate/);
  });
}
test('straight down is still at the plunge rate, and a gentle ramp at the full feed', () => {
  const r = D.Cam.profile({ outline: [[0, 0], [100, 0], [100, 60], [0, 60]], side: 'outside', toolDia: 6, depth: 2, passDepth: 1,
                            feed: FEED, plunge: PLUNGE, ramp: { length: 40 } });
  holds(r.moves, 'gentle');
  // 1 mm down over 40 mm: at the feed it comes down at 1500 / 40 = 37.5 mm/min, well under the plunge rate. (The
  // first move comes down from the safe height as well, so it's steeper and slower.)
  assert.ok(sloped(r.moves)[0].f < FEED, 'the first, from the safe height');
  assert.ok(sloped(r.moves).slice(1).every((s) => s.f === FEED), 'every other ramp move at the feed: ' + sloped(r.moves).map((s) => s.f));
  const p = D.Cam.profile({ outline: [[0, 0], [100, 0], [100, 60], [0, 60]], side: 'outside', toolDia: 6, depth: 2, passDepth: 1,
                            feed: FEED, plunge: PLUNGE, ramp: { length: 0 } });
  const downs = segs(p.moves).filter((s) => s.xy < 1e-9 && s.dz < 0);
  assert.ok(downs.length > 0 && downs.every((s) => s.f === PLUNGE), 'straight down at the plunge rate');
});
test('a steep ramp is held to the plunge rate coming down, and tabs in the ramp are still respected', () => {
  // 3 mm down over 4 mm: at the feed it would come down at 900 mm/min
  const o = { outline: [[0, 0], [100, 0], [100, 60], [0, 60]], side: 'outside', toolDia: 6, depth: 6, passDepth: 3,
              feed: FEED, plunge: PLUNGE, ramp: { length: 4 } };
  for (const shape of ['flat', '3d']) {
    const r = D.Cam.profile(Object.assign({}, o, { tabs: { length: 4, thickness: 2, shape, at: [[2, -3]] } }));
    holds(r.moves, 'steep, ' + shape + ' tabs');
    const slow = D.Cam.profile(Object.assign({}, o, { tabs: { length: 4, thickness: 2, shape, at: [[2, -3]] }, ramp: { length: 4, slow: true } }));
    assert.deepEqual(noF(r.moves), noF(slow.moves), shape + ' tabs: the same path');
  }
});
test('a feed no faster than the plunge rate changes nothing', () => {
  const o = { outline: [[0, 0], [100, 0], [100, 60], [0, 60]], side: 'outside', toolDia: 6, depth: 2, passDepth: 1,
              feed: 300, plunge: 400, ramp: { length: 10 } };
  assert.deepEqual(plain(D.Cam.profile(o).moves), plain(D.Cam.profile(Object.assign({}, o, { ramp: { length: 10, slow: true } })).moves));
});
test('Ramp, slowly is saved with the drawing and shown again in the editor', () => {
  const { tp } = make('outside', { ramp: 'slow' });
  const back = JSON.parse(JSON.stringify(tp));
  assert.equal(back.rampSlow, true);
  D.cutOpen(tp);
  assert.equal(D.document.getElementById('cutRamp').value, 'slow');
  D.document.getElementById('cutRamp').value = 'on';
  D.document.getElementById('cutRamp').dispatchEvent(new D.Event('change', { bubbles: true }));
  assert.equal(D.CUT.rampSlow, undefined);
});
