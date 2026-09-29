/* ============================================================
   IMAGE TRACE
   Black-and-white artwork into closed outlines. The image becomes a grid of darkness values;
   the outlines are where that grid crosses the threshold, found with marching squares and
   interpolated between pixels, so edges come out smooth rather than stair-stepped. Holes stay
   holes: the inside of an "O" is its own outline. Written from scratch (Potrace is GPL).
   ============================================================ */
var TRACE = null, BGIMG = {src: null, el: null};
var TRACE_MAX = 800;                                    // longest side, in pixels, that gets traced
function traceOpen(file){
  var url = URL.createObjectURL(file), img = new Image();
  img.onload = function(){
    var k = Math.min(1, TRACE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(2, Math.round(img.naturalWidth * k)), h = Math.max(2, Math.round(img.naturalHeight * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++){
      var a = px[i*4+3] / 255;                          // transparent counts as white background
      var L = 0.2126 * px[i*4] + 0.7152 * px[i*4+1] + 0.0722 * px[i*4+2];
      lum[i] = (a * L + (1 - a) * 255) / 255;
    }
    var sr = stockRect(), W0 = Math.min(150, (sr.x1 - sr.x0) * 0.6);
    TRACE = {w: w, h: h, lum: lum, name: file.name, dataURL: c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85),
             thr: traceOtsu(lum), inv: false, smooth: 1, speck: 0.5, W: +W0.toFixed(1), bg: true, loops: []};
    TRACE.img = new Image(); TRACE.img.src = TRACE.dataURL;
    URL.revokeObjectURL(url);
    traceToForm(); document.getElementById('tracePanel').hidden = false; traceRun();
  };
  img.onerror = function(){ URL.revokeObjectURL(url); toast('err', 'Couldn\u2019t read that image', 'Try a PNG or JPG.'); };
  img.src = url;
}
// The threshold that best splits the image into two groups of brightness (Otsu's method).
function traceOtsu(lum){
  var hist = new Float64Array(256), n = lum.length;
  for (var i = 0; i < n; i++) hist[Math.min(255, Math.round(lum[i] * 255))]++;
  var sum = 0; for (var t = 0; t < 256; t++) sum += t * hist[t];
  var sumB = 0, wB = 0, best = 0, thr = 128;
  for (var t2 = 0; t2 < 256; t2++){
    wB += hist[t2]; if (!wB) continue;
    var wF = n - wB; if (!wF) break;
    sumB += t2 * hist[t2];
    var mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
    // Many splits separate clean artwork equally well; the edge itself is where the grey is
    // halfway between the dark and light groups, so use that rather than wherever the split fell.
    if (between > best){ best = between; thr = Math.round((mB + mF) / 2); }
  }
  return Math.max(1, Math.min(254, thr));
}
function traceToForm(){
  document.getElementById('trThr').value = TRACE.thr;
  document.getElementById('trInv').checked = TRACE.inv;
  document.getElementById('trSmooth').value = TRACE.smooth;
  document.getElementById('trSpeck').value = fmtDisp(TRACE.speck);
  document.getElementById('trW').value = fmtDisp(TRACE.W);
  document.getElementById('trBg').checked = TRACE.bg;
  document.getElementById('trFit').checked = TRACE.fit !== false;
  Array.prototype.forEach.call(document.querySelectorAll('#tracePanel .trUnit'), function (u) { u.textContent = unitTag(); });
}
function traceFromForm(){
  TRACE.thr = +document.getElementById('trThr').value;
  TRACE.inv = document.getElementById('trInv').checked;
  TRACE.smooth = +document.getElementById('trSmooth').value;
  var sp = lenIn(document.getElementById('trSpeck').value); if (sp >= 0) TRACE.speck = sp;
  var w = lenIn(document.getElementById('trW').value); if (w > 0) TRACE.W = w;
  TRACE.bg = document.getElementById('trBg').checked;
  TRACE.fit = document.getElementById('trFit').checked;
}
// Where the traced artwork sits: centred on the material.
function tracePlace(){
  var s = TRACE.W / TRACE.w, H = TRACE.h * s, sr = stockRect();
  return {s: s, H: H, x0: (sr.x0 + sr.x1) / 2 - TRACE.W / 2, y0: (sr.y0 + sr.y1) / 2 - H / 2};
}
function traceRun(){
  if (!TRACE) return;
  var w = TRACE.w, h = TRACE.h, GW = w + 2, GH = h + 2, thr = TRACE.thr / 255;
  // darkness per pixel, with a one-pixel border of background so every outline closes
  var src = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) src[i] = TRACE.inv ? TRACE.lum[i] : 1 - TRACE.lum[i];
  for (var pass = 0; pass < TRACE.smooth; pass++){        // a light blur softens pixel steps and noise
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){
      var sum = 0, cnt = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++){
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        sum += src[yy * w + xx]; cnt++;
      }
      out[y * w + x] = sum / cnt;
    }
    src = out;
  }
  var dark = 1 - thr;                                    // the level where "dark enough" begins
  var F = new Float32Array(GW * GH);
  for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) F[(y2 + 1) * GW + x2 + 1] = src[y2 * w + x2] - dark;
  // marching squares, with every crossing named by the grid edge it lies on, so pieces join exactly
  var HOFF = 0, VOFF = GW * GH, nb = new Int32Array(2 * GW * GH * 2).fill(-1);
  function hE(x, y){ return HOFF + y * GW + x; }       // edge from (x,y) to (x+1,y)
  function vE(x, y){ return VOFF + y * GW + x; }       // edge from (x,y) to (x,y+1)
  function link(a, b){ if (nb[a*2] < 0) nb[a*2] = b; else nb[a*2+1] = b; if (nb[b*2] < 0) nb[b*2] = a; else nb[b*2+1] = a; }
  for (var cy = 0; cy < GH - 1; cy++) for (var cx = 0; cx < GW - 1; cx++){
    var a = F[cy*GW+cx], b = F[cy*GW+cx+1], c = F[(cy+1)*GW+cx+1], d = F[(cy+1)*GW+cx];
    var code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    var top = hE(cx, cy), right = vE(cx + 1, cy), bot = hE(cx, cy + 1), left = vE(cx, cy);
    var e = [];
    if ((a > 0) !== (b > 0)) e.push(top);
    if ((b > 0) !== (c > 0)) e.push(right);
    if ((c > 0) !== (d > 0)) e.push(bot);
    if ((d > 0) !== (a > 0)) e.push(left);
    if (e.length === 2) link(e[0], e[1]);
    else if (e.length === 4){                            // a saddle: decided by the centre
      var mid = (a + b + c + d) / 4;
      if ((mid > 0) === (a > 0)){ link(top, right); link(bot, left); } else { link(top, left); link(right, bot); }
    }
  }
  function pointOf(eid){                                // where on its edge the crossing lies, in pixels
    var vert = eid >= VOFF, k = vert ? eid - VOFF : eid, x = k % GW, y = (k - x) / GW;
    var x1 = vert ? x : x + 1, y1 = vert ? y + 1 : y;
    var v0 = F[y * GW + x], v1 = F[y1 * GW + x1], t = v0 / (v0 - v1);
    return [x + (x1 - x) * t - 1 + 0.5, y + (y1 - y) * t - 1 + 0.5];
  }
  var seen = new Uint8Array(nb.length / 2), loops = [];
  for (var start = 0; start < seen.length; start++){
    if (seen[start] || nb[start*2] < 0) continue;
    var loop = [], prev = -1, cur = start;
    while (cur >= 0 && !seen[cur]){
      seen[cur] = 1; loop.push(pointOf(cur));
      var nx = nb[cur*2] !== prev ? nb[cur*2] : nb[cur*2+1];
      prev = cur; cur = nx;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  // to drawing units, flipped (images count down, drawings count up), simplified, specks dropped
  var P = tracePlace(), tol = [0.35, 0.6, 1.0][TRACE.smooth] * P.s, minArea = TRACE.speck * TRACE.speck;
  var dense = loops.map(function (l) { return l.map(function (q) { return [P.x0 + q[0] * P.s, P.y0 + P.H - q[1] * P.s]; }); })
                   .filter(function (l) { return l.length >= 3 && Math.abs(polyArea(l)) >= minArea; });
  TRACE.loops = dense.map(function (l) { return traceSimplify(l, tol); }).filter(function (l) { return l.length >= 3; });
  // with Fit curves: arcs and straight lines instead of many short segments, within the same tolerance
  TRACE.curves = TRACE.fit !== false ? dense.map(function (l) { return traceFit(l, tol); }) : null;
  var holes = TRACE.loops.filter(function (l) { return traceDepth(l, TRACE.loops) % 2 === 1; }).length;
  document.getElementById('trH').textContent = '\u00d7 ' + fmtDisp(P.H) + ' ' + unitTag() + ' high';
  document.getElementById('trHint').textContent = TRACE.loops.length
    ? TRACE.loops.length + (TRACE.loops.length === 1 ? ' outline' : ' outlines') + (holes ? ', ' + holes + (holes === 1 ? ' of them a hole' : ' of them holes') : '') +
      (TRACE.curves ? ', ' + TRACE.curves.reduce(function (a, l) { return a + l.length; }, 0) + ' arcs and lines (' + TRACE.loops.reduce(function (a, l) { return a + l.length; }, 0) + ' points without Fit curves)'
                    : ', ' + TRACE.loops.reduce(function (a, l) { return a + l.length; }, 0) + ' points') + '. Placed in the middle of the material.'
    : 'Nothing traced: try moving the threshold, or Invert for light artwork on a dark background.';
  document.getElementById('trOk').disabled = !TRACE.loops.length;
  draw();
}
function polyArea(l){ var a = 0; for (var i = 0; i < l.length; i++){ var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// how many other outlines contain this one: odd means it's a hole
function traceDepth(l, all){
  var p = l[0], d = 0;
  all.forEach(function (o) {
    if (o === l) return;
    var inside = false;
    for (var i = 0, j = o.length - 1; i < o.length; j = i++){
      if ((o[i][1] > p[1]) !== (o[j][1] > p[1]) && p[0] < (o[j][0] - o[i][0]) * (p[1] - o[i][1]) / (o[j][1] - o[i][1]) + o[i][0]) inside = !inside;
    }
    if (inside) d++;
  });
  return d;
}
// Ramer-Douglas-Peucker on a closed outline: fewer points, same shape within the tolerance
function traceSimplify(pts, tol){
  if (pts.length < 8) return pts;
  var far = 0, fd = -1;
  for (var i = 1; i < pts.length; i++){ var dd = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (dd > fd){ fd = dd; far = i; } }
  function rdp(a, b, out){
    var A = pts[a], B = pts[b % pts.length], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-9, md = -1, mi = -1;
    for (var k = a + 1; k < b; k++){
      var P = pts[k % pts.length], d = Math.abs(dy * (P[0] - A[0]) - dx * (P[1] - A[1])) / L;
      if (d > md){ md = d; mi = k; }
    }
    if (md > tol){ rdp(a, mi, out); rdp(mi, b, out); } else out.push(A);
  }
  var out = [];
  rdp(0, far, out); rdp(far, pts.length, out);
  return out;
}
// Fit straight lines and arcs to a traced outline, longest pieces first, each within `tol` of every
// traced point it replaces. The result is a curved outline (points with bulges, as Design's own curves
// are stored): a traced circle becomes a few arcs instead of hundreds of points. No arc can fit across a
// corner within the tolerance, so corners stay sharp.
function traceFit(pts, tol){
  var n = pts.length; if (n < 8) return pts.map(function (q) { return [q[0], q[1], 0]; });
  // start at the sharpest corner, so no piece has to bend round it
  var best = 0, bestTurn = -1, w = 3;
  for (var i = 0; i < n; i++){
    var a = pts[(i - w + n) % n], b = pts[i], c = pts[(i + w) % n];
    var t = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])));
    if (t > bestTurn){ bestTurn = t; best = i; }
  }
  var P = pts.slice(best).concat(pts.slice(0, best)); P.push(P[0]);
  var N = P.length;
  function lineFits(i, j){
    var A = P[i], B = P[j], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) return j - i < 3;
    for (var k = i + 1; k < j; k++){
      var t = ((P[k][0] - A[0]) * dx + (P[k][1] - A[1]) * dy) / (L * L);
      if (t < -0.01 || t > 1.01) return false;
      if (Math.abs(dy * (P[k][0] - A[0]) - dx * (P[k][1] - A[1])) / L > tol) return false;
    }
    return true;
  }
  function arcFit(i, j){                                   // the arc through both ends and the middle point
    if (j - i < 4) return null;
    var A = P[i], M = P[(i + j) >> 1], B = P[j];
    var d = 2 * (A[0] * (M[1] - B[1]) + M[0] * (B[1] - A[1]) + B[0] * (A[1] - M[1]));
    if (Math.abs(d) < 1e-12) return null;
    var a2 = A[0] * A[0] + A[1] * A[1], m2 = M[0] * M[0] + M[1] * M[1], b2 = B[0] * B[0] + B[1] * B[1];
    var cx = (a2 * (M[1] - B[1]) + m2 * (B[1] - A[1]) + b2 * (A[1] - M[1])) / d, cy = (a2 * (B[0] - M[0]) + m2 * (A[0] - B[0]) + b2 * (M[0] - A[0])) / d;
    var r = Math.hypot(A[0] - cx, A[1] - cy);
    var ccw = (M[0] - A[0]) * (B[1] - M[1]) - (M[1] - A[1]) * (B[0] - M[0]) > 0;
    var a0 = Math.atan2(A[1] - cy, A[0] - cx), a1 = Math.atan2(B[1] - cy, B[0] - cx);
    var sw = ccw ? a1 - a0 : a0 - a1; while (sw <= 0) sw += 2 * Math.PI; while (sw > 2 * Math.PI) sw -= 2 * Math.PI;
    if (sw > 1.6 * Math.PI) return null;                   // keep arcs well short of a full turn
    for (var k = i + 1; k < j; k++){
      if (Math.abs(Math.hypot(P[k][0] - cx, P[k][1] - cy) - r) > tol) return null;
      var ak = Math.atan2(P[k][1] - cy, P[k][0] - cx), s2 = ccw ? ak - a0 : a0 - ak;
      while (s2 < 0) s2 += 2 * Math.PI; while (s2 > 2 * Math.PI) s2 -= 2 * Math.PI;
      if (s2 > sw + 0.02) return null;                     // must lie along the arc, not round the back of the circle
    }
    return (ccw ? 1 : -1) * Math.tan(sw / 4);
  }
  var out = [], i0 = 0;
  while (i0 < N - 1){
    // grow the piece while something fits: doubling, then narrowing down on the longest that does
    var good = i0 + 1, goodB = 0, step = 2;
    function fits(j){ if (lineFits(i0, j)) return 0; var b = arcFit(i0, j); return b === null ? null : b; }
    while (good + step <= N - 1){ var r2 = fits(good + step); if (r2 === null) break; good += step; goodB = r2; step *= 2; }
    var lo = good, hi = Math.min(N - 1, good + step);
    while (hi - lo > 1){ var mid = (lo + hi) >> 1, rm = fits(mid); if (rm === null) hi = mid; else { lo = mid; goodB = rm; } }
    if (lo > good){ good = lo; } else { var rg = fits(good); goodB = rg === null ? 0 : rg; }
    out.push([P[i0][0], P[i0][1], goodB]);
    i0 = good;
  }
  return out;
}
function traceApply(){
  if (!TRACE || !TRACE.loops.length) return;
  pushUndo();
  var shapes = TRACE.curves
    ? TRACE.curves.map(function (l) { return {t: 'path', pts: l.map(function (q) { return [+q[0].toFixed(4), +q[1].toFixed(4), +q[2].toFixed(6)]; }), closed: true}; })
    : TRACE.loops.map(function (l) { return {t: 'poly', pts: l.map(function (q) { return [+q[0].toFixed(4), +q[1].toFixed(4)]; }), closed: true}; });
  DOC.ents.push(shapes.length === 1 ? shapes[0] : {t: 'group', ents: shapes});
  layersInit();
  shapes.forEach(function (sh) { sh.layer = DOC.activeLayer; });
  var grp = DOC.ents[DOC.ents.length - 1]; grp.layer = DOC.activeLayer;
  if (TRACE.bg){
    var P = tracePlace(), keepActive = DOC.activeLayer;
    var lid = layerNew('Reference: ' + (TRACE.name || 'image'), true);   // at the bottom: drawn underneath
    DOC.imageData[lid] = TRACE.dataURL;
    DOC.images.push({id: lid, layer: lid, x: P.x0, y: P.y0, w: TRACE.W, h: P.H});
    DOC.activeLayer = keepActive;
  }
  var n = shapes.length;
  SEL = [DOC.ents.length - 1];
  traceClose();
  persist(); renderLayers(); draw();
  toast('ok', 'Traced ' + n + (n === 1 ? ' outline' : ' outlines'), 'Grouped, and selected so you can move or scale them. Ungroup (Ctrl+U) to work on them one at a time.');
}
function traceClose(){ TRACE = null; document.getElementById('tracePanel').hidden = true; draw(); }
function bgChipSync(){ if (typeof renderLayers === 'function') renderLayers(); }
// the kept image, drawn faintly behind everything
function drawBgImage(ctx){
  if (!TRACE){ drawLayerImages(ctx); return; }
  var bi = null, src = TRACE.dataURL;
  if (!src) return;
  if (BGIMG.src !== src){ BGIMG.src = src; BGIMG.el = new Image(); BGIMG.el.onload = draw; BGIMG.el.src = src; }
  if (!BGIMG.el || !BGIMG.el.complete || !BGIMG.el.naturalWidth) return;
  var r = TRACE ? (function(){ var P = tracePlace(); return {x: P.x0, y: P.y0, w: TRACE.W, h: P.H}; })() : bi;
  var a = w2s(r.x, r.y + r.h), b = w2s(r.x + r.w, r.y);
  ctx.save(); ctx.globalAlpha = TRACE ? 0.45 : 0.3;
  ctx.drawImage(BGIMG.el, a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.restore();
}
function drawTracePreview(ctx){
  if (!TRACE || !TRACE.loops.length) return;
  ctx.save(); ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.2;
  TRACE.loops.forEach(function (l) {
    ctx.beginPath();
    l.forEach(function (q, i) { var p = w2s(q[0], q[1]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.stroke();
  });
  ctx.restore();
}
