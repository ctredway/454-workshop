// The ribbon across the top of the drawing: the drawing tools in tabs (Home, Draw, Modify, Arrange, Guides), each in
// labelled sections with the tool's name under its icon, foldable to its tabs. It took over from the left panel
// (Clint, 2026-11-21, after a mock-up), and the Layers moved to a tab of the right-hand panel. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadDesign } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh(saved) {
  const D = loadDesign({ start: false });
  if (saved) D.localStorage.setItem('d454DesignUI', JSON.stringify(saved));
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  D.$ = (id) => D.document.getElementById(id);
  D.saved = () => JSON.parse(D.localStorage.getItem('d454DesignUI') || '{}');
  D.shownTab = () => [...D.document.querySelectorAll('.rbTab')].filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.dataset.tab);
  D.shownPane = () => [...D.document.querySelectorAll('.rbPane')].filter((p) => !p.hidden).map((p) => p.dataset.tab);
  D.ribbon = () => D.$('toolPanel').classList;
  return D;
}
const send = (D, target, type, props = {}) => { const e = new D.Event(type, { bubbles: true }); Object.assign(e, props); target.dispatchEvent(e); };

test('five tabs across the top, opening on Draw the first time', () => {
  const D = fresh();
  assert.deepEqual([...D.document.querySelectorAll('.rbTab')].map((b) => b.textContent), ['Home', 'Draw', 'Modify', 'Arrange', 'Guides']);
  assert.deepEqual(D.shownTab(), ['draw']);
  assert.deepEqual(D.shownPane(), ['draw'], 'only that tab’s tools are shown');
  assert.deepEqual([...D.$('rbPane-draw').querySelectorAll('.rbCap')].map((c) => c.firstChild.textContent), ['Pick', 'Shapes', 'Text', 'Dimensions']);
  assert.equal(D.$('toolPanel').querySelector('.tGroup, .sideTabs'), null, 'the left panel’s groups and tabs are gone');
});

test('every toolbar button is in the ribbon once, with its name under it, its id or tool, and its full title', () => {
  const D = fresh();
  const btns = plain(D.run('PANEL_BTNS')), names = plain(D.run('RIBBON_NAMES'));
  const inRibbon = plain(D.run('RIBBON_TABS')).flatMap((t) => t.secs.flatMap((s) => s.btns));
  assert.deepEqual([...inRibbon].sort(), Object.keys(btns).sort(), 'all of them, and nothing else');
  assert.equal(new Set(inRibbon).size, inRibbon.length, 'none twice');
  for (const k of inRibbon) {
    const b = btns[k];
    const els = b.id ? D.document.querySelectorAll('#toolPanel #' + b.id) : D.document.querySelectorAll('#toolPanel button.tool[data-tool="' + b.tool + '"]');
    assert.equal(els.length, 1, k + ' is there once');
    assert.ok(els[0].title.startsWith(b.title.split(' — ')[0]), k + ' keeps its title');   // (Recover says what there is to recover)
    assert.ok(names[k], k + ' has a short name');
    assert.equal(els[0].querySelector('.rbName').textContent, names[k], k + '’s name is under its icon');
    assert.ok(els[0].querySelector('svg'), k + ' keeps its icon');
  }
});

test('a tab clicked shows its tools, and is remembered', () => {
  const D = fresh();
  D.$('rbTab-modify').click();
  assert.deepEqual(D.shownTab(), ['modify']);
  assert.deepEqual(D.shownPane(), ['modify']);
  assert.equal(D.saved().ribbonTab, 'modify');
  send(D, D.$('rbTab-modify'), 'keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(D.shownTab(), ['arrange'], 'the arrow keys move along the tabs');
  send(D, D.$('rbTab-arrange'), 'keydown', { key: 'ArrowRight', preventDefault() {} });
  send(D, D.$('rbTab-guides'), 'keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(D.shownTab(), ['home'], 'and round from the last to the first');
});

test('a drawing tool picked in the ribbon is the tool, lit up; one picked by its key lights its button too', () => {
  const D = fresh();
  D.$('toolPanel').querySelector('button.tool[data-tool="rect"]').click();
  assert.equal(D.run('TOOL'), 'rect');
  assert.deepEqual([...D.document.querySelectorAll('#toolPanel button.tool.active')].map((b) => b.dataset.tool), ['rect']);
  D.run("setTool('line'); 1");
  assert.deepEqual([...D.document.querySelectorAll('#toolPanel button.tool.active')].map((b) => b.dataset.tool), ['line']);
  D.run("setTool('array'); 1");
  assert.deepEqual([...D.document.querySelectorAll('#toolPanel button.tool.active')].map((b) => b.dataset.tool), ['array'],
    'on another tab, as its key or the Tools menu picks it');
});

test('the arrow at the right folds it to its tabs and opens it again; a double-click on a tab does the same; remembered', () => {
  const D = fresh();
  const f = D.$('rbFold');
  assert.equal(f.getAttribute('aria-expanded'), 'true');
  f.click();
  assert.equal(D.ribbon().contains('folded'), true);
  assert.equal(f.getAttribute('aria-expanded'), 'false');
  assert.equal(D.saved().ribbonFolded, true);
  f.click();
  assert.equal(D.ribbon().contains('folded'), false);
  assert.equal(D.saved().ribbonFolded, false);
  send(D, D.$('rbTab-draw'), 'dblclick');
  assert.equal(D.ribbon().contains('folded'), true);
  send(D, D.$('rbTab-draw'), 'dblclick');
  assert.equal(D.ribbon().contains('folded'), false);
});

test('folded, a tab clicked shows its tools over the drawing until one is picked, the pointer goes elsewhere, or Esc', () => {
  const D = fresh();
  D.$('rbFold').click();
  const peek = () => D.ribbon().contains('peek');
  D.$('rbTab-modify').click();
  assert.equal(peek(), true, 'shown');
  assert.deepEqual(D.shownPane(), ['modify']);
  assert.equal(D.ribbon().contains('folded'), true, 'and still folded');
  D.$('toolPanel').querySelector('button.tool[data-tool="trim"]').click();
  assert.equal(D.run('TOOL'), 'trim');
  assert.equal(peek(), false, 'a tool picked: the tools go away');
  D.$('rbTab-modify').click();
  send(D, D.$('canvasWrap'), 'pointerdown');
  assert.equal(peek(), false, 'the drawing clicked');
  D.$('rbTab-modify').click();
  send(D, D.document, 'keydown', { key: 'Escape' });
  assert.equal(peek(), false, 'Esc');
  D.$('rbTab-modify').click();
  D.$('rbTab-modify').click();
  assert.equal(peek(), false, 'the same tab clicked again');
  D.$('rbFold').click();
  D.$('rbTab-draw').click();
  assert.equal(peek(), false, 'open, a tab never peeks');
});

test('the tab and the fold are remembered between visits', () => {
  const D = fresh({ ribbonTab: 'arrange', ribbonFolded: true });
  assert.deepEqual(D.shownTab(), ['arrange']);
  assert.equal(D.ribbon().contains('folded'), true);
  const E = fresh({ ribbonTab: 'nonsense' });
  assert.deepEqual(E.shownTab(), ['draw'], 'a tab that isn’t there: Draw');
});

test('Layers are a tab of the right-hand panel, beside Toolpaths; remembered; picked while the panel is folded, it opens', () => {
  const D = fresh();
  assert.equal(D.$('rpTabTp').getAttribute('aria-selected'), 'true');
  assert.equal(D.$('rpPaneLayers').hidden, true);
  assert.ok(D.$('rpPaneLayers').contains(D.$('layerList')) && D.$('rpPaneLayers').contains(D.$('layerAdd')));
  D.$('rpTabLayers').click();
  assert.equal(D.$('rpPaneLayers').hidden, false);
  assert.equal(D.$('rpPaneTp').hidden, true);
  assert.equal(D.saved().rightTab, 'layers');
  assert.equal(D.$('layerList').querySelectorAll('.layerRow').length, 1, 'the drawing’s layer is listed');
  D.$('layerAdd').click();
  assert.equal(D.$('layerList').querySelectorAll('.layerRow').length, 2, '+ Layer adds one');
  D.$('tpCollapse').click();
  assert.equal(D.$('tpPanel').classList.contains('collapsed'), true);
  D.$('rpTabTp').click();
  assert.equal(D.$('tpPanel').classList.contains('collapsed'), false);
  assert.equal(D.$('rpPaneTp').hidden, false);
  const E = fresh({ rightTab: 'layers' });
  assert.equal(E.$('rpPaneLayers').hidden, false, 'remembered between visits');
});

test('laid out across the top, over the drawing and the right-hand panel; folded, only the tabs', () => {
  const css = fs.readFileSync(path.join(here, '../src/styles/design.css'), 'utf8');
  assert.match(css, /#app\{display:grid;grid-template-rows:auto auto 1fr auto;grid-template-columns:1fr auto;/);
  assert.match(css, /#toolPanel\{grid-row:2;grid-column:1\/-1;/);
  assert.match(css, /#canvasWrap\{grid-row:3;grid-column:1;/);
  assert.match(css, /#tpPanel\{grid-row:3;grid-column:2;/);
  assert.match(css, /#toolPanel\.folded \.rbPanes\{display:none\}/);
  assert.match(css, /#toolPanel\.folded\.peek \.rbPanes\{display:block;position:absolute;/);
});
