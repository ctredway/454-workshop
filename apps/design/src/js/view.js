/* ---------------- transforms ---------------- */
function s2w(px,py){ return {x:(px - VIEW.ox)/VIEW.scale, y:(VIEW.oy - py)/VIEW.scale}; }
function w2s(x,y){ return {x: VIEW.ox + x*VIEW.scale, y: VIEW.oy - y*VIEW.scale}; }

/* ---------------- stock bounds ---------------- */
// Where X0 Y0 sits on the material: a corner ('fl' front-left, 'fr', 'bl', 'br') or the centre.
// The drawing's coordinates are the job's, so the material is placed around the origin.
function originKey(){ var o = DOC.stock.origin || 'fl'; return o === 'corner' ? 'fl' : o; }
var ORIGIN_NAMES = {fl: 'front-left corner', fr: 'front-right corner', bl: 'back-left corner', br: 'back-right corner', center: 'centre'};
function stockRect(){
  var st = DOC.stock, o = originKey();
  var x0 = o === 'center' ? -st.w/2 : (o === 'fr' || o === 'br') ? -st.w : 0;
  var y0 = o === 'center' ? -st.h/2 : (o === 'bl' || o === 'br') ? -st.h : 0;
  return {x0:x0, y0:y0, x1:x0+st.w, y1:y0+st.h};
}
// Move XY zero without moving the parts on the material: everything shifts with the material.
function setJobOrigin(o){
  if (o === originKey()) return;
  pushUndo();
  var before = stockRect();
  DOC.stock.origin = o;
  var after = stockRect(), dx = after.x0 - before.x0, dy = after.y0 - before.y0;
  if (dx || dy){
    DOC.ents.forEach(function (e) { moveEntity(e, dx, dy); });
    DOC.guides.forEach(function (g) { if (g.t === 'gline') g.c += g.a * dx + g.b * dy; });
    (DOC.images || []).forEach(function (im) { im.x += dx; im.y += dy; });   // reference images stay under their outlines
    tpList().forEach(function (tp) {
      Object.keys(tp.tabPts || {}).forEach(function (k) { tp.tabPts[k] = tp.tabPts[k].map(function (q) { return [q[0] + dx, q[1] + dy]; }); });
    });
    if (typeof tpRebuildAll === 'function') tpRebuildAll();
  }
  syncStockUI(); persist(); renderToolpathPanel(); fit();
}

