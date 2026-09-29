/* ============================================================
   SVG EXPORT
   For laser software, vinyl cutters and Inkscape. Millimetres, at true size. Circles, arcs and
   curved outline segments are real SVG arcs. SVG's Y axis points down, so Y is flipped, which
   also reverses which way arcs turn: an anticlockwise arc in the drawing turns in SVG's negative
   direction, so it gets sweep flag 0. (Checked against svgpathtools, an independent SVG library.) Layers become Inkscape layers (hidden ones hidden); construction lines go on a
   dashed "Construction" layer. Groups are flattened, text becomes outlines.
   ============================================================ */
function svgExport(){
  function n(v){ var t = (+v).toFixed(4).replace(/\.?0+$/, ''); return t === '-0' ? '0' : t; }
  var items = [];
  function add(e, layer){
    if (!e) return;
    if (e.t === 'group'){ e.ents.forEach(function (c) { add(c, layer); }); return; }
    if (e.t === 'text'){ var tc = typeof textToCurves === 'function' ? textToCurves(e) : null; if (tc) add(tc, layer); return; }
    items.push({e: e, layer: layer});
  }
  DOC.ents.forEach(function (e) { add(e, e.con ? '__con' : (e.layer || '')); });
  if (!items.length) return null;
  var bb = null;
  items.forEach(function (it) { var b = entBBox(it.e); bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b; });
  var pad = 1, X0 = bb.x0 - pad, Y1 = bb.y1 + pad, W = (bb.x1 - bb.x0) + 2 * pad, H = (bb.y1 - bb.y0) + 2 * pad;
  function X(x){ return n(x - X0); } function Y(y){ return n(Y1 - y); }    // Y flipped: SVG counts down
  function arcTo(r, sweep, large, x, y){ return ' A ' + n(r) + ' ' + n(r) + ' 0 ' + (large ? 1 : 0) + ' ' + (sweep ? 1 : 0) + ' ' + X(x) + ' ' + Y(y); }
  function shape(e){
    if (e.t === 'line') return '<line x1="' + X(e.x1) + '" y1="' + Y(e.y1) + '" x2="' + X(e.x2) + '" y2="' + Y(e.y2) + '"/>';
    if (e.t === 'circle') return '<circle cx="' + X(e.cx) + '" cy="' + Y(e.cy) + '" r="' + n(e.r) + '"/>';
    if (e.t === 'rect') return '<rect x="' + X(e.x) + '" y="' + Y(e.y + e.h) + '" width="' + n(e.w) + '" height="' + n(e.h) + '"/>';
    if (e.t === 'poly'){
      var pts = e.pts.map(function (q) { return X(q[0]) + ',' + Y(q[1]); }).join(' ');
      return e.closed ? '<polygon points="' + pts + '"/>' : '<polyline points="' + pts + '"/>';
    }
    if (e.t === 'arc'){
      var sw = arcSweepOf(e.a0, e.a1, e.ccw), dir = e.ccw ? 1 : -1;
      var sx = e.cx + e.r * Math.cos(e.a0), sy = e.cy + e.r * Math.sin(e.a0);
      if (sw > 2 * Math.PI - 1e-9){                      // a full turn: SVG needs it in two halves
        var hx = e.cx + e.r * Math.cos(e.a0 + dir * Math.PI), hy = e.cy + e.r * Math.sin(e.a0 + dir * Math.PI);
        return '<path d="M ' + X(sx) + ' ' + Y(sy) + arcTo(e.r, !e.ccw, false, hx, hy) + arcTo(e.r, !e.ccw, false, sx, sy) + '"/>';
      }
      var ex = e.cx + e.r * Math.cos(e.a0 + dir * sw), ey = e.cy + e.r * Math.sin(e.a0 + dir * sw);
      return '<path d="M ' + X(sx) + ' ' + Y(sy) + arcTo(e.r, !e.ccw, sw > Math.PI, ex, ey) + '"/>';
    }
    if (e.t === 'path'){
      var m = e.pts.length, d = 'M ' + X(e.pts[0][0]) + ' ' + Y(e.pts[0][1]), last = e.closed ? m : m - 1;
      for (var k = 0; k < last; k++){
        var p0 = e.pts[k], p1 = e.pts[(k + 1) % m], b = p0[2] || 0;
        if (Math.abs(b) < 1e-9){ d += ' L ' + X(p1[0]) + ' ' + Y(p1[1]); continue; }
        var th = 4 * Math.atan(b), ch = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), r = ch / (2 * Math.sin(Math.abs(th) / 2));
        d += arcTo(r, th < 0, Math.abs(th) > Math.PI, p1[0], p1[1]);   // + bulge = anticlockwise = sweep 0 after the flip
      }
      return '<path d="' + d + (e.closed ? ' Z' : '') + '"/>';
    }
    return '';
  }
  function esc(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- 454 Design: ' + esc(DOC.name || 'drawing') + ', in millimetres -->',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" data-454-origin="' + n(X0) + ' ' + n(Y1 - H) + '" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + ' ' + n(H) + '">'];
  var groups = (DOC.layers || [{id: '', name: 'Layer 1', visible: true}]).map(function (L) { return {id: L.id, name: L.name, visible: L.visible !== false}; });
  if (items.some(function (it) { return it.layer === '__con'; })) groups.push({id: '__con', name: 'Construction', visible: true, con: true});
  var count = 0;
  groups.forEach(function (g, gi) {
    var mine = items.filter(function (it) { return it.layer === g.id || (!g.id && !it.layer) || (gi === 0 && !g.con && !layerById(it.layer) && it.layer !== '__con'); });
    if (!mine.length) return;
    out.push('  <g id="layer' + (gi + 1) + '" inkscape:groupmode="layer" inkscape:label="' + esc(g.name) + '"' + (g.visible ? '' : ' style="display:none"') +
             ' fill="none" stroke="' + (g.con ? '#8a8a8a' : '#000000') + '" stroke-width="0.1"' + (g.con ? ' stroke-dasharray="1.5 1"' : '') + '>');
    mine.forEach(function (it) { var sv = shape(it.e); if (sv){ out.push('    ' + sv); count++; } });
    out.push('  </g>');
  });
  out.push('</svg>');
  return {text: out.join('\n') + '\n', count: count, w: W, h: H};
}
function svgSave(){
  var r = DOC.ents.length ? svgExport() : null;
  if (!r){ toast('info', 'Nothing to export', 'The drawing has no shapes yet.'); return; }
  var base = (DOC.name || 'drawing').replace(/\.[^.]+$/, ''), said = r.count + (r.count === 1 ? ' shape' : ' shapes') + ', ' + n2(r.w) + ' \u00d7 ' + n2(r.h) + ' mm';
  function n2(v){ return (+v).toFixed(1); }
  if (window.showSaveFilePicker){
    window.showSaveFilePicker({id: 'svg', suggestedName: base + '.svg', types: [{description: 'SVG drawing', accept: {'image/svg+xml': ['.svg']}}]})
      .then(function (h) { return h.createWritable().then(function (w) { return w.write(r.text).then(function () { return w.close(); }); }).then(function () { toast('ok', 'SVG saved', said + ', written to ' + h.name + '.'); }); })
      .catch(function (err) { if (err && err.name === 'AbortError') return; toast('err', 'Couldn\u2019t save the SVG', (err && err.message) || ''); });
    return;
  }
  var blob = new Blob([r.text], {type: 'image/svg+xml'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = base + '.svg'; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('ok', 'SVG downloaded', said + ', saved as ' + base + '.svg.');
}
