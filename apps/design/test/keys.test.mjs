// The keyboard shortcuts most programs have (src/js/shortcuts.js, with Save and Open in unsaved.js and
// Duplicate in clipboard.js), pressed as keys. Run on Design's real source files (test/harness.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh() {
  const D = loadDesign({ start: false });
  const keydown = [];
  D.addEventListener = (type, f) => { if (type === 'keydown') keydown.push(f); };
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  // press a key: {key, ctrl, shift}, on the drawing or in a box (target)
  D.press = (key, o = {}) => {
    const ev = { key, ctrlKey: !!o.ctrl, metaKey: false, shiftKey: !!o.shift, altKey: false, code: '',
                 target: o.target || D.document.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    keydown.forEach((f) => f(ev));
    return ev;
  };
  // a Save As window (counts how often it opened) and the file it gives
  D.saves = [];
  D.picker = (name = 'bench.454.json', { deny = false } = {}) => {
    D.showSaveFilePicker = async () => {
      D.saves.push('asked');
      return { name, createWritable: async () => ({ write: async (t) => { D.saves.push('wrote ' + name); }, close: async () => {} }) };
    };
  };
  D.run(`DOC.ents = [{t:'rect', x:0, y:0, w:40, h:20}, {t:'circle', cx:80, cy:10, r:5}]; DOC.dims = [];
    addDim({kind:'side', a:entId(DOC.ents[0]), at:hintOf(DOC.ents[0], {x:20, y:0})}); SEL = []; persist(); 1`);
  return D;
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function flush() { for (let i = 0; i < 8; i++) await settle(); }

test('Ctrl+S asks where the first time, then saves straight to the same file', async () => {
  const D = fresh(); D.picker('bench.454.json');
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(D.saves, ['asked', 'wrote bench.454.json']);
  assert.equal(D.drawingUnsaved(), false);
  D.run(`DOC.ents[1].r = 6; persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(D.saves.slice(2), ['wrote bench.454.json'], 'no second question');
  assert.equal(D.drawingUnsaved(), false);
});
test('Ctrl+Shift+S always asks (a copy under another name), and Save then goes to the new file', async () => {
  const D = fresh(); D.picker('a.454.json');
  D.press('s', { ctrl: true }); await flush();
  D.picker('b.454.json');
  D.press('S', { ctrl: true, shift: true }); await flush();
  assert.deepEqual(D.saves, ['asked', 'wrote a.454.json', 'asked', 'wrote b.454.json']);
  D.press('s', { ctrl: true }); await flush();
  assert.equal(D.saves.at(-1), 'wrote b.454.json');
});
test('if the file can no longer be written, Save asks where instead of failing', async () => {
  const D = fresh(); D.picker('bench.454.json');
  D.press('s', { ctrl: true }); await flush();
  D.run(`SAVE_HANDLE = { name: 'bench.454.json', createWritable: async () => { var e = new Error('The request is not allowed'); e.name = 'NotAllowedError'; throw e; } }; 1`);
  D.run(`DOC.ents[1].r = 7; persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(D.saves, ['asked', 'wrote bench.454.json', 'asked', 'wrote bench.454.json'], 'it asked again, and saved');
  assert.equal(D.drawingUnsaved(), false);
});
test('Ctrl+S works while typing in a box; New, Open and Recover forget the file', async () => {
  const D = fresh(); D.picker();
  const box = D.document.createElement('input');
  const ev = D.press('s', { ctrl: true, target: box }); await flush();
  assert.equal(ev.defaultPrevented, true);
  assert.equal(D.saves[0], 'asked');
  assert.notEqual(D.run('SAVE_HANDLE'), null);
  D.press('n', { ctrl: true });
  assert.equal(D.run('SAVE_HANDLE'), null, 'New: a new drawing has no file yet');
  assert.equal(plain(D.run('DOC.ents')).length, 0);
});
test('Ctrl+O opens through the Open window; a drawing opened there is saved back to its own file', async () => {
  const D = fresh();
  const handle = { name: 'shelf.454.json', getFile: async () => ({ name: 'shelf.454.json' }),
                   createWritable: async () => ({ write: async () => { D.saves.push('wrote shelf.454.json'); }, close: async () => {} }) };
  let imported = null;
  D.showOpenFilePicker = async () => [handle];
  D.run('DESIGN_IMPORT = function (files){ DESIGN_IMPORT.got = files; }; 1');
  D.press('o', { ctrl: true }); await flush();
  imported = D.run('DESIGN_IMPORT.got');
  assert.equal(imported.length, 1);
  assert.equal(D.run('OPEN_HANDLE && OPEN_HANDLE.name'), 'shelf.454.json');
  // the file turns out to be a drawing: opening it keeps the handle for Save
  const d = JSON.parse(D.run('docForStorage()'));
  D.openDrawing(D.run(`(${JSON.stringify(d)})`), 'shelf.454.json');
  D.run(`DOC.ents[0].w = 45; persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(D.saves, ['wrote shelf.454.json'], 'saved back, without asking');
});
test('a DXF or several files opened don’t become the drawing’s file', async () => {
  const D = fresh();
  D.showOpenFilePicker = async () => [{ name: 'part.dxf', getFile: async () => ({ name: 'part.dxf' }) }];
  D.run('DESIGN_IMPORT = function (){}; 1');
  D.press('o', { ctrl: true }); await flush();
  assert.equal(D.run('OPEN_HANDLE'), null);
});
test('Ctrl+A selects everything that can be selected, not what’s on a hidden layer', () => {
  const D = fresh();
  D.run(`layersInit(); var L2 = layerNew(); DOC.ents.push({t:'line', x1:0, y1:50, x2:30, y2:50, layer:L2}); layerById(L2).visible = false; 1`);
  D.press('a', { ctrl: true });
  assert.deepEqual(plain(D.run('SEL')), [0, 1]);
});
test('Ctrl+A and Ctrl+D in a text box are left to the box', () => {
  const D = fresh();
  const box = D.document.createElement('input');
  const ev = D.press('a', { ctrl: true, target: box });
  assert.equal(ev.defaultPrevented, false);
  assert.deepEqual(plain(D.run('SEL')), []);
  D.run('SEL = [0]; 1');
  D.press('d', { ctrl: true, target: box });
  assert.equal(plain(D.run('DOC.ents')).length, 2);
});
test('Ctrl+D duplicates the selection with its dimensions, 10 mm right and down, and leaves the clipboard alone', () => {
  const D = fresh();
  D.run('SEL = [1]; 1'); D.clipCopy();                        // the circle is on the clipboard
  D.run('SEL = [0]; 1');
  D.press('d', { ctrl: true });
  const e = plain(D.run('DOC.ents')), d = plain(D.run('DOC.dims'));
  assert.equal(e.length, 3);
  assert.deepEqual([e[2].x, e[2].y, e[2].w], [10, -10, 40]);
  assert.equal(d.length, 2); assert.equal(d[1].a, e[2]._id);
  assert.deepEqual(plain(D.run('SEL')), [2]);
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignClip')).ents[0].t, 'circle', 'still the circle');
});
test('Ctrl+Shift+Z redoes (it used to undo); Ctrl+Z and Ctrl+Y as before', () => {
  const D = fresh();
  D.run(`pushUndo(); DOC.ents.push({t:'line', x1:0, y1:0, x2:5, y2:5}); persist(); 1`);
  D.press('z', { ctrl: true });
  assert.equal(plain(D.run('DOC.ents')).length, 2);
  D.press('Z', { ctrl: true, shift: true });
  assert.equal(plain(D.run('DOC.ents')).length, 3, 'redone');
  D.press('z', { ctrl: true }); D.press('y', { ctrl: true });
  assert.equal(plain(D.run('DOC.ents')).length, 3);
});
test('F1 opens the docs; while a dialog is open, it has the keyboard', () => {
  const D = fresh();
  let opened = 0;
  D.document.getElementById('openDocs').click = () => { opened++; };
  D.press('F1');
  assert.equal(opened, 1);
  D.document.getElementById('settingsModal').hidden = false;
  D.press('F1'); D.press('a', { ctrl: true });
  assert.equal(opened, 1);
  assert.deepEqual(plain(D.run('SEL')), []);
});

// ---- in the desktop app: files by path, so Save goes back to the file a drawing came from ----
function desktop(D, { savesOk = true } = {}) {
  const calls = [];
  D.File = class { constructor(parts, name) { this.parts = parts; this.name = name; } };
  D.desktop454 = { files: {
    open: async () => { calls.push('open'); return [{ path: 'C:/Jobs/bench.454.json', name: 'bench.454.json', data: new Uint8Array([123, 125]) }]; },
    save: async (p, text) => { calls.push('save ' + p); return savesOk ? { ok: true, path: p, name: p.split('/').pop() } : { ok: false, why: 'gone' }; },
    saveAs: async (text, suggested) => { calls.push('saveAs ' + suggested); return { path: 'C:/Jobs/copy.454.json', name: 'copy.454.json' }; },
    pathOf: () => 'C:/Drops/dropped.454.json',
  } };
  D.run('DESIGN_IMPORT = function (files){ DESIGN_IMPORT.got = files; }; 1');
  return calls;
}
// open bench.454.json the way the app does: the Open window, then Design reads it as a drawing
async function openBench(D) {
  D.press('o', { ctrl: true }); await flush();
  const d = JSON.parse(D.run('docForStorage()'));
  D.openDrawing(D.run(`(${JSON.stringify(d)})`), D.run('DESIGN_IMPORT.got[0].name'));
}
test('desktop: a drawing opened with Ctrl+O saves straight back to its file with Ctrl+S', async () => {
  const D = fresh(), calls = desktop(D);
  await openBench(D);
  D.run(`DOC.ents[0].w = 45; persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(calls, ['open', 'save C:/Jobs/bench.454.json'], 'no Save window');
  assert.equal(D.drawingUnsaved(), false);
});
test('desktop: and still does after Design is closed and opened again', async () => {
  const A = fresh(); desktop(A); await openBench(A);
  const B = loadDesign({ start: false });
  for (const k of ['d454Design', 'd454DesignPath', 'd454DesignName']) { const v = A.localStorage.getItem(k); if (v !== null) B.localStorage.setItem(k, v); }
  const keydown = []; B.addEventListener = (t, f) => { if (t === 'keydown') keydown.push(f); };
  B.wire(); B.run = (c) => vm.runInContext(c, B);
  const calls = desktop(B);
  B.run(`DOC.ents[0].w = 47; persist(); 1`);
  keydown.forEach((f) => f({ key: 's', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, target: B.document.body, preventDefault() {} }));
  await flush();
  assert.deepEqual(calls, ['save C:/Jobs/bench.454.json']);
});
test('desktop: Ctrl+Shift+S and the Save as button ask, starting at the file; Save then goes to the new one', async () => {
  const D = fresh(), calls = desktop(D);
  await openBench(D);
  D.press('S', { ctrl: true, shift: true }); await flush();
  assert.equal(calls.at(-1), 'saveAs C:/Jobs/bench.454.json');
  D.press('s', { ctrl: true }); await flush();
  assert.equal(calls.at(-1), 'save C:/Jobs/copy.454.json');
  D.document.getElementById('saveAsBtn').click(); await flush();
  assert.equal(calls.at(-1), 'saveAs C:/Jobs/copy.454.json');
});
test('desktop: if the file can\u2019t be written (moved, deleted), Save asks where instead', async () => {
  const D = fresh(), calls = desktop(D, { savesOk: false });
  await openBench(D);
  D.press('s', { ctrl: true }); await flush();
  assert.deepEqual(calls.slice(1), ['save C:/Jobs/bench.454.json', 'saveAs C:/Jobs/bench.454.json']);
});
test('desktop: New forgets the file (Save asks); a dropped drawing is remembered', async () => {
  const D = fresh(), calls = desktop(D);
  await openBench(D);
  D.press('n', { ctrl: true });
  D.document.getElementById('jobModal').hidden = true;             // New opens Job setup: close it, as you would
  D.run(`DOC.ents.push({t:'line', x1:0, y1:0, x2:5, y2:5}); persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.equal(calls.at(-1), 'saveAs design.454.json');
  D.droppedFiles([{ name: 'dropped.454.json' }]);
  const d = JSON.parse(D.run('docForStorage()'));
  D.openDrawing(D.run(`(${JSON.stringify(d)})`), 'dropped.454.json');
  D.run(`DOC.ents[0].x2 = 9; persist(); 1`);
  D.press('s', { ctrl: true }); await flush();
  assert.equal(calls.at(-1), 'save C:/Drops/dropped.454.json');
});
