// ---- join: chain selected open entities into paths (bulges preserved from arcs)
function fragOf(e){
  if (e.t === 'line') return [[e.x1,e.y1,0],[e.x2,e.y2,0]];
  if (e.t === 'arc'){
    var sw = arcSweepOf(e.a0, e.a1, e.ccw);
    if (sw >= 2*Math.PI - 1e-9) return null; // full circle: can't be an open fragment
    // split into <=90-degree sub-spans so each bulge is small and unambiguous
    var segs = Math.max(1, Math.ceil(sw / (Math.PI/2)));
    var subSweep = sw / segs;
    var subBulge = Math.tan(subSweep/4) * (e.ccw ? 1 : -1);
    var out = [];
    for (var i = 0; i <= segs; i++){
      var q = arcPtAt(e, subSweep*i);
      out.push([q.x, q.y, i < segs ? subBulge : 0]);
    }
    return out;
  }
  if (e.t === 'poly' && !e.closed) return e.pts.map(function(pt){ return [pt[0],pt[1],0]; });
  if (e.t === 'path' && !e.closed) return e.pts.map(function(pt){ return [pt[0],pt[1],pt[2]||0]; });
  return null;
}
function revFrag(f){
  var n = f.length, out = [];
  for (var i = n-1; i >= 0; i--){
    var b = i > 0 ? -f[i-1][2] : 0;
    out.push([f[i][0], f[i][1], b]);
  }
  return out;
}
// Merge closed shapes with the open pieces that bridge them into ONE closed outline.
// The open pieces' endpoints mark where each closed shape should be cut: we open every
// closed shape at the perimeter span between its two junction points, discard the span
// that faces the other shapes (the inner wall), and chain everything that remains.
function mergeWithBridges(idxs){
  var tol = 0.25;
  var closed = [], open = [];
  idxs.forEach(function(i){
    var e = DOC.ents[i];
    if (e.t === 'circle') return;                       // full circles have no junctions here
    var isClosed = !!e.closed || e.t === 'rect';
    var pts = null;
    if (e.t === 'poly') pts = e.pts.map(function(q){ return [q[0], q[1], 0]; });
    else if (e.t === 'path') pts = e.pts.map(function(q){ return [q[0], q[1], q[2]||0]; });
    else if (e.t === 'line') pts = [[e.x1,e.y1,0],[e.x2,e.y2,0]];
    else if (e.t === 'arc'){ var fa = fragOf(e); if (fa) pts = fa; }
    else if (e.t === 'rect') pts = [[e.x,e.y,0],[e.x+e.w,e.y,0],[e.x+e.w,e.y+e.h,0],[e.x,e.y+e.h,0]];
    if (!pts || pts.length < 2) return;
    (isClosed ? closed : open).push({i:i, pts:pts});
  });
  if (!closed.length || !open.length) return null;

  function near(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]) < tol; }

  // For each closed shape, find which of its vertices are touched by an open piece's endpoint.
  var openEnds = [];
  open.forEach(function(o){ openEnds.push(o.pts[0], o.pts[o.pts.length-1]); });

  var strands = [];   // the surviving open runs from each closed shape
  for (var c = 0; c < closed.length; c++){
    var P = closed[c].pts, n = P.length;
    var hits = [];
    for (var v = 0; v < n; v++)
      if (openEnds.some(function(q){ return near(P[v], q); })) hits.push(v);
    if (hits.length !== 2) return null;                 // need exactly two junctions per shape
    var a = hits[0], b = hits[1];
    // two perimeter runs between the junctions: a->b forward, and b->a forward (wrapping)
    function run(from, to){
      var out = [], k = from, guard = 0;
      while (guard++ <= n){
        out.push(P[k].slice());
        if (k === to) break;
        k = (k+1) % n;
      }
      return out;
    }
    var runA = run(a, b), runB = run(b, a);
    // keep the run that is FARTHER from the other closed shapes (the outer wall);
    // the discarded one is the inner wall facing the assembly
    function centroidOf(list){
      var sx=0, sy=0; list.forEach(function(q){ sx+=q[0]; sy+=q[1]; }); return [sx/list.length, sy/list.length];
    }
    var others = [];
    for (var c2 = 0; c2 < closed.length; c2++) if (c2 !== c) others.push(centroidOf(closed[c2].pts));
    if (!others.length) return null;
    function distToOthers(list){
      var m = centroidOf(list), best = 1e9;
      others.forEach(function(o){ best = Math.min(best, Math.hypot(m[0]-o[0], m[1]-o[1])); });
      return best;
    }
    strands.push({pts: distToOthers(runA) >= distToOthers(runB) ? runA : runB});
  }

  // chain: all surviving strands + the open bridging pieces, end to end
  var parts = strands.concat(open.map(function(o){ return {pts:o.pts.map(function(q){ return q.slice(); })}; }));
  var used = parts.map(function(){ return false; });
  var chain = parts[0].pts.map(function(q){ return q.slice(); });
  used[0] = true;
  var grew = true, guard2 = 0;
  while (grew && guard2++ < 500){
    grew = false;
    for (var k2 = 0; k2 < parts.length; k2++){
      if (used[k2]) continue;
      var pc = parts[k2].pts, tail = chain[chain.length-1], head = chain[0];
      function rev(list){
        var out = [], m = list.length;
        for (var z = m-1; z >= 0; z--) out.push([list[z][0], list[z][1], z > 0 ? -(list[z-1][2]||0) : 0]);
        return out;
      }
      if (near(tail, pc[0])){ chain[chain.length-1][2] = pc[0][2]||0; for (var z1=1; z1<pc.length; z1++) chain.push(pc[z1].slice()); used[k2]=true; grew=true; break; }
      var r = rev(pc);
      if (near(tail, r[0])){ chain[chain.length-1][2] = r[0][2]||0; for (var z2=1; z2<r.length; z2++) chain.push(r[z2].slice()); used[k2]=true; grew=true; break; }
      if (near(head, pc[pc.length-1])){ chain = pc.slice(0, pc.length-1).map(function(q){return q.slice();}).concat(chain); used[k2]=true; grew=true; break; }
      if (near(head, r[r.length-1])){ chain = r.slice(0, r.length-1).map(function(q){return q.slice();}).concat(chain); used[k2]=true; grew=true; break; }
    }
  }
  if (used.some(function(u){ return !u; })) return null;   // something didn't connect
  var isClosed = near(chain[0], chain[chain.length-1]);
  if (isClosed){
    var b2 = chain[chain.length-1][2] || 0;
    chain.pop();
    chain[chain.length-1][2] = b2 || chain[chain.length-1][2] || 0;
  }
  if (chain.length < 3) return null;
  var allStraight = chain.every(function(q){ return Math.abs(q[2]||0) < 1e-12; });
  return allStraight
    ? {t:'poly', pts: chain.map(function(q){ return [q[0], q[1]]; }), closed: isClosed}
    : {t:'path', pts: chain.map(function(q){ return [q[0], q[1], q[2]||0]; }), closed: isClosed};
}

function doJoin(){
  var tol = 0.05;
  // each fragment is a list of vertices [x,y,bulge]; bulge lives on the vertex that STARTS its span
  var frags = [], src = [];
  var closedCount = 0, circleCount = 0;
  SEL.forEach(function(i){
    var e = DOC.ents[i];
    var f = fragOf(e);
    if (f){ frags.push(f.map(function(v){ return v.slice(); })); src.push(i); }
    else {
      // why was it unusable? closed shapes and full circles have no free ends to chain
      if (e.t === 'circle') circleCount++;
      else if (e.closed) closedCount++;
    }
  });
  if (closedCount || circleCount){
    // closed shapes in the selection: the user wants them merged with their bridges
    var merged = mergeWithBridges(SEL.slice());
    if (merged){
      pushUndo();
      var keepEnts = DOC.ents.filter(function(_, i){ return SEL.indexOf(i) < 0; });
      keepEnts.push(merged);
      DOC.ents = keepEnts;
      SEL = [];
      doJoin.lastMiss = null; doJoin.merged = true;
      return true;
    }
  }
  if (frags.length < 2){
    doJoin.lastMiss = (closedCount || circleCount) ? 'closed' : 'few';
    return false;
  }

  function endpt(f, which){ return which ? f[f.length-1] : f[0]; }
  function near(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]) < tol; }
  // reverse a fragment: vertex order flips AND each span's bulge moves to its new start vertex, negated
  function rev(f){
    var n = f.length, out = [];
    for (var i = n-1; i >= 0; i--){
      var bulge = i > 0 ? -(f[i-1][2] || 0) : 0; // span that was (i-1 -> i) now runs (i -> i-1)
      out.push([f[i][0], f[i][1], bulge]);
    }
    return out;
  }

  var used = frags.map(function(){ return false; });
  var chains = [];
  for (var st = 0; st < frags.length; st++){
    if (used[st]) continue;
    used[st] = true;
    var ch = frags[st].map(function(v){ return v.slice(); });
    var grew = true;
    while (grew){
      grew = false;
      for (var k = 0; k < frags.length; k++){
        if (used[k]) continue;
        var f = frags[k];
        var tail = ch[ch.length-1], head = ch[0];
        // append to tail: tail must coincide with f's start (or reversed f's start)
        if (near(tail, endpt(f, 0))){
          tail[2] = f[0][2] || 0;                       // joint carries the incoming span's bulge
          for (var a = 1; a < f.length; a++) ch.push(f[a].slice());
          used[k] = true; grew = true; break;
        }
        if (near(tail, endpt(f, 1))){
          var fr = rev(f);
          tail[2] = fr[0][2] || 0;
          for (var a2 = 1; a2 < fr.length; a2++) ch.push(fr[a2].slice());
          used[k] = true; grew = true; break;
        }
        // prepend to head: f's end must coincide with head
        if (near(head, endpt(f, 1))){
          var pre = f.slice(0, f.length-1);           // f minus its last vertex (which == head)
          ch = pre.map(function(v){ return v.slice(); }).concat(ch);
          used[k] = true; grew = true; break;
        }
        if (near(head, endpt(f, 0))){
          var fr2 = rev(f);
          var pre2 = fr2.slice(0, fr2.length-1);
          ch = pre2.map(function(v){ return v.slice(); }).concat(ch);
          used[k] = true; grew = true; break;
        }
      }
    }
    // close if the chain's two ends meet
    var closed = ch.length > 2 && near(ch[0], ch[ch.length-1]);
    if (closed){
      // ch[last] duplicates ch[0]. The closing span is ch[last-1] -> ch[0].
      // Its bulge must live on ch[last-1]. If the closing fragment was an arc appended tail-first,
      // its start-bulge was written onto ch[last-1] already (the joint) OR onto the duplicate ch[last].
      // Take whichever is nonzero so the cap survives, then drop the duplicate.
      var dupBulge = ch[ch.length-1][2] || 0;
      ch.pop();
      var lastReal = ch[ch.length-1];
      if (Math.abs(lastReal[2] || 0) < 1e-12 && Math.abs(dupBulge) > 1e-12)
        lastReal[2] = dupBulge;
    }
    chains.push({pts:ch, closed:closed});
  }

  pushUndo();
  var keep = DOC.ents.filter(function(_, i){ return src.indexOf(i) < 0; });
  chains.forEach(function(c){
    var allStraight = c.pts.every(function(pt){ return Math.abs(pt[2] || 0) < 1e-12; });
    keep.push(allStraight
      ? {t:'poly', pts:c.pts.map(function(pt){ return [pt[0], pt[1]]; }), closed:c.closed}
      : {t:'path', pts:c.pts.map(function(pt){ return [pt[0], pt[1], pt[2] || 0]; }), closed:c.closed});
  });
  DOC.ents = keep;
  SEL = [];
  return true;
}
function doExplode(){
  if (!SEL.length) return false;
  var any = false;
  var out = [], victims = {};
  SEL.forEach(function(i){
    var e = DOC.ents[i];
    var parts = [];
    if (e.t === 'rect' || e.t === 'poly'){
      entityEdges(e).forEach(function(ed){ parts.push({t:'line', x1:ed[0], y1:ed[1], x2:ed[2], y2:ed[3]}); });
    } else if (e.t === 'path'){
      var n = e.pts.length, last = e.closed ? n : n-1;
      for (var k = 0; k < last; k++){
        var p0 = e.pts[k], p1 = e.pts[(k+1)%n];
        var b = p0[2] || 0;
        if (Math.abs(b) < 1e-12){
          parts.push({t:'line', x1:p0[0], y1:p0[1], x2:p1[0], y2:p1[1]});
        } else {
          var th = 4*Math.atan(b), ch2 = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
          if (ch2 > 1e-9){
            var r = ch2/(2*Math.sin(Math.abs(th)/2));
            var mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
            var h = Math.sqrt(Math.max(r*r - ch2*ch2/4, 0)) * (th > 0 ? 1 : -1);
            var ux = (p1[0]-p0[0])/ch2, uy = (p1[1]-p0[1])/ch2;
            var cx = mx - uy*h, cy = my + ux*h;
            parts.push({t:'arc', cx:cx, cy:cy, r:r,
                        a0:Math.atan2(p0[1]-cy, p0[0]-cx), a1:Math.atan2(p1[1]-cy, p1[0]-cx), ccw: th > 0});
          }
        }
      }
    }
    if (parts.length){
      any = true; victims[i] = true;
      if (e.tp) parts.forEach(function(pp){ pp.tp = true; });
      out = out.concat(parts);
    }
  });
  if (!any) return false;
  pushUndo();
  DOC.ents = DOC.ents.filter(function(_, i){ return !victims[i]; }).concat(out);
  SEL = [];
  return true;
}

