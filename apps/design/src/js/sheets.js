// ---- sheets ----
// A project can have several sheets: several pieces of material, cut one after another. They share one drawing
// space and one Job setup (size, thickness, zero). Each shape is on one sheet (e.sheet); one sheet is shown at a
// time; each toolpath belongs to one sheet; and Save G-code saves the chosen sheet only, so a file can never
// put two sheets' parts on one piece of material. Sheets are separate from layers: every sheet has every layer.
// A drawing with no DOC.sheets, or just one, is a single job. Sheets come from a multi-sheet VCarve project,
// or from Add sheet.
function sheetList(){ return DOC.sheets || []; }
function sheetById(id){ return sheetList().filter(function (s) { return s.id === id; })[0] || null; }
function sheetTitle(id){ var s = sheetById(id); return s ? s.name : ''; }
function multiSheet(){ return sheetList().length > 1; }
// Is this shape on the sheet being shown? (Always, in a single-sheet drawing.)
function entOnSheet(e){ return !multiSheet() || !e.sheet || e.sheet === DOC.activeSheet; }
// Keeps the sheets consistent; run wherever layersInit is, and before anything changes sheets.
function sheetsInit(){
  // drawings saved before 0.113.0 kept each sheet as a layer (sheet: true): its shapes move to an ordinary layer
  var old = (DOC.layers || []).filter(function (l) { return l.sheet; });
  if (old.length){
    DOC.sheets = old.map(function (l) { return {id: l.id, name: l.name}; });      // the ids toolpaths already use
    DOC.layers = DOC.layers.filter(function (l) { return !l.sheet; });
    if (!DOC.layers.length) DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}];
    var isOld = {}; old.forEach(function (l) { isOld[l.id] = true; });
    (DOC.ents || []).forEach(function (e) { if (isOld[e.layer]){ e.sheet = e.layer; e.layer = DOC.layers[0].id; } });
    if (isOld[DOC.activeLayer]) DOC.activeLayer = DOC.layers[0].id;
  }
  if (!sheetList().length){ delete DOC.sheets; delete DOC.activeSheet; return; }
  if (!sheetById(DOC.activeSheet)) DOC.activeSheet = DOC.sheets[0].id;
  if (multiSheet()) (DOC.ents || []).forEach(function (e) { if (!sheetById(e.sheet)) e.sheet = DOC.activeSheet; });   // new shapes go on the sheet being shown
}
function sheetsFromCrv(ex){
  var used = [];
  (ex.contourSheets || []).forEach(function (id) { if (id && used.indexOf(id) < 0) used.push(id); });
  if (used.length < 2) return null;
  var named = {}; (ex.sheets || []).forEach(function (sh) { named[sh.id] = sh.name; });
  var sheets = used.map(function (id, k) { return {id: 'S' + (k + 1), name: named[id] || ('Sheet ' + (k + 1)), vcSheet: id}; });
  DOC.sheets = sheets;
  DOC.ents.forEach(function (e) {
    var s = e.vcSheet ? sheets.filter(function (x) { return x.vcSheet === e.vcSheet; })[0] : null;
    e.sheet = (s || sheets[0]).id;
  });
  DOC.activeSheet = sheets[0].id;
  return sheets;
}
// the sheet a toolpath belongs to: its own, or where most of its shapes are
function tpSheetOf(tp){
  if (!multiSheet()) return null;
  if (tp.sheet && sheetById(tp.sheet)) return tp.sheet;
  var count = {};
  (tp.ents || []).forEach(function (id) { var e = entById(id); if (e && sheetById(e.sheet)) count[e.sheet] = (count[e.sheet] || 0) + 1; });
  var best = null; Object.keys(count).forEach(function (k) { if (!best || count[k] > count[best]) best = k; });
  return best || DOC.activeSheet;
}
function tpOnSheet(tp){ return !multiSheet() || tpSheetOf(tp) === DOC.activeSheet; }
// the sheets its shapes are on (a toolpath's shapes must all be on one)
function sheetsOfEnts(ids){
  var out = [];
  (ids || []).forEach(function (id) { var e = entById(id); if (e && sheetById(e.sheet) && out.indexOf(e.sheet) < 0) out.push(e.sheet); });
  return out;
}
// a dimension shows with the shapes it measures
function dimOnSheet(d){
  if (!multiSheet()) return true;
  var e = d && d.a !== undefined ? entById(d.a) : null;
  return !e || entOnSheet(e);
}
// The toolpath editor is working on this sheet's shapes: sheets wait until it's closed
function sheetBusy(){
  if (typeof CUT === 'undefined' || !CUT) return false;
  toast('info', 'Finish the toolpath first', 'Press Create or Cancel in the toolpath editor, then change sheets.');
  sheetBar();
  return true;
}
function sheetShow(id){
  sheetsInit();
  if (!multiSheet() || !sheetById(id) || sheetBusy()) return;
  DOC.activeSheet = id;
  SEL = []; CUTSEL = null; DIMSEL = null;
  persist(); renderLayers(); renderToolpathPanel(); draw();
}
// Add a sheet, and show it. The first time, what's drawn so far becomes Sheet 1.
function sheetAdd(){
  if (sheetBusy()) return null;
  pushUndo();
  sheetsInit();
  if (!sheetList().length){ DOC.sheets = [{id: 'S1', name: 'Sheet 1'}]; DOC.activeSheet = 'S1'; }
  var here = DOC.activeSheet;
  DOC.ents.forEach(function (e) { if (!sheetById(e.sheet)) e.sheet = here; });              // everything so far stays where it is
  tpList().forEach(function (tp) { if (!sheetById(tp.sheet)) tp.sheet = sheetsOfEnts(tp.ents)[0] || here; });
  var n = 1; while (sheetById('S' + n)) n++;
  var used = {}; DOC.sheets.forEach(function (s) { var m = /^Sheet (\d+)$/.exec(s.name); if (m) used[+m[1]] = true; });
  var k = 1; while (used[k]) k++;
  var s = {id: 'S' + n, name: 'Sheet ' + k};
  DOC.sheets.push(s);
  sheetShow(s.id);
  toast('ok', s.name + ' added', 'It’s empty. Draw on it, or cut shapes from another sheet (Ctrl+X) and paste them here in place (Ctrl+Shift+V). ' +
        'Every sheet uses the material in Job setup, and has its own toolpaths and its own G-code.');
  return s.id;
}
// '' if the name can be used, or why not
function sheetNameProblem(id, name){
  if (!name) return 'A sheet needs a name.';
  if (sheetList().some(function (s) { return s.id !== id && s.name.toLowerCase() === name.toLowerCase(); })) return 'There’s already a sheet called “' + name + '”.';
  return '';
}
function sheetRename(id, name){
  var s = sheetById(id); name = String(name || '').trim();
  if (!s || name === s.name) return true;
  var why = sheetNameProblem(id, name);
  if (why){ toast('warn', 'Not renamed', why); return false; }
  pushUndo();
  s.name = name;
  persist(); renderToolpathPanel();
  return true;
}
function sheetCount(id){ return DOC.ents.filter(function (e) { return e.sheet === id && !e.tp; }).length; }
// Delete a sheet with its shapes and toolpaths, after asking if there's anything on it. The last sheet stays.
function sheetDelete(id){
  sheetsInit();
  var s = sheetById(id);
  if (!s || !multiSheet() || sheetBusy()) return;
  var n = sheetCount(id), tps = tpList().filter(function (tp) { return tpSheetOf(tp) === id; });
  function go(){
    pushUndo();
    var goneTp = {}; tps.forEach(function (tp) { goneTp[tp.id] = true; });
    var goneEnt = {}; DOC.ents.forEach(function (e) { if (e.sheet === id) goneEnt[entId(e)] = true; });
    DOC.dims = (DOC.dims || []).filter(function (d) { return !(goneEnt[d.a] || goneEnt[d.b]); });
    DOC.ents = DOC.ents.filter(function (e) { return e.sheet !== id; });
    DOC.toolpaths = tpList().filter(function (tp) { return !goneTp[tp.id]; });
    var at = DOC.sheets.indexOf(s);
    DOC.sheets = DOC.sheets.filter(function (x) { return x.id !== id; });
    if (DOC.activeSheet === id) DOC.activeSheet = DOC.sheets[Math.min(at, DOC.sheets.length - 1)].id;
    SEL = []; CUTSEL = null; DIMSEL = null;
    if (typeof tpRebuildAll === 'function') tpRebuildAll();
    persist(); renderLayers(); renderToolpathPanel(); draw();
  }
  if (!n && !tps.length) return go();
  var what = [n ? n + (n === 1 ? ' shape' : ' shapes') : '', tps.length ? tps.length + (tps.length === 1 ? ' toolpath' : ' toolpaths') : ''].filter(Boolean).join(' and ');
  uiDialog({title: 'Delete “' + s.name + '”?', body: 'This deletes the sheet and the ' + what + ' on it. Undo brings them back.', ok: 'Delete', danger: true})
    .then(function (yes) { if (yes) go(); });
}
// The Sheet bar at the top of the Toolpaths panel: choose, add, rename, delete
function sheetBar(){
  var bar = document.getElementById('tpSheetBar');
  if (!bar) return;
  sheetsInit();
  var sh = sheetList(), sel = document.getElementById('tpSheet');
  bar.hidden = false;
  sel.hidden = false;
  var nameIn = document.getElementById('tpSheetName'); if (nameIn) nameIn.hidden = true;
  sel.innerHTML = '';
  (sh.length ? sh : [{id: '', name: 'Sheet 1'}]).forEach(function (s) {
    var o2 = document.createElement('option'); o2.value = s.id;
    var n2 = multiSheet() ? tpList().filter(function (tp) { return tpSheetOf(tp) === s.id; }).length : 0;
    o2.textContent = s.name + (n2 ? ' (' + n2 + (n2 === 1 ? ' toolpath)' : ' toolpaths)') : '');
    sel.appendChild(o2);
  });
  sel.value = sh.length ? DOC.activeSheet : '';
  sel.disabled = sh.length < 2;
  var ren = document.getElementById('tpSheetRename'), del = document.getElementById('tpSheetDel');
  if (ren) ren.hidden = !sh.length;
  if (del) del.hidden = sh.length < 2;
}
// Rename the sheet being shown, in place: the list becomes a box to type in
function sheetRenameStart(){
  var s = sheetById(DOC.activeSheet), sel = document.getElementById('tpSheet'), inp = document.getElementById('tpSheetName');
  if (!s || !inp) return;
  sel.hidden = true; inp.hidden = false; inp.value = s.name; inp.focus(); if (inp.select) inp.select();
}
function sheetRenameEnd(save){
  var inp = document.getElementById('tpSheetName');
  if (!inp || inp.hidden) return;
  inp.hidden = true;
  if (save) sheetRename(DOC.activeSheet, inp.value);
  sheetBar();
}
function sheetWire(){
  var on = function (id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('tpSheet', 'change', function (e) { sheetShow(e.target.value); });
  on('tpSheetAdd', 'click', sheetAdd);
  on('tpSheetRename', 'click', sheetRenameStart);
  on('tpSheetDel', 'click', function () { sheetDelete(DOC.activeSheet); });
  on('tpSheetName', 'keydown', function (e) {
    if (e.key === 'Enter'){ e.preventDefault(); sheetRenameEnd(true); }
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); sheetRenameEnd(false); }
  });
  on('tpSheetName', 'blur', function () { sheetRenameEnd(true); });
}
