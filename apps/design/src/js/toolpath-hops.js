/* ---------------- a lower lift between cuts inside a part ----------------
   Between one hole or slot and the next, the bit lifts to the safe height, 6 mm above the material, so that it clears
   clamps and screws. Inside a part, nothing stands on the material, and on Clint's arm inserts (90 holes in 1.2 mm
   material, 2026-10-23) those lifts were most of the job. With Job setup's "Lift inside a part" set (DOC.stock.hop,
   mm above the material; not set, as always, 6 mm), a move from one cut to the next that stays inside one part the
   whole way lifts only that far. A part is a shape an Outside profile cuts out. Every other move, onto and off the
   parts and between them, still lifts the full 6 mm. */
var HOP_MIN = 1;                                        // mm: not below a drill's 1 mm start above the material
var HOP_SIDES = {drill: 1, chamfer: 1, inside: 1, on: 1};   // the toolpaths it's for: holes, slots and lines inside parts

// The lift inside a part, in mm above the material, or 0 when it isn't set (or wouldn't be lower than the safe height)
function tpHopHeight(tp){
  var h = DOC.stock && DOC.stock.hop;
  if (!HOP_SIDES[tp.side]) return 0;
  return h >= HOP_MIN && h < (tp.safeZ || 6) ? h : 0;
}
// The parts: outlines of the shapes Outside profiles cut out, on the sheet shown
function tpHopParts(){
  var ids = [];
  tpList().forEach(function (t) {
    if (t.side === 'outside') (t.ents || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
  });
  return tpOutlinesById(ids).map(function (o) {
    var b = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
    o.loop.forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]); b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]); });
    return {id: o.id, loop: o.loop, box: b};
  });
}
// What the lift inside parts depends on, for a toolpath's signature: the height, and the parts' shapes
function tpHopSig(tp){
  if (!tpHopHeight(tp)) return '';
  var ids = [];
  tpList().forEach(function (t) { if (t.side === 'outside') ids = ids.concat(t.ents || []); });
  return '|h' + DOC.stock.hop + ':' + tpSignature(ids);
}
// Does the straight move from a to b stay inside this part all the way?
function tpHopInside(part, a, b){
  var bx = part.box;
  if (Math.min(a[0], b[0]) < bx.x0 || Math.max(a[0], b[0]) > bx.x1 || Math.min(a[1], b[1]) < bx.y0 || Math.max(a[1], b[1]) > bx.y1) return false;
  if (!Geom.pointInLoop(a[0], a[1], part.loop) || !Geom.pointInLoop(b[0], b[1], part.loop)) return false;
  var L = part.loop, n = L.length;
  var side = function (p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
  for (var k = 0; k < n; k++){                          // and doesn't cross its edge on the way (a bay in an L-shaped part)
    var p = L[k], q = L[(k + 1) % n];
    var d1 = side(a, b, p), d2 = side(a, b, q), d3 = side(p, q, a), d4 = side(p, q, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return false;
  }
  return true;
}
// A toolpath's moves with each lift between cuts lowered where the move after it stays inside one part. A lift is
// a rapid straight up to the safe height (one or more), then rapids across, then the way down. Returns the moves.
function tpHops(tp, moves){
  var hop = tpHopHeight(tp);
  if (!hop || !moves || !moves.length) return moves;
  var safe = tpSurface() + (tp.safeZ || 6), low = tpSurface() + hop, parts = tpHopParts();
  if (!parts.length) return moves;
  var x = null, y = null, z = null;
  var isLift = function (m) { return m && m.g === 0 && m.x === undefined && m.y === undefined && m.z !== undefined && Math.abs(m.z - safe) < 1e-6; };
  for (var i = 0; i < moves.length; i++){
    var m = moves[i];
    if (isLift(m) && x !== null && z !== null && z < low){
      var lifts = [i], j = i + 1;
      while (isLift(moves[j])) lifts.push(j++);
      var path = [[x, y]];
      while (moves[j] && moves[j].g === 0 && moves[j].z === undefined && (moves[j].x !== undefined || moves[j].y !== undefined)){
        var last = path[path.length - 1];
        path.push([moves[j].x !== undefined ? moves[j].x : last[0], moves[j].y !== undefined ? moves[j].y : last[1]]);
        j++;
      }
      var down = moves[j] && moves[j].z !== undefined && moves[j].z < safe;
      if (down && path.length > 1){
        var inside = parts.some(function (pt) {
          for (var s = 1; s < path.length; s++) if (!tpHopInside(pt, path[s - 1], path[s])) return false;
          return true;
        });
        if (inside) lifts.forEach(function (k) { moves[k] = Object.assign({}, moves[k], {z: low}); });
      }
    }
    m = moves[i];
    if (m.x !== undefined) x = m.x;
    if (m.y !== undefined) y = m.y;
    if (m.z !== undefined) z = m.z;
  }
  return moves;
}
