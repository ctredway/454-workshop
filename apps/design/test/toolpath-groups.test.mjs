// Toolpath groups (toolpath-groups.js): made, folded, shown, ticked, moved and saved together, on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
// five toolpaths, A to E, each a profile round its own rectangle
function setup() {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 300, h: 100, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = 'ABCDE'.split('').map((_, i) => ({ t: 'rect', x: 10 + i * 55, y: 10, w: 40, h: 40, layer: 'L1' }));
  D.DOC.toolpaths = []; D.DOC.tpGroups = []; delete D.DOC.sheets;
  D.run(`UNDO = []; REDO = []; CUTSEL = null; TP_PICKED = []; TP_GROUP_RENAMING = null; sheetsInit(); 'ABCDE'.split('').forEach(function (n, i) {
    var tp = {id: 'tp' + n, name: n, side: 'outside', type: 'profile', ents: [entId(DOC.ents[i])], depth: 3, step: 3, dia: 6.35, feed: 800, plunge: 300,
              safeZ: 6, rpm: 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false, toolChosen: true, stepoverPct: 40};
    tpGenerate(tp); tpList().push(tp);
  }); renderToolpathPanel(); 1`);
}
const order = () => plain(D.run('tpList()')).map((t) => t.name).join('');
const groupOf = (n) => plain(D.run('tpList()')).find((t) => t.name === n).group;
const make = (names, name) => D.run(`tpGroupMake(${JSON.stringify(names.split('').map((n) => 'tp' + n))}${name ? ', ' + JSON.stringify(name) : ''}).id`);
const cards = () => [...D.document.querySelectorAll('#tpList .tpCard .tpNm')].map((e) => e.textContent).join('');
const heads = () => [...D.document.querySelectorAll('#tpList .tpGroupHead')];

test('a group of picked toolpaths: together in the cutting order where the first one was, named, with a header line', () => {
  setup();
  const g = make('BD');
  assert.equal(order(), 'ABDCE', 'D moved up beside B');
  assert.equal(D.run('tpGroups().length'), 1);
  assert.equal(D.run('tpGroups()[0].name'), 'Group 1');
  assert.equal(D.run('TP_GROUP_RENAMING'), g, 'its name box opens, to name it there and then');
  D.run('TP_GROUP_RENAMING = null; renderToolpathPanel(); 1');
  assert.equal(heads().length, 1);
  assert.match(heads()[0].textContent, /Group 1\s*2 toolpaths/);
  assert.equal(cards(), 'ABDCE');
  assert.equal(D.document.querySelectorAll('#tpList .tpCard.tpInGroup').length, 2);
  assert.equal(make('E', 'Edges') && D.run("tpGroups()[1].name"), 'Edges', 'a second group, named as asked');
});
test('folded, the group is one line; and a folded group still says if one of its toolpaths needs attention', () => {
  setup();
  const g = make('BC', 'Pair');
  D.run(`tpGroupById('${g}').folded = true; renderToolpathPanel(); 1`);
  assert.equal(cards(), 'ADE');
  assert.equal(heads()[0].querySelector('.tpWarnMark'), null);
  D.run(`tpList().filter(function (t) { return t.name === 'C'; })[0].toolChosen = false; renderToolpathPanel(); 1`);
  assert.match(heads()[0].querySelector('.tpWarnMark').title, /^C: no tool chosen$/);
});
test('shown, hidden and ticked together; the tick box shows when only some are ticked', () => {
  setup();
  const g = make('BC');
  D.run(`tpGroupShowHide('${g}'); 1`);
  assert.deepEqual(plain(D.run('tpList()')).map((t) => !!t.hidden), [false, true, true, false, false]);
  D.run(`tpList()[2].hidden = false; tpGroupShowHide('${g}'); 1`);
  assert.deepEqual(plain(D.run('tpList()')).map((t) => !!t.hidden), [false, true, true, false, false], 'one still shown (the second): hide them all');
  D.run(`tpGroupShowHide('${g}'); 1`);
  assert.deepEqual(plain(D.run('tpList()')).map((t) => !!t.hidden), [false, false, false, false, false], 'all hidden: show them all');
  D.run(`tpGroupInclude('${g}'); 1`);
  assert.deepEqual(plain(D.run('tpList()')).map((t) => !!t.exclude), [false, true, true, false, false]);
  D.run(`tpList()[1].exclude = false; renderToolpathPanel(); 1`);              // the first in, the second out
  const box = heads()[0].querySelector('.tpInc');
  assert.equal(box.checked, false); assert.equal(box.indeterminate, true, 'some in, some out');
  D.run(`tpGroupInclude('${g}'); 1`);
  assert.deepEqual(plain(D.run('tpList()')).map((t) => !!t.exclude), [false, false, false, false, false]);
});
test('the cutting order: a toolpath in a group moves within it; one outside steps past a whole group; a group moves as a block', () => {
  setup();
  const g = make('BC');                                     // A [B C] D E
  assert.equal(D.run('tpStep(1, -1)'), -1, 'B is first in its group');
  assert.equal(D.run('tpStep(2, 1)'), -1, 'C is last in it');
  D.run('tpMoveTo(1, tpStep(1, 1)); 1');
  assert.equal(order(), 'ACBDE', 'B after C, still in the group');
  D.run('tpMoveTo(0, tpStep(0, 1)); 1');
  assert.equal(order(), 'CBADE', 'A past the whole group');
  D.run('tpMoveTo(3, tpStep(3, -1)); 1');
  assert.equal(order(), 'CBDAE', 'D one place earlier, past A');
  D.run('tpMoveTo(2, tpStep(2, -1)); 1');
  assert.equal(order(), 'DCBAE', 'and past the whole group');
  D.run(`tpGroupMove('${g}', 1); 1`);
  assert.equal(order(), 'DACBE', 'the group one place later, as a block');
  D.run(`tpGroupMove('${g}', -1); tpGroupMove('${g}', -1); 1`);
  assert.equal(order(), 'CBDAE');
  assert.equal(D.run(`tpGroupStep('${g}', -1)`), -1, 'it’s first: no earlier');
});
test('dropping a card on another puts it in that card’s group, or out of its own; on a header, at the start of that group', () => {
  setup();
  const g = make('BC');                                     // A [B C] D E
  D.run('tpDropOn(4, 2); 1');                               // E onto C
  assert.equal(order(), 'ABECD'); assert.equal(groupOf('E'), g);
  D.run('tpDropOn(1, 4); 1');                               // B onto D, outside the group
  assert.equal(order(), 'AECDB'); assert.equal(groupOf('B'), undefined);
  D.run(`tpDropOn(0, -1, '${g}'); 1`);                     // A onto the header
  assert.equal(groupOf('A'), g); assert.equal(order().indexOf('A'), 0);
  assert.equal(plain(D.run('tpList()')).filter((t) => t.group === g).map((t) => t.name).join(''), 'AEC');
});
test('saving a group: just its ticked toolpaths, in a file named for it', () => {
  setup();
  const g = make('BD', 'Inlay pocket');
  D.run("tpList()[2].exclude = true; 1");                   // D, in the group, unticked
  const j = plain(D.run(`(function(){ var j = tpJob({ids: tpGroupMembers('${g}').filter(function (t) { return !t.exclude; }).map(function (t) { return t.id; }), name: 'Inlay pocket'}); return {names: j.parts.map(function (p) { return p.name; }), base: j.base, said: j.said}; })()`));
  assert.deepEqual(j.names, ['B']);
  assert.match(j.base, / - Inlay pocket$/);
  assert.match(j.said, /^1 of 5 toolpaths/);
  const all = plain(D.run('tpJob().parts.map(function (p) { return p.name; })'));
  assert.deepEqual(all, ['A', 'B', 'C', 'E'], 'Save G-code itself: every ticked one, in the order shown');
});
test('out of a group, ungrouped, deleted; and one undo puts a group back', async () => {
  setup();
  const g = make('BCD');
  D.run("tpGroupLeave(tpList()[1]); 1");                   // B out
  assert.equal(order(), 'ACDBE', 'just after the group'); assert.equal(groupOf('B'), undefined);
  D.run("doUndo(); 1");
  assert.equal(order(), 'ABCDE'); assert.equal(groupOf('B'), g, 'undo: back in');
  D.run(`tpUngroup('${g}'); 1`);
  assert.equal(D.run('tpGroups().length'), 0); assert.equal(order(), 'ABCDE');
  D.run("doUndo(); 1");
  assert.equal(D.run('tpGroups().length'), 1, 'undo brings the group back');
  D.run(`tpGroupDelete('${g}'); 1`);
  D.document.getElementById('dlgOk').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(order(), 'AE'); assert.equal(D.run('tpGroups().length'), 0);
  D.run("doUndo(); 1");
  assert.equal(order(), 'ABCDE');
});
test('a group stays on one sheet', () => {
  setup();
  D.run(`DOC.sheets = [{id: 'S1', name: 'Base'}, {id: 'S2', name: 'Plug'}]; DOC.activeSheet = 'S1';
         DOC.ents.forEach(function (e, i) { e.sheet = i < 3 ? 'S1' : 'S2'; });
         tpList().forEach(function (t, i) { t.sheet = i < 3 ? 'S1' : 'S2'; }); 1`);
  assert.deepEqual(plain(D.run('tpList().map(tpSheetOf)')), ['S1', 'S1', 'S1', 'S2', 'S2'], '(the test’s two sheets)');
  const g = make('AD');
  assert.equal(groupOf('A'), g); assert.equal(groupOf('D'), undefined, 'D is cut from the other sheet’s material');
  D.run(`tpGroupJoin(tpList().filter(function (t) { return t.name === 'E'; })[0], '${g}'); 1`);
  assert.equal(groupOf('E'), undefined);
  D.run('delete DOC.sheets; sheetsInit(); 1');
});
test('Ctrl+click picks several cards, and right-click offers to group them', () => {
  setup();
  const click = (name, ctrl) => {
    const card = [...D.document.querySelectorAll('#tpList .tpCard')].find((c) => c.querySelector('.tpNm').textContent === name);
    const ev = new D.Event('click', { bubbles: true }); Object.defineProperty(ev, 'ctrlKey', { value: !!ctrl }); card.dispatchEvent(ev);
  };
  click('B'); click('D', true);
  assert.deepEqual(plain(D.run('TP_PICKED')), ['tpB', 'tpD'], 'the one selected first, and the one Ctrl+clicked');
  assert.deepEqual(plain(D.run('tpList().map(tpDrawn)')), [false, true, false, true, false], 'just those two drawn');
  assert.equal(D.document.querySelectorAll('#tpList .tpPicked').length, 2);
  const card = [...D.document.querySelectorAll('#tpList .tpCard')].find((c) => c.querySelector('.tpNm').textContent === 'D');
  const cm = new D.Event('contextmenu', { bubbles: true }); Object.defineProperty(cm, 'clientX', { value: 10 }); Object.defineProperty(cm, 'clientY', { value: 10 });
  card.dispatchEvent(cm);
  const first = D.document.querySelector('#ctxMenu button');
  assert.equal(first.textContent, 'Group these 2 toolpaths');
  first.click();
  assert.equal(order(), 'ABDCE'); assert.ok(groupOf('B') && groupOf('B') === groupOf('D'));
  click('A');
  assert.deepEqual(plain(D.run('TP_PICKED')), [], 'a plain click picks just one again');
});
