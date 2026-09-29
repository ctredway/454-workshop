// PREVIEWS FOR TRIM AND EXTEND
// The preview runs the real operation on a throwaway copy of the affected shape and then shows
// the difference, so what is highlighted is exactly what will happen: no second implementation
// to drift out of step.
var DRY = false;
function dryEdit(idx, fn){
  var savedEnts = DOC.ents, savedDims = DOC.dims;
  DOC.ents = savedEnts.slice();                    // only the target is replaced, so a shallow copy is enough
  DOC.ents[idx] = cloneEnt(savedEnts[idx]);
  DOC.dims = (savedDims || []).slice();
  DRY = true;
  var ok = false, after = null;
  try { ok = fn(); after = DOC.ents; } catch (err) { ok = false; }
  DRY = false;
  DOC.ents = savedEnts; DOC.dims = savedDims;
  return ok ? after : null;
}
function samplePts(e, n){                          // an ordered run of points along a shape
  n = n || 160;
  var out = [];
  if (e.t === 'line'){ for (var i = 0; i <= n; i++) out.push([e.x1 + (e.x2-e.x1)*i/n, e.y1 + (e.y2-e.y1)*i/n]); }
  else if (e.t === 'circle'){ for (var k = 0; k <= n; k++){ var a = k/n*2*Math.PI; out.push([e.cx + e.r*Math.cos(a), e.cy + e.r*Math.sin(a)]); } }
  else if (e.t === 'arc'){ var sw = arcSweepOf(e.a0, e.a1, e.ccw); for (var j = 0; j <= n; j++){ var q = arcPtAt(e, sw*j/n); out.push([q.x, q.y]); } }
  else if (e.t === 'path'){ out = tessPath(e, 0.08).map(function(q){ return [q[0], q[1]]; }); if (e.closed && out.length) out.push(out[0]); }
  else if (e.t === 'poly'){ out = e.pts.map(function(q){ return [q[0], q[1]]; }); if (e.closed && out.length) out.push(out[0]); }
  else if (e.t === 'rect'){ out = [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h],[e.x,e.y]]; }
  return out;
}
function ptsToSegs(list){
  var segs = [];
  list.forEach(function(pts){ for (var i = 0; i + 1 < pts.length; i++) segs.push([pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]]); });
  return segs;
}
// the parts of `pts` that no segment in `segs` covers, as runs of points
function partsAwayFrom(pts, segs, tol){
  var runs = [], run = [];
  pts.forEach(function(p){
    var on = false;
    for (var i = 0; i < segs.length && !on; i++) if (distToSeg(p[0], p[1], segs[i][0], segs[i][1], segs[i][2], segs[i][3]) < tol) on = true;
    if (on){ if (run.length > 1) runs.push(run); run = []; }
    else run.push(p);
  });
  if (run.length > 1) runs.push(run);
  return runs;
}
function trimPreview(w){
  var idx = pickEntity(w);
  if (idx === null || !DOC.ents[idx]) return null;
  var orig = DOC.ents[idx];
  var after = dryEdit(idx, function(){ return doTrim(w); });
  if (!after) return null;
  var grew = after.length - DOC.ents.length;
  var kept = after.slice(idx, idx + 1 + grew).filter(Boolean);
  var keptSegs = ptsToSegs(kept.map(function(k){ return samplePts(k); }));
  return partsAwayFrom(samplePts(orig), keptSegs, 0.08);      // what disappears
}
function extendPreview(w){
  var idx = pickEntity(w);
  if (idx === null || !DOC.ents[idx]) return null;
  var orig = DOC.ents[idx];
  var after = dryEdit(idx, function(){ return doExtend(w); });
  if (!after || !after[idx]) return null;
  var origSegs = ptsToSegs([samplePts(orig)]);
  return partsAwayFrom(samplePts(after[idx]), origSegs, 0.08); // what gets added
}
function drawEntityOutline(e){
  ctx.beginPath();
  if (e.t === 'line'){ var a=w2s(e.x1,e.y1), b=w2s(e.x2,e.y2); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
  else if (e.t === 'rect'){ var r1=w2s(e.x,e.y+e.h), r2=w2s(e.x+e.w,e.y); ctx.rect(r1.x,r1.y,r2.x-r1.x,r2.y-r1.y); }
  else if (e.t === 'circle'){ var c=w2s(e.cx,e.cy); ctx.arc(c.x,c.y,e.r*VIEW.scale,0,Math.PI*2); }
  else if (e.t === 'arc'){ var ca=w2s(e.cx,e.cy); ctx.arc(ca.x,ca.y,e.r*VIEW.scale,-e.a0,-e.a1,e.ccw); }
  else if (e.pts){ var tp=(e.t==='path')?tessPath(e):e.pts.map(function(q){return [q[0],q[1]];}); var f=w2s(tp[0][0],tp[0][1]); ctx.moveTo(f.x,f.y); for(var i=1;i<tp.length;i++){var q=w2s(tp[i][0],tp[i][1]); ctx.lineTo(q.x,q.y);} if(e.closed)ctx.closePath(); }
  ctx.stroke();
}

