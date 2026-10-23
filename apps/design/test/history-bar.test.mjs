// The History bar, as Clint asked (2026-10-22): an icon instead of the word History; right-click a step to delete it;
// a marker, as in Fusion, to drag along the bar (or move with the arrow keys); and right-click to remove every step
// after the marker. On the real sources (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const names = () => plain(D.run('histSteps().map(function (s) { return s.name + (s.failed ? " (red)" : ""); })'));
// an event with a pointer position or a key (the test page has no MouseEvent or KeyboardEvent)
const evt = (type, props) => { const e = new D.Event(type, { bubbles: true }); for (const k in props) Object.defineProperty(e, k, { value: props[k] }); return e; };
const kinds = () => plain(D.run('DOC.ents.map(function (e) { return e.t; })'));

// Rectangle, Circle, Offset 5 mm (of the circle), Line
function session() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 300, h: 200, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.params = []; DOC.tpGroups = []; DOC.images = []; delete DOC.sheets;
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = []; HIST_STALE_FROM = null; UICFG.stockUnits = 'mm'; UICFG.histBar = true;
    pushUndo(); DOC.ents.push({t: 'rect', x: 20, y: 20, w: 100, h: 60, layer: 'L1'}); persist();
    pushUndo(); DOC.ents.push({t: 'circle', cx: 200, cy: 100, r: 20, layer: 'L1'}); persist();
    SEL = [1]; offOpen(); OFF.dist = 5; offRender(); offApply(); SEL = [];
    pushUndo(); DOC.ents.push({t: 'line', x1: 0, y1: 0, x2: 50, y2: 10, layer: 'L1'}); persist();
    histRender(); 1`);
}
// right-click a step (its place on the bar; -1 for Start) and the menu's items
function menu(i) {
  const chips = [...D.document.querySelectorAll('#histSteps .hStep')];
  chips[i + 1].dispatchEvent(evt('contextmenu', { clientX: 50, clientY: 50 }));
  return [...el('ctxMenu').querySelectorAll('button')];
}
const pick = (items, label) => { const b = items.find((x) => x.textContent.startsWith(label)); assert.ok(b, 'no "' + label + '" in ' + items.map((x) => x.textContent)); b.click(); };

test('the History button is an icon, named for screen readers, and still shows and hides the steps', () => {
  session();
  const f = el('histFold');
  assert.ok(f.querySelector('svg'), 'an icon');
  assert.equal(f.textContent.trim(), '', 'no word on it');
  assert.equal(f.getAttribute('aria-label'), 'History');
  f.click(); assert.ok(el('histBar').classList.contains('folded'));
  f.click(); assert.ok(!el('histBar').classList.contains('folded'));
});

test('delete a step: the steps after it are done again without it; one that needed it turns red; Undo puts it back', async () => {
  session();
  assert.deepEqual(names(), ['Rectangle', 'Circle', 'Offset 5 mm', 'Line']);
  pick(menu(0), 'Delete this step');                          // the rectangle
  await D.run('busyIdle()');
  assert.deepEqual(names(), ['Circle', 'Offset 5 mm', 'Line']);
  assert.deepEqual(kinds(), ['circle', 'circle', 'line'], 'no rectangle; the rest done again');
  pick(menu(0), 'Delete this step');                          // now the circle: the offset made from it can't be done
  await D.run('busyIdle()');
  assert.deepEqual(names(), ['Offset 5 mm (red)', 'Line']);
  assert.deepEqual(kinds(), ['line']);
  D.run('doUndo(); 1');
  assert.deepEqual(names(), ['Circle', 'Offset 5 mm', 'Line'], 'Undo: the circle back, and its offset with it');
  D.run('doUndo(); 1');
  assert.deepEqual(kinds(), ['rect', 'circle', 'circle', 'line']);
});

test('a step that opened a drawing can’t be deleted (the steps after it are that drawing’s)', () => {
  session();
  D.run(`pushUndo('Opened other.454.json', 'open'); DOC.ents = [{t: 'circle', cx: 5, cy: 5, r: 2, layer: 'L1'}]; persist(); histRender(); 1`);
  const items = menu(4);
  assert.ok(items.find((x) => x.textContent === 'Delete this step').disabled);
  assert.match(String(D.run('histDelete(4)')), /opened or started a drawing/);
});

test('remove all after the marker: offered only with steps after it; Undo puts them back', () => {
  session();
  assert.ok(!menu(1).some((x) => /after the marker/.test(x.textContent)), 'none after it: not offered');
  D.run('histGoTo(2); histRender(); 1');                       // back two steps
  pick(menu(0), 'Remove all 2 steps after the marker');
  assert.deepEqual(names(), ['Rectangle', 'Circle']);
  assert.equal(D.run('REDO.length'), 0);
  D.run('doUndo(); 1');
  assert.deepEqual(names(), ['Rectangle', 'Circle', 'Offset 5 mm', 'Line'], 'Undo: back');
  assert.equal(D.run('UNDO.length'), 2, 'and the marker where it was');
});

test('the marker sits just after the step the drawing is at; the arrow keys, Home and End move it', () => {
  session();
  const where = () => { const kids = [...el('histSteps').children]; return kids.indexOf(D.document.querySelector('#histSteps .hMark')); };
  assert.equal(where(), 5, 'after the last of the 4 steps (and Start)');
  const key = (k) => { D.document.querySelector('#histSteps .hMark').dispatchEvent(evt('keydown', { key: k })); };
  key('ArrowLeft'); assert.equal(D.run('UNDO.length'), 3); assert.equal(where(), 4);
  key('Home'); assert.equal(D.run('UNDO.length'), 0); assert.equal(where(), 1, 'just after Start');
  key('ArrowLeft'); assert.equal(D.run('UNDO.length'), 0, 'no further than the start');
  key('End'); assert.equal(D.run('UNDO.length'), 4);
});

test('dragging the marker: it lands in the gap nearest the pointer, and the drawing goes there when let go', () => {
  session();
  // the steps' places on screen (a layout the test page doesn't have): Start at 0, then 30 px apart
  [...D.document.querySelectorAll('#histSteps .hStep')].forEach((c, k) => { c.getBoundingClientRect = () => ({ left: k * 30, width: 28, top: 0, height: 26 }); });
  const m = D.document.querySelector('#histSteps .hMark');
  const ev = (type, x) => m.dispatchEvent(evt(type, { clientX: x, clientY: 10, pointerId: 1 }));
  ev('pointerdown', 140); ev('pointermove', 75); ev('pointermove', 50);
  assert.equal(D.run('UNDO.length'), 4, 'nothing moves until it’s let go');
  ev('pointerup', 50);
  assert.equal(D.run('UNDO.length'), 1, 'after the first step (its middle is at 44)');
});
