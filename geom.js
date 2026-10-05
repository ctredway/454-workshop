/* ============================================================
   454 geom — the geometry 454 Design and 454 CAM both need.
   MIT: this is the free, shared layer. The CAM engine builds on it.

   Everything here works in millimetres and on plain arrays:
     point   [x, y]
     path    [[x,y], ...]          an open or closed polyline
     loop    a path whose ends meet (the closing point is NOT repeated)

   Nothing in here touches the DOM, the document or any app state, so it can be
   tested on its own and used from either side.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  // ---- basics ----------------------------------------------------------
  function dist(ax, ay, bx, by){ return Math.hypot(bx - ax, by - ay); }

  // Twice the signed area. Positive means counter-clockwise.
  function area2(loop){
    var s = 0;
    for (var i = 0, n = loop.length; i < n; i++){
      var a = loop[i], b = loop[(i + 1) % n];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s;
  }
  function area(loop){ return area2(loop) / 2; }
  function isCCW(loop){ return area2(loop) > 0; }
  function ensureCCW(loop){ return isCCW(loop) ? loop : loop.slice().reverse(); }
  function ensureCW(loop){ return isCCW(loop) ? loop.slice().reverse() : loop; }

  // Drop points that repeat and points that sit on the straight line between
  // their neighbours: fewer points, same shape, and no zero-length segments to
  // divide by later.
  function clean(path, tol){
    tol = tol || 1e-7;
    var out = [];
    for (var i = 0; i < path.length; i++){
      var p = path[i];
      if (!out.length || dist(p[0], p[1], out[out.length-1][0], out[out.length-1][1]) > tol) out.push([p[0], p[1]]);
    }
    if (out.length > 1 && dist(out[0][0], out[0][1], out[out.length-1][0], out[out.length-1][1]) <= tol) out.pop();
    return out;
  }

  function pointInLoop(x, y, loop){
    var inside = false;
    for (var i = 0, j = loop.length - 1; i < loop.length; j = i++){
      var xi = loop[i][0], yi = loop[i][1], xj = loop[j][0], yj = loop[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // Closest point on a segment, and how far away it is.
  function closestOnSeg(px, py, ax, ay, bx, by){
    var dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
    var t = L2 < EPS ? 0 : ((px - ax) * dx + (py - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + t*dx, ay + t*dy];
  }
  function distToSeg(px, py, ax, ay, bx, by){
    var q = closestOnSeg(px, py, ax, ay, bx, by);
    return dist(px, py, q[0], q[1]);
  }
  function distToPath(px, py, path, closed){
    var best = Infinity, n = path.length;
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++){
      var a = path[i], b = path[(i + 1) % n];
      var d = distToSeg(px, py, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return best;
  }

  // A grid over a path's segments, so "how far is this point from the shape?" only has to look
  // at what is nearby. Without it, offsetting a 2000-point outline measures every point against
  // every segment, and pocketing runs hundreds of offsets.
  function pathIndex(path, closed){
    var n = path.length, last = closed ? n : n - 1;
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var i = 0; i < n; i++){
      var p = path[i];
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    var span = Math.max(maxx - minx, maxy - miny) || 1;
    var cell = Math.max(span / 96, 1e-6);
    var gw = Math.max(1, Math.ceil((maxx - minx) / cell) + 1);
    var gh = Math.max(1, Math.ceil((maxy - miny) / cell) + 1);
    var grid = new Array(gw * gh);                     // flat, numeric: no string keys per lookup

    function cellRange(ax, ay, bx, by){
      return {
        x0: Math.max(0, Math.floor((Math.min(ax, bx) - minx) / cell)),
        x1: Math.min(gw - 1, Math.floor((Math.max(ax, bx) - minx) / cell)),
        y0: Math.max(0, Math.floor((Math.min(ay, by) - miny) / cell)),
        y1: Math.min(gh - 1, Math.floor((Math.max(ay, by) - miny) / cell))
      };
    }
    for (var j = 0; j < last; j++){
      var a = path[j], b = path[(j + 1) % n], rg = cellRange(a[0], a[1], b[0], b[1]);
      for (var cx = rg.x0; cx <= rg.x1; cx++) for (var cy = rg.y0; cy <= rg.y1; cy++){
        var k = cy * gw + cx;
        (grid[k] || (grid[k] = [])).push(j);
      }
    }
    return {
      path: path, n: n, closed: closed, cell: cell,
      dist: function (px, py, cap){
        var best = Infinity, self = this;
        // Nothing can be nearer than the box round this whole path: skip straight there, or give
        // up at once if even the box is beyond the distance the caller cares about.
        var bdx = Math.max(minx - px, 0, px - maxx), bdy = Math.max(miny - py, 0, py - maxy);
        if (cap !== undefined && Math.hypot(bdx, bdy) > cap) return cap + cell;
        // A short outline, or a point outside the outline's box: measure to every segment. The grid below is
        // for a point among many segments. From outside, it walks ring after ring of cells to reach across the
        // outline, which for a ten-point star was thousands of measurements where ten will do, and a V-carve
        // or a pocket with islands asks this millions of times. The answer is the same one. Where the grid's
        // answer would depend on the order it looks in (two different points equally near), or on the cap
        // (nothing within it), the grid is still used, so nothing changes.
        if (last <= 24 || ((bdx > 0 || bdy > 0) && last <= 600)){
          var bq = null, tie = false;
          for (var s1 = 0; s1 < last; s1++){
            var a1 = path[s1], b1 = path[(s1 + 1) % n];
            var q1 = closestOnSeg(px, py, a1[0], a1[1], b1[0], b1[1]), d1 = dist(px, py, q1[0], q1[1]);
            if (d1 < best){ best = d1; bq = q1; tie = false; }
            else if (d1 === best && (q1[0] !== bq[0] || q1[1] !== bq[1])) tie = true;
          }
          if (bq && !tie && !(cap !== undefined && best > cap)){ self.lastNear = bq; return best; }
          // Every segment has just been measured, and none is within the cap: say so now. (This used to go on
          // to the grid, which walked out ring after ring to find how far beyond the cap the nearest was, an
          // answer no caller that gives a cap uses: they ask only whether anything is nearer than it. It was
          // most of the time a V-carve or a pocket with islands took.)
          if (cap !== undefined && best > cap){ self.lastNear = null; return cap + cell; }
          best = Infinity;
        }
        var bx = Math.floor((px - minx) / cell), by = Math.floor((py - miny) / cell);
        var ring = Math.max(0, -bx, bx - (gw - 1), -by, by - (gh - 1));   // first ring that reaches the grid
        function visit(cx2, cy2){
          if (cx2 < 0 || cy2 < 0 || cx2 >= gw || cy2 >= gh) return;
          var list = grid[cy2 * gw + cx2];
          if (!list) return;
          for (var z = 0; z < list.length; z++){
            var sg = list[z], a2 = path[sg], b2 = path[(sg + 1) % n];
            var qq = closestOnSeg(px, py, a2[0], a2[1], b2[0], b2[1]);
            var dd = dist(px, py, qq[0], qq[1]);
            if (dd < best){ best = dd; self.lastNear = qq; }
          }
        }
        for (;; ring++){
          if (ring === 0) visit(bx, by);
          else {                                          // just the edge of the new ring
            var xa = Math.max(0, bx - ring), xb = Math.min(gw - 1, bx + ring);
            if (by - ring >= 0) for (var cx3 = xa; cx3 <= xb; cx3++) visit(cx3, by - ring);
            if (by + ring < gh) for (var cx4 = xa; cx4 <= xb; cx4++) visit(cx4, by + ring);
            var ya = Math.max(0, by - ring + 1), yb = Math.min(gh - 1, by + ring - 1);
            if (bx - ring >= 0) for (var cy3 = ya; cy3 <= yb; cy3++) visit(bx - ring, cy3);
            if (bx + ring < gw) for (var cy4 = ya; cy4 <= yb; cy4++) visit(bx + ring, cy4);
          }
          if (best <= ring * cell) return best;           // nothing further out can be nearer
          // every cell within the cap has been looked in, and nothing in them is within it (found further off, or
          // not found): the same answer as for nothing found at all
          if (cap !== undefined && ring * cell > cap && best > cap){ self.lastNear = null; return cap + cell; }
          if (bx - ring <= 0 && bx + ring >= gw - 1 && by - ring <= 0 && by + ring >= gh - 1) return best;  // seen it all
        }
      }
    };
  }

  // Where two segments cross, or null. Touching ends count.
  function segX(ax, ay, bx, by, cx, cy, dx2, dy2){
    var r1 = bx - ax, r2 = by - ay, s1 = dx2 - cx, s2 = dy2 - cy;
    var den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < 1e-12) return null;              // parallel
    var t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
    var u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return {x: ax + t * r1, y: ay + t * r2, t: t, u: u};
  }

  // ---- shapes to polylines --------------------------------------------
  // `tol` is the most a straight segment may stray from the true curve.
  function arcPoints(cx, cy, r, a0, a1, ccw, tol){
    tol = tol || 0.01;
    var sweep = ccw ? (a1 - a0) : (a0 - a1);
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
    var step = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI / 8;
    var n = Math.max(2, Math.ceil(sweep / step));
    var out = [];
    for (var i = 0; i <= n; i++){
      var a = a0 + (ccw ? 1 : -1) * sweep * i / n;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  }
  function circlePoints(cx, cy, r, tol){
    var pts = arcPoints(cx, cy, r, 0, 2 * Math.PI, true, tol);
    pts.pop();                                            // a loop doesn't repeat its first point
    return pts;
  }

  // Drop points a straight line can stand in for, within `tol`. A tessellated curve carries far
  // more points than a toolpath needs, and every one of them becomes a line of G-code.
  function simplify(path, tol, closed){
    if (path.length < 3) return path.slice();
    tol = tol || 0.01;
    function pass(pts){
      var keep = new Array(pts.length); keep[0] = keep[pts.length - 1] = true;
      var stack = [[0, pts.length - 1]];
      while (stack.length){
        var seg = stack.pop(), i0 = seg[0], i1 = seg[1];
        var worst = -1, wi = -1;
        for (var i = i0 + 1; i < i1; i++){
          var d = distToSeg(pts[i][0], pts[i][1], pts[i0][0], pts[i0][1], pts[i1][0], pts[i1][1]);
          if (d > worst){ worst = d; wi = i; }
        }
        if (worst > tol){ keep[wi] = true; stack.push([i0, wi]); stack.push([wi, i1]); }
      }
      return pts.filter(function (p, i) { return keep[i]; });
    }
    if (!closed) return pass(path);
    var open = path.concat([path[0]]);                 // keep the seam in place
    var out = pass(open);
    out.pop();
    return out;
  }

  // ---- offsetting ------------------------------------------------------
  // Offset a closed loop by d: positive is outward for a counter-clockwise loop.
  //
  // The raw offset of a shape with any concavity tends to fold over itself. The
  // fix used here is the standard one: build the raw offset, then throw away
  // every point that ended up closer to the original than |d|, because those can
  // only come from folds. What survives is broken into runs and closed back into
  // loops.
  function offsetLoop(loop, d, opts){
    opts = opts || {};
    var tol = opts.tol || 0.01;
    var src = clean(ensureCCW(loop));
    if (src.length < 3 || Math.abs(d) < EPS) return src.length >= 3 ? [src.slice()] : [];

    var raw = [];
    var n = src.length;
    for (var i = 0; i < n; i++){
      var p0 = src[(i - 1 + n) % n], p1 = src[i], p2 = src[(i + 1) % n];
      var v1x = p1[0] - p0[0], v1y = p1[1] - p0[1], L1 = Math.hypot(v1x, v1y);
      var v2x = p2[0] - p1[0], v2y = p2[1] - p1[1], L2 = Math.hypot(v2x, v2y);
      if (L1 < EPS || L2 < EPS) continue;
      var n1x = v1y / L1, n1y = -v1x / L1;                // outward normal, CCW loop
      var n2x = v2y / L2, n2y = -v2x / L2;
      var cross = v1x * v2y - v1y * v2x;
      // A left turn (cross > 0) on a counter-clockwise loop is a convex corner. Offsetting
      // outward opens a gap there, which a round cutter fills with an arc; offsetting inward
      // the two edges overrun each other and want a sharp (mitred) corner instead.
      var turnsOut = (d > 0) ? (cross > 0) : (cross < 0);
      if (turnsOut && Math.abs(cross) > EPS){
        // round the corner, which is what a round cutter actually leaves
        var a0 = Math.atan2(n1y, n1x), a1 = Math.atan2(n2y, n2x);
        var sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        var r = Math.abs(d);
        var step = r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / r)) : Math.PI / 8;
        var steps = Math.max(1, Math.ceil(Math.abs(sweep) / step));
        for (var k = 0; k <= steps; k++){
          var a = a0 + sweep * k / steps;
          raw.push([p1[0] + d * Math.cos(a), p1[1] + d * Math.sin(a)]);
        }
      } else {
        // the two offset edges cross: use that crossing, unless the corner is so sharp that
        // the mitre shoots off into the distance
        var q1 = [p1[0] + n1x * d, p1[1] + n1y * d];
        var q2 = [p1[0] + n2x * d, p1[1] + n2y * d];
        var hit = segX(q1[0] - v1x, q1[1] - v1y, q1[0] + v1x, q1[1] + v1y,
                       q2[0] - v2x, q2[1] - v2y, q2[0] + v2x, q2[1] + v2y);
        if (hit && dist(hit.x, hit.y, p1[0], p1[1]) < Math.abs(d) * 10) raw.push([hit.x, hit.y]);
        else { raw.push(q1); raw.push(q2); }
      }
    }
    if (raw.length < 3) return [];

    // Judge the offset along its length, not only at its corners. The raw offset has points only
    // where the outline has corners, so a deep V-notch (corners at its mouth and point) or a long
    // straight run could keep or drop whole edges on the strength of their two ends: dropping the
    // too-close point of a notch took both its sides with it (the path bridged the mouth), and a
    // kept edge could pass through the part between two acceptable corners. Short pieces fix both.
    var piece = Math.max(0.05, Math.abs(d) * 0.15), dense = [];
    for (var di = 0; di < raw.length; di++){
      var pa = raw[di], pb = raw[(di + 1) % raw.length], dl = dist(pa[0], pa[1], pb[0], pb[1]);
      var pn = Math.max(1, Math.ceil(dl / piece));
      for (var dk = 0; dk < pn; dk++) dense.push([pa[0] + (pb[0] - pa[0]) * dk / pn, pa[1] + (pb[1] - pa[1]) * dk / pn]);
    }
    raw = dense;

    // Two things go wrong with a raw offset, and they need different cures.
    //
    //  1. Parts of it end up closer to the original than the offset distance. That happens
    //     wherever the shape is narrower than twice the offset, and those parts are simply
    //     dropped; what remains is joined back up in order, which bridges the gap.
    //  2. What remains can still cross itself, which leaves folded loops running backwards.
    //     Those are split off and discarded.
    var keep = Math.abs(d) - Math.max(tol, Math.abs(d) * 0.02);
    var idx = pathIndex(src, true);
    var near = function (x, y) { return idx.dist(x, y, Math.abs(d) * 2); };
    var ok = raw.map(function (p) { return near(p[0], p[1]) >= keep; });

    // the surviving stretches, in order round the outline
    var runs = [], run = [];
    for (var r = 0; r < raw.length; r++){
      if (ok[r]) run.push(raw[r]);
      else if (run.length){ runs.push(run); run = []; }
    }
    if (run.length){
      if (runs.length && ok[0]) runs[0] = run.concat(runs[0]);       // the outline wraps round
      else runs.push(run);
    }
    // A lone survivor in a dropped stretch is the tip of a sharp corner's mitre, not a piece of path:
    // it can't be joined by a crossing and would break the path apart.
    runs = runs.filter(function (rn) { return rn.length >= 3; });
    if (!runs.length) return [];

    // Join one stretch to the next only when the straight line between them stays clear of the
    // shape. Where it doesn't, the region has genuinely come apart (a neck too narrow for the
    // cutter) and the stretches belong to separate loops.
    function bridgeable(a, b){
      var bn = Math.max(10, Math.ceil(dist(a[0], a[1], b[0], b[1]) / piece));    // every short piece of the bridge
      for (var t = 0; t <= bn; t++){
        var x = a[0] + (b[0] - a[0]) * t / bn, y = a[1] + (b[1] - a[1]) * t / bn;
        if (near(x, y) < keep) return false;
      }
      return true;
    }
    // Where a notch narrows below the cutter's width, the two sides' offsets run on past each other
    // into the dropped stretch: they cross exactly where the cutter turns round. Join them there.
    function crossJoin(a, b){
      var K = 400;
      for (var i = a.length - 2; i >= Math.max(0, a.length - 1 - K); i--)
        for (var j = 0; j < Math.min(b.length - 1, K); j++){
          var hx = segX(a[i][0], a[i][1], a[i + 1][0], a[i + 1][1], b[j][0], b[j][1], b[j + 1][0], b[j + 1][1]);
          if (hx) return a.slice(0, i + 1).concat([[hx.x, hx.y]], b.slice(j + 1));
        }
      return null;
    }
    function join(a, b){
      var c = crossJoin(a, b);
      if (c) return c;
      if (bridgeable(a[a.length - 1], b[0])) return a.concat(b);
      return null;
    }
    var chains = [], cur = runs[0].slice();
    for (var q = 1; q < runs.length; q++){
      var jn = join(cur, runs[q]);
      if (jn) cur = jn;
      else { chains.push(cur); cur = runs[q].slice(); }
    }
    var wrap = chains.length ? join(cur, chains[0]) : (runs.length > 1 || !ok.every(Boolean) ? join(cur, cur) : null);
    if (chains.length && wrap) chains[0] = wrap;
    else if (!chains.length && wrap && wrap.length < cur.length * 2){
      // one chain that closes on itself through a crossing: keep the part between the crossings
      chains.push(wrap.length > 2 ? wrap : cur);
    }
    else chains.push(cur);

    if (opts.debug){ opts.debug.runs = runs.map(function (r) { return r.length; }); opts.debug.chains = chains.map(function (c) { return c.length; }); opts.debug.dropped = ok.filter(function (v) { return !v; }).length; opts.debug.raw = raw.length; }
    var out = [];
    chains.forEach(function (ch) {
      if (ch.length < 3) return;
      splitSelfIntersections(clean(ch)).forEach(function (lp) { out.push(lp); });
    });
    if (opts.debug) opts.debug.loops = out.map(function (lp) { var mn = Infinity; lp.forEach(function (q) { mn = Math.min(mn, near(q[0], q[1])); }); return {n: lp.length, area: +area(lp).toFixed(1), ccw: isCCW(lp), nearest: +mn.toFixed(3)}; });
    return out.filter(function (lp) {
      if (lp.length < 3) return false;
      if (Math.abs(area(lp)) < Math.abs(d) * tol) return false;      // slivers
      if (!isCCW(lp)) return false;                                  // folds run backwards
      for (var i = 0; i < lp.length; i++){                           // every piece, not just the corners
        var la = lp[i], lb = lp[(i + 1) % lp.length], ln = Math.max(1, Math.ceil(dist(la[0], la[1], lb[0], lb[1]) / piece));
        for (var lk = 0; lk < ln; lk++)
          if (near(la[0] + (lb[0] - la[0]) * lk / ln, la[1] + (lb[1] - la[1]) * lk / ln) < keep) return false;
      }
      return true;
    }).map(function (lp) { return simplify(lp, Math.min(tol, Math.abs(d) * 0.01), true); });   // straight runs back to two points
  }

  // Break a closed polyline into simple loops at every point where it crosses itself.
  // Walks the outline keeping a stack of where it has been: meeting a point already on the
  // stack means the walk has closed a loop, which is lifted off and kept.
  function splitSelfIntersections(poly){
    var n = poly.length, nodes = [];
    // Only segments that share a patch of space can cross, so bucket them first: comparing every
    // segment with every other costs millions of tests on a real outline.
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var b0 = 0; b0 < n; b0++){
      var pp = poly[b0];
      if (pp[0] < minx) minx = pp[0]; if (pp[0] > maxx) maxx = pp[0];
      if (pp[1] < miny) miny = pp[1]; if (pp[1] > maxy) maxy = pp[1];
    }
    var gcell = Math.max(Math.max(maxx - minx, maxy - miny) / 64, 1e-6), buckets = {};
    function segCells(i2, fn){
      var a2 = poly[i2], b2 = poly[(i2 + 1) % n];
      var cx0 = Math.floor(Math.min(a2[0], b2[0]) / gcell), cx1 = Math.floor(Math.max(a2[0], b2[0]) / gcell);
      var cy0 = Math.floor(Math.min(a2[1], b2[1]) / gcell), cy1 = Math.floor(Math.max(a2[1], b2[1]) / gcell);
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) fn(cx + ',' + cy);
    }
    for (var s0 = 0; s0 < n; s0++) segCells(s0, function (k2) { (buckets[k2] || (buckets[k2] = [])).push(s0); });

    // First find every crossing and record it on BOTH segments involved: the walk below has to
    // pass through each crossing twice to recognise the loop between the two visits.
    var hitsOn = new Array(n);
    for (var h0 = 0; h0 < n; h0++) hitsOn[h0] = [];
    var stamp = new Int32Array(n), mark = 0, cands = new Int32Array(64), nc = 0;
    for (var i = 0; i < n; i++){
      var a = poly[i], b = poly[(i + 1) % n];
      mark++; nc = 0;
      segCells(i, function (k3) {
        var list = buckets[k3];
        if (!list) return;
        for (var z = 0; z < list.length; z++){
          var cj = list[z];
          if (cj <= i || stamp[cj] === mark) continue;
          stamp[cj] = mark;
          if (nc === cands.length){ var big = new Int32Array(nc * 2); big.set(cands); cands = big; }
          cands[nc++] = cj;
        }
      });
      for (var ci = 0; ci < nc; ci++){
        var j = cands[ci];
        if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;   // neighbours share an end
        var c = poly[j], e = poly[(j + 1) % n];
        var x = segX(a[0], a[1], b[0], b[1], c[0], c[1], e[0], e[1]);
        if (!x) continue;
        if (x.t < 1e-9 || x.t > 1 - 1e-9 || x.u < 1e-9 || x.u > 1 - 1e-9) continue;  // at an end: not a crossing
        var pt = [x.x, x.y];
        hitsOn[i].push({t: x.t, p: pt});
        hitsOn[j].push({t: x.u, p: pt});
      }
    }
    for (var i2 = 0; i2 < n; i2++){
      nodes.push({p: poly[i2], cross: null});
      hitsOn[i2].sort(function (p1, q1) { return p1.t - q1.t; });
      hitsOn[i2].forEach(function (hh) { nodes.push({p: hh.p, cross: key(hh.p)}); });
    }
    function key(p){ return p[0].toFixed(6) + ',' + p[1].toFixed(6); }

    var loops = [], stack = [], seen = {};
    for (var k = 0; k < nodes.length; k++){
      var nd = nodes[k];
      if (nd.cross && seen[nd.cross] !== undefined){
        var from = seen[nd.cross];
        var lp = stack.splice(from).map(function (x2) { return x2.p; });
        lp.forEach(function (pt, idx) { if (idx) {} });
        loops.push(clean(lp));
        for (var kk in seen) if (seen[kk] >= from) delete seen[kk];
        seen[nd.cross] = stack.length;
        stack.push(nd);
      } else {
        if (nd.cross) seen[nd.cross] = stack.length;
        stack.push(nd);
      }
    }
    if (stack.length > 2) loops.push(clean(stack.map(function (x3) { return x3.p; })));
    return loops.filter(function (l) { return l.length > 2; });
  }

  // Offset a part: one outer loop and any number of holes, by the same amount.
  // Holes move the opposite way, so a pocket wall and its island both leave the
  // right amount of material.
  function offsetPart(outer, holes, d, opts){
    var res = {outer: offsetLoop(ensureCCW(outer), d, opts), holes: []};
    (holes || []).forEach(function (h) {
      offsetLoop(ensureCCW(h), -d, opts).forEach(function (l) { res.holes.push(l); });
    });
    return res;
  }

  // ---- distance fields ----------------------------------------------------
  // For every point of a grid over the shape: how far it is from the nearest boundary, positive
  // inside the region and negative outside. The region is everything inside an odd number of the
  // loops, so a pocket outline with islands inside it works without any special handling.
  //
  // Accuracy is about half a grid cell. That is plenty for clearing material; walls that have to
  // be exact are cut with the offset engine instead.
  function distanceField(loops, res, pad){
    res = res || 0.1; pad = pad === undefined ? res * 3 : pad;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    loops.forEach(function (l) { l.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }); });
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    var w = Math.ceil((x1 - x0) / res) + 1, h = Math.ceil((y1 - y0) / res) + 1;
    var N = w * h, INF = 1e20;

    // inside or outside, one row at a time: where the row crosses the loops, toggling
    var inside = new Uint8Array(N);
    var edges = [];
    loops.forEach(function (l) { for (var i = 0; i < l.length; i++){ var a = l[i], b = l[(i + 1) % l.length]; if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]); } });
    for (var r = 0; r < h; r++){
      var y = y0 + r * res, xs = [];
      for (var e = 0; e < edges.length; e++){
        var E = edges[e];
        if ((E[1] > y) !== (E[3] > y)) xs.push(E[0] + (y - E[1]) * (E[2] - E[0]) / (E[3] - E[1]));
      }
      xs.sort(function (p1, q1) { return p1 - q1; });
      for (var k = 0; k + 1 < xs.length; k += 2){
        var c0 = Math.max(0, Math.ceil((xs[k] - x0) / res)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / res));
        for (var c = c0; c <= c1; c++) inside[r * w + c] = 1;
      }
    }

    // Each cell remembers the nearest point ON the boundary, not just a distance. Cells beside the
    // boundary find theirs exactly; two sweeps across the grid then hand those points on to
    // neighbours, and every cell measures to the actual point it was given. That keeps the
    // distances true to the wall rather than to the nearest grid cell.
    var nx = new Float64Array(N), ny = new Float64Array(N), d2 = new Float64Array(N);
    for (var q = 0; q < N; q++){ d2[q] = INF; nx[q] = NaN; }
    var idx = loops.map(function (l) { return pathIndex(l, true); });
    function seed(gx, gy){
      var k2 = gy * w + gx;
      if (d2[k2] !== INF) return;
      var px = x0 + gx * res, py = y0 + gy * res, best = Infinity, bp = null;
      for (var t = 0; t < idx.length; t++){
        idx[t].lastNear = null;
        var dd = idx[t].dist(px, py, res * 3);
        if (dd < best && idx[t].lastNear){ best = dd; bp = idx[t].lastNear; }
      }
      if (bp){ nx[k2] = bp[0]; ny[k2] = bp[1]; d2[k2] = best * best; }
    }
    loops.forEach(function (l) {
      for (var i = 0; i < l.length; i++){
        var a = l[i], b = l[(i + 1) % l.length];
        var steps = Math.max(1, Math.ceil(dist(a[0], a[1], b[0], b[1]) / (res * 0.5)));
        for (var s2 = 0; s2 <= steps; s2++){
          var px = a[0] + (b[0] - a[0]) * s2 / steps, py = a[1] + (b[1] - a[1]) * s2 / steps;
          var cx = Math.round((px - x0) / res), cy = Math.round((py - y0) / res);
          for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++){
            var gx = cx + ox, gy = cy + oy;
            if (gx >= 0 && gy >= 0 && gx < w && gy < h) seed(gx, gy);
          }
        }
      }
    });
    function take(k, from, px, py){
      if (isNaN(nx[from])) return;
      var ddx = px - nx[from], ddy = py - ny[from], dd = ddx * ddx + ddy * ddy;
      if (dd < d2[k]){ d2[k] = dd; nx[k] = nx[from]; ny[k] = ny[from]; }
    }
    for (var sweep = 0; sweep < 2; sweep++){
      for (var y = 0; y < h; y++){                     // top-left to bottom-right
        for (var x = 0; x < w; x++){
          var k = y * w + x, px2 = x0 + x * res, py2 = y0 + y * res;
          if (x > 0) take(k, k - 1, px2, py2);
          if (y > 0){ take(k, k - w, px2, py2); if (x > 0) take(k, k - w - 1, px2, py2); if (x < w - 1) take(k, k - w + 1, px2, py2); }
        }
        for (var xb = w - 2; xb >= 0; xb--){ var kb = y * w + xb; take(kb, kb + 1, x0 + xb * res, y0 + y * res); }
      }
      for (var y2 = h - 1; y2 >= 0; y2--){             // bottom-right back to top-left
        for (var x2 = w - 1; x2 >= 0; x2--){
          var k3 = y2 * w + x2, px3 = x0 + x2 * res, py3 = y0 + y2 * res;
          if (x2 < w - 1) take(k3, k3 + 1, px3, py3);
          if (y2 < h - 1){ take(k3, k3 + w, px3, py3); if (x2 < w - 1) take(k3, k3 + w + 1, px3, py3); if (x2 > 0) take(k3, k3 + w - 1, px3, py3); }
        }
        for (var xf = 1; xf < w; xf++){ var kf = y2 * w + xf; take(kf, kf - 1, x0 + xf * res, y0 + y2 * res); }
      }
    }
    var d = new Float32Array(N);
    for (var z = 0; z < N; z++) d[z] = (inside[z] ? 1 : -1) * Math.sqrt(d2[z]);
    return {x0: x0, y0: y0, w: w, h: h, res: res, d: d};
  }
  // Squared Euclidean distance transform (Felzenszwalb and Huttenlocher), seeded with exact
  // squared distances near the boundary. Runs along every row, then every column.
  function edt2(f, w, h, res){
    var n = Math.max(w, h), v = new Int32Array(n), zz = new Float64Array(n + 1), g = new Float64Array(n), out = new Float64Array(n);
    var r2 = res * res;
    function pass1d(len){
      var k = 0; v[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
      for (var q = 1; q < len; q++){
        var sx;
        while (true){
          var p = v[k];
          sx = ((g[q] / r2 + q * q) - (g[p] / r2 + p * p)) / (2 * q - 2 * p);
          if (sx <= zz[k]){ k--; if (k < 0){ k = 0; break; } } else break;
        }
        k++; v[k] = q; zz[k] = sx; zz[k + 1] = Infinity;
      }
      k = 0;
      for (var q2 = 0; q2 < len; q2++){
        while (zz[k + 1] < q2) k++;
        var dq = q2 - v[k];
        out[q2] = dq * dq * r2 + g[v[k]];
      }
    }
    for (var y = 0; y < h; y++){
      for (var x = 0; x < w; x++) g[x] = f[y * w + x];
      pass1d(w);
      for (var x2 = 0; x2 < w; x2++) f[y * w + x2] = out[x2];
    }
    for (var x3 = 0; x3 < w; x3++){
      for (var y2 = 0; y2 < h; y2++) g[y2] = f[y2 * w + x3];
      pass1d(h);
      for (var y3 = 0; y3 < h; y3++) f[y3 * w + x3] = out[y3];
    }
  }
  // The loops where a field equals `level` (marching squares), in world coordinates.
  // The same contour as isoLoops, but only where it's wanted: mask has a 1 for each grid point to look at (a cell
  // is traced when its lower-left point is marked), so what comes back is stretches of the contour, each
  // {pts, closed}: closed when a whole loop lies in the marked part, open where it runs out of it. It looks only
  // at the cells from (x0, y0) to (x1, y1), if given: tracing a few corners of a large field needn't read it all.
  function isoRuns(F, level, mask, x0, y0, x1, y1){
    var w = F.w, h = F.h, d = F.d, res = F.res, segs = [];
    function P(x, y){ return d[y * w + x] - level; }
    function lerp(ax, ay, av, bx, by, bv){
      var t = av / (av - bv);
      return [F.x0 + (ax + (bx - ax) * t) * res, F.y0 + (ay + (by - ay) * t) * res];
    }
    var xa = Math.max(0, x0 === undefined ? 0 : x0), ya = Math.max(0, y0 === undefined ? 0 : y0);
    var xb = Math.min(w - 2, x1 === undefined ? w - 2 : x1), yb = Math.min(h - 2, y1 === undefined ? h - 2 : y1);
    for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++){
      if (!mask[y * w + x]) continue;
      var a = P(x, y), b = P(x + 1, y), c = P(x + 1, y + 1), e = P(x, y + 1);
      var code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (e > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      var pts = [];
      if ((a > 0) !== (b > 0)) pts.push(lerp(x, y, a, x + 1, y, b));
      if ((b > 0) !== (c > 0)) pts.push(lerp(x + 1, y, b, x + 1, y + 1, c));
      if ((c > 0) !== (e > 0)) pts.push(lerp(x + 1, y + 1, c, x, y + 1, e));
      if ((e > 0) !== (a > 0)) pts.push(lerp(x, y + 1, e, x, y, a));
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4){                        // a saddle: decide by the centre, as isoLoops does
        var mid = (a + b + c + e) / 4;
        if ((mid > 0) === (a > 0)){ segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
        else { segs.push([pts[0], pts[3]]); segs.push([pts[1], pts[2]]); }
      }
    }
    function key(p){ return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); }
    var byEnd = {};
    segs.forEach(function (sg, i) {
      [0, 1].forEach(function (end) { var k = key(sg[end]); (byEnd[k] || (byEnd[k] = [])).push(i); });
    });
    var used = new Uint8Array(segs.length), runs = [];
    // walk on from the end `cur` of a chain for as long as an unused segment joins it
    function walk(chain, cur){
      while (true){
        var cand = byEnd[key(cur)], next = -1;
        if (cand) for (var j = 0; j < cand.length; j++) if (!used[cand[j]]){ next = cand[j]; break; }
        if (next < 0) return false;
        used[next] = 1;
        var sg2 = segs[next];
        cur = key(sg2[0]) === key(cur) ? sg2[1] : sg2[0];
        if (key(cur) === key(chain[0])) return true;     // back where it began: a loop
        chain.push(cur);
      }
    }
    for (var i = 0; i < segs.length; i++){
      if (used[i]) continue;
      used[i] = 1;
      var chain = [segs[i][0], segs[i][1]];
      var closed = walk(chain, segs[i][1]);
      if (!closed){                                      // an open stretch: it may run on from its first end too
        chain.reverse();
        walk(chain, chain[chain.length - 1]);
      }
      chain = clean(chain);
      if (chain.length > (closed ? 2 : 1)) runs.push({pts: chain, closed: closed});
    }
    return runs;
  }
  function isoLoops(F, level){
    var w = F.w, h = F.h, d = F.d, res = F.res, segs = [];
    function P(x, y){ return d[y * w + x] - level; }
    function lerp(ax, ay, av, bx, by, bv){
      var t = av / (av - bv);
      return [F.x0 + (ax + (bx - ax) * t) * res, F.y0 + (ay + (by - ay) * t) * res];
    }
    for (var y = 0; y < h - 1; y++) for (var x = 0; x < w - 1; x++){
      var a = P(x, y), b = P(x + 1, y), c = P(x + 1, y + 1), e = P(x, y + 1);
      var code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (e > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      var pts = [];
      if ((a > 0) !== (b > 0)) pts.push(lerp(x, y, a, x + 1, y, b));
      if ((b > 0) !== (c > 0)) pts.push(lerp(x + 1, y, b, x + 1, y + 1, c));
      if ((c > 0) !== (e > 0)) pts.push(lerp(x + 1, y + 1, c, x, y + 1, e));
      if ((e > 0) !== (a > 0)) pts.push(lerp(x, y + 1, e, x, y, a));
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4){                        // a saddle: decide by the centre
        var mid = (a + b + c + e) / 4;
        if ((mid > 0) === (a > 0)){ segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
        else { segs.push([pts[0], pts[3]]); segs.push([pts[1], pts[2]]); }
      }
    }
    // stitch the little segments into loops by matching their ends
    function key(p){ return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); }
    var byEnd = {};
    segs.forEach(function (sg, i) {
      [0, 1].forEach(function (end) { var k = key(sg[end]); (byEnd[k] || (byEnd[k] = [])).push(i); });
    });
    var used = new Uint8Array(segs.length), loops = [];
    for (var i = 0; i < segs.length; i++){
      if (used[i]) continue;
      used[i] = 1;
      var loop = [segs[i][0], segs[i][1]], cur = segs[i][1];
      while (true){
        var cand = byEnd[key(cur)], next = -1;
        if (cand) for (var j = 0; j < cand.length; j++) if (!used[cand[j]]){ next = cand[j]; break; }
        if (next < 0) break;
        used[next] = 1;
        var sg2 = segs[next];
        cur = key(sg2[0]) === key(cur) ? sg2[1] : sg2[0];
        if (key(cur) === key(loop[0])) break;
        loop.push(cur);
      }
      if (loop.length > 2) loops.push(clean(loop));
    }
    return loops.filter(function (l) { return l.length > 2; });
  }

  return {
    EPS: EPS,
    dist: dist, area: area, area2: area2, isCCW: isCCW, ensureCCW: ensureCCW, ensureCW: ensureCW,
    clean: clean, simplify: simplify, pointInLoop: pointInLoop, splitSelfIntersections: splitSelfIntersections,
    closestOnSeg: closestOnSeg, distToSeg: distToSeg, distToPath: distToPath, pathIndex: pathIndex, segX: segX,
    arcPoints: arcPoints, circlePoints: circlePoints,
    offsetLoop: offsetLoop, offsetPart: offsetPart,
    distanceField: distanceField, isoLoops: isoLoops, isoRuns: isoRuns, edt2: edt2
  };
});
