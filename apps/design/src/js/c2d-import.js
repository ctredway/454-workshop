// ---- Carbide Create projects (.c2d) ----
// A .c2d file (Carbide Create 7, build 8xx) is an SQLite database. Its `params` table holds the job (material
// size and thickness, in mm, and whether inches are shown); its `items` table holds one row per layer, shape
// ("element"), toolpath and toolpath group, each a JSON text compressed with zlib. Found by reading Circle.c2d
// and Rectangle.c2d, saved by build 870. (It also carries Carbide Create's own G-code, encrypted: not read.)
//
// Nothing here needs a library: the page reads the database itself (sqliteTables) and unpacks the text itself
// (zInflate), read-only, so it works offline and in any browser.

// zlib data (RFC 1950, 1951) -> the bytes it was made from
function zInflate(src){
  if (!src || src.length < 6 || (src[0] & 15) !== 8 || ((src[0] << 8) | src[1]) % 31) throw new Error('It isn’t packed the way 454 expects.');
  var pos = 2, bit = 0, nbit = 0, out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0, i;
  function need(k){ if (n + k > out.length){ var o2 = new Uint8Array(Math.max(out.length * 2, n + k)); o2.set(out.subarray(0, n)); out = o2; } }
  function bits(k){
    while (nbit < k){ if (pos >= src.length) throw new Error('The packed data ends early.'); bit |= src[pos++] << nbit; nbit += 8; }
    var v = bit & ((1 << k) - 1); bit >>>= k; nbit -= k; return v;
  }
  function build(lens){                                  // code lengths -> a table to decode with
    var count = new Uint16Array(16), symbol = new Uint16Array(lens.length), offs = new Uint16Array(16), k;
    for (k = 0; k < lens.length; k++) count[lens[k]]++;
    count[0] = 0;
    for (k = 1; k < 16; k++) offs[k] = offs[k - 1] + count[k - 1];
    for (k = 0; k < lens.length; k++) if (lens[k]) symbol[offs[lens[k]]++] = k;
    return {count: count, symbol: symbol};
  }
  function decode(h){
    var code = 0, first = 0, index = 0;
    for (var len = 1; len < 16; len++){
      code |= bits(1);
      var c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('The packed data is damaged.');
  }
  var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],
      LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],
      DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],
      DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],
      ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  var fixedL = null, fixedD = null, last;
  do {
    last = bits(1);
    var type = bits(2), hl, hd, sym;
    if (type === 0){                                     // stored as it is
      bit = 0; nbit = 0;
      var slen = src[pos] | (src[pos + 1] << 8); pos += 4;
      if (pos + slen > src.length) throw new Error('The packed data ends early.');
      need(slen); out.set(src.subarray(pos, pos + slen), n); n += slen; pos += slen;
      continue;
    }
    if (type === 1){
      if (!fixedL){
        var fl = [], fd = [];
        for (i = 0; i < 288; i++) fl.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
        for (i = 0; i < 30; i++) fd.push(5);
        fixedL = build(fl); fixedD = build(fd);
      }
      hl = fixedL; hd = fixedD;
    } else if (type === 2){
      var nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, cl = [];
      for (i = 0; i < 19; i++) cl.push(0);
      for (i = 0; i < nc; i++) cl[ORDER[i]] = bits(3);
      var hc = build(cl), lens = [];
      while (lens.length < nl + nd){
        sym = decode(hc);
        if (sym < 16){ lens.push(sym); continue; }
        var rep, val = 0;
        if (sym === 16){ if (!lens.length) throw new Error('The packed data is damaged.'); val = lens[lens.length - 1]; rep = 3 + bits(2); }
        else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        while (rep--) lens.push(val);
      }
      hl = build(lens.slice(0, nl)); hd = build(lens.slice(nl, nl + nd));
    } else throw new Error('The packed data is damaged.');
    for (;;){
      sym = decode(hl);
      if (sym < 256){ need(1); out[n++] = sym; continue; }
      if (sym === 256) break;
      sym -= 257;
      if (sym >= 29) throw new Error('The packed data is damaged.');
      var len = LBASE[sym] + bits(LEXT[sym]), ds = decode(hd);
      if (ds >= 30) throw new Error('The packed data is damaged.');
      var dist = DBASE[ds] + bits(DEXT[ds]);
      if (dist > n) throw new Error('The packed data is damaged.');
      need(len);
      for (var k2 = 0; k2 < len; k2++, n++) out[n] = out[n - dist];
    }
  } while (!last);
  return out.subarray(0, n);
}

// An SQLite database file -> {table name: [row, ...]}, each row an object by column name. Read-only, and only
// what a small project file needs: ordinary tables, with values that spill onto overflow pages.
function sqliteIs(buf){
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), sig = 'SQLite format 3';
  if (u8.length < 100) return false;
  for (var i = 0; i < sig.length; i++) if (u8[i] !== sig.charCodeAt(i)) return false;
  return u8[15] === 0;
}
function sqliteTables(buf){
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!sqliteIs(u8)) throw new Error('It isn’t a database 454 can read.');
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var ps = dv.getUint16(16); if (ps === 1) ps = 65536;
  var U = ps - u8[20], utf8 = new TextDecoder('utf-8'), short = 'The file is cut short or damaged.';
  function varint(a, p){                                 // [value, bytes used]
    var v = 0;
    for (var i = 0; i < 8; i++){ var b = a[p + i]; if (b === undefined) throw new Error(short); v = v * 128 + (b & 127); if (!(b & 128)) return [v, i + 1]; }
    return [v * 256 + a[p + 8], 9];
  }
  function pageAt(n){ var at = (n - 1) * ps; if (n < 1 || at + ps > u8.length) throw new Error(short); return at; }
  function payload(p, P){                                // a cell's value: here, and on overflow pages if it's long
    var X = U - 35;
    if (P <= X) return u8.subarray(p, p + P);
    var M = Math.floor((U - 12) * 32 / 255) - 23, K = M + (P - M) % (U - 4), local = K <= X ? K : M;
    var out = new Uint8Array(P); out.set(u8.subarray(p, p + local));
    var got = local, next = dv.getUint32(p + local), guard = 0;
    while (next && got < P){
      if (++guard > 1e6) throw new Error(short);
      var q = pageAt(next), take = Math.min(U - 4, P - got);
      out.set(u8.subarray(q + 4, q + 4 + take), got); got += take; next = dv.getUint32(q);
    }
    if (got < P) throw new Error(short);
    return out;
  }
  function record(pl){                                   // a row's values, in column order
    var h = varint(pl, 0), end = h[0], p = h[1], types = [], vals = [], at = end;
    while (p < end){ var t = varint(pl, p); types.push(t[0]); p += t[1]; }
    types.forEach(function (t) {
      var size = t === 0 || t === 8 || t === 9 ? 0 : t <= 4 ? t : t === 5 ? 6 : t === 6 || t === 7 ? 8 : Math.floor((t - 12) / 2);
      if (at + size > pl.length) throw new Error(short);
      if (t === 0) vals.push(null);
      else if (t === 8) vals.push(0);
      else if (t === 9) vals.push(1);
      else if (t === 7) vals.push(new DataView(pl.buffer, pl.byteOffset + at, 8).getFloat64(0));
      else if (t <= 6){ var v = 0; for (var i = 0; i < size; i++) v = v * 256 + pl[at + i]; if (pl[at] & 128) v -= Math.pow(2, 8 * size); vals.push(v); }
      else if (t % 2) vals.push(utf8.decode(pl.subarray(at, at + size)));
      else vals.push(pl.slice(at, at + size));
      at += size;
    });
    return vals;
  }
  function rows(root, out, depth){                       // every row of the table whose top page is root
    if (depth > 40) throw new Error(short);
    var base = pageAt(root), h = base + (root === 1 ? 100 : 0), kind = u8[h], nCells = dv.getUint16(h + 3);
    if (kind !== 13 && kind !== 5) throw new Error(short);
    var ptrs = h + (kind === 5 ? 12 : 8);
    for (var i = 0; i < nCells; i++){
      var c = base + dv.getUint16(ptrs + 2 * i);
      if (kind === 5){ rows(dv.getUint32(c), out, depth + 1); continue; }
      var P = varint(u8, c), id = varint(u8, c + P[1]);
      out.push({id: id[0], vals: record(payload(c + P[1] + id[1], P[0]))});
    }
    if (kind === 5) rows(dv.getUint32(h + 8), out, depth + 1);
    return out;
  }
  function columns(sql){                                 // the column names, from the table's CREATE TABLE text
    var s = String(sql || '').replace(/--[^\n]*/g, ' '), a = s.indexOf('('), b = s.lastIndexOf(')');
    if (a < 0 || b < a) return [];
    var parts = [], depth = 0, cur = '';
    s.slice(a + 1, b).split('').forEach(function (ch) {
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && !depth){ parts.push(cur); cur = ''; } else cur += ch;
    });
    parts.push(cur);
    return parts.map(function (p) { return p.trim(); })
      .filter(function (p) { return p && !/^(primary|unique|check|foreign|constraint)\b/i.test(p); })
      .map(function (p) { return {name: p.split(/\s+/)[0].replace(/^["'`\[]|["'`\]]$/g, ''), rowid: /\binteger\s+primary\s+key\b/i.test(p)}; });
  }
  var tables = {};
  rows(1, [], 0).forEach(function (m) {                   // the list of tables: type, name, table, top page, CREATE text
    if (m.vals[0] !== 'table' || !(m.vals[3] > 0)) return;
    var cols = columns(m.vals[4]);
    tables[m.vals[1]] = rows(m.vals[3], [], 0).map(function (r) {
      var o = {};
      cols.forEach(function (c, k) { o[c.name] = c.rowid && r.vals[k] === null ? r.id : r.vals[k]; });
      return o;
    });
  });
  return tables;
}

// An older .c2d (before the database): the project as one JSON text, with the 3D model's bytes after it
function c2dTextIs(buf){
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), head = '';
  for (var i = 0; i < Math.min(u8.length, 600); i++) head += String.fromCharCode(u8[i]);
  return /^\s*\{/.test(head) && (head.indexOf('"CURVE_OBJECTS"') >= 0 || head.indexOf('"DOCUMENT_VALUES"') >= 0);
}
function c2dIs(buf){ return sqliteIs(buf) || c2dTextIs(buf); }
// What's in a .c2d: the job's settings, and its layers, shapes, toolpaths and toolpath groups as Carbide Create
// wrote them. skipped counts what couldn't be read, by kind. Both kinds of file give the same thing.
function c2dExtract(buf){
  return sqliteIs(buf) ? c2dExtractDb(buf) : c2dExtractText(buf);
}
function c2dExtractDb(buf){
  var t = sqliteTables(buf);
  if (!t.items || !t.params) throw new Error('It’s a database, but not a Carbide Create project.');
  var params = {};
  t.params.forEach(function (r) { params[r.key] = r.value; });
  var utf8 = new TextDecoder('utf-8');
  var ex = {params: params, build: +params.build_num || 0, layers: [], elements: [], toolpaths: [], groups: [], skipped: {}};
  var kinds = {layer: ex.layers, element: ex.elements, toolpath: ex.toolpaths, toolpath_group: ex.groups};
  t.items.forEach(function (r) {
    if (r.type === 'model') return;                      // the 3D model (Carbide Create Pro): not a JSON text, not read
    // packed unless packing didn't make it smaller (then its size is the size recorded, sz); if that reading
    // fails, the other is tried, since a packed text can happen to be exactly as long as the original
    var j = null, d = r.data, raw = typeof d === 'string' || !d || d.length === r.sz;
    [raw, !raw].some(function (asIs) {
      try { j = JSON.parse(typeof d === 'string' ? d : !d || !d.length ? '' : utf8.decode(asIs ? d : zInflate(d))); } catch (e) { j = null; }
      return j !== null;
    });
    if (j && kinds[r.type]) kinds[r.type].push(j);
    else ex.skipped[r.type] = (ex.skipped[r.type] || 0) + 1;
  });
  return ex;
}
// The older file: shapes in CURVE_OBJECTS and TEXT_OBJECTS, the job in DOCUMENT_VALUES, toolpaths inside their
// groups. Found by reading three projects saved before the database (two of them from 2020).
function c2dExtractText(buf){
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), mark = 'MODELV1', end = u8.length;
  for (var i = u8.length - mark.length; i >= 0; i--){                 // the text stops where the model starts
    var hit = true;
    for (var k = 0; k < mark.length; k++) if (u8[i + k] !== mark.charCodeAt(k)){ hit = false; break; }
    if (hit){ end = i; break; }
  }
  var text = new TextDecoder('utf-8').decode(u8.subarray(0, end)), j;
  try { j = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)); } catch (e) { throw new Error('Its text is cut short or damaged.'); }
  var dv = j && j.DOCUMENT_VALUES;
  if (!dv || typeof dv !== 'object') throw new Error('It’s text, but not a Carbide Create project.');
  var params = {width: dv.WIDTH, height: dv.HEIGHT, thickness: dv.THICKNESS, display_mm: dv.DISPLAYMM ? '1' : '0',
                zero_x: dv.ZERO_X, zero_y: dv.ZERO_Y, zero_z: dv.ZERO_Z, build_num: dv.build_num, retract: dv.RETRACT};
  var ex = {params: params, build: +dv.build_num || 0, layers: Array.isArray(j.layers) ? j.layers : [], elements: [], toolpaths: [], groups: [], skipped: {}};
  ['CURVE_OBJECTS', 'TEXT_OBJECTS'].forEach(function (key) { if (Array.isArray(j[key])) ex.elements = ex.elements.concat(j[key]); });
  (Array.isArray(j.TOOLPATH_GROUP_OBJECTS) ? j.TOOLPATH_GROUP_OBJECTS : []).forEach(function (g) {
    ex.groups.push({name: g.name, enabled: g.enabled !== false, uuid: g.uuid});
    (g.TOOLPATH_OBJECTS || []).forEach(function (tp) { if (!tp.toolpath_group) tp.toolpath_group = g.uuid; ex.toolpaths.push(tp); });
  });
  Object.keys(j).forEach(function (key) {                // any other list of things: said, not dropped quietly
    if (/_OBJECTS$/.test(key) && ['CURVE_OBJECTS', 'TEXT_OBJECTS', 'TOOLPATH_GROUP_OBJECTS'].indexOf(key) < 0 && Array.isArray(j[key]) && j[key].length)
      ex.skipped[key] = j[key].length;
  });
  return ex;
}
// One Carbide Create shape -> one 454 shape (a group, if it has several outlines), or null if there's nothing
// to draw. Its points are measured from its position; a curve to a point is a cubic Bezier with that point's two
// control points. point_type: 0 start, 1 line, 3 curve, 4 close. Text carries its letters' finished outlines
// (rendered), to be put through its transform. What the shape IS is judged from its outline, not its label:
// the older files don't label circles and rectangles.
function c2dElementEnt(el, unknown){
  var px = el.position ? +el.position[0] || 0 : 0, py = el.position ? +el.position[1] || 0 : 0, subs = [];
  if (Array.isArray(el.rendered)){
    var M = Array.isArray(el.transform) && el.transform.length === 9 ? el.transform : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    el.rendered.forEach(function (o) {
      if (!Array.isArray(o)) return;
      subs.push({closed: true, curves: 0, anchors: [], pts: o.map(function (p) { return [px + M[0] * p[0] + M[3] * p[1] + M[6], py + M[1] * p[0] + M[4] * p[1] + M[7]]; })});
    });
  } else {
    var P = el.points || [], T = el.point_type || [], C1 = el.cp1 || [], C2 = el.cp2 || [], cur = null, last = null;
    P.forEach(function (p0, i) {
      var ty = T[i], p = [px + p0[0], py + p0[1]];
      if (ty === 4){ if (cur) cur.closed = true; cur = null; return; }
      if (ty === 0 || !cur){ cur = {pts: [p], closed: false, curves: 0, anchors: [p]}; subs.push(cur); last = p; if (ty !== 0) unknown[ty] = 1; return; }
      if (ty === 3 && C1[i] && C2[i]){
        var flat = [];
        svgFlatCubic(last, [px + C1[i][0], py + C1[i][1]], [px + C2[i][0], py + C2[i][1]], p, 0.02, flat, 0);
        flat.forEach(function (q) { cur.pts.push(q); });
        cur.curves++;
      } else { if (ty !== 1) unknown[ty] = 1; cur.pts.push(p); }
      cur.anchors.push(p); last = p;
    });
  }
  var shapes = subs.map(c2dOutlineEnt).filter(Boolean);
  return !shapes.length ? null : shapes.length === 1 ? shapes[0] : {t: 'group', ents: shapes};
}
// One outline as a shape: a circle or a plain rectangle where that's what it is, else its points
function c2dOutlineEnt(s){
  var pts = s.pts.filter(function (p, i) { return !i || Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]) > 1e-9; });
  if (s.closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
  if (!s.closed) return pts.length === 2 ? {t: 'line', x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1]} : pts.length > 2 ? {t: 'poly', pts: pts, closed: false} : null;
  if (pts.length < 3) return null;
  if (s.curves === 4 && s.anchors.length === 5){         // four curves round one centre, all the same distance out
    var an = s.anchors.slice(0, 4), cx = (an[0][0] + an[1][0] + an[2][0] + an[3][0]) / 4, cy = (an[0][1] + an[1][1] + an[2][1] + an[3][1]) / 4;
    var r = Math.hypot(an[0][0] - cx, an[0][1] - cy), tol = Math.max(0.02, r * 5e-4);
    if (r > 1e-6 && an.every(function (p) { return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) < 1e-6 * r + 1e-9; }) &&
        pts.every(function (p) { return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) < tol; }))
      return {t: 'circle', cx: cx, cy: cy, r: r};
  }
  if (!s.curves && pts.length === 4 && pts.every(function (p, i) { var q = pts[(i + 1) % 4]; return Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9; })){
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), w = Math.max.apply(null, xs) - x0, h = Math.max.apply(null, ys) - y0;
    if (w > 1e-9 && h > 1e-9) return {t: 'rect', x: x0, y: y0, w: w, h: h};
  }
  return {t: 'poly', pts: pts, closed: true};
}
// The project as a 454 drawing: {doc, inches, shapes, toolpaths, notes}. Each shape keeps Carbide Create's ID
// (ccId), so its toolpaths can find it.
function c2dToDoc(ex, name){
  var p = ex.params, num = function (k) { var v = parseFloat(p[k]); return isFinite(v) ? v : 0; };
  var stock = {w: Math.max(10, num('width')), h: Math.max(10, num('height')), origin: 'corner'};
  if (num('thickness') > 0){ stock.t = num('thickness'); stock.zero = 'top'; }
  var layers = [], byName = {};
  function layerFor(L){
    var nm = L && L.name ? String(L.name) : 'Layer 1';
    if (!byName[nm]){ byName[nm] = {id: 'L' + (layers.length + 1), name: nm, visible: !L || L.visible !== false, locked: !!(L && L.locked)}; layers.push(byName[nm]); }
    return byName[nm].id;
  }
  ex.layers.forEach(layerFor);
  var ents = [], unknown = {}, empty = 0, dots = 0;
  ex.elements.forEach(function (el) {
    var e = c2dElementEnt(el, unknown), lid = layerFor(el.layer);
    if (!e){                                             // a stray point (every point in one place) isn't a shape
      var T0 = el.point_type || [], P0 = (el.points || []).filter(function (_, i) { return T0[i] !== 4; });
      if (P0.length && P0.every(function (q) { return Math.hypot(q[0] - P0[0][0], q[1] - P0[0][1]) < 1e-9; })) dots++; else empty++;
      return;
    }
    e.layer = lid; if (el.id) e.ccId = el.id;
    ents.push(e);
  });
  if (!layers.length) layerFor(null);
  var notes = [];
  // XY zero: Carbide Create keeps it as a distance from the lower-left corner, where its shapes are measured
  // from. 454 has zero at a corner or the centre, and measures shapes from zero.
  var zx = num('zero_x'), zy = num('zero_y'), spots = {fl: [0, 0], fr: [stock.w, 0], bl: [0, stock.h], br: [stock.w, stock.h], center: [stock.w / 2, stock.h / 2]}, at = null;
  Object.keys(spots).forEach(function (k) { if (!at && Math.abs(zx - spots[k][0]) < 0.01 && Math.abs(zy - spots[k][1]) < 0.01) at = k; });
  if (at && at !== 'fl'){ stock.origin = at; ents.forEach(function (e) { moveEntity(e, -zx, -zy); }); }
  if (!at) notes.push('XY zero in this project is ' + zx.toFixed(2) + ', ' + zy.toFixed(2) + ' mm from the lower-left corner. 454 puts zero at a corner or the centre, so it’s at the lower-left corner here: check Job setup.');
  if (num('zero_z')) notes.push('Z zero isn’t on the top of the material in this project, and 454 doesn’t read where it is yet. It’s set to the top here: check Job setup before cutting.');
  if (Object.keys(unknown).length) notes.push('Some shapes use a kind of point 454 doesn’t know yet (' + Object.keys(unknown).join(', ') + '): check them against Carbide Create.');
  if (dots) notes.push(dots + (dots === 1 ? ' stray point (a shape with no size) was' : ' stray points (shapes with no size) were') + ' left out.');
  if (empty) notes.push(empty + (empty === 1 ? ' shape had' : ' shapes had') + ' nothing 454 could draw.');
  Object.keys(ex.skipped).forEach(function (k) { notes.push(ex.skipped[k] + ' ' + k + (ex.skipped[k] === 1 ? ' item' : ' items') + ' couldn’t be read.'); });
  var doc = {stock: stock, ents: ents, guides: [], dims: [], layers: layers, activeLayer: layers[0].id, name: String(name || 'Carbide Create project').replace(/\.c2d$/i, '')};
  return {doc: doc, inches: p.display_mm === '0', shapes: ents.length, toolpaths: ex.toolpaths.length, zeroAt: at, notes: notes};
}
// Open a .c2d as the drawing: the one before is put aside for Recover, and Save asks where to save, since this
// isn't a 454 Design file.
function c2dOpen(buf, name){
  var ex = c2dExtract(buf), r = c2dToDoc(ex, name);
  if (!r.shapes) throw new Error('There are no shapes in it that 454 can draw.');
  var aside = asideTake();
  pushUndo();
  DOC = r.doc;
  UICFG.stockUnits = r.inches ? 'in' : 'mm'; uiCfgSave();
  SEL = []; CUTSEL = null; setTool('select');
  // its toolpaths, as 454 toolpaths (c2d-toolpaths.js): needs the CAM engine to build them
  var tps = r.toolpaths && camReady() ? c2dToolpaths(ex) : {made: [], left: [], notes: []};
  DOC.toolpaths = tps.made;
  r.made = tps.made.length; r.left = tps.left; r.tpNotes = tps.notes;
  syncStockUI(); persist(); forgetFile();
  lsSet(NAME_KEY, DOC.name + '.454.json');             // the name Save offers
  renderLayers(); renderToolpathPanel(); fit();
  asideKeep(aside);
  r.built = c2dBuild(tps.made);                        // after this returns: the drawing is on screen first
  var st = DOC.stock, u = unitTag();
  var said = r.shapes + (r.shapes === 1 ? ' shape' : ' shapes') + ' on ' + fmtDisp(st.w) + ' × ' + fmtDisp(st.h) + ' ' + u + ' material' +
        (st.t > 0 ? ', ' + fmtDisp(st.t) + ' ' + u + ' thick' : '') + '.' +
        (r.zeroAt && r.zeroAt !== 'fl' ? ' XY zero is at the ' + ORIGIN_NAMES[r.zeroAt] + ', as in the project.' : '');
  if (r.toolpaths && !camReady()) said += ' Its ' + (r.toolpaths === 1 ? 'toolpath wasn’t' : r.toolpaths + ' toolpaths weren’t') + ' brought in: the CAM engine isn’t loaded.';
  else if (r.made) said += ' ' + r.made + (r.made === 1 ? ' toolpath' : ' toolpaths') + ' brought in' + (r.made < r.toolpaths ? ', of ' + r.toolpaths : '') + '.';
  var lines = r.left.map(function (l) { return '• Not brought in: ' + l.name + '. ' + l.why.charAt(0).toUpperCase() + l.why.slice(1) + '. Make it again in the Toolpaths panel.'; })
    .concat(r.tpNotes.map(function (n) { return '• ' + n; })).concat(r.notes.map(function (n) { return '• ' + n; }));
  if (r.made) lines.push('• The toolpaths are 454’s own, made from Carbide Create’s settings: bits come as sizes, not tools from your library. Check each one, and air-cut before cutting material.',
                         '• They’re being calculated now, one at a time. A carving over hundreds of shapes can take half a minute, and 454 won’t respond while it works one out.');
  // a short notice when there's nothing to check; a window to read when there is
  if (!lines.length) toast('ok', 'Opened ' + name, said);
  else uiDialog({title: 'Opened ' + name, body: said + '\n\n' + lines.join('\n'), ok: 'OK', note: true});
  return r;
}
