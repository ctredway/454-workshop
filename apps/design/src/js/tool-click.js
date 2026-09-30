function toolClick(w, snap){
  var p = snap;
  if (shapeToolClick(p)) return;
  if (TOOL === 'line'){
    if (!DRAW){ DRAW = {stage:1, x:p.x, y:p.y}; stagePrompt('line1'); }
    else { pushUndo(); DOC.ents.push({t:'line',x1:DRAW.x,y1:DRAW.y,x2:p.x,y2:p.y}); DRAW = {stage:1,x:p.x,y:p.y}; persist(); }
  }
  else if (TOOL === 'rect'){
    if (!DRAW){ DRAW = {stage:1, x:p.x, y:p.y}; stagePrompt('rect1'); }
    else {
      pushUndo();
      DOC.ents.push({t:'rect', x:Math.min(DRAW.x,p.x), y:Math.min(DRAW.y,p.y),
                     w:Math.abs(p.x-DRAW.x), h:Math.abs(p.y-DRAW.y)});
      DRAW = null; stagePrompt('rect0'); persist();
    }
  }
  else if (TOOL === 'circle'){
    if (!DRAW){ DRAW = {stage:1, x:p.x, y:p.y}; stagePrompt('circle1'); }
    else {
      pushUndo();
      DOC.ents.push({t:'circle', cx:DRAW.x, cy:DRAW.y, r:Math.hypot(p.x-DRAW.x, p.y-DRAW.y)});
      DRAW = null; stagePrompt('circle0'); persist();
    }
  }
  else if (TOOL === 'measure'){
    if (MOUSE.shift){                                              // shape-to-shape gap
      var hm = pickEntity(w);
      if (hm === null){ toast('info', 'Shift-click a shape', 'To measure the gap between two shapes, Shift-click each one.'); }
      else if (!DRAW || DRAW.stage !== 'measS'){ DRAW = {stage:'measS', ia:hm}; MEAS = null; stagePrompt('measureS'); }
      else if (hm === DRAW.ia){ toast('info', 'Pick a different shape', 'Shift-click a second, different shape to measure the gap between them.'); }
      else {
        var g = entGap(DOC.ents[DRAW.ia], DOC.ents[hm]);
        MEAS = {a:{x:g.a[0], y:g.a[1]}, b:{x:g.b[0], y:g.b[1]}, gap:true};
        DRAW = null; stagePrompt('measure0');
      }
    } else if (!DRAW || DRAW.stage !== 'meas1'){                   // point to point
      DRAW = {stage:'meas1', a:{x:p.x, y:p.y}}; MEAS = null; stagePrompt('measure1');
    } else {
      MEAS = {a:DRAW.a, b:{x:p.x, y:p.y}, gap:false};
      DRAW = null; stagePrompt('measure0');
    }
    updateReadout();                        // show the result now, not on the next mouse move
  }
  else if (TOOL === 'text'){
    var hitT = pickEntity(w);
    if (hitT !== null && DOC.ents[hitT].t === 'text') openTextModal(hitT);
    else openTextModal(null, {x:p.x, y:p.y});
    return;
  }
  else if (TOOL === 'poly'){
    if (!DRAW){ DRAW = {stage:1, pts:[[p.x,p.y]]}; stagePrompt('poly1'); }
    else {
      var f = DRAW.pts[0];
      var lp = DRAW.pts[DRAW.pts.length-1];
      if (DRAW.pts.length > 2 && Math.hypot(p.x-f[0], p.y-f[1]) < 6/VIEW.scale){
        pushUndo(); DOC.ents.push({t:'poly', pts:DRAW.pts, closed:true}); DRAW=null; stagePrompt('poly0'); persist();
      } else if (Math.hypot(p.x-lp[0], p.y-lp[1]) > 1e-6) DRAW.pts.push([p.x,p.y]);   // a double-click doesn't repeat the point
    }
  }
  else if (TOOL === 'arc'){
    if (!DRAW){ DRAW = {stage:1, ax:p.x, ay:p.y}; stagePrompt('arc1'); }
    else if (DRAW.stage === 1){
      if (Math.hypot(p.x-DRAW.ax, p.y-DRAW.ay) > 1e-6){
        DRAW.bx = p.x; DRAW.by = p.y; DRAW.stage = 2; stagePrompt('arc2');
      }
    }
    else {
      var g = arcFrom3({x:DRAW.ax,y:DRAW.ay}, {x:DRAW.bx,y:DRAW.by}, p);
      if (g){
        pushUndo();
        DOC.ents.push({t:'arc', cx:g.cx, cy:g.cy, r:g.r, a0:g.a0, a1:g.a1, ccw:g.ccw});
        DRAW = null; stagePrompt('arc0'); persist();
      }
    }
  }
  else if (TOOL === 'offset'){
    if (OFF){ offClick(w); return; }                 // the panel owns the picking
    var oh = pickEntity(w);
    if (oh !== null){
      if (MOUSE.shift) selToggle(oh);
      else SEL = [oh];
    } else if (!MOUSE.shift) SEL = [];
  }
  else if (TOOL === 'copy'){
    if (!SEL.length){ stagePrompt('selFirst'); }
    else if (!DRAW){ DRAW = {stage:1, bx:p.x, by:p.y}; stagePrompt('copy1'); }
    else {
      applySel(true, (function(dx,dy){ return function(en){ moveEntity(en, dx, dy); }; })(p.x-DRAW.bx, p.y-DRAW.by));
      DRAW = null; stagePrompt('copy0'); persist();
    }
  }
  else if (TOOL === 'mirror'){
    if (MIR){ mirClick(w); return; }
    if (!SEL.length){ stagePrompt('selFirst'); }
    else if (!DRAW){
      var mh = pickEntity(w);
      if (mh !== null && DOC.ents[mh].t === 'line' && DOC.ents[mh].con){
        var cl = DOC.ents[mh];
        var cvx = cl.x2-cl.x1, cvy = cl.y2-cl.y1, cvl = Math.hypot(cvx,cvy);
        if (cvl > 1e-6){
          // The axis line may itself be selected (selecting the shape and its centre line is the
          // natural way to work): mirror everything else and leave the line where it is.
          var keep = SEL.slice(), axisWasSel = SEL.indexOf(mh) >= 0;
          if (axisWasSel) SEL = SEL.filter(function(i){ return i !== mh; });
          if (!SEL.length){
            SEL = keep;
            toast('info', 'Nothing to mirror', 'Select the shapes to mirror as well as the construction line, then click the line.');
            return;
          }
          applySel(true, (function(px2,py2,ux2,uy2){ return function(en){ mirrorEnt(en, px2, py2, ux2, uy2); }; })(cl.x1, cl.y1, cvx/cvl, cvy/cvl));
          stagePrompt('mirror0'); persist();
          return;
        }
      }
      DRAW = {stage:1, ax:p.x, ay:p.y}; stagePrompt('mirror1');
    }
    else {
      var mvx = p.x-DRAW.ax, mvy = p.y-DRAW.ay, mvl = Math.hypot(mvx,mvy);
      if (mvl > 1e-6){
        applySel(true, (function(px2,py2,ux2,uy2){ return function(en){ mirrorEnt(en, px2, py2, ux2, uy2); }; })(DRAW.ax, DRAW.ay, mvx/mvl, mvy/mvl));
        DRAW = null; stagePrompt('mirror0'); persist();
      }
    }
  }
  else if (TOOL === 'rotate'){
    if (!SEL.length){ stagePrompt('selFirst'); }
    else if (!DRAW){ DRAW = {stage:1, cx:p.x, cy:p.y}; stagePrompt('rotate1'); }
  }
  else if (TOOL === 'array'){
    if (!SEL.length){ stagePrompt('selFirst'); }
    else if (!DRAW){ DRAW = {stage:1, cx:p.x, cy:p.y}; stagePrompt('array1'); }
  }
  else if (TOOL === 'dim'){
    // clicking an existing dimension label opens it for editing
    if (UICFG.showDims && DOC.dims){
      var spD = w2s(w.x, w.y);
      var dHit = pickDim(spD.x, spD.y);           // the value plate or the dimension line
      if (dHit >= 0){ editDim(dHit, spD.x, spD.y); return; }
    }
    var hitD = pickEntity(w);
    if (hitD === null){ DRAW = null; DIMSEL = null; stagePrompt('dim0'); draw(); return; }
    if (!DRAW || DRAW.stage !== 'dimPick2'){
      DRAW = {stage:'dimPick2', first:hitD, firstAt:{x:w.x, y:w.y}};
      stagePrompt('dim1');
    } else {
      var e1 = DOC.ents[DRAW.first], e2 = DOC.ents[hitD];
      if (DRAW.first === hitD){
        // same shape twice: dimension the shape itself
        var kind = e1.t === 'circle' ? 'dia' : (e1.t === 'arc' ? 'rad' : (e1.t === 'line' ? 'len' : (e1.t === 'rect' ? 'side' : null)));
        if (kind === 'side'){ dimJustAdded(addDim({kind:'side', a:entId(e1), at:hintOf(e1, DRAW.firstAt)})); return; }   // its width or height
        if (kind){ dimJustAdded(addDim({kind:kind, a:entId(e1)})); return; }
        toast('info','No size dimension for that shape','Try two shapes for a distance, or a rectangle, line, circle or arc.');
      } else {
        var rr = relInfo(e1, e2, DRAW.firstAt, {x:w.x, y:w.y});
        if (rr.kind === 'dist'){
          dimJustAdded(addDim({kind:'pair', a:entId(e2), b:entId(e1), edge:false,
                               aAt:hintOf(e2, {x:w.x, y:w.y}), bAt:hintOf(e1, DRAW.firstAt)}));   // b moves; a is the reference
          return;
        } else if (rr.kind === 'angle'){
          toast('warn','Not parallel','A distance needs parallel lines (they are ' + rr.cur.toFixed(1) + '\u00b0 apart).');
        } else {
          toast('warn','No dimension for that pair','Try a circle/line, or two parallel lines.');
        }
      }
      DRAW = null; stagePrompt('dim0');
    }
  }
  else if (TOOL === 'node'){
    var tolv = 8/VIEW.scale;
    if (NODE && DOC.ents[NODE.ent]){
      var ne2 = DOC.ents[NODE.ent], pts2 = nodePtsOf(ne2);
      if (pts2){
        // clicked a vertex? -> exact X,Y entry
        for (var vi2 = 0; vi2 < pts2.length; vi2++){
          if (Math.hypot(w.x-pts2[vi2][0], w.y-pts2[vi2][1]) < tolv){
            DRAW = {stage:'nodeXY', ent:NODE.ent, vi:vi2};
            showPrompt(STAGE_LABEL.nodeXY, pts2[vi2][0].toFixed(2) + ',' + pts2[vi2][1].toFixed(2), true);
            draw(); return;
          }
        }
        // clicked a segment? -> exact length entry
        var m2 = pts2.length, last2 = ne2.closed ? m2 : m2-1, bestSeg = null;
        for (var sg = 0; sg < last2; sg++){
          var a2 = pts2[sg], b2 = pts2[(sg+1)%m2];
          var dd = distToSeg(w.x, w.y, a2[0], a2[1], b2[0], b2[1]);
          if (dd < tolv*1.5 && (!bestSeg || dd < bestSeg.d)) bestSeg = {d:dd, i:sg};
        }
        if (bestSeg){
          var aa = pts2[bestSeg.i], bb = pts2[(bestSeg.i+1)%m2];
          DRAW = {stage:'nodeLen', ent:NODE.ent, seg:bestSeg.i};
          showPrompt(STAGE_LABEL.nodeLen, Math.hypot(bb[0]-aa[0], bb[1]-aa[1]).toFixed(2), true);
          draw(); return;
        }
      }
      NODE = null; stagePrompt('node0'); draw(); return;   // clicked away: close it
    }
    var hitN = pickEntity(w);
    if (hitN !== null && nodePtsOf(DOC.ents[hitN])){
      NODE = {ent:hitN, drag:null};
      SEL = [hitN];
      stagePrompt('node1');
    } else {
      toast('info', 'Pick a polyline', 'Node editing works on polylines and paths. Click one to show its points.');
    }
  }
  else if (TOOL === 'fillet'){
    var ftNow = UICFG.filletType || 'round', ftName = ftNow === 'round' ? 'Fillet' : (ftNow === 'dogbone' ? 'Dog-bone' : 'T-bone');
    var ufc = filletRemovable(w);
    if (ufc){ if (unfillet(ufc)){ persist(); stagePrompt('fillet0'); draw(); } }
    else if (doFillet(w, UICFG.filletR)){ persist(); stagePrompt('fillet0'); }
    else if (doFillet.lastMiss === 'fit'){
      stagePrompt('fillet0');
      toast('warn', ftName + ' didn\u2019t fit', ftNow === 'round'
        ? 'Radius ' + UICFG.filletR + ' mm is too large for that corner, or the two sides meet smoothly (no corner to round). Try a smaller radius.'
        : 'A ' + (UICFG.filletR*2) + ' mm bit\u2019s relief is longer than the edge beside that corner. Use a smaller bit or a longer edge.');
    }
    else if (doFillet.lastMiss === 'curved'){
      toast('info', ftName + ' needs straight edges', 'Reliefs go on sharp corners between two straight edges. That corner touches a curve.');
    }
    else if (doFillet.lastMiss === 'flat'){
      toast('info', 'No corner there', 'Those two edges run almost straight through, so there is no corner to relieve.');
    }
    else if (doFillet.lastMiss === 'dogjoin'){
      toast('info', 'Join the lines first', 'Reliefs work on corners of one shape. Select the lines, press Join, then click the corner.');
    } else if (doFillet.lastMiss === 'badr'){
      stagePrompt('filletBadR');
      toast('err', 'Invalid radius', 'Enter a positive number for the fillet radius.');
    } else stagePrompt('editMiss');
  }
  else if (TOOL === 'trim'){
    var trHit = pickEntity(w);
    if (trHit !== null && DOC.ents[trHit].t === 'text'){
      toast('info', 'Convert the text first', 'Text can\u2019t be trimmed while it\u2019s editable. Select it and use Convert to curves, then trim.');
      return;
    }
    if (doTrim(w)){ persist(); stagePrompt('trim0'); }
    else {
      stagePrompt('editMiss');
      toast('warn', 'Nothing to trim there', 'Trim cuts where another shape crosses this one. Nothing crosses at that spot, so there is no piece to remove.');
    }
  }
  else if (TOOL === 'extend'){
    if (doExtend(w)){ persist(); stagePrompt('extend0'); }
    else {
      stagePrompt('editMiss');
      toast('warn', 'Nothing to extend to', 'Extend runs a line or arc out to the next shape it would meet. Nothing lies ahead of that end.');
    }
  }
  else if (TOOL === 'guide'){
    var e = pickEdge(w);
    if (e){
      var dx = e.ed[2]-e.ed[0], dy = e.ed[3]-e.ed[1];
      var L = Math.hypot(dx,dy) || 1;
      // normal (a,b), line: a x + b y = c
      var a = -dy/L, b = dx/L;
      var c = a*e.ed[0] + b*e.ed[1];
      DRAW = {stage:'guideOffset', a:a, b:b, c:c, from:e.ed};
      stagePrompt('guideOffset');
      document.getElementById('promptIn').focus();
    } else stagePrompt('guide0');
  }
  else if (TOOL === 'select'){
    if (CUT){ cutClick(w); return; }                     // the toolpath editor is picking shapes
    var sD = w2s(w.x, w.y), dPick = pickDim(sD.x, sD.y);
    if (dPick >= 0){                                  // a dimension: select it, ready for Delete
      DIMSEL = dPick; SEL = []; HANDLES.active = false; DRAW = null;
      showPrompt('Dimension selected \u2014 Delete removes it, double-click to change its value', '', false);
      draw(); return;
    }
    DIMSEL = null;
    var hit = pickEntity(w);
    if (hit !== null){
      var wasSel = SEL.indexOf(hit) >= 0 && !MOUSE.shift;
      SELAT[entId(DOC.ents[hit])] = {x:w.x, y:w.y};    // where it was clicked: which edge a distance means
      if (MOUSE.shift){ selToggle(hit); }
      else if (SEL.indexOf(hit) < 0){ SEL = [hit]; } // clicking a selected member keeps the group
      if (SEL.indexOf(hit) >= 0)
        DRAW = {stage:'drag', lx:p.x, ly:p.y, moved:false, pushed:false, wasSel:wasSel};
    } else {
      // empty space: begin a marquee; click-vs-drag (and any deselect) resolves on pointerup
      DRAW = {stage:'marq', sx:w.x, sy:w.y, ex:w.x, ey:w.y, shift:MOUSE.shift};
    }
  }
  draw();
}
