// A new toolpath's tabs start as the last ones used (number, length, thickness, shape), remembered between
// sessions; before any, 4 tabs, 4 mm long, 1.5 mm thick, flat. Editing a toolpath shows its own. (cutTabsStart,
// cutTabsRemember in toolpath-editor.js.) On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const tick = (id, on) => { if (el(id).checked !== on) el(id).click(); };
function drawing() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 200, h: 120, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 100, h: 50, layer: 'L1' }]; D.DOC.toolpaths = [];
}
// a new profile, as the form shows it
function fresh() {
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'outside', 'change');
  return { count: +el('cutTabs').value, len: D.lenIn(el('cutTabLen').value), thk: D.lenIn(el('cutTabThk').value), style: el('cutTabStyle').value };
}
function make(tabs) {
  fresh(); D.CUT.toolChosen = true; set('cutDia', 6.35); tick('cutThrough', true);
  tick('cutTabsOn', true); set('cutTabs', tabs.count); set('cutTabLen', tabs.len); set('cutTabThk', tabs.thk); set('cutTabStyle', tabs.style, 'change');
  el('cutTabSpread').click();
  if (tabs.off) tick('cutTabsOn', false);                        // typed in, then switched off
  D.CUT.toolChosen = true; D.cutApply(); D.cutClose && D.cutClose();
  return D.tpList().at(-1);
}
const START = { count: 4, len: 4, thk: 1.5, style: 'flat' };
const MINE = { count: 6, len: 8, thk: 2, style: '3d' };

test('before any tabs are used: 4 tabs, 4 mm long, 1.5 mm thick, flat', () => {
  drawing(); delete D.UICFG.tabs;
  assert.deepEqual(fresh(), START);
});
test('the next new toolpath starts with the tabs last used, and a toolpath without tabs doesn’t change them', () => {
  drawing(); delete D.UICFG.tabs;
  const tp = make(MINE);
  assert.ok(tp.tabsOn && tp.tabThk === 2 && tp.tabStyle === '3d', 'made with them');
  assert.deepEqual(fresh(), MINE);
  const off = make({ count: 2, len: 3, thk: 1, style: 'flat', off: true });
  assert.ok(!off.tabsOn, 'made without tabs');
  assert.deepEqual(fresh(), MINE, 'still, after one without tabs');
});
test('remembered between sessions', () => {
  drawing(); delete D.UICFG.tabs; make(MINE);
  delete D.UICFG.tabs; D.uiCfgLoad();                          // as when Design starts again
  assert.deepEqual(fresh(), MINE);
});
test('editing a toolpath shows its own tabs, not the remembered ones', () => {
  drawing(); delete D.UICFG.tabs;
  const tp = make({ count: 3, len: 5, thk: 1, style: 'flat' });
  make(MINE);
  D.cutOpen(tp);
  assert.equal(D.lenIn(el('cutTabThk').value), 1); assert.equal(D.lenIn(el('cutTabLen').value), 5); assert.equal(el('cutTabStyle').value, 'flat');
});
test('nonsense remembered is ignored: the starting tabs instead', () => {
  drawing();
  D.UICFG.tabs = { count: 999, len: -3, thk: 'thick', style: 'wavy' };
  assert.deepEqual(fresh(), START);
});
