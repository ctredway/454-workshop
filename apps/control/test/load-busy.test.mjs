// Loading a big G-code file shows a "Loading…" panel first (wiring.js loadTextShown), so the app doesn't look
// frozen while the file is read and drawn; a small one loads straight away.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../src/js/wiring.js', import.meta.url), 'utf8');
// just the panel's part of wiring.js, run with a page of stand-ins
const part = src.slice(src.indexOf('var LOAD_SHOW_FROM'), src.indexOf('function loadText(text, name){'));
function page() {
  const els = { loadBusy: { hidden: true }, loadBusyName: { textContent: '' } };
  const C = vm.createContext({ setTimeout, loaded: [], seenHidden: [], notes: [], document: { getElementById: (id) => els[id] } });
  C.uiNote = (title, body) => C.notes.push(title + ': ' + body);
  C.loadText = (text, name) => { C.loaded.push(name); C.seenHidden.push(els.loadBusy.hidden); };
  vm.runInContext(part, C);
  return { C, els };
}
test('a big file: the panel names it, is up while it loads, and goes when it’s loaded', async () => {
  const { C, els } = page();
  C.loadTextShown('G1 X1\n'.repeat(200000), 'Spikes.gcode');
  assert.equal(els.loadBusy.hidden, false, 'up at once');
  assert.equal(els.loadBusyName.textContent, 'Loading Spikes.gcode…');
  assert.deepEqual(C.loaded, [], 'and the file is read after, once the panel has been drawn');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(C.loaded, ['Spikes.gcode']); assert.deepEqual(C.seenHidden, [false], 'the panel was up while it loaded');
  assert.equal(els.loadBusy.hidden, true, 'and gone after');
});
test('a small file loads straight away, with no panel', () => {
  const { C, els } = page();
  C.loadTextShown('G21\nG1 X10 F500\n', 'square.nc');
  assert.deepEqual(C.loaded, ['square.nc']); assert.deepEqual(C.seenHidden, [true]);
});
test('if loading fails, the panel still goes, and it says why', async () => {
  const { C, els } = page();
  C.loadText = () => { throw new Error('bad file'); };
  C.loadTextShown('x'.repeat(2e6), 'bad.nc');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(els.loadBusy.hidden, true);
  assert.deepEqual(C.notes, ['Couldn’t load bad.nc: bad file']);
});
