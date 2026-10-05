/* ---------------- VCarve .crv import ----------------
   .crv = OLE compound document; vectors live uncompressed in the
   VectorData/2dDataV2 stream as span lists: records of
   [bulgeFlag][type=2][0 0 0][4 bytes][x f64][y f64][32 cached bytes][i32]
   + trailing bulge f64 when bulgeFlag=1 (69B arc / 61B straight records).
   Reverse engineered from VCarve Pro 12.510 minimal pairs. */
function oleParse(buf){
  var u8 = new Uint8Array(buf);
  var dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0xE011CFD0) return null; // D0 CF 11 E0
  var secSize = 1 << dv.getUint16(30, true);
  var dirStart = dv.getUint32(48, true);
  var miniCutoff = dv.getUint32(56, true);
  var miniFatStart = dv.getUint32(60, true);
  var difatStart = dv.getUint32(68, true);
  var END = 0xFFFFFFFE;
  function secOff(n){ return secSize * (n + 1); }
  // FAT via DIFAT (header 109 entries + chained DIFAT sectors)
  var fatSecs = [];
  for (var i = 0; i < 109; i++){
    var e = dv.getUint32(76 + i*4, true);
    if (e < 0xFFFFFFFA) fatSecs.push(e);
  }
  var ds = difatStart;
  while (ds < 0xFFFFFFFA){
    var base = secOff(ds);
    for (var j = 0; j < secSize/4 - 1; j++){
      var e2 = dv.getUint32(base + j*4, true);
      if (e2 < 0xFFFFFFFA) fatSecs.push(e2);
    }
    ds = dv.getUint32(base + secSize - 4, true);
  }
  var fat = [];
  fatSecs.forEach(function(fs){
    var b = secOff(fs);
    for (var k = 0; k < secSize/4; k++) fat.push(dv.getUint32(b + k*4, true));
  });
  function chain(start){
    var out = [], sct = start, guard = 0;
    while (sct < 0xFFFFFFFA && guard++ < 1e6){ out.push(sct); sct = fat[sct]; }
    return out;
  }
  function readChain(start, size){
    var secs = chain(start);
    var out = new Uint8Array(secs.length * secSize);
    secs.forEach(function(sc, idx){ out.set(u8.subarray(secOff(sc), secOff(sc) + secSize), idx*secSize); });
    return out.subarray(0, size);
  }
  // directory
  var dirBytes = readChain(dirStart, chain(dirStart).length * secSize);
  var entries = [];
  for (var off = 0; off + 128 <= dirBytes.length; off += 128){
    var nlen = dirBytes[off+64] | (dirBytes[off+65] << 8);
    if (!nlen) continue;
    var name = '';
    for (var c = 0; c < nlen - 2; c += 2) name += String.fromCharCode(dirBytes[off+c] | (dirBytes[off+c+1] << 8));
    var edv = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    entries.push({name: name, type: dirBytes[off+66], start: edv.getUint32(116, true), size: edv.getUint32(120, true)});
  }
  var root = entries.filter(function(e){ return e.type === 5; })[0];
  var miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
  var miniFat = [];
  chain(miniFatStart).forEach(function(sc){
    var b = secOff(sc);
    for (var k2 = 0; k2 < secSize/4; k2++) miniFat.push(dv.getUint32(b + k2*4, true));
  });
  function readMini(start, size){
    var out = new Uint8Array(size);
    var sct = start, pos = 0, guard = 0;
    while (sct < 0xFFFFFFFA && pos < size && guard++ < 1e6){
      var take = Math.min(64, size - pos);
      out.set(miniStream.subarray(sct*64, sct*64 + take), pos);
      pos += take; sct = miniFat[sct];
    }
    return out;
  }
  function stream(name){
    var e = entries.filter(function(en){ return en.type === 2 && en.name === name; })[0];
    if (!e) return null;
    return e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, e.size);
  }
  return {stream: stream};
}
/* ---- VCarve toolpaths (read-only) ----
   The 'ToolpathData' stream stores each toolpath's settings as NAMED values
   (_ppdCutDepth, _dpdPeckDrill ...): a UTF-16 name after FF FE FF <len>, then a
   type tag (0 number, 1 whole number, 2 on/off, 3 text) and the value. Each
   toolpath is preceded by its tool: spindle speed, tool number, then the name.
   Just before the spindle speed are the tool's own numbers, as the project used them: its units (one byte:
   0 inches, 1 mm), diameter, pass depth, stepover, feed and plunge, and the feeds' units (as the tool
   library has them: 1 mm/min, 4 inches/min). Seen in ten tools of six projects; the tutorial project's feeds
   are the ones in the G-code VCarve wrote for it. */
function vcDecode(bytes){
  var n = bytes.length, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var kv = [], tools = [];
  for (var i = 0; i + 8 < n; i++){
    if (bytes[i] !== 0xff || bytes[i+1] !== 0xfe || bytes[i+2] !== 0xff) continue;
    var L = bytes[i+3], p = i + 4;
    if (L < 2 || p + 2*L + 5 > n) continue;
    var name = '', ok = true;
    for (var k = 0; k < L; k++){
      var c = bytes[p + 2*k];
      if (bytes[p + 2*k + 1] !== 0 || c < 0x20 || c > 0x7e){ ok = false; break; }
      name += String.fromCharCode(c);
    }
    if (!ok) continue;
    var q = p + 2*L, tag = dv.getUint32(q, true), v;
    q += 4;
    if (tag === 0 && q + 8 <= n) v = dv.getFloat64(q, true);
    else if (tag === 1 && q + 4 <= n) v = dv.getInt32(q, true);
    else if (tag === 2) v = !!bytes[q];
    else if (tag === 3 && bytes[q] === 0xff && bytes[q+1] === 0xfe && bytes[q+2] === 0xff){
      var sl = bytes[q+3]; v = '';
      for (var k2 = 0; k2 < sl && q + 5 + 2*k2 < n; k2++) v += String.fromCharCode(bytes[q+4+2*k2] | (bytes[q+5+2*k2] << 8));
    }
    else continue;
    kv.push({at:i, k:name, v:v});
    i = p + 2*L - 1;
  }
  // tool records: spindle speed, tool number, length, then the name (Latin-1, zero-terminated)
  for (var j = 0; j + 12 < n; j++){
    var L2 = dv.getUint32(j + 8, true);
    if (L2 < 4 || L2 > 120) continue;
    var rpm = dv.getInt32(j, true), tn = dv.getUint32(j + 4, true);
    if (rpm < 1000 || rpm > 60000 || tn < 1 || tn > 999) continue;
    var s0 = j + 12;
    if (s0 + L2 > n || bytes[s0 + L2 - 1] !== 0) continue;
    var nm = '', good = true;
    for (var t = 0; t < L2 - 1; t++){
      var b = bytes[s0 + t];
      if (!((b >= 0x20 && b <= 0x7e) || b >= 0xa0)){ good = false; break; }
      nm += String.fromCharCode(b);
    }
    if (!good || nm.length < 3) continue;
    var tool = {at:j, num:tn, rpm:rpm, name:nm};
    if (j >= 48){
      var un = bytes[j - 45], ru = dv.getInt32(j - 4, true);
      var dia = dv.getFloat64(j - 44, true), pass = dv.getFloat64(j - 36, true), over = dv.getFloat64(j - 28, true), feed = dv.getFloat64(j - 20, true), plunge = dv.getFloat64(j - 12, true);
      var sane = function (v, hi){ return isFinite(v) && v > 0 && v < hi; };
      // only if all of it reads as a tool's numbers: otherwise this isn't that kind of record
      if ((un === 0 || un === 1) && sane(dia, 500) && sane(pass, 500) && sane(over, 500) && sane(feed, 1e5) && sane(plunge, 1e5)){
        var mm = un === 1 ? 1 : 25.4;
        tool.dia = dia * mm; tool.pass = pass * mm; tool.stepover = over * mm; tool.inches = un === 0;
        if (ru === 1 || ru === 4){ tool.feed = feed * (ru === 4 ? 25.4 : 1); tool.plunge = plunge * (ru === 4 ? 25.4 : 1); }
        // a V-bit (kind 3) keeps its radius and how tall its cone is: its angle is twice the angle those make
        var rr = dv.getFloat32(j - 57, true), hh = dv.getFloat32(j - 53, true);
        if (j >= 61 && dv.getInt32(j - 61, true) === 3 && rr > 0 && hh > 0 && isFinite(rr) && isFinite(hh)) tool.angle = +(2 * Math.atan(rr / hh) * 180 / Math.PI).toFixed(3);
      }
    }
    tools.push(tool);
    j = s0 + L2 - 1;
  }
  return {kv:kv, tools:tools};
}
// Which vectors each toolpath uses: VCarve's own record, by ID, in each toolpath's part of the stream.
// Found by scanning once for any vector ID (a 4-byte lookup, then the full 16), so it's quick even for
// megabyte projects. Independent of positions, so it works when parts were moved after calculating.
function vcToolpathVectors(td, toolpaths, contourIds){
  var byHead = {}, known = 0;
  contourIds.forEach(function (hx) { if (!hx) return; (byHead[hx.slice(0, 8)] = byHead[hx.slice(0, 8)] || []).push(hx); known++; });
  if (!known) return;
  // A toolpath's record starts with its name, lists its vectors, and has its settings (where the reader
  // found it) later on. So each record starts at its name's first appearance after the previous one.
  var spans = toolpaths.map(function (T) { return {T: T, at: T.at || 0}; }).sort(function (a, b) { return a.at - b.at; });
  var from = 0;
  spans.forEach(function (sp) {
    var nm = String(sp.T.name || ''), mark = [0xFF, 0xFE, 0xFF, nm.length];
    for (var c = 0; c < nm.length; c++){ var cc = nm.charCodeAt(c); mark.push(cc & 255, cc >> 8); }
    var found = -1;
    for (var q = from; q + mark.length <= sp.at && found < 0; q++){
      var hit = true;
      for (var m = 0; m < mark.length; m++) if (td[q + m] !== mark[m]){ hit = false; break; }
      if (hit) found = q;
    }
    sp.start = found >= 0 ? found : sp.at;
    from = sp.start + 1;
  });
  spans.forEach(function (sp, k) { sp.end = k + 1 < spans.length ? spans[k + 1].start : td.length; sp.T.vids = []; });
  function h2(b){ return (b < 16 ? '0' : '') + b.toString(16); }
  for (var p = 0; p + 16 <= td.length; p++){
    var head = h2(td[p]) + h2(td[p + 1]) + h2(td[p + 2]) + h2(td[p + 3]);
    var cands = byHead[head]; if (!cands) continue;
    var full = head; for (var q = 4; q < 16; q++) full += h2(td[p + q]);
    if (cands.indexOf(full) < 0) continue;
    for (var k2 = spans.length - 1; k2 >= 0; k2--) if (spans[k2].start <= p){ if (p < spans[k2].end && spans[k2].T.vids.indexOf(full) < 0) spans[k2].T.vids.push(full); break; }
    p += 15;
  }
}
function vcToolpathsFrom(bytes){
  var d = vcDecode(bytes), kv = d.kv, tools = d.tools, groups = [];
  // A toolpath starts with its own name (mcBaseToolpathName); its settings then hold a name too, and that one is
  // the name it had when it was last calculated, which a rename since has left behind. So a name inside the
  // settings belongs to the toolpath it's in, unless a tool's record stands between them: every toolpath has
  // its tool before it, and older projects have toolpaths with no name of their own. (Each differing name used
  // to start a toolpath: five came across as nine, one of them under another's old name.)
  function toolBetween(a, b){ for (var t = 0; t < tools.length; t++) if (tools[t].at > a && tools[t].at < b) return true; return false; }
  kv.forEach(function(e, idx){
    if (!/ToolpathName$/.test(e.k)) return;
    var name = String(e.v), own = e.k === 'mcBaseToolpathName', pre = own ? '' : e.k.replace(/ToolpathName$/, ''), last = groups[groups.length - 1];
    if (last && !own && (last.name === name || (last.own && !toolBetween(last.at, e.at)))){ if (last.prefixes.indexOf(pre) < 0) last.prefixes.push(pre); return; }
    groups.push({name:name, at:e.at, idx:idx, prefixes: own ? [] : [pre], own: own});
  });
  var TYPES = [['_chpd','Chamfer'], ['_vcpd','V-Carve'], ['_dpd','Drilling'], ['_pkpd','Pocket'], ['_ppd','Profile']];
  return groups.map(function(g, gi){
    var stop = gi + 1 < groups.length ? groups[gi + 1].idx - 5 : kv.length;
    var set = {};
    for (var a = Math.max(0, g.idx - 5); a < stop; a++){ if (!(kv[a].k in set)) set[kv[a].k] = kv[a].v; }
    var type = 'Toolpath';
    for (var ti = 0; ti < TYPES.length; ti++) if (g.prefixes.indexOf(TYPES[ti][0]) >= 0){ type = TYPES[ti][1]; break; }
    // VCarve also writes the type as text; trust it where it exists
    var named = typeof set.ToolpathType === 'string' ? set.ToolpathType : '';
    if (type === 'Toolpath' && /pocket/i.test(named)) type = 'Pocket';
    else if (type === 'Toolpath' && /drill/i.test(named)) type = 'Drilling';
    else if (type === 'Toolpath' && /profile/i.test(named)) type = 'Profile';
    // a V-carve made with a second tool for its flat floor is two toolpaths: the V-bit's, and that tool's clearing
    if (/AreaClear/i.test(named)) type = 'AreaClear'; else if (/VCarve/i.test(named)) type = 'V-Carve';
    var tool = null;
    for (var tj = tools.length - 1; tj >= 0; tj--) if (tools[tj].at < g.at){ tool = tools[tj]; break; }
    // the machine and material VCarve used for this toolpath (IDs from its tool database) sit between
    // the tool record and the toolpath's name
    var mid = null, matid = null, floor = tool ? tool.at : -1;
    for (var z = g.idx - 1; z >= 0 && kv[z].at > floor; z--){
      if (mid === null && kv[z].k === 'db_machine_id') mid = String(kv[z].v);
      if (matid === null && kv[z].k === 'db_material_id') matid = String(kv[z].v);
    }
    var tl = tool ? {num:tool.num, name:tool.name, rpm:tool.rpm} : null;
    if (tool && tool.dia > 0){ tl.dia = tool.dia; tl.pass = tool.pass; tl.stepover = tool.stepover; tl.inches = tool.inches; if (tool.feed > 0){ tl.feed = tool.feed; tl.plunge = tool.plunge; } if (tool.angle > 0) tl.angle = tool.angle; }
    return {name:g.name, at:g.at, type:type, tool: tl, set:set,
            machineId:mid, materialId:matid};
  });
}

