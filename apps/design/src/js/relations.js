/* ---------------- relationship dimensions ----------------
   Each entity reduces to a reference geometry against its partner:
   circle -> point (center); line -> line; rect -> nearest edge (a line).
   Distances: point-point, point-line, line-line (parallel).
   The SECOND-selected entity always moves, translated rigidly. */
function repPoint(e){
  if (e.t === 'text')   return {x:e.x, y:e.y};
  if (e.t === 'circle') return {x:e.cx, y:e.cy};
  if (e.t === 'arc')    return {x:e.cx, y:e.cy};
  if (e.t === 'line')   return {x:(e.x1+e.x2)/2, y:(e.y1+e.y2)/2};
  if (e.t === 'rect')   return {x:e.x+e.w/2, y:e.y+e.h/2};
  if (e.t === 'poly')   return {x:e.pts[0][0], y:e.pts[0][1]};
  if (e.t === 'path')   return {x:e.pts[0][0], y:e.pts[0][1]};
  if (e.t === 'group'){
    var b = entBBox(e);
    return {x:(b.x0+b.x1)/2, y:(b.y0+b.y1)/2};
  }
  return {x:0,y:0};
}
function segNorm(x1,y1,x2,y2){
  var dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy)||1;
  var a=-dy/L, b=dx/L;
  return {a:a, b:b, c:a*x1+b*y1, x1:x1,y1:y1,x2:x2,y2:y2};
}
function lineNorm(e){ return segNorm(e.x1,e.y1,e.x2,e.y2); }
function nearestRectEdge(e, hint){
  var best=null;
  entityEdges(e).forEach(function(ed){
    var d = distToSeg(hint.x, hint.y, ed[0],ed[1],ed[2],ed[3]);
    if (!best || d < best.d) best = {d:d, ed:ed};
  });
  return segNorm(best.ed[0],best.ed[1],best.ed[2],best.ed[3]);
}
// nearest straight edge of any multi-segment shape (poly, path, rect, or group) to a hint point
function nearestEdgeOf(e, hint){
  var best = null;
  function consider(segs){
    segs.forEach(function(ed){
      var d = distToSeg(hint.x, hint.y, ed[0], ed[1], ed[2], ed[3]);
      if (!best || d < best.d) best = {d:d, ed:ed};
    });
  }
  if (e.t === 'group'){
    e.ents.forEach(function(me){
      if (me.t === 'circle' || me.t === 'arc'){
        // approximate a curved member by the chord nearest the hint
        var tp = me.t === 'circle'
          ? (function(){ var o=[]; for (var k=0;k<36;k++){ var a=k/36*2*Math.PI, a2=(k+1)/36*2*Math.PI;
              o.push([me.cx+me.r*Math.cos(a), me.cy+me.r*Math.sin(a), me.cx+me.r*Math.cos(a2), me.cy+me.r*Math.sin(a2)]); } return o; })()
          : (function(){ var o=[], sw=arcSweepOf(me.a0,me.a1,me.ccw), st=24;
              for (var k=0;k<st;k++){ var q1=arcPtAt(me, sw*k/st), q2=arcPtAt(me, sw*(k+1)/st);
                o.push([q1.x,q1.y,q2.x,q2.y]); } return o; })();
        consider(tp);
      } else consider(entityEdges(me));
    });
  } else if (e.t === 'path'){
    var tp2 = tessPath(e, 0.2), segs = [];
    for (var i = 0; i < tp2.length-1; i++) segs.push([tp2[i][0], tp2[i][1], tp2[i+1][0], tp2[i+1][1]]);
    if (e.closed && tp2.length > 1) segs.push([tp2[tp2.length-1][0], tp2[tp2.length-1][1], tp2[0][0], tp2[0][1]]);
    consider(segs);
  } else consider(entityEdges(e));
  return best ? segNorm(best.ed[0], best.ed[1], best.ed[2], best.ed[3]) : null;
}
// `hint` is where the user clicked on this shape: a shape with many edges is measured from the
// edge under the click, not from whichever edge happens to be closest to the other shape.
function refGeom(e, other, hint){
  if (e.t === 'circle') return {pt:{x:e.cx, y:e.cy}};
  if (e.t === 'arc')    return {pt:{x:e.cx, y:e.cy}};
  if (e.t === 'line')   return {ln:lineNorm(e)};
  if (e.t === 'rect' || e.t === 'poly' || e.t === 'path' || e.t === 'group'){
    var ln = nearestEdgeOf(e, resolveHint(e, hint) || repPoint(other));
    return ln ? {ln:ln} : null;
  }
  return null;
}
function sd(n, px, py){ return n.a*px + n.b*py - n.c; }
function relInfo(e1, e2, h1, h2){
  var g1 = refGeom(e1, e2, h1), g2 = refGeom(e2, e1, h2);
  if (!g1 || !g2) return {kind:'unsupported'};
  if (g1.pt && g2.pt){
    var L = Math.hypot(g2.pt.x-g1.pt.x, g2.pt.y-g1.pt.y);
    return {kind:'dist', mode:'pp', cur:L};
  }
  if (g1.ln && g2.pt) return {kind:'dist', mode:'pl', cur:Math.abs(sd(g1.ln, g2.pt.x, g2.pt.y))};
  if (g1.pt && g2.ln) return {kind:'dist', mode:'lp', cur:Math.abs(sd(g2.ln, g1.pt.x, g1.pt.y))};
  // line-line: parallel required
  var a1 = Math.atan2(g1.ln.y2-g1.ln.y1, g1.ln.x2-g1.ln.x1);
  var a2 = Math.atan2(g2.ln.y2-g2.ln.y1, g2.ln.x2-g2.ln.x1);
  var ang = Math.abs(((a1-a2) % Math.PI + Math.PI) % Math.PI);
  ang = Math.min(ang, Math.PI - ang) * 180/Math.PI;
  if (ang >= 0.5) return {kind:'angle', cur:ang};
  return {kind:'dist', mode:'ll', cur:Math.abs(sd(g1.ln, g2.ln.x1, g2.ln.y1))};
}
// radius of whichever of the pair is a circle/arc (0 if neither) — used for edge distances
function relRadius(e1, e2){
  var r = 0;
  [e1, e2].forEach(function(e){ if (e && (e.t === 'circle' || e.t === 'arc')) r = e.r; });
  return r;
}
function relDims(e1, e2){
  var r = relInfo(e1, e2);
  if (r.kind === 'angle') return 'not parallel  \u2220 ' + r.cur.toFixed(2) + '\u00b0';
  if (r.kind === 'unsupported') return 'no dimension for this pair yet';
  var rad = relRadius(e1, e2);
  if (rad > 0)
    return 'centre ' + r.cur.toFixed(2) + '  \u00b7 edge ' + Math.max(0, r.cur - rad).toFixed(2);
  return 'dist ' + r.cur.toFixed(2);
}
