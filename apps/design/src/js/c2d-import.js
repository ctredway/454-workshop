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

function c2dIs(buf){ return sqliteIs(buf); }
// What's in a .c2d: the job's settings, and its layers, shapes, toolpaths and toolpath groups as Carbide Create
// wrote them. skipped counts what couldn't be read, by kind.
function c2dExtract(buf){
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
// One Carbide Create shape -> 454 shapes (usually one). Its points are measured from its position; a curve to a
// point is a cubic Bezier with that point's two control points. point_type: 0 start, 1 line, 3 curve, 4 close.
function c2dElementEnts(el, unknown){
  var px = el.position ? +el.position[0] || 0 : 0, py = el.position ? +el.position[1] || 0 : 0;
  var P = el.points || [], T = el.point_type || [], C1 = el.cp1 || [], C2 = el.cp2 || [];
  var real = P.filter(function (_, i) { return T[i] !== 4; });
  if (el.geometryType === 'circle' && el.radius > 0 && real.length &&
      real.every(function (p) { return Math.abs(Math.hypot(p[0], p[1]) - el.radius) < 1e-6 * el.radius + 1e-9; }))
    return [{t: 'circle', cx: px, cy: py, r: +el.radius}];
  if (el.geometryType === 'rectangle' && !el.corner_type && el.width > 0 && el.height > 0 && real.length >= 4 &&
      real.every(function (p, i) { return T[i] !== 3 && Math.abs(Math.abs(p[0]) - el.width / 2) < 1e-6 && Math.abs(Math.abs(p[1]) - el.height / 2) < 1e-6; }))
    return [{t: 'rect', x: px - el.width / 2, y: py - el.height / 2, w: +el.width, h: +el.height}];
  var subs = [], cur = null, last = null;
  P.forEach(function (p0, i) {
    var ty = T[i], p = [px + p0[0], py + p0[1]];
    if (ty === 4){ if (cur) cur.closed = true; cur = null; return; }
    if (ty === 0 || !cur){ cur = {pts: [p], closed: false}; subs.push(cur); last = p; if (ty !== 0) unknown[ty] = 1; return; }
    if (ty === 3 && C1[i] && C2[i]){
      var flat = [];
      svgFlatCubic(last, [px + C1[i][0], py + C1[i][1]], [px + C2[i][0], py + C2[i][1]], p, 0.02, flat, 0);
      flat.forEach(function (q) { cur.pts.push(q); });
    } else { if (ty !== 1) unknown[ty] = 1; cur.pts.push(p); }
    last = p;
  });
  var out = [];
  subs.forEach(function (s) {
    var pts = s.pts.filter(function (p, i) { return !i || Math.hypot(p[0] - s.pts[i - 1][0], p[1] - s.pts[i - 1][1]) > 1e-9; });
    if (s.closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
    if (s.closed && pts.length >= 3) out.push({t: 'poly', pts: pts, closed: true});
    else if (pts.length === 2) out.push({t: 'line', x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1]});
    else if (pts.length > 2) out.push({t: 'poly', pts: pts, closed: false});
  });
  return out;
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
  var ents = [], unknown = {}, empty = 0;
  ex.elements.forEach(function (el) {
    var made = c2dElementEnts(el, unknown), lid = layerFor(el.layer);
    if (!made.length) empty++;
    made.forEach(function (e) { e.layer = lid; if (el.id) e.ccId = el.id; ents.push(e); });
  });
  if (!layers.length) layerFor(null);
  var notes = [];
  if (Object.keys(unknown).length) notes.push('Some shapes use a kind of point 454 doesn’t know yet (' + Object.keys(unknown).join(', ') + '): check them against Carbide Create.');
  if (empty) notes.push(empty + (empty === 1 ? ' shape had' : ' shapes had') + ' nothing 454 could draw.');
  if (num('zero_x') || num('zero_y') || num('zero_z')) notes.push('Zero isn’t at the lower-left corner and the top in this project, and 454 doesn’t read where it is yet: set it in Job setup.');
  Object.keys(ex.skipped).forEach(function (k) { notes.push(ex.skipped[k] + ' ' + k + (ex.skipped[k] === 1 ? ' item' : ' items') + ' couldn’t be read.'); });
  var doc = {stock: stock, ents: ents, guides: [], dims: [], layers: layers, activeLayer: layers[0].id, name: String(name || 'Carbide Create project').replace(/\.c2d$/i, '')};
  return {doc: doc, inches: p.display_mm === '0', shapes: ents.length, toolpaths: ex.toolpaths.length, notes: notes};
}
// Open a .c2d as the drawing: the one before is put aside for Recover, and Save asks where to save, since this
// isn't a 454 Design file.
function c2dOpen(buf, name){
  var r = c2dToDoc(c2dExtract(buf), name);
  if (!r.shapes) throw new Error('There are no shapes in it that 454 can draw.');
  var aside = asideTake();
  pushUndo();
  DOC = r.doc;
  UICFG.stockUnits = r.inches ? 'in' : 'mm'; uiCfgSave();
  SEL = []; CUTSEL = null; setTool('select');
  syncStockUI(); persist(); forgetFile();
  lsSet(NAME_KEY, DOC.name + '.454.json');             // the name Save offers
  renderLayers(); renderToolpathPanel(); fit();
  asideKeep(aside);
  var st = DOC.stock, u = unitTag();
  toast(r.notes.length ? 'warn' : 'ok', 'Opened ' + name,
        r.shapes + (r.shapes === 1 ? ' shape' : ' shapes') + ' on ' + fmtDisp(st.w) + ' × ' + fmtDisp(st.h) + ' ' + u + ' material' +
        (st.t > 0 ? ', ' + fmtDisp(st.t) + ' ' + u + ' thick' : '') + '. ' +
        (r.toolpaths ? (r.toolpaths === 1 ? 'Its toolpath isn’t' : 'Its ' + r.toolpaths + ' toolpaths aren’t') + ' brought in yet: make ' + (r.toolpaths === 1 ? 'it' : 'them') + ' again in the Toolpaths panel. ' : '') +
        r.notes.join(' '));
  return r;
}
