// Pocket groups: each outermost outline, with every picked shape inside it as an island. Shapes
// inside an island are pockets again; the distance field works that out by itself, so they simply
// go along with their outermost outline.
function tpPocketGroups(ids){
  var outs = tpOutlinesById(ids);
  var inside = outs.map(function () { return 0; });
  outs.forEach(function (a, i) {
    outs.forEach(function (b, j) {
      if (i === j) return;
      var p = a.loop[0];
      if (Geom.pointInLoop(p[0], p[1], b.loop) && Math.abs(Geom.area(b.loop)) > Math.abs(Geom.area(a.loop))) inside[i]++;
    });
  });
  var groups = [];
  outs.forEach(function (o, i) {
    if (inside[i] !== 0) return;
    var g = {outline: o.loop, islands: [], ids: [o.id]};
    outs.forEach(function (q, j) {
      if (j === i || inside[j] === 0) return;
      if (Geom.pointInLoop(q.loop[0][0], q.loop[0][1], o.loop)){ g.islands.push(q.loop); g.ids.push(q.id); }
    });
    groups.push(g);
  });
  return groups;
}
// Drill positions: the centre of each circle, or the middle of any other closed shape. Also how
// big each one is, so a drill that doesn't match the holes drawn can be pointed out.
function tpDrillPoints(ids){
  var out = [];
  ids.forEach(function (id) {
    var e = entById(id);
    if (!e) return;
    if (e.t === 'circle'){ out.push({p: [e.cx, e.cy], dia: e.r * 2, id: id}); return; }
    var o = tpOutlinesById([id])[0];
    if (!o) return;
    var xs = o.loop.map(function (q) { return q[0]; }), ys = o.loop.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    out.push({p: [(x0 + x1) / 2, (y0 + y1) / 2], dia: Math.min(x1 - x0, y1 - y0), id: id});
  });
  return out;
}
// Tabs live on the drawn outline, one list per shape, so they stay put when the cutter changes.
// Toolpaths saved before tabs were placed by hand only had a count: give those their tabs once.
function tpEnsureTabs(tp){
  if (!tp.tabsOn || tp.tabPts) return;
  tp.tabPts = {};
  tpOutlinesById(tp.ents).forEach(function (o) { tp.tabPts[o.id] = Cam.evenTabPoints(o.loop, tp.tabCount || 4); });
}
// The "add evenly" helper: adds to what is there, one batch per shape.
function tpAddEvenTabs(tp, n){
  tp.tabPts = tp.tabPts || {};
  tpOutlinesById(tp.ents).forEach(function (o) {
    tp.tabPts[o.id] = (tp.tabPts[o.id] || []).concat(Cam.evenTabPoints(o.loop, n));
  });
}
function tpTabTotal(tp){
  var n = 0;
  if (tp.tabPts) tp.ents.forEach(function (id) { n += (tp.tabPts[id] || []).length; });
  return n;
}

// How a profile or pocket enters the material on each pass: a ramp, sloping down along the cut over this
// length, or 0 for a straight plunge (Ramp off). No length set means 4 times the cutter's diameter, at least
// 4 mm, and follows the cutter. Toolpaths saved before the setting existed ramp, as they always did.
function tpRampDefault(tp){ return Math.max(4, (tp.dia || 0) * 4); }
function tpRamp(tp){ return tp.rampOff ? 0 : (tp.rampLen > 0 ? tp.rampLen : tpRampDefault(tp)); }

// Build (or rebuild) the moves for one toolpath, then check how deep they really go (tpPastMaterial): every
// toolpath that's made or recalculated is checked, however its depth was set.
function tpGenerate(tp){
  tpGenerateMoves(tp);
  tp.past = camReady() ? tpPastMaterial(tp) : null;
  tpGenerate.last = tp;                                   // the editor reads its preview's depth from this
  return tp;
}
// How far below the bottom of the material the moves go, from the deepest point actually cut (so it's right for
// every kind of toolpath: a pocket's floor, a V-carve's deepest V, a drill's tip, a ramp): null if they stay in
// the material, or go through it only by the overcut a through cut asks for. {depth, past, t} in mm, where depth
// is below the top of the material. Also null when the material's thickness isn't set: there's nothing to check
// against (tpDepthUnchecked says so).
function tpPastMaterial(tp){
  if (!(DOC.stock && DOC.stock.t > 0) || !tp.moves) return null;
  var z = 0, deepest = Infinity;
  tp.moves.forEach(function (m) { if (m.z !== undefined) z = m.z; if (m.g === 1 && z < deepest) deepest = z; });
  if (!isFinite(deepest)) return null;
  var top = tpSurface(), bottom = top - DOC.stock.t, past = bottom - deepest;
  if (past <= 1e-3) return null;
  if (tp.through && past <= (tp.over === undefined ? 0.2 : tp.over) + 1e-3) return null;   // the overcut, on purpose
  return {depth: top - deepest, past: past, t: DOC.stock.t};
}
// The check now, from the toolpath's moves and the material as it is now: read fresh every time, because a
// change of thickness doesn't always change the moves (a pocket with Z zero on top), so a stored answer goes stale.
function tpPastNow(tp){ if (camReady() && tp.moves && tpStale(tp)) tpGenerate(tp); return (tp.past = camReady() ? tpPastMaterial(tp) : null); }
// What to say about it: "goes 15.00 mm deep: through the 12.00 mm material and 3.00 mm into the spoilboard"
function tpPastSay(tp){
  var p = tp.past; if (!p) return '';
  return 'goes ' + fmtDisp(p.depth) + ' ' + unitTag() + ' deep: through the ' + fmtDisp(p.t) + ' ' + unitTag() + ' material and ' +
         fmtDisp(p.past) + ' ' + unitTag() + ' into the spoilboard' +
         (tp.side === 'vcarve' ? '. Set a max depth' : tp.through ? ', more than the overcut' : '. Tick Through if that’s meant');
}
// After a change that can move depths (the material's thickness, a parameter): recalculate what it touched, and
// name every toolpath that now goes past the material and didn't before. before: tpPastIds() from before the change.
function tpPastIds(){ return tpList().filter(function (tp) { return tpPastNow(tp); }).map(function (tp) { return tp.id; }); }
function tpPastNotice(before){
  if (!camReady()) return [];
  var now = tpList().filter(function (tp) { return tpPastNow(tp) && before.indexOf(tp.id) < 0; });
  if (now.length) toast('warn', now.length === 1 ? now[0].name + ' now cuts past the material' : now.length + ' toolpaths now cut past the material',
                        now.slice(0, 4).map(function (tp) { return tp.name + ' ' + tpPastSay(tp) + '.'; }).join(' '));
  return now;
}
// Toolpaths whose depth can't be checked: the material's thickness isn't set (through cuts already refuse)
function tpDepthUnchecked(){ return !(DOC.stock && DOC.stock.t > 0); }
function tpGenerateMoves(tp){
  if (!camReady()) return tp;
  if (tp.side === 'pocket'){
    var groups = tpPocketGroups(tp.ents), pm = [], warnP = null, rings = 0; tp.rasterLines = 0;
    var zs = tpSurface(), rs = tpRestSource(tp), restRuns = 0, vFor = tpClearsFor(tp), flArea = 0, flIn = 0;
    // a clean-up after a larger bit: where that bit's centre could go (its radius, the flattening tolerance,
    // and any allowance it left on the walls without a finishing pass)
    var rest = rs ? {toolDia: rs.dia, level: rs.dia / 2 + 0.01 + (rs.allowance > 0 && !rs.finishPass ? rs.allowance : 0)} : null;
    groups.forEach(function (g) {
      var pr = Cam.pocket({outline: g.outline, islands: g.islands, toolDia: tp.dia,
                           stepover: tp.dia * (tp.stepoverPct || 40) / 100, depth: tpDepth(tp), passDepth: tp.step,
                           strategy: tp.pocketClear === 'raster' ? 'raster' : 'offset', rasterAngle: tp.rasterAngle || 0,
                           allowance: tp.allowance || 0, finishPass: !!tp.finishPass,
                           z0: zs, safeZ: zs + (tp.safeZ || 6), feed: tp.feed, plunge: tp.plunge || Math.round(tp.feed / 2),
                           climb: tp.climb !== false, ramp: {length: tpRamp(tp)}, rest: rest, floorCheck: !!vFor});
      if (pr.warning) warnP = pr.warning;
      restRuns += pr.restRuns || 0;
      flArea += pr.floorLeft || 0; if (pr.floorLeftIn > flIn) flIn = pr.floorLeftIn;
      rings += pr.rings || 0; tp.rasterLines = (tp.rasterLines || 0) + (pr.rasterLines || 0);
      pr.moves.forEach(function (m) { pm.push(m); });
    });
    tp.moves = pm;
    tp.rings = rings;
    tp.islands = groups.reduce(function (s2, g) { return s2 + g.islands.length; }, 0);
    tp.warning = groups.length ? warnP : 'nothing to pocket: pick closed shapes';
    tp.restRuns = rs ? restRuns : undefined;
    tp.floorLeft = vFor ? tpFloorLeft(tp, vFor, flArea, flIn) : undefined;
    if (tp.floorLeft && (!tp.warning || (pm.length && tp.warning === 'the cutter is too big for this pocket'))) tp.warning = tpFloorSay(tp);
    if (!tp.warning && tp.restFrom) tp.warning = tpRestProblem(tp) || tpRestNote(tp) || null;
    tp.sig = tpSignature(tp.ents) + tpStockSig(tp);
    return tp;
  }
  if (tp.side === 'vcarve'){
    var vz = tpSurface();
    var vr = Cam.vcarve({loops: tpOutlinesById(tp.ents).map(function (o) { return o.loop; }), angle: tp.vAngle || 60, tip: tp.vTip || 0,
                         maxDepth: tp.vcMax > 0 ? tp.vcMax : 0, startDepth: tp.vcStart > 0 ? tp.vcStart : 0, passDepth: tp.step > 0 ? tp.step : 0,
                         z0: vz, safeZ: vz + (tp.safeZ || 6), feed: tp.feed, plunge: tp.plunge || Math.round(tp.feed / 2)});
    tp.moves = vr.moves; tp.vcDepth = vr.depth || 0; tp.vcFlat = !!vr.flatCapped;
    var widest = (tp.vTip || 0) + (vr.depth || 0) * 2 * Math.tan((tp.vAngle || 60) / 2 * Math.PI / 180);
    tp.warning = vr.warning && !vr.moves.length ? vr.warning : null;
    tp.vcNote = vr.moves.length ? {depth: vr.depth, widest: widest, flat: vr.flatCapped, passes: vr.passes, outlines: vr.paths} : null;
    // the cone at the surface is as wide as the widest part carved: a bit narrower than that can't do it
    // (carving through the material is checked for every toolpath, in tpGenerate)
    if (vr.moves.length && tp.dia > 0 && widest > tp.dia + 0.01)
      tp.warning = 'the carving is ' + fmtDisp(widest) + ' ' + unitTag() + ' across at its widest, more than this bit\u2019s ' + fmtDisp(tp.dia) + ' ' + unitTag() + ': set a max depth, or use a larger bit';
    tp.sig = tpSignature(tp.ents) + tpStockSig(tp);
    return tp;
  }
  if (tp.side === 'chamfer'){
    var cz = tpSurface(), cm = [], cd = tpChamferDepth(tp), tanH = Math.tan((tp.vAngle || 90) / 2 * Math.PI / 180);
    var cmode = tp.chamMode || 'edge';
    tpOutlinesById(tp.ents).forEach(function (o) {
      if (cmode === 'edge'){
        var cr = Cam.profile({outline: o.loop, side: 'on', toolDia: tp.dia, depth: cd, passDepth: tp.step, z0: cz,
                              safeZ: cz + (tp.safeZ || 6), feed: tp.feed, plunge: tp.plunge || Math.round(tp.feed / 2),
                              climb: tp.climb !== false, ramp: {length: tp.rampLen || Math.max(4, cd * 3)}});
        cr.moves.forEach(function (m) { cm.push(m); });
        return;
      }
      // the line is the bevel's top edge: each pass runs the tip in from the line by exactly the
      // width the cone reaches at that pass's depth, so the finished bevel meets the line
      var np = Math.max(1, Math.ceil(cd / tp.step));
      for (var pk = 1; pk <= np; pk++){
        var zk = Math.min(cd, tp.step * pk), off = zk * tanH;
        var loops = Geom.offsetLoop(o.loop, cmode === 'in' ? -off : off, {tol: 0.005});
        loops.forEach(function (lp) {
          var cr2 = Cam.profile({outline: lp, side: 'on', toolDia: tp.dia, depth: zk, passDepth: zk, z0: cz,
                                 safeZ: cz + (tp.safeZ || 6), feed: tp.feed, plunge: tp.plunge || Math.round(tp.feed / 2),
                                 climb: tp.climb !== false, ramp: {length: tp.rampLen || Math.max(4, zk * 3)}});
          cr2.moves.forEach(function (m) { cm.push(m); });
        });
      }
    });
    tp.moves = cm;
    var reach = tp.dia / 2;                               // the widest bevel the bit's cone can make
    tp.warning = !cm.length ? 'nothing to chamfer: pick closed shapes'
               : (tp.chamW > reach + 1e-6 ? 'the bevel is wider than this bit can cut (' + fmtDisp(reach) + ' ' + unitTag() + ' at most)' : null);
    tp.sig = tpSignature(tp.ents) + tpStockSig(tp);
    return tp;
  }
  if (tp.side === 'drill'){
    var holes = tpDrillPoints(tp.ents);
    var z0d = tpSurface();
    var dr = Cam.drill({points: holes.map(function (h) { return h.p; }), depth: tpDepth(tp), z0: z0d,
                        peck: tp.peck || 0, feed: tp.plunge || tp.feed, safeZ: z0d + (tp.safeZ || 6), retract: 1});
    tp.moves = dr.moves;
    tp.holes = holes.map(function (h) { return h.p; });
    tp.warning = holes.length ? null : 'nothing to drill: pick circles or closed shapes';
    tp.sig = tpSignature(tp.ents) + tpStockSig(tp);
    return tp;
  }
  var loops = tpOutlinesById(tp.ents);
  var moves = [], warn = null;
  if (tp.tabsOn === undefined) tp.tabsOn = tp.tabCount > 0;         // older toolpaths
  tpEnsureTabs(tp);
  var starts = tpStartLoops(tp, loops);
  loops.forEach(function (o, li) {
    var pts = tp.tabsOn && tp.tabPts ? tp.tabPts[o.id] : null;
    var res = Cam.profile({
      outline: o.loop, side: tp.side, toolDia: tp.dia, depth: tpDepth(tp), passDepth: tp.step, z0: tpSurface(),
      stepFinal: tp.allowance || 0, finishPass: !!tp.finishPass,
      lead: tp.leadType && tp.leadType !== 'none' ? {type: tp.leadType, size: tp.leadSize > 0 ? tp.leadSize : tp.dia} : null,
      feed: tp.feed, plunge: tp.plunge || Math.round(tp.feed / 2), climb: tp.climb !== false, safeZ: tpSurface() + (tp.safeZ || 6),
      tabs: tp.tabsOn && pts && pts.length ? {length: tp.tabLen || 4, thickness: tpTabHeight(tp), shape: tp.tabStyle === '3d' ? '3d' : 'flat', at: pts} : null,
      ramp: {length: tpRamp(tp)},
      startAt: starts[li] || null
    });
    if (res.warning) warn = res.warning;
    res.moves.forEach(function (m) { moves.push(m); });
  });
  tp.moves = moves;
  tp.warning = loops.length ? warn : 'nothing to cut: pick closed shapes';
  tp.sig = tpSignature(tp.ents) + tpStockSig(tp);
  return tp;
}
// Where each outline's cut starts, if one was chosen (tp.startPts: a point on a shape's outline, by the shape's
// id). A shape with several outlines (text, a shape with holes) starts there only on the outline nearest it.
function tpStartLoops(tp, loops){
  var out = [];
  if (!tp.startPts) return out;
  var near = {};                                          // for each shape: its outline nearest its start point
  loops.forEach(function (o, li) {
    var p = tp.startPts[o.id]; if (!p) return;
    var d = Infinity, n = o.loop.length;
    for (var k = 0; k < n; k++){
      var a = o.loop[k], b = o.loop[(k + 1) % n], q = Geom.closestOnSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
      d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    if (!near[o.id] || d < near[o.id].d) near[o.id] = {d: d, li: li};
  });
  Object.keys(near).forEach(function (id) { out[near[id].li] = tp.startPts[id]; });
  return out;
}
function tpStale(tp){ return tp.sig !== tpSignature(tp.ents) + tpStockSig(tp); }
// Depth is measured down from the top of the material. "Through" means the thickness plus a
// little extra, so the part comes free. Where Z zero is decides where the top of the material
// is in machine terms: at zero, or at the thickness when zero is the spoilboard.
// A tab's thickness is the material it leaves. The CAM engine measures it up from the bottom of the cut, so
// when a cut goes below the material (a through cut's overcut into the spoilboard, or a depth typed deeper
// than the material), the part below the material is added: otherwise a 0.5 mm tab on a through cut with the
// usual 0.2 mm overcut left only 0.3 mm of material.
function tpTabHeight(tp){
  var thk = tp.tabThk || 0.5, t = DOC.stock && DOC.stock.t > 0 ? DOC.stock.t : 0;
  return thk + (t > 0 ? Math.max(0, tpDepth(tp) - t) : 0);
}
// The V-carve a pocket clears the flat floor for (tp.clearFor), or null. It's looked for among the drawing's
// toolpaths, and any being made that aren't among them yet (tpClearsFor.also, set by whoever is making them).
function tpClearsFor(tp){
  if (!tp || tp.side !== 'pocket' || !tp.clearFor) return null;
  var v = tpList().concat(tpClearsFor.also || []).filter(function (x) { return x.id === tp.clearFor; })[0];
  return v && v.side === 'vcarve' ? v : null;
}
// Floor a V-carve's clearing pocket can't get to: the corners and the parts narrower than its cutter. The V-bit
// runs its point round the floor's edge and no further in, so what the cutter misses stays, sloping up from that
// edge at the V-bit's angle: `inBy` in from the edge it stands inBy / tan(half angle) above the floor (less a flat
// tip's half width), and never above the surface. Returns {area (mm2), high (mm)}, or null if it's nothing to
// speak of (under 0.1 mm high, or 0.25 mm2 in all).
function tpFloorLeft(tp, v, area, inBy){
  var tanH = Math.tan((v.vAngle || 60) / 2 * Math.PI / 180);
  var high = Math.min(tpDepth(tp), Math.max(0, inBy - (v.vTip || 0) / 2) / tanH);
  return area >= 0.25 && high >= 0.1 ? {area: +area.toFixed(2), high: +high.toFixed(3)} : null;
}
function tpFloorSay(tp){
  var f = tp.floorLeft; if (!f) return '';
  return 'this cutter can’t get into some corners or narrow parts, and the floor there is left up to ' + fmtDisp(f.high) + ' ' + unitTag() +
         ' high. The V-bit doesn’t flatten it: use a smaller cutter here, or pare it flat by hand before fitting an inlay';
}
// A pocket that cleans up after a larger bit's pocket (tp.restFrom): that pocket, if it can be cleaned up
// after (it's a pocket, on the same shapes, with a larger bit, and not itself a clean-up), or null.
function tpRestSource(tp){
  if (!tp || tp.side !== 'pocket' || !tp.restFrom) return null;
  var b = tpList().filter(function (x) { return x.id === tp.restFrom; })[0];
  if (!b || b.side !== 'pocket' || b.restFrom || !(b.dia > tp.dia)) return null;
  var same = function (a, c) { return a.slice().sort().join('|') === c.slice().sort().join('|'); };
  return same(b.ents, tp.ents) ? b : null;
}
// Why a clean-up can't follow its larger bit's pocket, in words, or '' if it can.
function tpRestProblem(tp){
  if (!tp || tp.side !== 'pocket' || !tp.restFrom) return '';
  var b = tpList().filter(function (x) { return x.id === tp.restFrom; })[0];
  if (!b || b.side !== 'pocket') return 'the larger bit\u2019s pocket it cleaned up after is gone, so this clears the whole pocket';
  if (b.restFrom) return '\u201c' + b.name + '\u201d is a clean-up itself, so this clears the whole pocket';
  if (!(b.dia > tp.dia)) return '\u201c' + b.name + '\u201d doesn\u2019t use a larger bit than this, so this clears the whole pocket';
  if (!tpRestSource(tp)) return '\u201c' + b.name + '\u201d is on different shapes, so this clears the whole pocket';
  return '';
}
// Worth saying about a working clean-up: its larger bit's pocket left out, or cut after it.
function tpRestNote(tp){
  var b = tpRestSource(tp);
  if (!b) return '';
  var list = tpList();
  if (b.exclude) return '\u201c' + b.name + '\u201d is unticked, so it won\u2019t be cut: this only cleans up after it';
  if (list.indexOf(tp) >= 0 && list.indexOf(b) > list.indexOf(tp)) return 'this runs before \u201c' + b.name + '\u201d: drag it below, so the larger bit goes first';
  return '';
}
function tpDepth(tp){
  var rs = tpRestSource(tp);
  if (rs) return tpDepth(rs);                           // a clean-up goes as deep as the pocket it follows
  if (tp.side === 'chamfer') return tpChamferDepth(tp);
  if (tp.side === 'vcarve') return tp.vcDepth || 0;
  if (tp.through) return (DOC.stock.t || 0) + (tp.over === undefined ? 0.2 : tp.over);
  return tp.depth > 0 ? tp.depth : 0;
}
// A V-bit's sides slope at half its included angle. With the tip running along the edge, the
// bevel on the top face is (tip depth) x tan(half angle) wide, so the depth follows from the
// width wanted: a 1.155 mm bevel with a 60 degree bit puts the tip 2 mm down.
function tpChamferDepth(tp){
  var half = (tp.vAngle || 90) / 2 * Math.PI / 180;
  return (tp.chamW || 1) / Math.tan(half);
}
function tpSurface(){ return DOC.stock.zero === 'bottom' ? (DOC.stock.t || 0) : 0; }
function tpStockSig(tp){                              // what makes a through-cut (or a clean-up) out of date
  var rs = tpRestSource(tp);
  return '|' + (tp.through ? 'thr' + (DOC.stock.t || 0) : '') + '|z' + (DOC.stock.zero || 'top') +
         (tp.restFrom ? '|r' + (rs ? [rs.id, rs.dia, tpDepth(rs), rs.allowance || 0, !!rs.finishPass, tpStockSig(rs)].join(',') : 'none:' + tpRestProblem(tp)) : '');
}

