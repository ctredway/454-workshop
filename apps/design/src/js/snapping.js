/* ---------------- snapping ---------------- */
function snapPoints(){
  var pts = [];
  var sr = stockRect();
  pts.push({x:sr.x0,y:sr.y0,k:'corner'},{x:sr.x1,y:sr.y0,k:'corner'},
           {x:sr.x1,y:sr.y1,k:'corner'},{x:sr.x0,y:sr.y1,k:'corner'});
  DOC.ents.forEach(function(e){
    if (DOC.layers && !entVisible(e)) return;         // nothing on a hidden layer to snap to
    if (e.t==='line'){ pts.push({x:e.x1,y:e.y1,k:'end'},{x:e.x2,y:e.y2,k:'end'},
                                {x:(e.x1+e.x2)/2,y:(e.y1+e.y2)/2,k:'mid'}); }
    else if (e.t==='circle'){ pts.push({x:e.cx,y:e.cy,k:'center'}); }
    else if (e.t==='text'){ pts.push({x:e.x,y:e.y,k:'end'}); }
    else if (e.t==='rect'){
      pts.push({x:e.x,y:e.y,k:'end'},{x:e.x+e.w,y:e.y,k:'end'},
               {x:e.x+e.w,y:e.y+e.h,k:'end'},{x:e.x,y:e.y+e.h,k:'end'},
               {x:e.x+e.w/2,y:e.y+e.h/2,k:'center'});
    }
    else if (e.t==='poly'){ e.pts.forEach(function(p){ pts.push({x:p[0],y:p[1],k:'end'}); }); }
    else if (e.t==='arc'){
      var ae = arcEnds(e);
      pts.push({x:ae[0].x,y:ae[0].y,k:'end'},{x:ae[1].x,y:ae[1].y,k:'end'},{x:e.cx,y:e.cy,k:'center'});
    }
    else if (e.t==='path'){ e.pts.forEach(function(p){ pts.push({x:p[0],y:p[1],k:'end'}); }); }
  });
  // guide-guide intersections
  for (var i=0;i<DOC.guides.length;i++)
    for (var j=i+1;j<DOC.guides.length;j++){
      var p = guideX(DOC.guides[i], DOC.guides[j]);
      if (p) pts.push({x:p.x,y:p.y,k:'guideX'});
    }
  return pts;
}
function guideX(g1,g2){
  var d = g1.a*g2.b - g2.a*g1.b;
  if (Math.abs(d) < 1e-9) return null;
  return {x:(g1.c*g2.b - g2.c*g1.b)/d, y:(g1.a*g2.c - g2.a*g1.c)/d};
}
function angTo(cx, cy, p){ return Math.atan2(p.y-cy, p.x-cx); }
function e0mid(e){
  var half = arcSweep(e)/2;
  var a = e.ccw ? e.a0 + half : e.a0 - half;
  return {x:e.cx + e.r*Math.cos(a), y:e.cy + e.r*Math.sin(a)};
}
function arcEnds(e){
  return [{x:e.cx + e.r*Math.cos(e.a0), y:e.cy + e.r*Math.sin(e.a0)},
          {x:e.cx + e.r*Math.cos(e.a1), y:e.cy + e.r*Math.sin(e.a1)}];
}
function arcSweep(e){ // sweep along stored direction, 0..2pi
  var d = e.ccw ? (e.a1 - e.a0) : (e.a0 - e.a1);
  d = d % (2*Math.PI); if (d < 0) d += 2*Math.PI;
  return d || 2*Math.PI * 0; // zero stays zero
}
function arcInSpan(e, ang){
  var rel = e.ccw ? (ang - e.a0) : (e.a0 - ang);
  rel = rel % (2*Math.PI); if (rel < 0) rel += 2*Math.PI;
  return rel <= arcSweep(e) + 1e-9;
}
function arcHitDist(e, w){
  var ang = angTo(e.cx, e.cy, w);
  if (arcInSpan(e, ang)) return Math.abs(Math.hypot(w.x-e.cx, w.y-e.cy) - e.r);
  var ends = arcEnds(e);
  return Math.min(Math.hypot(w.x-ends[0].x, w.y-ends[0].y),
                  Math.hypot(w.x-ends[1].x, w.y-ends[1].y));
}
function guideSnap(w){ // nearest point on any guide within tolerance
  var best = null, tol = 8/VIEW.scale;
  DOC.guides.forEach(function(g){
    var d = g.a*w.x + g.b*w.y - g.c;           // signed distance (a,b normalized)
    if (Math.abs(d) < tol){
      var p = {x:w.x - g.a*d, y:w.y - g.b*d};
      var dd = Math.abs(d);
      if (!best || dd < best.d) best = {x:p.x, y:p.y, d:dd, k:'guide'};
    }
  });
  return best;
}
// ---- angle snap: lines at 0, 45, 90, 135... degrees ----
// Drawing a line or polyline segment, the end snaps onto the nearest 45-degree line through its start when
// the cursor is within ANGLE_SNAP_PX of it (Shift: always), at a whole grid step along it. Vectors and
// construction lines alike: they're drawn with the same tools. Settings -> Drawing turns it off.
var ANGLE_SNAP_PX = 10;
function drawAnchor(){                                // the point the segment being drawn starts from
  if (TOOL === 'line' && DRAW && DRAW.stage === 1) return {x: DRAW.x, y: DRAW.y};
  if (TOOL === 'poly' && DRAW && DRAW.pts && DRAW.pts.length){ var l = DRAW.pts[DRAW.pts.length - 1]; return {x: l[0], y: l[1]}; }
  return null;
}
function angleSnap(w){
  if (UICFG.angleSnap === false) return null;
  var a = drawAnchor(); if (!a) return null;
  var dx = w.x - a.x, dy = w.y - a.y;
  if (Math.hypot(dx, dy) * VIEW.scale < 4) return null;                 // right on the start: nothing to aim
  var k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)), t = k * Math.PI / 4, ux = Math.cos(t), uy = Math.sin(t);
  if (Math.abs(ux) < 1e-12) ux = 0; if (Math.abs(uy) < 1e-12) uy = 0;
  var along = dx*ux + dy*uy, off = Math.abs(dy*ux - dx*uy);
  if (along <= 0) return null;
  if (!MOUSE.shift && off * VIEW.scale > ANGLE_SNAP_PX) return null;   // not near a 45-degree line: free
  var deg = ((k * 45) % 360 + 360) % 360;
  // a guide at the cursor: exactly where the angle line crosses it
  var gs = guideSnap(w);
  if (gs){
    var best = null;
    DOC.guides.forEach(function (g){
      var den = g.a*ux + g.b*uy; if (Math.abs(den) < 1e-9) return;
      var sAlong = (g.c - g.a*a.x - g.b*a.y) / den;
      if (sAlong > 0 && Math.abs(sAlong - along) * VIEW.scale < ANGLE_SNAP_PX * 1.5 && (!best || Math.abs(sAlong - along) < Math.abs(best - along))) best = sAlong;
    });
    if (best !== null) return {x: a.x + ux*best, y: a.y + uy*best, k: 'angle', deg: deg, from: a, onGuide: true};
  }
  var step = VIEW.scale > 8 ? 0.5 : 1;                                  // a whole grid step along the line
  along = Math.max(step, Math.round(along / step) * step);
  return {x: a.x + ux*along, y: a.y + uy*along, k: 'angle', deg: deg, from: a};
}
function resolveSnap(w){
  var tol = 9/VIEW.scale;
  var best = null;
  snapPoints().forEach(function(p){
    var d = Math.hypot(p.x-w.x, p.y-w.y);
    if (d < tol && (!best || d < best.d)) best = {x:p.x,y:p.y,d:d,k:p.k};
  });
  if (best) return best;                              // a shape's point wins: it's the more deliberate aim
  var as = angleSnap(w);
  if (as) return as;
  var g = guideSnap(w);
  if (g) return g;
  // grid snap 1mm (0.5 when zoomed in past 8 px/mm)
  var step = VIEW.scale > 8 ? 0.5 : 1;
  return {x:Math.round(w.x/step)*step, y:Math.round(w.y/step)*step, k:'grid'};
}

