/* ============================================================
   DXF EXPORT
   R12 ASCII DXF, which VCarve, Fusion, LibreCAD and laser software all read. Circles and arcs stay
   true circles and arcs; outlines with curved segments keep their curves as polyline bulges. Units
   are millimetres and say so. Design's layers become DXF layers (hidden ones off, locked ones
   locked); construction lines go on a "Construction" layer. Groups are flattened, text is
   converted to outlines. Dimensions, guides and toolpaths are 454's own and stay out.
   ============================================================ */
function dxfExport(){
  var out = [], used = {}, order = [];
  function num(v){ var t = (+v).toFixed(6); t = t.replace(/\.?0+$/, ''); return t === '-0' ? '0' : t; }
  function lname(n){ return String(n || '0').replace(/[<>\/\\":;?*|=`]/g, '_').slice(0, 250) || '0'; }
  function useLayer(nm, info){ if (!used[nm]){ used[nm] = info; order.push(nm); } return nm; }
  (DOC.layers || []).forEach(function (L) { useLayer(lname(L.name), {visible: L.visible, locked: L.locked, color: 7}); });
  var ents = [];
  function add(e, layerName){
    if (!e) return;
    if (e.t === 'group'){ e.ents.forEach(function (c) { add(c, layerName); }); return; }
    if (e.t === 'text'){ var tc = typeof textToCurves === 'function' ? textToCurves(e) : null; if (tc) add(tc, layerName); return; }
    ents.push({e: e, layer: layerName});
  }
  DOC.ents.forEach(function (e) {
    var L = layerById(e.layer), nm = lname(L ? L.name : '0');
    if (e.con) nm = useLayer('Construction', {visible: true, locked: false, color: 8});
    else if (e.tp) nm = useLayer('VCarve toolpath preview', {visible: true, locked: false, color: 30});
    add(e, nm);
  });
  function pr(code, val){ out.push(String(code), String(val)); }
  function poly(layer, pts, closed){
    pr(0, 'POLYLINE'); pr(8, layer); pr(66, 1); pr(10, 0); pr(20, 0); pr(30, 0); pr(70, closed ? 1 : 0);
    pts.forEach(function (q) {
      pr(0, 'VERTEX'); pr(8, layer); pr(10, num(q[0])); pr(20, num(q[1])); pr(30, 0);
      if (q[2]) pr(42, num(q[2]));
    });
    pr(0, 'SEQEND'); pr(8, layer);
  }
  var bb = null;
  function grow(x, y){ bb = bb ? {x0: Math.min(bb.x0, x), y0: Math.min(bb.y0, y), x1: Math.max(bb.x1, x), y1: Math.max(bb.y1, y)} : {x0: x, y0: y, x1: x, y1: y}; }
  var body = [];
  var keep = out; out = body;
  ents.forEach(function (it) {
    var e = it.e, L = it.layer;
    var b = entBBox(e); grow(b.x0, b.y0); grow(b.x1, b.y1);
    if (e.t === 'line'){ pr(0, 'LINE'); pr(8, L); pr(10, num(e.x1)); pr(20, num(e.y1)); pr(30, 0); pr(11, num(e.x2)); pr(21, num(e.y2)); pr(31, 0); }
    else if (e.t === 'circle'){ pr(0, 'CIRCLE'); pr(8, L); pr(10, num(e.cx)); pr(20, num(e.cy)); pr(30, 0); pr(40, num(e.r)); }
    else if (e.t === 'arc'){
      // DXF arcs always run anticlockwise from start to end; a clockwise arc is the same arc reversed
      var s0 = e.ccw ? e.a0 : e.a1, s1 = e.ccw ? e.a1 : e.a0, deg = 180 / Math.PI;
      var d0 = ((s0 * deg) % 360 + 360) % 360, d1 = ((s1 * deg) % 360 + 360) % 360;
      pr(0, 'ARC'); pr(8, L); pr(10, num(e.cx)); pr(20, num(e.cy)); pr(30, 0); pr(40, num(e.r)); pr(50, num(d0)); pr(51, num(d1));
    }
    else if (e.t === 'rect') poly(L, [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]], true);
    else if (e.t === 'poly') poly(L, e.pts, !!e.closed);
    else if (e.t === 'path') poly(L, e.pts, !!e.closed);
  });
  out = keep;
  bb = bb || {x0: 0, y0: 0, x1: 0, y1: 0};
  pr(0, 'SECTION'); pr(2, 'HEADER');
  pr(9, '$ACADVER'); pr(1, 'AC1009');
  pr(9, '$INSUNITS'); pr(70, 4);                          // millimetres
  pr(9, '$MEASUREMENT'); pr(70, 1);                       // metric
  pr(9, '$EXTMIN'); pr(10, num(bb.x0)); pr(20, num(bb.y0)); pr(30, 0);
  pr(9, '$EXTMAX'); pr(10, num(bb.x1)); pr(20, num(bb.y1)); pr(30, 0);
  pr(0, 'ENDSEC');
  pr(0, 'SECTION'); pr(2, 'TABLES');
  pr(0, 'TABLE'); pr(2, 'LTYPE'); pr(70, 1);
  pr(0, 'LTYPE'); pr(2, 'CONTINUOUS'); pr(70, 0); pr(3, 'Solid line'); pr(72, 65); pr(73, 0); pr(40, 0);
  pr(0, 'ENDTAB');
  pr(0, 'TABLE'); pr(2, 'LAYER'); pr(70, order.length);
  order.forEach(function (nm) {
    var inf = used[nm];
    pr(0, 'LAYER'); pr(2, nm); pr(70, inf.locked ? 4 : 0); pr(62, inf.visible ? inf.color : -inf.color); pr(6, 'CONTINUOUS');
  });
  pr(0, 'ENDTAB'); pr(0, 'ENDSEC');
  pr(0, 'SECTION'); pr(2, 'ENTITIES');
  body.forEach(function (v) { out.push(v); });
  pr(0, 'ENDSEC'); pr(0, 'EOF');
  return {text: out.join('\r\n') + '\r\n', count: ents.length, layers: order.length};
}
function dxfSave(){
  if (!DOC.ents.length){ toast('info', 'Nothing to export', 'The drawing has no shapes yet.'); return; }
  var r = dxfExport(), base = (DOC.name || 'drawing').replace(/\.[^.]+$/, ''), said = r.count + (r.count === 1 ? ' shape' : ' shapes') + ' on ' + r.layers + (r.layers === 1 ? ' layer' : ' layers');
  if (window.showSaveFilePicker){
    window.showSaveFilePicker({id: 'dxf', suggestedName: base + '.dxf', types: [{description: 'DXF drawing', accept: {'application/dxf': ['.dxf']}}]})
      .then(function (handle) {
        return handle.createWritable().then(function (w) { return w.write(r.text).then(function () { return w.close(); }); })
          .then(function () { toast('ok', 'DXF saved', said + ' written to ' + handle.name + ', in millimetres.'); });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        toast('err', 'Couldn\u2019t save the DXF', (err && err.message) || 'The browser refused to write the file.');
      });
    return;
  }
  var blob = new Blob([r.text], {type: 'application/dxf'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = base + '.dxf'; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('ok', 'DXF downloaded', said + ' saved as ' + base + '.dxf, in millimetres.');
}

