// ---- removing a fillet ----
// Every corner Design makes is an arc between two straight edges: a round fillet (tangent to both), a
// dog-bone (through the old corner) or a T-bone (from an edge to the corner). Extending the straight
// edges on each side of the arc until they meet puts back the sharp corner exactly. A fillet made
// between two separate lines is an arc joining their trimmed ends: extend both lines to where they
// meet and drop the arc. Only removes an arc whose edges really meet beyond it (not a slot's end,
// whose sides are parallel).
function filletAt(w){
  var tol = 10 / VIEW.scale, best = null;
  function consider(c){ if (c && c.d < tol && (!best || c.d < best.d)) best = c; }
  for (var i = 0; i < DOC.ents.length; i++){
    var e = DOC.ents[i], pe = e.t === 'path' ? e : (e.t === 'poly' ? polyToPath(e) : null);
    if (!pe) continue;
    pe = pathClean(pe);                                          // repeated points merged
    if (pe.pts.length < 3) continue;
    for (var k = 0; k < pe.pts.length; k++){
      if (Math.abs(pe.pts[k][2] || 0) < 1e-9) continue;
      var c = filletChainAt(pe, k, w);
      if (c){ c.i = i; c.pe = pe; consider(c); }
    }
  }
  // an arc joining two separate lines
  DOC.ents.forEach(function (e, ai) {
    if (e.t !== 'arc' || !entOnSheet(e)) return;
    var d = arcHitDist(e, w); if (!(d < tol)) return;
    var sw = arcSweepOf(e.a0, e.a1, e.ccw), a1 = e.a0 + (e.ccw ? 1 : -1) * sw;
    var E0 = {x: e.cx + e.r * Math.cos(e.a0), y: e.cy + e.r * Math.sin(e.a0)}, E1 = {x: e.cx + e.r * Math.cos(a1), y: e.cy + e.r * Math.sin(a1)};
    var eps = 0.005;                                    // DXF coordinates are rounded when written (4 decimals of an inch is ~0.0013 mm)
    function lineAt(Pt, skip){
      for (var li = 0; li < DOC.ents.length; li++){
        var L = DOC.ents[li]; if (L.t !== 'line' || li === skip) continue;
        if (Math.hypot(L.x1 - Pt.x, L.y1 - Pt.y) < eps) return {i: li, end: 1};
        if (Math.hypot(L.x2 - Pt.x, L.y2 - Pt.y) < eps) return {i: li, end: 2};
      }
      return null;
    }
    var la = lineAt(E0, -1), lb = la ? lineAt(E1, la.i) : null;
    if (!la || !lb) return;
    var LA = DOC.ents[la.i], LB = DOC.ents[lb.i];
    var X = xLineLine(LA.x1, LA.y1, LA.x2, LA.y2, LB.x1, LB.y1, LB.x2, LB.y2);
    if (!X) return;
    // each line grows from its arc end, away from its other end
    function grows(L, end){ var fx = end === 1 ? L.x2 : L.x1, fy = end === 1 ? L.y2 : L.y1, ex = end === 1 ? L.x1 : L.x2, ey = end === 1 ? L.y1 : L.y2;
      return (X.x - ex) * (ex - fx) + (X.y - ey) * (ey - fy) >= -1e-9; }
    if (!grows(LA, la.end) || !grows(LB, lb.end)) return;
    consider({d: d, kind: 'lines', arc: ai, la: la, lb: lb, A: [E0.x, E0.y], B: [E1.x, E1.y], X: X});
  });
  return best;
}
// ---- a fillet on an outline: one arc, or several on the same circle (VCarve sometimes splits a
// corner's arc in two), between two edges. Straight edges: extend both until they meet (round,
// dog-bone and T-bone alike). A curved edge: extend it along its own circle; only for a true fillet
// (tangent to both edges, as one made by rounding a corner always is) at a real corner, so smooth
// curves aren't mistaken for fillets. Returns the new points, or null.
function spanCircle(p, q){
  var t = tessPath({t: 'path', closed: false, pts: [[p[0], p[1], p[2]], [q[0], q[1], 0]]}, 0.02), m = t[Math.floor(t.length / 2)];
  var g = arcFrom3({x: p[0], y: p[1]}, {x: q[0], y: q[1]}, {x: m[0], y: m[1]});
  if (!g) return null;
  return {cx: g.cx, cy: g.cy, r: g.r, ccw: (p[2] || 0) > 0, mid: {x: m[0], y: m[1]}, tess: t};
}
function sameCircle(g1, g2){ return g1 && g2 && g1.ccw === g2.ccw && Math.abs(g1.r - g2.r) < 1e-4 * g1.r + 1e-6 && Math.hypot(g1.cx - g2.cx, g1.cy - g2.cy) < 1e-4 * g1.r + 1e-6; }
function filletChainAt(pe, k, w){
  filletChainAt.why = null;
  var P = pe.pts, n = P.length, closed = pe.closed;
  var arcOf = function (j){ j = (j + n) % n; return Math.abs(P[j][2] || 0) > 1e-9 ? spanCircle(P[j], P[(j + 1) % n]) : null; };
  var g = arcOf(k); if (!g) return null;
  // grow the chain of same-circle arcs both ways
  var s = k, e = k, guard = 0;
  while (guard++ < n){ var gp = arcOf(s - 1); if (!closed && s === 0) break; if (sameCircle(g, gp)) s = s - 1; else break; }
  guard = 0;
  while (guard++ < n){ if (!closed && e + 1 >= n - 1) break; var gn = arcOf(e + 1); if (sameCircle(g, gn)) e = e + 1; else break; }
  if (e - s + 1 >= n - 1){ filletChainAt.why = 'whole outline is one circle'; return null; }                                  // the whole outline is one circle
  if (!closed && (s < 1 || e + 2 > n - 1)){ filletChainAt.why = 'no edge on one side'; return null; }                 // needs an edge on each side
  var sI = (s + n) % n, bI = (e + 1 + n) % n, spI = (s - 1 + n) % n, snI = (e + 1 + n) % n, nxI = (e + 2 + n) % n;
  var A = P[sI], B = P[bI], Pv = P[spI], Nx = P[nxI];
  // distance from the cursor to the chain
  var d = Infinity;
  for (var j = s; j <= e; j++){
    var gj = arcOf(j), t = gj.tess;
    for (var q = 0; q + 1 < t.length; q++) d = Math.min(d, distToSeg(w.x, w.y, t[q][0], t[q][1], t[q + 1][0], t[q + 1][1]));
  }
  var inArc = Math.abs(Pv[2] || 0) > 1e-9 ? spanCircle(Pv, A) : null;       // the edge coming in
  var outArc = Math.abs(B[2] || 0) > 1e-9 ? spanCircle(B, Nx) : null;       // the edge going out
  var X, inBulge = 0, outBulge = 0;
  if (!inArc && !outArc){
    var L = xLineLine(Pv[0], Pv[1], A[0], A[1], B[0], B[1], Nx[0], Nx[1]);
    if (!L || L.t < 1 - 1e-6 || L.u > 1e-6){ filletChainAt.why = 'straight edges do not meet beyond the arc'; return null; }                 // the edges must meet beyond the arc
    var chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (Math.hypot(L.x - A[0], L.y - A[1]) > 20 * chord + 1){ filletChainAt.why = 'edges nearly parallel'; return null; }  // nearly parallel: not a corner
    X = {x: L.x, y: L.y};
  } else {
    // a true fillet: tangent to both edges
    function dirLine(a, b){ var L2 = Math.hypot(b[0] - a[0], b[1] - a[1]); return L2 < 1e-12 ? null : {x: (b[0] - a[0]) / L2, y: (b[1] - a[1]) / L2}; }
    function dirCirc(c, pt){ var rx = pt[0] - c.cx, ry = pt[1] - c.cy, rl = Math.hypot(rx, ry); return c.ccw ? {x: -ry / rl, y: rx / rl} : {x: ry / rl, y: -rx / rl}; }
    var fA = dirCirc(g, A), fB = dirCirc(arcOf(e), B);
    var eIn = inArc ? dirCirc(inArc, A) : dirLine(Pv, A), eOut = outArc ? dirCirc(outArc, B) : dirLine(B, Nx);
    if (!eIn || !eOut || eIn.x * fA.x + eIn.y * fA.y < Math.cos(2 * Math.PI / 180) || eOut.x * fB.x + eOut.y * fB.y < Math.cos(2 * Math.PI / 180)){ filletChainAt.why = 'not tangent to its edges'; return null; }
    // where the extended edges meet: line or circle, each
    var cands = [];
    function lineCirc(p0, dv, c){
      var fx = p0[0] - c.cx, fy = p0[1] - c.cy, bq = fx * dv.x + fy * dv.y, cq = fx * fx + fy * fy - c.r * c.r, disc = bq * bq - cq;
      if (disc < 0) return; var sq = Math.sqrt(disc);
      [-bq - sq, -bq + sq].forEach(function (t){ cands.push({x: p0[0] + dv.x * t, y: p0[1] + dv.y * t}); });
    }
    if (inArc && outArc){
      var dx = outArc.cx - inArc.cx, dy = outArc.cy - inArc.cy, D = Math.hypot(dx, dy);
      if (D < 1e-9 || D > inArc.r + outArc.r || D < Math.abs(inArc.r - outArc.r)){ filletChainAt.why = 'the curved edges never meet'; return null; }
      var aa = (inArc.r * inArc.r - outArc.r * outArc.r + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, inArc.r * inArc.r - aa * aa));
      var mx = inArc.cx + aa * dx / D, my = inArc.cy + aa * dy / D;
      cands.push({x: mx + hh * dy / D, y: my - hh * dx / D}, {x: mx - hh * dy / D, y: my + hh * dx / D});
    } else if (inArc) lineCirc(B, eOut, inArc);
    else lineCirc(A, eIn, outArc);
    var mid = g.mid, bestX = null;
    cands.forEach(function (c2){ var dd = Math.hypot(c2.x - mid.x, c2.y - mid.y); if (!bestX || dd < bestX.d) bestX = {x: c2.x, y: c2.y, d: dd}; });
    if (!bestX || bestX.d > 10 * g.r + 1e-6){ filletChainAt.why = 'the edges meet too far away'; return null; }                // the corner is near the fillet (further for pointed corners)
    X = {x: bestX.x, y: bestX.y};
    // a real corner at X: the edges arrive in different directions
    var tIn = inArc ? dirCirc(inArc, [X.x, X.y]) : eIn, tOut = outArc ? dirCirc(outArc, [X.x, X.y]) : eOut;
    var dotX = tIn.x * tOut.x + tIn.y * tOut.y, crossX = tIn.x * tOut.y - tIn.y * tOut.x;
    if (dotX > Math.cos(3 * Math.PI / 180)){ filletChainAt.why = 'barely a corner'; return null; }                  // barely a turn: no corner
    if (dotX < Math.cos(177 * Math.PI / 180)){ filletChainAt.why = 'edges meet head-on'; return null; }               // a U-turn, as where an S-curve's edges meet: not a corner
    if ((crossX > 0) !== g.ccw){ filletChainAt.why = 'turns the other way to its corner'; return null; }                              // a fillet turns the same way as its corner
    // extend each curved edge along its circle, the same way round, by less than a quarter turn
    function sweepTo(c, from, to){ return arcSweepOf(Math.atan2(from[1] - c.cy, from[0] - c.cx), Math.atan2(to[1] - c.cy, to[0] - c.cx), c.ccw); }
    if (inArc){
      var sw0 = sweepTo(inArc, Pv, A), sw1 = sweepTo(inArc, Pv, [X.x, X.y]);
      if (!(sw1 > sw0 - 1e-9 && sw1 - sw0 < Math.PI / 2)){ filletChainAt.why = 'incoming curve would not extend to the corner (' + (sw0 * 180 / Math.PI).toFixed(1) + ' to ' + (sw1 * 180 / Math.PI).toFixed(1) + ' deg)'; return null; }
      inBulge = Math.tan(sw1 / 4) * (inArc.ccw ? 1 : -1);
    }
    if (outArc){
      var so0 = sweepTo(outArc, B, Nx), so1 = sweepTo(outArc, [X.x, X.y], Nx);
      if (!(so1 > so0 - 1e-9 && so1 - so0 < Math.PI / 2)){ filletChainAt.why = 'outgoing curve would not extend to the corner (' + (so0 * 180 / Math.PI).toFixed(1) + ' to ' + (so1 * 180 / Math.PI).toFixed(1) + ' deg)'; return null; }
      outBulge = Math.tan(so1 / 4) * (outArc.ccw ? 1 : -1);
    }
  }
  // the new outline: the chain's points give way to the corner
  var drop = {}; for (var t2 = 0; t2 <= e - s + 1; t2++) drop[(s + t2 + n) % n] = true;
  var pts = [];
  for (var v = 0; v < n; v++){
    if (v === sI) pts.push([X.x, X.y, outBulge]);
    if (drop[v]) continue;
    var cp = [P[v][0], P[v][1], P[v][2] || 0];
    if (v === spI && inArc) cp[2] = inBulge;
    pts.push(cp);
  }
  return {d: d, kind: 'path', A: [A[0], A[1]], B: [B[0], B[1]], X: X, newPts: pts, closed: closed};
}
// Remove a fillet filletAt found: the sharp corner comes back. Returns true when done.
function unfillet(f){
  if (!f) return false;
  pushUndo();
  if (f.kind === 'lines'){
    var LA = DOC.ents[f.la.i], LB = DOC.ents[f.lb.i];
    if (f.la.end === 1){ LA.x1 = f.X.x; LA.y1 = f.X.y; } else { LA.x2 = f.X.x; LA.y2 = f.X.y; }
    if (f.lb.end === 1){ LB.x1 = f.X.x; LB.y1 = f.X.y; } else { LB.x2 = f.X.x; LB.y2 = f.X.y; }
    DOC.ents.splice(f.arc, 1);
    return true;
  }
  var old = DOC.ents[f.i], pts = f.newPts;
  var allStraight = pts.every(function (q) { return Math.abs(q[2]) < 1e-9; });
  var ne = allStraight ? {t: 'poly', pts: pts.map(function (q) { return [q[0], q[1]]; }), closed: f.closed}
                       : {t: 'path', pts: pts, closed: f.closed};
  ['tp', 'con', '_id', 'layer', 'sheet', 'vcId', 'vcSheet'].forEach(function (k2) { if (old[k2] !== undefined) ne[k2] = old[k2]; });
  DOC.ents.splice(f.i, 1, ne);
  return true;
}
// Fillet tool: is the cursor nearer a fillet (to remove) than a sharp corner (to fillet)?
function filletRemovable(w){
  var f = filletAt(w); if (!f) return null;
  var pk = cornerPick(w);
  if (pk && pk.d < f.d && !(Math.hypot(pk.pe.pts[pk.vi][0] - f.A[0], pk.pe.pts[pk.vi][1] - f.A[1]) < 1e-9 ||
                          Math.hypot(pk.pe.pts[pk.vi][0] - f.B[0], pk.pe.pts[pk.vi][1] - f.B[1]) < 1e-9)) return null;   // a real corner is nearer
  return f;
}
function doFillet(w, r){
  if (!(r > 0) || !isFinite(r)){ doFillet.lastMiss = "badr"; return false; }
  var tol = 10/VIEW.scale;
  doFillet.lastMiss = null;
  // 1) the nearest poly/path/rect corner to the click (shared with the hover check)
  var pick = cornerPick(w);
  if (pick){
    var ne = cornerResult(pick, r, w);
    if (ne){
      delete ne.relief;
      if (pick.e.tp) ne.tp = true;
      if (pick.e.con) ne.con = true;
      if (pick.e._id) ne._id = pick.e._id;
      ['layer', 'sheet', 'vcId', 'vcSheet'].forEach(function (k2) { if (pick.e[k2] !== undefined) ne[k2] = pick.e[k2]; });   // stays on its layer and sheet
      pushUndo(); DOC.ents.splice(pick.i, 1, ne); return true;
    }
    doFillet.lastMiss = dogboneVertex.why === 'curved' ? 'curved' : (dogboneVertex.why === 'flat' ? 'flat' : 'fit');
    return false;   // nearest corner couldn't take it: don't fall through to two-line
  }
  if ((UICFG.filletType || 'round') !== 'round'){ doFillet.lastMiss = 'dogjoin'; return false; }
  // 2) two line entities near the click
  var near = [];
  DOC.ents.forEach(function(e2, i2){
    if (e2.t !== 'line' || !entOnSheet(e2)) return;
    var d = distToSeg(w.x, w.y, e2.x1, e2.y1, e2.x2, e2.y2);
    if (d < tol*1.6) near.push({i:i2, d:d});
  });
  near.sort(function(a,b){ return a.d-b.d; });
  if (near.length < 2) return false;
  var eA = DOC.ents[near[0].i], eB = DOC.ents[near[1].i];
  var X = xLineLine(eA.x1,eA.y1,eA.x2,eA.y2, eB.x1,eB.y1,eB.x2,eB.y2);
  if (!X) return false;
  function sideDir(e3){
    // choose the kept side from where the segment actually LIES relative to X;
    // the click only disambiguates when the segment genuinely crosses X.
    var dx = e3.x2-e3.x1, dy = e3.y2-e3.y1, L = Math.hypot(dx,dy);
    dx/=L; dy/=L;
    var p1 = (e3.x1-X.x)*dx + (e3.y1-X.y)*dy;
    var p2 = (e3.x2-X.x)*dx + (e3.y2-X.y)*dy;
    var sBody = Math.abs(p2) >= Math.abs(p1) ? (p2 >= 0 ? 1 : -1) : (p1 >= 0 ? 1 : -1);
    var srt = sBody;
    if (p1 < -1e-6 && p2 > 1e-6 || p1 > 1e-6 && p2 < -1e-6){ // segment crosses X: click picks the quadrant
      var pw = (w.x-X.x)*dx + (w.y-X.y)*dy;
      if (Math.abs(pw) > 1e-6) srt = pw > 0 ? 1 : -1;
    }
    return {x:dx*srt, y:dy*srt, p1:p1, p2:p2, s:srt};
  }
  var v1 = sideDir(eA), v2 = sideDir(eB);
  var cosT2 = Math.max(-1, Math.min(1, v1.x*v2.x + v1.y*v2.y));
  var th = Math.acos(cosT2);
  if (th < 0.02 || th > Math.PI - 0.02) return false;
  var t2 = r / Math.tan(th/2);
  var T1b = {x:X.x + v1.x*t2, y:X.y + v1.y*t2};
  var T2b = {x:X.x + v2.x*t2, y:X.y + v2.y*t2};
  var bx = v1.x+v2.x, by = v1.y+v2.y, bl = Math.hypot(bx,by);
  if (bl < 1e-9) return false;
  var O = {x:X.x + bx/bl * (r/Math.sin(th/2)), y:X.y + by/bl * (r/Math.sin(th/2))};
  function retrim(e4, sd, T){
    // keep the endpoint farther along the kept side; the other becomes T
    if (sd.p2*sd.s >= sd.p1*sd.s){ e4.x1 = T.x; e4.y1 = T.y; } else { e4.x2 = T.x; e4.y2 = T.y; }
  }
  pushUndo();
  retrim(eA, v1, T1b); retrim(eB, v2, T2b);
  var aT1 = Math.atan2(T1b.y-O.y, T1b.x-O.x), aT2 = Math.atan2(T2b.y-O.y, T2b.x-O.x);
  var ccwF = angNorm(aT2-aT1) <= Math.PI; // minor direction
  DOC.ents.push({t:'arc', cx:O.x, cy:O.y, r:r, a0:aT1, a1:aT2, ccw:ccwF});
  return true;
}

