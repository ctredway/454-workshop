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
  //   tabs      {count, length, thickness} or null
  //   ramp      {length} to lead into each pass, or null for a straight plunge
  function profile(opts){
    var o = Object.assign({
      side: 'outside', toolDia: 3.175, depth: 3, z0: 0, passDepth: 1,
      climb: true, safeZ: 5, feed: 800, plunge: 300, stepFinal: 0,
      tabs: null, ramp: null
    }, opts);

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

    loops.forEach(function (raw) {
      var loop = orient(raw, o.side, o.climb);
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
      moves.push({g: 0, z: o.safeZ});
      moves.push({g: 0, x: start[0], y: start[1]});

      for (var p = 1; p <= passes; p++){
        var z = o.z0 - Math.min(o.depth, o.passDepth * p);
        var prevZ = o.z0 - Math.min(o.depth, o.passDepth * (p - 1));
        var tabZ = o.tabs ? o.z0 - Math.max(0, o.depth - o.tabs.thickness) : -Infinity;
        var cutTabs = !!(o.tabs && tabAt.length && z < tabZ - 1e-9);
        var rampLen = o.ramp && o.ramp.length > 0 ? Math.min(o.ramp.length, L) : 0;

        // everywhere the path has to be cut: tab edges, the end of the ramp, and enough points
        // along the ramp for it to be a ramp rather than one long move
        var extra = [];
        if (cutTabs) tabAt.forEach(function (c) { extra.push(c - o.tabs.length / 2); extra.push(c + o.tabs.length / 2); });
        if (rampLen > 0) extra.push(rampLen);
        var stations = passStations(loop, extra, rampLen > 0 ? Math.max(0.5, rampLen / 12) : 0);

        function inTabAt(dist){
          if (!cutTabs) return false;
          for (var ti = 0; ti < tabAt.length; ti++){
            var half = o.tabs.length / 2, c = tabAt[ti];
            var dd = Math.min(Math.abs(dist - c), Math.abs(dist - c - L), Math.abs(dist - c + L));
            if (dd <= half - 1e-9) return true;
          }
          return false;
        }

        if (rampLen === 0) moves.push({g: 1, z: z, f: o.plunge});
        for (var si = 1; si < stations.length; si++){
          var d0 = stations[si], pt = pointAt(loop, d0);
          var zHere;
          if (rampLen > 0 && d0 < rampLen - 1e-9) zHere = prevZ + (z - prevZ) * (d0 / rampLen);
          else zHere = inTabAt((stations[si] + stations[si - 1]) / 2) ? tabZ : z;
          moves.push({g: 1, x: pt[0], y: pt[1], z: zHere, f: (rampLen > 0 && d0 <= rampLen) ? o.plunge : o.feed});
        }
        // The ramp cut its stretch on a slope, so go round past the start and cut that stretch
        // again at full depth. Without this a through-cut leaves a sloping web holding the part.
        if (rampLen > 0){
          for (var so = 1; so < stations.length && stations[so - 1] < rampLen - 1e-9; so++){
            var dd2 = stations[so], pp2 = pointAt(loop, dd2);
            var zz2 = inTabAt((stations[so] + stations[so - 1]) / 2) ? tabZ : z;
            moves.push({g: 1, x: pp2[0], y: pp2[1], z: zz2, f: o.feed});
          }
        }
      }
      moves.push({g: 0, z: o.safeZ});
    });

    return {
      moves: moves, loops: loops.length, passes: passes,
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
  //       climb, ramp {length}
  function pocket(opts){
    var o = Object.assign({islands: [], toolDia: 3.175, stepover: 1.2, depth: 3, passDepth: 1, z0: 0,
                           safeZ: 5, feed: 800, plunge: 300, climb: true, ramp: {length: 8}}, opts);
    var r = o.toolDia / 2, step = Math.min(o.stepover, o.toolDia * 0.95);
    var bounds = [G.ensureCCW(G.clean(o.outline))].concat(o.islands.map(function (l) { return G.ensureCW(G.clean(l)); }));
    var res = Math.max(0.03, Math.min(0.1, step / 6));
    var F = G.distanceField(bounds, res, r);
    var maxD = 0;
    for (var i = 0; i < F.d.length; i++) if (F.d[i] > maxD) maxD = F.d[i];
    if (maxD < r + (o.tolerance === undefined ? 0.01 : o.tolerance)) return {moves: [], warning: 'the cutter is too big for this pocket', rings: 0};

    // Levels from the wall pass inward; a last small ring if the middle would otherwise be missed.
    // The wall ring sits the flattening tolerance further out than the radius: curves arrive as
    // straight segments that fall short of the true curve by up to that much, and the cutter
    // must clear the true curve, not the flats.
    var tol = o.tolerance === undefined ? 0.01 : o.tolerance;
    var levels = [r + tol];
    for (var L = r + tol + step; L < maxD - res; L += step) levels.push(L);
    var last = levels[levels.length - 1];
    if (maxD - last > r * 0.75) levels.push(Math.max(r + tol, maxD - r * 0.5));

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
    var ringCount = ringsByLevel.reduce(function (s2, a2) { return s2 + a2.length; }, 0);

    var moves = [], passes = Math.max(1, Math.ceil(o.depth / o.passDepth)), here = null;
    var clear = o.z0 + 1;                               // just above the surface, for short hops
    moves.push({g: 0, z: o.safeZ});
    function rotateTo(loop, p){                         // start the ring where we already are
      var bi = 0, bd = Infinity;
      for (var i2 = 0; i2 < loop.length; i2++){ var d2 = G.dist(p[0], p[1], loop[i2][0], loop[i2][1]); if (d2 < bd){ bd = d2; bi = i2; } }
      return loop.slice(bi).concat(loop.slice(0, bi));
    }
    function linkInside(a, b){                          // can the cutter feed straight across?
      if (G.dist(a[0], a[1], b[0], b[1]) > o.toolDia * 1.2) return false;
      for (var t = 0; t <= 1; t += 0.1) if (sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < r - res) return false;
      return true;
    }
    for (var p = 1; p <= passes; p++){
      var z = o.z0 - Math.min(o.depth, o.passDepth * p), prevZ = o.z0 - Math.min(o.depth, o.passDepth * (p - 1));
      var entered = false;
      for (var li = levels.length - 1; li >= 0; li--){  // middle first, wall last
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
    moves.push({g: 0, z: o.safeZ});
    return {moves: moves, rings: ringCount, passes: passes, depth: o.depth, levels: levels.length, maxDepthInside: maxD};
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

  return {profile: profile, pocket: pocket, drill: drill, orderNearest: orderNearest, toGcode: toGcode, toGcodeJob: toGcodeJob, loopLength: loopLength, orient: orient,
          distanceAlong: distanceAlong, evenTabPoints: evenTabPoints, pointAt: pointAt};
});
