// Rotate, with a panel like Array's (Clint, 2026-10-26: "this is a very visual process and most users, including me, do
// not work well with the non visual way"). The shapes (selected first, or clicked while it's open), turned about their
// own centre or a point (clicked, snapping, or typed), by an angle typed or one of the quick ones, shown dashed before
// OK. The step it records is a handle rotation's ({op: 'xform', kind: 'rot'}, history-replay.js), so the History bar
// can change its angle: about their centre it turns about their centre as they are then; about a point, that point.
var ROT = null;             // the open panel: {objs, about: 'box'|'pt', c: {x, y} or null, ang (degrees), slot}
function rotOpen(){
  var objs = SEL.filter(function(i){ return DOC.ents[i] && entOnSheet(DOC.ents[i]); });
  var L = UICFG.rotLast || {};
  ROT = {objs: objs, about: L.about === 'pt' ? 'pt' : 'box', c: null, ang: isFinite(L.ang) && L.ang ? L.ang : 90, slot: 'objs'};
  if (ROT.about === 'pt' && objs.length) ROT.slot = 'centre';
  document.getElementById('rotPanel').hidden = false;
  document.getElementById('rotAng').value = +(+ROT.ang).toFixed(3);
  rotFillCentre();
  rotRender();
}
function rotClose(){ ROT = null; document.getElementById('rotPanel').hidden = true; draw(); }
function rotBox(){
  var bb = null;
  (ROT ? ROT.objs : []).forEach(function(i){
    var b = DOC.ents[i] && entBBox(DOC.ents[i]);
    if (b) bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b;
  });
  return bb;
}
// the point they turn about, or null
function rotPivot(){
  if (!ROT) return null;
  if (ROT.about === 'pt') return ROT.c;
  var b = rotBox();
  return b ? {x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2} : null;
}
function rotWhy(){
  if (!ROT.objs.length) return 'Click the shapes on the drawing to turn.';
  if (ROT.about === 'pt' && !ROT.c) return 'Click the point to turn them about (it snaps to corners and centres), or type it.';
  if (!isFinite(ROT.ang) || Math.abs(ROT.ang) < 1e-9) return 'Give it an angle to turn.';
  return '';
}
// the shapes as OK would leave them, for the preview
function rotResults(){
  if (!ROT || rotWhy()) return [];
  var pv = rotPivot(), a = ROT.ang * Math.PI / 180;
  return ROT.objs.map(function(i){ var c = cloneEnt(DOC.ents[i]); rotateEnt(c, pv.x, pv.y, a); return c; });
}
function rotFillCentre(){
  document.getElementById('rotCx').value = ROT.c ? fmtDisp(ROT.c.x) : '';
  document.getElementById('rotCy').value = ROT.c ? fmtDisp(ROT.c.y) : '';
}
function rotRender(){
  if (!ROT) return;
  var why = rotWhy(), pt = ROT.about === 'pt';
  document.getElementById('rotObjsVal').textContent = ROT.objs.length ? ROT.objs.length + (ROT.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('rotObjs').setAttribute('aria-pressed', ROT.slot === 'objs' ? 'true' : 'false');
  document.getElementById('rotCentre').setAttribute('aria-pressed', ROT.slot === 'centre' ? 'true' : 'false');
  document.getElementById('rotCentreVal').textContent = ROT.c ? 'picked' : 'none';
  Array.prototype.forEach.call(document.querySelectorAll('#rotAbout button'), function(b){
    b.setAttribute('aria-pressed', b.dataset.a === ROT.about ? 'true' : 'false');
  });
  Array.prototype.forEach.call(document.querySelectorAll('#rotQuick button'), function(b){
    b.setAttribute('aria-pressed', Math.abs(+b.dataset.ang - ROT.ang) < 1e-9 ? 'true' : 'false');
  });
  document.getElementById('rotPt').hidden = !pt;
  document.getElementById('rotU').textContent = unitTag();
  document.getElementById('rotOk').disabled = !!why;
  document.getElementById('rotHint').textContent = why ||
    ((pt && ROT.slot === 'centre' ? 'Click the drawing to move the point. ' : '') +
     'Positive turns anticlockwise, negative clockwise.');
  SEL = ROT.objs.slice();
  draw();
}
function rotApply(){
  if (!ROT || rotWhy()) return;
  var idx = ROT.objs.slice(), pv = rotPivot(), b = rotBox(), a = ROT.ang;
  pushUndo('Rotate ' + parseFloat((+a).toFixed(2)) + '°');
  var r = histRecipe({op: 'xform', ids: histIdsOf(idx), kind: 'rot', ang: a, at: histFrac(b, pv.x, pv.y)});
  if (r && ROT.about === 'pt') r.pt = {x: pv.x, y: pv.y};   // that point, whatever the shapes' box is then
  idx.forEach(function(i){ rotateEnt(DOC.ents[i], pv.x, pv.y, a * Math.PI / 180); });
  SEL = idx;
  UICFG.rotLast = {about: ROT.about, ang: a}; uiCfgSave();
  persist();
  toast('ok', 'Rotated', idx.length + (idx.length === 1 ? ' shape' : ' shapes') + ' turned ' + parseFloat((+a).toFixed(2)) + '° ' +
        (a > 0 ? 'anticlockwise' : 'clockwise') + (ROT.about === 'pt' ? ' about the point you picked.' : ' about their centre.'));
  rotClose();
  setTool('select');
}
// a canvas click while the panel is open: the shapes, or the point
function rotClick(w, p){
  if (ROT.about === 'pt' && ROT.slot === 'centre'){
    ROT.c = {x: p.x, y: p.y};
    rotFillCentre();
    rotRender();
    return;
  }
  var h = pickEntity(w);
  if (h === null) return;
  var at = ROT.objs.indexOf(h);
  if (at >= 0) ROT.objs.splice(at, 1); else ROT.objs.push(h);
  if (ROT.about === 'pt' && !ROT.c && ROT.objs.length) ROT.slot = 'centre';
  rotRender();
}
// typed in the prompt with the panel open: "x,y" the point to turn about, a number the angle (and OK)
function rotTyped(txt){
  if (!ROT.objs.length) ROT.objs = SEL.filter(function(i){ return DOC.ents[i]; });
  var pt = parseNumericPoint(txt, null);
  if (pt){ ROT.about = 'pt'; ROT.c = pt; ROT.slot = 'objs'; rotFillCentre(); rotRender(); return true; }
  var v = parseFloat(txt);
  if (isNaN(v)) return false;
  ROT.ang = v;
  document.getElementById('rotAng').value = +v.toFixed(3);
  if (!rotWhy()) rotApply(); else rotRender();
  return true;
}
function rotWire(){
  var $ = function(id){ return document.getElementById(id); };
  $('rotObjs').addEventListener('click', function(){ if (ROT){ ROT.slot = 'objs'; rotRender(); } });
  $('rotCentre').addEventListener('click', function(){ if (ROT){ ROT.slot = 'centre'; rotRender(); } });
  Array.prototype.forEach.call(document.querySelectorAll('#rotAbout button'), function(b){
    b.addEventListener('click', function(){
      if (!ROT) return;
      ROT.about = b.dataset.a;
      ROT.slot = ROT.about === 'pt' && !ROT.c && ROT.objs.length ? 'centre' : 'objs';
      rotRender();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#rotQuick button'), function(b){
    b.addEventListener('click', function(){
      if (!ROT) return;
      ROT.ang = +b.dataset.ang; $('rotAng').value = ROT.ang;
      rotRender();
    });
  });
  $('rotAng').addEventListener('input', function(){ if (!ROT) return; var v = parseFloat($('rotAng').value); ROT.ang = isNaN(v) ? NaN : v; rotRender(); });
  function centre(){
    if (!ROT) return;
    var x = lenIn($('rotCx').value), y = lenIn($('rotCy').value);
    ROT.c = isNaN(x) || isNaN(y) ? null : {x: x, y: y};
    rotRender();
  }
  $('rotCx').addEventListener('input', centre); $('rotCy').addEventListener('input', centre);
  ['rotAng', 'rotCx', 'rotCy'].forEach(function(id){
    $(id).addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); rotApply(); } });
  });
  $('rotOk').addEventListener('click', rotApply);
  $('rotCancel').addEventListener('click', function(){ rotClose(); setTool('select'); });
  $('rotX').addEventListener('click', function(){ rotClose(); setTool('select'); });
}
