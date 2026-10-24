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
// Worked-out toolpaths, kept to be used again. Undo stores toolpaths without their moves, so it used to work every
// toolpath out again: 10 seconds a step on a VCarve tutorial's inlay. A toolpath's moves follow from its settings,
// its shapes and the material (tpSignature and tpStockSig, which also cover a clean-up's larger pocket and a
// V-carve's clearing pocket), so moves worked out for exactly those can be used again. The key is all of it: every
// setting but those that don't change the moves (its name, group, whether it's shown, ticked or folded) and those
// worked out from the rest. Anything else that differs, a setting added later included, means working it out again.
var TP_DONE = {}, TP_DONE_KEYS = [], TP_DONE_MAX = 200;
var TP_NOT_SETTINGS = {moves: 1, holes: 1, preview: 1, previewHoles: 1, past: 1, sig: 1, warning: 1, vcNote: 1, vcFloor: 1, vcDepth: 1, vcFlat: 1,
                       rings: 1, restRuns: 1, islands: 1, rasterLines: 1, floorLeft: 1, name: 1, group: 1, hidden: 1, exclude: 1, folded: 1,
                       // set after it's worked out (Make editable records them then), and not part of its own moves: its sheet
                       // follows its shapes; a clearing pocket's V-carve is in that V-carve's own signature
                       sheet: 1, clearFor: 1};
function tpDoneKey(tp, sig){
  var keys = Object.keys(tp).filter(function (k) { return !TP_NOT_SETTINGS[k]; }).sort(), o = {};
  keys.forEach(function (k) { o[k] = tp[k]; });
  return sig + ' # ' + JSON.stringify(o);
}
// after a toolpath is worked out: keep it (the last TP_DONE_MAX)
function tpDoneKeep(tp){
  if (!tp || !tp.moves || !tp.sig || (typeof DRY !== 'undefined' && DRY)) return;
  var k = tpDoneKey(tp, tp.sig);
  if (!TP_DONE[k]) TP_DONE_KEYS.push(k);
  TP_DONE[k] = {moves: tp.moves, holes: tp.holes, warning: tp.warning, vcNote: tp.vcNote, vcFloor: tp.vcFloor, vcDepth: tp.vcDepth, vcFlat: tp.vcFlat,
                rings: tp.rings, restRuns: tp.restRuns, islands: tp.islands, rasterLines: tp.rasterLines};
  while (TP_DONE_KEYS.length > TP_DONE_MAX) delete TP_DONE[TP_DONE_KEYS.shift()];
}
// the same toolpath, worked out before for exactly these settings, shapes and material: its moves and what came
// with them, put back. True if it was there.
function tpDoneReuse(tp){
  var sig = tpSignature(tp.ents) + tpStockSig(tp), d = TP_DONE[tpDoneKey(tp, sig)];
  if (!d) return false;
  for (var f in d) tp[f] = d[f];
  tp.sig = sig;
  tp.past = camReady() ? tpPastMaterial(tp) : null;      // (from the material's thickness as it is now)
  return true;
}
// Every toolpath's moves, after undo, opening a drawing, or a change that can move shapes between sheets or layers.
// Those worked out before for the same settings, shapes and material come straight back. The rest are worked out
// with the Working panel, one at a time ("2 of 5: Pocket"), and the panel and drawing are refreshed after. Returns
// a promise, resolved at once if nothing needed working out.
function tpRebuildAll(){
  if (!DOC.toolpaths || !DOC.toolpaths.length || !(typeof camReady === 'function' && camReady())) return Promise.resolve();
  var need = DOC.toolpaths.filter(function (tp) { return !tpDoneReuse(tp); });
  if (!need.length) return Promise.resolve();
  if (typeof busyRun !== 'function'){ need.forEach(function (tp) { tpGenerate(tp); }); return Promise.resolve(); }
  // meanwhile: no moves, so nothing is drawn for it and the cards don't work it out on their own (they skip a
  // toolpath without moves), and out of date: what needs its moves (Save G-code, the job sheet, Preview in wood)
  // works it out first
  need.forEach(function (tp) { tp.moves = null; tp.holes = null; tp.sig = ''; });
  return busyRun('Working out the toolpaths…', need.map(function (tp) {
    return {label: tp.name, fn: function () { if (DOC.toolpaths.indexOf(tp) >= 0) tpGenerate(tp); }};
  })).then(function () { if (typeof renderToolpathPanel === 'function') renderToolpathPanel(); draw(); });
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
function docRestore(str){
  var s=JSON.parse(str); DOC.ents=s.ents; DOC.guides=s.guides; DOC.dims=s.dims || []; DOC.params=s.params || []; DOC.keeps=s.keeps || [];
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
  DOC.tpGroups = s.tpGroups || [];
  DOC.toolpaths.forEach(function (tp) { if (keep[tp.id]){ tp.hidden = keep[tp.id].hidden; tp.exclude = keep[tp.id].exclude; } });
  tpRebuildAll();
  if (typeof renderToolpathPanel === 'function') renderToolpathPanel();
}
