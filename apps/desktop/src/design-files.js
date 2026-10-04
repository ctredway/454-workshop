// 454 Design's files, in the desktop app: opened and saved by their path, so Save goes straight back to the
// file a drawing came from, and still does after Design is closed and opened again. (In a browser, Design
// uses the browser's own file access instead, which can't keep hold of a file between sessions.)
//
// What it may write, to be safe with a page asking: only a .json file you picked in its Open or Save window
// (remembered in the app's data folder), or an existing 454 Design drawing. It writes a temporary file beside
// it and then swaps it in, so a crash or power cut part-way through can't leave half a drawing.
//
// Recent files (File > Open recent): the last RECENT_MAX projects opened or saved, newest first, kept in the
// app's data folder. A project is a drawing, or a VCarve or Carbide Create file: what Open opens, not what Import
// brings in. The page can ask for one to be opened again only if it's on that list, so it can never name a file
// of its own choosing to be read.
//
// Everything outside (the dialogs, the file system, where it keeps its list) is passed in, so the rules can be
// tested on their own (test/design-files.test.mjs).
'use strict';

// Open: a drawing, or a VCarve or Carbide Create project. Import: vectors to add to the drawing, or a picture to trace.
const OPEN_FILTERS = [
  { name: 'Drawings, and VCarve and Carbide Create projects', extensions: ['json', 'crv', 'c2d'] },
  { name: 'All files', extensions: ['*'] },
];
const IMPORT_FILTERS = [
  { name: 'DXF and SVG drawings, and pictures to trace', extensions: ['dxf', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
  { name: 'All files', extensions: ['*'] },
];
const SAVE_FILTERS = [{ name: '454 Design drawing', extensions: ['json'] }];
const RECENT_MAX = 10;
const PROJECT = /\.(json|crv|c2d)$/i;

// recentFile: where the recent files are kept (none: they're kept only while the app is open).
// onRecent: called when that list changes, so the menu can be built again.
function createDesignFiles({ fs, path, dialog, listFile, recentFile = null, onRecent = () => {}, log = () => {} }) {
  let known = [];
  try { known = JSON.parse(fs.readFileSync(listFile, 'utf8')); if (!Array.isArray(known)) known = []; } catch (e) { known = []; }
  const key = (p) => path.resolve(p).toLowerCase();                    // Windows: one file, whatever the letter case
  let recent = [];
  try { recent = JSON.parse(fs.readFileSync(recentFile, 'utf8')); } catch (e) { recent = []; }
  if (!Array.isArray(recent)) recent = [];
  recent = recent.filter((p) => typeof p === 'string' && PROJECT.test(p)).slice(0, RECENT_MAX);
  function setRecent(list) {
    recent = list.slice(0, RECENT_MAX);
    if (recentFile) try { fs.writeFileSync(recentFile, JSON.stringify(recent)); } catch (e) { log('could not keep the recent files: ' + e.message); }
    try { onRecent(); } catch (e) { log('recent files: ' + e.message); }
  }
  // to the top of the list (and only once in it)
  function noteRecent(p) {
    if (typeof p !== 'string' || !PROJECT.test(p)) return false;
    const full = path.resolve(p), k = key(full);
    setRecent([full].concat(recent.filter((q) => key(q) !== k)));
    return true;
  }
  function remember(p) {
    const k = key(p);
    if (known.indexOf(k) >= 0) return;
    known.push(k);
    if (known.length > 500) known = known.slice(-500);
    try { fs.writeFileSync(listFile, JSON.stringify(known)); } catch (e) { log('could not keep the list of drawings: ' + e.message); }
  }
  function isDrawing(p) {
    try { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return !!(d && d.stock && Array.isArray(d.ents)); } catch (e) { return false; }
  }
  function mayWrite(p) {
    if (typeof p !== 'string' || !/\.json$/i.test(p)) return false;
    if (known.indexOf(key(p)) >= 0) return true;
    return fs.existsSync(p) && isDrawing(p);
  }
  // write beside it, then swap in: never half a file
  function writeWhole(p, text) {
    const tmp = p + '.saving';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, p);
  }
  return {
    // the Open window (or Import's): the chosen files, read, with their paths
    async open(win, kind) {
      const imp = kind === 'import';
      const r = await dialog.showOpenDialog(win, { title: imp ? 'Import' : 'Open', properties: ['openFile', 'multiSelections'], filters: imp ? IMPORT_FILTERS : OPEN_FILTERS });
      if (r.canceled || !r.filePaths || !r.filePaths.length) return [];
      r.filePaths.slice().reverse().forEach(noteRecent);              // projects only (noteRecent); the first one picked ends up on top
      return r.filePaths.map((p) => {
        if (/\.json$/i.test(p)) remember(p);
        return { path: p, name: path.basename(p), data: fs.readFileSync(p) };
      });
    },
    // Save as: the Save window, starting at the drawing's own file or name; then write it there
    async saveAs(win, text, suggested) {
      const r = await dialog.showSaveDialog(win, { title: 'Save as', defaultPath: suggested || 'design.454.json', filters: SAVE_FILTERS });
      if (r.canceled || !r.filePath) return null;
      let p = r.filePath;
      if (!/\.json$/i.test(p)) p += '.454.json';
      writeWhole(p, text);
      remember(p);
      noteRecent(p);
      return { path: p, name: path.basename(p) };
    },
    // Save: straight back to the drawing's file, if it may be written
    save(p, text) {
      if (!mayWrite(p)) return { ok: false, why: 'not a drawing file 454 Design opened or saved' };
      try { writeWhole(p, text); noteRecent(p); return { ok: true, path: p, name: path.basename(p) }; }
      catch (e) { return { ok: false, why: e.message }; }
    },
    // the recent files, newest first: [{path, name, dir}]
    recent() { return recent.map((p) => ({ path: p, name: path.basename(p), dir: path.dirname(p) })); },
    // open one of them again: {path, name, data}; {missing: true, name} if it's gone (and it's taken off the
    // list); null if it isn't on the list
    openRecent(p) {
      if (typeof p !== 'string') return null;
      const at = recent.findIndex((q) => key(q) === key(p));
      if (at < 0) return null;
      const full = recent[at], name = path.basename(full);
      let data;
      try { data = fs.readFileSync(full); }
      catch (e) { setRecent(recent.filter((q, i) => i !== at)); return { missing: true, name }; }
      if (/\.json$/i.test(full)) remember(full);
      noteRecent(full);
      return { path: full, name, data };
    },
    // a project opened another way (dropped on the window): onto the list, if it's a project that's there
    noteRecent(p) { return typeof p === 'string' && PROJECT.test(p) && fs.existsSync(p) ? noteRecent(p) : false; },
    clearRecent() { setRecent([]); },
    mayWrite,
  };
}

module.exports = { createDesignFiles, OPEN_FILTERS, SAVE_FILTERS, RECENT_MAX };
