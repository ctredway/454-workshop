/* ---------------- entity edges (for guide picking + hit test) ---------------- */
function entityEdges(e){
  var out = [];
  if (e.t==='line') out.push([e.x1,e.y1,e.x2,e.y2]);
  else if (e.t==='rect'){
    out.push([e.x,e.y, e.x+e.w,e.y], [e.x+e.w,e.y, e.x+e.w,e.y+e.h],
             [e.x+e.w,e.y+e.h, e.x,e.y+e.h], [e.x,e.y+e.h, e.x,e.y]);
  }
  else if (e.t==='poly'){
    for (var i=0;i<e.pts.length-1;i++) out.push([e.pts[i][0],e.pts[i][1],e.pts[i+1][0],e.pts[i+1][1]]);
    if (e.closed && e.pts.length>2){
      var l=e.pts[e.pts.length-1], f=e.pts[0];
      out.push([l[0],l[1],f[0],f[1]]);
    }
  }
  return out;
}
function allEdges(){
  var out = [];
  var sr = stockRect();
  [[sr.x0,sr.y0,sr.x1,sr.y0],[sr.x1,sr.y0,sr.x1,sr.y1],
   [sr.x1,sr.y1,sr.x0,sr.y1],[sr.x0,sr.y1,sr.x0,sr.y0]].forEach(function(ed){ out.push({ed:ed, ent:-1}); });
  DOC.ents.forEach(function(e,i){ entityEdges(e).forEach(function(ed){ out.push({ed:ed, ent:i}); }); });
  return out;
}
function distToSeg(px,py, x1,y1,x2,y2){
  var dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy;
  var t = L2 ? Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy)/L2)) : 0;
  return Math.hypot(px-(x1+dx*t), py-(y1+dy*t));
}
function pickEdge(w){
  var tol = 8/VIEW.scale, best = null;
  allEdges().forEach(function(o){
    var d = distToSeg(w.x,w.y, o.ed[0],o.ed[1],o.ed[2],o.ed[3]);
    if (d < tol && (!best || d < best.d)) best = {d:d, ed:o.ed, ent:o.ent};
  });
  return best;
}
function pickEntity(w){
  var tol = 7/VIEW.scale, best = null;
  DOC.ents.forEach(function(e,i){
    if (!entEditable(e)) return;                       // hidden or locked layer
    var d = 1e9;
    if (e.t==='circle') d = Math.abs(Math.hypot(w.x-e.cx, w.y-e.cy) - e.r);
    else if (e.t==='arc') d = arcHitDist(e, w);
    else if (e.t==='path'){
      var tp = e._tess || (e._tess = tessPath(e, 0.25));
      for (var pk = 0; pk < tp.length - (e.closed ? 0 : 1); pk++){
        var q1 = tp[pk], q2 = tp[(pk+1) % tp.length];
        d = Math.min(d, distToSeg(w.x, w.y, q1[0], q1[1], q2[0], q2[1]));
      }
    }
    else if (e.t==='text') d = textHitDist(e, w);
    else if (e.t==='group'){
      // a group is hit when any of its members is hit
      e.ents.forEach(function(me){
        var md = 1e9;
        if (me.t==='text') md = textHitDist(me, w);
        else if (me.t==='circle') md = Math.abs(Math.hypot(w.x-me.cx, w.y-me.cy) - me.r);
        else if (me.t==='arc') md = arcHitDist(me, w);
        else if (me.t==='path'){
          var mt = tessPath(me, 0.25);
          for (var mk = 0; mk < mt.length - (me.closed ? 0 : 1); mk++){
            var r1 = mt[mk], r2 = mt[(mk+1) % mt.length];
            md = Math.min(md, distToSeg(w.x, w.y, r1[0], r1[1], r2[0], r2[1]));
          }
        }
        else entityEdges(me).forEach(function(ed){ md = Math.min(md, distToSeg(w.x,w.y, ed[0],ed[1],ed[2],ed[3])); });
        d = Math.min(d, md);
      });
    }
    else entityEdges(e).forEach(function(ed){ d = Math.min(d, distToSeg(w.x,w.y, ed[0],ed[1],ed[2],ed[3])); });
    if (d < tol && (!best || d < best.d)) best = {i:i, d:d};
  });
  return best ? best.i : null;
}

