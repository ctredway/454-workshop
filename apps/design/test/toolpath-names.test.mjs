// Toolpath cards (toolpath-cards.js): a toolpath can be given a name, in the editor or on its card, and a card
// folds to its title. A name is written into the G-code as a comment, so it is kept to one line. A folded card
// still says when its toolpath has a warning. On Design's real sources:
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
const fire = (node, type, props) => { const e = new D.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, props || {}); node.dispatchEvent(e); };
const later = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));
const cards = () => [...el('tpList').querySelectorAll('.tpCard')];
const names = () => plain(Array.from(D.tpList(), (t) => t.name));
const shown = () => cards().map((c) => (c.querySelector('.tpNm') || {}).textContent);

// (Small shapes: the test harness runs the cutting engine many times slower than the app does.)
function drawing() {
  if (D.CUT) D.cutClose();
  if (!el('dlgModal').hidden) el('dlgCancel').click();
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'}), guides: [], dims: [], params: [], toolpaths: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 20, y: 20, w: 16, h: 12, layer: 'L1'}, {t: 'rect', x: 120, y: 20, w: 16, h: 12, layer: 'L1'}], name: 'Cabinet'};
    UNDO.length = 0; SEL = []; CUTSEL = null; TP_RENAMING = null; UICFG.stockUnits = 'mm'; renderToolpathPanel(); 1`);
}
// make a toolpath on shape i; `name` is typed into the editor's Name box when given
function make(i, type, depth, name) {
  D.SEL = [i]; D.cutOpen(null); set('cutType', type, 'change'); D.CUT.toolChosen = true; set('cutDia', 6.35); set('cutDepth', depth);
  if (name !== undefined) set('cutName', name);
  D.CUT.toolChosen = true; D.cutRender(); D.cutApply();
  return D.tpList().at(-1);
}
const saving = async (fn) => {
  const out = [];
  D.window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (t) => { out.push({ name: o.suggestedName, text: t }); }, close: async () => {} }) });
  try { await fn(); await later(80); } finally { delete D.window.showSaveFilePicker; }
  return out;
};

// ---- names ----
test('a toolpath given no name is named after its kind of cut, and the Name box shows that greyed', () => {
  drawing();
  D.SEL = [0]; D.cutOpen(null);
  assert.equal(el('cutName').value, '');
  assert.equal(el('cutName').placeholder, 'Outside profile');
  set('cutType', 'pocket', 'change');
  assert.equal(el('cutName').placeholder, 'Pocket', 'it follows the kind of cut');
  D.cutClose();
  assert.equal(make(0, 'pocket', 5).name, 'Pocket');
  assert.equal(make(1, 'inside', 3).name, 'Inside profile');
});
test('a name typed in the editor is the toolpath’s name: on its card and in the G-code', async () => {
  drawing();
  const tp = make(0, 'pocket', 5, 'Drawer bottom');
  assert.equal(tp.name, 'Drawer bottom');
  assert.deepEqual(shown(), ['Drawer bottom']);
  const saved = await saving(() => D.tpExport());
  assert.equal(saved.length, 1);
  assert.ok(saved[0].text.split('\n').includes(';Toolpath: Drawer bottom'), saved[0].text.slice(0, 300));
});
test('editing: a given name is in the box and stays; one that is only the kind of cut follows the kind', () => {
  drawing();
  const named = make(0, 'outside', 3, 'Side panel'), plainTp = make(1, 'outside', 3);
  D.cutOpen(named);
  assert.equal(el('cutName').value, 'Side panel');
  set('cutType', 'inside', 'change'); D.cutApply();
  assert.equal(D.tpList()[0].name, 'Side panel', 'a given name survives a change of cut');
  D.cutOpen(D.tpList()[1]);
  assert.equal(el('cutName').value, '', 'nothing was given, so the box is empty');
  set('cutType', 'inside', 'change'); D.cutApply();
  assert.equal(D.tpList()[1].name, 'Inside profile', 'and the name follows the cut (it used to stay “Outside profile”)');
  assert.equal(plainTp.id, D.tpList()[1].id);
});
test('editing: clearing the Name box puts the kind of cut back', () => {
  drawing();
  make(0, 'pocket', 5, 'Tray');
  D.cutOpen(D.tpList()[0]); set('cutName', '   '); D.cutApply();
  assert.deepEqual(names(), ['Pocket']);
});
test('a name is kept to one line and 60 characters', () => {
  assert.equal(D.tpNameClean('  Left\tside \n panel  '), 'Left side panel');
  assert.equal(D.tpNameClean('a\r\nG0 Z-50'), 'a G0 Z-50');
  assert.equal(D.tpNameClean('x'.repeat(90)).length, 60);
  assert.equal(D.tpNameClean(undefined), '');
  assert.equal(D.tpNameClean(null), '');
  drawing();
  assert.equal(make(0, 'pocket', 5, 'A name that goes on and on and on, well past the sixty characters allowed').name.length, 60);
});
test('renaming changes only the name: the cut is the same, isn’t out of date, and Undo puts the name back', () => {
  drawing();
  const tp = make(0, 'pocket', 5), moves = JSON.stringify(tp.moves);
  const undos = D.UNDO.length;
  assert.equal(D.tpRename(tp, 'Recess'), true);
  assert.deepEqual(names(), ['Recess']);
  assert.deepEqual(shown(), ['Recess']);
  assert.equal(JSON.stringify(D.tpList()[0].moves), moves);
  assert.equal(D.tpStale(D.tpList()[0]), false);
  assert.equal(D.UNDO.length, undos + 1);
  assert.equal(D.tpRename(D.tpList()[0], 'Recess'), false, 'the same name again: nothing to do');
  assert.equal(D.UNDO.length, undos + 1, 'and nothing to undo');
  D.doUndo();
  assert.deepEqual(names(), ['Pocket']);
  assert.equal(D.tpRename(D.tpList()[0], 'Recess'), true);
  D.tpRename(D.tpList()[0], '');
  assert.deepEqual(names(), ['Pocket'], 'an empty name puts the kind of cut back');
});
test('on the card: double-click the name, type, Enter; Escape leaves it alone', () => {
  drawing();
  make(0, 'pocket', 5); make(1, 'outside', 3);
  assert.equal(cards()[0].querySelector('.tpNmEdit'), null);
  fire(cards()[1].querySelector('.tpNm'), 'dblclick');
  let box = cards()[1].querySelector('.tpNmEdit');
  assert.ok(box, 'a box to type in, on that card');
  assert.equal(cards()[0].querySelector('.tpNmEdit'), null, 'and only on that card');
  assert.equal(box.value, 'Outside profile');
  box.value = 'Cut out';
  fire(box, 'keydown', { key: 'Enter' });
  assert.deepEqual(names(), ['Pocket', 'Cut out']);
  assert.equal(cards()[1].querySelector('.tpNmEdit'), null, 'the box has gone');
  fire(cards()[0].querySelector('.tpNm'), 'dblclick');
  box = cards()[0].querySelector('.tpNmEdit');
  box.value = 'Not this';
  fire(box, 'keydown', { key: 'Escape' });
  assert.deepEqual(names(), ['Pocket', 'Cut out']);
  assert.equal(cards()[0].querySelector('.tpNmEdit'), null);
  fire(cards()[0].querySelector('.tpNm'), 'dblclick');
  box = cards()[0].querySelector('.tpNmEdit');
  box.value = 'Clicked away';
  fire(box, 'blur');
  assert.deepEqual(names(), ['Clicked away', 'Cut out'], 'clicking away keeps what was typed');
});
test('typing in the name box doesn’t select the card or reach the shortcuts', () => {
  drawing();
  make(0, 'pocket', 5);
  fire(cards()[0].querySelector('.tpNm'), 'dblclick');
  const box = cards()[0].querySelector('.tpNmEdit'), sel = D.CUTSEL;
  fire(box, 'click');
  assert.equal(D.CUTSEL, sel, 'a click in the box doesn’t select the card');
  assert.ok(cards()[0].querySelector('.tpNmEdit'), 'and the box is still there');
  let reached = 0;
  const count = () => { reached++; };
  D.document.addEventListener('keydown', count);
  fire(cards()[0].querySelector('.tpNmEdit'), 'keydown', { key: 'Delete' });
  D.document.removeEventListener('keydown', count);
  assert.equal(reached, 0);
  assert.equal(D.tpList().length, 1);
  fire(cards()[0].querySelector('.tpNmEdit'), 'keydown', { key: 'Escape' });
});

// ---- the name in the G-code ----
test('a line break in a toolpath’s or a tool’s name can’t start a line of G-code', async () => {
  drawing();
  const tp = make(0, 'pocket', 5);
  tp.name = 'Tray\nG0 Z-50';                               // as an older or hand-edited drawing might hold it
  const saved = await saving(() => D.tpExport());
  const lines = saved[0].text.split('\n');
  assert.ok(lines.includes(';Toolpath: Tray G0 Z-50'), saved[0].text.slice(0, 300));
  assert.equal(lines.filter((l) => /^G0 ?Z-50/.test(l)).length, 0);
  const g = D.Cam.toGcodeJob([{ moves: plain(tp.moves), name: 'A\r\nM3 S99999', tool: 1, toolName: 'Bit\nG0 Z-99', rpm: 18000 }], { notes: ['note\nG0 Z-77'] });
  for (const bad of [/^M3 S99999/, /^G0 Z-99/, /^G0 Z-77/]) assert.equal(g.split('\n').filter((l) => bad.test(l)).length, 0, String(bad));
  assert.ok(g.split('\n').includes(';Toolpath: A M3 S99999'));
});

// ---- folding ----
const parts = (card) => ({ tool: !!card.querySelector('.tpTool'), rows: !!card.querySelector('.tpSet'), buttons: card.querySelectorAll('.tpIcon').length, title: !!card.querySelector('.tpName') });
test('a card folds to its title and opens again', () => {
  drawing();
  make(0, 'pocket', 5, 'Tray'); make(1, 'outside', 3);
  assert.deepEqual(parts(cards()[0]), { tool: true, rows: true, buttons: 5, title: true });
  const sel = D.CUTSEL;
  fire(cards()[0].querySelector('.tpFold'), 'click');
  assert.equal(D.tpList()[0].folded, true);
  assert.deepEqual(parts(cards()[0]), { tool: false, rows: false, buttons: 0, title: true }, 'only the title');
  assert.deepEqual(shown(), ['Tray', 'Outside profile'], 'which still shows the name');
  assert.ok(cards()[0].querySelector('.tpInc') && cards()[0].querySelector('.tpEye') && cards()[0].querySelector('.tpNum'), 'with its tick box, number and eye');
  assert.equal(cards()[0].querySelector('.tpFold').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(parts(cards()[1]), { tool: true, rows: true, buttons: 5, title: true }, 'the other card is untouched');
  assert.equal(D.CUTSEL, sel, 'folding doesn’t select the card');
  fire(cards()[0].querySelector('.tpFold'), 'click');
  assert.equal(D.tpList()[0].folded, false);
  assert.deepEqual(parts(cards()[0]), { tool: true, rows: true, buttons: 5, title: true });
});
test('folding changes nothing about the cut, and editing a folded toolpath leaves it folded', () => {
  drawing();
  const tp = make(0, 'pocket', 5), moves = JSON.stringify(tp.moves);
  fire(cards()[0].querySelector('.tpFold'), 'click');
  assert.equal(JSON.stringify(D.tpList()[0].moves), moves);
  assert.equal(D.tpStale(D.tpList()[0]), false);
  D.cutOpen(D.tpList()[0]); set('cutDepth', 4); D.cutApply();
  assert.equal(D.tpList()[0].folded, true);
  assert.equal(D.tpList()[0].depth, 4);
});
test('fold all: every card to its title, and again to open them', () => {
  drawing();
  assert.equal(el('tpFoldAll').hidden, true, 'nothing to fold yet');
  make(0, 'pocket', 5); make(1, 'outside', 3);
  assert.equal(el('tpFoldAll').hidden, false);
  fire(cards()[1].querySelector('.tpFold'), 'click');   // one folded already
  el('tpFoldAll').click();
  assert.deepEqual(plain(Array.from(D.tpList(), (t) => !!t.folded)), [true, true]);
  assert.equal(el('tpFoldAll').getAttribute('aria-pressed'), 'true');
  assert.equal(cards().filter((c) => c.querySelector('.tpSet')).length, 0);
  el('tpFoldAll').click();
  assert.deepEqual(plain(Array.from(D.tpList(), (t) => !!t.folded)), [false, false]);
  assert.equal(el('tpFoldAll').getAttribute('aria-pressed'), 'false');
});
test('the title is left to the name: the kind of cut, or what needs doing, leads the line under it', () => {
  drawing();
  make(0, 'pocket', 5, 'Tray'); make(1, 'outside', 3);
  assert.equal(cards()[0].querySelector('.tpName .tpType'), null, 'not in the title');
  assert.deepEqual(cards().map((c) => c.querySelector('.tpTool .tpType').textContent), ['pocket', 'outside']);
  assert.match(cards()[0].querySelector('.tpTool').textContent, /^pocket · 6\.35 mm cutter · \d+ mm\/min$/);
  // out of date, as after its shape changes (showing its card recalculates it, so each look needs it set again)
  D.run('tpList()[0].sig = "as it was before the shape changed"; renderToolpathPanel(); 1');
  assert.equal(cards()[0].querySelector('.tpTool .tpType').textContent, 'the drawing changed');
  D.run('tpList()[0].sig = "as it was before the shape changed"; tpFoldAll(); 1');
  assert.match(cards()[0].querySelector('.tpWarnMark').title, /^The drawing changed since this was calculated/, 'folded: the mark says so');
  assert.equal(cards()[1].querySelector('.tpWarnMark'), null);
  D.run('tpList()[1].toolChosen = false; tpList()[1].toolId = null; renderToolpathPanel(); 1');
  assert.match(cards()[1].querySelector('.tpWarnMark').title, /^No tool chosen/);
});
test('a folded card still says when its toolpath has a warning', () => {
  drawing();
  make(0, 'pocket', 5); make(1, 'pocket', 15);              // 15 mm into 12 mm material
  assert.ok(D.tpPastNow(D.tpList()[1]), 'the second goes past the material');
  assert.equal(cards()[1].querySelector('.tpWarnMark'), null, 'open: the warning is in its rows');
  el('tpFoldAll').click();
  assert.equal(cards()[0].querySelector('.tpWarnMark'), null, 'nothing to say about the first');
  const mark = cards()[1].querySelector('.tpWarnMark');
  assert.ok(mark, 'the second is marked');
  assert.ok(mark.title.includes(D.tpPastSay(D.tpList()[1])), mark.title);
});
