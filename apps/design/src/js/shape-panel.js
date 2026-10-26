// The drawing tools' panel (Clint, 2026-10-26: "this is a very visual process and most users, including me, do not work
// well with the non visual way"). Polygon and Star are still drawn by clicking (the centre, then a corner or a tip), and
// the panel holds what was typed before: the number of sides or points (S8), and a size, which makes each click place
// one there (a dashed one follows the pointer), and the star's inner corners. Open while the tool is.
var SHP = null;             // the open panel: {t: 'polygon'|'star'}
function shpOpen(t){
  SHP = {t: t};
  document.getElementById('shpPanel').hidden = false;
  document.getElementById('shpTitle').textContent = t === 'star' ? 'Star' : 'Polygon';
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
// a polygon or star of the panel's size, centred at p, standing square (a polygon on a flat, a star with a point straight
// up), or null if no size is set
function shpStamp(p){
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
  var s = polySize();
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
  Array.prototype.forEach.call(document.querySelectorAll('#shpPanel .panelU'), function(u){ u.textContent = unitTag(); });
  document.getElementById('shpInnerVal').textContent = Math.round(starInner() * 100) + '%';
  var sized = SHP.t === 'star' ? starSize() : polySize();
  document.getElementById('shpHint').textContent = sized
    ? 'Click the drawing to place one, centred where you click. Clear the size to draw them by eye.'
    : (SHP.t === 'star' ? 'Click the centre, then the tip of a point. Or give it a size, and each click places one.'
                        : 'Click the centre, then a corner. Or give it a size, and each click places one.');
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
  $('shpInner').addEventListener('input', function(){ UICFG.starInner = +$('shpInner').value / 100; uiCfgSave(); shpRender(); });
  $('shpX').addEventListener('click', function(){ setTool('select'); });
}
