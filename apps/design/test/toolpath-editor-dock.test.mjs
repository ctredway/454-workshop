// The toolpath editor takes over the Toolpaths panel while it's open (toolpath-editor.js, toolpath-panel.js), its
// settings sit under headings, and a help box says what the setting you're on does (toolpath-help.js).
// On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.VIEW.scale = 4;
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const fire = (node, type) => node.dispatchEvent(new D.Event(type, { bubbles: true, cancelable: true }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const pan = () => el('tpPanel');
const rows = () => [...el('cutPanel').querySelectorAll('.mirSlot')];
const shownRows = () => rows().filter((r) => !r.hidden && !r.parentNode.hidden).map((r) => r.getAttribute('data-help'));
const groups = () => [...el('cutPanel').querySelectorAll('.cutGroup')].filter((g) => !g.hidden).map((g) => g.querySelector('h4').textContent);
const help = () => el('cutHelpT').textContent;
const lit = () => rows().filter((r) => r.classList.contains('helpOn')).map((r) => r.getAttribute('data-help'));

// small shapes: the test harness runs the cutting engine many times slower than the app does
function drawing() {
  if (D.CUT) D.cutClose();
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 20, y: 20, w: 16, h: 12, layer: 'L1'}, {t: 'circle', cx: 80, cy: 30, r: 5, layer: 'L1'}], name: 'Cabinet'};
    UNDO.length = 0; SEL = []; CUTSEL = null; UICFG.stockUnits = 'mm'; UICFG.tpPanel = true; renderToolpathPanel(); 1`);
}
function open(type) {
  D.SEL = [0]; D.cutOpen(null);
  if (type) set('cutType', type, 'change');
  D.CUT.toolChosen = true; set('cutDia', 3.175); set('cutDepth', 2); D.CUT.toolChosen = true; D.cutRender();
}

test('the editor is part of the Toolpaths panel, and has it to itself while it’s open', () => {
  drawing();
  assert.equal(el('cutPanel').parentNode, pan(), 'inside the panel, not over the drawing');
  assert.equal(pan().classList.contains('editing'), false);
  open();
  assert.equal(el('cutPanel').hidden, false);
  assert.equal(pan().classList.contains('editing'), true);
  D.cutClose();
  assert.equal(el('cutPanel').hidden, true);
  assert.equal(pan().classList.contains('editing'), false, 'the list is back when it closes');
  open(); D.cutApply();
  assert.equal(D.tpList().length, 1);
  assert.equal(pan().classList.contains('editing'), false, 'and after Create');
  // the tests' page applies no styles, so this reads the rules
  const css = fs.readFileSync(new URL('../src/styles/design.css', import.meta.url), 'utf8');
  assert.match(css, /#tpPanel\.editing #tpBody,#tpPanel\.editing #tpStrip\{display:none\}/, 'the list is hidden while editing');
  assert.match(css, /#tpPanel\.editing\{width:min\(440px,36vw\)/, 'and the panel is wider');
});
test('with the panel folded away: the editor still opens, and the panel folds away again after', () => {
  drawing();
  D.run('UICFG.tpPanel = false; renderToolpathPanel(); 1');
  assert.equal(pan().classList.contains('collapsed'), true);
  open();
  assert.equal(pan().classList.contains('collapsed'), false);
  assert.equal(pan().classList.contains('editing'), true);
  D.cutClose();
  assert.equal(pan().classList.contains('collapsed'), true);
  assert.equal(D.UICFG.tpPanel, false, 'the choice to fold it wasn’t changed');
});
test('each kind of cut shows its own headings, and none with nothing under it', () => {
  drawing();
  const want = {
    outside: ['Tool', 'Depth', 'Passes', 'Entry and exit', 'Tabs'],
    inside: ['Tool', 'Depth', 'Passes', 'Entry and exit', 'Tabs'],
    on: ['Tool', 'Depth', 'Entry and exit', 'Tabs'],
    pocket: ['Tool', 'Depth', 'Passes', 'Entry and exit'],
    drill: ['Tool', 'Depth'],
    chamfer: ['Tool', 'Depth'],
    vcarve: ['Tool', 'Depth'],
    inlay: ['Tool', 'Depth'],
  };
  open();
  for (const [type, heads] of Object.entries(want)) {
    set('cutType', type, 'change'); D.CUT.toolChosen = true; D.cutRender();
    assert.deepEqual(groups(), heads, type);
    for (const g of el('cutPanel').querySelectorAll('.cutGroup'))
      assert.equal(g.hidden, ![...g.querySelectorAll('.mirSlot')].some((r) => !r.hidden), type + ': ' + g.querySelector('h4').textContent);
  }
  D.cutClose();
});
test('every setting has help written for it', () => {
  drawing();
  const keys = rows().map((r) => r.getAttribute('data-help'));
  assert.equal(keys.length, 26);
  assert.equal(new Set(keys).size, 26, 'each row its own');
  for (const k of keys) {
    const h = k === 'type' ? null : D.CUT_HELP[k];
    if (k !== 'type') assert.ok(h && h[0] && h[1].length > 30, k);
  }
  assert.deepEqual(plain(Object.keys(D.CUT_HELP)).sort(), keys.filter((k) => k !== 'type').sort(), 'and no help for a setting that isn’t there');
  const types = [...el('cutType').options].map((o) => o.value);
  assert.deepEqual(plain(Object.keys(D.CUT_HELP_TYPE)).sort(), types.sort(), 'and every kind of cut is explained');
});
test('the help starts on the kind of cut and follows it', () => {
  drawing();
  open();
  assert.equal(help(), 'Profile, outside');
  assert.match(el('cutHelpB').textContent, /^Cuts round the outside of the line/);
  assert.deepEqual(lit(), []);
  set('cutType', 'pocket', 'change');
  assert.equal(help(), 'Pocket');
  set('cutType', 'vcarve', 'change');
  assert.equal(help(), 'V-carve');
  D.cutClose();
});
test('clicking or tabbing into a setting shows its help and marks its row', () => {
  drawing();
  open();
  fire(el('cutStep'), 'focusin');
  assert.equal(help(), 'Per pass');
  assert.equal(el('cutHelpB').textContent, D.CUT_HELP.step[1]);
  assert.deepEqual(lit(), ['step']);
  fire(el('cutThrough'), 'click');                         // a box inside the Cut depth row
  assert.equal(help(), 'Cut depth');
  assert.deepEqual(lit(), ['depth'], 'one row at a time');
  fire(el('cutShapes'), 'click');
  assert.equal(help(), 'Shapes');
  fire(el('cutType'), 'focusin');
  assert.equal(help(), 'Profile, outside', 'the Cut row explains the kind chosen');
  assert.deepEqual(lit(), ['type']);
  fire(el('cutHint'), 'click');                            // not a setting: nothing changes
  assert.equal(help(), 'Profile, outside');
  D.cutRender();
  assert.equal(help(), 'Profile, outside', 'and it stays through a redraw');
  D.cutClose();
});
test('the help leaves a setting that the new kind of cut doesn’t have', () => {
  drawing();
  open();
  fire(el('cutLead'), 'focusin');
  assert.equal(help(), 'Lead in and out');
  set('cutType', 'pocket', 'change');                      // pockets have no lead
  assert.equal(el('cutLeadRow').hidden, true);
  assert.equal(help(), 'Pocket');
  assert.deepEqual(lit(), []);
  fire(el('cutStepover'), 'focusin');
  assert.equal(help(), 'Stepover');
  set('cutType', 'pocket', 'change');                      // still there: it stays
  assert.equal(help(), 'Stepover');
  fire(el('cutStep'), 'focusin');                          // a setting every profile and pocket has
  assert.equal(help(), 'Per pass');
  D.cutClose();
  open();
  assert.equal(help(), 'Profile, outside', 'and a newly opened editor starts on the kind of cut again');
  D.cutClose();
});
test('tabs ticked on a profile don’t leave tab rows on a pocket', () => {
  drawing();
  open();
  el('cutTabsOn').checked = true; fire(el('cutTabsOn'), 'change'); D.cutRender();
  assert.ok(shownRows().includes('tabSize') && shownRows().includes('tabShape'), 'a profile with tabs shows their size and shape');
  set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; D.cutRender();
  for (const k of ['tabs', 'tabTools', 'tabSize', 'tabShape']) assert.ok(!shownRows().includes(k), k);
  assert.ok(!groups().includes('Tabs'));
  set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; D.cutRender();
  assert.ok(shownRows().includes('tabSize'), 'and back on a profile they return');
  D.cutClose();
});
