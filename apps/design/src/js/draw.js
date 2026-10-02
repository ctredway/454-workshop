/* ---------------- rendering ---------------- */
function draw(){
  selBoxRefresh();
  var w = cv.width = cv.clientWidth * (window.devicePixelRatio||1);
  var h = cv.height = cv.clientHeight * (window.devicePixelRatio||1);
  ctx.setTransform(window.devicePixelRatio||1,0,0,window.devicePixelRatio||1,0,0);
  ctx.clearRect(0,0,cv.clientWidth,cv.clientHeight);

  // grid
  var step = VIEW.scale > 8 ? 1 : (VIEW.scale > 2 ? 5 : 10);
  var tl = s2w(0,0), br = s2w(cv.clientWidth, cv.clientHeight);
  var PAL = canvasPal();
  ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (var gx = Math.floor(tl.x/step)*step; gx <= br.x; gx += step){
    var sx = w2s(gx,0).x; ctx.moveTo(sx,0); ctx.lineTo(sx,cv.clientHeight);
  }
  for (var gy = Math.floor(br.y/step)*step; gy <= tl.y; gy += step){
    var sy = w2s(0,gy).y; ctx.moveTo(0,sy); ctx.lineTo(cv.clientWidth,sy);
  }
  ctx.stroke();

  // axes at 0,0
  var o = w2s(0,0);
  ctx.strokeStyle = PAL.axes; ctx.beginPath();
  ctx.moveTo(o.x,0); ctx.lineTo(o.x,cv.clientHeight);
  ctx.moveTo(0,o.y); ctx.lineTo(cv.clientWidth,o.y); ctx.stroke();

  drawBgImage(ctx);                                        // a traced image kept for reference
  drawMachineArea(ctx);                                    // the machine's cutting area, when shown

  // stock
  var sr = stockRect();
  var a = w2s(sr.x0, sr.y1), b = w2s(sr.x1, sr.y0);
  ctx.strokeStyle = PAL.stock; ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x, a.y, b.x-a.x, b.y-a.y);
  ctx.fillStyle = PAL.stockFill;
  ctx.fillRect(a.x, a.y, b.x-a.x, b.y-a.y);

  // guides
  ctx.strokeStyle = '#6fa8dc'; ctx.lineWidth = 1; ctx.setLineDash([6,5]);
  DOC.guides.forEach(function(g){
    // draw line a x + b y = c across view
    var pts = [];
    [[tl.x,'x'],[br.x,'x'],[br.y,'y'],[tl.y,'y']].forEach(function(bound){
      var v = bound[0];
      if (bound[1]==='x' && Math.abs(g.b) > 1e-9) pts.push({x:v, y:(g.c - g.a*v)/g.b});
      if (bound[1]==='y' && Math.abs(g.a) > 1e-9) pts.push({x:(g.c - g.b*v)/g.a, y:v});
    });
    pts = pts.filter(function(p){ return p.x >= tl.x-1 && p.x <= br.x+1 && p.y >= br.y-1 && p.y <= tl.y+1; });
    if (pts.length >= 2){
      var p1 = w2s(pts[0].x, pts[0].y), p2 = w2s(pts[1].x, pts[1].y);
      ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    }
  });
  ctx.setLineDash([]);

  // entities
  layersInit();
  DOC.ents.forEach(function(e,i){
    if (!entVisible(e)) return;                        // hidden layer
    var isSel = SEL.indexOf(i) >= 0;
    ctx.strokeStyle = isSel ? THEME.accentLight : (e.con ? dispCol('con') : (e.tp ? dispCol('tp') : dispCol('vec')));
    ctx.lineWidth = isSel ? 2.5 : (e.con ? 1.2 : 1.6);
    ctx.setLineDash(e.con ? [6,4] : []);
    ctx.beginPath();
    if (e.t==='line'){ var p1=w2s(e.x1,e.y1), p2=w2s(e.x2,e.y2); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); }
    else if (e.t==='rect'){ var r1=w2s(e.x,e.y+e.h), r2=w2s(e.x+e.w,e.y); ctx.rect(r1.x,r1.y, r2.x-r1.x, r2.y-r1.y); }
    else if (e.t==='circle'){ var c=w2s(e.cx,e.cy); ctx.arc(c.x,c.y, e.r*VIEW.scale, 0, Math.PI*2); }
    else if (e.t==='arc'){
      var ca=w2s(e.cx,e.cy);
      ctx.arc(ca.x, ca.y, e.r*VIEW.scale, -e.a0, -e.a1, e.ccw); // screen Y-flip mirrors handedness
    }
    else if (e.t==='text'){
      var tw = textWorld(e);
      if (tw){
        tw.forEach(function(ct){
          var t0 = w2s(ct[0][0], ct[0][1]); ctx.moveTo(t0.x, t0.y);
          for (var tk = 1; tk < ct.length; tk++){ var tq2 = w2s(ct[tk][0], ct[tk][1]); ctx.lineTo(tq2.x, tq2.y); }
          ctx.closePath();
        });
      } else {
        ctx.setLineDash([4,3]);                     // font still loading / missing
        var tc = textCorners(e), tc0 = w2s(tc[0][0], tc[0][1]);
        ctx.moveTo(tc0.x, tc0.y);
        for (var tci = 1; tci < 4; tci++){ var tcp = w2s(tc[tci][0], tc[tci][1]); ctx.lineTo(tcp.x, tcp.y); }
        ctx.closePath();
      }
    }
    else if (e.t==='group'){
      // draw each member's outline into the same path, so the group strokes as one unit
      e.ents.forEach(function(me){
        if (me.t==='text'){
          (textWorld(me) || []).forEach(function(ct){
            var gt0 = w2s(ct[0][0], ct[0][1]); ctx.moveTo(gt0.x, gt0.y);
            for (var gk = 1; gk < ct.length; gk++){ var gq = w2s(ct[gk][0], ct[gk][1]); ctx.lineTo(gq.x, gq.y); }
            ctx.closePath();
          });
          return;
        }
        if (me.t==='line'){ var g1=w2s(me.x1,me.y1), g2=w2s(me.x2,me.y2); ctx.moveTo(g1.x,g1.y); ctx.lineTo(g2.x,g2.y); }
        else if (me.t==='rect'){ var gr1=w2s(me.x,me.y+me.h), gr2=w2s(me.x+me.w,me.y); ctx.rect(gr1.x,gr1.y, gr2.x-gr1.x, gr2.y-gr1.y); }
        else if (me.t==='circle'){ var gc=w2s(me.cx,me.cy); ctx.moveTo(gc.x+me.r*VIEW.scale, gc.y); ctx.arc(gc.x,gc.y, me.r*VIEW.scale, 0, Math.PI*2); }
        else if (me.t==='arc'){ var gca=w2s(me.cx,me.cy); var st=arcPtAt(me,0); var gs=w2s(st.x,st.y); ctx.moveTo(gs.x,gs.y); ctx.arc(gca.x, gca.y, me.r*VIEW.scale, -me.a0, -me.a1, me.ccw); }
        else if (me.t==='path' || me.t==='poly'){
          var mt = me.t==='path' ? tessPath(me) : me.pts.map(function(q){ return [q[0],q[1]]; });
          if (!mt.length) return;
          var m0 = w2s(mt[0][0], mt[0][1]);
          ctx.moveTo(m0.x, m0.y);
          for (var mq = 1; mq < mt.length; mq++){ var mp = w2s(mt[mq][0], mt[mq][1]); ctx.lineTo(mp.x, mp.y); }
          if (me.closed) ctx.closePath();
        }
      });
    }
    else if (e.t==='path'){
      var tp2 = e._tess2 || (e._tess2 = tessPath(e));
      var f0 = w2s(tp2[0][0], tp2[0][1]);
      ctx.moveTo(f0.x, f0.y);
      for (var tq = 1; tq < tp2.length; tq++){
        var fp = w2s(tp2[tq][0], tp2[tq][1]); ctx.lineTo(fp.x, fp.y);
      }
      if (e.closed) ctx.closePath();
    }
    else if (e.t==='poly'){
      var s0=w2s(e.pts[0][0],e.pts[0][1]); ctx.moveTo(s0.x,s0.y);
      for (var k=1;k<e.pts.length;k++){ var sp=w2s(e.pts[k][0],e.pts[k][1]); ctx.lineTo(sp.x,sp.y); }
      if (e.closed) ctx.closePath();
    }
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // dimension layer for the current selection
  function dimText(txt, sx, sy){
    ctx.font = '11px JetBrains Mono, monospace';
    var tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(20,24,29,0.85)';
    ctx.fillRect(sx - tw/2 - 4, sy - 9, tw + 8, 16);
    ctx.fillStyle = THEME.accentLight;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, sx, sy);
  }
  function dimLine(w1, w2, label){
    var s1 = w2s(w1.x, w1.y), s2 = w2s(w2.x, w2.y);
    ctx.strokeStyle = THEME.accentLight; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    [[s1,s2],[s2,s1]].forEach(function(pr){
      var ax = pr[0].x, ay = pr[0].y;
      var ux = pr[1].x - ax, uy = pr[1].y - ay;
      var L = Math.hypot(ux,uy) || 1; ux/=L; uy/=L;
      ctx.beginPath();
      ctx.moveTo(ax + ux*8 - uy*3, ay + uy*8 + ux*3);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax + ux*8 + uy*3, ay + uy*8 - ux*3);
      ctx.stroke();
    });
    dimText(label, (s1.x+s2.x)/2, (s1.y+s2.y)/2 - 12);
  }
  if (TOOL === 'select' && SEL.length === 1 && DOC.ents[SEL[0]]){
    var se = DOC.ents[SEL[0]];
    if (se.t === 'line'){
      var n = lineNorm(se);
      var mx = (se.x1+se.x2)/2 + n.a*(14/VIEW.scale), my2 = (se.y1+se.y2)/2 + n.b*(14/VIEW.scale);
      var sp = w2s(mx, my2);
      dimText(Math.hypot(se.x2-se.x1, se.y2-se.y1).toFixed(2), sp.x, sp.y);
    } else if (se.t === 'circle'){
      var cp = w2s(se.cx + se.r, se.cy);
      dimText('\u00d8' + (se.r*2).toFixed(2), cp.x + 26, cp.y);
    } else if (se.t === 'arc'){
      var mid = e0mid(se);
      var mp2 = w2s(mid.x, mid.y);
      dimText('R' + se.r.toFixed(2), mp2.x, mp2.y - 14);
    } else if (se.t === 'rect'){
      var wb = w2s(se.x + se.w/2, se.y);
      dimText(se.w.toFixed(2), wb.x, wb.y + 14);
      var hr = w2s(se.x + se.w, se.y + se.h/2);
      dimText(se.h.toFixed(2), hr.x + 26, hr.y);
    }
  }
  if (TOOL === 'select' && SEL.length === 2 && DOC.ents[SEL[0]] && DOC.ents[SEL[1]]){
    var dg = dimGeometry(DOC.ents[SEL[0]], DOC.ents[SEL[1]]);
    if (dg) dimLine(dg.p1, dg.p2, dg.label);
  }

  // marquee selection box
  if (TOOL === 'select' && DRAW && DRAW.stage === 'marq'){
    var ma = w2s(DRAW.sx, DRAW.sy), mb = w2s(DRAW.ex, DRAW.ey);
    var crossing = DRAW.ex < DRAW.sx;
    ctx.fillStyle = crossing ? 'rgba(111,168,220,0.10)' : 'var(--accent-faint)';
    ctx.fillRect(Math.min(ma.x,mb.x), Math.min(ma.y,mb.y), Math.abs(mb.x-ma.x), Math.abs(mb.y-ma.y));
    ctx.strokeStyle = crossing ? '#6fa8dc' : THEME.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash(crossing ? [5,4] : []);
    ctx.strokeRect(Math.min(ma.x,mb.x), Math.min(ma.y,mb.y), Math.abs(mb.x-ma.x), Math.abs(mb.y-ma.y));
    ctx.setLineDash([]);
  }

  // in-progress rubber band
  if (DRAW && MOUSE.snap){
    var m = MOUSE.snap;
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.2; ctx.setLineDash([4,4]);
    ctx.beginPath();
    if (TOOL==='line' && DRAW.stage===1){ var q=w2s(DRAW.x,DRAW.y), q2=w2s(m.x,m.y); ctx.moveTo(q.x,q.y); ctx.lineTo(q2.x,q2.y); }
    else if (TOOL==='rect' && DRAW.stage===1){
      var ra=w2s(Math.min(DRAW.x,m.x), Math.max(DRAW.y,m.y)), rb=w2s(Math.max(DRAW.x,m.x), Math.min(DRAW.y,m.y));
      ctx.rect(ra.x,ra.y, rb.x-ra.x, rb.y-ra.y);
    }
    else if (TOOL==='circle' && DRAW.stage===1){
      var cc=w2s(DRAW.x,DRAW.y); ctx.arc(cc.x,cc.y, Math.hypot(m.x-DRAW.x,m.y-DRAW.y)*VIEW.scale, 0, Math.PI*2);
    }
    else if (TOOL==='ellipse' || TOOL==='polygon' || TOOL==='star'){ shapeToolPreview(ctx, m); }
    else if (TOOL==='arc' && DRAW.stage===1){
      var aa=w2s(DRAW.ax,DRAW.ay), am=w2s(m.x,m.y);
      ctx.moveTo(aa.x,aa.y); ctx.lineTo(am.x,am.y);
    }
    else if (TOOL==='arc' && DRAW.stage===2){
      var ga = arcFrom3({x:DRAW.ax,y:DRAW.ay}, {x:DRAW.bx,y:DRAW.by}, m);
      var pa2=w2s(DRAW.ax,DRAW.ay), pb2=w2s(DRAW.bx,DRAW.by);
      if (ga){
        var gc=w2s(ga.cx,ga.cy);
        ctx.arc(gc.x, gc.y, ga.r*VIEW.scale, -ga.a0, -ga.a1, ga.ccw); // screen Y-flip mirrors handedness
      } else {
        ctx.moveTo(pa2.x,pa2.y); ctx.lineTo(pb2.x,pb2.y);
      }
    }
    else if (TOOL==='poly' && DRAW.pts){
      var s0p=w2s(DRAW.pts[0][0], DRAW.pts[0][1]);
      ctx.moveTo(s0p.x, s0p.y);
      for (var pk=1; pk<DRAW.pts.length; pk++){
        var sp2=w2s(DRAW.pts[pk][0], DRAW.pts[pk][1]); ctx.lineTo(sp2.x, sp2.y);
      }
      var mm2=w2s(m.x,m.y); ctx.lineTo(mm2.x,mm2.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // snap marker
  // ---- alignment anchor: the last-picked shape, which stays put when aligning ----
  if (TOOL === 'select' && SEL.length >= 2 && DOC.ents[SEL[SEL.length-1]] && !(DRAW && DRAW.stage === 'marq')){
    var ab = entBBox(DOC.ents[SEL[SEL.length-1]]), at = w2s(ab.x0, ab.y1), bt = w2s(ab.x1, ab.y0);
    ctx.save();
    ctx.strokeStyle = '#7fb069'; ctx.lineWidth = 1.5; ctx.setLineDash([2,3]);
    ctx.strokeRect(at.x - 3, at.y - 3, bt.x - at.x + 6, bt.y - at.y + 6);
    ctx.restore();
  }

  // ---- trim / extend preview: red disappears, green is added ----
  if (HOVER && (HOVER.cut || HOVER.grow)){
    var runs = HOVER.cut || HOVER.grow;
    ctx.save();
    ctx.strokeStyle = HOVER.cut ? '#e06c5a' : '#7fb069';
    ctx.lineWidth = HOVER.cut ? 3 : 2.5;
    ctx.setLineDash(HOVER.cut ? [] : [5,4]);
    runs.forEach(function(run){
      ctx.beginPath();
      var q0 = w2s(run[0][0], run[0][1]); ctx.moveTo(q0.x, q0.y);
      for (var ri = 1; ri < run.length; ri++){ var q = w2s(run[ri][0], run[ri][1]); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---- toolpaths: the editor's live preview, then the saved ones ----
  (function(){
    function drawMoves(moves, cutCol, rapidCol){
      var x = null, y = null, z = 0;
      ctx.save();
      moves.forEach(function (m) {
        var nx = m.x !== undefined ? m.x : x, ny = m.y !== undefined ? m.y : y;
        var nz = m.z !== undefined ? m.z : z;
        if (x !== null && ny !== null && nx !== null && (nx !== x || ny !== y)){
          var a = w2s(x, y), b = w2s(nx, ny);
          ctx.beginPath();
          ctx.strokeStyle = m.g === 0 ? rapidCol : cutCol;
          ctx.lineWidth = m.g === 0 ? 1 : 1.6;
          ctx.setLineDash(m.g === 0 ? [4,4] : []);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        x = nx; y = ny; z = nz;
      });
      ctx.restore();
    }
    var cutCol = UICFG.colors && UICFG.colors.tp ? dispCol('tp') : THEME.accent;
    function drawTabs(tp, strong){
      if (!tp.tabsOn || !tp.tabPts) return;
      ctx.save();
      tp.ents.forEach(function (id) {
        (tp.tabPts[id] || []).forEach(function (pt) {
          var c = w2s(pt[0], pt[1]), r = Math.max(4, (tp.tabLen || 4) / 2 * VIEW.scale);
          ctx.beginPath();
          ctx.fillStyle = strong ? THEME.accent : accentRGBA(.55);
          ctx.strokeStyle = THEME.theme === 'light' ? '#fff' : '#14181d';
          ctx.lineWidth = 1.5;
          ctx.rect(c.x - r, c.y - 3.5, r * 2, 7);
          ctx.fill(); ctx.stroke();
        });
      });
      ctx.restore();
    }
    // Where a profile's cut starts, if chosen: a ring with a dot, on the outline
    function drawStarts(tp, strong){
      if (!tp.startPts || !(tp.side === 'inside' || tp.side === 'outside' || tp.side === 'on')) return;
      ctx.save();
      tp.ents.forEach(function (id) {
        var pt = tp.startPts[id]; if (!pt) return;
        var c = w2s(pt[0], pt[1]);
        ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = THEME.theme === 'light' ? '#fff' : '#14181d'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = strong ? THEME.accent : accentRGBA(.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fillStyle = strong ? THEME.accent : accentRGBA(.7); ctx.fill();
      });
      ctx.restore();
    }
    function drawHoles(pts, dia, strong){
      ctx.save();
      pts.forEach(function (p) {
        var c = w2s(p[0], p[1]), r = Math.max(3, dia / 2 * VIEW.scale);
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = strong ? accentRGBA(.28) : accentRGBA(.14);
        ctx.strokeStyle = strong ? THEME.accent : accentRGBA(.7);
        ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c.x - r * 0.6, c.y); ctx.lineTo(c.x + r * 0.6, c.y);
        ctx.moveTo(c.x, c.y - r * 0.6); ctx.lineTo(c.x, c.y + r * 0.6); ctx.stroke();
      });
      ctx.restore();
    }
    if (CUT && CUT.previewHoles && CUT.previewHoles.length) drawHoles(CUT.previewHoles, CUT.dia, true);
    if (DOC.toolpaths && !CUT) DOC.toolpaths.forEach(function (tp) {
      if (tp.side !== 'drill' || !tp.holes || !tpDrawn(tp)) return;
      drawHoles(tp.holes, tp.dia, tp.id === CUTSEL);
    });
    drawTracePreview(ctx);
    if (CUT && CUT.side === 'chamfer' && CUT.chamBand && CUT.chamW > 0){
      ctx.save(); ctx.strokeStyle = accentRGBA(.45); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      CUT.chamBand.forEach(function (loop) {
        [CUT.chamW, -CUT.chamW].forEach(function (off) {
          Geom.offsetLoop(loop, off, {tol: 0.02}).forEach(function (l2) {
            ctx.beginPath(); l2.forEach(function (p, i) { var q = w2s(p[0], p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
            ctx.closePath(); ctx.stroke();
          });
        });
      });
      ctx.restore();
    }
    if (CUT && CUT.preview && CUT.preview.length && CUT.side !== 'drill') drawMoves(CUT.preview, THEME.accent, 'rgba(127,176,105,.5)');
    if (CUT){ drawTabs(CUT, true); drawStarts(CUT, true); }
    else if (DOC.toolpaths){
      // One selected: show only that one, highlighted, with its tabs. (The selected one's path used
      // not to be drawn at all: only its tabs, because the branches were chained so this never ran.)
      DOC.toolpaths.forEach(function (tp) {
        if (!tp.moves || !tp.moves.length || !tpDrawn(tp)) return;
        drawMoves(tp.moves, tp.id === CUTSEL ? THEME.accent : cutCol, 'rgba(120,130,140,.35)');
      });
      if (CUTSEL) DOC.toolpaths.forEach(function (tp) { if (tp.id === CUTSEL){ drawTabs(tp, false); drawStarts(tp, false); } });
    }
  })();

  // ---- offset preview ----
  if (TOOL === 'offset' && OFF){
    var offRes = offResults();
    if (offRes.length){
      ctx.save(); ctx.strokeStyle = accentRGBA(.85); ctx.lineWidth = 1.5; ctx.setLineDash([5,4]);
      offRes.forEach(function(ne){ drawEntityOutline(ne); });
      ctx.restore();
    }
  }

  // ---- mirror preview ----
  if (TOOL === 'mirror' && MIR){
    var mAx = mirAxis();
    if (MIR.line !== null && DOC.ents[MIR.line]){
      ctx.save(); ctx.strokeStyle = '#7fb069'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
      drawEntityOutline(DOC.ents[MIR.line]); ctx.restore();
    }
    if (mAx && MIR.objs.length){
      ctx.save(); ctx.strokeStyle = accentRGBA(.85); ctx.lineWidth = 1.5; ctx.setLineDash([5,4]);
      MIR.objs.forEach(function(i){
        if (!DOC.ents[i]) return;
        var gc = cloneEnt(DOC.ents[i]);
        mirrorEnt(gc, mAx.x, mAx.y, mAx.ux, mAx.uy);
        drawEntityOutline(gc);
      });
      ctx.restore();
    }
  }

  // ---- measure tool ----
  if (TOOL === 'measure'){
    var ma = null, mb = null, mgap = false;
    if (DRAW && DRAW.stage === 'meas1' && MOUSE.snap){ ma = DRAW.a; mb = MOUSE.snap; }
    else if (MEAS){ ma = MEAS.a; mb = MEAS.b; mgap = MEAS.gap; }
    if (DRAW && DRAW.stage === 'measS' && DOC.ents[DRAW.ia]){
      ctx.save(); ctx.strokeStyle = '#7fb069'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
      drawEntityOutline(DOC.ents[DRAW.ia]); ctx.restore();
    }
    if (ma && mb){
      var sa = w2s(ma.x, ma.y), sb = w2s(mb.x, mb.y);
      ctx.save();
      ctx.strokeStyle = THEME.accent; ctx.fillStyle = THEME.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); ctx.setLineDash([]);
      [sa, sb].forEach(function(q){ ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI*2); ctx.fill(); });
      var mdx = mb.x - ma.x, mdy = mb.y - ma.y, mL = Math.hypot(mdx, mdy);
      var l1 = mgap && mL < 1e-9 ? 'touching'
             : (mgap ? 'gap ' : '') + fmtDisp(mL, dispIn() ? 4 : 3) + (dispIn() ? '\u2033' : '');
      var l2 = '\u0394X ' + fmtDisp(mdx) + '  \u0394Y ' + fmtDisp(mdy) + (mgap ? '' : '  ' + (Math.atan2(mdy, mdx)*180/Math.PI).toFixed(1) + '\u00b0');
      ctx.font = '600 13px system-ui, sans-serif';
      var w1 = ctx.measureText(l1).width; ctx.font = '11px system-ui, sans-serif';
      var w2 = ctx.measureText(l2).width, bw = Math.max(w1, w2) + 14;
      var bx = (sa.x + sb.x) / 2 + 12, by = (sa.y + sb.y) / 2 - 38;
      ctx.fillStyle = THEME.theme === 'light' ? 'rgba(255,255,255,0.94)' : 'rgba(20,24,29,0.92)'; ctx.strokeStyle = accentRGBA(.6); ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, 36); ctx.strokeRect(bx, by, bw, 36);
      ctx.fillStyle = THEME.accentLight; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.font = '600 13px system-ui, sans-serif'; ctx.fillText(l1, bx + 7, by + 4);
      ctx.fillStyle = '#b9c3ce'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(l2, bx + 7, by + 20);
      ctx.restore();
    }
  }

  // ---- selection transform handles ----
  if (HANDLES.sig !== selSig()){                   // selection changed: handles go away
    HANDLES.sig = selSig(); HANDLES.active = false; HANDLES.mode = 'scale'; HANDLES.pivot = null;
  }
  if (TOOL === 'select' && SEL.length && HANDLES.active && !(DRAW && DRAW.stage === 'marq')){
    var hbx = selHandleBox();
    if (hbx){
      ctx.save();
      ctx.strokeStyle = accentRGBA(.75); ctx.lineWidth = 1; ctx.setLineDash([5,4]);
      ctx.strokeRect(hbx.L, hbx.T, hbx.R - hbx.L, hbx.B - hbx.T);
      ctx.setLineDash([]);
      selHandleList().forEach(function(h){
        ctx.lineWidth = 1.5; ctx.strokeStyle = THEME.accent; ctx.fillStyle = THEME.theme === 'light' ? '#ffffff' : '#14181d';
        if (h.kind === 'pivot'){
          ctx.beginPath(); ctx.arc(h.sx, h.sy, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(h.sx-8, h.sy); ctx.lineTo(h.sx+8, h.sy); ctx.moveTo(h.sx, h.sy-8); ctx.lineTo(h.sx, h.sy+8); ctx.stroke();
        } else if (h.kind === 'rot'){
          ctx.beginPath(); ctx.arc(h.sx, h.sy, 6, 0.5, Math.PI * 1.75); ctx.stroke();
          var tx0 = h.sx + 6*Math.cos(0.5), ty0 = h.sy + 6*Math.sin(0.5);    // arrow tip
          ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx0 + 4, ty0 - 3); ctx.lineTo(tx0 - 1, ty0 - 4); ctx.closePath();
          ctx.fillStyle = THEME.accent; ctx.fill();
        } else {
          ctx.beginPath(); ctx.rect(h.sx - 4, h.sy - 4, 8, 8); ctx.fill(); ctx.stroke();
        }
      });
      if (DRAW && DRAW.stage === 'xform' && DRAW.h.kind === 'rot' && MOUSE.mx != null){
        var pvs = w2s(DRAW.pivot.x, DRAW.pivot.y);
        ctx.setLineDash([3,3]); ctx.strokeStyle = accentRGBA(.6);
        ctx.beginPath(); ctx.moveTo(pvs.x, pvs.y); ctx.lineTo(MOUSE.mx, MOUSE.my); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---- dimension layer ----
  if (UICFG.showDims && DOC.dims && DOC.dims.length){
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    DOC.dims.forEach(function(d, di){
      if (!dimOnSheet(d)){ d._hit = null; return; }   // on another sheet
      var lab = dimLabel(d), anc = dimAnchor(d);
      if (lab === null || !anc) return;           // broken reference: skip (flagged below)
      var isSelD = (DIMSEL === di);
      ctx.strokeStyle = isSelD ? THEME.accentLight : dispCol('dim');
      ctx.fillStyle   = isSelD ? THEME.accentLight : dispCol('dim');
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      if (d.kind === 'pair' || d.kind === 'side'){
        // witness line between the two referenced points, with end ticks
        var pa = w2s(anc.a.x, anc.a.y), pb = w2s(anc.b.x, anc.b.y);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        [pa, pb].forEach(function(q){
          ctx.beginPath(); ctx.moveTo(q.x-3, q.y-3); ctx.lineTo(q.x+3, q.y+3);
          ctx.moveTo(q.x-3, q.y+3); ctx.lineTo(q.x+3, q.y-3); ctx.stroke();
        });
      }
      // label with a small backing plate so it stays readable over geometry
      var lp = w2s(anc.x, anc.y);
      var offY = d.off || -14;
      var tw = ctx.measureText(lab).width;
      ctx.save();
      ctx.fillStyle = 'rgba(20,24,29,0.85)';
      ctx.fillRect(lp.x - tw/2 - 4, lp.y + offY - 8, tw + 8, 16);
      ctx.restore();
      ctx.fillStyle = isSelD ? THEME.accentLight : dispCol('dim');
      ctx.fillText(lab, lp.x, lp.y + offY);
      d._hit = {x:lp.x, y:lp.y + offY, w:tw + 8, h:16};   // for click-to-edit
    });
    // broken dimensions (referenced entity deleted) get a red marker at the doc origin area
    var broken = DOC.dims.filter(function(d){ return dimLabel(d) === null; }).length;
    if (broken){
      ctx.fillStyle = '#e06c5a';
      ctx.textAlign = 'left';
      ctx.fillText(broken + ' dimension' + (broken>1?'s':'') + ' lost its reference', 12, 18);
    }
    ctx.restore();
  }

  // node editing: draw vertex handles and label every segment of the open shape
  if (TOOL === 'node' && NODE && DOC.ents[NODE.ent]){
    var ne3 = DOC.ents[NODE.ent], np = nodePtsOf(ne3);
    if (np){
      ctx.save();
      // segment labels
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var mN = np.length, lastN = ne3.closed ? mN : mN-1;
      for (var sN = 0; sN < lastN; sN++){
        var aN = np[sN], bN = np[(sN+1)%mN];
        var LN = Math.hypot(bN[0]-aN[0], bN[1]-aN[1]);
        if (LN < 1e-6) continue;
        var midN = w2s((aN[0]+bN[0])/2, (aN[1]+bN[1])/2);
        var nxN = -(bN[1]-aN[1])/LN, nyN = (bN[0]-aN[0])/LN;
        ctx.fillStyle = THEME.accent;
        ctx.fillText(LN.toFixed(2), midN.x + nxN*12, midN.y - nyN*12);
      }
      // vertex handles
      for (var vN = 0; vN < np.length; vN++){
        var hp = w2s(np[vN][0], np[vN][1]);
        var isDrag = NODE.drag === vN;
        ctx.fillStyle = isDrag ? THEME.accentLight : (THEME.theme === 'light' ? '#ffffff' : '#14181d');
        ctx.strokeStyle = isDrag ? THEME.accentLight : '#7fb069';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(hp.x-4, hp.y-4, 8, 8); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // polyline being drawn: label each committed segment with its length
  if (TOOL === 'poly' && DRAW && DRAW.pts && DRAW.pts.length > 1){
    ctx.save();
    ctx.font = '11px ' + 'system-ui, sans-serif';
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var sl = 1; sl < DRAW.pts.length; sl++){
      var a1 = DRAW.pts[sl-1], b1 = DRAW.pts[sl];
      var L1 = Math.hypot(b1[0]-a1[0], b1[1]-a1[1]);
      if (L1 < 1e-6) continue;
      var mid = w2s((a1[0]+b1[0])/2, (a1[1]+b1[1])/2);
      // nudge the label off the line along its normal so it stays readable
      var nx = -(b1[1]-a1[1])/L1, ny = (b1[0]-a1[0])/L1;
      ctx.fillText(L1.toFixed(2), mid.x + nx*11, mid.y - ny*11);
    }
    // the segment in progress, to the cursor
    if (MOUSE.snap){
      var lp = DRAW.pts[DRAW.pts.length-1];
      var Lc = Math.hypot(MOUSE.snap.x-lp[0], MOUSE.snap.y-lp[1]);
      if (Lc > 1e-6){
        var midc = w2s((lp[0]+MOUSE.snap.x)/2, (lp[1]+MOUSE.snap.y)/2);
        var ncx = -(MOUSE.snap.y-lp[1])/Lc, ncy = (MOUSE.snap.x-lp[0])/Lc;
        ctx.fillStyle = THEME.accentLight;
        ctx.fillText(Lc.toFixed(2), midc.x + ncx*11, midc.y - ncy*11);
      }
    }
    ctx.restore();
  }

  // polyline: show a box over the first point when hovering close enough to close the loop
  if (TOOL === 'poly' && DRAW && DRAW.pts && DRAW.pts.length > 2 && MOUSE.snap){
    var f0 = DRAW.pts[0];
    if (Math.hypot(MOUSE.snap.x-f0[0], MOUSE.snap.y-f0[1]) < 6/VIEW.scale){
      var fs = w2s(f0[0], f0[1]);
      ctx.save();
      ctx.strokeStyle = '#7fb069'; ctx.lineWidth = 2;
      ctx.strokeRect(fs.x-6, fs.y-6, 12, 12);
      ctx.restore();
    }
  }
  if (MOUSE.snap && MOUSE.snap.k === 'angle' && MOUSE.snap.from){
    var af = w2s(MOUSE.snap.from.x, MOUSE.snap.from.y), at = w2s(MOUSE.snap.x, MOUSE.snap.y);
    var adx = at.x - af.x, ady = at.y - af.y, aL = Math.hypot(adx, ady) || 1, far = Math.max(cv.width, cv.height) * 2;
    ctx.save();
    ctx.strokeStyle = THEME.accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(af.x, af.y); ctx.lineTo(af.x + adx / aL * far, af.y + ady / aL * far); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily; ctx.fillStyle = THEME.accent;
    ctx.fillText(MOUSE.snap.deg + '\u00b0' + (MOUSE.snap.onGuide ? ' \u00b7 guide' : ''), at.x + 12, at.y + 18);
    ctx.restore();
  }
  if (MOUSE.snap && MOUSE.snap.k !== 'grid'){
    var sm = w2s(MOUSE.snap.x, MOUSE.snap.y);
    ctx.strokeStyle = MOUSE.snap.k==='guideX' ? '#7fb069' : THEME.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sm.x-4, sm.y-4, 8, 8);
  }
  // edit-tool hover feedback: check (can act) / X (cannot), VCarve-style, at the cursor
  var hd = TOOLS[TOOL];
  if (hd && hd.kind === 'edit' && HOVER && MOUSE.mx != null){
    var gx = MOUSE.mx + 14, gy = MOUSE.my - 14;
    // highlight the affected entity for trim/extend
    if (HOVER.action === 'do' && HOVER.idx != null && DOC.ents[HOVER.idx]){
      ctx.save();
      ctx.strokeStyle = '#7fb069'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
      drawEntityOutline(DOC.ents[HOVER.idx]);
      ctx.restore();
    }
    // preview of the corner a click will produce (amber and dashed: the sharp corner a removal restores)
    var unf = HOVER.action === 'unfillet';
    if (HOVER.preview && HOVER.preview.length > 1){
      ctx.save(); ctx.strokeStyle = unf ? THEME.accent : '#7fb069'; ctx.lineWidth = 2; ctx.setLineDash(unf ? [5, 4] : []);
      ctx.beginPath();
      var pv0 = w2s(HOVER.preview[0][0], HOVER.preview[0][1]); ctx.moveTo(pv0.x, pv0.y);
      for (var pq = 1; pq < HOVER.preview.length; pq++){ var pvq = w2s(HOVER.preview[pq][0], HOVER.preview[pq][1]); ctx.lineTo(pvq.x, pvq.y); }
      ctx.stroke(); ctx.restore();
    }
    // fillet corner marker
    if (HOVER.at){
      var ap = w2s(HOVER.at.x, HOVER.at.y);
      ctx.save();
      ctx.strokeStyle = HOVER.action === 'do' ? '#7fb069' : (unf ? THEME.accent : '#e06c5a');
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ap.x, ap.y, 7, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    // glyph
    ctx.save();
    ctx.font = 'bold 15px sans-serif'; ctx.textBaseline = 'middle';
    if (HOVER.action === 'do'){
      ctx.fillStyle = '#7fb069'; ctx.fillText('\u2713', gx, gy);   // check
    } else if (unf){
      ctx.fillStyle = THEME.accent; ctx.fillText('\u21ba', gx, gy);  // restore the corner
    } else {
      ctx.fillStyle = '#e06c5a'; ctx.fillText('\u2717', gx, gy);   // X
    }
    ctx.restore();
  }
}
