/* ============================================================
   454 CAM — toolpaths.
   Builds on geom.js. Produces a list of moves; a separate writer turns those
   into G-code, so the toolpath can be checked without reading G-code.

   A move is {g:0|1, x, y, z, f} in millimetres, absolute, with f in mm/min.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geom.js'));
  else root.Cam = factory(root.Geom);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  // ---- helpers ---------------------------------------------------------
  function loopLength(loop){
    var L = 0;
    for (var i = 0; i < loop.length; i++){
      var a = loop[i], b = loop[(i + 1) % loop.length];
      L += G.dist(a[0], a[1], b[0], b[1]);
    }
    return L;
  }
  // A point at a given distance along a closed loop.
  function pointAt(loop, dist){
    var L = loopLength(loop), n = loop.length;
    var d = ((dist % L) + L) % L, run = 0;
    for (var i = 0; i < n; i++){
      var a = loop[i], b = loop[(i + 1) % n], seg = G.dist(a[0], a[1], b[0], b[1]);
      if (run + seg >= d - 1e-9){
        var t = seg < 1e-12 ? 0 : (d - run) / seg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      run += seg;
    }
    return loop[0].slice();
  }

  // The distances round a loop where something has to happen: every corner, plus anything the
  // caller adds (where a tab starts and ends, where a ramp finishes). Cutting the path at these
  // points is what makes tabs work in the middle of a long straight, where there is no corner.
  function passStations(loop, extra, maxStep){
    var L = loopLength(loop), stations = [0], run = 0;
    for (var i = 0; i < loop.length; i++){
      var a = loop[i], b = loop[(i + 1) % loop.length];
      run += G.dist(a[0], a[1], b[0], b[1]);
      stations.push(Math.min(run, L));
    }
    (extra || []).forEach(function (d) { stations.push(((d % L) + L) % L); });
    stations.push(L);
    stations.sort(function (x, y) { return x - y; });
    if (maxStep > 0){                                    // fill in long gaps, for a smooth ramp
      var filled = [stations[0]];
      for (var k = 1; k < stations.length; k++){
        var gap = stations[k] - stations[k - 1];
        if (gap > maxStep){
          var steps = Math.ceil(gap / maxStep);
          for (var j = 1; j < steps; j++) filled.push(stations[k - 1] + gap * j / steps);
        }
        filled.push(stations[k]);
      }
      stations = filled;
    }
    var out = [];
    stations.forEach(function (d) {
      if (!out.length || d - out[out.length - 1] > 1e-7) out.push(d);
    });
    return out;
  }

  // How far round a loop you have to go to reach the point nearest p. Used to put a tab that
  // was placed on the drawn outline onto the toolpath, which runs a cutter radius away from it.
  function distanceAlong(loop, px, py){
    var best = Infinity, at = 0, run = 0, n = loop.length;
    for (var i = 0; i < n; i++){
      var a = loop[i], b = loop[(i + 1) % n];
      var seg = G.dist(a[0], a[1], b[0], b[1]);
      var q = G.closestOnSeg(px, py, a[0], a[1], b[0], b[1]);
      var dd = G.dist(px, py, q[0], q[1]);
      if (dd < best){ best = dd; at = run + G.dist(a[0], a[1], q[0], q[1]); }
      run += seg;
    }
    return at;
  }
  // Tab positions spread evenly round a loop, as points: half a spacing along so none sits on
  // the seam where the tool enters.
  function evenTabPoints(loop, count){
    var out = [], L = loopLength(loop);
    for (var t = 0; t < count; t++){ var p = pointAt(loop, L * (t + 0.5) / count); out.push([p[0], p[1]]); }
    return out;
  }

  // Which way round to travel. With a clockwise-turning cutter, climb milling puts the cutter's
  // motion and its rotation the same way at the material: that means clockwise round an outside
  // profile, and counter-clockwise inside a pocket or hole.
  function orient(loop, side, climb){
    var wantCCW = (side === 'inside') ? !!climb : !climb;
    return wantCCW ? G.ensureCCW(loop) : G.ensureCW(loop);
  }

  // ---- profile ---------------------------------------------------------
  // opts:
  //   outline   closed loop, [[x,y],...]
  //   side      'outside' | 'inside' | 'on'
  //   toolDia   cutter diameter, mm
  //   depth     total depth of cut, mm (positive, measured down from z0)
  //   z0        surface height (usually 0, the top of the stock)
  //   passDepth maximum cut per pass, mm
  //   stepFinal optional finishing allowance left on the wall, mm
  //   climb     true for climb milling
  //   safeZ     height for rapid moves
  //   feed, plunge  mm/min
  //   tabs      {count, length, thickness, shape} or null; shape 'flat' (the default) or '3d' (tapered);
  //             length is the wood left, along the middle of the cut
  //             (the cutter stays up over that and its radius either side)
  //   ramp      {length} to lead into each pass, or null for a straight plunge
  function profile(opts){
    var o = Object.assign({
      side: 'outside', toolDia: 3.175, depth: 3, z0: 0, passDepth: 1,
      climb: true, safeZ: 5, feed: 800, plunge: 300, stepFinal: 0,
      tabs: null, ramp: null, finishPass: false
    }, opts);
    // FINISHING: rough every pass leaving stepFinal on the wall, then take it off in one pass at full
    // depth. The cutter is barely loaded, so the wall comes out cleaner and truer. It drops straight
    // into the roughed slot (the allowance is thinner than the cutter), so no ramp is needed.
    if (o.finishPass && o.stepFinal > 0 && o.side !== 'on'){
      var rough = profile(Object.assign({}, o, {finishPass: false}));
      var fin = profile(Object.assign({}, o, {finishPass: false, stepFinal: 0, passDepth: o.depth, ramp: {length: 0}}));
      return Object.assign({}, rough, {moves: rough.moves.concat(fin.moves), finished: true, allowance: o.stepFinal});
    }

    var r = o.toolDia / 2;
    var d = o.side === 'on' ? 0 : (o.side === 'outside' ? r + o.stepFinal : -(r + o.stepFinal));
    // Pad the offset by the simplify tolerance, so straightening the path can never bring it
    // closer to the part than the cutter radius.
    var simp = o.tolerance === undefined ? 0.01 : o.tolerance;
    var dPad = d === 0 ? 0 : d + (d > 0 ? simp : -simp);
    var loops = (d === 0 ? [G.clean(o.outline)] : G.offsetLoop(o.outline, dPad))
                  .map(function (l) { return G.simplify(l, simp, true); })
                  .filter(function (l) { return l.length > 2; });
    if (!loops.length) return {moves: [], loops: 0, warning: 'the cutter is too big for this shape'};

    var moves = [], passes = Math.max(1, Math.ceil(o.depth / o.passDepth));
    var tabTops = [];

    // LEADS: sweep onto the line from the waste side and off it again, so no pass starts or stops
    // on the finished wall. Every lead point keeps the cutter clear of the part; in a tight hole the
    // lead shrinks, or is dropped if even a small one won't fit.
    var leadOn = o.lead && o.lead.type && o.lead.type !== 'none' && o.side !== 'on' && o.lead.size > 0;
    var partIdx = leadOn ? G.pathIndex(G.clean(o.outline), true) : null, clearNeed = Math.abs(dPad) - 0.002;
    function leadPoints(P, tx, ty, R, into){                 // into: true = lead-in (ends at P), false = lead-out (starts at P)
      partIdx.lastNear = null; partIdx.dist(P[0], P[1]);
      var Q = partIdx.lastNear; if (!Q) return null;
      var wx = P[0] - Q[0], wy = P[1] - Q[1], wl = Math.hypot(wx, wy); if (wl < 1e-9) return null;
      wx /= wl; wy /= wl;                                      // pointing into the waste
      var pts = [], k;
      if (o.lead.type === 'line'){
        var s2 = R / Math.SQRT2;
        pts = into ? [[P[0] + (wx - tx) * s2, P[1] + (wy - ty) * s2], P] : [P, [P[0] + (wx + tx) * s2, P[1] + (wy + ty) * s2]];
      } else {                                                 // a quarter circle, tangent to the path at P
        var cx = P[0] + wx * R, cy = P[1] + wy * R, n2 = 10;
        for (k = 0; k <= n2; k++){
          var th = (into ? (n2 - k) : k) / n2 * Math.PI / 2, sgn = into ? -1 : 1;
          pts.push([cx + R * (-wx * Math.cos(th) + sgn * tx * Math.sin(th)), cy + R * (-wy * Math.cos(th) + sgn * ty * Math.sin(th))]);
        }
      }
      for (k = 0; k < pts.length; k++) if (partIdx.dist(pts[k][0], pts[k][1]) < clearNeed) return null;   // would touch the part
      return pts;
    }
    function fitLead(P, tx, ty, into){                        // the full size, or smaller until it fits
      for (var R = o.lead.size, tries = 0; tries < 4; R /= 2, tries++){ var lp = leadPoints(P, tx, ty, R, into); if (lp) return lp; }
      return null;
    }
    var leadsDropped = 0;

    loops.forEach(function (raw) {
      var loop = orient(raw, o.side, o.climb);
      if (leadOn){                                             // start mid-way along the longest edge, where the direction is clear
        var bi = 0, bl = -1;
        for (var i0 = 0; i0 < loop.length; i0++){ var a0 = loop[i0], b0 = loop[(i0 + 1) % loop.length], l0 = G.dist(a0[0], a0[1], b0[0], b0[1]); if (l0 > bl){ bl = l0; bi = i0; } }
        var A0 = loop[bi], B0 = loop[(bi + 1) % loop.length], mid = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2];
        loop = [mid].concat(loop.slice(bi + 1), loop.slice(0, bi + 1));
      }
      var L = loopLength(loop);
      var tabAt = [];
      if (o.tabs && o.tabs.length > 0){
        if (o.tabs.at && o.tabs.at.length){
          // placed by hand on the drawn outline: carry each one across to the toolpath
          o.tabs.at.forEach(function (pt) { tabAt.push(distanceAlong(loop, pt[0], pt[1])); });
        } else if (o.tabs.count > 0){
          for (var t = 0; t < o.tabs.count; t++) tabAt.push(L * (t + 0.5) / o.tabs.count);
        }
      }
      var start = pointAt(loop, 0);
      var t0x = 0, t0y = 0;
      if (leadOn){ var nx0 = pointAt(loop, Math.min(0.05, L / 4)); t0x = nx0[0] - start[0]; t0y = nx0[1] - start[1]; var tl0 = Math.hypot(t0x, t0y) || 1; t0x /= tl0; t0y /= tl0; }
      var rampAny = o.ramp && o.ramp.length > 0;
      var leadIn = leadOn && !rampAny ? fitLead(start, t0x, t0y, true) : null;   // with a ramp the entry is already gradual
      if (leadOn && !rampAny && !leadIn) leadsDropped++;
      moves.push({g: 0, z: o.safeZ});
      moves.push({g: 0, x: (leadIn ? leadIn[0] : start)[0], y: (leadIn ? leadIn[0] : start)[1]});

      for (var p = 1; p <= passes; p++){
        var z = o.z0 - Math.min(o.depth, o.passDepth * p);
        var prevZ = o.z0 - Math.min(o.depth, o.passDepth * (p - 1));
        var tabZ = o.tabs ? o.z0 - Math.max(0, o.depth - o.tabs.thickness) : -Infinity;
        var cutTabs = !!(o.tabs && tabAt.length && z < tabZ - 1e-9);
        var rampLen = o.ramp && o.ramp.length > 0 ? Math.min(o.ramp.length, L) : 0;
        // A tab's length is the wood it leaves, measured along the middle of the cut. The cutter reaches its
        // radius past its centre either side, so it stays up over the length and its radius more at each end.
        // (It used to stay up over just the length: a 4 mm tab with a 6.35 mm cutter left two slivers.)
        var tHalf = o.tabs ? o.tabs.length / 2 : 0, tUp = tHalf + r;
        // 3D (tapered) tabs: a triangle of wood, the cut's floor at a tab's ends rising to its full height at
        // its middle. The cutter holds the full height for its radius either side of the middle, then comes
        // down the slope: the higher of that and the pass depth.
        var tri = !!(o.tabs && o.tabs.shape === '3d'), zFloor = o.z0 - o.depth;
        function tabTopAt(dist){                        // the cutter's height over a 3D tab at this distance along the path
          if (!cutTabs) return -Infinity;
          var best = -Infinity;
          for (var ti = 0; ti < tabAt.length; ti++){
            var c = tabAt[ti], dd = Math.min(Math.abs(dist - c), Math.abs(dist - c - L), Math.abs(dist - c + L));
            if (dd <= r) best = Math.max(best, tabZ);
            else if (dd < tUp) best = Math.max(best, zFloor + (tabZ - zFloor) * (1 - (dd - r) / tHalf));
          }
          return best;
        }

        // everywhere the path has to be cut: tab edges, the end of the ramp, and enough points
        // along the ramp for it to be a ramp rather than one long move
        var extra = [];
        if (cutTabs) tabAt.forEach(function (c) {
          extra.push(c - tUp); extra.push(c + tUp);
          if (tri){                                     // its top, and where this pass meets its slopes: exact
            extra.push(c - r); extra.push(c); extra.push(c + r);
            if (z > zFloor + 1e-9){ var k = r + tHalf * (1 - (z - zFloor) / (tabZ - zFloor)); if (k > r + 1e-6){ extra.push(c - k); extra.push(c + k); } }
          }
        });
        if (rampLen > 0) extra.push(rampLen);
        var stations = passStations(loop, extra, rampLen > 0 ? Math.max(0.5, rampLen / 12) : 0);

        function inTabAt(dist){
          if (!cutTabs) return false;
          for (var ti = 0; ti < tabAt.length; ti++){
            var c = tabAt[ti];
            var dd = Math.min(Math.abs(dist - c), Math.abs(dist - c - L), Math.abs(dist - c + L));
            if (dd <= tUp - 1e-9) return true;
          }
          return false;
        }

        // down at the start: never into a tab that's there (to its top, and across it from there)
        var zIn = Math.max(z, cutTabs ? (tri ? tabTopAt(0) : (inTabAt(0) ? tabZ : -Infinity)) : -Infinity);
        if (rampLen === 0) moves.push({g: 1, z: zIn, f: o.plunge});
        if (p === 1 && leadIn && rampLen === 0)
          for (var li0 = 1; li0 < leadIn.length; li0++) moves.push({g: 1, x: leadIn[li0][0], y: leadIn[li0][1], z: z, f: o.feed});
        // Tabs: step straight up at a tab's leading edge, cross it at tab height, and straight down
        // at its trailing edge. (The height used to be attached to the END of the move crossing into
        // a tab, so the cutter climbed gradually across it: a wedge, full thickness at one end and
        // cut right through at the other.)
        var zNow = rampLen > 0 ? prevZ : zIn;
        function toStation(si2, zWant, feed){
          var pt2 = pointAt(loop, stations[si2]);
          if (Math.abs(zWant - zNow) > 1e-9 && !(rampLen > 0 && stations[si2] <= rampLen + 1e-9)){
            var pv2 = pointAt(loop, stations[si2 - 1]);            // change height at the edge itself
            moves.push({g: 1, x: pv2[0], y: pv2[1], z: zWant, f: zWant < zNow ? o.plunge : o.feed});
          }
          moves.push({g: 1, x: pt2[0], y: pt2[1], z: zWant, f: feed});
          zNow = zWant;
        }
        for (var si = 1; si < stations.length; si++){
          var d0 = stations[si];
          if (rampLen > 0 && d0 < rampLen - 1e-9){
            // down the ramp, but never below a tab's top inside the tab: straight up at its near edge,
            // across at tab height, and down again after it (the ramp used to ignore tabs and nick them)
            var rampZ = function (dd) { return prevZ + (z - prevZ) * (dd / rampLen); };
            var inT = cutTabs && inTabAt((stations[si] + stations[si - 1]) / 2);
            var zStart = tri ? Math.max(rampZ(stations[si - 1]), tabTopAt(stations[si - 1])) : inT ? Math.max(rampZ(stations[si - 1]), tabZ) : rampZ(stations[si - 1]);
            var zr = tri ? Math.max(rampZ(d0), tabTopAt(d0)) : inT ? Math.max(rampZ(d0), tabZ) : rampZ(d0), pr0 = pointAt(loop, d0);
            if (Math.abs(zStart - zNow) > 1e-9){
              var pe = pointAt(loop, stations[si - 1]);
              moves.push({g: 1, x: pe[0], y: pe[1], z: zStart, f: zStart < zNow ? o.plunge : o.feed}); zNow = zStart;
            }
            moves.push({g: 1, x: pr0[0], y: pr0[1], z: zr, f: o.plunge}); zNow = zr;
            continue;
          }
          if (tri){                                     // along a 3D tab's slope: straight to the height at the next station
            var ptT = pointAt(loop, d0), zT = Math.max(z, tabTopAt(d0));
            moves.push({g: 1, x: ptT[0], y: ptT[1], z: zT, f: (rampLen > 0 && d0 <= rampLen) ? o.plunge : o.feed}); zNow = zT;
            continue;
          }
          toStation(si, inTabAt((stations[si] + stations[si - 1]) / 2) ? tabZ : z, (rampLen > 0 && d0 <= rampLen) ? o.plunge : o.feed);
        }
        // Between passes the cutter keeps going: the lap ends back at the start at this pass's depth, and the
        // next pass ramps down from there as it carries on round, through the stretch this pass ramped (so
        // that stretch is cut deeper anyway). Only the last pass leaves its ramp on a slope, so only the last
        // pass goes round past the start and cuts that stretch again at full depth: without it a through-cut
        // leaves a sloping web holding the part. (Every pass used to recut it and then drive back along it to
        // the start, so the cutter went forward, back and forward again at each pass.)
        if (rampLen > 0 && p === passes){
          for (var so = 1; so < stations.length && stations[so - 1] < rampLen - 1e-9; so++){
            var zz2 = tri ? Math.max(z, tabTopAt(stations[so])) : inTabAt((stations[so] + stations[so - 1]) / 2) ? tabZ : z;
            var pvx = pointAt(loop, stations[so - 1]), ppx = pointAt(loop, stations[so]);
            if (!tri && Math.abs(zz2 - zNow) > 1e-9) moves.push({g: 1, x: pvx[0], y: pvx[1], z: zz2, f: zz2 < zNow ? o.plunge : o.feed});
            moves.push({g: 1, x: ppx[0], y: ppx[1], z: zz2, f: o.feed}); zNow = zz2;
          }
        }
      }
      if (leadOn){
        var lastM = null; for (var lm = moves.length - 1; lm >= 0; lm--) if (moves[lm].x !== undefined){ lastM = moves[lm]; break; }
        if (lastM){
          var endP = [lastM.x, lastM.y], dEnd = distanceAlong(loop, endP[0], endP[1]);
          var nxE = pointAt(loop, (dEnd + 0.05) % L), txE = nxE[0] - endP[0], tyE = nxE[1] - endP[1], tlE = Math.hypot(txE, tyE) || 1;
          var lo = fitLead(endP, txE / tlE, tyE / tlE, false);
          var zEnd = lastM.z !== undefined ? lastM.z : o.z0 - o.depth;
          if (lo) for (var lk = 1; lk < lo.length; lk++) moves.push({g: 1, x: lo[lk][0], y: lo[lk][1], z: zEnd, f: o.feed});
          else leadsDropped++;
        }
      }
      moves.push({g: 0, z: o.safeZ});
    });

    return {
      moves: moves, loops: loops.length, passes: passes, leadsDropped: leadsDropped,
      depth: o.depth, tabs: o.tabs ? (o.tabs.at ? o.tabs.at.length : o.tabs.count * loops.length) : 0
    };
  }

  // ---- pocketing -------------------------------------------------------
  // Clear everything inside `outline`, leaving any `islands` standing, down to depth.
  //
  // Rings are taken from a distance field, which is what lets rings from the wall and rings round
  // an island merge naturally as they grow. Each ring point is then nudged to exactly the right
  // distance from the nearest wall, so the finished walls are true.
  //
  // opts: outline, islands [], toolDia, stepover (mm), depth, passDepth, z0, safeZ, feed, plunge,
  //       climb, ramp {length}, rest {toolDia, level}
  //
  // rest: clean up after a larger cutter that has already pocketed the same outline to the same depth, its
  // centre kept `level` from the walls (its radius, the tolerance, and any allowance it left). It cleared
  // everything within its radius of where its centre could go; what's left is the corners it couldn't get
  // into and the parts too narrow for it. This cutter's usual rings are kept only where it would touch that,
  // so it goes only where it's needed. Leftovers thinner than about the grid's accuracy are ignored.
  function pocket(opts){
    var o = Object.assign({islands: [], toolDia: 3.175, stepover: 1.2, depth: 3, passDepth: 1, z0: 0,
                           safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: {length: 8}}, opts);
    var r = o.toolDia / 2, step = Math.min(o.stepover, o.toolDia * 0.95);
    var bounds = [G.ensureCCW(G.clean(o.outline))].concat(o.islands.map(function (l) { return G.ensureCW(G.clean(l)); }));
    var res = Math.max(0.03, Math.min(0.1, step / 6));
    var F = G.distanceField(bounds, res, r);
    var maxD = 0;
    for (var i = 0; i < F.d.length; i++) if (F.d[i] > maxD) maxD = F.d[i];
    if (maxD < r + (o.tolerance === undefined ? 0.01 : o.tolerance) + (o.allowance > 0 ? o.allowance : 0)) return {moves: [], warning: 'the cutter is too big for this pocket', rings: 0};

    // Levels from the wall pass inward; a last small ring if the middle would otherwise be missed.
    // The wall ring sits the flattening tolerance further out than the radius: curves arrive as
    // straight segments that fall short of the true curve by up to that much, and the cutter
    // must clear the true curve, not the flats.
    var tol = o.tolerance === undefined ? 0.01 : o.tolerance;
    var allow = o.allowance > 0 ? o.allowance : 0;          // left on the walls for a finishing pass
    var levels = [r + tol + allow];
    for (var L = r + tol + allow + step; L < maxD - res; L += step) levels.push(L);
    var last = levels[levels.length - 1];
    if (maxD - last > r * 0.75) levels.push(Math.max(r + tol + allow, maxD - r * 0.5));

    var idx = bounds.map(function (b) { return G.pathIndex(b, true); });
    function nearestWall(px, py){
      var best = Infinity, bp = null;
      for (var t = 0; t < idx.length; t++){
        idx[t].lastNear = null;
        var d = idx[t].dist(px, py, Math.max(r, maxD) * 2);
        if (d < best && idx[t].lastNear){ best = d; bp = idx[t].lastNear; }
      }
      return {d: best, p: bp};
    }
    function sample(px, py){                           // the field between grid points
      var gx = (px - F.x0) / res, gy = (py - F.y0) / res;
      var x0 = Math.max(0, Math.min(F.w - 2, Math.floor(gx))), y0 = Math.max(0, Math.min(F.h - 2, Math.floor(gy)));
      var tx = gx - x0, ty = gy - y0, w = F.w, d = F.d;
      return (d[y0*w+x0]*(1-tx) + d[y0*w+x0+1]*tx) * (1-ty) + (d[(y0+1)*w+x0]*(1-tx) + d[(y0+1)*w+x0+1]*tx) * ty;
    }
    // Make a ring run so the uncut material is on the cutter's right for climb milling (left for
    // conventional), and put every point exactly `level` from the nearest wall.
    function prepare(loop, level){
      var snapped = loop.map(function (p) {
        var nw = nearestWall(p[0], p[1]);
        if (!nw.p || nw.d < 1e-9) return p;
        var k = level / nw.d;
        return [nw.p[0] + (p[0] - nw.p[0]) * k, nw.p[1] + (p[1] - nw.p[1]) * k];
      });
      snapped = G.simplify(G.clean(snapped), 0.005, true);
      if (snapped.length < 3) return null;
      var a = snapped[0], b = snapped[1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1;
      var mx = (a[0] + b[0]) / 2 + (dy / L2) * res * 2, my = (a[1] + b[1]) / 2 - (dx / L2) * res * 2;   // just to the right
      var materialOnRight = sample(mx, my) < level;
      if (materialOnRight !== !!o.climb) snapped.reverse();
      return snapped;
    }

    var ringsByLevel = levels.map(function (lv) {
      return G.isoLoops(F, lv).map(function (l) { return prepare(l, lv); }).filter(Boolean);
    });
    // REST: the larger cutter's leftovers, and which stretches of these rings reach them
    var restRuns = null, restLeft = 0;
    if (o.rest && o.rest.toolDia > 0){
      var N = F.w * F.h, Rb = o.rest.toolDia / 2, slack = res * 1.5;
      var reach = new Float64Array(N);                   // squared distance to where the larger cutter's centre went
      for (var q0 = 0; q0 < N; q0++) reach[q0] = F.d[q0] >= o.rest.level ? 0 : 1e20;
      G.edt2(reach, F.w, F.h, res);
      var left = new Float64Array(N);                    // squared distance to material it left
      for (var q1 = 0; q1 < N; q1++){
        var isLeft = F.d[q1] > 0 && Math.sqrt(reach[q1]) > Rb + tol + slack;
        left[q1] = isLeft ? 0 : 1e20;
        if (isLeft) restLeft++;
      }
      G.edt2(left, F.w, F.h, res);
      var needAt = function (px, py){                    // would this cutter, centred here, touch any of it?
        var gx = Math.round((px - F.x0) / res), gy = Math.round((py - F.y0) / res);
        if (gx < 0 || gy < 0 || gx >= F.w || gy >= F.h) return true;
        return left[gy * F.w + gx] <= (r + res * 2) * (r + res * 2);
      };
      restRuns = ringsByLevel.map(function (rings) {
        var out = [];
        rings.forEach(function (ring) {
          var n = ring.length, need = ring.map(function (p) { return needAt(p[0], p[1]); });
          var grown = need.map(function (v, i) { return v || need[(i + 1) % n] || need[(i + n - 1) % n]; });   // a point either side
          if (grown.every(Boolean)){ out.push({pts: ring, closed: true}); return; }
          var s0 = grown.indexOf(false);
          var run = null;
          for (var k = 1; k <= n; k++){
            var i = (s0 + k) % n;
            if (grown[i]){ if (!run) run = []; run.push(ring[i]); }
            else if (run){ if (run.length >= 2) out.push({pts: run, closed: false}); run = null; }
          }
          if (run && run.length >= 2) out.push({pts: run, closed: false});
        });
        return out;
      });
    }
    var ringCount = ringsByLevel.reduce(function (s2, a2) { return s2 + a2.length; }, 0);

    var moves = [], passes = Math.max(1, Math.ceil(o.depth / o.passDepth)), here = null;
    var clear = o.z0 + 1;                               // just above the surface, for short hops
    moves.push({g: 0, z: o.safeZ});
    function rotateTo(loop, p){                         // start the ring where we already are
      var bi = 0, bd = Infinity;
      for (var i2 = 0; i2 < loop.length; i2++){ var d2 = G.dist(p[0], p[1], loop[i2][0], loop[i2][1]); if (d2 < bd){ bd = d2; bi = i2; } }
      return loop.slice(bi).concat(loop.slice(0, bi));
    }
    // Can the cutter feed straight across? Every 0.2 mm of the move must keep the full cutter radius
    // (plus the flattening tolerance) from every wall, within the distance map's accuracy. (It used
    // to sample 10 points and allow a sixth of the stepover, which let raster links skim islands.)
    function linkInside(a, b){
      var L = G.dist(a[0], a[1], b[0], b[1]);
      if (L > o.toolDia * 1.2) return false;
      var n = Math.max(2, Math.ceil(L / 0.2));
      for (var i = 0; i <= n; i++){
        var t = i / n;
        if (sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < r + tol - 0.02) return false;
      }
      return true;
    }
    // RASTER: parallel lines at the chosen angle, clipped to where the cutter's centre may go (the
    // same exact boundary as the wall pass, so islands and narrow necks behave the same), then the
    // wall pass to clean up the edges. Computed once; the same pattern runs at every depth.
    var raster = o.strategy === 'raster', rasterSegs = [];
    if (raster){
      var th = (o.rasterAngle || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
      var rot = function (q) { return [q[0] * cs + q[1] * sn, -q[0] * sn + q[1] * cs]; };
      var unrot = function (x, y) { return [x * cs - y * sn, x * sn + y * cs]; };
      var walls = ringsByLevel[0].map(function (l) { return l.map(rot); });
      var ymin = Infinity, ymax = -Infinity;
      walls.forEach(function (l) { l.forEach(function (q) { if (q[1] < ymin) ymin = q[1]; if (q[1] > ymax) ymax = q[1]; }); });
      var nLines = Math.max(1, Math.ceil((ymax - ymin) / step));
      var gap = (ymax - ymin) / nLines;                  // evenly spread, never wider than the stepover
      for (var ln = 0; ln < nLines; ln++){
        var y = ymin + gap * (ln + 0.5), xs = [];
        walls.forEach(function (l) {
          for (var e = 0; e < l.length; e++){
            var A = l[e], B = l[(e + 1) % l.length];
            if ((A[1] > y) !== (B[1] > y)) xs.push(A[0] + (y - A[1]) * (B[0] - A[0]) / (B[1] - A[1]));
          }
        });
        xs.sort(function (a, b) { return a - b; });
        for (var q2 = 0; q2 + 1 < xs.length; q2 += 2){
          if (xs[q2 + 1] - xs[q2] < 1e-3) continue;
          rasterSegs.push([unrot(xs[q2], y), unrot(xs[q2 + 1], y)]);
        }
      }
    }
    // a ramp that walks back and forth along a line, ending where it began at the new depth
    function rampOn(a, b, fromZ, toZ){
      var L = G.dist(a[0], a[1], b[0], b[1]), rl = o.ramp && o.ramp.length > 0 ? o.ramp.length : 0;
      if (rl <= 0 || L < 0.2){ moves.push({g: 1, z: toZ, f: o.plunge}); return; }
      var leg = Math.min(L, Math.max(rl / 2, 0.5)), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      var n = Math.max(2, Math.ceil(rl / leg)); if (n % 2) n++;
      for (var i = 1; i <= n; i++){
        var out = i % 2 === 1, zz = fromZ + (toZ - fromZ) * i / n;
        moves.push({g: 1, x: out ? a[0] + ux * leg : a[0], y: out ? a[1] + uy * leg : a[1], z: zz, f: o.plunge});
      }
    }
    for (var p = 1; p <= passes; p++){
      var z = o.z0 - Math.min(o.depth, o.passDepth * p), prevZ = o.z0 - Math.min(o.depth, o.passDepth * (p - 1));
      var entered = false;
      if (restRuns){                                     // only the stretches that reach what was left
        for (var lr = restRuns.length - 1; lr >= 0; lr--){
          var runs = restRuns[lr].slice();
          while (runs.length){
            var fromR = here || runs[0].pts[0], bR = 0, bdR = Infinity;
            runs.forEach(function (rn, kk) { var dd = G.dist(fromR[0], fromR[1], rn.pts[0][0], rn.pts[0][1]); if (dd < bdR){ bdR = dd; bR = kk; } });
            var rn = runs.splice(bR, 1)[0], pts = rn.closed ? rotateTo(rn.pts, fromR).concat([null]) : rn.pts.slice();
            if (rn.closed) pts[pts.length - 1] = pts[0];
            moves.push({g: 0, z: entered ? clear : o.safeZ});
            moves.push({g: 0, x: pts[0][0], y: pts[0][1]});
            moves.push({g: 0, z: prevZ + 0.5 < clear ? prevZ + 0.5 : clear});
            moves.push({g: 1, z: prevZ, f: o.plunge});
            rampOn(pts[0], pts[1], prevZ, z);
            entered = true;
            for (var kr = 1; kr < pts.length; kr++) moves.push({g: 1, x: pts[kr][0], y: pts[kr][1], z: z, f: o.feed});
            here = pts[pts.length - 1];
          }
        }
        moves.push({g: 0, z: clear});
        continue;
      }
      if (raster){
        var todo = rasterSegs.slice();
        while (todo.length){
          var from0 = here || todo[0][0], bi0 = 0, bd0 = Infinity, flip = false;
          todo.forEach(function (sg, k) {
            var d0 = G.dist(from0[0], from0[1], sg[0][0], sg[0][1]), d1 = G.dist(from0[0], from0[1], sg[1][0], sg[1][1]);
            if (d0 < bd0){ bd0 = d0; bi0 = k; flip = false; }
            if (d1 < bd0){ bd0 = d1; bi0 = k; flip = true; }
          });
          var sgm = todo.splice(bi0, 1)[0], a0 = flip ? sgm[1] : sgm[0], b0 = flip ? sgm[0] : sgm[1];
          if (entered && here && linkInside(here, a0)) moves.push({g: 1, x: a0[0], y: a0[1], z: z, f: o.feed});
          else {
            moves.push({g: 0, z: entered ? clear : o.safeZ});
            moves.push({g: 0, x: a0[0], y: a0[1]});
            moves.push({g: 0, z: prevZ + 0.5 < clear ? prevZ + 0.5 : clear});
            moves.push({g: 1, z: prevZ, f: o.plunge});
            rampOn(a0, b0, prevZ, z);
            entered = true;
          }
          moves.push({g: 1, x: b0[0], y: b0[1], z: z, f: o.feed});
          here = b0;
        }
      }
      for (var li = raster ? 0 : levels.length - 1; li >= 0; li--){  // middle first, wall last (raster: just the wall)
        var rings = ringsByLevel[li].slice();
        while (rings.length){
          var from = here || rings[0][0], bi2 = 0, bd2 = Infinity;
          rings.forEach(function (rg, k3) { var q = rotateTo(rg, from)[0], d3 = G.dist(from[0], from[1], q[0], q[1]); if (d3 < bd2){ bd2 = d3; bi2 = k3; } });
          var ring = rotateTo(rings.splice(bi2, 1)[0], from);
          ring.push(ring[0]);                             // close it
          var start = ring[0];
          if (entered && here && linkInside(here, start)){
            moves.push({g: 1, x: start[0], y: start[1], z: z, f: o.feed});
          } else {
            // lift, move over, and ramp back down along the ring from the depth already cleared
            moves.push({g: 0, z: entered ? clear : o.safeZ});
            moves.push({g: 0, x: start[0], y: start[1]});
            moves.push({g: 0, z: prevZ + 0.5 < clear ? prevZ + 0.5 : clear});
            var rampLen = o.ramp && o.ramp.length > 0 ? o.ramp.length : 0, run = 0, rampEnd = 0;
            if (rampLen > 0){
              for (var k4 = 1; k4 < ring.length && run < rampLen; k4++){
                run += G.dist(ring[k4 - 1][0], ring[k4 - 1][1], ring[k4][0], ring[k4][1]);
                var f4 = Math.min(1, run / rampLen);
                moves.push({g: 1, x: ring[k4][0], y: ring[k4][1], z: prevZ + (z - prevZ) * f4, f: o.plunge});
                rampEnd = k4;
              }
              if (run < rampLen){ moves.push({g: 1, z: z, f: o.plunge}); rampEnd = ring.length - 1; }  // ring shorter than the ramp
            } else moves.push({g: 1, z: z, f: o.plunge});
            entered = true;
            // on round from where the ramp ended, then over the ramped stretch again at full depth,
            // following the ring rather than cutting straight back across it
            for (var k6 = rampEnd + 1; k6 < ring.length; k6++) moves.push({g: 1, x: ring[k6][0], y: ring[k6][1], z: z, f: o.feed});
            for (var k7 = 1; k7 <= rampEnd && k7 < ring.length; k7++) moves.push({g: 1, x: ring[k7][0], y: ring[k7][1], z: z, f: o.feed});
            here = ring[Math.min(rampEnd, ring.length - 1)];
            continue;
          }
          for (var k5 = 1; k5 < ring.length; k5++) moves.push({g: 1, x: ring[k5][0], y: ring[k5][1], z: z, f: o.feed});
          here = ring[ring.length - 1];
        }
      }
      moves.push({g: 0, z: clear});
    }
    // the finishing pass: round the true walls once, at full depth, into the already-cleared pocket
    if (allow > 0 && o.finishPass){
      var zf = o.z0 - o.depth;
      G.isoLoops(F, r + tol).map(function (l) { return prepare(l, r + tol); }).filter(Boolean).forEach(function (ring) {
        var rg = here ? rotateTo(ring, here) : ring;
        rg = rg.concat([rg[0]]);
        moves.push({g: 0, z: clear});
        moves.push({g: 0, x: rg[0][0], y: rg[0][1]});
        moves.push({g: 1, z: zf, f: o.plunge});
        for (var kf = 1; kf < rg.length; kf++) moves.push({g: 1, x: rg[kf][0], y: rg[kf][1], z: zf, f: o.feed});
        here = rg[rg.length - 1];
      });
      moves.push({g: 0, z: clear});
    }
    moves.push({g: 0, z: o.safeZ});
    return {moves: moves, rings: raster ? ringsByLevel[0].length : ringCount, rasterLines: rasterSegs.length, passes: passes, depth: o.depth, levels: levels.length, maxDepthInside: maxD,
            restRuns: restRuns ? restRuns.reduce(function (s3, a3) { return s3 + a3.length; }, 0) : undefined, restLeft: restRuns ? restLeft * res * res : undefined};
  }

  // ---- V-carving -------------------------------------------------------
  // A V-bit's tip follows the centre-line of the shape: wherever the shape is W wide, the tip
  // sits W/2 from both edges at a depth of (W/2) / tan(half angle), so the cone's sides just
  // touch the outline. Found the way F-Engrave does it: walk every outline in small steps; at
  // each, the largest circle touching the outline there and staying inside the shape has its
  // centre on the centre-line and its radius sets the depth. Walking in order keeps the path
  // continuous, and sharp corners come out sharp (the circle shrinks to nothing into them).
  //
  // opts: loops (closed; the shape is everything inside an odd number of them, so letters with
  //       holes just work), angle (the bit's included angle, degrees), maxDepth (optional cap:
  //       beyond it the floor is flat and the middle is left for a clearing pass), passDepth,
  //       z0, safeZ, feed, plunge, step (how finely the outline is walked, mm)
  function vcarve(opts){
    var o = Object.assign({angle: 60, tip: 0, maxDepth: 0, startDepth: 0, passDepth: 0, z0: 0, safeZ: 5, feed: 1000, plunge: 400, step: 0.15}, opts);
    // startDepth: the carve begins this far below the surface, so the walls meet the outline at that
    // depth rather than at the surface. It's what makes an inlay plug wedge into its pocket.
    var sd = o.startDepth > 0 ? o.startDepth : 0;
    var tanH = Math.tan(o.angle / 2 * Math.PI / 180), halfTip = Math.max(0, o.tip || 0) / 2;
    var loops = o.loops.map(function (l) { return G.clean(l); }).filter(function (l) { return l.length > 2; });
    if (!loops.length) return {moves: [], warning: 'nothing to carve: pick closed shapes'};
    // Each outline runs with the shape on its left: nesting depth decides which way that is.
    loops = loops.map(function (l, i) {
      var depth = 0;
      loops.forEach(function (m, j) { if (i !== j && G.pointInLoop(l[0][0], l[0][1], m)) depth++; });
      return depth % 2 === 0 ? G.ensureCCW(l) : G.ensureCW(l);
    });
    var idx = loops.map(function (l) { return G.pathIndex(l, true); });
    var span = 0;
    loops.forEach(function (l) { l.forEach(function (p) { span = Math.max(span, Math.abs(p[0]), Math.abs(p[1])); }); });
    // a flat tip starts the cone half its width out: the cone reaches radius r at depth (r - tip/2) / tan
    var rCap = o.maxDepth > 0 ? halfTip + Math.max(0, o.maxDepth - sd) * tanH : Infinity, rLimit = Math.min(rCap, 4 * span + 10);
    function nearest(x, y, cap){
      var best = Infinity;
      for (var t = 0; t < idx.length; t++){ var d = idx[t].dist(x, y, cap); if (d < best) best = d; }
      return best;
    }
    // the largest circle touching the outline at p, grown along the inward normal (nx, ny)
    var tol = 0.002;
    function inscribed(px, py, nx, ny){
      var lo = 0, hi = rLimit;
      if (nearest(px + nx * hi, py + ny * hi, hi + 1) >= hi - tol) return hi;
      for (var it = 0; it < 32 && hi - lo > 1e-4; it++){
        var mid = (lo + hi) / 2;
        if (nearest(px + nx * mid, py + ny * mid, mid + 1) >= mid - tol) lo = mid; else hi = mid;
      }
      return lo;
    }
    var paths = [], flatHit = false, deepest = 0;
    loops.forEach(function (l) {
      var n = l.length, pts = [];
      function push(x, y, r){
        if (r >= rCap - 1e-6) flatHit = true;
        var z = -(sd + Math.max(0, r - halfTip) / tanH); if (z < deepest) deepest = z;   // narrower than the tip: at the start depth
        pts.push([x, y, z]);
      }
      for (var i = 0; i < n; i++){
        var a = l[i], b = l[(i + 1) % n], pv = l[(i - 1 + n) % n];
        var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;       // left normal: into the shape
        // at the vertex: a convex corner comes to a point (depth 0); a reflex one fans the circle round it
        var ix = a[0] - pv[0], iy = a[1] - pv[1], il = Math.hypot(ix, iy) || 1;
        ix /= il; iy /= il;
        var turn = ix * uy - iy * ux;                               // > 0: left turn = convex corner
        if (turn > 1e-6) push(a[0], a[1], 0);
        else if (turn < -1e-6){
          var a0 = Math.atan2(ix, -iy), a1 = Math.atan2(ux, -uy);   // normals before and after
          var da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          var k = Math.max(1, Math.ceil(Math.abs(da) / (8 * Math.PI / 180)));
          for (var q = 0; q <= k; q++){
            var an = a0 + da * q / k, fx = Math.cos(an), fy = Math.sin(an);
            var rr = inscribed(a[0], a[1], fx, fy);
            push(a[0] + fx * rr, a[1] + fy * rr, rr);
          }
        }
        // along the edge
        var steps = Math.max(1, Math.ceil(len / o.step));
        for (var sI = 1; sI < steps; sI++){
          var t = sI / steps, px = a[0] + dx * t, py = a[1] + dy * t;
          var r = inscribed(px, py, nx, ny);
          push(px + nx * r, py + ny * r, r);
        }
      }
      if (pts.length) pts.push(pts[0].slice());                    // round to the start
      paths.push(simplify3(pts, 0.004));
    });
    // passes: the same paths, each level no deeper than its share of the depth
    var levels = [];
    var total = -deepest;
    if (o.passDepth > 0 && total > o.passDepth + 1e-6){
      for (var d = o.passDepth; d < total - 1e-6; d += o.passDepth) levels.push(-d);
    }
    levels.push(-Infinity);                                         // the final, full-depth pass
    var moves = [{g: 0, z: o.safeZ}];
    levels.forEach(function (floor) {
      paths.forEach(function (pts) {
        if (!pts.length) return;
        var first = pts[0];
        moves.push({g: 0, z: o.safeZ});
        moves.push({g: 0, x: first[0], y: first[1]});
        moves.push({g: 0, z: o.z0 + 0.5});
        moves.push({g: 1, z: o.z0 + Math.max(first[2], floor), f: o.plunge});
        for (var k2 = 1; k2 < pts.length; k2++)
          moves.push({g: 1, x: pts[k2][0], y: pts[k2][1], z: o.z0 + Math.max(pts[k2][2], floor), f: o.feed});
      });
    });
    moves.push({g: 0, z: o.safeZ});
    return {moves: moves, depth: total, flatCapped: flatHit, passes: levels.length, paths: paths.length,
            warning: flatHit ? 'wider parts reach the maximum depth and have a flat floor: the middle of those needs a clearing toolpath' : null};
  }
  // drop points that lie on a straight line (in 3D) between their neighbours, within tol
  function simplify3(pts, tol){
    if (pts.length < 3) return pts;
    var keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    (function rdp(a, b){
      var A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L2 = dx*dx + dy*dy + dz*dz, md = -1, mi = -1;
      for (var i = a + 1; i < b; i++){
        var P = pts[i], t = L2 > 0 ? ((P[0]-A[0])*dx + (P[1]-A[1])*dy + (P[2]-A[2])*dz) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        var ex = A[0] + dx*t - P[0], ey = A[1] + dy*t - P[1], ez = A[2] + dz*t - P[2], d = Math.sqrt(ex*ex + ey*ey + ez*ez);
        if (d > md){ md = d; mi = i; }
      }
      if (md > tol){ keep[mi] = 1; rdp(a, mi); rdp(mi, b); }
    })(0, pts.length - 1);
    return pts.filter(function (_, i) { return keep[i]; });
  }

  // ---- drilling --------------------------------------------------------
  // GRBL has no drilling cycles (no G81/G83), so pecking is written out move by move: feed down
  // one peck, retract to clear the chips, rapid back to just above the depth already reached,
  // and go again.
  //
  // opts: points [[x,y],...], depth (positive), z0, safeZ, retract (height above z0 to come up
  //       to between pecks), peck (0 = one plunge), feed (the plunge rate), dwell (seconds at the
  //       bottom, 0 = none)
  function drill(opts){
    var o = Object.assign({depth: 3, z0: 0, safeZ: 5, retract: 1, peck: 0, feed: 200, dwell: 0}, opts);
    var pts = orderNearest(o.points || [], [0, 0]);
    var bottom = o.z0 - o.depth, top = o.z0 + o.retract, moves = [];
    var clearance = 0.3;                                // stop this far above the last depth before feeding again
    moves.push({g: 0, z: o.safeZ});
    pts.forEach(function (p) {
      moves.push({g: 0, x: p[0], y: p[1]});
      moves.push({g: 0, z: top});
      if (o.peck > 0 && o.peck < o.depth){
        var reached = o.z0;
        while (reached > bottom + 1e-9){
          var next = Math.max(bottom, reached - o.peck);
          moves.push({g: 1, z: next, f: o.feed});
          reached = next;
          if (reached > bottom + 1e-9){
            moves.push({g: 0, z: top});                   // clear the chips
            moves.push({g: 0, z: Math.min(top, reached + clearance)});
          }
        }
      } else {
        moves.push({g: 1, z: bottom, f: o.feed});
      }
      if (o.dwell > 0) moves.push({dwell: o.dwell});
      moves.push({g: 0, z: o.safeZ});
    });
    return {moves: moves, holes: pts.length, depth: o.depth};
  }
  // Visit points in a sensible order: always the nearest one not yet drilled.
  function orderNearest(points, from){
    var left = points.map(function (p) { return [p[0], p[1]]; }), out = [], cur = from || [0, 0];
    while (left.length){
      var bi = 0, bd = Infinity;
      for (var i = 0; i < left.length; i++){
        var d = G.dist(cur[0], cur[1], left[i][0], left[i][1]);
        if (d < bd){ bd = d; bi = i; }
      }
      cur = left.splice(bi, 1)[0];
      out.push(cur);
    }
    return out;
  }

  // ---- G-code ----------------------------------------------------------
  // Writes what 454 Control expects: millimetres, absolute, explicit spindle,
  // no canned cycles, no arcs (the toolpath is already flattened).
  function toGcode(result, opts){                    // one toolpath: kept for simple callers
    var o = Object.assign({rpm: 18000, tool: 1, name: 'profile', safeZ: 5}, opts);
    return toGcodeJob([{moves: result.moves, name: o.name, tool: o.tool, toolName: o.toolName, rpm: o.rpm}], o);
  }
  // A whole job: toolpaths in order, each with its own tool. A tool change is written only when
  // the tool actually changes, and each toolpath is named in a comment so 454 Control can show it.
  function toGcodeJob(parts, opts){
    var o = Object.assign({safeZ: 5, precision: 3}, opts);
    var out = [], last = {x: null, y: null, z: null, f: null, g: null}, tool = null, rpm = null;
    function num(v){
      var t = (+v).toFixed(o.precision);
      if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
      return t === '-0' ? '0' : t;
    }
    out.push('(454 CAM)');
    (o.notes || []).forEach(function (t) { out.push(';' + t); });   // assumptions worth seeing at the machine
    // Which bit each tool number is, as VCarve lists them: 454 Control reads this and names the bit at the start
    // and at each tool change ("Insert T2: 6.35 mm cutter"). Semicolon comments: a tool's name may have brackets.
    var listed = {}, toolList = [];
    parts.forEach(function (part) { if (part.tool !== undefined && !listed[part.tool]){ listed[part.tool] = 1; toolList.push(part); } });
    if (toolList.length){
      out.push(';Tools used in this file:');
      toolList.forEach(function (part) { out.push(';' + part.tool + ' = ' + (part.toolName || 'tool ' + part.tool)); });
    }
    out.push('G21');                                    // millimetres
    out.push('G90');                                    // absolute
    out.push('G17');
    parts.forEach(function (part) {
      if (part.tool !== tool){
        if (tool !== null){ out.push('G0 Z' + num(o.safeZ)); out.push('M5'); }
        out.push(';Toolpath: ' + part.name);
        if (part.toolName) out.push(';Tool: ' + part.toolName);
        out.push('M6 T' + part.tool);
        tool = part.tool; rpm = null;
        last = {x: null, y: null, z: null, f: null, g: null};  // position is unknown after a change
      } else {
        out.push(';Toolpath: ' + part.name);
        if (part.toolName) out.push(';Tool: ' + part.toolName);
      }
      if (part.rpm !== rpm){ out.push('M3 S' + part.rpm); rpm = part.rpm; }
      part.moves.forEach(function (m) {
        if (m.dwell){ out.push('G4 P' + num(m.dwell)); return; }
        var bits = [];
        var g = m.g === 0 ? 'G0' : 'G1';
        if (g !== last.g){ bits.push(g); last.g = g; }
        if (m.x !== undefined && m.x !== last.x){ bits.push('X' + num(m.x)); last.x = m.x; }
        if (m.y !== undefined && m.y !== last.y){ bits.push('Y' + num(m.y)); last.y = m.y; }
        if (m.z !== undefined && m.z !== last.z){ bits.push('Z' + num(m.z)); last.z = m.z; }
        if (m.g === 1 && m.f !== undefined && m.f !== last.f){ bits.push('F' + num(m.f)); last.f = m.f; }
        if (bits.length > (g === last.g && bits[0] === g ? 1 : 0)) out.push(bits.join(''));
      });
    });
    out.push('G0 Z' + num(o.safeZ));
    out.push('M5');
    out.push('M30');
    return out.join('\n') + '\n';
  }

  return {profile: profile, pocket: pocket, vcarve: vcarve, drill: drill, orderNearest: orderNearest, toGcode: toGcode, toGcodeJob: toGcodeJob, loopLength: loopLength, orient: orient,
          distanceAlong: distanceAlong, evenTabPoints: evenTabPoints, pointAt: pointAt};
});
