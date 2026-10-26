// The drawing tools' panel (Clint, 2026-10-26: "this is a very visual process and most users, including me, do not work
// well with the non visual way"). Rectangle, Circle, Ellipse, Polygon and Star are still drawn by clicking (a corner and
// the opposite one, or the centre and then an edge, a corner or a tip), and the panel holds what was typed before: a
// size, which makes each click place one there (a dashed one follows the pointer), the number of sides or points (S8),
// and the star's inner corners. Open while the tool is.
var SHP = null;             // the open panel: {t: 'rect'|'circle'|'ellipse'|'polygon'|'star'}
var SHP_TOOLS = {rect: {name: 'Rectangle', help: 'rectangle'}, circle: {name: 'Circle', help: 'circle'}, ellipse: {name: 'Ellipse', help: 'ellipse'},
                 polygon: {name: 'Polygon', help: 'polygon'}, star: {name: 'Star', help: 'star'}};
function shpOpen(t){
  SHP = {t: t};
  document.getElementById('shpPanel').hidden = false;
  document.getElementById('shpTitle').textContent = SHP_TOOLS[t].name;
  var hi = document.querySelector('#shpPanel .modalHead .helpI');   // the help button (help-where.js) opens this tool's part
  if (hi) hi.setAttribute('data-help-at', 'design-tools.html#' + SHP_TOOLS[t].help);
  document.getElementById('shpWH').hidden = t !== 'rect' && t !== 'ellipse';
  document.getElementById('shpRectAt').hidden = t !== 'rect';
  document.getElementById('shpCircle').hidden = t !== 'circle';
  document.getElementById('shpPoly').hidden = t !== 'polygon';
  document.getElementById('shpStar').hidden = t !== 'star';
  shpFill();
  shpRender();
}
function shpClose(){ SHP = null; document.getElementById('shpPanel').hidden = true; }
// the size set in the panel, in mm, or null (drawn by eye)
function polySize(){ var s = UICFG.polySize; return s && s.v > 0 ? {by: s.by === 'corners' ? 'corners' : 'flats', v: s.v} : null; }
function starSize(){ return UICFG.starSize > 0 ? UICFG.starSize : null; }
function starInner(){ var f = UICFG.starInner; return f >= 0.05 && f <= 0.95 ? f : 0.5; }
// a rectangle's or an ellipse's width and height ({w, h} in mm, either null), and where a click puts a rectangle
function shpWH(t){ var s = UICFG[t === 'ellipse' ? 'ellSize' : 'rectSize'] || {}; return {w: s.w > 0 ? s.w : null, h: s.h > 0 ? s.h : null}; }
function rectAt(){ return UICFG.rectAt === 'centre' ? 'centre' : 'corner'; }
function circleSize(){ return UICFG.circleD > 0 ? UICFG.circleD : null; }
// a shape of the panel's size at p, or null if no size is set: a rectangle with its bottom-left corner or its centre
// there, a circle or an ellipse centred there, a polygon or a star centred there standing square (a polygon on a flat, a
// star with a point straight up)
function shpStamp(p){
  if (TOOL === 'rect' || TOOL === 'ellipse'){
    var wh = shpWH(TOOL);
    if (!wh.w || !wh.h) return null;
    if (TOOL === 'ellipse') return ellipseShape(p.x, p.y, wh.w / 2, wh.h / 2);
    var c = rectAt() === 'centre';
    return {t: 'rect', x: c ? p.x - wh.w / 2 : p.x, y: c ? p.y - wh.h / 2 : p.y, w: wh.w, h: wh.h};
  }
  if (TOOL === 'circle') return circleSize() ? {t: 'circle', cx: p.x, cy: p.y, r: circleSize() / 2} : null;
  if (TOOL === 'polygon' && polySize()){
    var n = shapeSides(), s = polySize(), r = s.by === 'flats' ? s.v / 2 / Math.cos(Math.PI / n) : s.v / 2;
    return polygonShape(p.x, p.y, r, n, -Math.PI / 2 + Math.PI / n);
  }
  if (TOOL === 'star' && starSize()){
    var r1 = starSize() / 2;
    return starShape(p.x, p.y, r1, r1 * starInner(), shapePoints(), Math.PI / 2);
  }
  return null;
}
function shpFill(){
  var s = polySize(), wh = SHP ? shpWH(SHP.t) : {};
  document.getElementById('shpW').value = wh.w ? fmtDisp(wh.w) : '';
  document.getElementById('shpH').value = wh.h ? fmtDisp(wh.h) : '';
  document.getElementById('shpDia').value = circleSize() ? fmtDisp(circleSize()) : '';
  document.getElementById('shpSides').value = shapeSides();
  document.getElementById('shpPolySize').value = s ? fmtDisp(s.v) : '';
  document.getElementById('shpPoints').value = shapePoints();
  document.getElementById('shpStarSize').value = starSize() ? fmtDisp(starSize()) : '';
  document.getElementById('shpInner').value = Math.round(starInner() * 100);
}
function shpRender(){
  if (!SHP) return;
  var by = (UICFG.polySize && UICFG.polySize.by) === 'corners' ? 'corners' : 'flats';
  Array.prototype.forEach.call(document.querySelectorAll('#shpBy button'), function(b){ b.setAttribute('aria-pressed', b.dataset.by === by ? 'true' : 'false'); });
  Array.prototype.forEach.call(document.querySelectorAll('#shpAt button'), function(b){ b.setAttribute('aria-pressed', b.dataset.at === rectAt() ? 'true' : 'false'); });
  Array.prototype.forEach.call(document.querySelectorAll('#shpPanel .panelU'), function(u){ u.textContent = unitTag(); });
  document.getElementById('shpInnerVal').textContent = Math.round(starInner() * 100) + '%';
  var t = SHP.t, wh = shpWH(t), half = (t === 'rect' || t === 'ellipse') && !!wh.w !== !!wh.h;
  var byEye = {rect: 'Click one corner, then the opposite one.', circle: 'Click the centre, then a point on its edge.',
               ellipse: 'Click the centre, then a corner of the box it fits in.', polygon: 'Click the centre, then a corner.',
               star: 'Click the centre, then the tip of a point.'}[t];
  document.getElementById('shpHint').textContent = half ? 'Give it a width and a height, or clear both to draw it by eye.'
    : shpStamp({x: 0, y: 0}) ? 'Click the drawing to place one, ' + (t === 'rect' && rectAt() === 'corner' ? 'its bottom-left corner' : 'centred') +
                               ' where you click. Clear the size to draw them by eye.'
    : byEye + ' Or give it a size, and each click places one.';
  stagePrompt(TOOL + (DRAW ? DRAW.stage : 0));
  draw();
}
function shpWire(){
  var $ = function(id){ return document.getElementById(id); };
  function count(id, key, step){
    function set(n){
      if (!(n >= 3 && n <= 100)) return false;
      UICFG[key] = n; uiCfgSave(); $(id).value = n; shpRender(); return true;
    }
    $(id).addEventListener('input', function(){ var t = $(id).value.trim(); if (/^\d+$/.test(t)) set(+t); });
    $(id).addEventListener('change', function(){ $(id).value = key === 'starPoints' ? shapePoints() : shapeSides(); });   // a number it refused: back to the one it has
    $(id + 'Less').addEventListener('click', function(){ set((key === 'starPoints' ? shapePoints() : shapeSides()) - step); });
    $(id + 'More').addEventListener('click', function(){ set((key === 'starPoints' ? shapePoints() : shapeSides()) + step); });
  }
  count('shpSides', 'polySides', 1); count('shpPoints', 'starPoints', 1);
  $('shpPolySize').addEventListener('input', function(){
    var t = $('shpPolySize').value.trim(), v = t ? lenIn(t) : NaN, by = polySize() ? polySize().by : ((UICFG.polySize && UICFG.polySize.by) || 'flats');
    UICFG.polySize = {by: by, v: v > 0 ? v : null}; uiCfgSave(); shpRender();
  });
  Array.prototype.forEach.call(document.querySelectorAll('#shpBy button'), function(b){
    b.addEventListener('click', function(){ UICFG.polySize = {by: b.dataset.by, v: polySize() ? polySize().v : null}; uiCfgSave(); shpRender(); });
  });
  $('shpStarSize').addEventListener('input', function(){
    var t = $('shpStarSize').value.trim(), v = t ? lenIn(t) : NaN;
    UICFG.starSize = v > 0 ? v : null; uiCfgSave(); shpRender();
  });
  function wh(id, k){
    $(id).addEventListener('input', function(){
      if (!SHP) return;
      var key = SHP.t === 'ellipse' ? 'ellSize' : 'rectSize', t = $(id).value.trim(), v = t ? lenIn(t) : NaN, s = Object.assign({}, UICFG[key]);
      s[k] = v > 0 ? v : null; UICFG[key] = s; uiCfgSave(); shpRender();
    });
  }
  wh('shpW', 'w'); wh('shpH', 'h');
  Array.prototype.forEach.call(document.querySelectorAll('#shpAt button'), function(b){
    b.addEventListener('click', function(){ UICFG.rectAt = b.dataset.at; uiCfgSave(); shpRender(); });
  });
  $('shpDia').addEventListener('input', function(){
    var t = $('shpDia').value.trim(), v = t ? lenIn(t) : NaN;
    UICFG.circleD = v > 0 ? v : null; uiCfgSave(); shpRender();
  });
  $('shpInner').addEventListener('input', function(){ UICFG.starInner = +$('shpInner').value / 100; uiCfgSave(); shpRender(); });
  $('shpX').addEventListener('click', function(){ setTool('select'); });
}
