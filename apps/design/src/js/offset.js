/* ---------------- offset / join / explode ---------------- */
function signedArea(pts){
  var a = 0;
  for (var i = 0; i < pts.length; i++){
    var j = (i+1) % pts.length;
    a += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1];
  }
  return a/2;
}
function offsetPolyPts(pts, dOut, closed){
  // miter offset: + = outward for closed shapes (winding-independent); for open, + = left of travel
  var n = pts.length;
  if (n < 2) return null;
  var sgn = closed ? (signedArea(pts) > 0 ? 1 : -1) : -1; // scale left-normal into outward
  var d = dOut * sgn * -1; // shift along left normal by this amount
  function edgeOff(i){
    var j = (i+1) % n;
    var dx = pts[j][0]-pts[i][0], dy = pts[j][1]-pts[i][1], L = Math.hypot(dx,dy);
    if (L < 1e-12) return null;
    var nx = -dy/L, ny = dx/L; // left normal
    return {x1:pts[i][0]+nx*d, y1:pts[i][1]+ny*d, x2:pts[j][0]+nx*d, y2:pts[j][1]+ny*d};
  }
  var m = closed ? n : n-1;
  var eds = [];
  for (var i = 0; i < m; i++){ var e = edgeOff(i); if (e) eds.push(e); }
  if (eds.length < (closed ? 3 : 1)) return null;
  var out = [];
  if (!closed){
    out.push([eds[0].x1, eds[0].y1]);
    for (var k = 0; k < eds.length-1; k++){
      var h = xLineLine(eds[k].x1,eds[k].y1,eds[k].x2,eds[k].y2, eds[k+1].x1,eds[k+1].y1,eds[k+1].x2,eds[k+1].y2);
      out.push(h ? [h.x, h.y] : [eds[k].x2, eds[k].y2]);
    }
    out.push([eds[eds.length-1].x2, eds[eds.length-1].y2]);
  } else {
    for (var k2 = 0; k2 < eds.length; k2++){
      var prev = eds[(k2-1+eds.length) % eds.length];
      var h2 = xLineLine(prev.x1,prev.y1,prev.x2,prev.y2, eds[k2].x1,eds[k2].y1,eds[k2].x2,eds[k2].y2);
      out.push(h2 ? [h2.x, h2.y] : [eds[k2].x1, eds[k2].y1]);
    }
  }
  return out;
}
function offsetEnt(e, d){
  // returns a NEW offset entity, or null; + = outward / left-of-travel
  if (e.t === 'circle'){
    var nr = e.r + d;
    return nr > 1e-6 ? {t:'circle', cx:e.cx, cy:e.cy, r:nr} : null;
  }
  if (e.t === 'arc'){
    // + = left of travel: a CCW arc keeps its center on the left, so left offset shrinks the radius
    var nr2 = e.ccw ? e.r - d : e.r + d;
    return nr2 > 1e-6 ? {t:'arc', cx:e.cx, cy:e.cy, r:nr2, a0:e.a0, a1:e.a1, ccw:e.ccw} : null;
  }
  if (e.t === 'line'){
    var dx = e.x2-e.x1, dy = e.y2-e.y1, L = Math.hypot(dx,dy);
    if (L < 1e-9) return null;
    var nx = -dy/L, ny = dx/L;
    return {t:'line', x1:e.x1+nx*d, y1:e.y1+ny*d, x2:e.x2+nx*d, y2:e.y2+ny*d};
  }
  if (e.t === 'rect'){
    var nx2 = e.x - d, ny2 = e.y - d, nw = e.w + 2*d, nh = e.h + 2*d;
    return (nw > 1e-6 && nh > 1e-6) ? {t:'rect', x:nx2, y:ny2, w:nw, h:nh} : null;
  }
  if (e.t === 'poly'){
    var np = offsetPolyPts(e.pts, d, !!e.closed);
    return np ? {t:'poly', pts:np, closed:!!e.closed} : null;
  }
  if (e.t === 'path'){
    var tp = tessPath(e, 0.06).map(function(q){ return [q[0], q[1]]; });
    var np2 = offsetPolyPts(tp, d, !!e.closed);
    return np2 ? {t:'poly', pts:np2, closed:!!e.closed} : null;
  }
  return null;
}
