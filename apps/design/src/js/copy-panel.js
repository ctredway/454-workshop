// Copy, with a panel like Array's (Clint, 2026-10-26: "this is a very visual process"). The shapes (selected first, or
// clicked while it's open), moved by Across and Up: typed, or measured on the drawing from one point to another (both
// snapping, as the tool's two clicks were), how many copies, shown dashed before OK. A copy is a row of them, so the step
// is Array's ({op: 'array', kind: 'lin', copy: true}, arrayMake): the History bar calls it Copy and can change it.
var CPY = null;             // the open panel: {objs, dx, dy, n (copies), from, to: {x, y} or null, slot: 'objs'|'from'|'to'}
function cpyOpen(){
  var objs = SEL.filter(function(i){ return DOC.ents[i] && entOnSheet(DOC.ents[i]); });
  var L = UICFG.cpyLast || {};
  CPY = {objs: objs, dx: L.dx, dy: L.dy || 0, n: L.n || 1, from: null, to: null, slot: objs.length ? 'from' : 'objs'};
  if (!(Math.abs(CPY.dx) > 1e-9) && !(Math.abs(CPY.dy) > 1e-9)){
    var b = cpyBox();                                  // first time: beside them, 10 mm to the right
    CPY.dx = b ? Math.ceil(b.x1 - b.x0 + 10) : 50;
  }
  document.getElementById('cpyPanel').hidden = false;
  cpyFill();
  cpyRender();
}
function cpyClose(){ CPY = null; document.getElementById('cpyPanel').hidden = true; draw(); }
function cpyBox(){
  var bb = null;
  (CPY ? CPY.objs : []).forEach(function(i){
    var b = DOC.ents[i] && entBBox(DOC.ents[i]);
    if (b) bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b;
  });
  return bb;
}
function cpyWhy(){
  if (!CPY.objs.length) return 'Click the shapes on the drawing to copy.';
  if (!(CPY.n >= 1 && CPY.n <= 499)) return 'Copies is 1 to 499.';
  if (!isFinite(CPY.dx) || !isFinite(CPY.dy)) return 'Across and Up need a distance (0 is fine for one of them).';
  if (!(Math.abs(CPY.dx) > 1e-9) && !(Math.abs(CPY.dy) > 1e-9)) return 'Give it a distance across or up, or the copy lands on top of the shapes.';
  return '';
}
// the copies OK would add, for the preview
function cpyResults(){
  if (!CPY || cpyWhy()) return [];
  var out = [];
  for (var k = 1; k <= CPY.n; k++) CPY.objs.forEach(function(i){ var c = cloneEnt(DOC.ents[i]); moveEntity(c, CPY.dx * k, CPY.dy * k); out.push(c); });
  return out;
}
function cpyFill(){
  document.getElementById('cpyDx').value = isFinite(CPY.dx) ? fmtDisp(CPY.dx) : '';
  document.getElementById('cpyDy').value = isFinite(CPY.dy) ? fmtDisp(CPY.dy) : '';
  document.getElementById('cpyN').value = CPY.n;
}
function cpyRender(){
  if (!CPY) return;
  var why = cpyWhy();
  document.getElementById('cpyObjsVal').textContent = CPY.objs.length ? CPY.objs.length + (CPY.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('cpyFromVal').textContent = CPY.from ? 'picked' : 'none';
  document.getElementById('cpyToVal').textContent = CPY.to ? 'picked' : 'none';
  ['objs', 'from', 'to'].forEach(function(s){
    document.getElementById({objs: 'cpyObjs', from: 'cpyFrom', to: 'cpyTo'}[s]).setAttribute('aria-pressed', CPY.slot === s ? 'true' : 'false');
  });
  Array.prototype.forEach.call(document.querySelectorAll('#cpyPanel .panelU'), function(s){ s.textContent = unitTag(); });
  document.getElementById('cpyOk').disabled = !!why;
  document.getElementById('cpyHint').textContent = why || (
    CPY.slot === 'from' && CPY.to ? 'Measured: the copy goes from the first point to the second. Click OK, or click the drawing to measure again.' :
    CPY.slot === 'from' ?'Click a point on the drawing to measure from (it snaps to corners and centres), or type Across and Up.' :
    CPY.slot === 'to' ? 'Click where that point goes: Across and Up fill in.' :
    (CPY.n === 1 ? 'The copy goes' : 'Each copy goes') + ' this far from the ' + (CPY.n === 1 ? 'shapes' : 'one before') + '. Negative goes left or down.');
  SEL = CPY.objs.slice();
  draw();
}
function cpyApply(){
  if (!CPY || cpyWhy()) return;
  var idx = CPY.objs.slice(), r = {op: 'array', kind: 'lin', copy: true, ids: histIdsOf(idx), n: CPY.n + 1, dx: CPY.dx, dy: CPY.dy};
  pushUndo(HIST_OPS.array.name(r));
  var first = DOC.ents.length;
  arrayMake(r, idx);
  histRecipe(r);                                       // done again by the History bar, with its numbers changed or not
  var made = DOC.ents.length - first;
  SEL = Array.from({length: made}, function(_, k){ return first + k; });   // the copies: Copy again copies them on
  UICFG.cpyLast = {dx: CPY.dx, dy: CPY.dy, n: CPY.n}; uiCfgSave();
  persist();
  toast('ok', 'Copied', made + (made === 1 ? ' shape' : ' shapes') + ' made, ' + fmtDisp(CPY.dx) + ' across and ' + fmtDisp(CPY.dy) + ' up ' +
        unitTag() + (CPY.n > 1 ? ' each.' : '.') + ' The copies are selected.');
  cpyClose();
  setTool('select');
}
// a canvas click while the panel is open: the shapes, or a point to measure from or to
function cpyClick(w, p){
  if (CPY.slot === 'from' || CPY.slot === 'to'){
    CPY[CPY.slot] = {x: p.x, y: p.y};
    if (CPY.slot === 'from'){ CPY.to = null; CPY.slot = 'to'; }
    else { CPY.dx = CPY.to.x - CPY.from.x; CPY.dy = CPY.to.y - CPY.from.y; CPY.slot = 'from'; cpyFill(); }
    cpyRender();
    return;
  }
  var h = pickEntity(w);
  if (h === null) return;
  var at = CPY.objs.indexOf(h);
  if (at >= 0) CPY.objs.splice(at, 1); else CPY.objs.push(h);
  cpyRender();
}
// typed in the prompt with the panel open: "@dx,dy" (or "dx,dy") the distance, and OK
function cpyTyped(txt){
  if (!CPY.objs.length) CPY.objs = SEL.filter(function(i){ return DOC.ents[i]; });
  var pc = parseNumericPoint(txt.charAt(0) === '@' ? txt : '@' + txt, {x: 0, y: 0});
  if (!pc) return false;
  CPY.dx = pc.x; CPY.dy = pc.y; CPY.from = CPY.to = null;
  cpyFill();
  if (!cpyWhy()) cpyApply(); else cpyRender();
  return true;
}
function cpyWire(){
  var $ = function(id){ return document.getElementById(id); };
  $('cpyObjs').addEventListener('click', function(){ if (CPY){ CPY.slot = 'objs'; cpyRender(); } });
  $('cpyFrom').addEventListener('click', function(){ if (CPY){ CPY.slot = 'from'; cpyRender(); } });
  $('cpyTo').addEventListener('click', function(){ if (CPY){ CPY.slot = CPY.from ? 'to' : 'from'; cpyRender(); } });
  function len(id, k){
    $(id).addEventListener('input', function(){ if (!CPY) return; var v = lenIn($(id).value); CPY[k] = isNaN(v) ? NaN : v; CPY.from = CPY.to = null; cpyRender(); });
  }
  len('cpyDx', 'dx'); len('cpyDy', 'dy');
  $('cpyN').addEventListener('input', function(){ if (!CPY) return; var t = $('cpyN').value.trim(); CPY.n = /^\d+$/.test(t) ? +t : NaN; cpyRender(); });
  ['cpyDx', 'cpyDy', 'cpyN'].forEach(function(id){
    $(id).addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); cpyApply(); } });
  });
  $('cpyOk').addEventListener('click', cpyApply);
  $('cpyCancel').addEventListener('click', function(){ cpyClose(); setTool('select'); });
  $('cpyX').addEventListener('click', function(){ cpyClose(); setTool('select'); });
}
