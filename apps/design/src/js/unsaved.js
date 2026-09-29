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

function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} }

// Something worth saving: an empty drawing has nothing to lose.
function docHasWork(d){
  d = d || DOC;
  return !!((d.ents && d.ents.length) || (d.guides && d.guides.length) || (d.dims && d.dims.length) ||
            (d.toolpaths && d.toolpaths.length) || (d.images && d.images.length));
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
function clearDrawing(){
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
  markSaved(null);
  if (!asideKeep(aside)) toast('warn', 'The last drawing couldn’t be kept for Recover', 'The browser’s storage is full. Undo (Ctrl+Z) brings it back until you close 454 Design.');
  fit();
  jobOpen();                                          // a new drawing starts by saying what it's for
}
function openDrawing(d, name){
  var aside = asideTake();
  pushUndo(); DOC = d; syncStockUI(); persist(); markSaved(name);
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
  syncStockUI(); tpRebuildAll(); renderToolpathPanel(); renderLayers();
  persist();                                          // it was put aside unsaved, so it's unsaved again
  syncRecoverBtn(); fit(); draw();
  toast('ok', 'Drawing recovered', 'Put aside on ' + asideWhen(a) + '.' + (swap ? ' The drawing that was open is kept in its place: Recover again swaps them back.' : ''));
}

// ---- saving to a file: a real Save As where there is one, so a cancelled save isn't taken for a saved one
function saveDrawing(){
  var text = docForStorage(true), name = drawingFileName();
  if (window.showSaveFilePicker){
    return window.showSaveFilePicker({ id: 'design', suggestedName: name,
      types: [{ description: '454 Design drawing', accept: { 'application/json': ['.json'] } }] })
      .then(function (h){
        return h.createWritable()
          .then(function (w){ return w.write(text).then(function (){ return w.close(); }); })
          .then(function (){ markSaved(h.name); toast('ok', 'Drawing saved', h.name); return true; });
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

// ---- closing (the desktop app asks; these are its answers)
// Save…: true once it's saved, false if the Save As was cancelled (then the window stays open).
function designCloseSave(){ return saveDrawing(); }
// Don't save: put the drawing aside and start the next session empty. If it can't be put aside (storage
// full), it's kept as it is instead, and comes back next time: never lost. Always lets the window close.
function designCloseDiscard(){
  CLOSE_ANYWAY = true;
  if (!drawingUnsaved()) return true;
  var aside = asideTake(), before = docForStorage();
  clearDrawing(); persist(); markSaved(null);
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
