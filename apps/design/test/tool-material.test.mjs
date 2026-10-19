// The tool library's material: picked by clicking it in a tool's Feeds and speeds list, not from a dropdown
// (tool-library-dialog.js), on the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const cut = (material, feed) => ({ machine: 'M1', material, feed, plunge: feed / 2, rpm: 18000, stepdown: 3, stepover: 2.5, rateUnits: 1, lengthUnits: 'mm' });
function setup() {
  D.TOOLLIB_TEST = {
    source: { file: 'tools.vtdb', importedAt: Date.now() }, machines: [{ id: 'M1', name: 'Shapeoko XXL' }],
    materials: [{ id: 'oak', name: 'Oak' }, { id: 'mdf', name: 'MDF' }, { id: 'pine', name: 'Pine' }],
    tree: [], tools: [{ id: 't1', name: '1/4" end mill', type: 1, typeName: 'End Mill', units: 'mm', diameter: 6.35, flutes: 2, numbers: { M1: 1 }, notes: '',
      cuts: [cut('oak', 1000), cut('mdf', 1800), cut('gone', 900)] }],
  };
  D.run("TOOLLIB = TOOLLIB_TEST; UICFG.libMachine = 'M1'; UICFG.libMaterial = 'oak'; LIBUI.sel = 't1'; LIBUI.edit = null; LIBUI.draft = null; LIBUI.q = ''; libOpen(); 1");
}
const rows = () => [...D.document.querySelectorAll('#libDetail table tr')].slice(1);
const rowOf = (name) => rows().find((r) => r.querySelector('td').textContent === name);

test('there’s no material dropdown: every material is a row of the tool’s feeds and speeds, the chosen one marked', () => {
  setup();
  assert.equal(D.document.getElementById('libMaterial'), null);
  assert.deepEqual(rows().map((r) => r.querySelector('td').textContent), ['Oak', 'MDF', 'Pine', 'Any']);
  assert.equal(rowOf('Oak').classList.contains('on'), true); assert.equal(rowOf('Oak').getAttribute('aria-pressed'), 'true');
  assert.equal(rowOf('MDF').classList.contains('on'), false);
  assert.match(rowOf('Pine').textContent, /no feeds and speeds yet/, 'a material the tool has none for says so');
  assert.equal(rowOf('Any').classList.contains('pick'), false, 'feeds for a material the library doesn’t know can’t be chosen');
  assert.match(D.document.getElementById('libPickNote').textContent, /feeds for Oak$/);
});
test('clicking a row chooses that material, for the toolpaths made next; Enter on a row does too, and doesn’t pick the tool', () => {
  setup();
  rowOf('MDF').click();
  assert.equal(D.run('UICFG.libMaterial'), 'mdf');
  assert.equal(rowOf('MDF').classList.contains('on'), true); assert.equal(rowOf('Oak').classList.contains('on'), false);
  assert.equal(D.run("libCutFor(libTool('t1'), 'M1', UICFG.libMaterial).feed"), 1800, 'the feeds a toolpath takes are MDF’s');
  let picked = null;
  D.__pick = (id) => { picked = id; };
  D.run("libOpen('t1', function (id) { __pick(id); }); 1");
  const ev = new D.Event('keydown', { bubbles: true }); Object.defineProperty(ev, 'key', { value: 'Enter' });
  rowOf('Pine').dispatchEvent(ev);
  assert.equal(D.run('UICFG.libMaterial'), 'pine');
  assert.equal(picked, null, 'the tool isn’t chosen by that Enter');
  assert.equal(D.document.getElementById('libModal').hidden, false);
  D.run('libCloseDlg(); 1');
});
test('editing a tool: the materials are buttons above its feeds, and switching keeps what was typed for the one left', () => {
  setup();
  D.run("LIBUI.edit = 't1'; libRender(); 1");
  const buttons = () => [...D.document.querySelectorAll('#libDetail .libMatRow button')];
  assert.deepEqual(buttons().map((b) => b.textContent), ['Oak', 'MDF', 'Pine']);
  assert.equal(buttons()[0].getAttribute('aria-pressed'), 'true');
  D.document.getElementById('lcFeed').value = '1234';
  buttons()[1].click();
  assert.equal(D.run('UICFG.libMaterial'), 'mdf');
  assert.equal(D.document.getElementById('lcFeed').value, '1800', 'MDF’s feeds shown');
  buttons()[0].click();
  assert.equal(D.document.getElementById('lcFeed').value, '1234', 'Oak’s, as typed, kept in the draft');
  buttons()[2].click();
  assert.match(D.document.getElementById('libDetail').textContent, /No feeds and speeds for Pine yet\./);
  D.run('LIBUI.edit = null; LIBUI.draft = null; 1');
});
