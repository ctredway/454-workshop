// Passes (toolpath-passes.js, and the engine's own count in cam.js): how many passes a profile or pocket takes and
// how deep each goes, shown in the toolpath editor as you change the depth or Per pass, with a Passes box to
// divide the depth evenly. What's shown must be what's cut, so the depths are checked against the engine's moves.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.VIEW.scale = 4;
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b) => assert.ok(a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9), JSON.stringify(a) + ' against ' + JSON.stringify(b));

// small shapes: the test harness runs the cutting engine many times slower than the app does
function drawing(units = 'mm') {
  if (D.CUT) D.cutClose();
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 20, y: 20, w: 16, h: 12, layer: 'L1'}], name: 'Cabinet'};
    UNDO.length = 0; SEL = []; CUTSEL = null; UICFG.stockUnits = '${units}'; UICFG.tpPanel = true; renderToolpathPanel(); 1`);
}
function open(type, depth, step) {
  D.SEL = [0]; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', D.UICFG.stockUnits === 'in' ? 0.125 : 3.175);
  set('cutDepth', depth); set('cutStep', step); D.CUT.toolChosen = true; D.cutRender();
}
const list = () => el('cutPassList').textContent;

// ---- the sums ----
test('a depth goes down in steps of Per pass, the last pass taking what’s left', () => {
  near(plain(D.tpPassDepths(6.35, 1.524)), [1.524, 3.048, 4.572, 6.096, 6.35]);
  near(plain(D.tpPassDepths(6, 2)), [2, 4, 6]);
  near(plain(D.tpPassDepths(5, 10)), [5]);
  assert.equal(D.tpPassCount(6.35, 1.524), 5);
  assert.equal(D.tpPassCount(3.03, 1), 4, 'a little over three: the small fourth pass is needed');
  assert.deepEqual(plain(D.tpPassDepths(0, 1)), []);
  assert.deepEqual(plain(D.tpPassDepths(5, 0)), []);
  assert.equal(D.tpPassCount(0, 1), 0);
});
test('3/4 in at 1/4 in a pass is three passes, not four (the division comes out a hair over three)', () => {
  assert.equal(19.05 / 6.35 > 3, true, 'the sum that used to add a pass');
  assert.equal(D.tpPassCount(19.05, 6.35), 3);
  assert.equal(D.Cam.passCount(19.05, 6.35), 3);
  assert.equal(D.tpPassCount(9.525, 3.175), 3);
  assert.equal(D.tpPassCount(19.05, 1.5875), 12);
});
test('Design’s count and depths are the engine’s, over many depths and steps', () => {
  for (const d of [0.5, 1, 3, 3.03, 5.004, 6, 6.35, 9.525, 10, 12.2, 12.7, 18.8, 19.05, 25.4])
    for (const s of [0.1, 0.25, 0.5, 0.635, 1, 1.27, 1.5875, 2, 2.54, 3.175, 6.35, 12.7]) {
      assert.equal(D.tpPassCount(d, s), D.Cam.passCount(d, s), d + ' at ' + s);
      assert.deepEqual(plain(D.tpPassDepths(d, s)), plain(D.Cam.passDepths(d, s)), d + ' at ' + s);
    }
});
test('what’s listed is what’s cut: the depths the engine’s moves go to, for a profile and a pocket', () => {
  drawing();
  for (const [type, depth, step] of [['outside', 6.35, 1.5], ['inside', 5, 2], ['pocket', 4, 1.5], ['outside', 19.05, 6.35]]) {
    open(type, depth, step);
    el('cutRamp').value = 'off'; el('cutRamp').dispatchEvent(new D.Event('change', { bubbles: true }));   // straight down, so each pass is at one depth
    D.cutApply();
    const tp = D.tpList().at(-1), levels = [...new Set(Array.from(tp.moves).filter((m) => m.g === 1 && m.z !== undefined).map((m) => +(-m.z).toFixed(6)))].sort((a, b) => a - b);
    near(levels, plain(D.tpPassDepths(D.tpDepth(tp), tp.step)).map((x) => +x.toFixed(6)));
    // and each depth is cut once: as many moves at the last depth as at the first (the engine used to go round
    // the last depth a second time when the division came out a hair over a whole number)
    const at = (lv) => Array.from(tp.moves).filter((m) => m.g === 1 && m.z !== undefined && Math.abs(-m.z - lv) < 1e-6).length;
    if (type !== 'pocket') assert.equal(at(levels[levels.length - 1]), at(levels[0]), type + ' ' + depth + ' at ' + step + ': the last depth is cut once');
    D.run('DOC.toolpaths = []; 1');
  }
});

// ---- the editor's row ----
test('the editor shows the count and every depth, and they follow the depth and Per pass as they’re changed', () => {
  drawing();
  open('outside', 6, 2);
  assert.equal(el('cutPassRow').hidden, false);
  assert.equal(el('cutPasses').value, '3');
  assert.equal(list(), '2.00 · 4.00 · 6.00 mm');
  set('cutStep', 1.5);
  assert.equal(el('cutPasses').value, '4');
  assert.equal(list(), '1.50 · 3.00 · 4.50 · 6.00 mm');
  set('cutDepth', 7);
  assert.equal(el('cutPasses').value, '5');
  assert.equal(list(), '1.50 · 3.00 · 4.50 · 6.00 · 7.00 mm');
  D.cutClose();
});
test('a through cut counts the material and the overcut', () => {
  drawing();
  open('outside', 3, 4);
  el('cutThrough').checked = true; el('cutThrough').dispatchEvent(new D.Event('change', { bubbles: true }));
  assert.equal(D.tpDepth(D.CUT), 12.2);
  assert.equal(el('cutPasses').value, '4');
  assert.equal(list(), '4.00 · 8.00 · 12.00 · 12.20 mm');
  D.cutClose();
});
test('many passes: the first three and the last two', () => {
  drawing();
  open('pocket', 10, 0.5);
  assert.equal(el('cutPasses').value, '20');
  assert.equal(list(), '0.50 · 1.00 · 1.50 … 9.50 · 10.00 mm');
  D.cutClose();
});
test('typing a number of passes divides the depth evenly, and Per pass changes to match', () => {
  drawing();
  open('outside', 6.35, 1.5);
  assert.equal(el('cutPasses').value, '5');
  set('cutPasses', 4);
  assert.equal(el('cutStep').value, '1.59', 'rounded up, never down: four passes of 1.58 would stop short');
  assert.equal(D.CUT.step, 1.59);
  assert.equal(D.tpPassCount(D.tpDepth(D.CUT), D.CUT.step), 4);
  assert.equal(list(), '1.59 · 3.18 · 4.77 · 6.35 mm');
  set('cutPasses', 3);
  assert.equal(el('cutStep').value, '2.12');
  assert.equal(list(), '2.12 · 4.24 · 6.35 mm');
  set('cutPasses', 1);
  assert.equal(el('cutStep').value, '6.35');
  assert.equal(list(), '6.35 mm');
  for (const bad of ['', '0', '-2', 'abc', '9999']) { set('cutPasses', bad); assert.equal(el('cutStep').value, '6.35', 'ignored: ' + bad); }
  D.cutClose();
});
test('for every depth and count, the passes asked for are the passes cut, and they’re even to within a hundredth', () => {
  drawing();
  open('outside', 6, 2);
  for (const depth of [3, 5, 6.35, 10, 12.2, 19.05]) for (let n = 1; n <= 12; n++) {
    set('cutDepth', depth); set('cutPasses', n);
    const ds = plain(D.tpPassDepths(D.tpDepth(D.CUT), D.CUT.step));
    assert.equal(ds.length, n, depth + ' in ' + n);
    assert.ok(Math.abs(ds[ds.length - 1] - depth) < 1e-9, 'reaches the depth');
    const each = ds.map((d, i) => d - (i ? ds[i - 1] : 0));
    assert.ok(Math.max(...each) - Math.min(...each) < 0.01 * n + 1e-9, depth + ' in ' + n + ': ' + each.map((x) => x.toFixed(3)).join(' '));
  }
  D.cutClose();
});
test('a last pass that takes much less than the others is pointed out, with an offer to make them even', () => {
  drawing();
  open('outside', 6.35, 1.5);                              // 1.5 × 4 = 6, leaving 0.35
  assert.equal(el('cutPassNote').hidden, false);
  assert.equal(el('cutPassNote').textContent, 'The last pass takes only 0.35 mm.');
  assert.equal(el('cutPassEven').hidden, false);
  assert.equal(el('cutPassEven').textContent, 'Make them even: 5 of 1.27');
  el('cutPassEven').click();
  assert.equal(el('cutStep').value, '1.27');
  assert.equal(list(), '1.27 · 2.54 · 3.81 · 5.08 · 6.35 mm');
  assert.equal(el('cutPassNote').hidden, true, 'nothing to point out now');
  assert.equal(el('cutPassEven').hidden, true);
  set('cutStep', 2);                                       // 2, 4, 6, 6.35: thin again
  assert.equal(el('cutPassNote').hidden, false);
  set('cutStep', 3.5);                                     // 3.5, 6.35: the last takes 2.85, more than half
  assert.equal(el('cutPassNote').hidden, true);
  D.cutClose();
});
test('in inches: three decimals, and 3/4 in at 1/4 in is three passes', () => {
  drawing('in');
  open('outside', 0.75, 0.25);
  assert.equal(el('cutPasses').value, '3');
  assert.equal(list(), '0.250 · 0.500 · 0.750 in');
  set('cutPasses', 4);
  assert.equal(el('cutStep').value, '0.188');
  assert.equal(el('cutPasses').value, '4');
  D.cutClose();
  D.run(`UICFG.stockUnits = 'mm'; 1`);
});
test('the row is for profiles and pockets: other kinds of cut go down their own way', () => {
  drawing();
  open('outside', 6, 2);
  const shown = {};
  for (const o of el('cutType').options) { set('cutType', o.value, 'change'); shown[o.value] = !el('cutPassRow').hidden; }
  assert.deepEqual(shown, { outside: true, inside: true, on: true, pocket: true, drill: false, chamfer: false, vcarve: false, inlay: false });
  D.cutClose();
});
test('with no depth yet, the row says so and the box waits', () => {
  drawing();
  D.SEL = [0]; D.cutOpen(null);
  assert.equal(list(), 'set the depth first');
  assert.equal(el('cutPasses').disabled, true);
  assert.equal(el('cutPasses').value, '');
  set('cutDepth', 3);
  assert.equal(el('cutPasses').disabled, false);
  assert.equal(el('cutPasses').value, '3');
  D.cutClose();
});
test('the card and the “toolpath created” message count the same way', () => {
  drawing('in');
  open('outside', 0.75, 0.25);
  D.cutApply();
  const row = [...el('tpList').querySelectorAll('.tpSet dd')][0].textContent;
  assert.match(row, /in 3 passes$/, row);
  D.run(`DOC.toolpaths = []; UICFG.stockUnits = 'mm'; 1`);
  drawing();
  open('outside', 2, 2);
  D.cutApply();
  assert.match([...el('tpList').querySelectorAll('.tpSet dd')][0].textContent, /in 1 pass$/);
});
