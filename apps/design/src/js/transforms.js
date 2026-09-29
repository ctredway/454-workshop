function entBBox(e){
  var xs = [], ys = [];
  if (e.t === 'group'){
    var gb = null;
    e.ents.forEach(function(me){
      var b = entBBox(me);
      gb = gb ? {x0:Math.min(gb.x0,b.x0), y0:Math.min(gb.y0,b.y0), x1:Math.max(gb.x1,b.x1), y1:Math.max(gb.y1,b.y1)} : b;
    });
    return gb || {x0:0,y0:0,x1:0,y1:0};
  }
  if (e.t === 'text'){
    var tw2 = textWorld(e);
    if (tw2 && tw2.length) tw2.forEach(function(ct){ ct.forEach(function(q){ xs.push(q[0]); ys.push(q[1]); }); });
    else textCorners(e).forEach(function(q){ xs.push(q[0]); ys.push(q[1]); });
    return {x0:Math.min.apply(null,xs), y0:Math.min.apply(null,ys), x1:Math.max.apply(null,xs), y1:Math.max.apply(null,ys)};
  }
  if (e.t === 'circle'){ xs = [e.cx-e.r, e.cx+e.r]; ys = [e.cy-e.r, e.cy+e.r]; }
  else if (e.t === 'arc'){
    var sw = arcSweepOf(e.a0, e.a1, e.ccw);
    for (var k = 0; k <= 16; k++){
      var q = arcPtAt(e, sw*k/16);
      xs.push(q.x); ys.push(q.y);
    }
  }
  else if (e.t === 'path'){
    // exact: every vertex, plus each arc span's extreme points (where it crosses 0/90/180/270 deg)
    var n = e.pts.length, last = e.closed ? n : n - 1;
    e.pts.forEach(function(q){ xs.push(q[0]); ys.push(q[1]); });
    for (var k = 0; k < last; k++){
      var p0 = e.pts[k], p1 = e.pts[(k+1) % n], bg = p0[2] || 0;
      if (Math.abs(bg) < 1e-12) continue;
      var th = 4 * Math.atan(bg), ch = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
      if (ch < 1e-12) continue;
      var rS = ch / (2 * Math.sin(th/2)), apo = rS * Math.cos(th/2);
      var ux = (p1[0]-p0[0]) / ch, uy = (p1[1]-p0[1]) / ch;
      var cx = (p0[0]+p1[0])/2 - uy*apo, cy = (p0[1]+p1[1])/2 + ux*apo, R = Math.abs(rS);
      var a0 = Math.atan2(p0[1]-cy, p0[0]-cx);
      for (var q4 = 0; q4 < 4; q4++){
        var ang = q4 * Math.PI / 2;
        var d = th > 0 ? angNorm(ang - a0) : angNorm(a0 - ang);   // how far along the sweep
        if (d > 1e-12 && d < Math.abs(th) - 1e-12){ xs.push(cx + R*Math.cos(ang)); ys.push(cy + R*Math.sin(ang)); }
      }
    }
  }
  else entityEdges(e).forEach(function(ed){ xs.push(ed[0], ed[2]); ys.push(ed[1], ed[3]); });
  return {x0:Math.min.apply(null,xs), y0:Math.min.apply(null,ys),
          x1:Math.max.apply(null,xs), y1:Math.max.apply(null,ys)};
}
function selBBox(){
  var b = null;
  SEL.forEach(function(i){
    var eb = entBBox(DOC.ents[i]);
    if (!b) b = eb;
    else b = {x0:Math.min(b.x0,eb.x0), y0:Math.min(b.y0,eb.y0), x1:Math.max(b.x1,eb.x1), y1:Math.max(b.y1,eb.y1)};
  });
  return b;
}
function rotPt(x, y, cx, cy, ca, sa){
  var dx = x-cx, dy = y-cy;
  return [cx + dx*ca - dy*sa, cy + dx*sa + dy*ca];
}
function rotateEnt(e, cx, cy, ang){
  if (e.t === 'group'){ e.ents.forEach(function(me){ rotateEnt(me, cx, cy, ang); }); return; }
  var ca = Math.cos(ang), sa = Math.sin(ang);
  if (e.t === 'text'){
    var tr = rotPt(e.x, e.y, cx, cy, ca, sa); e.x = tr[0]; e.y = tr[1];
    e.rot = (e.rot || 0) + ang;
    return;
  }
  if (e.t === 'rect'){ // rotation breaks axis alignment: become a closed poly first
    var pp = [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]];
    e.t = 'poly'; e.pts = pp; e.closed = true;
    delete e.x; delete e.y; delete e.w; delete e.h;
  }
  if (e.t === 'line'){
    var a = rotPt(e.x1,e.y1,cx,cy,ca,sa), b = rotPt(e.x2,e.y2,cx,cy,ca,sa);
    e.x1=a[0]; e.y1=a[1]; e.x2=b[0]; e.y2=b[1];
  }
  else if (e.t === 'circle'){ var c = rotPt(e.cx,e.cy,cx,cy,ca,sa); e.cx=c[0]; e.cy=c[1]; }
  else if (e.t === 'arc'){
    var c2 = rotPt(e.cx,e.cy,cx,cy,ca,sa); e.cx=c2[0]; e.cy=c2[1];
    e.a0 += ang; e.a1 += ang;
  }
  else if (e.t === 'poly'){ e.pts = e.pts.map(function(pt){ return rotPt(pt[0],pt[1],cx,cy,ca,sa); }); }
  else if (e.t === 'path'){
    e.pts = e.pts.map(function(pt){ var q = rotPt(pt[0],pt[1],cx,cy,ca,sa); return [q[0], q[1], pt[2]||0]; });
    e._tess = null; e._tess2 = null;
  }
}
function mirPt(x, y, px, py, ux, uy){
  // reflect across line through (px,py) with unit direction (ux,uy)
  var dx = x-px, dy = y-py;
  var d = dx*ux + dy*uy;
  var rx = 2*(px + d*ux) - x, ry = 2*(py + d*uy) - y;
  return [rx, ry];
}
function mirrorEnt(e, px, py, ux, uy){
  if (e.t === 'group'){ e.ents.forEach(function(me){ mirrorEnt(me, px, py, ux, uy); }); return; }
  var phi = Math.atan2(uy, ux);
  if (e.t === 'text'){
    var tm = mirPt(e.x, e.y, px, py, ux, uy); e.x = tm[0]; e.y = tm[1];
    e.rot = 2*phi - (e.rot || 0);
    e.fy = !e.fy;
    return;
  }
  if (e.t === 'rect'){
    var axisVert = Math.abs(ux) < 1e-9, axisHorz = Math.abs(uy) < 1e-9;
    if (axisVert || axisHorz){ // stays a rect
      var a = mirPt(e.x, e.y, px, py, ux, uy), b = mirPt(e.x+e.w, e.y+e.h, px, py, ux, uy);
      e.x = Math.min(a[0], b[0]); e.y = Math.min(a[1], b[1]);
      return;
    }
    var pp = [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]];
    e.t = 'poly'; e.pts = pp; e.closed = true;
    delete e.x; delete e.y; delete e.w; delete e.h;
  }
  if (e.t === 'line'){
    var a2 = mirPt(e.x1,e.y1,px,py,ux,uy), b2 = mirPt(e.x2,e.y2,px,py,ux,uy);
    e.x1=a2[0]; e.y1=a2[1]; e.x2=b2[0]; e.y2=b2[1];
  }
  else if (e.t === 'circle'){ var c = mirPt(e.cx,e.cy,px,py,ux,uy); e.cx=c[0]; e.cy=c[1]; }
  else if (e.t === 'arc'){
    var c2 = mirPt(e.cx,e.cy,px,py,ux,uy); e.cx=c2[0]; e.cy=c2[1];
    e.a0 = 2*phi - e.a0; e.a1 = 2*phi - e.a1;
    e.ccw = !e.ccw;
  }
  else if (e.t === 'poly'){ e.pts = e.pts.map(function(pt){ return mirPt(pt[0],pt[1],px,py,ux,uy); }); }
  else if (e.t === 'path'){
    e.pts = e.pts.map(function(pt){ var q = mirPt(pt[0],pt[1],px,py,ux,uy); return [q[0], q[1], -(pt[2]||0)]; });
    e._tess = null; e._tess2 = null;
  }
}
// Scale an entity about (ox,oy) by (sx,sy), in place. Proportional scaling keeps every shape
// type as it is. Stretching one direction turns circles and arcs into ellipses, which can't stay
// circles, so those become closed/open outlines; paths with arcs likewise. Text stays editable.
var SCALE_NOTE = null;
function morphEnt(e, n){                         // change an entity's type but keep its identity/flags
  var keep = {_id:e._id, con:e.con, tp:e.tp};
  Object.keys(e).forEach(function(k){ delete e[k]; });
  Object.assign(e, n);
  if (keep._id) e._id = keep._id;
  if (keep.con) e.con = true;
  if (keep.tp) e.tp = true;
}
function scaleEnt(e, ox, oy, sx, sy){
  function X(x){ return ox + (x - ox) * sx; }
  function Y(y){ return oy + (y - oy) * sy; }
  var uniform = Math.abs(sx - sy) < 1e-9;
  if (e.t === 'group'){ e.ents.forEach(function(me){ scaleEnt(me, ox, oy, sx, sy); }); return; }
  if (e.t === 'line'){ e.x1 = X(e.x1); e.y1 = Y(e.y1); e.x2 = X(e.x2); e.y2 = Y(e.y2); return; }
  if (e.t === 'rect'){
    var ax = X(e.x), ay = Y(e.y), bx = X(e.x + e.w), by = Y(e.y + e.h);
    e.x = Math.min(ax, bx); e.y = Math.min(ay, by); e.w = Math.abs(bx - ax); e.h = Math.abs(by - ay);
    return;
  }
  if (e.t === 'poly'){ e.pts = e.pts.map(function(q){ return [X(q[0]), Y(q[1])]; }); return; }
  if (e.t === 'circle'){
    if (uniform){ e.cx = X(e.cx); e.cy = Y(e.cy); e.r *= Math.abs(sx); return; }
    var ell = [];
    for (var k = 0; k < 120; k++){
      var a = k / 120 * 2 * Math.PI;
      ell.push([X(e.cx + e.r * Math.cos(a)), Y(e.cy + e.r * Math.sin(a))]);
    }
    morphEnt(e, {t:'poly', pts:ell, closed:true}); SCALE_NOTE = 'ellipse';
    return;
  }
  if (e.t === 'arc'){
    if (uniform){ e.cx = X(e.cx); e.cy = Y(e.cy); e.r *= Math.abs(sx); return; }
    var sw0 = arcSweepOf(e.a0, e.a1, e.ccw), st = Math.max(8, Math.ceil(sw0 / 0.05)), ap = [];
    for (var j = 0; j <= st; j++){ var q = arcPtAt(e, sw0 * j / st); ap.push([X(q.x), Y(q.y)]); }
    morphEnt(e, {t:'poly', pts:ap, closed:false}); SCALE_NOTE = 'ellipse';
    return;
  }
  if (e.t === 'path'){
    var curved = e.pts.some(function(q){ return Math.abs(q[2] || 0) > 1e-12; });
    if (uniform || !curved){
      e.pts = e.pts.map(function(q){ return [X(q[0]), Y(q[1]), q[2] || 0]; });  // bulge survives uniform scale
      e._tess = null; e._tess2 = null;
      return;
    }
    var tp = tessPath(e, 0.01).map(function(q){ return [X(q[0]), Y(q[1])]; });
    morphEnt(e, {t:'poly', pts:tp, closed:!!e.closed}); SCALE_NOTE = 'ellipse';
    return;
  }
  if (e.t === 'text'){
    var tx = X(e.x), ty = Y(e.y); e.x = tx; e.y = ty;
    if (uniform){ e.h *= Math.abs(sx); return; }
    var r = (((e.rot || 0) % Math.PI) + Math.PI) % Math.PI;
    if (r < 1e-6 || Math.abs(r - Math.PI) < 1e-6){          // reads left-right: h follows y, width follows x
      e.h *= sy; e.sw = (e.sw || 1) * sx / sy;
    } else if (Math.abs(r - Math.PI/2) < 1e-6){             // turned 90 degrees: axes swap
      e.h *= sx; e.sw = (e.sw || 1) * sy / sx;
    } else {                                                 // angled text can't stretch along world axes
      e.h *= Math.sqrt(sx * sy); SCALE_NOTE = 'text';
    }
    return;
  }
}
