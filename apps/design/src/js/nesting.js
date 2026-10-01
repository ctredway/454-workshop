// ---- nesting ----
// Parts are packed on a grid, largest first, bottom-left, trying several angles each. Every part's
// grid footprint is rounded OUTWARD and the spacing is rounded UP, so gaps are never below the
// value asked for. Shapes that aren't being nested stay put and are treated as obstacles.
function pointInPoly(pt, poly){
  var x = pt.x, y = pt.y, c = false;
  for (var a = 0, b = poly.length - 1; a < poly.length; b = a++){
    var xi = poly[a][0], yi = poly[a][1], xj = poly[b][0], yj = poly[b][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function closedPolyOf(e){                  // outline polygon of a closed shape, for "is this inside?"
  if (e.t === 'circle'){ var o = []; for (var k = 0; k < 72; k++){ var a = k/72*2*Math.PI; o.push([e.cx + e.r*Math.cos(a), e.cy + e.r*Math.sin(a)]); } return o; }
  if (e.t === 'rect') return [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]];
  if (e.t === 'poly' && e.closed) return e.pts.map(function(q){ return [q[0], q[1]]; });
  if (e.t === 'path' && e.closed) return tessPath(e, 0.05).map(function(q){ return [q[0], q[1]]; });
  return null;
}
// group the given shapes into parts: an outline plus everything inside it travels together
function nestParts(idxs){
  var its = idxs.map(function(i){ return {i:i, e:DOC.ents[i], b:entBBox(DOC.ents[i]), poly:closedPolyOf(DOC.ents[i])}; });
  its.forEach(function(it){
    var best = null, a = it.b, rp = repPoint(it.e);
    its.forEach(function(jt){
      if (jt === it || !jt.poly) return;
      var b = jt.b;
      if (a.x0 < b.x0 - 1e-9 || a.x1 > b.x1 + 1e-9 || a.y0 < b.y0 - 1e-9 || a.y1 > b.y1 + 1e-9) return;
      var area = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (area <= (a.x1 - a.x0) * (a.y1 - a.y0) + 1e-9) return;     // must be strictly bigger
      if (!pointInPoly(rp, jt.poly)) return;
      if (!best || area < best.area) best = {jt:jt, area:area};
    });
    it.parent = best ? best.jt : null;
  });
  var parts = [];
  its.forEach(function(it){ if (!it.parent) parts.push({root:it, members:[]}); });
  its.forEach(function(it){
    var r = it; while (r.parent) r = r.parent;
    for (var k = 0; k < parts.length; k++) if (parts[k].root === r){ parts[k].members.push(it.i); break; }
  });
  parts.forEach(function(pt){
    var bb = null;
    pt.members.forEach(function(i){ var b = entBBox(DOC.ents[i]);
      bb = bb ? {x0:Math.min(bb.x0,b.x0), y0:Math.min(bb.y0,b.y0), x1:Math.max(bb.x1,b.x1), y1:Math.max(bb.y1,b.y1)} : b; });
    pt.bbox = bb;
  });
  return parts;
}
function nestGeom(e, out){                 // closed outlines to fill + open strokes to mark
  if (e.t === 'group'){ e.ents.forEach(function(m){ nestGeom(m, out); }); return; }
  if (e.t === 'text'){ var tw = textWorld(e); (tw || [textCorners(e)]).forEach(function(ct){ out.polys.push(ct); }); return; }
  if (e.t === 'circle'){
    var rr = e.r / Math.cos(Math.PI / 72), o = [];          // circumscribed, so the polygon covers the circle
    for (var k = 0; k < 72; k++){ var a = k/72*2*Math.PI; o.push([e.cx + rr*Math.cos(a), e.cy + rr*Math.sin(a)]); }
    out.polys.push(o); return;
  }
  var cp = e.t === 'path' && e.closed ? tessPath(e, 0.01).map(function(q){ return [q[0], q[1]]; }) : closedPolyOf(e);
  if (cp){ out.polys.push(cp); return; }
  if (e.t === 'line'){ out.segs.push([[e.x1, e.y1], [e.x2, e.y2]]); return; }
  var pts = null;
  if (e.t === 'arc'){ var sw = arcSweepOf(e.a0, e.a1, e.ccw), st = Math.max(8, Math.ceil(sw/0.01)); pts = [];
    for (var j = 0; j <= st; j++){ var q = arcPtAt(e, sw*j/st); pts.push([q.x, q.y]); } }
  else if (e.t === 'poly') pts = e.pts.map(function(q){ return [q[0], q[1]]; });
  else if (e.t === 'path') pts = tessPath(e, 0.01).map(function(q){ return [q[0], q[1]]; });
  if (pts) for (var m = 0; m < pts.length - 1; m++) out.segs.push([pts[m], pts[m+1]]);
}
// rasterize geometry rotated by th about R0 into a mask of row spans (cells rounded outward)
function nestMask(geom, R0, th, c){
  var cs = Math.cos(th), sn = Math.sin(th);
  function rot(q){ var dx = q[0]-R0.x, dy = q[1]-R0.y; return [R0.x + dx*cs - dy*sn, R0.y + dx*sn + dy*cs]; }
  var polys = geom.polys.map(function(pl){ return pl.map(rot); });
  var segs = geom.segs.map(function(sg){ return [rot(sg[0]), rot(sg[1])]; });
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  function ext(q){ if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  polys.forEach(function(pl){ pl.forEach(ext); }); segs.forEach(function(sg){ ext(sg[0]); ext(sg[1]); });
  var mw = Math.floor((x1 - x0) / c) + 1, mh = Math.floor((y1 - y0) / c) + 1;
  var bm = new Uint8Array(mw * mh);
  polys.forEach(function(pl){                                  // interior, sampled at cell centres
    for (var j = 0; j < mh; j++){
      var yc = y0 + (j + 0.5) * c, xs = [];
      for (var a = 0, b = pl.length - 1; a < pl.length; b = a++){
        var P = pl[b], Q = pl[a];
        if ((P[1] > yc) !== (Q[1] > yc)) xs.push(P[0] + (yc - P[1]) * (Q[0] - P[0]) / (Q[1] - P[1]));
      }
      xs.sort(function(u, v){ return u - v; });
      for (var k = 0; k + 1 < xs.length; k += 2){
        var i0 = Math.max(0, Math.ceil((xs[k] - x0) / c - 0.5)), i1 = Math.min(mw - 1, Math.floor((xs[k+1] - x0) / c - 0.5));
        for (var i = i0; i <= i1; i++) bm[j*mw + i] = 1;
      }
    }
  });
  function mark(P, Q){                                         // every cell an edge passes through
    var L = Math.hypot(Q[0]-P[0], Q[1]-P[1]), n = Math.max(1, Math.ceil(L / (c * 0.45)));
    for (var t = 0; t <= n; t++){
      var x = P[0] + (Q[0]-P[0]) * t/n, y = P[1] + (Q[1]-P[1]) * t/n;
      var i = Math.min(mw-1, Math.max(0, Math.floor((x - x0) / c))), j = Math.min(mh-1, Math.max(0, Math.floor((y - y0) / c)));
      bm[j*mw + i] = 1;
    }
  }
  polys.forEach(function(pl){ for (var a = 0, b = pl.length - 1; a < pl.length; b = a++) mark(pl[b], pl[a]); });
  segs.forEach(function(sg){ mark(sg[0], sg[1]); });
  var rows = [], count = 0;
  for (var j2 = 0; j2 < mh; j2++){
    var row = [], i2 = 0;
    while (i2 < mw){
      if (!bm[j2*mw + i2]){ i2++; continue; }
      var st2 = i2; while (i2 < mw && bm[j2*mw + i2]) i2++;
      row.push([st2, i2 - 1]); count += i2 - st2;
    }
    rows.push(row);
  }
  return {mw:mw, mh:mh, x0:x0, y0:y0, rows:rows, bm:bm, count:count, th:th};
}
function hullAngles(pts){                  // angles that lay each long convex-hull edge flat
  if (pts.length < 3) return [];
  var P = pts.slice().sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
  function cr(o, a, b){ return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
  var lo = [], up = [];
  P.forEach(function(q){ while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); });
  for (var i = P.length - 1; i >= 0; i--){ var q = P[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  var H = lo.slice(0, -1).concat(up.slice(0, -1)), edges = [];
  for (var k = 0; k < H.length; k++){ var a = H[k], b = H[(k+1) % H.length]; edges.push({L:Math.hypot(b[0]-a[0], b[1]-a[1]), ang:Math.atan2(b[1]-a[1], b[0]-a[0])}); }
  edges.sort(function(u, v){ return v.L - u.L; });
  var out = [];
  edges.slice(0, 4).forEach(function(ed){ for (var q4 = 0; q4 < 4; q4++) out.push(-ed.ang + q4 * Math.PI / 2); });
  return out;
}
// place `jobs` ([{part, copy}]) inside the material. Returns placements and what didn't fit.
function runNest(parts, qty, opts){
  // +0.02 mm: curves are traced as chords, which sit a hair inside the true curve; this absorbs it
  var sr = stockRect(), m = opts.margin + 0.02, gap = opts.gap > 0 ? opts.gap + 0.02 : 0;
  var W = (sr.x1 - sr.x0) - 2*m, H = (sr.y1 - sr.y0) - 2*m;
  if (W <= 0 || H <= 0) return {err:'margin'};
  var c = Math.max(0.2, Math.min(2, Math.sqrt(W * H / 250000)));
  if (gap > 0) c = Math.min(c, Math.max(0.2, gap / 2));
  var GW = Math.floor(W / c), GH = Math.floor(H / c), ox = sr.x0 + m, oy = sr.y0 + m;
  // two cells whose centres are R cells apart hold geometry at least (R - sqrt 2) cells apart,
  // so rounding R up from gap/c + sqrt 2 guarantees the real gap is never below the one asked for
  var R = gap > 0 ? Math.ceil(gap / c + Math.SQRT2) : 1;
  var blk = new Uint8Array(GW * GH), pre = new Int32Array(GH * (GW + 1)), pb = new Int32Array(GH * GW);
  var disk = [];
  for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) if (dx*dx + dy*dy <= R*R) disk.push([dx, dy]);
  function rebuild(yA, yB){
    for (var y = Math.max(0, yA); y <= Math.min(GH - 1, yB); y++){
      var base = y * (GW + 1), sum = 0, last = -1;
      pre[base] = 0;
      for (var x = 0; x < GW; x++){
        if (blk[y*GW + x]){ sum++; last = x; }
        pre[base + x + 1] = sum; pb[y*GW + x] = last;
      }
    }
  }
  function stamp(mask, gx, gy, rad){                           // block a footprint grown by rad cells
    var mw = mask.mw, mh = mask.mh, bm = mask.bm, dk = rad === R ? disk : null;
    if (!dk){ dk = []; for (var a = -rad; a <= rad; a++) for (var b = -rad; b <= rad; b++) if (a*a + b*b <= rad*rad) dk.push([a, b]); }
    for (var j = 0; j < mh; j++) for (var i = 0; i < mw; i++){
      if (!bm[j*mw + i]) continue;
      var edge = i === 0 || j === 0 || i === mw-1 || j === mh-1 || !bm[j*mw+i-1] || !bm[j*mw+i+1] || !bm[(j-1)*mw+i] || !bm[(j+1)*mw+i];
      if (!edge){ var X = gx+i, Y = gy+j; if (X >= 0 && X < GW && Y >= 0 && Y < GH) blk[Y*GW + X] = 1; continue; }
      for (var k = 0; k < dk.length; k++){
        var X2 = gx + i + dk[k][0], Y2 = gy + j + dk[k][1];
        if (X2 >= 0 && X2 < GW && Y2 >= 0 && Y2 < GH) blk[Y2*GW + X2] = 1;
      }
    }
    rebuild(gy - rad - 1, gy + mh + rad + 1);
  }
  rebuild(0, GH - 1);
  // shapes already on the sheet that aren't being nested are obstacles
  var inParts = {};
  parts.forEach(function(pt){ pt.members.forEach(function(i){ inParts[i] = true; }); });
  DOC.ents.forEach(function(e, i){
    if (inParts[i] || e.con || e.tp || !entOnSheet(e)) return;
    var g = {polys:[], segs:[]}; nestGeom(e, g);
    if (!g.polys.length && !g.segs.length) return;
    var mk = nestMask(g, {x:0, y:0}, 0, c);
    stamp(mk, Math.floor((mk.x0 - ox) / c), Math.floor((mk.y0 - oy) / c), R + 1);
  });
  function findSpot(mask, limitTop){
    for (var gy = 0; gy + mask.mh <= GH; gy++){
      if (limitTop !== null && gy + mask.mh > limitTop) return null;
      var gx = 0;
      while (gx + mask.mw <= GW){
        var jump = -1;
        for (var r = 0; r < mask.mh && jump < 0; r++){
          var row = mask.rows[r]; if (!row.length) continue;
          var yy = gy + r, base = yy * (GW + 1);
          for (var k = 0; k < row.length; k++){
            var a = row[k][0], b = row[k][1];
            if (pre[base + gx + b + 1] - pre[base + gx + a] > 0){ jump = pb[yy*GW + gx + b] - a + 1; break; }
          }
        }
        if (jump < 0) return {gx:gx, gy:gy};
        gx = Math.max(gx + 1, jump);
      }
    }
    return null;
  }
  // per-part geometry, candidate angles and masks (copies share them)
  parts.forEach(function(pt){
    var g = {polys:[], segs:[]};
    pt.members.forEach(function(i){ nestGeom(DOC.ents[i], g); });
    pt.geom = g;
    pt.R0 = {x:(pt.bbox.x0 + pt.bbox.x1)/2, y:(pt.bbox.y0 + pt.bbox.y1)/2};
    var angs = [0];
    if (opts.rot === '90') angs = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
    else if (opts.rot === 'any'){
      angs = [];
      for (var d = 0; d < 360; d += 15) angs.push(d * Math.PI / 180);
      var allPts = []; g.polys.forEach(function(pl){ pl.forEach(function(q){ allPts.push(q); }); });
      g.segs.forEach(function(sg){ allPts.push(sg[0], sg[1]); });
      hullAngles(allPts).forEach(function(a){ angs.push(a); });
    }
    var uniq = [];
    angs.forEach(function(a){
      a = ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
      if (!uniq.some(function(u){ var dd = Math.abs(u - a); return Math.min(dd, 2*Math.PI - dd) < 0.4*Math.PI/180; })) uniq.push(a);
    });
    pt.masks = uniq.map(function(a){ return nestMask(g, pt.R0, a, c); });
    pt.area = pt.masks[0].count;
  });
  var jobs = [];
  parts.forEach(function(pt, k){ for (var n = 0; n < Math.max(0, qty[k] | 0); n++) jobs.push({part:pt, copy:n}); });
  jobs.sort(function(a, b){ return b.part.area - a.part.area; });
  var placed = [], unplaced = [], used = 0;
  jobs.forEach(function(job){
    var best = null;
    job.part.masks.forEach(function(mk){
      var sp = findSpot(mk, best ? best.top : null);
      if (!sp) return;
      var top = sp.gy + mk.mh;
      if (!best || top < best.top || (top === best.top && sp.gx < best.gx)) best = {mk:mk, gx:sp.gx, gy:sp.gy, top:top};
    });
    if (!best){ unplaced.push(job); return; }
    stamp(best.mk, best.gx, best.gy, R);
    used += best.mk.count;
    placed.push({job:job, th:best.mk.th, dx:(ox + best.gx*c) - best.mk.x0, dy:(oy + best.gy*c) - best.mk.y0});
  });
  return {placed:placed, unplaced:unplaced, util: used / (GW * GH), cell:c};
}
// move the originals and add the copies
function applyNest(res){
  pushUndo();
  var newSel = [], sr = stockRect(), parkX = sr.x1 + 10;
  // copies must come from each part AS IT WAS, before any original is moved
  var pristine = {};
  res.placed.concat(res.unplaced).forEach(function(j){
    j = j.job || j;
    j.part.members.forEach(function(i){ if (!pristine[i]) pristine[i] = cloneEnt(DOC.ents[i]); });
  });
  function place(job, fn){
    var ents = job.copy === 0
      ? job.part.members.map(function(i){ return DOC.ents[i]; })
      : job.part.members.map(function(i){ var cl = cloneEnt(pristine[i]); DOC.ents.push(cl); return cl; });
    ents.forEach(fn);
    ents.forEach(function(e){ var ix = DOC.ents.indexOf(e); if (ix >= 0) newSel.push(ix); });
  }
  res.placed.forEach(function(pl){
    var R0 = pl.job.part.R0;
    place(pl.job, function(e){ if (pl.th) rotateEnt(e, R0.x, R0.y, pl.th); moveEntity(e, pl.dx, pl.dy); });
  });
  res.unplaced.forEach(function(u){                           // park beside the material, in a row
    var pb2 = u.part.bbox;
    var dx = parkX - pb2.x0, dy = sr.y0 - pb2.y0;
    place(u, function(e){ moveEntity(e, dx, dy); });
    parkX += (pb2.x1 - pb2.x0) + 10;
  });
  SEL = newSel;
  persist();
}

var NEST = null;   // {parts} while the nesting dialog is open
function openNestDialog(){
  var idxs = SEL.length ? SEL.slice()
           : DOC.ents.map(function(_, i){ return i; }).filter(function(i){ return !DOC.ents[i].con && !DOC.ents[i].tp; });
  idxs = idxs.filter(function(i){ return DOC.ents[i] && !DOC.ents[i].con && !DOC.ents[i].tp && entOnSheet(DOC.ents[i]); });
  if (!idxs.length){ toast('info', 'Nothing to nest', 'Draw or import some parts first, then select them (or select nothing to nest everything).'); return; }
  var parts = nestParts(idxs);
  NEST = {parts:parts};
  document.getElementById('nestSummary').textContent =
    parts.length + (parts.length === 1 ? ' part' : ' parts') + (SEL.length ? ' from the selection' : ' in the drawing') +
    '. Holes and anything inside a part stay with it.';
  var list = document.getElementById('nestList');
  list.innerHTML = '';
  parts.forEach(function(pt, k){
    var row = document.createElement('div'); row.className = 'nRow';
    var nm = document.createElement('span'); nm.className = 'nName'; nm.textContent = 'Part ' + (k + 1);
    var sz = document.createElement('span'); sz.className = 'nSize';
    sz.textContent = (pt.bbox.x1 - pt.bbox.x0).toFixed(1) + ' \u00d7 ' + (pt.bbox.y1 - pt.bbox.y0).toFixed(1) + ' mm';
    var q = document.createElement('input'); q.type = 'number'; q.min = '0'; q.step = '1'; q.value = '1';
    q.setAttribute('aria-label', 'Copies of part ' + (k + 1)); q.className = 'nQty';
    row.appendChild(nm); row.appendChild(sz); row.appendChild(q); list.appendChild(row);
    pt.qtyInput = q;
  });
  document.getElementById('nestAll').value = '1';
  document.getElementById('nestGap').value = UICFG.nestGap !== undefined ? UICFG.nestGap : 4;
  document.getElementById('nestMargin').value = UICFG.nestMargin !== undefined ? UICFG.nestMargin : 5;
  document.getElementById('nestRot').value = UICFG.nestRot || 'any';
  var go = document.getElementById('nestGo'); go.disabled = false; go.textContent = 'Nest parts';
  document.getElementById('nestModal').hidden = false;
  go.focus();
}
function closeNestDialog(){ document.getElementById('nestModal').hidden = true; NEST = null; }
function runNestDialog(){
  if (!NEST) return;
  var gap = parseFloat(document.getElementById('nestGap').value), margin = parseFloat(document.getElementById('nestMargin').value);
  var rot = document.getElementById('nestRot').value;
  if (!(gap >= 0) || !(margin >= 0)){ toast('warn', 'Check spacing and margin', 'Both need to be zero or more.'); return; }
  UICFG.nestGap = gap; UICFG.nestMargin = margin; UICFG.nestRot = rot; uiCfgSave();
  var parts = [], qty = [];
  NEST.parts.forEach(function(pt){
    var q = Math.max(0, Math.floor(parseFloat(pt.qtyInput.value) || 0));
    if (q > 0){ parts.push(pt); qty.push(q); }                 // zero copies: the part stays where it is
  });
  if (!parts.length){ toast('info', 'Nothing to nest', 'Every part is set to 0 copies.'); return; }
  var go = document.getElementById('nestGo'); go.disabled = true; go.textContent = 'Nesting\u2026';
  setTimeout(function(){                                       // let the button repaint before the work starts
    var res = runNest(parts, qty, {gap:gap, margin:margin, rot:rot});
    closeNestDialog();
    if (res.err === 'margin'){ toast('warn', 'Margin is too big', 'The edge margin leaves no room on the material. Use a smaller margin.'); return; }
    applyNest(res);
    draw();
    var n = res.placed.length;
    if (res.unplaced.length)
      toast('warn', res.unplaced.length + (res.unplaced.length === 1 ? ' part didn\u2019t fit' : ' parts didn\u2019t fit'),
            n + ' nested; the rest are parked to the right of the material. Try less spacing or margin, a bigger sheet, or fewer copies. Undo puts everything back.');
    else
      toast('ok', 'Nested ' + n + (n === 1 ? ' part' : ' parts'),
            'About ' + Math.round(res.util * 100) + '% of the usable material is covered. Undo puts everything back.');
  }, 30);
}

