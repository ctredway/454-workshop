/* ---------------- construction lines that stay attached ----------------
   Clint, 2026-10-25: "construction lines are not holding their place. I draw a line from the center point of a circle or
   the midpoint of the line and make it a construction line, if I move the circle or shorten the line, the construction
   line doesn't move with the change". A line drawn from a snapped point now remembers it, end by end: e.a1 and e.a2,
   {id, k, i, n, p} (the shape, its feature as snapping.js names it, its point count when it has points, and where the
   feature was when last seen). After every change (persist), and after every step the History bar does again, a
   construction line's end follows its feature: if the feature moved and the end is still where the feature was, the end
   moves with it. An end moved by itself (dragged, or the line moved on its own) is no longer attached; nor is one whose
   shape is gone. A line that isn't construction keeps its attachments only while it's still on the point, so making it
   construction later doesn't make it jump. */
var ATTACH_TOL = 1e-6;                                  // mm

// What a snap (resolveSnap's) attaches a line's end to, or undefined
function attachOf(snap){
  if (!snap || !snap.ent || !snap.f) return undefined;
  var a = {id: entId(snap.ent), t: snap.ent.t, k: snap.f.k, i: snap.f.i, p: [snap.x, snap.y]};
  if (snap.ent.pts) a.n = snap.ent.pts.length;
  return a;
}
function attachBoxMid(e){ var b = entBBox(e); return {x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2}; }
// The feature an attachment points at now: the same one, or, if its shape was remade (Fillet corners makes a rectangle
// an outline) or has gained or lost points, the one of the same kind nearest where it was, if one is still there. A
// centre that's no longer one of the shape's points (a filleted rectangle's) becomes the middle of its box ('box').
function attachPoint(a){
  var e = entById(a.id);
  if (!e) return null;
  if (a.k === 'box') return attachBoxMid(e);
  if (e.t !== a.t || (e.pts && e.pts.length !== a.n)){
    a.t = e.t;
    if (a.k === 'center' && !snapFeatures(e).some(function (f) { return f.k === 'center'; })){
      var m = attachBoxMid(e);
      if (Math.hypot(m.x - a.p[0], m.y - a.p[1]) >= 1e-3) return null;
      a.k = 'box'; delete a.i; delete a.n;
      return m;
    }
    var best = null, bd = 1e-3;
    snapFeatures(e).forEach(function (f) {
      if (f.k !== a.k) return;
      var q = snapFeatureAt(e, f), d = q ? Math.hypot(q.x - a.p[0], q.y - a.p[1]) : Infinity;
      if (d < bd){ bd = d; best = f; }
    });
    if (!best) return null;
    a.i = best.i;
    if (e.pts) a.n = e.pts.length; else delete a.n;
  }
  return snapFeatureAt(e, {k: a.k, i: a.i});
}
// Every construction line's ends put back on their features. Returns how many ends moved.
function linesFollow(){
  var moved = 0;
  (DOC.ents || []).forEach(function (e) {
    if (!e || e.t !== 'line' || !(e.a1 || e.a2)) return;
    ['a1', 'a2'].forEach(function (key) {
      var a = e[key];
      if (!a) return;
      var X = key === 'a1' ? 'x1' : 'x2', Y = key === 'a1' ? 'y1' : 'y2';
      var F = a.id === e._id ? null : attachPoint(a);
      if (!F){ delete e[key]; return; }                                   // its shape is gone
      var onF = Math.hypot(e[X] - F.x, e[Y] - F.y) < ATTACH_TOL, onWas = Math.hypot(e[X] - a.p[0], e[Y] - a.p[1]) < ATTACH_TOL;
      if (onF){ a.p = [F.x, F.y]; return; }
      if (!e.con || !onWas){ delete e[key]; return; }                     // moved by itself: let go
      e[X] = F.x; e[Y] = F.y; a.p = [F.x, F.y]; moved++;                  // the feature moved: follow it
    });
  });
  return moved;
}
