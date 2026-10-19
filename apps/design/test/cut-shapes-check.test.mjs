// Create and Update check the shapes first, as VCarve does on saving a toolpath (toolpath-editor.js cutApply,
// cutShapesUsable), on the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const toasts = () => [...D.document.querySelectorAll('.toast')].map((t) => t.textContent);
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 10, y: 10, w: 40, h: 30, layer: 'L1' }, { t: 'line', x1: 60, y1: 10, x2: 90, y2: 40, layer: 'L1' },
                { t: 'poly', pts: [[100, 10], [130, 10], [130, 40]], closed: false, layer: 'L1' }, { t: 'circle', cx: 160, cy: 30, r: 10, layer: 'L1' }];
  D.DOC.toolpaths = [];
  D.document.querySelectorAll('.toast').forEach((t) => t.remove());
}
function create(sel, side = 'pocket') {
  D.SEL = sel; D.cutOpen(null); set('cutType', side, 'change'); D.CUT.toolChosen = true; set('cutDia', 6); set('cutDepth', 3);
  D.CUT.toolChosen = true; D.cutApply();
  return plain(D.DOC.toolpaths);
}
test('nothing selected: it says to select the shapes, makes nothing, and the editor stays open', () => {
  setup();
  assert.equal(create([]).length, 0);
  assert.ok(toasts().some((t) => /^Select the shapes to cut first/.test(t)), toasts().join(' | '));
  assert.ok(D.CUT, 'still open');
  D.cutClose();
});
test('only open shapes for a pocket: it says why, and makes nothing', () => {
  setup();
  assert.equal(create([1, 2]).length, 0);
  assert.ok(toasts().some((t) => /^None of the 2 shapes can be used.*They’re open \(a line, an arc or an open outline\): a pocket needs closed shapes\. .*Nothing was made\./.test(t)), toasts().join(' | '));
  D.cutClose();
});
test('some usable: it’s made from them, and the message says how many were left out and why', () => {
  setup();
  const tps = create([0, 1, 3]);
  assert.equal(tps.length, 1);
  assert.ok(toasts().some((t) => /^1 of 3 shapes left out.*1 of the 3 shapes is open/.test(t)), toasts().join(' | '));
});
test('all usable: no warning', () => {
  setup();
  create([0, 3]);
  assert.ok(!toasts().some((t) => /left out|can’t be used|can be used/.test(t)), toasts().join(' | '));
});
