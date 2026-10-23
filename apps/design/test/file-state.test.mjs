// Which file is open, and whether it has changed since it was saved (unsaved.js fileStateShow): in the header beside
// Design's name, and in the window's title. Clint, 2026-10-23: "I have no way to know what file I have open and if its
// been changed". On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.toast = () => {};
const el = (id) => D.document.getElementById(id);
const shown = () => [el('docName').textContent, el('docDirty').textContent, el('docDirty').classList.contains('changed')];
const drawingDoc = () => ({ stock: { w: 300, h: 200, t: 18, zero: 'top', origin: 'corner' }, ents: [{ t: 'rect', x: 10, y: 10, w: 50, h: 30 }], dims: [], toolpaths: [] });

test('a new drawing: Untitled, and once something is drawn, not saved to a file', () => {
  D.run("clearDrawing(); markSaved(null); 1");
  assert.deepEqual(shown(), ['Untitled drawing', '', false]);
  D.run("pushUndo('Rectangle'); DOC.ents.push({t:'rect', x:0, y:0, w:10, h:10}); persist(); 1");
  assert.deepEqual(shown(), ['Untitled drawing', '● Not saved to a file', true]);
  assert.equal(D.document.title, '• Untitled drawing — 454 Design v' + D.run('DESIGN_VERSION'));
});
test('opened from a file: its name, saved; changed: said, and a • in the window’s title', () => {
  D.openDrawing(drawingDoc(), 'bookstand.json');
  assert.deepEqual(shown(), ['bookstand.json', 'Saved', false]);
  assert.equal(D.document.title, 'bookstand.json — 454 Design v' + D.run('DESIGN_VERSION'));
  D.run("pushUndo('Move'); DOC.ents[0].x += 5; persist(); 1");
  assert.deepEqual(shown(), ['bookstand.json', '● Changed, not saved', true]);
  assert.match(D.document.title, /^• bookstand\.json — 454 Design v/);
  D.run("markSaved('bookstand.json'); 1");                              // saved again
  assert.deepEqual(shown(), ['bookstand.json', 'Saved', false]);
});
test('pointing at the name shows where the file is (the desktop app keeps its path)', () => {
  D.openDrawing(drawingDoc(), 'bookstand.json');
  D.run("lsSet(PATH_KEY, 'C:/Users/clint/OneDrive/Projects/Kevan/Bookstand/bookstand.json'); fileStateShow.key = null; fileStateShow(); 1");
  assert.match(el('docState').title, /^C:\/Users\/clint\/OneDrive\/Projects\/Kevan\/Bookstand\/bookstand\.json/);
  D.run("pushUndo('Move'); DOC.ents[0].x += 5; persist(); 1");
  assert.match(el('docState').title, /Changed since it was last saved\. Ctrl\+S saves it\.$/);
});
