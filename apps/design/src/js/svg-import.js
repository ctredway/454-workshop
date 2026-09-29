// ---- SVG import ----
// Reads an SVG into the same form as a DXF ({ents, layers, skipped}), in millimetres, Y up: the file's own
// size and units give the scale (px at 96 per inch, as browsers and Inkscape use). Group transforms are
// applied. Circular arcs stay arcs, circles stay circles and axis-aligned rectangles stay rectangles
// (when the transform keeps them so); Bezier curves and elliptical arcs become polylines within 0.02 mm.
// Inkscape layers become layers. Text, images and <use> copies aren't imported, and are counted.
var SVG_UNIT = {mm: 1, cm: 10, 'in': 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96};
var SVG_TOL = 0.02;                                   // mm: how closely curves are followed
function svgLen(v){                                   // an SVG length in mm, or null (percentages: null)
  var m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v || '');
  return m ? parseFloat(m[1]) * SVG_UNIT[(m[2] || '').toLowerCase()] : null;
}
function svgNum(v){ var f = parseFloat(v); return isFinite(f) ? f : 0; }
function mMul(a, b){ return [a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1], a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
                             a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5]]; }
function mApply(m, x, y){ return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }
function mDet(m){ return m[0]*m[3] - m[1]*m[2]; }
function mSimilar(m){                                 // uniform scale and rotation (a mirror too): circles stay circles
  var a = Math.hypot(m[0], m[1]), b = Math.hypot(m[2], m[3]);
  return Math.abs(a - b) <= 1e-6 * Math.max(a, b) && Math.abs(m[0]*m[2] + m[1]*m[3]) <= 1e-6 * a * b;
}
function svgTransform(str){
  var m = [1, 0, 0, 1, 0, 0], re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, t;
  while ((t = re.exec(str || ''))){
    var a = t[2].trim().split(/[\s,]+/).map(parseFloat), k;
    if (t[1] === 'matrix') k = a.slice(0, 6);
    else if (t[1] === 'translate') k = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (t[1] === 'scale') k = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
    else if (t[1] === 'rotate'){
      var r = a[0] * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
      k = [c, sn, -sn, c, 0, 0];
      if (a.length > 2) k = mMul(mMul([1, 0, 0, 1, a[1], a[2]], k), [1, 0, 0, 1, -a[1], -a[2]]);
    }
    else if (t[1] === 'skewX') k = [1, 0, Math.tan(a[0] * Math.PI / 180), 1, 0, 0];
    else k = [1, Math.tan(a[0] * Math.PI / 180), 0, 1, 0, 0];
    m = mMul(m, k);
  }
  return m;
}
// an SVG arc's centre form (the SVG specification's conversion, F.6.5)
function svgArcCenter(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2){
  var phi = phiDeg * Math.PI / 180, c = Math.cos(phi), sn = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  var xp = c*dx + sn*dy, yp = -sn*dx + c*dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  var lam = xp*xp / (rx*rx) + yp*yp / (ry*ry);
  if (lam > 1){ var q = Math.sqrt(lam); rx *= q; ry *= q; }   // radii too small to reach: scaled up, as the spec says
  var num = rx*rx*ry*ry - rx*rx*yp*yp - ry*ry*xp*xp, den = rx*rx*yp*yp + ry*ry*xp*xp;
  var co = (den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0) * (fa === fs ? -1 : 1);
  var cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
  var ang = function (ux, uy, vx, vy){ return Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy); };
  var t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  var dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  return {cx: c*cxp - sn*cyp + (x1 + x2) / 2, cy: sn*cxp + c*cyp + (y1 + y2) / 2, rx: rx, ry: ry, phi: phi, t1: t1, dt: dt};
}
function svgEllipsePt(a, t){
  var c = Math.cos(a.phi), sn = Math.sin(a.phi), ct = Math.cos(t), st = Math.sin(t);
  return [a.cx + a.rx*ct*c - a.ry*st*sn, a.cy + a.rx*ct*sn + a.ry*st*c];
}
function svgFlatCubic(p0, p1, p2, p3, tol, out, depth){
  var dx = p3[0] - p0[0], dy = p3[1] - p0[1], L = Math.hypot(dx, dy);
  var dist = function (p){ return L < 1e-12 ? Math.hypot(p[0] - p0[0], p[1] - p0[1]) : Math.abs((p[0] - p0[0])*dy - (p[1] - p0[1])*dx) / L; };
  if (depth > 14 || Math.max(dist(p1), dist(p2)) <= tol){ out.push(p3); return; }
  var m = function (a, b){ return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  var a1 = m(p0, p1), a2 = m(p1, p2), a3 = m(p2, p3), b1 = m(a1, a2), b2 = m(a2, a3), mid = m(b1, b2);
  svgFlatCubic(p0, a1, b1, mid, tol, out, depth + 1);
  svgFlatCubic(mid, b2, a3, p3, tol, out, depth + 1);
}
// a path's d attribute as subpaths of segments, in the element's own coordinates
function svgPathSubpaths(d){
  var i = 0, n = d.length, subs = [], sub = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', last = '', c2 = null, qc = null;
  var NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  var ws = function (){ while (i < n && /[\s,]/.test(d[i])) i++; };
  var num = function (){ ws(); NUM.lastIndex = i; var m = NUM.exec(d); if (!m) throw new Error('a path has a malformed number'); i = NUM.lastIndex; return parseFloat(m[0]); };
  var flag = function (){ ws(); var ch = d[i]; if (ch !== '0' && ch !== '1') throw new Error('a path has a malformed arc flag'); i++; return ch === '1'; };
  var more = function (){ ws(); return i < n && /[-+.\d]/.test(d[i]); };
  var start = function (){ sub = {x0: x, y0: y, segs: [], closed: false}; subs.push(sub); };
  var seg = function (s){ if (!sub) start(); sub.segs.push(s); };
  while (true){
    ws(); if (i >= n) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd) throw new Error('a path doesn\u2019t start with a command');
    var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z'){
      if (sub){ if (Math.hypot(x - sub.x0, y - sub.y0) > 1e-12) seg({k: 'L', x0: x, y0: y, x: sub.x0, y: sub.y0}); sub.closed = true; x = sub.x0; y = sub.y0; }
      sub = null; last = 'Z'; c2 = qc = null; continue;
    }
    if (C === 'M'){ x = ox + num(); y = oy + num(); sx = x; sy = y; start(); cmd = rel ? 'l' : 'L'; last = 'M'; c2 = qc = null; while (more()){ var lx = (rel ? x : 0) + num(), ly = (rel ? y : 0) + num(); seg({k: 'L', x0: x, y0: y, x: lx, y: ly}); x = lx; y = ly; } continue; }
    do {
      ox = rel ? x : 0; oy = rel ? y : 0;
      if (C === 'L'){ var X = ox + num(), Y = oy + num(); seg({k: 'L', x0: x, y0: y, x: X, y: Y}); x = X; y = Y; c2 = qc = null; }
      else if (C === 'H'){ var X2 = ox + num(); seg({k: 'L', x0: x, y0: y, x: X2, y: y}); x = X2; c2 = qc = null; }
      else if (C === 'V'){ var Y2 = oy + num(); seg({k: 'L', x0: x, y0: y, x: x, y: Y2}); y = Y2; c2 = qc = null; }
      else if (C === 'C' || C === 'S'){
        var p1;
        if (C === 'C') p1 = [ox + num(), oy + num()];
        else p1 = c2 && /[CS]/i.test(last) ? [2*x - c2[0], 2*y - c2[1]] : [x, y];
        var p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()];
        seg({k: 'C', x0: x, y0: y, c1: p1, c2: p2, x: p3[0], y: p3[1]}); c2 = p2; qc = null; x = p3[0]; y = p3[1];
      }
      else if (C === 'Q' || C === 'T'){
        var q = C === 'Q' ? [ox + num(), oy + num()] : (qc && /[QT]/i.test(last) ? [2*x - qc[0], 2*y - qc[1]] : [x, y]);
        var e = [ox + num(), oy + num()];
        seg({k: 'C', x0: x, y0: y, c1: [x + 2/3*(q[0] - x), y + 2/3*(q[1] - y)], c2: [e[0] + 2/3*(q[0] - e[0]), e[1] + 2/3*(q[1] - e[1])], x: e[0], y: e[1]});
        qc = q; c2 = null; x = e[0]; y = e[1];
      }
      else if (C === 'A'){
        var rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), ax = ox + num(), ay = oy + num();
        seg({k: 'A', x0: x, y0: y, rx: rx, ry: ry, rot: rot, fa: fa, fs: fs, x: ax, y: ay}); x = ax; y = ay; c2 = qc = null;
      }
      else throw new Error('a path uses an unknown command, ' + cmd);
      last = C;
    } while (more());
  }
  return subs.filter(function (sp){ return sp.segs.length; });
}
// a subpath, through the matrix, as one Design shape: poly (straight segments) or path (with arc bulges)
function svgSubToEnt(sp, M){
  var det = mDet(M), sim = mSimilar(M), sc = Math.sqrt(Math.abs(det)) || 1, tolU = SVG_TOL / sc, pts = [];
  var add = function (x, y){ var p = mApply(M, x, y), L = pts[pts.length - 1];
    if (L && Math.hypot(L[0] - p[0], L[1] - p[1]) < 1e-9) return; pts.push([p[0], p[1], 0]); };
  add(sp.x0, sp.y0);
  sp.segs.forEach(function (g){
    if (g.k === 'L') add(g.x, g.y);
    else if (g.k === 'C'){ var out = []; svgFlatCubic([g.x0, g.y0], g.c1, g.c2, [g.x, g.y], tolU, out, 0); out.forEach(function (p){ add(p[0], p[1]); }); }
    else if (g.k === 'A'){
      if (!g.rx || !g.ry || Math.hypot(g.x - g.x0, g.y - g.y0) < 1e-12){ add(g.x, g.y); return; }
      var a = svgArcCenter(g.x0, g.y0, g.rx, g.ry, g.rot, g.fa, g.fs, g.x, g.y);
      if (sim && Math.abs(a.rx - a.ry) <= 1e-9 * Math.max(a.rx, a.ry)){
        // a circular arc: kept as arcs (bulges), at most a quarter turn each
        var k = Math.max(1, Math.ceil(Math.abs(a.dt) / (Math.PI / 2) - 1e-9)), b = Math.tan(a.dt / k / 4) * (det < 0 ? -1 : 1);
        for (var j = 1; j <= k; j++){
          if (pts.length) pts[pts.length - 1][2] = b;
          var p = j === k ? [g.x, g.y] : svgEllipsePt(a, a.t1 + a.dt * j / k); add(p[0], p[1]);
        }
      } else {                                        // elliptical (or skewed): followed within the tolerance
        var rmax = Math.max(a.rx, a.ry), stepA = 2 * Math.acos(Math.max(-1, 1 - tolU / rmax)), m = Math.max(2, Math.ceil(Math.abs(a.dt) / (stepA || 0.1)));
        for (var j2 = 1; j2 <= m; j2++){ var q = j2 === m ? [g.x, g.y] : svgEllipsePt(a, a.t1 + a.dt * j2 / m); add(q[0], q[1]); }
      }
    }
  });
  var closed = sp.closed;
  if (closed && pts.length > 1){ var f = pts[0], L = pts[pts.length - 1]; if (Math.hypot(f[0] - L[0], f[1] - L[1]) < 1e-9) pts.pop(); }
  if (pts.length < 2) return null;
  if (pts.some(function (p){ return p[2]; })) return {t: 'path', pts: pts, closed: closed};
  return {t: 'poly', pts: pts.map(function (p){ return [p[0], p[1]]; }), closed: closed};
}
function svgExtract(text){
  var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  var root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('it isn\u2019t a readable SVG');
  var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
  var hasVB = vb.length === 4 && vb.every(isFinite) && vb[2] > 0 && vb[3] > 0;
  var wMM = svgLen(root.getAttribute('width')), hMM = svgLen(root.getAttribute('height'));
  var sx, sy, ox = 0, oy = 0, H;
  if (hasVB){
    if (wMM === null && hMM === null){ wMM = vb[2] * SVG_UNIT.px; hMM = vb[3] * SVG_UNIT.px; }
    else if (wMM === null) wMM = hMM * vb[2] / vb[3];
    else if (hMM === null) hMM = wMM * vb[3] / vb[2];
    sx = wMM / vb[2]; sy = hMM / vb[3]; ox = -vb[0] * sx; oy = -vb[1] * sy; H = hMM;
  } else {
    sx = sy = SVG_UNIT.px; H = hMM !== null ? hMM : 0;
  }
  var M0 = [sx, 0, 0, -sy, ox, H - oy];              // user units to mm, with Y turned up
  var ents = [], layers = [], skipped = {};
  var skip = function (what){ skipped[what] = (skipped[what] || 0) + 1; };
  var INK = 'http://www.inkscape.org/namespaces/inkscape';
  var hidden = function (el){ var st = (el.getAttribute('style') || '').replace(/\s/g, '');
    return el.getAttribute('display') === 'none' || /(^|;)display:none/.test(st) || el.getAttribute('visibility') === 'hidden' || /(^|;)visibility:hidden/.test(st); };
  var put = function (e, layer){ if (e){ if (layer !== undefined) e.dxfLayer = layer; ents.push(e); } };
  var walk = function (el, M, layer){
    Array.prototype.forEach.call(el.children, function (c){
      var tag = c.localName, m = mMul(M, svgTransform(c.getAttribute('transform')));
      var isLayer = tag === 'g' && (c.getAttributeNS(INK, 'groupmode') || c.getAttribute('inkscape:groupmode')) === 'layer';
      if (isLayer){
        var nm = c.getAttributeNS(INK, 'label') || c.getAttribute('inkscape:label') || c.getAttribute('id') || ('Layer ' + (layers.length + 1));
        if (!layers.some(function (L){ return L.name === nm; })) layers.push({name: nm, visible: !hidden(c), locked: false});
        walk(c, m, nm); return;
      }
      if (hidden(c)) return;
      var A = function (k){ return svgNum(c.getAttribute(k)); };
      try {
        if (tag === 'g' || tag === 'a' || tag === 'switch') walk(c, m, layer);
        else if (tag === 'path'){ svgPathSubpaths(c.getAttribute('d') || '').forEach(function (sp){ put(svgSubToEnt(sp, m), layer); }); }
        else if (tag === 'line'){ var p = mApply(m, A('x1'), A('y1')), q = mApply(m, A('x2'), A('y2')); put({t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1]}, layer); }
        else if (tag === 'polyline' || tag === 'polygon'){
          var v = (c.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat), pp = [];
          for (var k = 0; k + 1 < v.length; k += 2) pp.push(mApply(m, v[k], v[k + 1]));
          if (pp.length > 1) put({t: 'poly', pts: pp, closed: tag === 'polygon'}, layer);
        }
        else if (tag === 'rect'){
          var x = A('x'), y = A('y'), w = A('width'), h = A('height'), rx = A('rx'), ry = A('ry');
          if (!(w > 0 && h > 0)) return;
          if (rx || ry){
            rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
            var arc = function (x0, y0, x1, y1){ return {k: 'A', x0: x0, y0: y0, rx: rx, ry: ry, rot: 0, fa: false, fs: true, x: x1, y: y1}; };
            put(svgSubToEnt({x0: x + rx, y0: y, closed: true, segs: [
              {k: 'L', x0: x + rx, y0: y, x: x + w - rx, y: y}, arc(x + w - rx, y, x + w, y + ry),
              {k: 'L', x0: x + w, y0: y + ry, x: x + w, y: y + h - ry}, arc(x + w, y + h - ry, x + w - rx, y + h),
              {k: 'L', x0: x + w - rx, y0: y + h, x: x + rx, y: y + h}, arc(x + rx, y + h, x, y + h - ry),
              {k: 'L', x0: x, y0: y + h - ry, x: x, y: y + ry}, arc(x, y + ry, x + rx, y)]}, m), layer);
          } else if (Math.abs(m[1]) < 1e-12 && Math.abs(m[2]) < 1e-12){
            var a0 = mApply(m, x, y), a1 = mApply(m, x + w, y + h);
            put({t: 'rect', x: Math.min(a0[0], a1[0]), y: Math.min(a0[1], a1[1]), w: Math.abs(a1[0] - a0[0]), h: Math.abs(a1[1] - a0[1])}, layer);
          } else put({t: 'poly', pts: [mApply(m, x, y), mApply(m, x + w, y), mApply(m, x + w, y + h), mApply(m, x, y + h)], closed: true}, layer);
        }
        else if (tag === 'circle' || tag === 'ellipse'){
          var cx = A('cx'), cy = A('cy'), erx = tag === 'circle' ? A('r') : A('rx'), ery = tag === 'circle' ? A('r') : A('ry');
          if (!(erx > 0 && ery > 0)) return;
          if (Math.abs(erx - ery) < 1e-12 && mSimilar(m)){ var cc = mApply(m, cx, cy); put({t: 'circle', cx: cc[0], cy: cc[1], r: erx * Math.sqrt(Math.abs(mDet(m)))}, layer); }
          else put(svgSubToEnt({x0: cx + erx, y0: cy, closed: true, segs: [
            {k: 'A', x0: cx + erx, y0: cy, rx: erx, ry: ery, rot: 0, fa: false, fs: true, x: cx - erx, y: cy},
            {k: 'A', x0: cx - erx, y0: cy, rx: erx, ry: ery, rot: 0, fa: false, fs: true, x: cx + erx, y: cy}]}, m), layer);
        }
        else if (tag === 'text' || tag === 'image' || tag === 'use') skip(tag === 'text' ? 'text' : tag === 'image' ? 'image' : 'use (copy)');
      } catch (err){ skip('unreadable ' + tag); }
    });
  };
  walk(root, mMul(M0, svgTransform(root.getAttribute('transform'))), undefined);
  // 454 Design's own SVGs say where their page sat in the drawing: brought back exactly where they were
  var o454 = (root.getAttribute('data-454-origin') || '').trim().split(/\s+/).map(parseFloat);
  if (o454.length === 2 && o454.every(isFinite) && (o454[0] || o454[1])) ents.forEach(function (e){ moveEntity(e, o454[0], o454[1]); });
  return {ents: ents, layers: layers, skipped: skipped, svg: true};
}

