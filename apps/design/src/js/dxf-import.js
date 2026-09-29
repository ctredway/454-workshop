/* ---------------- DXF import ----------------
   Text group-code pairs. Maps LINE/CIRCLE/ARC 1:1, LWPOLYLINE straight to the
   point+bulge path model (identical convention), samples SPLINE (NURBS) and
   ELLIPSE. Skipped entity types are counted and reported. */
function dxfParsePairs(text){
  var lines = text.split(/\r\n|\r|\n/);
  var pairs = [];
  for (var i = 0; i + 1 < lines.length; i += 2){
    var code = parseInt(lines[i].trim(), 10);
    if (isNaN(code)) { i--; continue; }
    pairs.push([code, lines[i+1].trim()]);
  }
  return pairs;
}
function dxfNurbsSample(degree, knots, ctrl, weights, closed, nSamples){
  var n = ctrl.length - 1;
  function findSpan(u){
    if (u >= knots[n+1]) return n;
    var lo = degree, hi = n+1;
    var mid = (lo+hi) >> 1;
    while (u < knots[mid] || u >= knots[mid+1]){
      if (u < knots[mid]) hi = mid; else lo = mid;
      mid = (lo+hi) >> 1;
    }
    return mid;
  }
  function basis(span, u){
    var N = [1], left = [], right = [];
    for (var j = 1; j <= degree; j++){
      left[j] = u - knots[span+1-j];
      right[j] = knots[span+j] - u;
      var saved = 0;
      for (var r = 0; r < j; r++){
        var tmp = N[r] / (right[r+1] + left[j-r]);
        N[r] = saved + right[r+1]*tmp;
        saved = left[j-r]*tmp;
      }
      N[j] = saved;
    }
    return N;
  }
  var u0 = knots[degree], u1 = knots[n+1];
  var out = [];
  for (var k = 0; k <= nSamples; k++){
    var u = u0 + (u1-u0)*k/nSamples;
    if (k === nSamples) u = u1 - (u1-u0)*1e-9;
    var span = findSpan(u), N2 = basis(span, u);
    var x = 0, y = 0, wsum = 0;
    for (var j2 = 0; j2 <= degree; j2++){
      var idx = span - degree + j2;
      var wgt = weights ? weights[idx] : 1;
      x += N2[j2]*wgt*ctrl[idx][0];
      y += N2[j2]*wgt*ctrl[idx][1];
      wsum += N2[j2]*wgt;
    }
    out.push([x/wsum, y/wsum]);
  }
  return out;
}
// The BLOCKS section: for each named block, its base point and its entities' pairs, wrapped so the
// importer can read them as if they were an ENTITIES section.
function dxfBlocks(pairs){
  var out = {}, n = pairs.length, inBlocks = false;
  for (var i = 0; i < n; i++){
    var pr = pairs[i];
    if (pr[0] === 0 && pr[1] === 'SECTION' && i + 1 < n && pairs[i + 1][0] === 2){ inBlocks = pairs[i + 1][1] === 'BLOCKS'; continue; }
    if (!inBlocks || pr[0] !== 0 || pr[1] !== 'BLOCK') continue;
    var name = null, bx = 0, by = 0, j = i + 1;
    while (j < n && pairs[j][0] !== 0){
      if (pairs[j][0] === 2 && name === null) name = String(pairs[j][1]);
      else if (pairs[j][0] === 10) bx = parseFloat(pairs[j][1]) || 0;
      else if (pairs[j][0] === 20) by = parseFloat(pairs[j][1]) || 0;
      j++;
    }
    var body = [[0, 'SECTION'], [2, 'ENTITIES']];
    while (j < n && !(pairs[j][0] === 0 && pairs[j][1] === 'ENDBLK')){ body.push(pairs[j]); j++; }
    body.push([0, 'ENDSEC']); body.push([0, 'EOF']);
    if (name !== null) out[name] = {bx: bx, by: by, pairs: body};
    i = j;
  }
  return out;
}
// One of a block's entities, placed: shifted by the base point, scaled, rotated, moved to the insertion
// point. A negative scale mirrors, which reverses arcs and curved segments; unequal X and Y scales turn
// circles into ellipses, which come in as outlines.
function dxfPlace(e, bx, by, ins, ox, oy){
  var cs = Math.cos(ins.rot), sn = Math.sin(ins.rot), sx = ins.sx, sy = ins.sy;
  function P(x, y){ var u = (x - bx) * sx + ox, v = (y - by) * sy + oy; return [ins.x + u * cs - v * sn, ins.y + u * sn + v * cs]; }
  var mirror = sx * sy < 0, uniform = Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-9, k = Math.abs(sx);
  var t = JSON.parse(JSON.stringify(e));
  if (e.t === 'line'){ var a = P(e.x1, e.y1), b = P(e.x2, e.y2); t.x1 = a[0]; t.y1 = a[1]; t.x2 = b[0]; t.y2 = b[1]; return t; }
  if ((e.t === 'circle' || e.t === 'arc') && !uniform){        // an ellipse now: an outline through placed points
    var sw = e.t === 'circle' ? 2 * Math.PI : arcSweepOf(e.a0, e.a1, e.ccw), a0 = e.t === 'circle' ? 0 : e.a0, dir = e.t === 'circle' || e.ccw ? 1 : -1;
    var m = Math.max(24, Math.ceil(sw / (2 * Math.PI) * 96)), pts = [];
    for (var q = 0; q <= m; q++){ if (e.t === 'circle' && q === m) break; var an = a0 + dir * sw * q / m; pts.push(P(e.cx + e.r * Math.cos(an), e.cy + e.r * Math.sin(an))); }
    return {t: 'poly', pts: pts, closed: e.t === 'circle', dxfLayer: e.dxfLayer};
  }
  if (e.t === 'circle'){ var c = P(e.cx, e.cy); t.cx = c[0]; t.cy = c[1]; t.r = e.r * k; return t; }
  if (e.t === 'arc'){                                  // place the centre and both ends; the angles follow
    var cc = P(e.cx, e.cy), sw2 = arcSweepOf(e.a0, e.a1, e.ccw);
    var s0 = P(e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0));
    var e0 = P(e.cx + e.r * Math.cos(e.a0 + (e.ccw ? 1 : -1) * sw2), e.cy + e.r * Math.sin(e.a0 + (e.ccw ? 1 : -1) * sw2));
    t.cx = cc[0]; t.cy = cc[1]; t.r = e.r * k; t.ccw = mirror ? !e.ccw : e.ccw;
    t.a0 = Math.atan2(s0[1] - cc[1], s0[0] - cc[0]); t.a1 = Math.atan2(e0[1] - cc[1], e0[0] - cc[0]);
    if (sw2 > 2 * Math.PI - 1e-9) t.a1 = t.a0;         // a whole turn stays a whole turn
    return t;
  }
  if (e.t === 'poly'){ t.pts = e.pts.map(function (q) { return P(q[0], q[1]); }); return t; }
  if (e.t === 'path'){
    if (!uniform){                                     // curved segments under unequal scaling: follow the placed curve
      var tp = tessPath(e, 0.05).map(function (q) { return P(q[0], q[1]); });
      return {t: 'poly', pts: tp, closed: e.closed, dxfLayer: e.dxfLayer};
    }
    t.pts = e.pts.map(function (q) { var r = P(q[0], q[1]); return [r[0], r[1], mirror ? -(q[2] || 0) : (q[2] || 0)]; });
    return t;
  }
  return null;
}
function dxfExtract(text, givenPairs, depth, blockDefs){
  var pairs = givenPairs || dxfParsePairs(text);
  var i = 0, n = pairs.length;
  var units = 0; // $INSUNITS: 1=in, 4=mm, 0=unitless
  var ents = [], skipped = {}, inserts = [];
  depth = depth || 0;
  // header: find $INSUNITS
  for (var h = 0; h < n-1; h++){
    if (pairs[h][0] === 9 && pairs[h][1] === '$INSUNITS'){
      for (var h2 = h+1; h2 < Math.min(h+4, n); h2++)
        if (pairs[h2][0] === 70){ units = parseInt(pairs[h2][1], 10) || 0; break; }
      break;
    }
  }
  // find ENTITIES section
  var inEnts = false;
  while (i < n){
    var pr = pairs[i];
    if (pr[0] === 0 && pr[1] === 'SECTION' && i+1 < n && pairs[i+1][0] === 2){
      inEnts = pairs[i+1][1] === 'ENTITIES';
      i += 2; continue;
    }
    if (pr[0] === 0 && pr[1] === 'ENDSEC'){ inEnts = false; i++; continue; }
    if (!inEnts || pr[0] !== 0){ i++; continue; }
    // entity start: collect its pairs until next code-0
    var type = pr[1]; i++;
    var g = {};       // last value per code
    var multi = {};   // arrays for repeating codes
    var seq = [];     // this entity's pairs, in order
    while (i < n && pairs[i][0] !== 0){
      var c = pairs[i][0], v = pairs[i][1];
      g[c] = v;
      (multi[c] = multi[c] || []).push(v);
      seq.push(pairs[i]);
      i++;
    }
    function f(code, m){ return parseFloat((m||g)[code]); }
    function arr(code){ return (multi[code] || []).map(parseFloat); }
    var nBefore = ents.length;                       // whatever this entity adds gets its DXF layer
    if (type === 'INSERT'){                          // a placed block: expanded once everything is read
      inserts.push({name: String(g[2] || ''), x: f(10) || 0, y: f(20) || 0,
                    sx: g[41] !== undefined ? f(41) : 1, sy: g[42] !== undefined ? f(42) : 1, rot: (f(50) || 0) * Math.PI / 180,
                    cols: parseInt(g[70] || '1', 10) || 1, rows: parseInt(g[71] || '1', 10) || 1, cs: f(44) || 0, rs: f(45) || 0,
                    layer: g[8] !== undefined ? String(g[8]) : '0'});
    } else if (type === 'LINE'){
      ents.push({t:'line', x1:f(10), y1:f(20), x2:f(11), y2:f(21)});
    } else if (type === 'CIRCLE'){
      ents.push({t:'circle', cx:f(10), cy:f(20), r:f(40)});
    } else if (type === 'ARC'){
      var a0 = f(50)*Math.PI/180, a1 = f(51)*Math.PI/180;
      ents.push({t:'arc', cx:f(10), cy:f(20), r:f(40), a0:a0, a1:a1, ccw:true});
    } else if (type === 'LWPOLYLINE'){
      var xs = arr(10), ys = arr(20), bs = arr(42);
      var flags = parseInt(g[70] || '0', 10);
      var closed = !!(flags & 1);
      // bulge code 42 may be sparse: rebuild per-vertex by walking pairs again is complex;
      // common case: exporters emit 42 only when nonzero, in vertex order interleaved.
      // Reconstruct by re-walking this entity's pair stream:
      ents.push({t:'_lw', xs:xs, ys:ys, closed:closed});
      var lw = ents[ents.length-1];
      lw.bulges = new Array(xs.length);
      for (var q = 0; q < xs.length; q++) lw.bulges[q] = 0;
      // a bulge (42) belongs to the vertex (10) before it; exporters write it only when non-zero
      var vi0 = -1;
      seq.forEach(function (pp) {
        if (pp[0] === 10) vi0++;
        else if (pp[0] === 42 && vi0 >= 0 && vi0 < lw.bulges.length) lw.bulges[vi0] = parseFloat(pp[1]);
      });
    } else if (type === 'POLYLINE'){
      // old-style: vertices follow as VERTEX entities until SEQEND
      var pl = {t:'_pl', pts:[], closed: !!(parseInt(g[70]||'0',10) & 1)};
      ents.push(pl);
    } else if (type === 'VERTEX'){
      var last = ents[ents.length-1];
      if (last && last.t === '_pl') last.pts.push([f(10), f(20), f(42) || 0]);
    } else if (type === 'SEQEND'){
      /* closes the POLYLINE */
    } else if (type === 'SPLINE'){
      var deg = parseInt(g[71] || '3', 10);
      var kn = arr(40), cx2 = arr(10), cy2 = arr(20), wts = arr(41);
      var ctrl = cx2.map(function(x, ix){ return [x, cy2[ix]]; });
      if (ctrl.length > deg && kn.length >= ctrl.length + deg + 1){
        var samples = Math.min(400, Math.max(24, ctrl.length * 8));
        var ptsS = dxfNurbsSample(deg, kn, ctrl, wts.length === ctrl.length ? wts : null,
                                  false, samples);
        var closedS = !!(parseInt(g[70]||'0',10) & 1);
        ents.push({t:'poly', pts:ptsS, closed:closedS});
      } else skipped.SPLINE = (skipped.SPLINE||0)+1;
    } else if (type === 'ELLIPSE'){
      var ecx = f(10), ecy = f(20), emx = f(11), emy = f(21);
      var ratio = f(40), t0 = f(41), t1 = f(42);
      if (t1 <= t0) t1 += 2*Math.PI;
      var maj = Math.hypot(emx, emy), ang = Math.atan2(emy, emx);
      var stepsE = Math.max(16, Math.ceil((t1-t0)/0.1));
      var ptsE = [];
      for (var ke = 0; ke <= stepsE; ke++){
        var t = t0 + (t1-t0)*ke/stepsE;
        var ex = maj*Math.cos(t), ey = maj*ratio*Math.sin(t);
        ptsE.push([ecx + ex*Math.cos(ang) - ey*Math.sin(ang),
                   ecy + ex*Math.sin(ang) + ey*Math.cos(ang)]);
      }
      var fullE = Math.abs((t1-t0) - 2*Math.PI) < 1e-6;
      if (fullE) ptsE.pop();
      ents.push({t:'poly', pts:ptsE, closed:fullE});
    } else {
      skipped[type] = (skipped[type]||0)+1;
    }
    for (var li2 = nBefore; li2 < ents.length; li2++) if (ents[li2].dxfLayer === undefined) ents[li2].dxfLayer = g[8] !== undefined ? String(g[8]) : '0';
  }
  // the layer table: names in order, and which are off (negative colour) or locked (flag 4)
  var layerTable = [];
  for (var lt = 0; lt < n - 1; lt++){
    if (pairs[lt][0] === 0 && pairs[lt][1] === 'LAYER'){       // a layer entry (the table itself starts "0 TABLE")
      var nm = null, col = 7, fl = 0, k2 = lt + 1;
      while (k2 < n && pairs[k2][0] !== 0){
        if (pairs[k2][0] === 2) nm = String(pairs[k2][1]);
        else if (pairs[k2][0] === 62) col = parseInt(pairs[k2][1], 10);
        else if (pairs[k2][0] === 70) fl = parseInt(pairs[k2][1], 10) || 0;
        k2++;
      }
      if (nm !== null) layerTable.push({name: nm, visible: col >= 0 && !(fl & 1), locked: !!(fl & 4)});
    }
  }
  // (each polyline's bulges were read from its own data above: matching them up across the whole
  //  file, as before, paired polylines in block definitions with the drawing's and mixed up curves)
  // finalize placeholder types
  var out = [];
  ents.forEach(function(e){
    if (e.t === '_lw'){
      var pts = e.xs.map(function(x, ix){ return [x, e.ys[ix], e.bulges[ix] || 0]; });
      if (pts.length < 2) return;
      out.push(pts.every(function(pt){ return Math.abs(pt[2]) < 1e-12; })
        ? {t:'poly', pts:pts.map(function(pt){ return [pt[0], pt[1]]; }), closed:e.closed, dxfLayer:e.dxfLayer}
        : {t:'path', pts:pts, closed:e.closed, dxfLayer:e.dxfLayer});
    } else if (e.t === '_pl'){
      if (e.pts.length < 2) return;
      out.push(e.pts.every(function(pt){ return Math.abs(pt[2]) < 1e-12; })
        ? {t:'poly', pts:e.pts.map(function(pt){ return [pt[0], pt[1]]; }), closed:e.closed, dxfLayer:e.dxfLayer}
        : {t:'path', pts:e.pts, closed:e.closed, dxfLayer:e.dxfLayer});
    } else out.push(e);
  });
  // BLOCKS: each named block's entities, read by this same importer, then placed at every INSERT
  if (inserts.length && depth < 8){
    var blocks = blockDefs || dxfBlocks(pairs), missing = 0;     // definitions live at the file's top level, for nested ones too
    inserts.forEach(function (ins) {
      var b = blocks[ins.name];
      if (!b){ missing++; return; }
      var inner = dxfExtract(null, b.pairs, depth + 1, blocks);
      for (var r0 = 0; r0 < ins.rows; r0++) for (var c0 = 0; c0 < ins.cols; c0++){
        var ox = c0 * ins.cs, oy = r0 * ins.rs;                     // array placements, in the block's rotated frame
        inner.ents.forEach(function (e) {
          var t = dxfPlace(e, b.bx, b.by, ins, ox, oy);
          if (!t) return;
          if (t.dxfLayer === undefined || t.dxfLayer === '0') t.dxfLayer = ins.layer;   // layer 0 inside a block takes the INSERT's
          out.push(t);
        });
        Object.keys(inner.skipped).forEach(function (k) { skipped[k] = (skipped[k] || 0) + inner.skipped[k]; });
      }
    });
    if (missing) skipped['INSERT (block not found)'] = missing;
  } else if (inserts.length) skipped['INSERT (nested too deeply)'] = inserts.length;
  return {ents:out, units:units, skipped:skipped, layers:layerTable};
}
function dxfBBox(ents){
  var b = null;
  ents.forEach(function(e){
    var eb = entBBox(e);
    b = b ? {x0:Math.min(b.x0,eb.x0), y0:Math.min(b.y0,eb.y0),
             x1:Math.max(b.x1,eb.x1), y1:Math.max(b.y1,eb.y1)} : eb;
  });
  return b || {x0:0,y0:0,x1:0,y1:0};
}
