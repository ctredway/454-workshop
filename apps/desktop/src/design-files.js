// 454 Design's files, in the desktop app: opened and saved by their path, so Save goes straight back to the
// file a drawing came from, and still does after Design is closed and opened again. (In a browser, Design
// uses the browser's own file access instead, which can't keep hold of a file between sessions.)
//
// What it may write, to be safe with a page asking: only a .json file you picked in its Open or Save window
// (remembered in the app's data folder), or an existing 454 Design drawing. It writes a temporary file beside
// it and then swaps it in, so a crash or power cut part-way through can't leave half a drawing.
//
// Everything outside (the dialogs, the file system, where it keeps its list) is passed in, so the rules can be
// tested on their own (test/design-files.test.mjs).
'use strict';

const OPEN_FILTERS = [
  { name: 'Drawings, VCarve projects, DXF, SVG and images', extensions: ['json', 'crv', 'dxf', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
  { name: 'All files', extensions: ['*'] },
];
const SAVE_FILTERS = [{ name: '454 Design drawing', extensions: ['json'] }];

function createDesignFiles({ fs, path, dialog, listFile, log = () => {} }) {
  let known = [];
  try { known = JSON.parse(fs.readFileSync(listFile, 'utf8')); if (!Array.isArray(known)) known = []; } catch (e) { known = []; }
  const key = (p) => path.resolve(p).toLowerCase();                    // Windows: one file, whatever the letter case
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
    // the Open window: the chosen files, read, with their paths
    async open(win) {
      const r = await dialog.showOpenDialog(win, { title: 'Open', properties: ['openFile', 'multiSelections'], filters: OPEN_FILTERS });
      if (r.canceled || !r.filePaths || !r.filePaths.length) return [];
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
      return { path: p, name: path.basename(p) };
    },
    // Save: straight back to the drawing's file, if it may be written
    save(p, text) {
      if (!mayWrite(p)) return { ok: false, why: 'not a drawing file 454 Design opened or saved' };
      try { writeWhole(p, text); return { ok: true, path: p, name: path.basename(p) }; }
      catch (e) { return { ok: false, why: e.message }; }
    },
    mayWrite,
  };
}

module.exports = { createDesignFiles, OPEN_FILTERS, SAVE_FILTERS };
