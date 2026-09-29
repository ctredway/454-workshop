// ---- measuring ----
var MEAS = null;   // the last finished measurement {a, b, gap}, shown until the next one or Esc
function entSegs(e){                      // an entity as fine straight segments, for gap measuring
  var out = [];
  function poly(pts, closed){
    for (var i = 0; i < pts.length - 1; i++) out.push([pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]]);
    if (closed && pts.length > 2){ var l = pts[pts.length-1], f = pts[0]; out.push([l[0], l[1], f[0], f[1]]); }
  }
  if (e.t === 'line') out.push([e.x1, e.y1, e.x2, e.y2]);
  else if (e.t === 'rect' || e.t === 'poly') entityEdges(e).forEach(function(ed){ out.push(ed); });
  else if (e.t === 'circle'){
    var cp = []; for (var k = 0; k < 720; k++){ var a = k/720*2*Math.PI; cp.push([e.cx + e.r*Math.cos(a), e.cy + e.r*Math.sin(a)]); }
    poly(cp, true);
  }
  else if (e.t === 'arc'){
    var sw = arcSweepOf(e.a0, e.a1, e.ccw), st = Math.max(8, Math.ceil(sw / 0.005)), ap = [];
    for (var j = 0; j <= st; j++){ var q = arcPtAt(e, sw*j/st); ap.push([q.x, q.y]); }
    poly(ap, false);
  }
  else if (e.t === 'path') poly(tessPath(e, 0.005).map(function(q){ return [q[0], q[1]]; }), e.closed);
  else if (e.t === 'text') (textWorld(e) || []).forEach(function(ct){ poly(ct, true); });
  else if (e.t === 'group') e.ents.forEach(function(m){ entSegs(m).forEach(function(sg){ out.push(sg); }); });
  return out;
}
function closestOnSeg(px, py, s){
  var dx = s[2]-s[0], dy = s[3]-s[1], L2 = dx*dx + dy*dy;
  var t = L2 < 1e-24 ? 0 : Math.max(0, Math.min(1, ((px-s[0])*dx + (py-s[1])*dy) / L2));
  return [s[0] + t*dx, s[1] + t*dy];
}
// the closest pair of points between two shapes; d = 0 when they touch or cross
function entGap(e1, e2){
  var A = entSegs(e1), B = entSegs(e2), best = null;
  for (var i = 0; i < A.length; i++){
    var s = A[i];
    for (var j = 0; j < B.length; j++){
      var t = B[j];
      if (best){                                                   // skip pairs whose boxes are too far apart
        if (Math.min(s[0],s[2]) - Math.max(t[0],t[2]) > best.d || Math.min(t[0],t[2]) - Math.max(s[0],s[2]) > best.d ||
            Math.min(s[1],s[3]) - Math.max(t[1],t[3]) > best.d || Math.min(t[1],t[3]) - Math.max(s[1],s[3]) > best.d) continue;
      }
      var h = xLineLine(s[0],s[1],s[2],s[3], t[0],t[1],t[2],t[3]);
      if (h && h.t >= 0 && h.t <= 1 && h.u >= 0 && h.u <= 1) return {d:0, a:[h.x,h.y], b:[h.x,h.y]};
      [[s[0],s[1],t],[s[2],s[3],t],[t[0],t[1],s],[t[2],t[3],s]].forEach(function(c, k){
        var q = closestOnSeg(c[0], c[1], c[2]), dd = Math.hypot(q[0]-c[0], q[1]-c[1]);
        if (!best || dd < best.d) best = k < 2 ? {d:dd, a:[c[0],c[1]], b:q} : {d:dd, a:q, b:[c[0],c[1]]};
      });
    }
  }
  return best || {d:0, a:[0,0], b:[0,0]};
}
function measText(a, b, gap){
  var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), u = ' ' + unitTag(), dp = dispIn() ? 4 : 3;
  if (gap) return (L < 1e-9 ? 'the shapes touch or overlap' : 'gap ' + fmtDisp(L, dp) + u) +
                  '  \u0394X ' + fmtDisp(dx, dp) + '  \u0394Y ' + fmtDisp(dy, dp);
  return 'L ' + fmtDisp(L, dp) + u + '  \u0394X ' + fmtDisp(dx, dp) + '  \u0394Y ' + fmtDisp(dy, dp) +
         '  \u2220 ' + (Math.atan2(dy, dx)*180/Math.PI).toFixed(2) + '\u00b0';
}

// Corner reliefs so a square-cornered part can fit into a slot cut with a round bit.
// r is the BIT radius. The relief goes into the sharp (<180 deg) side of the corner, which is
// where the bit sits: outward at a pocket's corners, inward at an outside profile's inner corners.
//  dog-bone: the bit's centre sits on the corner's bisector, its edge just reaching the corner.
//  T-bone:   the bit's centre sits on one edge, so the relief bites sideways into that edge only.
function dogboneVertex(pe, vi, r, kind, click){
  if (!(r > 0)) return null;
  var n = pe.pts.length;
  if (!pe.closed && (vi === 0 || vi === n-1)) return null;
  var iPrev = (vi-1+n) % n, iNext = (vi+1) % n;
  if (Math.abs(pe.pts[iPrev][2] || 0) > 1e-9 || Math.abs(pe.pts[vi][2] || 0) > 1e-9){
    dogboneVertex.why = 'curved'; return null;                        // straight edges only
  }
  var P = {x:pe.pts[vi][0], y:pe.pts[vi][1]};
  var e1 = {x:pe.pts[iPrev][0]-P.x, y:pe.pts[iPrev][1]-P.y}, e2 = {x:pe.pts[iNext][0]-P.x, y:pe.pts[iNext][1]-P.y};
  var L1 = Math.hypot(e1.x, e1.y), L2 = Math.hypot(e2.x, e2.y);
  if (L1 < 1e-9 || L2 < 1e-9) return null;
  var d1 = {x:e1.x/L1, y:e1.y/L1}, d2 = {x:e2.x/L2, y:e2.y/L2};
  var theta = Math.acos(Math.max(-1, Math.min(1, d1.x*d2.x + d1.y*d2.y)));
  if (theta < 0.035 || theta > Math.PI - 0.035){ dogboneVertex.why = 'flat'; return null; }
  function bulgeFor(a, b, via){
    var g = arcFrom3(a, b, via);
    if (!g) return null;
    return Math.tan(arcSweepOf(g.a0, g.a1, g.ccw) / 4) * (g.ccw ? 1 : -1);
  }
  var pts = pe.pts.map(function(q){ return [q[0], q[1], q[2] || 0]; });
  if (kind === 'dogbone'){
    var bl = Math.hypot(d1.x + d2.x, d1.y + d2.y);
    var bis = {x:(d1.x + d2.x)/bl, y:(d1.y + d2.y)/bl};
    var a = 2 * r * Math.cos(theta / 2);                               // where the bit's circle crosses each edge
    if (a > L1 - 1e-6 || a > L2 - 1e-6){ dogboneVertex.why = 'fit'; return null; }
    var A = {x:P.x + a*d1.x, y:P.y + a*d1.y}, B = {x:P.x + a*d2.x, y:P.y + a*d2.y};
    var bg = bulgeFor(A, B, P);                                        // the arc runs through the corner itself
    if (bg === null) return null;
    pts.splice(vi, 1, [A.x, A.y, bg], [B.x, B.y, 0]);
    return {t:'path', pts:pts, closed:pe.closed, relief:{cx:P.x + r*bis.x, cy:P.y + r*bis.y}};
  }
  // T-bone: into the edge the click is nearer to (the longer edge when it's too close to call)
  var side = L1 >= L2 ? 1 : 2;
  if (click){
    var t1 = (click.x-P.x)*d1.x + (click.y-P.y)*d1.y, t2 = (click.x-P.x)*d2.x + (click.y-P.y)*d2.y;
    if (Math.abs(t1 - t2) > 2 / VIEW.scale) side = t1 > t2 ? 1 : 2;
  }
  var d = side === 1 ? d1 : d2, other = side === 1 ? d2 : d1, L = side === 1 ? L1 : L2;
  if (2 * r > L - 1e-6){ dogboneVertex.why = 'fit'; return null; }
  var C = {x:P.x + r*d.x, y:P.y + r*d.y};
  var nrm = {x:-d.y, y:d.x};
  if (nrm.x*other.x + nrm.y*other.y > 0){ nrm.x = -nrm.x; nrm.y = -nrm.y; }   // away from the corner's inside
  var M = {x:C.x + r*nrm.x, y:C.y + r*nrm.y};
  var Aa = {x:P.x + 2*r*d.x, y:P.y + 2*r*d.y};
  if (side === 1){
    var b1 = bulgeFor(Aa, P, M); if (b1 === null) return null;
    pts.splice(vi, 1, [Aa.x, Aa.y, b1], [P.x, P.y, 0]);
  } else {
    var b2 = bulgeFor(P, Aa, M); if (b2 === null) return null;
    pts.splice(vi, 1, [P.x, P.y, b2], [Aa.x, Aa.y, 0]);
  }
  return {t:'path', pts:pts, closed:pe.closed, relief:{cx:C.x, cy:C.y}};
}
// The corner a click (or hover) refers to: the NEAREST poly/path/rect vertex within reach.
// Hover and click both use this, so the check mark always describes the corner that will change.
// An outline with a point repeated (a zero-length edge between them, e.g. from a double-click while
// drawing) looks and cuts the same without it, but a corner beside a zero-length edge has no direction
// to fillet or restore. The corner tools work on the outline with repeats merged, and write it back so.
function pathClean(pe){
  var P = pe.pts, n = P.length;
  if (n < 2) return pe;
  var same = function (a, b){ return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6; };
  var any = false;
  for (var k = 0; k < n; k++){ if ((k + 1 < n || pe.closed) && same(P[k], P[(k + 1) % n])){ any = true; break; } }
  if (!any) return pe;
  var out = [];
  for (var j = 0; j < n; j++){
    var cur = [P[j][0], P[j][1], P[j][2] || 0];
    var nxt = j + 1 < n ? P[j + 1] : (pe.closed ? P[0] : null);
    if (nxt && same(cur, nxt) && (j + 1 < n || out.length)) continue;   // its edge goes nowhere: the next copy carries on
    out.push(cur);
  }
  if (out.length < 2) return pe;
  var c = {}; for (var key in pe) if (key !== 'pts') c[key] = pe[key];
  c.pts = out; c.t = 'path';
  return c;
}
function cornerPick(w){
  var tol = 10/VIEW.scale, pick = null;
  for (var i = 0; i < DOC.ents.length; i++){
    var e = DOC.ents[i], pe = null;
    if (e.t === 'poly') pe = polyToPath(e);
    else if (e.t === 'path') pe = e;
    else if (e.t === 'rect') pe = rectToPath(e);
    if (!pe) continue;
    pe = pathClean(pe);                                          // repeated points merged
    for (var vi = 0; vi < pe.pts.length; vi++){
      var dv = Math.hypot(w.x-pe.pts[vi][0], w.y-pe.pts[vi][1]);
      if (dv < tol && (!pick || dv < pick.d)) pick = {d:dv, i:i, vi:vi, e:e, pe:pe};
    }
  }
  return pick;
}
function cornerResult(pick, r, w){
  dogboneVertex.why = null;
  var ft = UICFG.filletType || 'round';
  return ft === 'round' ? filletPathVertex(pick.pe, pick.vi, r) : dogboneVertex(pick.pe, pick.vi, r, ft, w);
}

