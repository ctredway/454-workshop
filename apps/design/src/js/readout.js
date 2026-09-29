/* ---------------- path entity (point+bulge spans) ---------------- */
function tessPath(e, maxAng){
  maxAng = maxAng || 0.12;
  var pts = [], m = e.pts.length;
  var last = e.closed ? m : m - 1;
  for (var k = 0; k < last; k++){
    var p0 = e.pts[k], p1 = e.pts[(k+1) % m];
    pts.push([p0[0], p0[1]]);
    var b = p0[2] || 0;
    if (Math.abs(b) > 1e-9){
      var th = 4*Math.atan(b);            // signed included angle (+ = CCW), correct for any |th|
      var ch = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
      if (ch > 1e-9){
        // signed radius and apothem so the center lands on the correct side (DXF bulge convention):
        var rS = ch/(2*Math.sin(th/2));   // SIGNED radius
        var apo = rS*Math.cos(th/2);      // SIGNED apothem
        var mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
        var ux = (p1[0]-p0[0])/ch, uy = (p1[1]-p0[1])/ch;
        var cx = mx + (-uy)*apo, cy = my + (ux)*apo;   // offset along LEFT normal by signed apothem
        var rAbs = Math.abs(rS);
        var a0 = Math.atan2(p0[1]-cy, p0[0]-cx), a1 = a0 + th;
        var st = Math.max(2, Math.ceil(Math.abs(th)/maxAng));
        for (var q = 1; q < st; q++){
          var a = a0 + (a1-a0)*q/st;
          pts.push([cx + rAbs*Math.cos(a), cy + rAbs*Math.sin(a)]);
        }
      }
    }
  }
  if (!e.closed) pts.push([e.pts[m-1][0], e.pts[m-1][1]]);
  return pts;
}

/* ---------------- entity dimensions ---------------- */
function entDims(e){
  if (e.t === 'text'){
    var fb = entBBox(e), fname = FONTS[e.font] ? FONTS[e.font].name : String(e.font).replace(/^custom:/, '');
    var shown = String(e.str).replace(/\n/g, ' / ');
    if (shown.length > 24) shown = shown.slice(0, 23) + '\u2026';
    return 'Text \u201c' + shown + '\u201d  ' + fname + '  height ' + (+e.h).toFixed(2) +
           '  size ' + (fb.x1-fb.x0).toFixed(2) + ' \u00d7 ' + (fb.y1-fb.y0).toFixed(2) +
           (e.rot ? '  \u2220 ' + (e.rot*180/Math.PI).toFixed(1) + '\u00b0' : '');
  }
  if (e.t === 'line'){
    var dx = e.x2-e.x1, dy = e.y2-e.y1;
    var ang = Math.atan2(dy,dx)*180/Math.PI;
    return 'L ' + Math.hypot(dx,dy).toFixed(2) + '  \u2220 ' + ang.toFixed(1) + '\u00b0';
  }
  if (e.t === 'circle') return '\u00d8 ' + (e.r*2).toFixed(2) + '  R ' + e.r.toFixed(2);
  if (e.t === 'arc')    return 'R ' + e.r.toFixed(2) + '  sweep ' + (arcSweep(e)*180/Math.PI).toFixed(1) + '\u00b0' + (e.ccw ? ' CCW' : ' CW');
  if (e.t === 'rect')   return 'W ' + e.w.toFixed(2) + '  H ' + e.h.toFixed(2);
  if (e.t === 'poly'){
    var L = 0, segs = [];
    entityEdges(e).forEach(function(ed){
      var sl2 = Math.hypot(ed[2]-ed[0], ed[3]-ed[1]);
      L += sl2; segs.push(sl2);
    });
    var extra = '';
    if (segs.length){
      var mn = Math.min.apply(null, segs), mx = Math.max.apply(null, segs);
      extra = '  \u00b7 segs ' + segs.length + ' (' + mn.toFixed(2) + '\u2013' + mx.toFixed(2) + ')';
    }
    return e.pts.length + ' pts  L ' + L.toFixed(2) + (e.closed ? '  closed' : '') + extra;
  }
  if (e.t === 'path'){
    var tp = tessPath(e), PL = 0;
    for (var k = 1; k < tp.length; k++) PL += Math.hypot(tp[k][0]-tp[k-1][0], tp[k][1]-tp[k-1][1]);
    if (e.closed) PL += Math.hypot(tp[0][0]-tp[tp.length-1][0], tp[0][1]-tp[tp.length-1][1]);
    return e.pts.length + ' spans  L ' + PL.toFixed(2) + (e.closed ? '  closed' : '');
  }
  return '';
}

/* ---------------- live dimension readout ---------------- */
function updateReadout(){
  document.getElementById('fx').textContent = MOUSE.snap ? fmtDisp(MOUSE.snap.x) : '—';
  document.getElementById('fy').textContent = MOUSE.snap ? fmtDisp(MOUSE.snap.y) : '—';
  var d = '';
  if (TOOL === 'measure'){
    if (DRAW && DRAW.stage === 'meas1' && MOUSE.snap) d = measText(DRAW.a, MOUSE.snap, false);
    else if (MEAS) d = measText(MEAS.a, MEAS.b, MEAS.gap);
  }
  else if (DRAW && DRAW.stage === 'xform'){
    if (DRAW.h.kind === 'rot') d = 'rotate ' + ((DRAW.ang || 0) * 180 / Math.PI).toFixed(1) + '\u00b0  (Shift snaps to 15\u00b0)';
    else if (DRAW.h.kind === 'pivot') d = 'rotation centre ' + (HANDLES.pivot ? HANDLES.pivot.x.toFixed(2) + ', ' + HANDLES.pivot.y.toFixed(2) : '');
    else {
      var nb = selBBox(), sxp = (DRAW.sx || 1) * 100, syp = (DRAW.sy || 1) * 100;
      d = 'W ' + (nb.x1 - nb.x0).toFixed(2) + '  H ' + (nb.y1 - nb.y0).toFixed(2) + '  ' +
          (Math.abs(sxp - syp) < 1e-6 ? sxp.toFixed(1) + '%' : sxp.toFixed(1) + '% \u00d7 ' + syp.toFixed(1) + '%') +
          (DRAW.h.kind === 'corner' ? '  (Shift stretches freely, Alt scales from centre)' : '');
    }
  }
  else if (DRAW && MOUSE.snap){
    if (TOOL==='line' && DRAW.stage===1){
      var dx=MOUSE.snap.x-DRAW.x, dy=MOUSE.snap.y-DRAW.y;
      d = 'Δ ' + dx.toFixed(2) + ', ' + dy.toFixed(2) + '  L ' + Math.hypot(dx,dy).toFixed(2);
    } else if (TOOL==='rect' && DRAW.stage===1){
      d = 'W ' + Math.abs(MOUSE.snap.x-DRAW.x).toFixed(2) + '  H ' + Math.abs(MOUSE.snap.y-DRAW.y).toFixed(2);
    } else if (TOOL==='circle' && DRAW.stage===1){
      var r = Math.hypot(MOUSE.snap.x-DRAW.x, MOUSE.snap.y-DRAW.y);
      d = 'R ' + r.toFixed(2) + '  D ' + (r*2).toFixed(2);
    } else if (TOOL==='poly' && DRAW.pts && DRAW.pts.length){
      var lastP = DRAW.pts[DRAW.pts.length-1];
      var pdx = MOUSE.snap.x-lastP[0], pdy = MOUSE.snap.y-lastP[1];
      var segL = Math.hypot(pdx, pdy);
      var runT = 0;
      for (var pl = 1; pl < DRAW.pts.length; pl++)
        runT += Math.hypot(DRAW.pts[pl][0]-DRAW.pts[pl-1][0], DRAW.pts[pl][1]-DRAW.pts[pl-1][1]);
      d = 'seg ' + segL.toFixed(2) + '  \u2220 ' + (Math.atan2(pdy,pdx)*180/Math.PI).toFixed(1) + '\u00b0' +
          '  \u00b7 total ' + (runT + segL).toFixed(2) + '  (' + DRAW.pts.length + ' pts)';
    } else if (TOOL==='arc' && DRAW.stage===1){
      d = 'chord ' + Math.hypot(MOUSE.snap.x-DRAW.ax, MOUSE.snap.y-DRAW.ay).toFixed(2);
    } else if (TOOL==='arc' && DRAW.stage===2){
      var gd = arcFrom3({x:DRAW.ax,y:DRAW.ay}, {x:DRAW.bx,y:DRAW.by}, MOUSE.snap);
      if (gd){
        var sw2 = Math.abs(gd.a1-gd.a0); if (gd.ccw ? gd.a1 < gd.a0 : gd.a0 < gd.a1) sw2 = 2*Math.PI - sw2;
        d = 'R ' + gd.r.toFixed(2) + '  sweep ' + (sw2*180/Math.PI).toFixed(1) + '\u00b0';
      } else d = 'straight (collinear)';
    }
  }
  if (!d && TOOL === 'select'){
    if (SEL.length === 1 && DOC.ents[SEL[0]]) d = entDims(DOC.ents[SEL[0]]);
    else if (SEL.length === 2 && DOC.ents[SEL[0]] && DOC.ents[SEL[1]])
      d = relDims(DOC.ents[SEL[0]], DOC.ents[SEL[1]]);
    else if (SEL.length > 2) d = SEL.length + ' selected';
  }
  document.getElementById('fdim').textContent = d;
}

function selToggle(i){
  var at = SEL.indexOf(i);
  if (at >= 0) SEL.splice(at, 1); else SEL.push(i);
}

