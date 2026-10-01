/* ---------------- two-point arc construction ---------------- */
function arcFrom3(A, B, C){
  // circle through A,B,C; arc runs A->B passing through C
  var d = 2*(A.x*(B.y-C.y) + B.x*(C.y-A.y) + C.x*(A.y-B.y));
  if (Math.abs(d) < 1e-9) return null; // collinear
  var a2 = A.x*A.x+A.y*A.y, b2 = B.x*B.x+B.y*B.y, c2 = C.x*C.x+C.y*C.y;
  var cx = (a2*(B.y-C.y) + b2*(C.y-A.y) + c2*(A.y-B.y)) / d;
  var cy = (a2*(C.x-B.x) + b2*(A.x-C.x) + c2*(B.x-A.x)) / d;
  var r = Math.hypot(A.x-cx, A.y-cy);
  var cross = (B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x);
  return {cx:cx, cy:cy, r:r,
          a0:Math.atan2(A.y-cy, A.x-cx), a1:Math.atan2(B.y-cy, B.x-cx),
          ccw: cross < 0};
}
function arcFrom2R(A, B, rSigned){
  var chord = Math.hypot(B.x-A.x, B.y-A.y);
  if (chord < 1e-9) return null;
  var r = Math.max(Math.abs(rSigned), chord/2);
  var h = Math.sqrt(Math.max(r*r - chord*chord/4, 0));
  var ux = (B.x-A.x)/chord, uy = (B.y-A.y)/chord;
  var nx = -uy, ny = ux;                      // left normal of A->B
  var sideLeft = rSigned > 0;                 // bulge side
  var cx = (A.x+B.x)/2 + (sideLeft ? -nx*h : nx*h);   // minor arc: center opposite the bulge
  var cy = (A.y+B.y)/2 + (sideLeft ? -ny*h : ny*h);
  return {cx:cx, cy:cy, r:r,
          a0:Math.atan2(A.y-cy, A.x-cx), a1:Math.atan2(B.y-cy, B.x-cx),
          ccw: !sideLeft};
}

/* ---------------- intersection kernel (edit tools) ---------------- */
function primsOf(e){
  // decompose an entity into line segments + circular pieces for intersection tests
  var out = [];
  if (e.t === 'circle') out.push({c:1, cx:e.cx, cy:e.cy, r:e.r});
  else if (e.t === 'arc') out.push({c:1, cx:e.cx, cy:e.cy, r:e.r, a0:e.a0, a1:e.a1, ccw:e.ccw});
  else if (e.t === 'path') {
    var tp = tessPath(e, 0.08), n = tp.length;
    for (var i=0;i<n-1;i++) out.push({c:0, x1:tp[i][0],y1:tp[i][1],x2:tp[i+1][0],y2:tp[i+1][1]});
    if (e.closed && n>1) out.push({c:0, x1:tp[n-1][0],y1:tp[n-1][1],x2:tp[0][0],y2:tp[0][1]});
  }
  else entityEdges(e).forEach(function(ed){ out.push({c:0, x1:ed[0],y1:ed[1],x2:ed[2],y2:ed[3]}); });
  return out;
}
function angNorm(a){
  if (!isFinite(a)) return 0;
  a = a % (2*Math.PI);
  if (a < 0) a += 2*Math.PI;
  return a;
}
function arcSweepOf(a0, a1, ccw){
  var d = ccw ? angNorm(a1-a0) : angNorm(a0-a1);
  return d < 1e-12 ? 2*Math.PI : d;
}
function angOnArc(pr, ang){
  if (pr.a0 === undefined) return true; // full circle
  var sw = arcSweepOf(pr.a0, pr.a1, pr.ccw);
  var d = pr.ccw ? angNorm(ang - pr.a0) : angNorm(pr.a0 - ang);
  return d <= sw + 1e-9;
}
function xLineLine(x1,y1,x2,y2, x3,y3,x4,y4){
  var d = (x2-x1)*(y4-y3) - (y2-y1)*(x4-x3);
  if (Math.abs(d) < 1e-12) return null;
  var t = ((x3-x1)*(y4-y3) - (y3-y1)*(x4-x3)) / d;
  var u = ((x3-x1)*(y2-y1) - (y3-y1)*(x2-x1)) / d;
  return {t:t, u:u, x:x1+t*(x2-x1), y:y1+t*(y2-y1)};
}
function xLineCircle(x1,y1,x2,y2, cx,cy,r){
  var dx=x2-x1, dy=y2-y1;
  var fx=x1-cx, fy=y1-cy;
  var a=dx*dx+dy*dy, b=2*(fx*dx+fy*dy), c=fx*fx+fy*fy-r*r;
  var disc=b*b-4*a*c;
  if (disc < 0 || a < 1e-15) return [];
  var q=Math.sqrt(disc);
  var out=[];
  [(-b-q)/(2*a), (-b+q)/(2*a)].forEach(function(t){
    out.push({t:t, x:x1+t*dx, y:y1+t*dy});
  });
  if (disc < 1e-12) out.pop(); // tangent: single point
  return out;
}
function xCircleCircle(c1x,c1y,r1, c2x,c2y,r2){
  var dx=c2x-c1x, dy=c2y-c1y, d=Math.hypot(dx,dy);
  if (d < 1e-12 || d > r1+r2+1e-9 || d < Math.abs(r1-r2)-1e-9) return [];
  var a=(r1*r1-r2*r2+d*d)/(2*d);
  var h2=r1*r1-a*a;
  var h=Math.sqrt(Math.max(h2,0));
  var mx=c1x+a*dx/d, my=c1y+a*dy/d;
  var out=[{x:mx+h*(-dy/d), y:my+h*(dx/d)}];
  if (h > 1e-9) out.push({x:mx-h*(-dy/d), y:my-h*(dx/d)});
  return out;
}
// cut parameters on a target line segment (t in (0,1)) from all other entities
function lineCuts(idx){
  var e = DOC.ents[idx], out = [];
  DOC.ents.forEach(function(o, oi){
    if (oi === idx || !entOnSheet(o)) return;
    primsOf(o).forEach(function(pr){
      if (pr.c === 0){
        var h = xLineLine(e.x1,e.y1,e.x2,e.y2, pr.x1,pr.y1,pr.x2,pr.y2);
        if (h && h.u > -1e-4 && h.u < 1+1e-4 && h.t > 1e-6 && h.t < 1-1e-6) out.push(h.t);
      } else {
        xLineCircle(e.x1,e.y1,e.x2,e.y2, pr.cx,pr.cy,pr.r).forEach(function(h2){
          if (h2.t > 1e-9 && h2.t < 1-1e-9 && angOnArc(pr, Math.atan2(h2.y-pr.cy, h2.x-pr.cx))) out.push(h2.t);
        });
      }
    });
  });
  out.sort(function(a,b){ return a-b; });
  return out.filter(function(v,i){ return i === 0 || v - out[i-1] > 1e-7; });
}
// cut angles (as sweep-params s in (0,sweep)) on a target circle/arc
function circCuts(idx){
  var e = DOC.ents[idx], out = [];
  var isArc = e.t === 'arc';
  var a0 = isArc ? e.a0 : 0, ccw = isArc ? e.ccw : true;
  var sw = isArc ? arcSweepOf(e.a0, e.a1, e.ccw) : 2*Math.PI;
  function push(x, y){
    var ang = Math.atan2(y-e.cy, x-e.cx);
    var sp = ccw ? angNorm(ang - a0) : angNorm(a0 - ang);
    // full circle: a0 is arbitrary, a cut AT the reference angle is still a cut
    if (isArc ? (sp > 1e-9 && sp < sw - 1e-9) : (sp < sw - 1e-9)) out.push(sp);
  }
  DOC.ents.forEach(function(o, oi){
    if (oi === idx || !entOnSheet(o)) return;
    primsOf(o).forEach(function(pr){
      if (pr.c === 0){
        xLineCircle(pr.x1,pr.y1,pr.x2,pr.y2, e.cx,e.cy,e.r).forEach(function(h){
          if (h.t > -1e-4 && h.t < 1+1e-4) push(h.x, h.y);
        });
      } else {
        xCircleCircle(e.cx,e.cy,e.r, pr.cx,pr.cy,pr.r).forEach(function(q){
          if (angOnArc(pr, Math.atan2(q.y-pr.cy, q.x-pr.cx))) push(q.x, q.y);
        });
      }
    });
  });
  out.sort(function(a,b){ return a-b; });
  return out.filter(function(v,i){ return i === 0 || v - out[i-1] > 1e-7; });
}
function arcPtAt(e, sp){ // point at sweep-param sp
  var ccw = e.t === 'arc' ? e.ccw : true;
  var a0 = e.t === 'arc' ? e.a0 : 0;
  var a = ccw ? a0 + sp : a0 - sp;
  return {a:a, x:e.cx + e.r*Math.cos(a), y:e.cy + e.r*Math.sin(a)};
}

