// ---- sheets ----
// A multi-sheet VCarve project is several jobs sharing one drawing space. Each sheet is a layer
// (marked sheet: true); one is shown at a time; each toolpath belongs to one sheet; Save G-code saves
// the chosen sheet only, so a file can never put two sheets' parts on one piece of material.
function sheetLayers(){ return (DOC.layers || []).filter(function (l) { return l.sheet; }); }
function multiSheet(){ return sheetLayers().length > 1; }
function sheetsFromCrv(ex){
  var used = [];
  (ex.contourSheets || []).forEach(function (id) { if (id && used.indexOf(id) < 0) used.push(id); });
  if (used.length < 2) return null;
  var named = {}; (ex.sheets || []).forEach(function (sh) { named[sh.id] = sh.name; });
  var layers = used.map(function (id, k) {
    return {id: 'S' + (k + 1), name: named[id] || ('Sheet ' + (k + 1)), visible: k === 0, locked: false, sheet: true, vcSheet: id};
  });
  DOC.layers = layers;
  DOC.ents.forEach(function (e) {
    var L = e.vcSheet ? layers.filter(function (l) { return l.vcSheet === e.vcSheet; })[0] : null;
    e.layer = (L || layers[0]).id;
  });
  DOC.activeLayer = DOC.activeSheet = layers[0].id;
  return layers;
}
// the sheet a toolpath belongs to: its own, or where most of its shapes are
function tpSheetOf(tp){
  if (!multiSheet()) return null;
  if (tp.sheet) return tp.sheet;
  var count = {};
  (tp.ents || []).forEach(function (id) { var e = entById(id); if (e && e.layer) count[e.layer] = (count[e.layer] || 0) + 1; });
  var best = null; Object.keys(count).forEach(function (k) { if (!best || count[k] > count[best]) best = k; });
  return best || DOC.activeSheet;
}
function sheetShow(id){
  if (!multiSheet()) return;
  sheetLayers().forEach(function (l) { l.visible = l.id === id; });
  DOC.activeSheet = DOC.activeLayer = id;
  SEL = [];
  persist(); renderLayers(); renderToolpathPanel(); draw();
}
function sheetBar(){
  var bar = document.getElementById('tpSheetBar');
  if (!bar) return;
  var sh = sheetLayers();
  bar.hidden = sh.length < 2;
  if (sh.length < 2) return;
  if (!sh.some(function (l) { return l.id === DOC.activeSheet; })) DOC.activeSheet = sh[0].id;
  var sel = document.getElementById('tpSheet');
  sel.innerHTML = '';
  sh.forEach(function (l) {
    var o2 = document.createElement('option'); o2.value = l.id;
    var n2 = tpList().filter(function (tp) { return tpSheetOf(tp) === l.id; }).length;
    o2.textContent = l.name + (n2 ? ' (' + n2 + (n2 === 1 ? ' toolpath)' : ' toolpaths)') : '');
    sel.appendChild(o2);
  });
  sel.value = DOC.activeSheet;
}
