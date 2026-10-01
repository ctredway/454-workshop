/* ---------------- undo ---------------- */
// A toolpath's moves can run to thousands of points, and they follow entirely from its settings
// and the shapes, so they are left out of anything stored and rebuilt when needed. Keeping them
// out matters: the browser's storage is small, and a full store fails silently.
function tpLean(list){
  return (list || []).map(function (tp) {
    var c = {};
    for (var k in tp) if (k !== 'moves' && k !== 'holes' && k !== 'preview' && k !== 'previewHoles') c[k] = tp[k];
    return c;
  });
}
function tpRebuildAll(){
  if (!DOC.toolpaths || !DOC.toolpaths.length) return;
  if (typeof camReady === 'function' && camReady()) DOC.toolpaths.forEach(function (tp) { tpGenerate(tp); });
}
function docForStorage(pretty){
  var copy = {};
  for (var k in DOC) copy[k] = DOC[k];
  copy.toolpaths = tpLean(DOC.toolpaths);
  if (DOC.imageData){                                  // only the pictures still in the drawing
    copy.imageData = {};
    (DOC.images || []).forEach(function (im) { if (DOC.imageData[im.id]) copy.imageData[im.id] = DOC.imageData[im.id]; });
  }
  return pretty ? JSON.stringify(copy, null, 1) : JSON.stringify(copy);
}
function docSnap(){ return JSON.stringify({ents:DOC.ents, guides:DOC.guides, dims:DOC.dims || [], params:DOC.params || [], toolpaths:tpLean(DOC.toolpaths), vcConverted: !!DOC.vcConverted, stock: DOC.stock,
  layers: DOC.layers, activeLayer: DOC.activeLayer, images: DOC.images, sheets: DOC.sheets || null}); }
function docRestore(str){
  var s=JSON.parse(str); DOC.ents=s.ents; DOC.guides=s.guides; DOC.dims=s.dims || []; DOC.params=s.params || [];
  DOC.vcConverted = !!s.vcConverted;
  if (s.stock) DOC.stock = s.stock;
  if (s.layers){ DOC.layers = s.layers; DOC.activeLayer = s.activeLayer; DOC.images = s.images || []; }
  if (s.sheets) DOC.sheets = s.sheets; else delete DOC.sheets;      // which sheet is shown isn't an edit: kept if it's still there
  sheetsInit();
  if (typeof renderLayers === 'function') setTimeout(renderLayers, 0);
  // Showing, hiding and ticking aren't edits, so undo leaves them as they are now.
  var keep = {};
  (DOC.toolpaths || []).forEach(function (tp) { keep[tp.id] = {hidden: tp.hidden, exclude: tp.exclude}; });
  DOC.toolpaths = s.toolpaths || [];
  DOC.toolpaths.forEach(function (tp) { if (keep[tp.id]){ tp.hidden = keep[tp.id].hidden; tp.exclude = keep[tp.id].exclude; } });
  tpRebuildAll();
  if (typeof renderToolpathPanel === 'function') renderToolpathPanel();
}
function pushUndo(){ if (typeof DRY !== 'undefined' && DRY) return; UNDO.push(docSnap()); if (UNDO.length>200) UNDO.shift(); REDO = []; }
function doUndo(){ if (!UNDO.length) return; REDO.push(docSnap()); docRestore(UNDO.pop()); SEL=[]; draw(); persist(); }
function doRedo(){ if (!REDO.length) return; UNDO.push(docSnap()); docRestore(REDO.pop()); SEL=[]; draw(); persist(); }

