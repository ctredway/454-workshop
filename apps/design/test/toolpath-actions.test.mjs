// The row of icons at the top of the Toolpaths panel (toolpath-panel.js, design.html): Preview in wood, Preview in
// 454 Control, Job sheet, Save template and Apply template. They were wide buttons under the list; now they are
// icons that say what they are when the pointer rests on them. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
D.VIEW.scale = 4;
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const set = (id, v, ev) => { el(id).value = String(v); el(id).dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
const later = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const IDS = ['tpWoodBtn', 'tpControlBtn', 'tpJobSheetBtn', 'tplSaveBtn', 'tplApplyBtn'];
const off = () => IDS.filter((id) => el(id).disabled);

// small shapes: the test harness runs the cutting engine many times slower than the app does
function drawing() {
  if (D.CUT) D.cutClose();
  for (const m of ['woodModal', 'jsModal', 'dlgModal']) if (el(m)) el(m).hidden = true;
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 20, y: 20, w: 16, h: 12, layer: 'L1'}, {t: 'rect', x: 80, y: 20, w: 16, h: 12, layer: 'L1'}], name: 'Cabinet'};
    UNDO.length = 0; SEL = []; CUTSEL = null; UICFG.stockUnits = 'mm'; UICFG.tpPanel = true; renderToolpathPanel(); 1`);
}
function make(i) {
  D.SEL = [i]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 3.175); set('cutDepth', 2);
  D.CUT.toolChosen = true; D.cutRender(); D.cutApply();
  return D.tpList().at(-1);
}

test('the row is at the top of the panel: five icons in order, each named for a screen reader and when pointed at', () => {
  drawing();
  const row = el('tpActs');
  assert.equal(row.hidden, false);
  assert.deepEqual([...row.querySelectorAll('button.tpIcon')].map((b) => b.id), IDS);
  assert.deepEqual([...row.children].map((c) => c.id || c.className), ['tpWoodBtn', 'tpControlBtn', 'tpJobSheetBtn', 'tpActSep', 'tplSaveBtn', 'tplApplyBtn', 'helpI'],
    'the three that look at the job, a divider, the two for templates, then the help');
  const names = ['Preview in wood', 'Preview in 454 Control', 'Job sheet', 'Save template', 'Apply template'];
  IDS.forEach((id, i) => {
    const b = el(id);
    assert.equal(b.getAttribute('aria-label'), names[i]);
    assert.ok(b.title.startsWith(names[i] + ' — '), id + ': the tip starts with its name: ' + b.title);
    assert.equal(b.textContent.trim(), '', id + ' is an icon, with no words on it');
    assert.ok(b.querySelector('svg'), id + ' has its picture');
  });
  // above the list of toolpaths, below the panel's name
  const kids = [...el('tpBody').children];
  assert.ok(kids.indexOf(row) > kids.findIndex((k) => k.className === 'tpHead'));
  assert.ok(kids.indexOf(row) < kids.indexOf(el('tpList')));
});
test('with no toolpaths: only Apply template can be pressed', () => {
  drawing();
  assert.deepEqual(off(), ['tpWoodBtn', 'tpControlBtn', 'tpJobSheetBtn', 'tplSaveBtn']);
});
test('with a toolpath: all five; with every toolpath left out of the G-code, the previews and job sheet wait', () => {
  drawing();
  make(0);
  assert.deepEqual(off(), []);
  D.run('tpList()[0].exclude = true; renderToolpathPanel(); 1');
  assert.deepEqual(off(), ['tpWoodBtn', 'tpControlBtn', 'tpJobSheetBtn'], 'a template can still be saved from it');
  D.run('tpList()[0].exclude = false; renderToolpathPanel(); 1');
  assert.deepEqual(off(), []);
});
test('only Save G-code is left under the list', () => {
  drawing();
  make(0);
  const under = [...el('tpList').querySelectorAll('button')].filter((b) => !b.closest('.tpCard')).map((b) => b.textContent);
  assert.equal(under.length, 1);
  assert.match(under[0], /^Save G-code/);
  assert.equal(D.document.querySelectorAll('#tplSaveBtn, #tplApplyBtn').length, 2, 'and the template buttons exist once each');
});
test('each icon does what its button did', async () => {
  drawing();
  make(0);
  el('tpWoodBtn').click();
  assert.equal(el('woodModal').hidden, false, 'Preview in wood opens');
  el('woodModal').hidden = true;
  el('tpJobSheetBtn').click();
  assert.equal(el('jsModal').hidden, false, 'Job sheet opens');
  el('jsModal').hidden = true;
  let asked = null;
  D.window.showSaveFilePicker = async (o) => { asked = o.suggestedName; throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  el('tplSaveBtn').click(); await later(60);
  delete D.window.showSaveFilePicker;
  assert.match(String(asked), /template/i, 'Save template asks where to save');
  // Preview in 454 Control and Apply template open another window or a file, so their wiring is read
  const wiring = fs.readFileSync(new URL('../src/js/wiring.js', import.meta.url), 'utf8');
  for (const [id, fn] of [['tpWoodBtn', 'woodPreviewOpen'], ['tpControlBtn', 'tpPreview'], ['tpJobSheetBtn', 'jobSheetOpen'], ['tplSaveBtn', 'tplSave'], ['tplApplyBtn', 'tplOpen']])
    assert.ok(wiring.includes("document.getElementById('" + id + "').addEventListener('click', " + fn + ");"), id);
});
test('with sheets: the icons go by the sheet being shown, and the job sheet says which', () => {
  drawing();
  make(0);
  D.sheetAdd();                                            // Sheet 2 is shown, and has nothing on it
  assert.deepEqual(off(), ['tpWoodBtn', 'tpControlBtn', 'tpJobSheetBtn', 'tplSaveBtn']);
  assert.equal(el('tpJobSheetBtn').getAttribute('aria-label'), 'Job sheet for Sheet 2');
  D.sheetShow(D.DOC.sheets[0].id);
  assert.deepEqual(off(), []);
  assert.equal(el('tpJobSheetBtn').getAttribute('aria-label'), 'Job sheet for Sheet 1');
});
test('the row has its info icon, at the end', () => {
  drawing();
  const last = el('tpActs').lastChild;
  assert.equal(last.className, 'helpI');
  assert.equal(last.getAttribute('data-help-at'), 'cam-reference.html#order-checking-and-saving');
  assert.match(last.getAttribute('data-help-tip'), /^Preview the job in wood or in 454 Control, print a job sheet/);
});
