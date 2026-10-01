function toolCommitText(txt){
  if (shapeToolText(txt)) return;
  if (DRAW && DRAW.stage === 'dimEdit2'){
    var ea = DOC.ents[DRAW.a], eb = DOC.ents[DRAW.b];
    if (!ea || !eb){ DRAW = null; hidePrompt(); return; }
    var rawT = txt.trim();
    var wantEdge = /^[eE]/.test(rawT) || /[eE]$/.test(rawT);
    var vv = parseFloat(rawT.replace(/[eE]/g, ''));
    if (isNaN(vv) || vv <= 0) return;
    pushUndo();
    var _leaveDim = true;   // D-key edits also drop a persistent dimension (user asked for both)
    // the edges clicked when each was selected, worked out now, before anything moves
    var hA = hintOf(ea, SELAT[entId(ea)]), hB = hintOf(eb, SELAT[entId(eb)]);
    if (relApply(ea, eb, vv, wantEdge, hA, hB)){
      if (_leaveDim && !dimsArr().some(function(x){ return sameDistance(x, ea, eb, hA, hB); }))
        addDim({kind:'pair', a:entId(ea), b:entId(eb), edge:!!wantEdge, aAt:hA, bAt:hB}); DRAW = null; hidePrompt(); persist(); draw(); updateReadout(); }
    else { UNDO.pop(); if (relApply.why){ toast('warn', 'Couldn\u2019t set that distance', relApply.why); relApply.why = null; } }
    return;
  }
  if (DRAW && DRAW.stage === 'dimEdit'){
    var ent = DOC.ents[DRAW.ent];
    if (!ent){ DRAW = null; hidePrompt(); return; }
    txt = txt.trim();
    if (ent.t === 'line'){
      var pol = txt.split('<');
      var len = lenIn(pol[0]);
      if (isNaN(len) || len <= 0) return;
      var dx = ent.x2-ent.x1, dy = ent.y2-ent.y1;
      var ang = pol.length === 2 ? parseFloat(pol[1])*Math.PI/180 : Math.atan2(dy,dx);
      if (isNaN(ang)) return;
      pushUndo();
      ent.x2 = ent.x1 + len*Math.cos(ang);
      ent.y2 = ent.y1 + len*Math.sin(ang);
    } else if (ent.t === 'circle'){
      var mc = txt.match(/^([DdRr])?\s*(.+)$/);
      if (!mc) return;
      var v = lenIn(mc[2]);
      if (isNaN(v) || v <= 0) return;
      pushUndo();
      ent.r = (mc[1] && mc[1].toUpperCase() === 'R') ? v : v/2; // bare number = diameter
    } else if (ent.t === 'arc'){
      var va = lenIn(txt.replace(/^[Rr]\s*/, ''));
      if (isNaN(va) || va <= 0) return;
      pushUndo();
      ent.r = va;
    } else if (ent.t === 'rect'){
      var mr = txt.split(',');
      if (mr.length !== 2) return;
      var wv = lenIn(mr[0]), hv = lenIn(mr[1]);
      if (isNaN(wv) || isNaN(hv) || wv <= 0 || hv <= 0) return;
      pushUndo();
      ent.w = wv; ent.h = hv;
    } else { DRAW = null; hidePrompt(); return; }
    DRAW = null; hidePrompt(); persist(); draw(); updateReadout();
    return;
  }
  if (TOOL === 'poly' && DRAW && DRAW.pts){
    if (txt.trim() === ''){ // Enter with nothing typed = finish open polyline
      if (DRAW.pts.length > 1){ pushUndo(); DOC.ents.push({t:'poly', pts:DRAW.pts, closed:false}); DRAW=null; stagePrompt('poly0'); persist(); draw(); }
      return;
    }
    var last = DRAW.pts[DRAW.pts.length-1];
    var pv = parseNumericPoint(txt, {x:last[0], y:last[1]});
    if (pv && Math.hypot(pv.x-last[0], pv.y-last[1]) > 1e-6){ DRAW.pts.push([pv.x, pv.y]); draw(); }
    return;
  }
  if (TOOL === 'arc'){
    if (!DRAW){
      var pa = parseNumericPoint(txt, null);
      if (pa){ DRAW = {stage:1, ax:pa.x, ay:pa.y}; stagePrompt('arc1'); draw(); }
      return;
    }
    if (DRAW.stage === 1){
      var pb = parseNumericPoint(txt, {x:DRAW.ax, y:DRAW.ay}); // "@dx,dy" and "10<45" relative to start
      if (pb && Math.hypot(pb.x-DRAW.ax, pb.y-DRAW.ay) > 1e-6){
        DRAW.bx = pb.x; DRAW.by = pb.y; DRAW.stage = 2; stagePrompt('arc2'); draw();
      }
      return;
    }
    if (DRAW.stage === 2){
      var rv = lenIn(txt);
      if (!isNaN(rv) && Math.abs(rv) > 1e-6){
        var g2 = arcFrom2R({x:DRAW.ax,y:DRAW.ay}, {x:DRAW.bx,y:DRAW.by}, rv);
        if (g2){
          pushUndo();
          DOC.ents.push({t:'arc', cx:g2.cx, cy:g2.cy, r:g2.r, a0:g2.a0, a1:g2.a1, ccw:g2.ccw});
          DRAW = null; stagePrompt('arc0'); persist(); draw();
        }
      }
      return;
    }
  }
  if (TOOL === 'offset'){
    if (!SEL.length){ stagePrompt('selFirst'); return; }
    var od = lenIn(txt);
    if (!isNaN(od) && Math.abs(od) > 1e-9){
      pushUndo();
      var made = [];
      var offsetTextSkipped = false;
      SEL.forEach(function(i){
        if (DOC.ents[i].t === 'text'){ offsetTextSkipped = true; return; }
        var ne = offsetEnt(DOC.ents[i], od);
        if (ne){
          if (DOC.ents[i].tp) ne.tp = true;
          if (DOC.ents[i].con) ne.con = true;
          made.push(DOC.ents.length);
          DOC.ents.push(ne);
        }
      });
      if (offsetTextSkipped)
        toast('info', 'Text was skipped', 'Offset works on shapes. Convert the text to curves first to offset it.');
      if (made.length){
        SEL = made; persist();                     // chain: offset again offsets the new ring
        toast('ok', 'Offset created', made.length + ' offset shape(s) at ' + od + ' mm.');
      } else {
        toast('warn', 'Could not offset', 'The distance may be too large for the shape (an inward offset can collapse it). Try a smaller value.');
      }
      stagePrompt('offset0'); draw();
    }
    return;
  }
  if (TOOL === 'copy'){
    if (!SEL.length){ stagePrompt('selFirst'); return; }
    var base = DRAW ? {x:DRAW.bx, y:DRAW.by} : {x:0, y:0};
    var pc = parseNumericPoint(txt, base);
    if (pc){
      var dx = DRAW ? pc.x - DRAW.bx : pc.x, dy = DRAW ? pc.y - DRAW.by : pc.y;
      if (!DRAW && txt.charAt(0) !== '@'){ return; } // absolute point without a base is ambiguous
      applySel(true, function(en){ moveEntity(en, dx, dy); });
      DRAW = null; stagePrompt('copy0'); persist(); draw();
    }
    return;
  }
  if (TOOL === 'mirror') return;                   // mirroring is the panel's job
  if (TOOL === 'rotate'){
    if (!SEL.length){ stagePrompt('selFirst'); return; }
    if (!DRAW){
      var pr2 = parseNumericPoint(txt, null);
      if (pr2){ DRAW = {stage:1, cx:pr2.x, cy:pr2.y}; stagePrompt('rotate1'); draw(); }
      return;
    }
    var angDeg = parseFloat(txt);
    if (!isNaN(angDeg) && Math.abs(angDeg) > 1e-9){
      applySel(false, (function(cx3,cy3,ang3){ return function(en){ rotateEnt(en, cx3, cy3, ang3); }; })(DRAW.cx, DRAW.cy, angDeg*Math.PI/180));
      DRAW = null; stagePrompt('rotate0'); persist(); draw();
    }
    return;
  }
  if (TOOL === 'array'){
    if (!SEL.length){ stagePrompt('selFirst'); return; }
    var at = txt.trim();
    var mLin = at.match(/^(\d+)\s*@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
    var mCirc = at.match(/^(\d+)\s*<\s*(-?[\d.]+)$/);
    if (mLin && !DRAW){
      var nL = parseInt(mLin[1],10), ddx = lenIn(mLin[2]), ddy = lenIn(mLin[3]);
      if (nL >= 2 && nL <= 500){
        pushUndo();
        var srcL = SEL.slice();
        for (var kL = 1; kL < nL; kL++){
          srcL.forEach(function(i2){
            var cL = cloneEnt(DOC.ents[i2]);
            moveEntity(cL, ddx*kL, ddy*kL);
            DOC.ents.push(cL);
          });
        }
        stagePrompt('array0'); persist(); draw();
      }
      return;
    }
    if (mCirc && DRAW){
      var nC = parseInt(mCirc[1],10), step = parseFloat(mCirc[2])*Math.PI/180;
      if (nC >= 2 && nC <= 500 && Math.abs(step) > 1e-9){
        pushUndo();
        var srcC = SEL.slice();
        for (var kC = 1; kC < nC; kC++){
          srcC.forEach(function(i3){
            var cC = cloneEnt(DOC.ents[i3]);
            rotateEnt(cC, DRAW.cx, DRAW.cy, step*kC);
            DOC.ents.push(cC);
          });
        }
        DRAW = null; stagePrompt('array0'); persist(); draw();
      }
      return;
    }
    return;
  }
  if (DRAW && DRAW.stage === 'dimValue'){
    var dd = DOC.dims[DRAW.di];
    if (!dd){ DRAW = null; DIMSEL = null; hidePrompt(); return; }
    // a measurement in the shown units (with 1/2, 12 1/2 or a unit), with e for "to the edge", or an expression
    // using parameters (dado, shelf_gap * 2), which the dimension then remembers (dimension-params.js)
    var rd = dimReadTyped(txt);
    if (rd.why){ toast('warn', 'Could not work that out', rd.why); return; }
    var vD = rd.v;
    if (isNaN(vD) || vD <= 0){ if (rd.expr) toast('warn', 'That’s not a size', rd.expr + ' comes to ' + fmtDisp(vD) + ' ' + unitTag() + '. A size has to be more than 0.'); return; }
    pushUndo();
    var wasEdge = dd.edge, wasExpr = dd.expr, wasUnit = dd.exprUnit;
    if (rd.edge && dd.kind === 'pair') dd.edge = true;
    if (rd.expr){ dd.expr = rd.expr; dd.exprUnit = rd.unit; } else { delete dd.expr; delete dd.exprUnit; }   // a plain number unlinks it
    if (dimApply(dd, vD)){
      var failedD = rd.expr ? paramsApplyDims() : [];
      DRAW = null; DIMSEL = null; stagePrompt('dim0'); persist(); draw();
      toast('ok', 'Dimension applied', 'Set to ' + fmtDisp(vD) + ' ' + unitTag() + (rd.expr ? ', from ' + rd.expr + '. It follows if that changes.' : '.'));
      paramsSayFailed(failedD);
    } else {
      UNDO.pop();                                       // nothing changed: nothing to undo
      dd.edge = wasEdge; if (wasExpr){ dd.expr = wasExpr; dd.exprUnit = wasUnit; } else { delete dd.expr; delete dd.exprUnit; }
      toast('warn', 'Could not apply that', relApply.why || dimApply.why || 'The dimension could not drive this geometry.');
      relApply.why = dimApply.why = null;
    }
    return;
  }
  if (DRAW && DRAW.stage === 'nodeXY'){
    var pe2 = DOC.ents[DRAW.ent], pp = nodePtsOf(pe2);
    if (!pp){ DRAW = null; hidePrompt(); return; }
    var mxy = txt.split(',');
    if (mxy.length === 2){
      var nx2 = lenIn(mxy[0]), ny2 = lenIn(mxy[1]);
      if (!isNaN(nx2) && !isNaN(ny2)){
        pushUndo();
        pe2.pts[DRAW.vi][0] = nx2; pe2.pts[DRAW.vi][1] = ny2;
        pe2._tess = null; pe2._tess2 = null;
        DRAW = null; stagePrompt('node1'); persist(); draw();
        toast('ok', 'Point moved', 'Set to ' + nx2.toFixed(2) + ', ' + ny2.toFixed(2) + '.');
      }
    }
    return;
  }
  if (DRAW && DRAW.stage === 'nodeLen'){
    var pe3 = DOC.ents[DRAW.ent], pp3 = nodePtsOf(pe3);
    if (!pp3){ DRAW = null; hidePrompt(); return; }
    var wantL = lenIn(txt);
    if (!isNaN(wantL) && wantL > 0){
      var m3 = pp3.length, ia = DRAW.seg, ib = (DRAW.seg+1) % m3;
      var ax3 = pp3[ia][0], ay3 = pp3[ia][1], bx3 = pp3[ib][0], by3 = pp3[ib][1];
      var curL = Math.hypot(bx3-ax3, by3-ay3);
      if (curL > 1e-9){
        pushUndo();
        var ux3 = (bx3-ax3)/curL, uy3 = (by3-ay3)/curL;
        pe3.pts[ib][0] = ax3 + ux3*wantL;
        pe3.pts[ib][1] = ay3 + uy3*wantL;
        pe3._tess = null; pe3._tess2 = null;
        DRAW = null; stagePrompt('node1'); persist(); draw();
        toast('ok', 'Segment resized', 'Set to ' + wantL.toFixed(2) + ' mm.');
      }
    }
    return;
  }
  if (TOOL === 'fillet'){
    var fr = lenIn(txt);
    if (!isNaN(fr) && fr > 0 && isFinite(fr) && fr <= 10000){
      UICFG.filletR = fr;
      uiCfgSave();
      stagePrompt('fillet0');
    } else if (!isNaN(fr)){
      stagePrompt('filletBadR');
    }
    return;
  }
  if (TOOL === 'guide' && DRAW && DRAW.stage === 'guideOffset'){
    var d = lenIn(txt);
    if (isNaN(d)) return;
    pushUndo();
    // offset toward stock interior for the picked direction: c shifts by d along normal
    DOC.guides.push({t:'gline', a:DRAW.a, b:DRAW.b, c:DRAW.c + d});
    DRAW = null; stagePrompt('guide0'); persist(); draw();
    return;
  }
  if (TOOL === 'line' && DRAW){
    var p = parseNumericPoint(txt, {x:DRAW.x,y:DRAW.y});
    if (p){ pushUndo(); DOC.ents.push({t:'line',x1:DRAW.x,y1:DRAW.y,x2:p.x,y2:p.y}); DRAW={stage:1,x:p.x,y:p.y}; persist(); draw(); }
    return;
  }
  if (TOOL === 'line' && !DRAW){
    var p0 = parseNumericPoint(txt, null);
    if (p0){ DRAW = {stage:1, x:p0.x, y:p0.y}; stagePrompt('line1'); draw(); }
    return;
  }
  if (TOOL === 'rect' && DRAW){
    var m = txt.split(',');
    if (m.length === 2){
      var wv = lenIn(m[0]), hv = lenIn(m[1]);
      if (!isNaN(wv) && !isNaN(hv)){
        pushUndo();
        DOC.ents.push({t:'rect', x:Math.min(DRAW.x, DRAW.x+wv), y:Math.min(DRAW.y, DRAW.y+hv),
                       w:Math.abs(wv), h:Math.abs(hv)});
        DRAW = null; stagePrompt('rect0'); persist(); draw();
      }
    }
    return;
  }
  if (TOOL === 'circle' && DRAW){
    var mm = txt.trim().match(/^([DdRr])\s*(.+)$/);
    if (mm){
      var r = lenIn(mm[2]) / (mm[1].toUpperCase()==='D' ? 2 : 1);
      pushUndo(); DOC.ents.push({t:'circle',cx:DRAW.x,cy:DRAW.y,r:r});
      DRAW = null; stagePrompt('circle0'); persist(); draw();
    }
    return;
  }
  if (TOOL === 'circle' && !DRAW){
    var pc = parseNumericPoint(txt, null);
    if (pc){ DRAW = {stage:1, x:pc.x, y:pc.y}; stagePrompt('circle1'); draw(); }
    return;
  }
}

