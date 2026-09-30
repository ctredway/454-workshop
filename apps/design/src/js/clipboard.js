/* ---------------- copy, cut and paste ----------------
   Ctrl+C copies the selected shapes, Ctrl+X cuts them, Ctrl+V pastes them centred on the pointer (or 10 mm
   right and down from the original, if the pointer isn't over the drawing), and Ctrl+Shift+V pastes them
   exactly where they were copied from. The pasted shapes come in selected.

   Dimensions come too: every dimension whose shapes are all among those copied (a rectangle's width, the
   distance between two copied parts) is pasted measuring the copies. A dimension to a shape that wasn't
   copied stays with the original. Toolpaths don't come: they belong to the original shapes.

   What's copied is kept in the browser's storage, so it can be pasted into another 454 Design window, or
   after closing and reopening. It isn't put on the system clipboard: shapes aren't text. In a text box, the
   keys copy and paste text as usual. */
var CLIP_KEY = 'd454DesignClip';
var CLIP_OVER = false;           // is the pointer over the drawing? (where Ctrl+V puts the copy)
var CLIP_KEYED = 0;              // when a key last did it (the desktop app's Edit menu fires too: once is enough)
var CLIP_DIALOGS = ['nestModal', 'textModal', 'jobModal', 'settingsModal', 'dlgModal', 'toolModal', 'libModal', 'jsModal', 'impModal', 'woodModal'];
// a word on what happened, in the hint above the prompt, gone after a few seconds
function clipSay(t){
  showHint(t);
  setTimeout(function (){ var h = document.getElementById('promptHint'); if (h && h.textContent === t) h.classList.remove('on'); }, 3500);
}

function clipBBox(ents){
  var b = null;
  ents.forEach(function (e){
    var eb = entBBox(e);
    b = b ? {x0:Math.min(b.x0, eb.x0), y0:Math.min(b.y0, eb.y0), x1:Math.max(b.x1, eb.x1), y1:Math.max(b.y1, eb.y1)} : eb;
  });
  return b;
}
function clipRead(){
  try { var c = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); return c && c.ents && c.ents.length ? c : null; } catch (e) { return null; }
}
// The selection, as something to paste: the shapes (each remembering which shape it was, for the dimensions),
// and the dimensions that measure only copied shapes.
function clipBuild(){
  if (!SEL.length) return null;
  var src = SEL.map(function (i){ return DOC.ents[i]; }).filter(Boolean);
  var ids = src.map(function (e){ return entId(e); });
  var ents = src.map(function (e, k){ var c = cloneEnt(e); c._src = ids[k]; return c; });
  var dims = (DOC.dims || []).filter(function (d){
    return ids.indexOf(d.a) >= 0 && (d.b === undefined || ids.indexOf(d.b) >= 0);
  }).map(function (d){ return JSON.parse(JSON.stringify(d)); });
  return {v: 1, ents: ents, dims: dims, box: clipBBox(src)};
}
function clipCopy(){
  var clip = clipBuild();
  if (!clip) return false;
  var ents = clip.ents, dims = clip.dims;
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); }
  catch (e){ toast('err', 'Couldn’t copy', 'The browser’s storage is full. Save the drawing to a file, then try again.'); return false; }
  clipSay('Copied ' + clipSays(ents.length, dims.length) + '. Ctrl+V pastes at the pointer, Ctrl+Shift+V in place.');
  return true;
}
function clipSays(n, nd){
  return n + (n === 1 ? ' shape' : ' shapes') + (nd ? ', with ' + nd + (nd === 1 ? ' dimension' : ' dimensions') : '');
}
// Remove the selected shapes, and the dimensions that measured them (as Delete does).
function deleteSelection(){
  if (!SEL.length) return;
  pushUndo();
  var goneIds = SEL.map(function (si){ return DOC.ents[si] && DOC.ents[si]._id; }).filter(Boolean);
  SEL.slice().sort(function (a, b){ return b - a; }).forEach(function (si){ DOC.ents.splice(si, 1); });
  if (DOC.dims) DOC.dims = DOC.dims.filter(function (d){
    return goneIds.indexOf(d.a) < 0 && (d.b === undefined || goneIds.indexOf(d.b) < 0);
  });
  SEL = []; persist(); draw();
}
function clipCut(){
  if (!clipCopy()) return false;
  deleteSelection();
  return true;
}
// Paste: inPlace puts the copy exactly where it was copied from; otherwise its centre goes to the pointer.
function clipPaste(inPlace){
  var clip = clipRead();
  if (!clip){ clipSay('Nothing to paste: select shapes and press Ctrl+C first.'); return false; }
  var dx = 0, dy = 0, b = clip.box;
  if (!inPlace && b){
    if (CLIP_OVER){
      var p = MOUSE.snap || s2w(MOUSE.mx, MOUSE.my);
      dx = p.x - (b.x0 + b.x1) / 2; dy = p.y - (b.y0 + b.y1) / 2;
    } else { dx = 10; dy = -10; }
  }
  return clipInsert(clip, dx, dy, 'Pasted ');
}
// Duplicate (Ctrl+D): a copy of the selection, dimensions included, 10 mm right and down, without touching
// what Ctrl+C copied.
function clipDuplicate(){
  var clip = clipBuild();
  if (!clip) return false;
  return clipInsert(clip, 10, -10, 'Duplicated ');
}
// Put a copy into the drawing, moved by dx, dy, with its dimensions measuring the new shapes; select it.
function clipInsert(clip, dx, dy, said){
  pushUndo();
  layersInit();
  var newId = {}, sel = [];
  clip.ents.forEach(function (c){
    var e = cloneEnt(c), from = c._src;
    delete e._src;
    if (dx || dy) moveEntity(e, dx, dy);
    var L = layerById(e.layer);                       // its own layer if it's there to draw on; else the current one
    if (!L || !L.visible || L.locked) e.layer = DOC.activeLayer;
    sel.push(DOC.ents.length);
    DOC.ents.push(e);
    if (from) newId[from] = entId(e);
  });
  var nd = 0;
  (clip.dims || []).forEach(function (d0){
    if (!newId[d0.a] || (d0.b !== undefined && !newId[d0.b])) return;
    var d = JSON.parse(JSON.stringify(d0));
    d.a = newId[d0.a]; if (d0.b !== undefined) d.b = newId[d0.b];
    dimsArr().push(d); nd++;
  });
  SEL = sel;
  if (TOOL !== 'select') setTool('select');
  persist(); draw(); if (typeof updateReadout === 'function') updateReadout();
  clipSay(said + clipSays(sel.length, nd) + '.');
  return true;
}

function clipWire(){
  var cvEl = document.getElementById('cv');
  cvEl.addEventListener('pointerenter', function (){ CLIP_OVER = true; });
  cvEl.addEventListener('pointerleave', function (){ CLIP_OVER = false; });
  function inField(t){ return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  // the keys (in a browser, and in the desktop app)
  window.addEventListener('keydown', function (e){
    if (!(e.ctrlKey || e.metaKey) || e.altKey || inField(e.target)) return;
    if (CLIP_DIALOGS.some(function (id){ var m = document.getElementById(id); return m && !m.hidden; })) return;   // a dialog is open
    var k = e.key.toLowerCase(), done = false;
    if (k === 'c') done = clipCopy();
    else if (k === 'x') done = clipCut();
    else if (k === 'v'){ clipPaste(e.shiftKey); done = true; }
    else return;
    e.preventDefault();
    if (done || k === 'v') CLIP_KEYED = Date.now();
  });
  // the desktop app's Edit menu (Copy, Cut, Paste): the page gets the browser's copy, cut and paste events.
  // A key that's already done it fires these too, so they're ignored just after one.
  ['copy', 'cut', 'paste'].forEach(function (type){
    document.addEventListener(type, function (e){
      if (inField(e.target) || inField(document.activeElement)) return;
      if (Date.now() - CLIP_KEYED < 500) { e.preventDefault(); return; }
      if (type === 'paste'){ e.preventDefault(); clipPaste(false); }
      else if (SEL.length){ e.preventDefault(); if (type === 'copy') clipCopy(); else clipCut(); }
    });
  });
}
