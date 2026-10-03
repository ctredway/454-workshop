/* ---------------- unsaved drawings ----------------
   Design keeps the drawing in the browser's storage as you work (persist()), so it's there next time. That
   isn't a file. This tracks whether the drawing has been saved to a file since it last changed, and asks
   before closing one that hasn't: the desktop app asks Save, Don't save or Cancel (apps/desktop/src/main.js
   calls designCloseSave() and designCloseDiscard() below); a browser shows its own warning.

   A drawing that's put aside unsaved (Don't save on closing, New, or opening another drawing) is kept, one
   at a time: File > Recover last drawing brings it back. Recovering swaps it with the drawing that's open,
   if that one is unsaved too, so nothing is lost either way. */
var UNSAVED_KEY = 'd454DesignUnsaved', ASIDE_KEY = 'd454DesignAside', NAME_KEY = 'd454DesignName';
var UNSAVED = null;               // this session's answer; null until something changes (then storage's is used)
var CLOSE_ANYWAY = false;         // Don't save couldn't put the drawing aside: close, and keep it as it is
// The file this drawing was last saved to or opened from, where the browser lets Design write to it again
// (Save As, or Open, in Chrome, Edge and the desktop app). Save (Ctrl+S) then saves straight to it. Only for
// as long as Design is open: a page can't keep hold of a file between sessions.
var SAVE_HANDLE = null, OPEN_HANDLE = null;
// In the desktop app, better: files are opened and saved by their path (apps/desktop/src/design-files.js), and
// the drawing's file is remembered, so Save goes back to it even after Design is closed and opened again.
var PATH_KEY = 'd454DesignPath', OPEN_PATH = null;
function desktopFiles(){ return window.desktop454 && window.desktop454.files ? window.desktop454.files : null; }
function baseName(p){                                  // the file's name, from a Windows or other path
  var s = String(p || ''), cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf(String.fromCharCode(92)));
  return s.slice(cut + 1);
}
// a different drawing from here on: Save doesn't go to the last one's file
function forgetFile(){ SAVE_HANDLE = null; lsDel(PATH_KEY); }
var DESIGN_IMPORT = null;          // Design's own file reading (set up in wire()): drawings, VCarve, DXF, SVG, images

function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} }

// Something worth saving: an empty drawing has nothing to lose.
function docHasWork(d){
  d = d || DOC;
  return !!((d.ents && d.ents.length) || (d.guides && d.guides.length) || (d.dims && d.dims.length) ||
            (d.toolpaths && d.toolpaths.length) || (d.images && d.images.length) ||
            // sheets added, or parameters made, are work too: without these, a drawing with only sheets in it
            // looked empty, and New did nothing, so the sheets stayed
            (d.sheets && d.sheets.length > 1) || (d.params && d.params.length));
}
function drawingUnsaved(){
  var u = UNSAVED !== null ? UNSAVED : lsGet(UNSAVED_KEY) === '1';
  return u && docHasWork();
}
function markUnsaved(){ UNSAVED = true; lsSet(UNSAVED_KEY, '1'); }
// Saved to a file (name: the file's), or nothing left to save (no name: the drawing's file is forgotten).
function markSaved(name){
  UNSAVED = false; lsDel(UNSAVED_KEY);
  if (name) lsSet(NAME_KEY, name); else lsDel(NAME_KEY);
}
function drawingFileName(){ return lsGet(NAME_KEY) || 'design.454.json'; }

// ---- the drawing put aside
function asideRead(){
  try { var a = JSON.parse(lsGet(ASIDE_KEY) || 'null'); return a && a.doc && a.doc.stock ? a : null; } catch (e) { return null; }
}
// What to put aside if the drawing that's open is about to be replaced: only an unsaved one (a saved one is in
// its file). Taken before the drawing changes; kept with asideKeep() after, once the storage it used is free.
function asideTake(){
  return drawingUnsaved() ? JSON.stringify({ at: Date.now(), name: lsGet(NAME_KEY), doc: JSON.parse(docForStorage()) }) : null;
}
function asideKeep(taken){
  if (!taken) return true;
  var ok = lsSet(ASIDE_KEY, taken);
  syncRecoverBtn();
  return ok;
}
function asideWhen(a){
  var d = new Date(a.at);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' +
         d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function syncRecoverBtn(){
  var b = document.getElementById('recoverBtn');
  if (!b) return;
  var a = asideRead();
  b.disabled = !a;
  b.title = a ? 'Recover last drawing — bring back the drawing put aside unsaved on ' + asideWhen(a) +
                (a.name ? ' (' + a.name + ')' : '') + '. If the drawing open now is unsaved, the two swap places.'
              : 'Recover last drawing — nothing to recover. A drawing closed without saving (Don’t save), cleared with New, or replaced by opening another is kept here.';
}

// A drawing that isn't this one: New's empty drawing (the material and job setup stay), or one from a file.
// Everything else that belongs to the drawing goes: a new one used to keep the old one's sheets, its
// parameters, and its name (which named the G-code files and the job sheet).
function clearDrawing(){
  DOC.sheets = []; delete DOC.activeSheet;            // one sheet again
  DOC.params = [];                                    // named sizes, made for the drawing that had them
  delete DOC.name;
  DOC.ents = [];
  DOC.guides = [];
  DOC.dims = [];
  DOC.vcToolpaths = [];
  DOC.vcConverted = false; DOC.vcPreview = [];
  DOC.layers = null; DOC.images = []; DOC.imageData = {}; layersInit();
  DOC.toolpaths = [];
  CUTSEL = null;
  renderToolpathPanel();
  SEL.length = 0;
}
function newDrawing(){
  if (!docHasWork()) return;
  var aside = asideTake();
  pushUndo();
  clearDrawing();
  setTool('select');
  persist();
  markSaved(null); forgetFile();
  if (!asideKeep(aside)) toast('warn', 'The last drawing couldn’t be kept for Recover', 'The browser’s storage is full. Undo (Ctrl+Z) brings it back until you close 454 Design.');
  fit();
  jobOpen();                                          // a new drawing starts by saying what it's for
}
function openDrawing(d, name){
  var aside = asideTake();
  pushUndo(); DOC = d; syncStockUI(); persist(); markSaved(name);
  SAVE_HANDLE = OPEN_HANDLE && OPEN_HANDLE.name === name ? OPEN_HANDLE : null;   // opened through Open: Save writes it back
  OPEN_HANDLE = null;
  if (OPEN_PATH && baseName(OPEN_PATH) === name) lsSet(PATH_KEY, OPEN_PATH); else lsDel(PATH_KEY);   // the desktop app: by path
  OPEN_PATH = null;
  // its toolpaths come saved as settings only: build them, and show them and its layers now (they used to
  // wait for the Toolpaths panel's refresh button)
  SEL.length = 0; CUTSEL = null;
  tpRebuildAll(); renderToolpathPanel(); renderLayers();
  if (!asideKeep(aside)) toast('warn', 'The last drawing couldn’t be kept for Recover', 'The browser’s storage is full. Undo (Ctrl+Z) brings it back until you close 454 Design.');
  fit();
}
function recoverDrawing(){
  var a = asideRead();
  if (!a) return;
  var swap = asideTake();                             // the open drawing takes its place, if it's unsaved
  pushUndo();
  DOC = a.doc; SEL.length = 0; CUTSEL = null;
  if (swap) lsSet(ASIDE_KEY, swap); else lsDel(ASIDE_KEY);
  if (a.name) lsSet(NAME_KEY, a.name); else lsDel(NAME_KEY);
  forgetFile();                                       // a different drawing: its file isn't the one open before
  syncStockUI(); tpRebuildAll(); renderToolpathPanel(); renderLayers();
  persist();                                          // it was put aside unsaved, so it's unsaved again
  syncRecoverBtn(); fit(); draw();
  toast('ok', 'Drawing recovered', 'Put aside on ' + asideWhen(a) + '.' + (swap ? ' The drawing that was open is kept in its place: Recover again swaps them back.' : ''));
}

// ---- saving to a file: a real Save As where there is one, so a cancelled save isn't taken for a saved one.
// Save (Ctrl+S, the Save button): straight to the drawing's file if Design may write to it, else Save As.
// asNew (Ctrl+Shift+S): always Save As. True once saved.
function saveDrawing(asNew){
  var text = docForStorage(true), name = drawingFileName();
  var DF = desktopFiles();
  if (DF){                                            // the desktop app: by path
    var sp = lsGet(PATH_KEY);
    var saveAs = function (){
      return DF.saveAs(text, sp || name).then(function (r){
        if (!r) return false;                         // Cancel in the Save window
        lsSet(PATH_KEY, r.path); markSaved(r.name); toast('ok', 'Drawing saved', r.name); return true;
      }, function (e){ toast('err', 'The drawing wasn’t saved', (e && e.message) || String(e)); return false; });
    };
    if (!asNew && sp){
      return DF.save(sp, text).then(function (r){
        if (r && r.ok){ markSaved(r.name); toast('ok', 'Drawing saved', r.name); return true; }
        lsDel(PATH_KEY); return saveAs();             // moved, deleted, or not one it may write: ask where
      }, function (){ lsDel(PATH_KEY); return saveAs(); });
    }
    return saveAs();
  }
  if (!asNew && SAVE_HANDLE){
    var h0 = SAVE_HANDLE;
    return h0.createWritable()
      .then(function (w){ return w.write(text).then(function (){ return w.close(); }); })
      .then(function (){ markSaved(h0.name); toast('ok', 'Drawing saved', h0.name); return true; })
      .catch(function (e){                             // not allowed to write it after all (or it's gone): ask where
        if (e && e.name === 'AbortError' && !/write|permission/i.test(e.message || '')) return false;
        SAVE_HANDLE = null;
        return saveDrawing(true);
      });
  }
  if (window.showSaveFilePicker){
    return window.showSaveFilePicker({ id: 'design', suggestedName: name,
      types: [{ description: '454 Design drawing', accept: { 'application/json': ['.json'] } }] })
      .then(function (h){
        return h.createWritable()
          .then(function (w){ return w.write(text).then(function (){ return w.close(); }); })
          .then(function (){ markSaved(h.name); SAVE_HANDLE = h; toast('ok', 'Drawing saved', h.name); return true; });
      })
      .catch(function (e){
        if (e && e.name === 'AbortError') return false;          // Cancel in the Save As window
        toast('err', 'The drawing wasn’t saved', (e && e.message) || String(e));
        return false;
      });
  }
  // browsers without a Save As for pages (Firefox, Safari): a download, which they keep in Downloads
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  markSaved(name);
  return Promise.resolve(true);
}

// ---- opening: the browser's Open window where there is one, so a drawing opened here can be saved back to
// its file with Save; otherwise (Firefox, Safari) the page's file picker, as before.
// Open is for a drawing, or a project from VCarve or Carbide Create: it takes the place of the one open.
// Import brings vectors (DXF, SVG) into the drawing that's open, or a picture to trace.
var OPEN_TYPES = [{ description: 'Drawings, and VCarve and Carbide Create projects', accept: { 'application/octet-stream': ['.json', '.crv', '.c2d'] } }];
var IMPORT_TYPES = [{ description: 'DXF and SVG drawings, and pictures to trace',
  accept: { 'application/octet-stream': ['.dxf', '.svg'], 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'] } }];
var OPEN_ACCEPT = { open: '.json,.crv,.c2d', import: '.dxf,.svg,.png,.jpg,.jpeg,.gif,.bmp,.webp' };
function openFiles(kind){
  kind = kind === 'import' ? 'import' : 'open';
  var DF = desktopFiles();
  if (DF){                                            // the desktop app: by path, so Save can go back to it
    return DF.open(kind).then(function (items){
      if (!items || !items.length) return false;
      OPEN_PATH = items.length === 1 && /\.json$/i.test(items[0].name) ? items[0].path : null;   // kept if it turns out to be a drawing
      DESIGN_IMPORT(items.map(function (it){ return new File([it.data], it.name); }));
      return true;
    }, function (e){ toast('err', 'Couldn’t open that', (e && e.message) || String(e)); return false; });
  }
  if (!window.showOpenFilePicker){
    var inp = document.getElementById('loadFile');
    inp.setAttribute('accept', OPEN_ACCEPT[kind]);
    inp.click(); return Promise.resolve(false);
  }
  return window.showOpenFilePicker({ id: 'design' + (kind === 'import' ? '-import' : ''), multiple: true, types: kind === 'import' ? IMPORT_TYPES : OPEN_TYPES })
    .then(function (hs){
      return Promise.all(hs.map(function (h){ return h.getFile(); })).then(function (files){
        OPEN_HANDLE = hs.length === 1 && /\.json$/i.test(hs[0].name) ? hs[0] : null;   // kept if it turns out to be a drawing
        DESIGN_IMPORT(files);
        return true;
      });
    })
    .catch(function (e){ if (!(e && e.name === 'AbortError')) toast('err', 'Couldn’t open that', (e && e.message) || String(e)); return false; });
}

// A drawing dropped on the window, in the desktop app: remember where it is, so Save goes back to it.
function droppedFiles(files){
  var DF = desktopFiles();
  OPEN_PATH = DF && files && files.length === 1 && /\.json$/i.test(files[0].name) ? (DF.pathOf(files[0]) || null) : null;
}

// ---- closing (the desktop app asks; these are its answers)
// Save…: true once it's saved, false if the Save As was cancelled (then the window stays open).
function designCloseSave(){ return saveDrawing(); }
// Don't save: put the drawing aside and start the next session empty. If it can't be put aside (storage
// full), it's kept as it is instead, and comes back next time: never lost. Always lets the window close.
function designCloseDiscard(){
  CLOSE_ANYWAY = true;
  if (!drawingUnsaved()) return true;
  var aside = asideTake(), before = docForStorage();
  clearDrawing(); persist(); markSaved(null); forgetFile();
  if (!asideKeep(aside)){ DOC = JSON.parse(before); persist(); markUnsaved(); }
  return true;
}
function unsavedWire(){
  // A browser shows its own "Leave site?" warning; the desktop app shows Save, Don't save, Cancel instead.
  window.addEventListener('beforeunload', function (e){
    if (CLOSE_ANYWAY || !drawingUnsaved()) return;
    e.preventDefault(); e.returnValue = '';
  });
  syncRecoverBtn();
}
