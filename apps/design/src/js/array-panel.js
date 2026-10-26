// Array, with a panel like Offset's (Clint, 2026-10-26: "I went to use the array tool earlier and I didn't understand how
// to set or choose what I needed to do"). The shapes (selected first, or clicked while it's open), in a row or around a
// centre, how many and how far apart, with the copies shown on the drawing before OK. arrayMake (tool-typing.js) makes
// them, as it does for the History bar, and the step it records is the same one typing "5@12,0" or "6<60" made.
var ARR = null;             // the open panel: {objs, kind: 'lin'|'circ', n, dx, dy, nc, full, step, c: {x, y} or null, slot}
function arrOpen(){
  var objs = SEL.filter(function(i){ return DOC.ents[i] && entOnSheet(DOC.ents[i]); });
  var L = UICFG.arrLast || {};
  ARR = {objs: objs, kind: L.kind === 'circ' ? 'circ' : 'lin', n: L.n || 3, dx: L.dx, dy: L.dy || 0,
         nc: L.nc || 6, full: L.full !== false, step: L.step || 60, c: null, slot: 'objs'};
  if (!(Math.abs(ARR.dx) > 1e-9) && !(Math.abs(ARR.dy) > 1e-9)){
    var b = arrBox();                                  // first time: a row to the right, 10 mm apart
    ARR.dx = b ? Math.ceil(b.x1 - b.x0 + 10) : 50;
  }
  if (ARR.kind === 'circ' && objs.length) ARR.slot = 'centre';
  document.getElementById('arrPanel').hidden = false;
  arrFill();
  arrRender();
}
function arrClose(){ ARR = null; document.getElementById('arrPanel').hidden = true; draw(); }
// the box round the shapes being copied
function arrBox(){
  var bb = null;
  (ARR ? ARR.objs : []).forEach(function(i){
    var b = DOC.ents[i] && entBBox(DOC.ents[i]);
    if (b) bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b;
  });
  return bb;
}
// the step OK would record, or a reason it can't
function arrRecipe(){
  if (!ARR) return {why: ''};
  if (!ARR.objs.length) return {why: 'Click the shapes on the drawing to copy.'};
  if (ARR.kind === 'lin'){
    if (!(ARR.n >= 2 && ARR.n <= 500)) return {why: 'How many is 2 to 500, counting the shapes you picked.'};
    if (!(Math.abs(ARR.dx) > 1e-9) && !(Math.abs(ARR.dy) > 1e-9)) return {why: 'Give it a distance across or up, or the copies all land on top of each other.'};
    return {r: {op: 'array', kind: 'lin', n: ARR.n, dx: ARR.dx, dy: ARR.dy}};
  }
  if (!(ARR.nc >= 2 && ARR.nc <= 500)) return {why: 'How many is 2 to 500, counting the shapes you picked.'};
  if (!ARR.c) return {why: 'Click the centre on the drawing (it snaps to a circle’s centre), or type it.'};
  var step = ARR.full ? 360 / ARR.nc : ARR.step;
  if (!(Math.abs(step) > 1e-9)) return {why: 'Give it an angle between the copies.'};
  return {r: {op: 'array', kind: 'circ', n: ARR.nc, step: step, cx: ARR.c.x, cy: ARR.c.y}};
}
// the copies OK would add, for the preview
function arrResults(){
  var rc = arrRecipe(), out = [];
  if (!rc.r) return out;
  var stepRad = rc.r.kind === 'circ' ? rc.r.step * Math.PI / 180 : 0;
  for (var k = 1; k < rc.r.n; k++){
    ARR.objs.forEach(function(i){
      var c = cloneEnt(DOC.ents[i]);
      if (rc.r.kind === 'circ') rotateEnt(c, rc.r.cx, rc.r.cy, stepRad * k);
      else moveEntity(c, rc.r.dx * k, rc.r.dy * k);
      out.push(c);
    });
  }
  return out;
}
// the boxes from ARR (on opening, and after typing in the prompt)
function arrFill(){
  document.getElementById('arrN').value = ARR.n;
  document.getElementById('arrDx').value = fmtDisp(ARR.dx);
  document.getElementById('arrDy').value = fmtDisp(ARR.dy);
  document.getElementById('arrNc').value = ARR.nc;
  document.getElementById('arrFull').checked = ARR.full;
  arrFillCentre();
}
function arrFillCentre(){
  document.getElementById('arrCx').value = ARR.c ? fmtDisp(ARR.c.x) : '';
  document.getElementById('arrCy').value = ARR.c ? fmtDisp(ARR.c.y) : '';
}
function arrRender(){
  if (!ARR) return;
  var circ = ARR.kind === 'circ', rc = arrRecipe();
  document.getElementById('arrObjsVal').textContent = ARR.objs.length ? ARR.objs.length + (ARR.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('arrObjs').setAttribute('aria-pressed', ARR.slot === 'objs' ? 'true' : 'false');
  document.getElementById('arrCentre').setAttribute('aria-pressed', ARR.slot === 'centre' ? 'true' : 'false');
  document.getElementById('arrCentreVal').textContent = ARR.c ? 'picked' : 'none';
  Array.prototype.forEach.call(document.querySelectorAll('#arrKind button'), function(b){
    b.setAttribute('aria-pressed', b.dataset.k === ARR.kind ? 'true' : 'false');
  });
  document.getElementById('arrRow').hidden = circ;
  document.getElementById('arrRound').hidden = !circ;
  Array.prototype.forEach.call(document.querySelectorAll('#arrPanel .arrU'), function(s){ s.textContent = unitTag(); });
  var stepIn = document.getElementById('arrStep');
  stepIn.disabled = ARR.full;
  if (ARR.full) stepIn.value = +(360 / (ARR.nc || 1)).toFixed(3);
  else if (document.activeElement !== stepIn) stepIn.value = +(+ARR.step).toFixed(3);
  document.getElementById('arrOk').disabled = !rc.r;
  var hint = document.getElementById('arrHint');
  if (rc.why) hint.textContent = rc.why;
  else if (circ) hint.textContent = (ARR.slot === 'centre' ? 'Click the drawing to move the centre. ' : '') + (ARR.full
    ? ARR.nc + ' evenly round a full circle: the shapes you picked and ' + (ARR.nc - 1) + ' copies.'
    : 'Each copy turns this far from the one before: positive anticlockwise, negative clockwise.');
  else hint.textContent = 'The shapes you picked and ' + (ARR.n - 1) + (ARR.n === 2 ? ' copy' : ' copies') +
    ', each this far from the one before, measured centre to centre. Negative goes left or down.';
  SEL = ARR.objs.slice();
  draw();
}
function arrApply(){
  var rc = arrRecipe();
  if (!rc.r) return;
  var r = rc.r, idx = ARR.objs.slice();
  r.ids = histIdsOf(idx);
  pushUndo('Array ' + r.n);
  var first = DOC.ents.length;
  arrayMake(r, idx);
  histRecipe(r);                                       // done again by the History bar, with its numbers changed or not
  var made = DOC.ents.length - first;
  SEL = idx.concat(Array.from({length: made}, function(_, k){ return first + k; }));
  UICFG.arrLast = {kind: ARR.kind, n: ARR.n, dx: ARR.dx, dy: ARR.dy, nc: ARR.nc, full: ARR.full, step: ARR.step}; uiCfgSave();
  persist();
  toast('ok', 'Array', made + (made === 1 ? ' copy' : ' copies') + ' made' + (r.kind === 'circ' ? ' round the centre.' : ' in a row.') +
        ' They’re selected with the shapes you picked, to move as one.');
  arrClose();
  setTool('select');
}
// a canvas click while the panel is open: the shapes, or the centre
function arrClick(w, p){
  if (ARR.kind === 'circ' && ARR.slot === 'centre'){
    ARR.c = {x: p.x, y: p.y};
    arrFillCentre();
    arrRender();
    return;
  }
  var h = pickEntity(w);
  if (h === null) return;
  var at = ARR.objs.indexOf(h);
  if (at >= 0) ARR.objs.splice(at, 1); else ARR.objs.push(h);
  if (ARR.kind === 'circ' && !ARR.c && ARR.objs.length) ARR.slot = 'centre';   // next: where to turn them round
  arrRender();
}
// typed in the prompt with the panel open: "5@12,0" a row, "6<60" around the centre (picked, or clicked next)
function arrTyped(txt){
  var t = txt.trim();
  if (!ARR.objs.length) ARR.objs = SEL.filter(function(i){ return DOC.ents[i]; });
  if (!ARR.c && DRAW && DRAW.cx !== undefined) ARR.c = {x: DRAW.cx, y: DRAW.cy};
  var mLin = t.match(/^(\d+)\s*@\s*([^,]+),(.+)$/), mCirc = t.match(/^(\d+)\s*<\s*(-?[\d.]+)$/);
  if (mLin){
    var dx = lenIn(mLin[2]), dy = lenIn(mLin[3]);
    if (isNaN(dx) || isNaN(dy)) return false;
    ARR.kind = 'lin'; ARR.n = parseInt(mLin[1], 10); ARR.dx = dx; ARR.dy = dy;
  } else if (mCirc){
    ARR.kind = 'circ'; ARR.nc = parseInt(mCirc[1], 10); ARR.full = false; ARR.step = parseFloat(mCirc[2]);
    if (!ARR.c) ARR.slot = 'centre';
  } else return false;
  arrFill();
  if (arrRecipe().r) arrApply(); else arrRender();
  return true;
}
function arrWire(){
  var $ = function(id){ return document.getElementById(id); };
  $('arrObjs').addEventListener('click', function(){ if (ARR){ ARR.slot = 'objs'; arrRender(); } });
  $('arrCentre').addEventListener('click', function(){ if (ARR){ ARR.slot = 'centre'; arrRender(); } });
  Array.prototype.forEach.call(document.querySelectorAll('#arrKind button'), function(b){
    b.addEventListener('click', function(){
      if (!ARR) return;
      ARR.kind = b.dataset.k;
      ARR.slot = ARR.kind === 'circ' && !ARR.c && ARR.objs.length ? 'centre' : 'objs';
      arrRender();
    });
  });
  function count(id, k){
    $(id).addEventListener('input', function(){ if (!ARR) return; var v = +$(id).value.trim(); ARR[k] = /^\d+$/.test($(id).value.trim()) ? v : NaN; arrRender(); });
  }
  function len(id, k){
    $(id).addEventListener('input', function(){ if (!ARR) return; var v = lenIn($(id).value); ARR[k] = isNaN(v) ? NaN : v; arrRender(); });
  }
  count('arrN', 'n'); count('arrNc', 'nc'); len('arrDx', 'dx'); len('arrDy', 'dy');
  function centre(){
    if (!ARR) return;
    var x = lenIn($('arrCx').value), y = lenIn($('arrCy').value);
    ARR.c = isNaN(x) || isNaN(y) ? null : {x: x, y: y};
    arrRender();
  }
  $('arrCx').addEventListener('input', centre); $('arrCy').addEventListener('input', centre);
  $('arrFull').addEventListener('change', function(){ if (ARR){ ARR.full = $('arrFull').checked; arrRender(); } });
  $('arrStep').addEventListener('input', function(){ if (!ARR) return; var v = parseFloat($('arrStep').value); ARR.step = isNaN(v) ? NaN : v; arrRender(); });
  ['arrN', 'arrDx', 'arrDy', 'arrNc', 'arrCx', 'arrCy', 'arrStep'].forEach(function(id){
    $(id).addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); arrApply(); } });
  });
  $('arrOk').addEventListener('click', arrApply);
  $('arrCancel').addEventListener('click', function(){ arrClose(); setTool('select'); });
  $('arrX').addEventListener('click', function(){ arrClose(); setTool('select'); });
}
