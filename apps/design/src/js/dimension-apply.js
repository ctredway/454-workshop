// ---- dimensions that hold a shape ----
// Distances to a shape's edges hold those edges in place. Is an edge of `ent` parallel to `ln`, but not
// `ln` itself, held by another distance (other than `except`)? Then setting `ln`'s distance should move
// just that edge, stretching the shape, rather than the whole shape, which would break the other one.
function parallelLines(p, q){ return Math.abs(p.a * q.b - p.b * q.a) < 1e-6; }
function heldOtherSide(ent, ln, except){
  var id = entId(ent);
  return (DOC.dims || []).some(function (d){
    if (d === except || d.kind !== 'pair' || (d.a !== id && d.b !== id)) return false;
    var other = entById(d.a === id ? d.b : d.a); if (!other) return false;
    var g = refGeom(ent, other, d.a === id ? d.aAt : d.bAt);
    return !!(g && g.ln && parallelLines(g.ln, ln) && Math.abs(sd(ln, g.ln.x1, g.ln.y1)) > 0.01);
  });
}
// Move one straight edge of a rectangle or outline by (dx, dy), stretching the shape. False if the shape
// can't be stretched that way (curved outlines, or it would turn inside out).
function stretchEdge(e, ln, dx, dy){
  var tol = 0.01;
  if (e.t === 'rect'){
    var vertical = Math.abs(ln.a) > Math.abs(ln.b);          // the edge's normal points along X: a left or right side
    if (vertical){
      var left = Math.abs(ln.x1 - e.x) < Math.abs(ln.x1 - (e.x + e.w));
      var w2 = left ? e.w - dx : e.w + dx;
      if (w2 < tol) return false;
      if (left) e.x += dx; e.w = w2;
    } else {
      var bottom = Math.abs(ln.y1 - e.y) < Math.abs(ln.y1 - (e.y + e.h));
      var h2 = bottom ? e.h - dy : e.h + dy;
      if (h2 < tol) return false;
      if (bottom) e.y += dy; e.h = h2;
    }
    return true;
  }
  if (e.t === 'poly' && e.pts.length >= 2){
    var n = e.pts.length, last = e.closed ? n : n - 1;
    for (var i = 0; i < last; i++){
      var p = e.pts[i], q = e.pts[(i + 1) % n];
      var same = (Math.hypot(p[0] - ln.x1, p[1] - ln.y1) < tol && Math.hypot(q[0] - ln.x2, q[1] - ln.y2) < tol) ||
                 (Math.hypot(p[0] - ln.x2, p[1] - ln.y2) < tol && Math.hypot(q[0] - ln.x1, q[1] - ln.y1) < tol);
      if (!same) continue;
      p[0] += dx; p[1] += dy;
      if (q !== p){ q[0] += dx; q[1] += dy; }
      return true;
    }
  }
  return false;
}
function relApply(e1, e2, v, toEdge, h1, h2, self){
  var r = relInfo(e1, e2, h1, h2);
  if (r.kind !== 'dist' || v <= 0) return false;
  if (toEdge){
    var rad = relRadius(e1, e2);
    if (rad > 0) v = v + rad;     // edge distance -> centre distance
  }
  var g1 = refGeom(e1, e2, h1), g2 = refGeom(e2, e1, h2);   // same edges that were measured
  var dx = 0, dy = 0;
  if (r.mode === 'pp'){
    var vx = g2.pt.x-g1.pt.x, vy = g2.pt.y-g1.pt.y;
    var L = Math.hypot(vx,vy);
    if (L < 1e-9) return false;
    dx = vx/L*(v-L); dy = vy/L*(v-L);
  } else if (r.mode === 'pl' || r.mode === 'll'){
    // reference line is g1; measured point is g2's point or g2 line's anchor
    var mp = r.mode === 'pl' ? g2.pt : {x:g2.ln.x1, y:g2.ln.y1};
    var d = sd(g1.ln, mp.x, mp.y);
    var sgn = d >= 0 ? 1 : -1;
    var mv = sgn*v - d;
    dx = g1.ln.a*mv; dy = g1.ln.b*mv;
  } else if (r.mode === 'lp'){
    // reference is e1's point; e2 supplies the line and moves along its own normal
    var d2 = sd(g2.ln, g1.pt.x, g1.pt.y);
    var sgn2 = d2 >= 0 ? 1 : -1;
    var shift = d2 - sgn2*v;
    dx = g2.ln.a*shift; dy = g2.ln.b*shift;
  } else return false;
  // the moving shape is held on its other side by another distance: stretch it, moving only this edge
  if ((r.mode === 'll' || r.mode === 'lp') && g2.ln && heldOtherSide(e2, g2.ln, self)){
    if (stretchEdge(e2, g2.ln, dx, dy)) return true;
    relApply.why = e2.t === 'rect' || e2.t === 'poly' ? 'That would make the shape smaller than nothing.'
      : 'Its other side is held by a distance, and only rectangles and straight-edged outlines can be stretched.';
    return false;
  }
  moveEntity(e2, dx, dy);
  return true;
}
/* geometry for drawing the dimension between two selected entities */
function dimGeometry(e1, e2){
  var r = relInfo(e1, e2);
  if (r.kind !== 'dist') return null;
  var g1 = refGeom(e1, e2), g2 = refGeom(e2, e1);
  var p1, p2;
  if (r.mode === 'pp'){ p1 = g1.pt; p2 = g2.pt; }
  else if (r.mode === 'pl'){
    var d = sd(g1.ln, g2.pt.x, g2.pt.y);
    p1 = {x:g2.pt.x - g1.ln.a*d, y:g2.pt.y - g1.ln.b*d}; p2 = g2.pt;
  }
  else if (r.mode === 'lp'){
    var d2 = sd(g2.ln, g1.pt.x, g1.pt.y);
    p1 = g1.pt; p2 = {x:g1.pt.x - g2.ln.a*d2, y:g1.pt.y - g2.ln.b*d2};
  }
  else { // ll
    var mp2 = {x:(g2.ln.x1+g2.ln.x2)/2, y:(g2.ln.y1+g2.ln.y2)/2};
    var dl = sd(g1.ln, mp2.x, mp2.y);
    p1 = {x:mp2.x - g1.ln.a*dl, y:mp2.y - g1.ln.b*dl}; p2 = mp2;
  }
  return {p1:p1, p2:p2, label:r.cur.toFixed(2)};
}

