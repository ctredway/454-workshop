/* ---------------- Weld, Subtract, Intersect ----------------
   Each selected shape is a solid piece: a closed shape's inside, or, for a group or text, the inside of its
   outlines taken even-odd, so letters and traced logos keep their holes. Open shapes take no part.
     Weld       joins pieces that overlap or touch into one outline; pieces that meet nothing stay as they were.
     Subtract   cuts the other pieces out of the biggest one (the first picked, if two are as big).
     Intersect  keeps only the area all the pieces share.
   The result is exact: straight edges stay straight and arcs stay true arcs (a whole circle comes back as a
   circle, a square-on rectangle as a rectangle), so dimensions, drilling and offsets treat it as drawn.

   How: every outline is broken into spans (a line, or an arc of a circle), each span is split wherever
   another crosses or touches it, and a piece of span is kept when the result is solid on one side of it and
   not the other (tested just off its middle, on the original outlines). Kept pieces run with the solid on
   their left, so outlines come out anticlockwise and holes clockwise, and are chained end to end. */
var BOOL_TOL = 1e-7;      // mm: points this close are the same point
var BOOL_SIDE = 2e-5;     // mm: how far off a piece's middle its two sides are tested

// ---- spans ---------------------------------------------------------------
// A span runs from (x0,y0) to (x1,y1); an arc span has c = {cx, cy, r, ccw, a0, sw}: its start angle and
// its sweep (always positive, taken in the ccw direction or the other).
function boolArc(x0, y0, x1, y1, cx, cy, r, ccw, sw){
  return {x0:x0, y0:y0, x1:x1, y1:y1, c:{cx:cx, cy:cy, r:r, ccw:ccw, a0:Math.atan2(y0 - cy, x0 - cx), sw:sw}};
}
function boolLine(x0, y0, x1, y1){ return {x0:x0, y0:y0, x1:x1, y1:y1, c:null}; }
function boolAngAt(c, s){ return c.a0 + (c.ccw ? s : -s); }                 // angle s along the arc
function boolPtAt(sp, s){                                                  // s: 0..1 on a line, 0..sw on an arc
  if (!sp.c) return [sp.x0 + (sp.x1 - sp.x0) * s, sp.y0 + (sp.y1 - sp.y0) * s];
  var a = boolAngAt(sp.c, s);
  return [sp.c.cx + sp.c.r * Math.cos(a), sp.c.cy + sp.c.r * Math.sin(a)];
}
function boolParamOf(sp, p){                                               // the inverse of boolPtAt
  if (!sp.c){
    var dx = sp.x1 - sp.x0, dy = sp.y1 - sp.y0, L2 = dx * dx + dy * dy;
    return L2 ? ((p[0] - sp.x0) * dx + (p[1] - sp.y0) * dy) / L2 : 0;
  }
  var d = Math.atan2(p[1] - sp.c.cy, p[0] - sp.c.cx) - sp.c.a0;
  if (!sp.c.ccw) d = -d;
  d = d % (2 * Math.PI); if (d < 0) d += 2 * Math.PI;
  if (d > sp.c.sw && d - sp.c.sw > (2 * Math.PI - d)) d -= 2 * Math.PI;    // just before the start: slightly negative
  return d;
}
function boolSpanMax(sp){ return sp.c ? sp.c.sw : 1; }
function boolSpanLen(sp){ return sp.c ? sp.c.r * sp.c.sw : Math.hypot(sp.x1 - sp.x0, sp.y1 - sp.y0); }
function boolTangent(sp, s){                                               // direction of travel at s
  if (!sp.c) return [sp.x1 - sp.x0, sp.y1 - sp.y0];
  var a = boolAngAt(sp.c, s);
  return sp.c.ccw ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
}

// A closed shape's outline as spans, or null for a shape that has no inside.
function boolLoopOf(e){
  var out = [];
  if (e.t === 'circle'){
    if (!(e.r > 0)) return null;
    return [boolArc(e.cx + e.r, e.cy, e.cx - e.r, e.cy, e.cx, e.cy, e.r, true, Math.PI),
            boolArc(e.cx - e.r, e.cy, e.cx + e.r, e.cy, e.cx, e.cy, e.r, true, Math.PI)];
  }
  var pts = null;
  if (e.t === 'rect') pts = [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]];
  else if ((e.t === 'poly' || e.t === 'path') && e.closed) pts = e.pts;
  if (!pts || pts.length < 2) return null;
  for (var k = 0, m = pts.length; k < m; k++){
    var p0 = pts[k], p1 = pts[(k + 1) % m], b = e.t === 'path' ? (p0[2] || 0) : 0;
    var ch = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (ch < BOOL_TOL) continue;
    if (Math.abs(b) < 1e-12){ out.push(boolLine(p0[0], p0[1], p1[0], p1[1])); continue; }
    var th = 4 * Math.atan(b);                                             // as tessPath: signed included angle
    var rS = ch / (2 * Math.sin(th / 2)), apo = rS * Math.cos(th / 2);
    var ux = (p1[0] - p0[0]) / ch, uy = (p1[1] - p0[1]) / ch;
    var cx = (p0[0] + p1[0]) / 2 - uy * apo, cy = (p0[1] + p1[1]) / 2 + ux * apo;
    out.push(boolArc(p0[0], p0[1], p1[0], p1[1], cx, cy, Math.abs(rS), th > 0, Math.abs(th)));
  }
  return out.length >= 2 || (out.length === 1 && out[0].c) ? out : null;
}
// A selected shape as a piece: its outlines, or null if it has none (an open line, say).
function boolPieceOf(e){
  var loops = [];
  (function collect(x){
    if (!x) return;
    if (x.t === 'group'){ x.ents.forEach(collect); return; }
    if (x.t === 'text'){ collect(typeof textToCurves === 'function' ? textToCurves(x) : null); return; }
    var l = boolLoopOf(x);
    if (l) loops.push(l);
  })(e);
  if (!loops.length) return null;
  // for the inside test: each outline as pieces that only rise or only fall, with its box
  var mono = loops.map(function (l){
    var parts = [], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    l.forEach(function (sp){
      var cuts = [0];
      if (sp.c){                                          // split an arc at its top and bottom
        [Math.PI / 2, -Math.PI / 2].forEach(function (ang){
          var s = boolParamOf(sp, [sp.c.cx + Math.cos(ang), sp.c.cy + Math.sin(ang)]);
          // (boolParamOf only reads the angle, so a unit step in that direction serves as the point)
          if (s > 1e-12 && s < sp.c.sw - 1e-12) cuts.push(s);
        });
        cuts.sort(function (a, b){ return a - b; });
      }
      cuts.push(boolSpanMax(sp));
      for (var i = 0; i + 1 < cuts.length; i++){
        var a = boolPtAt(sp, cuts[i]), b = boolPtAt(sp, cuts[i + 1]);
        if (i === 0){ a = [sp.x0, sp.y0]; }
        if (i + 2 === cuts.length){ b = [sp.x1, sp.y1]; }
        var mid = boolPtAt(sp, (cuts[i] + cuts[i + 1]) / 2);
        parts.push({ax:a[0], ay:a[1], bx:b[0], by:b[1], c:sp.c, side: sp.c ? (mid[0] >= sp.c.cx ? 1 : -1) : 0});
      }
      var bb = boolSpanBox(sp);
      x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
    });
    // in bands across y, so the inside test only looks at the parts at the right height
    var nb = Math.max(1, Math.ceil(Math.sqrt(parts.length))), bh = (y1 - y0) / nb || 1, bands = [];
    for (var k = 0; k < nb; k++) bands.push([]);
    parts.forEach(function (p){
      var k0 = Math.max(0, Math.floor((Math.min(p.ay, p.by) - y0) / bh)), k1 = Math.min(nb - 1, Math.floor((Math.max(p.ay, p.by) - y0) / bh));
      for (var k2 = k0; k2 <= k1; k2++) bands[k2].push(p);
    });
    return {parts:parts, box:[x0, y0, x1, y1], bands:bands, bh:bh};
  });
  return {loops:loops, mono:mono};
}
// Is (x, y) inside the piece? Crossings of a ray to the right, even-odd, with each crossing counted once
// even where the ray passes exactly through a corner (a half-open rule on pieces that only rise or fall).
function boolInside(piece, x, y){
  var inside = false;
  piece.mono.forEach(function (m){
    var b = m.box;
    if (y < b[1] || y > b[3] || x > b[2]) return;
    m.bands[Math.max(0, Math.min(m.bands.length - 1, Math.floor((y - b[1]) / m.bh)))].forEach(function (p){
      if ((p.ay > y) === (p.by > y)) return;
      var xc;
      if (!p.c) xc = p.ax + (y - p.ay) * (p.bx - p.ax) / (p.by - p.ay);
      else { var dy = y - p.c.cy; xc = p.c.cx + p.side * Math.sqrt(Math.max(0, p.c.r * p.c.r - dy * dy)); }
      if (xc > x) inside = !inside;
    });
  });
  return inside;
}
function boolSpanBox(sp){
  if (!sp.c) return [Math.min(sp.x0, sp.x1), Math.min(sp.y0, sp.y1), Math.max(sp.x0, sp.x1), Math.max(sp.y0, sp.y1)];
  var b = [Math.min(sp.x0, sp.x1), Math.min(sp.y0, sp.y1), Math.max(sp.x0, sp.x1), Math.max(sp.y0, sp.y1)];
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(function (ang){
    var s = boolParamOf(sp, [sp.c.cx + Math.cos(ang), sp.c.cy + Math.sin(ang)]);
    if (s >= 0 && s <= sp.c.sw){
      var q = boolPtAt(sp, s);
      b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]);
    }
  });
  return b;
}
// Signed area of an outline (positive anticlockwise), arcs exactly.
function boolLoopArea(l){
  var a = 0;
  l.forEach(function (sp){
    a += (sp.x0 * sp.y1 - sp.x1 * sp.y0) / 2;
    if (sp.c){ var th = sp.c.ccw ? sp.c.sw : -sp.c.sw; a += sp.c.r * sp.c.r / 2 * (th - Math.sin(th)); }
  });
  return a;
}
function boolPieceArea(piece){                          // the biggest outline's area: what "biggest" means
  var best = 0;
  piece.loops.forEach(function (l){ best = Math.max(best, Math.abs(boolLoopArea(l))); });
  return best;
}

// ---- where spans meet ----------------------------------------------------
// Points where two spans cross or touch, including the ends of one lying along the other.
function boolMeet(A, B){
  var out = [], i;
  function onSpan(sp, p){ var s = boolParamOf(sp, p), m = boolSpanMax(sp), e = BOOL_TOL / Math.max(boolSpanLen(sp), 1e-9) * m;
    if (s < -e || s > m + e) return false;
    var q = boolPtAt(sp, Math.max(0, Math.min(m, s)));
    return Math.hypot(q[0] - p[0], q[1] - p[1]) < BOOL_TOL * 10; }
  if (!A.c && !B.c){
    var ax = A.x1 - A.x0, ay = A.y1 - A.y0, bx = B.x1 - B.x0, by = B.y1 - B.y0;
    var d = ax * by - ay * bx, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (Math.abs(d) > 1e-12 * la * lb){
      var t = ((B.x0 - A.x0) * by - (B.y0 - A.y0) * bx) / d, u = ((B.x0 - A.x0) * ay - (B.y0 - A.y0) * ax) / d;
      if (t >= -BOOL_TOL / la && t <= 1 + BOOL_TOL / la && u >= -BOOL_TOL / lb && u <= 1 + BOOL_TOL / lb)
        out.push([A.x0 + ax * t, A.y0 + ay * t]);
      return out;
    }
  } else if (A.c && B.c){
    var dx = B.c.cx - A.c.cx, dy = B.c.cy - A.c.cy, dd = Math.hypot(dx, dy);
    if (dd > BOOL_TOL || Math.abs(A.c.r - B.c.r) > BOOL_TOL){
      if (dd < 1e-12 || dd > A.c.r + B.c.r + BOOL_TOL || dd < Math.abs(A.c.r - B.c.r) - BOOL_TOL) return out;
      var a = (A.c.r * A.c.r - B.c.r * B.c.r + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, A.c.r * A.c.r - a * a));
      var mx = A.c.cx + dx * a / dd, my = A.c.cy + dy * a / dd;
      var cand = h < BOOL_TOL ? [[mx, my]] : [[mx - dy * h / dd, my + dx * h / dd], [mx + dy * h / dd, my - dx * h / dd]];
      cand.forEach(function (p){ if (onSpan(A, p) && onSpan(B, p)) out.push(p); });
      return out;
    }
  } else {
    var L = A.c ? B : A, C = A.c ? A : B;
    var lx = L.x1 - L.x0, ly = L.y1 - L.y0, fx = L.x0 - C.c.cx, fy = L.y0 - C.c.cy;
    var qa = lx * lx + ly * ly, qb = 2 * (fx * lx + fy * ly), qc = fx * fx + fy * fy - C.c.r * C.c.r;
    var disc = qb * qb - 4 * qa * qc, ll = Math.sqrt(qa);
    // a line that just grazes the circle: take the touching point when it is within tolerance of it
    var dist = Math.abs(fx * ly - fy * lx) / ll;
    var ts = [];
    if (disc >= 0) ts = [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)];
    else if (dist - C.c.r < BOOL_TOL) ts = [-qb / (2 * qa)];
    if (ts.length === 2 && Math.abs(ts[1] - ts[0]) * ll < BOOL_TOL) ts = [(ts[0] + ts[1]) / 2];
    ts.forEach(function (t){
      var p = [L.x0 + lx * t, L.y0 + ly * t];
      if (onSpan(L, p) && onSpan(C, p)) out.push(p);
    });
    return out;
  }
  // along the same line or round the same circle: each one's ends that lie on the other
  [[A.x0, A.y0], [A.x1, A.y1], [B.x0, B.y0], [B.x1, B.y1]].forEach(function (p){ if (onSpan(A, p) && onSpan(B, p)) out.push(p); });
  for (i = out.length - 1; i > 0; i--)
    for (var j = 0; j < i; j++) if (Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1]) < BOOL_TOL){ out.splice(i, 1); break; }
  return out;
}

// ---- the operation ---------------------------------------------------------
// pieces: from boolPieceOf. keep(flags) says whether a point is in the result, from whether it is inside each
// piece. Returns the result's outlines, as lists of spans.
function boolCombine(pieces, keep){
  var spans = [];
  pieces.forEach(function (pc, pi){ pc.loops.forEach(function (l){ l.forEach(function (sp){
    spans.push({sp:sp, piece:pi, box:boolSpanBox(sp), cuts:[]});
  }); }); });
  // where spans meet, found by sweeping across in x
  var order = spans.map(function (_, i){ return i; }).sort(function (a, b){ return spans[a].box[0] - spans[b].box[0]; });
  for (var oi = 0; oi < order.length; oi++){
    var A = spans[order[oi]];
    for (var oj = oi + 1; oj < order.length; oj++){
      var B = spans[order[oj]];
      if (B.box[0] > A.box[2] + BOOL_TOL) break;
      if (B.box[1] > A.box[3] + BOOL_TOL || B.box[3] < A.box[1] - BOOL_TOL) continue;
      boolMeet(A.sp, B.sp).forEach(function (p){ A.cuts.push(p); B.cuts.push(p); });
    }
  }
  // one point for each place, however many spans meet there
  var grid = {}, verts = [];
  function vid(p){
    var gx = Math.round(p[0] / (BOOL_TOL * 10)), gy = Math.round(p[1] / (BOOL_TOL * 10));
    for (var ix = gx - 1; ix <= gx + 1; ix++) for (var iy = gy - 1; iy <= gy + 1; iy++){
      var list = grid[ix + ',' + iy];
      if (list) for (var k = 0; k < list.length; k++){
        var v = verts[list[k]];
        if (Math.hypot(v[0] - p[0], v[1] - p[1]) < BOOL_TOL * 10) return list[k];
      }
    }
    verts.push([p[0], p[1]]);
    (grid[gx + ',' + gy] || (grid[gx + ',' + gy] = [])).push(verts.length - 1);
    return verts.length - 1;
  }
  // the spans, split where they meet, keeping the pieces with the result on one side only
  var flagsAt = function (x, y){ return pieces.map(function (pc){ return boolInside(pc, x, y); }); };
  var edges = [], seen = {};
  spans.forEach(function (S){
    var sp = S.sp, m = boolSpanMax(sp);
    var ss = S.cuts.map(function (p){ return {s: boolParamOf(sp, p), p:p}; })
      .filter(function (c){ return c.s > 1e-12 && c.s < m - 1e-12; })
      .sort(function (a, b){ return a.s - b.s; });
    var stops = [{s:0, p:[sp.x0, sp.y0]}].concat(ss, [{s:m, p:[sp.x1, sp.y1]}]);
    for (var i = 0; i + 1 < stops.length; i++){
      var va = vid(stops[i].p), vb = vid(stops[i + 1].p);
      if (va === vb) continue;
      var s0 = stops[i].s, s1 = stops[i + 1].s, sm = (s0 + s1) / 2;
      var mid = boolPtAt(sp, sm), tg = boolTangent(sp, sm), tl = Math.hypot(tg[0], tg[1]);
      var nx = -tg[1] / tl * BOOL_SIDE, ny = tg[0] / tl * BOOL_SIDE;
      var left = keep(flagsAt(mid[0] + nx, mid[1] + ny)), right = keep(flagsAt(mid[0] - nx, mid[1] - ny));
      if (left === right) continue;
      var c = null;
      if (sp.c){
        var a0 = boolAngAt(sp.c, left ? s0 : s1);
        c = {cx:sp.c.cx, cy:sp.c.cy, r:sp.c.r, ccw: left ? sp.c.ccw : !sp.c.ccw, a0:a0, sw:s1 - s0};
      }
      var e = {a: left ? va : vb, b: left ? vb : va, c:c};
      // the same stretch from two pieces (edges that lie on each other) counts once
      var key = e.a + '>' + e.b + (c ? ':' + c.cx.toFixed(5) + ',' + c.cy.toFixed(5) : '');
      if (seen[key]) continue;
      seen[key] = true;
      edges.push(e);
    }
  });
  function dirOut(e){                                     // direction leaving e's start
    if (!e.c) return [verts[e.b][0] - verts[e.a][0], verts[e.b][1] - verts[e.a][1]];
    return e.c.ccw ? [-Math.sin(e.c.a0), Math.cos(e.c.a0)] : [Math.sin(e.c.a0), -Math.cos(e.c.a0)];
  }
  function dirIn(e){                                      // direction arriving at e's end
    if (!e.c) return dirOut(e);
    var a1 = e.c.a0 + (e.c.ccw ? e.c.sw : -e.c.sw);
    return e.c.ccw ? [-Math.sin(a1), Math.cos(a1)] : [Math.sin(a1), -Math.cos(a1)];
  }
  var from = {};
  edges.forEach(function (e, i){ (from[e.a] || (from[e.a] = [])).push(i); });
  var used = edges.map(function (){ return false; }), loops = [];
  for (var st = 0; st < edges.length; st++){
    if (used[st]) continue;
    var chain = [], cur = st, guard = 0;
    while (cur !== null && !used[cur] && guard++ <= edges.length){
      used[cur] = true; chain.push(edges[cur]);
      var here = edges[cur].b;
      if (here === edges[st].a) break;
      // where several outlines meet at a point, turn the tightest way, so each outline stays on its own
      var din = dirIn(edges[cur]), back = Math.atan2(-din[1], -din[0]), best = null, bestTurn = Infinity;
      (from[here] || []).forEach(function (k){
        if (used[k]) return;
        var d = dirOut(edges[k]), turn = back - Math.atan2(d[1], d[0]);
        turn = turn % (2 * Math.PI); if (turn <= 1e-12) turn += 2 * Math.PI;
        if (turn < bestTurn){ bestTurn = turn; best = k; }
      });
      cur = best;
    }
    if (chain.length && chain[chain.length - 1].b === chain[0].a) loops.push(chain);
  }
  // back to spans, joining pieces of the same line or the same circle
  return loops.map(function (chain){
    var out = chain.map(function (e){
      var p = verts[e.a], q = verts[e.b];
      return e.c ? {x0:p[0], y0:p[1], x1:q[0], y1:q[1], c:e.c} : boolLine(p[0], p[1], q[0], q[1]);
    });
    function joins(a, b){
      if (!a.c && !b.c){
        var ux = a.x1 - a.x0, uy = a.y1 - a.y0, vx = b.x1 - b.x0, vy = b.y1 - b.y0;
        return Math.abs(ux * vy - uy * vx) < 1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0;
      }
      return !!(a.c && b.c) && a.c.ccw === b.c.ccw && Math.abs(a.c.r - b.c.r) < BOOL_TOL &&
        Math.hypot(a.c.cx - b.c.cx, a.c.cy - b.c.cy) < BOOL_TOL && a.c.sw + b.c.sw < 1.9 * Math.PI;
    }
    function join(a, b){
      return a.c ? {x0:a.x0, y0:a.y0, x1:b.x1, y1:b.y1, c:{cx:a.c.cx, cy:a.c.cy, r:a.c.r, ccw:a.c.ccw, a0:a.c.a0, sw:a.c.sw + b.c.sw}}
                 : boolLine(a.x0, a.y0, b.x1, b.y1);
    }
    for (var i = 0; i < out.length && out.length > 1; ){
      var j = (i + 1) % out.length;
      if (j !== i && joins(out[i], out[j])){
        out[i] = join(out[i], out[j]); out.splice(j, 1);
        if (j < i) i--;
      } else i++;
    }
    return out;
  }).filter(function (l){ return Math.abs(boolLoopArea(l)) > 1e-6; });
}

// An outline back as a shape: a circle, a square-on rectangle, a polyline, or a path with arcs.
function boolShapeOf(l){
  if (l.every(function (sp){ return sp.c && Math.hypot(sp.c.cx - l[0].c.cx, sp.c.cy - l[0].c.cy) < 1e-6 && Math.abs(sp.c.r - l[0].c.r) < 1e-6; })){
    var tot = 0; l.forEach(function (sp){ tot += sp.c.sw; });
    if (Math.abs(tot - 2 * Math.PI) < 1e-6) return {t:'circle', cx:l[0].c.cx, cy:l[0].c.cy, r:l[0].c.r};
  }
  if (l.length === 4 && l.every(function (sp){ return !sp.c && (Math.abs(sp.x0 - sp.x1) < 1e-9 || Math.abs(sp.y0 - sp.y1) < 1e-9); })){
    var xs = l.map(function (sp){ return sp.x0; }), ys = l.map(function (sp){ return sp.y0; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 - x0 > 1e-9 && y1 - y0 > 1e-9) return {t:'rect', x:x0, y:y0, w:x1 - x0, h:y1 - y0};
  }
  if (l.every(function (sp){ return !sp.c; })) return {t:'poly', pts:l.map(function (sp){ return [sp.x0, sp.y0]; }), closed:true};
  return {t:'path', closed:true, pts:l.map(function (sp){
    return [sp.x0, sp.y0, sp.c ? Math.tan(sp.c.sw / 4) * (sp.c.ccw ? 1 : -1) : 0];
  })};
}

// Do it to the selection. kind: 'weld', 'subtract' or 'intersect'. Returns what to tell the user:
// {ok, title, detail}.
function boolApply(kind){
  var picked = SEL.filter(function (i){ return DOC.ents[i]; });
  var used = [], skipped = 0;
  picked.forEach(function (i){
    var pc = boolPieceOf(DOC.ents[i]);
    if (pc) used.push({i:i, pc:pc}); else skipped++;
  });
  var name = {weld:'Weld', subtract:'Subtract', intersect:'Intersect'}[kind];
  var openNote = skipped ? ' ' + skipped + (skipped === 1 ? ' selected shape is' : ' selected shapes are') +
    ' open (a line, an arc or an open outline), with no inside, so ' + name + ' left ' + (skipped === 1 ? 'it' : 'them') + ' alone.' : '';
  if (used.length < 2) return {ok:false, title:'Select two or more closed shapes',
    detail:name + ' works on closed shapes: rectangles, circles, closed outlines, groups and text.' + openNote};

  // which pieces overlap or touch: they cross, or one lies inside the other
  function meets(a, b){
    // spans of both, swept across in x (as boolCombine does), stopping at the first place they meet
    var list = [];
    [a, b].forEach(function (u, w){ u.pc.loops.forEach(function (l){ l.forEach(function (sp){ list.push({sp:sp, w:w, box:boolSpanBox(sp)}); }); }); });
    list.sort(function (p, q){ return p.box[0] - q.box[0]; });
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++){
      var P = list[i], Q = list[j];
      if (Q.box[0] > P.box[2] + BOOL_TOL) break;
      if (P.w === Q.w || Q.box[1] > P.box[3] + BOOL_TOL || Q.box[3] < P.box[1] - BOOL_TOL) continue;
      if (boolMeet(P.sp, Q.sp).length) return true;
    }
    var pa = a.pc.loops[0][0], pb = b.pc.loops[0][0];
    return boolInside(b.pc, pa.x0, pa.y0) || boolInside(a.pc, pb.x0, pb.y0);
  }
  var groups = [], base = null;
  if (kind === 'weld'){
    var gi = used.map(function (_, i){ return i; });
    var root = function (i){ while (gi[i] !== i) i = gi[i] = gi[gi[i]]; return i; };
    for (var a = 0; a < used.length; a++) for (var b = a + 1; b < used.length; b++)
      if (root(a) !== root(b) && meets(used[a], used[b])) gi[root(b)] = root(a);
    var byRoot = {};
    used.forEach(function (u, i){ (byRoot[root(i)] || (byRoot[root(i)] = [])).push(u); });
    for (var r in byRoot) if (byRoot[r].length > 1) groups.push(byRoot[r]);
    if (!groups.length) return {ok:false, title:'Nothing to weld', detail:'None of the selected shapes overlap or touch, so there is nothing to join.' + openNote};
  } else if (kind === 'subtract'){
    base = used[0];
    used.forEach(function (u){ if (boolPieceArea(u.pc) > boolPieceArea(base.pc) + 1e-9) base = u; });
    var cutters = used.filter(function (u){ return u !== base && meets(base, u); });
    if (!cutters.length) return {ok:false, title:'Nothing to subtract', detail:'None of the other selected shapes overlap the biggest one, so nothing was cut from it.' + openNote};
    groups.push([base].concat(cutters));
  } else groups.push(used);

  var made = [], gone = {}, into = {};
  for (var g = 0; g < groups.length; g++){
    var grp = groups[g], pcs = grp.map(function (u){ return u.pc; });
    var keep = kind === 'weld' ? function (f){ return f.some(Boolean); }
             : kind === 'intersect' ? function (f){ return f.every(Boolean); }
             : function (f){ return f[0] && !f.slice(1).some(Boolean); };
    var loops = boolCombine(pcs, keep);
    if (!loops.length && kind === 'intersect')
      return {ok:false, title:'Nothing in common', detail:'The selected shapes don\'t all overlap, so they share no area. Nothing was changed.' + openNote};
    var first = DOC.ents[grp[0].i], out = loops.map(boolShapeOf);
    out.forEach(function (e){ if (first.layer) e.layer = first.layer; entId(e); });
    grp.forEach(function (u){ gone[u.i] = true; });
    // toolpaths that cut the shapes now cut the result (for Subtract, those that cut the shape kept)
    (kind === 'subtract' ? [grp[0]] : grp).forEach(function (u){
      into[entId(DOC.ents[u.i])] = out.map(function (e){ return e._id; });
    });
    made = made.concat(out);
  }

  pushUndo();
  var goneIds = Object.keys(gone).map(function (i){ return entId(DOC.ents[+i]); });
  DOC.ents = DOC.ents.filter(function (_, i){ return !gone[i]; });
  var start = DOC.ents.length;
  DOC.ents = DOC.ents.concat(made);
  if (DOC.dims) DOC.dims = DOC.dims.filter(function (d){
    return goneIds.indexOf(d.a) < 0 && (d.b === undefined || goneIds.indexOf(d.b) < 0);
  });
  var retargeted = 0;
  (DOC.toolpaths || []).forEach(function (tp){
    if (!tp.ents) return;
    var changed = false, ids = [];
    tp.ents.forEach(function (id){
      if (goneIds.indexOf(id) < 0){ ids.push(id); return; }
      changed = true;
      (into[id] || []).forEach(function (n){ if (ids.indexOf(n) < 0) ids.push(n); });
    });
    if (changed){ tp.ents = ids; if (tp.tabPts) tp.tabPts = null; retargeted++; }
  });
  SEL = made.map(function (_, k){ return start + k; });
  var n = made.length, nIn = Object.keys(gone).length;
  var said = {weld:'Welded ' + nIn + ' shapes into ' + (n === 1 ? 'one outline' : n + ' outlines'),
              subtract:'Cut ' + (nIn - 1) + (nIn === 2 ? ' shape' : ' shapes') + ' out of the biggest one',
              intersect:'Kept the area ' + nIn + ' shapes share'}[kind];
  return {ok:true, retargeted:retargeted, title:said,
    detail:(n === 1 ? 'The result is selected.' : 'The ' + n + ' outlines that make the result are selected' + (n > 1 ? ' (holes are outlines of their own).' : '.')) +
      (retargeted ? ' ' + retargeted + (retargeted === 1 ? ' toolpath now uses' : ' toolpaths now use') + ' the new outline; check ' + (retargeted === 1 ? 'it' : 'them') + ' before cutting.' : '') +
      ' Ctrl+Z undoes it.' + openNote};
}
function boolBtnClick(kind){
  var name = {weld:'Weld', subtract:'Subtract', intersect:'Intersect'}[kind];
  if (!SEL.length){
    toast('info', 'Nothing selected', 'Select two or more closed shapes, then press ' + name + '.');
    stagePrompt('selFirst'); return;
  }
  var r = boolApply(kind);
  if (!r.ok){ toast('warn', r.title, r.detail); return; }
  if (r.retargeted){ tpRebuildAll(); renderToolpathPanel(); }
  persist(); draw();
  toast('ok', r.title, r.detail);
}
