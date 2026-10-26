/* ---------------- dimensions that follow their shapes ----------------
   Tools that remake a shape (Fillet and Trim turn a rectangle into an outline; Join, Explode and the booleans make new
   shapes from old) used to leave its dimensions measuring nothing: "5 dimensions lost their reference" (Clint's
   bookstand, 2026-10-23: three from a Trim, two from a Join), and "adding a fillet shouldn't negate a dimension".
   Each dimension remembers what it measures, as places in the drawing (DIM_GEO: the edges a width spans, a line, a
   circle, the two things a distance is between), refreshed whenever it's worked out. After a change (persist), one
   whose shape is gone, or is no longer the kind it measures, is moved onto whatever is there now: the same straight
   edge (on the same line, overlapping it) or the same circle. A rectangle's width or height becomes the distance
   between its two sides, on whatever outline they're part of now (kind 'pair' with a === b; typing a value stretches
   the outline). A line's length that's become an outline's edge becomes that edge's length (kind 'seg'). What can't be
   found is removed, and said. Toolpaths drop shapes that are gone, and say which. */
var DIM_GEO = typeof WeakMap === 'function' ? new WeakMap() : null;
var DIM_TOL = 0.01;                                     // mm: the same edge or circle, within this

// Straight edges of a shape, as [x1, y1, x2, y2]: a path's arcs aren't edges
function dimStraightEdges(e){
  if (!e) return [];
  if (e.t === 'path'){
    var out = [], m = e.pts.length, last = e.closed ? m : m - 1;
    for (var k = 0; k < last; k++){
      var p = e.pts[k], q = e.pts[(k + 1) % m];
      if (!(Math.abs(p[2] || 0) > 1e-9)) out.push([p[0], p[1], q[0], q[1]]);
    }
    return out;
  }
  return entityEdges(e);
}
// The straight edge of e nearest the point h, or null
function dimEdgeNear(e, h){
  var best = null, bd = Infinity;
  dimStraightEdges(e).forEach(function (ed){ var d = distToSeg(h.x, h.y, ed[0], ed[1], ed[2], ed[3]); if (d < bd){ bd = d; best = ed; } });
  return best;
}
// What a dimension measures, in the drawing's terms, while it can be worked out
function dimGeoKeep(d){
  if (!DIM_GEO) return;
  if (dimHintsStale(d)) return;                         // (what it measured is in DIM_GEO from before: kept, to find it again)
  if (d.kind === 'pair'){ dimHintStamp(entById(d.a), d.aAt); dimHintStamp(entById(d.b), d.bAt); }
  else if (d.kind === 'seg') dimHintStamp(entById(d.a), d.at);
  var g = null;
  if (d.kind === 'side'){
    var e = entById(d.a), s = rectSides(e), w = rectSideIsWidth(e, d.at), at = resolveHint(e, d.at) || repPoint(e);
    g = {k: 'across', A: w ? s.left : s.bottom, B: w ? s.right : s.top, p: [at.x, at.y]};
  } else if (d.kind === 'len'){
    var l = entById(d.a); g = {k: 'edge', A: [l.x1, l.y1, l.x2, l.y2]};
  } else if (d.kind === 'seg'){
    var eg = dimSegEdge(d); if (eg) g = {k: 'edge', A: eg};
  } else if (d.kind === 'dia' || d.kind === 'rad'){
    var c = entById(d.a); g = {k: 'circ', C: [c.cx, c.cy, c.r]};
  } else if (d.kind === 'pair'){
    var a = entById(d.a), b = entById(d.b);
    var side = function (e, other, h){
      if (e.t === 'circle' || e.t === 'arc') return {C: [e.cx, e.cy, e.r]};
      if (e.t === 'line') return {E: [e.x1, e.y1, e.x2, e.y2]};
      var p = resolveHint(e, h) || repPoint(other), ed = dimEdgeNear(e, p);
      return ed ? {E: ed, p: [p.x, p.y]} : null;
    };
    var ga = side(a, b, d.aAt), gb = side(b, a, d.bAt);
    if (ga && gb) g = {k: 'pair', a: ga, b: gb};
  }
  if (g) DIM_GEO.set(d, g);
}
// An outline's edge is remembered by its number and how far along (hintOf); Fillet corners, Trim or a node added or
// removed numbers the edges afresh, so a hint made with another number of points may now point at another edge. (Clint's
// filament stand, 2026-10-26: Fillet corners on a joined outline sent five distances to the wrong edges, or none.)
function dimHintStale(e, h){ return !!(e && h && h.seg !== undefined && h.n !== undefined && e.pts && e.pts.length !== h.n); }
function dimHintsStale(d){
  if (d.kind === 'pair') return dimHintStale(entById(d.a), d.aAt) || dimHintStale(entById(d.b), d.bAt);
  if (d.kind === 'seg') return dimHintStale(entById(d.a), d.at);
  return false;
}
// A hint made before hints knew their outline's number of points: stamped with it now, while it's right
function dimHintStamp(e, h){ if (e && e.pts && h && h.seg !== undefined && h.n === undefined) h.n = e.pts.length; }
// Is a dimension's shape there, and the kind it measures?
function dimRefOk(d){
  var a = entById(d.a);
  if (!a) return false;
  if (d.kind === 'side') return a.t === 'rect';
  if (d.kind === 'len') return a.t === 'line';
  if (d.kind === 'dia') return a.t === 'circle';
  if (d.kind === 'rad') return a.t === 'circle' || a.t === 'arc';
  if (d.kind === 'seg') return !!dimSegEdge(d);
  if (d.kind === 'pair') return !!entById(d.b);
  return true;
}
// A shape on this sheet with the same straight edge as A (on its line, overlapping it): {e, p} with p a point on the
// overlap, nearest near (or its middle); or null. prefer: ids tried first (the shape it was on, if it's still there)
function dimFindEdge(A, near, prefer){
  var L = Math.hypot(A[2] - A[0], A[3] - A[1]); if (L < 1e-9) return null;
  var ux = (A[2] - A[0]) / L, uy = (A[3] - A[1]) / L, best = null;
  var off = function (x, y){ return Math.abs((x - A[0]) * uy - (y - A[1]) * ux); }, along = function (x, y){ return (x - A[0]) * ux + (y - A[1]) * uy; };
  var ents = DOC.ents.filter(function (e){ return entOnSheet(e) && !e.con; });
  ents.sort(function (x, y){ return (prefer.indexOf(y._id) >= 0) - (prefer.indexOf(x._id) >= 0); });
  for (var i = 0; i < ents.length && !best; i++){
    dimStraightEdges(ents[i]).some(function (ed){
      if (off(ed[0], ed[1]) > DIM_TOL || off(ed[2], ed[3]) > DIM_TOL) return false;
      var t0 = along(ed[0], ed[1]), t1 = along(ed[2], ed[3]), lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(L, Math.max(t0, t1));
      if (hi - lo < DIM_TOL) return false;                             // on the line, but not where the edge was
      // nearest near, but in from the ends: an end is where a corner's arc starts, and could be taken for the arc
      var inset = (hi - lo) * 0.1, t = near ? Math.max(lo + inset, Math.min(hi - inset, along(near[0], near[1]))) : (lo + hi) / 2;
      best = {e: ents[i], p: {x: A[0] + ux * t, y: A[1] + uy * t}};
      return true;
    });
  }
  return best;
}
function dimFindCircle(C){
  return DOC.ents.filter(function (e){ return entOnSheet(e) && (e.t === 'circle' || e.t === 'arc') &&
    Math.hypot(e.cx - C[0], e.cy - C[1]) < DIM_TOL && Math.abs(e.r - C[2]) < DIM_TOL; })[0] || null;
}
// Move a dimension onto what's there now; true if it could be
function dimRetarget(d){
  var g = DIM_GEO && DIM_GEO.get(d);
  if (!g) return false;
  var prefer = [d.a, d.b].filter(Boolean);
  if (g.k === 'circ'){
    var c = dimFindCircle(g.C); if (!c) return false;
    d.a = entId(c); d.kind = c.t === 'arc' ? 'rad' : d.kind; return true;
  }
  if (g.k === 'edge'){
    var f = dimFindEdge(g.A, null, prefer); if (!f) return false;
    if (f.e.t === 'line'){ d.a = entId(f.e); d.kind = 'len'; delete d.at; return true; }
    d.a = entId(f.e); d.kind = 'seg'; d.at = hintOf(f.e, f.p);
    return !!dimSegEdge(d);
  }
  if (g.k === 'across'){                                             // a width or height: between its two sides, now
    var fa = dimFindEdge(g.A, g.p, prefer), fb = dimFindEdge(g.B, g.p, prefer);
    if (!fa || !fb) return false;
    var keep = {expr: d.expr, exprUnit: d.exprUnit, place: d.place};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) delete d[k];
    d.kind = 'pair'; d.a = entId(fa.e); d.b = entId(fb.e); d.edge = false; d.aAt = hintOf(fa.e, fa.p); d.bAt = hintOf(fb.e, fb.p);
    if (keep.expr){ d.expr = keep.expr; d.exprUnit = keep.exprUnit; }
    // drawn where it was: its line through the point on the side it was on (not where it now meets the sides, which
    // is in from the corners), its value slid along as it was
    var an = dimAnchor(d), L = an ? Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y) : 0;
    if (L > 1e-9){
      var ux = (an.b.x - an.a.x) / L, uy = (an.b.y - an.a.y) / L;
      d.place = {n: (g.p[0] - an.x) * -uy + (g.p[1] - an.y) * ux, s: keep.place && keep.place.s || 0};
    }
    return true;
  }
  if (g.k === 'pair'){
    var find = function (s){
      if (s.C){ var cc = dimFindCircle(s.C); return cc ? {e: cc, h: null} : null; }
      var fe = dimFindEdge(s.E, s.p || null, prefer); return fe ? {e: fe.e, h: hintOf(fe.e, fe.p)} : null;
    };
    var ea = entById(d.a), eb = entById(d.b);
    var na = ea && !dimHintStale(ea, d.aAt) ? {e: ea, h: d.aAt} : find(g.a), nb = eb && !dimHintStale(eb, d.bAt) ? {e: eb, h: d.bAt} : find(g.b);
    if (!na || !nb) return false;
    d.a = entId(na.e); d.b = entId(nb.e); d.aAt = na.h; d.bAt = nb.h;
    return true;
  }
  return false;
}
// After every change (persist): dimensions moved onto what's there now, or removed; toolpaths drop shapes that are gone
function dimsFollow(){
  var gone = 0, cant = 0;
  if (DOC.dims && DOC.dims.length){
    DOC.dims = DOC.dims.filter(function (d){
      if (dimRefOk(d) && !dimHintsStale(d)){
        // there, but can't be measured (a distance between edges no longer parallel): found again, or removed and said
        // (Clint, 2026-10-26: "at best, we should recalculate them OR at worst, remove them and notify the user")
        if (dimValueNow(d) !== null) return true;
        if (dimRetarget(d) && dimRefOk(d) && dimValueNow(d) !== null) return true;
        cant++; return false;
      }
      if (dimRetarget(d) && dimRefOk(d)) return true;
      gone++; return false;
    });
  }
  var lost = [];
  (DOC.toolpaths || []).forEach(function (tp){
    if (!tp.ents || !tp.ents.length) return;
    var keep = tp.ents.filter(function (id){ return !!entById(id); });
    if (keep.length === tp.ents.length) return;
    var fresh = typeof tpStale === 'function' && !tpStale(tp);
    tp.ents.filter(function (id){ return keep.indexOf(id) < 0; }).forEach(function (id){
      if (tp.tabPts) delete tp.tabPts[id];
      if (tp.startPts) delete tp.startPts[id];
    });
    tp.ents = keep;
    if (fresh) tp.sig = tpSignature(tp.ents) + tpStockSig(tp);        // a shape that's gone was cut by nothing anyway
    lost.push(tp.name);
  });
  if (cant) toast('info', cant === 1 ? 'A dimension was removed' : cant + ' dimensions were removed',
                  (cant === 1 ? 'It' : 'They') + ' no longer measured anything: the edges ' + (cant === 1 ? 'it was' : 'they were') +
                  ' between aren’t parallel any more' + (dimsFollow.opening ? ' (left over from an earlier version).' : '. Undo brings ' + (cant === 1 ? 'it' : 'them') + ' back.'));
  if (gone) toast('info', gone === 1 ? 'A dimension was removed' : gone + ' dimensions were removed',
                  'What ' + (gone === 1 ? 'it' : 'they') + ' measured is no longer in the drawing' +
                  (dimsFollow.opening ? ' (left over from an earlier version).' : '. Undo brings ' + (gone === 1 ? 'it' : 'them') + ' back.'));
  if (lost.length) toast('warn', lost.length === 1 ? lost[0] + ' lost a shape' : lost.length + ' toolpaths lost a shape',
                         'A shape ' + (lost.length === 1 ? 'it' : 'they') + ' cut is no longer in the drawing (' + lost.slice(0, 4).join(', ') +
                         '). If it was remade (by Trim or Join, say), edit the toolpath and pick the new shape, or it won’t be cut.');
  return gone + cant;
}

// ---- 'seg': the length of one straight edge of an outline (a line's length, after Join made it part of one) ----
function dimSegEdge(d){
  var e = entById(d.a);
  if (!e || (e.t !== 'poly' && e.t !== 'path')) return null;
  var p = resolveHint(e, d.at); if (!p) return null;
  var ed = dimEdgeNear(e, p);
  return ed && distToSeg(p.x, p.y, ed[0], ed[1], ed[2], ed[3]) < 0.5 ? ed : null;
}
// Typed: the edge's far end moves along it (a poly's corner, as the Node tool's length does); a path's can't
function dimSegApply(d, v){
  var e = entById(d.a), ed = dimSegEdge(d);
  if (!ed || e.t !== 'poly') return false;
  var L = Math.hypot(ed[2] - ed[0], ed[3] - ed[1]); if (L < 1e-9) return false;
  for (var k = 0; k < e.pts.length; k++){
    if (Math.abs(e.pts[k][0] - ed[2]) < 1e-9 && Math.abs(e.pts[k][1] - ed[3]) < 1e-9){
      e.pts[k] = [ed[0] + (ed[2] - ed[0]) / L * v, ed[1] + (ed[3] - ed[1]) / L * v].concat(e.pts[k].slice(2));
      return true;
    }
  }
  return false;
}
// ---- a distance between two edges of one outline (a rectangle's width, after Fillet or Trim made it an outline) ----
// Typed: the outline stretches, everything on b's side of the middle moving across, so its corners and arcs keep their
// shape. dist: as it is now.
function dimSpanApply(d, v, cur){
  var e = entById(d.a); if (!e || !e.pts) return false;
  var pa = resolveHint(e, d.aAt), pb = resolveHint(e, d.bAt); if (!pa || !pb) return false;
  var ea = dimEdgeNear(e, pa), eb = dimEdgeNear(e, pb); if (!ea || !eb) return false;
  var n = segNorm(ea[0], ea[1], ea[2], ea[3]), sb = sd(n, eb[0], eb[1]), dir = sb >= 0 ? 1 : -1;
  if (!(Math.abs(sb) > 1e-9)) return false;
  var shift = (v - Math.abs(sb)) * dir, half = sb / 2;
  e.pts.forEach(function (q){ if ((sd(n, q[0], q[1]) - half) * dir > 0){ q[0] += n.a * shift; q[1] += n.b * shift; } });
  if (e._tess) e._tess = null; if (e._tess2) e._tess2 = null;
  return true;
}
