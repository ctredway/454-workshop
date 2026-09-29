// Ramp in (profiles and pockets): each pass slopes down into the material along the cut, over a length you
// can set, or plunges straight down with the ramp off. Toolpaths made through Design's own editor, with the
// CAM engine loaded (test/harness.mjs).   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const plain = (v) => JSON.parse(JSON.stringify(v));
const RECT = { t: 'rect', x: 20, y: 20, w: 80, h: 50 };

function make(type, o = {}) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [Object.assign({ layer: 'L1' }, RECT)]; D.DOC.toolpaths = [];
  const set = (id, v, ev) => { const el = D.document.getElementById(id); if (!el) throw new Error('no field ' + id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  D.SEL = [0]; D.cutOpen(null);
  set('cutType', type, 'change');
  D.CUT.toolChosen = true; set('cutDia', o.dia || 6.35);
  set('cutDepth', 3); set('cutStep', 1);
  if (o.ramp) set('cutRamp', o.ramp, 'change');
  if (o.rampLen !== undefined) set('cutRampLen', o.rampLen);
  D.CUT.toolChosen = true;
  const hint = D.document.getElementById('cutHint').textContent;
  D.cutApply();
  const tp = D.tpList().at(-1);
  if (!tp) throw new Error('no toolpath: ' + hint);
  return { tp, hint };
}
// cutting moves as segments: {xy: length across, dz: change in depth, z0, z1}
function segs(tp) {
  let x = 0, y = 0, z = 0; const out = [];
  for (const m of tp.moves) {
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
    if (m.g === 1) out.push({ xy: Math.hypot(nx - x, ny - y), dz: nz - z, z0: z, z1: nz });
    x = nx; y = ny; z = nz;
  }
  return out;
}
// the sloped moves (down and across at once), and how far across they go in all
const sloped = (tp) => segs(tp).filter((s) => s.xy > 1e-6 && s.dz < -1e-6);
const slopedLength = (tp) => sloped(tp).reduce((a, s) => a + s.xy, 0);
const deepest = (tp) => Math.min(...segs(tp).map((s) => s.z1));

test('a profile ramps in by default, over 4 times the cutter’s diameter, on every pass', () => {
  const { tp, hint } = make('outside');
  assert.equal(D.tpRamp(tp), 6.35 * 4);
  assert.ok(Math.abs(slopedLength(tp) - 3 * 25.4) < 0.05, 'three passes, each sloping down over 25.4 mm: ' + slopedLength(tp));
  assert.ok(Math.abs(deepest(tp) - -3) < 1e-6, 'reaches the depth, and no deeper');
  assert.match(hint, /Each pass ramps in over 25\.40 mm/);
});
test('the default cuts exactly as before (an older toolpath, with no ramp setting, is unchanged)', () => {
  const { tp } = make('outside');
  const older = Object.assign({}, plain(tp)); delete older.rampOff; delete older.rampLen;
  const before = plain(D.tpGenerate(Object.assign({}, older, { rampLen: Math.max(4, older.dia * 4) })).moves);   // what it was given before
  assert.deepEqual(plain(D.tpGenerate(older).moves), before);
});
test('Plunge (ramp off): every pass goes straight down, to the depth and no deeper', () => {
  const { tp, hint } = make('outside', { ramp: 'off' });
  assert.equal(tp.rampOff, true);
  assert.equal(sloped(tp).length, 0, 'nothing slopes down');
  const downs = segs(tp).filter((s) => s.dz < -1e-6);
  assert.ok(downs.length >= 3 && downs.every((s) => s.xy < 1e-9), 'straight down, pass by pass');
  assert.ok(Math.abs(deepest(tp) - -3) < 1e-6);
  assert.match(hint, /plunges straight down/);
  assert.equal(D.tpRows(tp).find((r) => r[0] === 'Entry')[1], 'straight plunge', 'the card and job sheet say so');
});
test('a length you type is used, and kept with the toolpath', () => {
  const { tp, hint } = make('outside', { rampLen: 10 });
  assert.equal(tp.rampLen, 10);
  assert.ok(Math.abs(slopedLength(tp) - 30) < 0.05, 'three passes over 10 mm: ' + slopedLength(tp));
  assert.match(hint, /ramps in over 10\.00 mm/);
  assert.equal(D.tpRows(tp).find((r) => r[0] === 'Entry')[1], 'ramps in over 10.00 mm');
});
test('left empty, the length follows the cutter', () => {
  const { tp } = make('outside', { dia: 3.175 });
  assert.equal(tp.rampLen, null);
  assert.equal(D.tpRamp(tp), 12.7);
  const small = make('outside', { dia: 0.8 }).tp;
  assert.equal(D.tpRamp(small), 4, 'never less than 4 mm');
});
test('an inside profile, and one on the line, ramp too, and can plunge', () => {
  for (const side of ['inside', 'on']) {
    assert.ok(slopedLength(make(side).tp) > 1, side + ' ramps');
    assert.equal(sloped(make(side, { ramp: 'off' }).tp).length, 0, side + ' plunges');
  }
});
test('pockets: ramp in by default, plunge with the ramp off, both clearing styles', () => {
  const p = make('pocket').tp;
  assert.ok(slopedLength(p) > 1, 'offset rings ramp');
  assert.equal(sloped(make('pocket', { ramp: 'off' }).tp).length, 0, 'offset rings plunge');
  D.document.getElementById('cutClear');
  const rasterOn = (ramp) => {
    D.DOC.toolpaths = [];
    const r = make('pocket', ramp ? { ramp } : {}).tp;
    r.pocketClear = 'raster'; D.tpGenerate(r);
    return r;
  };
  assert.ok(slopedLength(rasterOn()) > 1, 'raster ramps');
  assert.equal(sloped(rasterOn('off')).length, 0, 'raster plunges');
  assert.ok(Math.abs(deepest(p) - -3) < 1e-6);
});
test('drilling, chamfers and V-carves don’t offer it', () => {
  for (const type of ['drill', 'chamfer', 'vcarve']) {
    D.DOC.ents = [Object.assign({ layer: 'L1' }, RECT)]; D.SEL = [0]; D.cutOpen(null);
    const el = D.document.getElementById('cutType'); el.value = type; el.dispatchEvent(new D.Event('change', { bubbles: true }));
    assert.equal(D.document.getElementById('cutRampRow').hidden, true, type);
    D.cutClose();
  }
});
test('opening a toolpath again shows its ramp as it was set', () => {
  const { tp } = make('outside', { ramp: 'off' });
  D.cutOpen(tp);
  assert.equal(D.document.getElementById('cutRamp').value, 'off');
  D.cutClose();
  D.DOC.toolpaths = [];
  const t2 = make('outside', { rampLen: 12 }).tp;
  D.cutOpen(t2);
  assert.equal(D.document.getElementById('cutRampLen').value, '12.00');
  D.cutClose();
});
