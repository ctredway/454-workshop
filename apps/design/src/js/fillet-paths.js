function polyToPath(e){
  return {t:'path', pts: e.pts.map(function(p){ return [p[0], p[1], 0]; }), closed: !!e.closed};
}
function rectToPath(e){
  return {t:'path', closed:true, pts:[[e.x,e.y,0],[e.x+e.w,e.y,0],[e.x+e.w,e.y+e.h,0],[e.x,e.y+e.h,0]]};
}
function spanCurve(p0, p1, bulge){
  // geometric description of one span for fillet math
  if (Math.abs(bulge) < 1e-12)
    return {kind:'line', ax:p0[0], ay:p0[1], bx:p1[0], by:p1[1]};
  var th = 4*Math.atan(bulge);
  var ch = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
  if (ch < 1e-12) return null;
  var R = ch/(2*Math.sin(Math.abs(th)/2));
  var mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
  var h = Math.sqrt(Math.max(R*R - ch*ch/4, 0)) * (th > 0 ? 1 : -1);
  var ux = (p1[0]-p0[0])/ch, uy = (p1[1]-p0[1])/ch;
  return {kind:'arc', cx:mx - uy*h, cy:my + ux*h, R:R, ccw: th > 0,
          a0:Math.atan2(p0[1]-(my+ux*h), p0[0]-(mx-uy*h)),
          a1:Math.atan2(p1[1]-(my+ux*h), p1[0]-(mx-uy*h))};
}
function tangencyOn(curve, O){
  // foot of tangency of a circle centered O against the curve; null if off-span
  if (curve.kind === 'line'){
    var dx = curve.bx-curve.ax, dy = curve.by-curve.ay;
    var L2 = dx*dx+dy*dy;
    if (L2 < 1e-18) return null;
    var t = ((O.x-curve.ax)*dx + (O.y-curve.ay)*dy) / L2;
    if (t < 1e-7 || t > 1-1e-7) return null;
    return {x:curve.ax + dx*t, y:curve.ay + dy*t};
  }
  var d = Math.hypot(O.x-curve.cx, O.y-curve.cy);
  if (d < 1e-12) return null;
  var T = {x:curve.cx + (O.x-curve.cx)*curve.R/d, y:curve.cy + (O.y-curve.cy)*curve.R/d};
  var ang = Math.atan2(T.y-curve.cy, T.x-curve.cx);
  var sw = curve.ccw ? angNorm(curve.a1-curve.a0) : angNorm(curve.a0-curve.a1);
  if (sw < 1e-12) sw = 2*Math.PI;
  var sp = curve.ccw ? angNorm(ang-curve.a0) : angNorm(curve.a0-ang);
  if (sp < 1e-7 || sp > sw - 1e-7) return null;
  return T;
}
function filletCenters(c1, c2, r){
  // candidate fillet centers: distance r from both curves
  var lines = [], out = [];
  function lineOffsets(c){
    var dx = c.bx-c.ax, dy = c.by-c.ay, L = Math.hypot(dx,dy);
    var nx = -dy/L, ny = dx/L;
    return [{kind:'line', ax:c.ax+nx*r, ay:c.ay+ny*r, bx:c.bx+nx*r, by:c.by+ny*r},
            {kind:'line', ax:c.ax-nx*r, ay:c.ay-ny*r, bx:c.bx-nx*r, by:c.by-ny*r}];
  }
  function circOffsets(c){
    var o = [{kind:'circ', cx:c.cx, cy:c.cy, R:c.R + r}];
    if (c.R - r > 1e-6) o.push({kind:'circ', cx:c.cx, cy:c.cy, R:c.R - r});
    return o;
  }
  var o1 = c1.kind === 'line' ? lineOffsets(c1) : circOffsets(c1);
  var o2 = c2.kind === 'line' ? lineOffsets(c2) : circOffsets(c2);
  o1.forEach(function(a){
    o2.forEach(function(b){
      if (a.kind === 'line' && b.kind === 'line'){
        var h = xLineLine(a.ax,a.ay,a.bx,a.by, b.ax,b.ay,b.bx,b.by);
        if (h) out.push({x:h.x, y:h.y});
      } else if (a.kind === 'line'){
        xLineCircle(a.ax,a.ay,a.bx,a.by, b.cx,b.cy,b.R).forEach(function(q){ out.push({x:q.x, y:q.y}); });
      } else if (b.kind === 'line'){
        xLineCircle(b.ax,b.ay,b.bx,b.by, a.cx,a.cy,a.R).forEach(function(q){ out.push({x:q.x, y:q.y}); });
      } else {
        xCircleCircle(a.cx,a.cy,a.R, b.cx,b.cy,b.R).forEach(function(q){ out.push(q); });
      }
    });
  });
  return out;
}
function spanBulgeBetween(curve, P0, P1){
  // bulge for travel P0->P1 along the given circle-curve (0 for lines)
  if (curve.kind === 'line') return 0;
  var aA = Math.atan2(P0.y-curve.cy, P0.x-curve.cx);
  var aB = Math.atan2(P1.y-curve.cy, P1.x-curve.cx);
  var sw = curve.ccw ? angNorm(aB-aA) : angNorm(aA-aB);
  return Math.tan(sw/4) * (curve.ccw ? 1 : -1);
}
function filletPathVertex(pe, vi, r){
  if (!(r > 0) || !isFinite(r)) return null;
  var n = pe.pts.length;
  if (!pe.closed && (vi === 0 || vi === n-1)) return null;
  var iPrev = (vi-1+n) % n, iNext = (vi+1) % n;
  var P = {x:pe.pts[vi][0], y:pe.pts[vi][1]};
  // adjacent spans (these are what we actually SPLICE — the edit stays local to the corner)
  var cInLocal  = spanCurve(pe.pts[iPrev], pe.pts[vi], pe.pts[iPrev][2] || 0);
  var cOutLocal = spanCurve(pe.pts[vi], pe.pts[iNext], pe.pts[vi][2] || 0);
  if (!cInLocal || !cOutLocal) return null;
  // For TANGENCY math only, an arc span uses its underlying full circle (a small fillet's tangent
  // point can land a little around the arc, beyond one stored sub-fragment). We keep the circle
  // unbounded here and rely on: (a) the interior test, (b) requiring the tangent foot to be within
  // a limited arc distance of the corner so a fillet can't wrap onto the far side of a lobe.
  var cIn = cInLocal, cOut = cOutLocal;

  var outline = pe.closed ? tessPath(pe, 0.03) : null;
  function insideProfile(O){
    if (!outline) return true;
    var x = O.x, y = O.y, c = false;
    for (var a = 0, b = outline.length-1; a < outline.length; b = a++){
      var xi = outline[a][0], yi = outline[a][1], xj = outline[b][0], yj = outline[b][1];
      if (((yi > y) !== (yj > y)) && (x < (xj-xi)*(y-yi)/(yj-yi) + xi)) c = !c;
    }
    return c;
  }
  // foot of the fillet onto a span's curve; for arcs the foot may be off the stored sub-span but
  // must stay within maxArc radians of the corner (keeps the fillet local, never wraps a lobe)
  var maxArc = Math.PI * 0.6;
  // Tangent foot must lie on the span, with only a hair of tolerance — NO large corner overshoot
  // (overshoot let the solver pick a center whose line-tangent sits past the corner on the wrong
  // side, producing a fillet that crosses back over the corner). A tiny epsilon absorbs rounding.
  var EPS = 1e-3;
  function footOnLine(curve, O){
    var dx = curve.bx-curve.ax, dy = curve.by-curve.ay, L2 = dx*dx+dy*dy;
    if (L2 < 1e-18) return null;
    var t = ((O.x-curve.ax)*dx + (O.y-curve.ay)*dy) / L2;
    if (t < -EPS || t > 1+EPS) return null;
    return {x:curve.ax + dx*t, y:curve.ay + dy*t};
  }
  function footOnArc(curve, O, incoming){
    var d = Math.hypot(O.x-curve.cx, O.y-curve.cy);
    if (d < 1e-9) return null;
    var F = {x:curve.cx + (O.x-curve.cx)*curve.R/d, y:curve.cy + (O.y-curve.cy)*curve.R/d};
    var aF = Math.atan2(F.y-curve.cy, F.x-curve.cx);
    var aP = Math.atan2(P.y-curve.cy, P.x-curve.cx);
    // The foot must be on the edge's own side of the corner: before it on the edge coming in, after it
    // on the edge going out. It may run past a stored arc piece (split arcs), but never past the corner
    // onto the circle's extension: that picked a fillet outside the shape where two arcs met.
    var travel = function (from, to){ return curve.ccw ? angNorm(to-from) : angNorm(from-to); };
    var along = incoming ? travel(aF, aP) : travel(aP, aF);
    if (along > maxArc && along < 2*Math.PI - 1e-9) return null;
    if (along > 2*Math.PI - 1e-6) along = 0;                    // at the corner itself
    return F;
  }
  function footOn(curve, O, incoming){ return curve.kind === 'line' ? footOnLine(curve, O) : footOnArc(curve, O, incoming); }
  // The correct fillet — convex OR concave — is the one whose two tangent points hug the corner:
  // both feet land right at P. Wrong-side solutions put at least one foot far around the arc or
  // off along the line. So among strictly on-segment tangent candidates, minimise the SUM of the
  // two tangent-foot distances to the corner. This needs no convex/concave test and no inside
  // filter (the inside filter was backwards for concave/reentrant corners).
  var best = null;
  filletCenters(cIn, cOut, r).forEach(function(O){
    var T1 = footOn(cIn, O, true), T2 = footOn(cOut, O, false);
    if (!T1 || !T2) return;
    var footDist = Math.hypot(T1.x-P.x, T1.y-P.y) + Math.hypot(T2.x-P.x, T2.y-P.y);
    if (!best || footDist < best.footDist) best = {O:O, T1:T1, T2:T2, footDist:footDist};
  });
  if (!best) return null;

  var aT1 = Math.atan2(best.T1.y-best.O.y, best.T1.x-best.O.x);
  var aT2 = Math.atan2(best.T2.y-best.O.y, best.T2.x-best.O.x);
  var ccwF = angNorm(aT2-aT1) <= Math.PI;
  var swF = ccwF ? angNorm(aT2-aT1) : angNorm(aT1-aT2);
  var bulgeF = Math.tan(swF/4) * (ccwF ? 1 : -1);

  // LOCAL splice: only the two adjacent spans change. incoming shortens to T1, fillet T1->T2,
  // outgoing shortens from T2. Bulges recomputed against the LOCAL span geometry.
  var pts = pe.pts.map(function(pt){ return pt.slice(); });
  pts[iPrev][2] = spanBulgeBetween(cInLocal, {x:pts[iPrev][0], y:pts[iPrev][1]}, best.T1);
  var outBulge = spanBulgeBetween(cOutLocal, best.T2, {x:pe.pts[iNext][0], y:pe.pts[iNext][1]});
  pts.splice(vi, 1, [best.T1.x, best.T1.y, bulgeF], [best.T2.x, best.T2.y, outBulge]);
  return {t:'path', pts:pts, closed:pe.closed};
}

function cloneEnt(e){
  var c = JSON.parse(JSON.stringify(e));
  (function strip(o){
    delete o._tess; delete o._tess2; delete o._id;   // a copy is a new entity with its own identity
    if (o.ents) o.ents.forEach(strip);
  })(c);
  return c;
}

