// Unsaved drawings (src/js/unsaved.js): whether the drawing has been saved to a file since it changed, what
// closing without saving does, and Recover last drawing. Run on Design's real source files (test/harness.mjs):
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const KEYS = ['d454Design', 'd454DesignUnsaved', 'd454DesignAside', 'd454DesignName', 'd454DesignUI'];
// a session of Design: optionally starting from what an earlier one left in storage
function session(from) {
  const D = loadDesign({ start: false });
  if (from) for (const k of KEYS) { const v = from.localStorage.getItem(k); if (v !== null) D.localStorage.setItem(k, v); }
  const unload = [];
  D.addEventListener = (type, f) => { if (type === 'beforeunload') unload.push(f); };
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  // would closing be held up (as a browser or the desktop app sees it)?
  D.closeHeld = () => { let held = false; const e = { preventDefault() { held = true; }, returnValue: undefined }; unload.forEach((f) => f(e)); return held; };
  return D;
}
const drawLine = (D, x = 10) => D.run(`pushUndo(); DOC.ents.push({t:'line', x1:0, y1:0, x2:${x}, y2:0}); persist();`);
const ents = (D) => JSON.parse(D.run('JSON.stringify(DOC.ents)'));
const stored = (D) => JSON.parse(D.localStorage.getItem('d454Design'));
const recoverBtn = (D) => D.document.getElementById('recoverBtn');
// a Save As window that saves as `name`, or is cancelled
function saveAs(D, { name = 'shelf.454.json', cancel = false, fail = null } = {}) {
  const written = [];
  D.showSaveFilePicker = async (opts) => {
    written.opts = opts;
    if (cancel) { const e = new Error('The user aborted a request.'); e.name = 'AbortError'; throw e; }
    if (fail) throw new Error(fail);
    return { name, createWritable: async () => ({ write: async (t) => { written.push(t); }, close: async () => {} }) };
  };
  return written;
}

test('a new drawing, and one that’s only been opened, have nothing unsaved; a change makes it unsaved', () => {
  const D = session();
  assert.equal(D.drawingUnsaved(), false, 'empty');
  assert.equal(D.closeHeld(), false);
  drawLine(D);
  assert.equal(D.drawingUnsaved(), true);
  assert.equal(D.closeHeld(), true, 'closing is held up');
});
test('opening Design again: an unsaved drawing is still unsaved, a saved one isn’t (nothing at startup counts as a change)', async () => {
  const A = session(); drawLine(A);
  const B = session(A);
  assert.deepEqual(ents(B).length, 1, 'the drawing came back');
  assert.equal(B.drawingUnsaved(), true, 'and is still unsaved');
  const written = saveAs(B); assert.equal(await B.saveDrawing(), true); assert.equal(written.length, 1);
  const C = session(B);
  assert.equal(C.drawingUnsaved(), false, 'saved, then reopened: nothing unsaved');
  assert.equal(C.closeHeld(), false);
});
test('Save uses a Save As window with the drawing’s name, writes the whole drawing, and remembers the file’s name', async () => {
  const D = session(); drawLine(D, 42);
  const written = saveAs(D, { name: 'sign.454.json' });
  assert.equal(await D.saveDrawing(), true);
  assert.equal(written.opts.suggestedName, 'design.454.json');
  assert.equal(JSON.parse(written[0]).ents[0].x2, 42);
  assert.equal(D.drawingUnsaved(), false);
  drawLine(D);
  assert.equal(D.drawingUnsaved(), true, 'changed after saving');
  const second = saveAs(D);
  await D.saveDrawing();
  assert.equal(second.opts.suggestedName, 'sign.454.json', 'suggests the name it was saved as');
  assert.equal(D.localStorage.getItem('d454DesignName'), 'shelf.454.json');
  const again = saveAs(D); drawLine(D); await D.saveDrawing();
  assert.equal(again.opts.suggestedName, 'shelf.454.json', 'suggests the name it was last saved as');
});
test('a cancelled Save As leaves it unsaved; a failed one says so and leaves it unsaved', async () => {
  const D = session(); drawLine(D);
  saveAs(D, { cancel: true });
  assert.equal(await D.saveDrawing(), false);
  assert.equal(D.drawingUnsaved(), true);
  saveAs(D, { fail: 'The disk is full.' });
  assert.equal(await D.saveDrawing(), false);
  assert.equal(D.drawingUnsaved(), true);
  assert.match(D.document.body.textContent, /The drawing wasn’t saved/);
});
test('a browser with no Save As window downloads the file, and counts it saved', async () => {
  const D = session(); drawLine(D);
  let clicked = null;
  D.URL = { createObjectURL: () => 'blob:x' };
  const make = D.document.createElement.bind(D.document);
  D.document.createElement = (t) => { const el = make(t); if (t === 'a') el.click = () => { clicked = el.download; }; return el; };
  assert.equal(await D.saveDrawing(), true);
  assert.equal(clicked, 'design.454.json');
  assert.equal(D.drawingUnsaved(), false);
});
test('Don’t save puts the drawing aside: the next session starts empty (same material), and Recover brings it back', () => {
  const A = session(); drawLine(A, 77);
  A.run('DOC.stock.w = 610;');
  assert.equal(A.designCloseDiscard(), true);
  assert.equal(A.closeHeld(), false, 'the window may close');
  const B = session(A);
  assert.equal(ents(B).length, 0, 'starts empty');
  assert.equal(stored(B).stock.w, 610, 'the material size stays');
  assert.equal(B.drawingUnsaved(), false);
  assert.equal(recoverBtn(B).disabled, false, 'Recover is available');
  assert.match(recoverBtn(B).title, /put aside unsaved on/);
  B.recoverDrawing();
  assert.equal(ents(B)[0].x2, 77, 'the drawing is back');
  assert.equal(B.drawingUnsaved(), true, 'still unsaved: it never was saved');
  assert.equal(recoverBtn(B).disabled, true, 'nothing else to recover');
  B.run('doUndo()');
  assert.equal(ents(B).length, 0, 'and Recover can be undone');
});
test('Don’t save with a saved drawing changes nothing', async () => {
  const D = session(); drawLine(D); saveAs(D); await D.saveDrawing();
  assert.equal(D.designCloseDiscard(), true);
  assert.equal(ents(D).length, 1);
  assert.equal(D.localStorage.getItem('d454DesignAside'), null);
});
test('if the drawing can’t be put aside (storage full), Don’t save keeps it instead: never lost', () => {
  const A = session(); drawLine(A, 55);
  const set = A.localStorage.setItem;
  A.localStorage.setItem = (k, v) => { if (k === 'd454DesignAside') throw new Error('QuotaExceededError'); return set(k, v); };
  assert.equal(A.designCloseDiscard(), true, 'the window still closes');
  assert.equal(A.closeHeld(), false, 'without asking again');
  A.localStorage.setItem = set;
  const B = session(A);
  assert.equal(ents(B)[0].x2, 55, 'the drawing comes back next time');
  assert.equal(B.drawingUnsaved(), true);
});
test('New puts an unsaved drawing aside; a saved one isn’t (it’s in its file)', async () => {
  const D = session(); drawLine(D, 11);
  D.newDrawing();
  assert.equal(ents(D).length, 0);
  assert.equal(D.drawingUnsaved(), false);
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignAside')).doc.ents[0].x2, 11);
  drawLine(D, 22); saveAs(D); await D.saveDrawing();
  D.newDrawing();
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignAside')).doc.ents[0].x2, 11, 'the saved one didn’t replace it');
});
test('opening a drawing puts an unsaved one aside, and counts as saved, under its file’s name', () => {
  const D = session(); drawLine(D, 33);
  const file = JSON.parse(D.run('docForStorage()')); file.ents = [{ t: 'circle', cx: 0, cy: 0, r: 5 }];
  D.openDrawing(D.run(`(${JSON.stringify(file)})`), 'box.454.json');
  assert.equal(ents(D)[0].t, 'circle');
  assert.equal(D.drawingUnsaved(), false);
  assert.equal(D.drawingFileName(), 'box.454.json');
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignAside')).doc.ents[0].x2, 33);
});
test('Recover with an unsaved drawing open swaps the two, so neither is lost', () => {
  const D = session(); drawLine(D, 1); D.newDrawing();
  drawLine(D, 2);
  D.recoverDrawing();
  assert.equal(ents(D)[0].x2, 1);
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignAside')).doc.ents[0].x2, 2);
  D.recoverDrawing();
  assert.equal(ents(D)[0].x2, 2, 'and back again');
});
test('Recover is off when there’s nothing to recover', () => {
  const D = session();
  assert.equal(recoverBtn(D).disabled, true);
  assert.match(recoverBtn(D).title, /nothing to recover/);
  D.recoverDrawing();                                           // does nothing
  assert.equal(ents(D).length, 0);
});
