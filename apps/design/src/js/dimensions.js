function dimsArr(){ if (!DOC.dims) DOC.dims = []; return DOC.dims; }
var SELAT = {};                                        // entity id -> where it was last clicked to select it
// A dimension remembers WHICH edge of a shape it measures, not a point on the drawing: a point stays put
// when the shape moves, and can end up on a different edge. For a rectangle, the side and how far along
// it; for an outline, the segment and how far along; for anything else, a point relative to the shape.
function rectSides(e){ return {bottom:[e.x, e.y, e.x+e.w, e.y], right:[e.x+e.w, e.y, e.x+e.w, e.y+e.h],
                               top:[e.x+e.w, e.y+e.h, e.x, e.y+e.h], left:[e.x, e.y+e.h, e.x, e.y]}; }
function alongSeg(pt, q){ var dx = q[2]-q[0], dy = q[3]-q[1], L2 = dx*dx + dy*dy;
  return L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((pt.x-q[0])*dx + (pt.y-q[1])*dy) / L2)); }
function hintOf(e, pt){
  if (!e || !pt || pt.x === undefined) return pt || null;
  if (e.t === 'rect'){
    var sides = rectSides(e), best = null, bd = Infinity;
    Object.keys(sides).forEach(function (k){ var q = sides[k], d = distToSeg(pt.x, pt.y, q[0], q[1], q[2], q[3]); if (d < bd){ bd = d; best = k; } });
    return {side:best, t:alongSeg(pt, sides[best])};
  }
  if ((e.t === 'poly' || e.t === 'path') && e.pts.length >= 2){   // an outline: which edge, and how far along it (a path's arcs by their chords)
    var n = e.pts.length, last = e.closed ? n : n - 1, bk = 0, bd2 = Infinity;
    for (var k = 0; k < last; k++){ var a = e.pts[k], b = e.pts[(k+1) % n], d2 = distToSeg(pt.x, pt.y, a[0], a[1], b[0], b[1]); if (d2 < bd2){ bd2 = d2; bk = k; } }
    var A = e.pts[bk], B = e.pts[(bk+1) % n];
    return {seg:bk, t:alongSeg(pt, [A[0], A[1], B[0], B[1]])};
  }
  var bb = entBBox(e);
  return {lx:pt.x - bb.x0, ly:pt.y - bb.y0};
}
// the point on the drawing a hint means now; old dimensions stored a plain point, which is used as it is
function resolveHint(e, h){
  if (!h || !e) return null;
  if (h.x !== undefined) return h;
  if (h.side && e.t === 'rect'){ var q = rectSides(e)[h.side]; if (q) return {x:q[0] + (q[2]-q[0])*h.t, y:q[1] + (q[3]-q[1])*h.t}; }
  if (h.seg !== undefined && (e.t === 'poly' || e.t === 'path') && e.pts.length >= 2){
    var n = e.pts.length, A = e.pts[h.seg % n], B = e.pts[(h.seg+1) % n];
    if (A && B) return {x:A[0] + (B[0]-A[0])*h.t, y:A[1] + (B[1]-A[1])*h.t};
  }
  if (h.lx !== undefined){ var bb = entBBox(e); return {x:bb.x0 + h.lx, y:bb.y0 + h.ly}; }
  return null;
}
// a dimension saved with plain points: from now on, remember the edges they point at now
function dimHints(d){
  if (d.kind === 'pair'){
    var a = entById(d.a), b = entById(d.b);
    if (a && d.aAt && d.aAt.x !== undefined) d.aAt = hintOf(a, d.aAt);
    if (b && d.bAt && d.bAt.x !== undefined) d.bAt = hintOf(b, d.bAt);
  } else if (d.kind === 'side'){ var e = entById(d.a); if (e && d.at && d.at.x !== undefined) d.at = hintOf(e, d.at); }
}
// does an existing distance already measure these same two edges?
function sameDistance(d, ea, eb, ha, hb){
  if (d.kind !== 'pair' || d.a !== entId(ea) || d.b !== entId(eb)) return false;
  var p = [refGeom(ea, eb, d.aAt), refGeom(eb, ea, d.bAt)], q = [refGeom(ea, eb, ha), refGeom(eb, ea, hb)];
  return p.every(function (g, k){ var h = q[k]; if (!g || !h) return false;
    if (g.pt && h.pt) return Math.hypot(g.pt.x - h.pt.x, g.pt.y - h.pt.y) < 0.01;
    return !!(g.ln && h.ln && parallelLines(g.ln, h.ln) && Math.abs(sd(g.ln, h.ln.x1, h.ln.y1)) < 0.01); });
}
// current measured value of a dimension, or null if its references are gone
function dimValue(d){
  var v = dimValueNow(d);
  if (v !== null) dimGeoKeep(d);                       // what it measures, to follow it when its shape is remade (dimension-follow.js)
  return v;
}
function dimValueNow(d){
  dimHints(d);
  if (d.kind === 'pair'){
    var a = entById(d.a), b = entById(d.b);
    if (!a || !b) return null;
    var r = relInfo(a, b, d.aAt, d.bAt);
    if (r.kind !== 'dist') return null;
    var v = r.cur;
    if (d.edge){ var rad = relRadius(a, b); if (rad > 0) v = Math.max(0, v - rad); }
    return v;
  }
  var e = entById(d.a);
  if (!e) return null;
  if (d.kind === 'side' && e.t === 'rect')   return rectSideIsWidth(e, d.at) ? e.w : e.h;
  if (d.kind === 'len'  && e.t === 'line')   return Math.hypot(e.x2-e.x1, e.y2-e.y1);
  if (d.kind === 'dia'  && e.t === 'circle') return e.r*2;
  if (d.kind === 'rad'  && (e.t === 'circle' || e.t === 'arc')) return e.r;
  if (d.kind === 'seg'){ var sg = dimSegEdge(d); return sg ? Math.hypot(sg[2]-sg[0], sg[3]-sg[1]) : null; }
  return null;
}
// where to draw it: midpoint between the two references (or the entity's own middle)
// A dimension should read as the distance it measures: from a circle's centre straight to the
// edge that was clicked, meeting it square on, not off to the middle of the other shape.
function dimFoot(ln, p){ var t = sd(ln, p.x, p.y); return {x: p.x - ln.a*t, y: p.y - ln.b*t}; }
function dimAnchor(d){
  dimHints(d);
  if (d.kind === 'pair'){
    var a = entById(d.a), b = entById(d.b);
    if (!a || !b) return null;
    var ga = refGeom(a, b, d.aAt), gb = refGeom(b, a, d.bAt), pa = null, pb = null;
    if (ga && gb){
      if (ga.pt && gb.pt){ pa = ga.pt; pb = gb.pt; }
      else if (ga.pt && gb.ln){ pa = ga.pt; pb = dimFoot(gb.ln, pa); }
      else if (ga.ln && gb.pt){ pb = gb.pt; pa = dimFoot(ga.ln, pb); }
      else if (ga.ln && gb.ln){                       // two edges: square across from where b was clicked
        var seed = resolveHint(b, d.bAt) || {x:(gb.ln.x1 + gb.ln.x2)/2, y:(gb.ln.y1 + gb.ln.y2)/2};
        pb = dimFoot(gb.ln, seed); pa = dimFoot(ga.ln, pb);
      }
    }
    if (!pa || !pb){ pa = repPoint(a); pb = repPoint(b); }
    return {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2, a:pa, b:pb};
  }
  var e = entById(d.a);
  if (!e) return null;
  if (d.kind === 'side' && e.t === 'rect'){                 // along the side that was clicked
    var ln = nearestEdgeOf(e, resolveHint(e, d.at) || repPoint(e));
    if (ln) return {x:(ln.x1 + ln.x2)/2, y:(ln.y1 + ln.y2)/2, a:{x:ln.x1, y:ln.y1}, b:{x:ln.x2, y:ln.y2}};
  }
  if (d.kind === 'seg'){ var se = dimSegEdge(d); if (se) return {x:(se[0] + se[2])/2, y:(se[1] + se[3])/2, a:{x:se[0], y:se[1]}, b:{x:se[2], y:se[3]}}; }
  var pt = repPoint(e);
  return {x:pt.x, y:pt.y, a:pt, b:pt};
}
// Where a dimension is drawn, once dragged out of the way (d.place, in mm, relative to what it measures, so it
// follows the shapes): a distance moves its line out square to itself by n and slides its value along it by s, with
// extension lines back to the points it measures; a diameter or radius moves its value by dx, dy, with a leader.
function dimPlaced(d){
  var an = dimAnchor(d); if (!an) return null;
  var pl = d.place || null, L = Math.hypot(an.b.x - an.a.x, an.b.y - an.a.y);
  if ((d.kind === 'pair' || d.kind === 'side' || d.kind === 'seg') && L > 1e-9){
    var ux = (an.b.x - an.a.x)/L, uy = (an.b.y - an.a.y)/L, nx = -uy, ny = ux;
    var N = pl && pl.n || 0, S = pl && pl.s || 0;
    return {line:true, placed:!!pl, ea:an.a, eb:an.b, mid:{x:an.x, y:an.y}, u:{x:ux, y:uy}, n:{x:nx, y:ny},
            a:{x:an.a.x + nx*N, y:an.a.y + ny*N}, b:{x:an.b.x + nx*N, y:an.b.y + ny*N},
            x:an.x + nx*N + ux*S, y:an.y + ny*N + uy*S};
  }
  var dx = pl && pl.dx || 0, dy = pl && pl.dy || 0;
  return {line:false, placed:!!pl, ea:an.a, eb:an.b, a:an.a, b:an.b, mid:{x:an.x, y:an.y}, x:an.x + dx, y:an.y + dy};
}
// put a dimension's value at w (in mm)
function dimPlaceAt(d, w){
  var p = dimPlaced(d); if (!p) return;
  var rx = w.x - p.mid.x, ry = w.y - p.mid.y;
  d.place = p.line ? {n: rx*p.n.x + ry*p.n.y, s: rx*p.u.x + ry*p.u.y} : {dx: rx, dy: ry};
}
// a drag (DRAW.stage 'dimDrag', from the Select tool): nothing moves until the pointer has gone 3 px, so a click
// only selects; the first move makes the undo step
function dimDragTo(g, w, sx, sy){
  var d = DOC.dims[g.di]; if (!d) return;
  if (!g.moved && Math.hypot(sx - g.sx, sy - g.sy) < 3) return;
  if (!g.pushed){ pushUndo('Move dimension'); g.pushed = true; }
  g.moved = true;
  dimPlaceAt(d, {x: w.x - g.gx, y: w.y - g.gy});
}
function dimDragEnd(g){ if (g.moved) persist(); }
function dimDragCancel(g){
  var d = DOC.dims[g.di];
  if (d){ if (g.was) d.place = g.was; else delete d.place; }
  if (g.pushed) undoDrop();
}
// where its value is shown, in mm: on the line once placed; before that, a little above the middle, as always
function dimLabelWorld(d){
  var p = dimPlaced(d); if (!p) return null;
  return p.placed ? {x:p.x, y:p.y} : {x:p.x, y:p.y + 14/VIEW.scale};
}
// a rectangle's side: its top or bottom measures the width, its left or right the height
function rectSideIsWidth(e, at){ var ln = nearestEdgeOf(e, resolveHint(e, at) || repPoint(e)); return !ln || Math.abs(ln.b) > Math.abs(ln.a); }
// The dimension whose value the pointer is over (-1: none): it shows its parameter while pointed at
var DIMHOVER = -1;
function dimLabelHit(sx, sy){
  if (!UICFG.showDims || !DOC.dims) return -1;
  for (var i = 0; i < DOC.dims.length; i++){
    var hh = DOC.dims[i]._hit;
    if (hh && Math.abs(sx - hh.x) < hh.w/2 && Math.abs(sy - hh.y) < hh.h/2) return i;
  }
  return -1;
}
// full: with the parameter it follows ("160.00 = width"), shown while it's pointed at; otherwise just the value,
// and a ⚠ if it isn't what its parameters say
function dimLabel(d, full){
  var v = dimValue(d);
  if (v === null) return null;
  var t = fmtDisp(v) + (dispIn() ? '\u2033' : '');
  if (d.kind === 'dia') t = '\u00d8' + t;
  if (d.kind === 'rad') t = 'R' + t;
  if (d.kind === 'pair' && d.edge) t += ' (edge)';
  if (d.expr) t += (full ? ' = ' + d.expr : '') + (dimExprHolds(d) ? '' : ' ⚠');   // driven by parameters; ⚠ if it isn't what they say
  return t;
}
// apply a typed value: drives the geometry
function dimApply(d, v){
  if (v <= 0 || !isFinite(v)) return false;
  dimHints(d);
  if (d.kind === 'pair'){
    var a = entById(d.a), b = entById(d.b);
    if (!a || !b) return false;
    if (a === b) return dimSpanApply(d, v);              // two edges of one outline: it stretches (dimension-follow.js)
    return relApply(a, b, v, d.edge, d.aAt, d.bAt, d);
  }
  var e = entById(d.a);
  if (!e) return false;
  if (d.kind === 'seg') return dimSegApply(d, v);
  if (d.kind === 'len' && e.t === 'line'){
    var L = Math.hypot(e.x2-e.x1, e.y2-e.y1);
    if (L < 1e-9) return false;
    e.x2 = e.x1 + (e.x2-e.x1)/L*v; e.y2 = e.y1 + (e.y2-e.y1)/L*v;
    return true;
  }
  if (d.kind === 'side' && e.t === 'rect'){
    // the new width or height keeps whichever side a distance holds; with neither held, the left or bottom
    var wide = rectSideIsWidth(e, d.at), cur = wide ? e.w : e.h;
    var lo = wide ? {x1:e.x, y1:e.y, x2:e.x, y2:e.y + e.h} : {x1:e.x, y1:e.y, x2:e.x + e.w, y2:e.y};
    var loLn = segNorm(lo.x1, lo.y1, lo.x2, lo.y2);
    var hiLn = wide ? segNorm(e.x + e.w, e.y, e.x + e.w, e.y + e.h) : segNorm(e.x, e.y + e.h, e.x + e.w, e.y + e.h);
    var loHeld = heldOtherSide(e, hiLn, d), hiHeld = heldOtherSide(e, loLn, d);
    if (loHeld && hiHeld){ dimApply.why = 'Both of its ' + (wide ? 'left and right' : 'top and bottom') + ' sides are held by distances. Change one of those instead.'; return false; }
    if (wide){ if (hiHeld && !loHeld) e.x -= v - cur; e.w = v; }
    else     { if (hiHeld && !loHeld) e.y -= v - cur; e.h = v; }
    return true;
  }
  if (d.kind === 'dia' && e.t === 'circle'){ e.r = v/2; return true; }
  if (d.kind === 'rad' && (e.t === 'circle' || e.t === 'arc')){ e.r = v; return true; }
  return false;
}
// A dimension has just been placed: open its value for typing, the way Fusion does.
// A dimension is grabbed by its value plate or anywhere along its line.
function pickDim(sx, sy){
  if (!UICFG.showDims || !DOC.dims) return -1;
  var best = -1, bestD = 8;                          // within 8 screen px
  for (var i = 0; i < DOC.dims.length; i++){
    var d = DOC.dims[i], hh = d._hit;
    if (!dimOnSheet(d)) continue;
    if (hh && Math.abs(sx - hh.x) < hh.w/2 && Math.abs(sy - hh.y) < hh.h/2) return i;   // the value itself wins
    var an = dimPlaced(d);
    if (!an || d.kind !== 'pair') continue;
    var pa = w2s(an.a.x, an.a.y), pb = w2s(an.b.x, an.b.y);
    var dd = distToSeg(sx, sy, pa.x, pa.y, pb.x, pb.y);
    if (dd < bestD){ bestD = dd; best = i; }
  }
  return best;
}
function editDim(i, sx, sy){
  var d = DOC.dims[i];
  if (!d) return;
  if (TOOL !== 'dim') setTool('dim');
  DIMSEL = i;
  DRAW = {stage:'dimValue', di:i};
  var cur = dimValue(d);
  if (sx !== undefined) FLOAT_AT = {x:sx, y:sy};     // open the box where it was grabbed
  else { var an = dimLabelWorld(d); if (an) floatAtWorld(an.x, an.y); }
  showPrompt(STAGE_LABEL[d.kind === 'pair' ? 'dimEditV' : 'dimEditS'], d.expr || (cur === null ? '' : fmtDisp(cur)), true,
             (d.kind === 'dia' ? '\u00d8 ' : d.kind === 'rad' ? 'R ' : '') + unitTag());
  draw();
}
function deleteDim(i){
  if (!DOC.dims || !DOC.dims[i]) return;
  pushUndo();
  DOC.dims.splice(i, 1);
  DIMSEL = null; DRAW = null;
  hidePrompt(); persist(); draw();
  toast('ok', 'Dimension deleted', 'Undo brings it back. The geometry is untouched.');
}
function dimJustAdded(d){
  var i = dimsArr().indexOf(d);
  if (i < 0) return;
  DIMSEL = i;
  DRAW = {stage:'dimValue', di:i};
  var cur = dimValue(d), an = dimAnchor(d);
  if (an) floatAtWorld(an.x, an.y);                 // the box opens on the dimension itself
  showPrompt(STAGE_LABEL[d.kind === 'pair' ? 'dimEditV' : 'dimEditS'], d.expr || (cur === null ? '' : fmtDisp(cur)), true,
             (d.kind === 'dia' ? '\u00d8 ' : d.kind === 'rad' ? 'R ' : '') + unitTag());
  draw();
}
function addDim(d){
  dimsArr().push(d);
  persist();
  return d;
}
var VIEW = {scale:3, ox:0, oy:0}; // screen px per mm; ox/oy = screen pos of (0,0)
var UNDO = [], REDO = [];
var TOOL = 'select';
var DRAW = null;       // in-progress tool state
var SEL = [];          // selected entity indices, in selection order (first = reference)
var MOUSE = {x:0,y:0,mx:0,my:0,snap:null};
var cv, ctx;

