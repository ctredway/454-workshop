// Save G-code as one file per bit (tpExport, tpBitFiles, gcodeSaveMany in gcode-export.js): the job split where
// the bit changes, in cutting order, each file a whole job for its bit, read back by 454 Control's own parser.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDesign } from './harness.mjs';
const require = createRequire(import.meta.url);
const { parseGcode } = require('../../../packages/gcode/src/parser.cjs');

const D = loadDesign({ cam: true });
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
const later = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function job(kinds) {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1' }, { t: 'rect', x: 40, y: 35, w: 40, h: 25, layer: 'L1' }];
  D.DOC.toolpaths = []; D.DOC.name = 'Sign';
  for (const [sel, type, dia] of kinds) {
    D.SEL = [sel]; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', dia);
    if (type === 'vcarve') set('cutVcAngle', 60); else if (type === 'outside') tick('cutThrough', true); else set('cutDepth', 3);
    D.CUT.toolChosen = true; D.cutApply();
  }
  return D.tpJob();
}
const THREE = [[1, 'pocket', 6.35], [1, 'vcarve', 12.7], [0, 'outside', 6.35]];
// the cutting moves (feeds, not rapids) with their ends, as Control reads them
const cutsOf = (gc) => parseGcode(gc).segs.filter((s) => !s.rapid).map((s) => [s.x0, s.y0, s.z0, s.x1, s.y1, s.z1].map((v) => +v.toFixed(4)).join(' '));

test('split where the bit changes, in cutting order: a bit used again later gets its own file', () => {
  const j = job(THREE);
  const order = D.tpList().map((tp) => tp.dia);
  const files = D.tpBitFiles(j);
  // one file per run of the same bit, in the order they're cut
  const runs = order.filter((d, i) => i === 0 || d !== order[i - 1]).length;
  assert.equal(files.length, runs);
  assert.ok(files.length >= 2, 'more than one bit: ' + order.join(', '));
  files.forEach((f, i) => {
    assert.match(f.name, new RegExp('^Sign - ' + (i + 1) + ' of ' + files.length + ' - T' + f.tool + ' .+\\.nc$'));
    const r = parseGcode(f.gc);
    assert.deepEqual(r.issues.filter((x) => x.sev === 'err'), [], f.name + ': no errors');
    assert.equal(r.tools.length, 1, f.name + ': one bit'); assert.equal(r.tools[0].tool, f.tool);
    assert.ok(f.gc.includes(';File ' + (i + 1) + ' of ' + files.length + ': T' + f.tool), f.name + ': says which file it is');
    assert.ok(f.gc.indexOf(';BETA') >= 0 && f.gc.indexOf(';BETA') < f.gc.indexOf(';File '), 'the beta note first');
  });
});
test('together, the files cut exactly what the one file cuts, move for move, in the same order', () => {
  const j = job(THREE);
  const whole = cutsOf(j.gc), parts = Array.from(D.tpBitFiles(j)).flatMap((f) => cutsOf(f.gc));
  assert.ok(whole.length > 100);
  assert.deepEqual(parts, whole);
});
test('Windows can save them: no \\ / : * ? " < > | in a name', () => {
  const j = job(THREE);
  j.parts[0].toolName = '1/4" down-cut: "Amana" <46202>'; j.parts.forEach((p) => { if (p.tool === j.parts[0].tool) p.toolName = j.parts[0].toolName; });
  for (const f of D.tpBitFiles(j)) assert.doesNotMatch(f.name, /[\\/:*?"<>|]/, f.name);
});
test('one bit: one file, without asking', async () => {
  const j = job([[1, 'pocket', 6.35], [0, 'outside', 6.35]]);
  assert.equal(D.tpBitFiles(j).length, 1);
  let saved = null;
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  D.tpExport(); await later();
  assert.ok(el('dlgModal').hidden, 'no question');
  assert.equal(saved, j.gc, 'the one file');
  delete D.window.showSaveFilePicker;
});

// a folder the "person" picks: files in a Map
function folder(existing = {}) {
  const files = new Map(Object.entries(existing));
  D.window.showDirectoryPicker = async () => ({ name: 'Jobs',
    getFileHandle: async (n, o) => { if (!files.has(n) && !(o && o.create)) throw Object.assign(new Error('no'), { name: 'NotFoundError' });
      return { createWritable: async () => { let t = ''; return { write: async (s) => { t += s; }, close: async () => { files.set(n, t); } }; } }; } });
  return files;
}
test('more than one bit: asks, and One file per bit saves them all into the folder picked', async () => {
  const j = job(THREE), want = D.tpBitFiles(j), files = folder();
  D.tpExport(); await later();
  assert.ok(!el('dlgModal').hidden, 'asks');
  assert.equal(el('dlgAlt').textContent, 'One file per bit'); assert.ok(!el('dlgAlt').hidden);
  assert.equal(el('dlgOk').textContent, 'One file', 'one file is the default (Enter)');
  for (const f of want) assert.ok(el('dlgBody').textContent.includes(f.name), 'lists ' + f.name);
  el('dlgAlt').click(); await later(80);
  assert.deepEqual([...files.keys()], Array.from(want, (f) => f.name));
  for (const f of want) assert.equal(files.get(f.name), f.gc);
  delete D.window.showDirectoryPicker;
});
test('asks before replacing files already in the folder, and Cancel leaves them alone', async () => {
  const j = job(THREE), want = D.tpBitFiles(j), files = folder({ [want[1].name]: 'old' });
  D.tpExport(); await later(); el('dlgAlt').click(); await later(80);
  assert.ok(!el('dlgModal').hidden && /Replace/.test(el('dlgTitle').textContent), 'asks: ' + el('dlgTitle').textContent);
  assert.ok(el('dlgBody').textContent.includes(want[1].name));
  assert.ok(el('dlgAlt').hidden, 'no second choice on this question');
  el('dlgCancel').click(); await later(80);
  assert.equal(files.size, 1); assert.equal(files.get(want[1].name), 'old', 'left alone');
  // and Replace writes them all
  D.tpExport(); await later(); el('dlgAlt').click(); await later(80); el('dlgOk').click(); await later(80);
  assert.equal(files.size, want.length); assert.equal(files.get(want[1].name), want[1].gc);
  delete D.window.showDirectoryPicker;
});
test('One file saves the whole job as one file, as before', async () => {
  const j = job(THREE); let saved = null, name = null;
  D.window.showSaveFilePicker = async (o) => ({ name: (name = o.suggestedName), createWritable: async () => ({ write: async (t) => { saved = t; }, close: async () => {} }) });
  D.tpExport(); await later(); el('dlgOk').click(); await later(80);
  assert.equal(name, 'Sign.nc'); assert.equal(saved, j.gc);
  delete D.window.showSaveFilePicker;
});
