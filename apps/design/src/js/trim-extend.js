/* ---------------- edit ops: trim / extend / fillet ---------------- */
function doTrim(w){
  var idx = pickEntity(w);
  if (idx === null) return false;
  var e = DOC.ents[idx];
  if (e.t === 'line'){
    var L = Math.hypot(e.x2-e.x1, e.y2-e.y1); if (L < 1e-9) return false;
    var tc = ((w.x-e.x1)*(e.x2-e.x1) + (w.y-e.y1)*(e.y2-e.y1)) / (L*L);
    var cuts = lineCuts(idx);
    if (!cuts.length) return false;   // nothing crosses it -> not trimmable (never silently delete)
    var lo = null, hi = null;
    cuts.forEach(function(t){ if (t < tc) lo = t; else if (hi === null) hi = t; });
    pushUndo();
    var pieces = [];
    function mk(t0, t1){
      if (t1 - t0 < 1e-6) return;
      var ne = {t:'line', x1:e.x1+(e.x2-e.x1)*t0, y1:e.y1+(e.y2-e.y1)*t0,
                          x2:e.x1+(e.x2-e.x1)*t1, y2:e.y1+(e.y2-e.y1)*t1};
      if (e.tp) ne.tp = true;
      pieces.push(ne);
    }
    if (lo !== null) mk(0, lo);
    if (hi !== null) mk(hi, 1);
    DOC.ents.splice.apply(DOC.ents, [idx,1].concat(pieces));
    return true;
  }
  if (e.t === 'circle' || e.t === 'arc'){
    var sw = e.t === 'arc' ? arcSweepOf(e.a0, e.a1, e.ccw) : 2*Math.PI;
    var ccw = e.t === 'arc' ? e.ccw : true;
    var a0 = e.t === 'arc' ? e.a0 : 0;
    var angC = Math.atan2(w.y-e.cy, w.x-e.cx);
    var sc = ccw ? angNorm(angC - a0) : angNorm(a0 - angC);
    if (sc > sw) sc = sw - 1e-6;
    var cuts2 = circCuts(idx);
    if (e.t === 'circle' && cuts2.length < 2) return false;
    if (e.t === 'arc' && !cuts2.length) return false;
    pushUndo();
    if (e.t === 'circle'){
      if (cuts2.length < 2){ return false; }
      var lo2 = null, hi2 = null;
      cuts2.forEach(function(t){ if (t < sc) lo2 = t; else if (hi2 === null) hi2 = t; });
      if (lo2 === null) lo2 = cuts2[cuts2.length-1];       // wrap
      if (hi2 === null) hi2 = cuts2[0];
      var pA = arcPtAt(e, hi2), pB = arcPtAt(e, lo2);
      var ne2 = {t:'arc', cx:e.cx, cy:e.cy, r:e.r, a0:pA.a, a1:pB.a, ccw:true};
      if (e.tp) ne2.tp = true;
      DOC.ents.splice(idx,1,ne2);
      return true;
    }
    var lo3 = null, hi3 = null;
    cuts2.forEach(function(t){ if (t < sc) lo3 = t; else if (hi3 === null) hi3 = t; });
    var pieces3 = [];
    function mkArc(s0, s1){
      if (s1 - s0 < 1e-6) return;
      var q0 = arcPtAt(e, s0), q1 = arcPtAt(e, s1);
      var na = {t:'arc', cx:e.cx, cy:e.cy, r:e.r, a0:q0.a, a1:q1.a, ccw:e.ccw};
      if (e.tp) na.tp = true;
      pieces3.push(na);
    }
    if (lo3 !== null) mkArc(0, lo3);
    if (hi3 !== null) mkArc(hi3, sw);
    DOC.ents.splice.apply(DOC.ents, [idx,1].concat(pieces3));
    return true;
  }
  if (e.t === 'poly' || e.t === 'path'){
    return trimPathEntity(idx, w);
  }
  return false;
}
// Trim a poly/path where OTHER entities cross it: split into per-span parametric position,
// find crossings, and remove the clicked piece between the two bounding crossings. A closed
// path opens at the cut; an already-open path yields the two remaining pieces.
function trimPathEntity(idx, w){
  var e = DOC.ents[idx];
  // work on a uniform vertex list with bulges (poly -> bulge 0)
  var V = (e.t === 'poly') ? e.pts.map(function(q){ return [q[0], q[1], 0]; })
                           : e.pts.map(function(q){ return [q[0], q[1], q[2]||0]; });
  var n = V.length;
  var closed = !!e.closed;
  var nSpan = closed ? n : n-1;
  if (nSpan < 1) return false;
  // tessellate each span, tracking global arc-length param s and mapping s->point
  // crossing detection: intersect every span (as line segs of its tessellation) with other ents
  function spanPts(k){
    var p0 = V[k], p1 = V[(k+1)%n], b = p0[2];
    if (Math.abs(b) < 1e-9) return [[p0[0],p0[1]],[p1[0],p1[1]]];
    // tessellate this bulge span finely
    var sub = tessPath({t:'path', closed:false, pts:[[p0[0],p0[1],b],[p1[0],p1[1],0]]}, 0.08);
    return sub;
  }
  // build a flat polyline of the whole outline with a param = index along the flat list
  var flat = [];               // {x,y, span:k}
  for (var k = 0; k < nSpan; k++){
    var sp = spanPts(k);
    for (var j = 0; j < sp.length-1; j++) flat.push({x:sp[j][0], y:sp[j][1], span:k});
  }
  // append final point for open paths
  if (!closed){ var lastp = V[n-1]; flat.push({x:lastp[0], y:lastp[1], span:nSpan-1}); }
  var FN = flat.length;
  function fpt(i){ return flat[(i%FN+FN)%FN]; }
  // find crossings: for each flat segment, test against other entities' primitives
  var cross = [];              // {fi: flat-segment index, t: within-seg, x,y}
  for (var fi = 0; fi < (closed ? FN : FN-1); fi++){
    var a = fpt(fi), b2 = fpt(fi+1);
    DOC.ents.forEach(function(o, oi){
      if (oi === idx || !entOnSheet(o)) return;
      primsOf(o).forEach(function(pr){
        if (pr.c === 0){
          var h = xLineLine(a.x,a.y,b2.x,b2.y, pr.x1,pr.y1,pr.x2,pr.y2);
          if (h && h.u > -1e-4 && h.u < 1+1e-4 && h.t > -1e-4 && h.t < 1+1e-4)
            cross.push({pos: fi + Math.max(0,Math.min(1,h.t)), x:h.x, y:h.y});
        } else {
          xLineCircle(a.x,a.y,b2.x,b2.y, pr.cx,pr.cy,pr.r).forEach(function(h2){
            if (h2.t > -1e-4 && h2.t < 1+1e-4 && angOnArc(pr, Math.atan2(h2.y-pr.cy, h2.x-pr.cx)))
              cross.push({pos: fi + Math.max(0,Math.min(1,h2.t)), x:h2.x, y:h2.y});
          });
        }
      });
    });
  }
  if (cross.length < 1) return false;   // nothing crosses it -> not trimmable (do NOT delete)
  cross.sort(function(a,b){ return a.pos-b.pos; });
  // dedupe near-identical crossings
  cross = cross.filter(function(c,i){ return i===0 || c.pos - cross[i-1].pos > 1e-3; });
  // clicked position along the flat polyline
  var cw = null, cbest = 1e9;
  for (var fi2 = 0; fi2 < FN; fi2++){
    var a2 = fpt(fi2), b3 = fpt(fi2+1);
    var d = distToSeg(w.x, w.y, a2.x, a2.y, b3.x, b3.y);
    if (d < cbest){ cbest = d;
      var dx=b3.x-a2.x, dy=b3.y-a2.y, L2=dx*dx+dy*dy;
      var tt = L2>1e-12 ? Math.max(0,Math.min(1,((w.x-a2.x)*dx+(w.y-a2.y)*dy)/L2)) : 0;
      cw = fi2 + tt;
    }
  }
  if (cw === null) return false;
  // find the crossing before and after the click (with wrap for closed)
  var lo = null, hi = null;
  for (var ci = 0; ci < cross.length; ci++){
    if (cross[ci].pos <= cw) lo = cross[ci];
    if (cross[ci].pos > cw && hi === null) hi = cross[ci];
  }
  // build the kept polyline(s) as a new open path, removing the clicked segment lo..hi
  function slice(fromPos, toPos){
    // sample the flat polyline from fromPos to toPos (inclusive endpoints exact)
    var pts = [];
    var f0 = fromPos, f1 = toPos;
    // start point (interpolated)
    function lerp(pos){ var i=Math.floor(pos), fr=pos-i; var A=fpt(i),B=fpt(i+1); return [A.x+(B.x-A.x)*fr, A.y+(B.y-A.y)*fr]; }
    pts.push(lerp(f0));
    for (var i=Math.ceil(f0); i<=Math.floor(f1); i++) pts.push([fpt(i).x, fpt(i).y]);
    pts.push(lerp(f1));
    // dedupe consecutive
    var out=[]; pts.forEach(function(q){ if(!out.length||Math.hypot(q[0]-out[out.length-1][0],q[1]-out[out.length-1][1])>1e-6) out.push(q); });
    return out;
  }
  pushUndo();
  var newEnts = [];
  if (closed){
    if (lo === null || hi === null){
      // click before first / after last crossing: single wrap gap between last and first crossing
      var A = cross[cross.length-1], B = cross[0];
      var keep = slice(A.pos, B.pos + FN); // wrap
      if (keep.length >= 2) newEnts.push({t:'poly', pts:keep.map(function(q){return[q[0],q[1]];}), closed:false});
    } else {
      // keep the complement of lo..hi : from hi around to lo
      var keep2 = slice(hi.pos, lo.pos + FN);
      if (keep2.length >= 2) newEnts.push({t:'poly', pts:keep2.map(function(q){return[q[0],q[1]];}), closed:false});
    }
  } else {
    // open path: keep the two ends outside lo..hi
    if (lo){ var s1 = slice(0, lo.pos); if (s1.length>=2) newEnts.push({t:'poly',pts:s1.map(function(q){return[q[0],q[1]];}),closed:false}); }
    if (hi){ var s2 = slice(hi.pos, FN-1); if (s2.length>=2) newEnts.push({t:'poly',pts:s2.map(function(q){return[q[0],q[1]];}),closed:false}); }
    if (!lo && !hi) return false;
  }
  newEnts.forEach(function(ne){ if(e.tp)ne.tp=true; if(e.con)ne.con=true; });
  DOC.ents.splice.apply(DOC.ents, [idx,1].concat(newEnts));
  return true;
}
function doExtend(w){
  var idx = pickEntity(w);
  if (idx === null) return false;
  var e = DOC.ents[idx];
  if (e.t === 'line'){
    var d1 = Math.hypot(w.x-e.x1, w.y-e.y1), d2 = Math.hypot(w.x-e.x2, w.y-e.y2);
    var fromEnd2 = d2 < d1; // extend the nearer endpoint
    var A = fromEnd2 ? {x:e.x1,y:e.y1} : {x:e.x2,y:e.y2};
    var B = fromEnd2 ? {x:e.x2,y:e.y2} : {x:e.x1,y:e.y1};
    var best = null;
    DOC.ents.forEach(function(o, oi){
      if (oi === idx || !entOnSheet(o)) return;
      primsOf(o).forEach(function(pr){
        if (pr.c === 0){
          var h = xLineLine(A.x,A.y,B.x,B.y, pr.x1,pr.y1,pr.x2,pr.y2);
          if (h && h.u > -1e-9 && h.u < 1+1e-9 && h.t > 1+1e-9 && (!best || h.t < best.t)) best = h;
        } else {
          xLineCircle(A.x,A.y,B.x,B.y, pr.cx,pr.cy,pr.r).forEach(function(h2){
            if (h2.t > 1+1e-9 && angOnArc(pr, Math.atan2(h2.y-pr.cy, h2.x-pr.cx)) && (!best || h2.t < best.t)) best = h2;
          });
        }
      });
    });
    if (!best) return false;
    pushUndo();
    if (fromEnd2){ e.x2 = best.x; e.y2 = best.y; } else { e.x1 = best.x; e.y1 = best.y; }
    return true;
  }
  if (e.t === 'arc'){
    var sw4 = arcSweepOf(e.a0, e.a1, e.ccw);
    var q0 = arcPtAt(e, 0), q1 = arcPtAt(e, sw4);
    var dEnd = Math.hypot(w.x-q1.x, w.y-q1.y) < Math.hypot(w.x-q0.x, w.y-q0.y);
    var cand = [];
    DOC.ents.forEach(function(o, oi){
      if (oi === idx || !entOnSheet(o)) return;
      primsOf(o).forEach(function(pr){
        var pts = pr.c === 0 ? xLineCircle(pr.x1,pr.y1,pr.x2,pr.y2, e.cx,e.cy,e.r).filter(function(h){ return h.t > -1e-4 && h.t < 1+1e-4; })
                             : xCircleCircle(e.cx,e.cy,e.r, pr.cx,pr.cy,pr.r).filter(function(q){ return angOnArc(pr, Math.atan2(q.y-pr.cy, q.x-pr.cx)); });
        pts.forEach(function(q){ cand.push(Math.atan2(q.y-e.cy, q.x-e.cx)); });
      });
    });
    if (!cand.length) return false;
    var bestGain = null;
    cand.forEach(function(ang){
      var gain = dEnd ? (e.ccw ? angNorm(ang - Math.atan2(q1.y-e.cy,q1.x-e.cx)) : angNorm(Math.atan2(q1.y-e.cy,q1.x-e.cx) - ang))
                      : (e.ccw ? angNorm(Math.atan2(q0.y-e.cy,q0.x-e.cx) - ang) : angNorm(ang - Math.atan2(q0.y-e.cy,q0.x-e.cx)));
      if (gain > 1e-6 && gain + sw4 < 2*Math.PI - 1e-6 && (bestGain === null || gain < bestGain.g)) bestGain = {g:gain, a:ang};
    });
    if (!bestGain) return false;
    pushUndo();
    if (dEnd) e.a1 = bestGain.a; else e.a0 = bestGain.a;
    return true;
  }
  return false;
}
