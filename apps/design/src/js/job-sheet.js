// ---- the job sheet: everything about the job on one printable page ----
// A rough cutting time from a toolpath's moves: feed moves at their programmed rate, rapids at the
// rapid rate. No acceleration, so real jobs run somewhat longer; 454 Control's estimate is closer.
var JS_RAPID = 5000;                                   // mm/min, a typical GRBL router's rapid rate
function tpTimeSec(tp){
  var x = null, y = null, z = null, sec = 0, f = tp.feed || 1000;
  (tp.moves || []).forEach(function (m) {
    var nx = m.x !== undefined ? m.x : x, ny = m.y !== undefined ? m.y : y, nz = m.z !== undefined ? m.z : z;
    if (m.f) f = m.f;
    if (x !== null && y !== null && z !== null && nx !== null && ny !== null && nz !== null){
      var d = Math.sqrt((nx - x) * (nx - x) + (ny - y) * (ny - y) + (nz - z) * (nz - z));
      sec += d / (m.g === 0 ? JS_RAPID : Math.max(1, f)) * 60;
    }
    x = nx; y = ny; z = nz;
  });
  return sec;
}
function fmtDur(sec){
  sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60;
  return h ? h + ' h ' + m + ' min' : m ? m + ' min ' + (s2 < 10 ? '0' : '') + s2 + ' s' : s2 + ' s';
}
function rateTxt(v){ return unitTag() === 'in' ? (v / 25.4).toFixed(1) + ' in/min' : Math.round(v) + ' mm/min'; }
function jsEsc(t){ return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var JS_COLORS = ['#0083ff', '#e0533d', '#2e9e5b', '#b07fe0', '#d98e3f', '#1aa3a3', '#c2457a', '#6b7a1f'];

function jobSheetOpen(){
  if (!camReady()) return;
  var list = tpList().filter(function (tp) { return !multiSheet() || tpSheetOf(tp) === DOC.activeSheet; });
  var chosen = list.filter(function (tp) { return !tp.exclude; });
  var left = list.filter(function (tp) { return tp.exclude; });
  if (!chosen.length){ toast('info', 'No toolpaths to describe', 'Every toolpath is left out of the G-code; include one to make a job sheet.'); return; }
  var recalculated = 0;
  chosen.forEach(function (tp) { if (tpStale(tp)){ tpGenerate(tp); recalculated++; } });   // as Save G-code does
  if (recalculated){ persist(); renderToolpathPanel(); draw(); }
  var numberOf = toolNumbering(), u = unitTag();
  // the tools, in the order they're first used
  var tools = [], byKey = {}, changes = 0, lastKey = null, totalSec = 0;
  var ext = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z0: Infinity};
  chosen.forEach(function (tp, i) {
    var key = tp.toolId || ('dia' + tp.dia), t = tp.toolId ? libTool(tp.toolId) : null, n = numberOf(tp);
    if (!byKey[key]){
      var mm = t && t.units === 'in' ? 25.4 : 1;
      byKey[key] = {num: n, name: t ? t.name : fmtDisp(tp.dia) + ' ' + u + (tp.side === 'drill' ? ' drill' : (tp.side === 'vcarve' || tp.side === 'chamfer') ? ' ' + (tp.vAngle || 90) + '\u00b0 V-bit' : ' end mill'),
        dia: tp.dia, kind: (tp.side === 'vcarve' || tp.side === 'chamfer') ? (tp.vAngle || 90) + '\u00b0 V-bit' + (tp.vTip > 0 ? ', ' + fmtDisp(tp.vTip) + ' ' + u + ' flat' : '') : tp.side === 'drill' ? 'drill' : 'end mill',
        flutes: t && t.flutes ? t.flutes : '', notes: t && t.notes ? t.notes : '', rpm: {}, used: []};
      tools.push(byKey[key]);
    }
    byKey[key].rpm[tp.rpm || 18000] = 1; byKey[key].used.push(i + 1);
    if (lastKey !== null && key !== lastKey) changes++;
    lastKey = key;
    tp._jsSec = tpTimeSec(tp); totalSec += tp._jsSec;
    var z = null;
    (tp.moves || []).forEach(function (m) { if (m.z !== undefined) z = m.z;
      if (m.g === 1 && m.x !== undefined && m.y !== undefined){ ext.x0 = Math.min(ext.x0, m.x); ext.x1 = Math.max(ext.x1, m.x); ext.y0 = Math.min(ext.y0, m.y); ext.y1 = Math.max(ext.y1, m.y); }
      if (m.g === 1 && z !== null) ext.z0 = Math.min(ext.z0, z); });
  });
  var st = DOC.stock, sheetName = multiSheet() ? sheetTitle(DOC.activeSheet) : '';
  var jobName = (DOC.name || UICFG.lastGcodeName || 'Untitled job').replace(/\.(nc|gcode|tap|ngc|454\.json|json)$/i, '');
  var matName = UICFG.libMaterial && libMaterialName(UICFG.libMaterial) ? libMaterialName(UICFG.libMaterial) : '';
  var first = tools[0];
  var h = [];
  // header
  h.push('<div class="jsHead">' + (document.querySelector('header .brandLogo') || {outerHTML: ''}).outerHTML +     // the logo from the app's header
     '<div><h1 contenteditable="true" spellcheck="false" title="Click to rename">' + jsEsc(jobName) + (sheetName ? ' \u2014 ' + jsEsc(sheetName) : '') + '</h1>' +
    '<div class="jsMeta">Job sheet \u00b7 ' + jsEsc(new Date().toLocaleString()) + ' \u00b7 454 Design v' + DESIGN_VERSION + '</div></div></div>');
  // key facts
  h.push('<div class="jsFacts">' +
    '<div><span>Material</span><b>' + fmtDisp(st.w) + ' \u00d7 ' + fmtDisp(st.h) + ' ' + u + '</b></div>' +
    '<div><span>Thickness</span><b>' + (st.t > 0 ? fmtDisp(st.t) + ' ' + u : 'not set') + '</b></div>' +
    '<div><span>Toolpaths</span><b>' + chosen.length + '</b></div>' +
    '<div><span>Tools / changes</span><b>' + tools.length + ' / ' + changes + '</b></div>' +
    '<div><span>Est. time</span><b>' + fmtDur(totalSec) + '</b></div></div>');
  // the picture
  h.push('<h2>The job</h2><div class="jsPic">' + jobSheetPicture(chosen, ext) + '</div>');
  // setup
  var ix = function (v) { return isFinite(v) ? fmtDisp(v) : '\u2014'; };
  h.push('<div class="jsKeep"><h2>Setup</h2><ul class="jsCheck">' +
    '<li>Material ' + fmtDisp(st.w) + ' \u00d7 ' + fmtDisp(st.h) + (st.t > 0 ? ' \u00d7 ' + fmtDisp(st.t) : '') + ' ' + u + (matName ? ' (feeds are for ' + jsEsc(matName) + ')' : '') + '</li>' +
    '<li>Clamps clear of the cutting: X ' + ix(ext.x0) + ' to ' + ix(ext.x1) + ', Y ' + ix(ext.y0) + ' to ' + ix(ext.y1) + ' ' + u + '</li>' +
    '<li>X and Y zero at the ' + ORIGIN_NAMES[originKey()] + ' of the material</li>' +
    '<li>Z zero on the ' + (st.zero === 'bottom' ? 'spoilboard, under the material' : 'top of the material') + '; deepest cut Z ' + ix(ext.z0) + ' ' + u + '</li>' +
    '<li>First tool: T' + first.num + ', ' + jsEsc(first.name) + '</li>' +
    '<li>Preview the job in 454 Control and run it in the air first (toolpaths are in beta)</li></ul></div>');
  // tools
  h.push('<div class="jsKeep"><h2>Tools</h2><table><tr><th>Tool</th><th>Name</th><th>Diameter</th><th>Type</th><th>Flutes</th><th>Spindle</th><th>Used by</th></tr>' +
    tools.map(function (t) { return '<tr><td class="num">T' + t.num + '</td><td>' + jsEsc(t.name) + (t.notes ? '<div class="jsSub">' + jsEsc(t.notes) + '</div>' : '') + '</td><td>' + fmtDisp(t.dia) + ' ' + u + '</td><td>' + jsEsc(t.kind) + '</td><td>' + jsEsc(t.flutes) + '</td><td>' +
      Object.keys(t.rpm).map(function (r) { return r + ' rpm'; }).join(', ') + '</td><td>' + t.used.map(function (n) { return '#' + n; }).join(', ') + '</td></tr>'; }).join('') + '</table></div>');
  // toolpaths
  h.push('<h2>Toolpaths, in cutting order</h2><table><tr><th>#</th><th>Toolpath</th><th>Tool</th><th>Feed / plunge</th><th>Details</th><th>Time</th></tr>' +
    chosen.map(function (tp, i) {
      var t = byKey[tp.toolId || ('dia' + tp.dia)];
      var rows = tpRows(tp).map(function (r) { return '<div><span class="muted">' + jsEsc(r[0]) + ':</span> ' + jsEsc(r[1]) + '</div>'; }).join('');
      return '<tr><td class="num"><span class="sw" style="background:' + JS_COLORS[i % JS_COLORS.length] + '"></span>' + (i + 1) + '</td><td><b>' + jsEsc(tp.name) + '</b><div class="jsSub">' + jsEsc(tpKindName(tp)) + '</div></td>' +
        '<td>T' + t.num + '<div class="jsSub">' + jsEsc(t.name) + '</div></td><td>' + rateTxt(tp.feed) + '<div class="jsSub">plunge ' + rateTxt(tp.plunge || tp.feed) + ' \u00b7 ' + (tp.rpm || 18000) + ' rpm</div></td>' +
        '<td>' + rows + '</td><td>' + fmtDur(tp._jsSec) + '</td></tr>';
    }).join('') + '</table>');
  // what needs attention
  var warn = [];
  if (recalculated) warn.push(recalculated + (recalculated === 1 ? ' toolpath was' : ' toolpaths were') + ' out of date and recalculated for this sheet, as Save G-code does.');
  chosen.forEach(function (tp, i) { if (tp.warning) warn.push('#' + (i + 1) + ' ' + tp.name + ': ' + tp.warning);
    var on = tpOrderNote(tp, tpList().indexOf(tp)); if (on) warn.push('#' + (i + 1) + ' ' + tp.name + ': ' + on);
    if (!tpToolChosen(tp)) warn.push('#' + (i + 1) + ' ' + tp.name + ': no tool chosen.'); });
  if (!(st.t > 0)) warn.push('The material thickness isn\u2019t set, so through-cuts can\u2019t be checked.');
  if (left.length) warn.push('Left out of the G-code, and of this sheet: ' + left.map(function (tp) { return tp.name; }).join(', ') + '.');
  if (warn.length) h.push('<div class="jsWarn"><b>Check before cutting</b><ul>' + warn.map(function (w) { return '<li>' + jsEsc(w) + '</li>'; }).join('') + '</ul></div>');
  // notes
  h.push('<div class="jsKeep"><h2>Notes</h2><div class="jsNotes" contenteditable="true" spellcheck="true" aria-label="Notes"></div></div>');
  h.push('<div class="jsFoot">Times are estimates at the programmed feeds, without acceleration: real jobs run somewhat longer, and 454 Control\u2019s estimate is closer. ' +
    'Made with 454 Design\u2019s toolpaths, which are in beta.</div>');
  document.getElementById('jobSheet').innerHTML = h.join('');
  var modal = document.getElementById('jsModal');
  if (modal.parentNode !== document.body) document.body.appendChild(modal);    // printing shows only this, so it must sit directly in the page
  modal.hidden = false;
  document.getElementById('jsPrint').focus();
}
// the job, drawn to scale: the material, the shapes, and each toolpath's cuts in its colour, numbered where it starts
function jobSheetPicture(chosen, ext){
  var r = stockRect(), x0 = Math.min(r.x0, ext.x0), y0 = Math.min(r.y0, ext.y0), x1 = Math.max(r.x1, ext.x1), y1 = Math.max(r.y1, ext.y1);
  var pad = Math.max(x1 - x0, y1 - y0) * 0.04, W = 760, sc = W / (x1 - x0 + 2 * pad), H = Math.round((y1 - y0 + 2 * pad) * sc);
  var X = function (x) { return ((x - x0 + pad) * sc).toFixed(1); }, Y = function (y) { return ((y1 - y + pad) * sc).toFixed(1); };
  var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The job drawn to scale">'];
  out.push('<rect x="' + X(r.x0) + '" y="' + Y(r.y1) + '" width="' + ((r.x1 - r.x0) * sc).toFixed(1) + '" height="' + ((r.y1 - r.y0) * sc).toFixed(1) + '" fill="#f5f3ee" stroke="#9aa6b2" stroke-width="1"/>');
  DOC.ents.forEach(function (e) {
    if (e.tp || !entVisible(e)) return;
    var pl = vecPolyline(e); if (!pl || pl.pts.length < 2) return;
    out.push('<path d="M' + pl.pts.map(function (q) { return X(q[0]) + ' ' + Y(q[1]); }).join(' L') + (pl.closed ? 'Z' : '') + '" fill="none" stroke="#b9c1c9" stroke-width="1"/>');
  });
  var badges = [];
  chosen.forEach(function (tp, i) {
    var col = JS_COLORS[i % JS_COLORS.length], d = [], x = null, y = null, pen = false, start = null;
    (tp.moves || []).forEach(function (m) {
      var nx = m.x !== undefined ? m.x : x, ny = m.y !== undefined ? m.y : y;
      if (m.g === 1 && nx !== null && ny !== null && x !== null){
        if (!pen){ d.push('M' + X(x) + ' ' + Y(y)); pen = true; if (!start) start = [x, y]; }
        if (nx !== x || ny !== y) d.push('L' + X(nx) + ' ' + Y(ny));
      } else if (m.g === 0) pen = false;
      x = nx; y = ny;
    });
    if (d.length) out.push('<path d="' + d.join('') + '" fill="none" stroke="' + col + '" stroke-width="1.1" stroke-linejoin="round" opacity=".9"/>');
    // drilling goes straight down: mark each hole with a ring in the toolpath's colour
    if (tp.side === 'drill'){
      var hx = null, hy = null, rr = Math.max(3, (tp.dia || 3) / 2 * sc);
      (tp.moves || []).forEach(function (m) {
        if (m.x !== undefined) hx = m.x; if (m.y !== undefined) hy = m.y;
        if (m.g === 1 && m.z !== undefined && m.x === undefined && m.y === undefined && hx !== null){
          out.push('<circle cx="' + X(hx) + '" cy="' + Y(hy) + '" r="' + rr.toFixed(1) + '" fill="' + col + '" fill-opacity=".25" stroke="' + col + '" stroke-width="1.3"/>');
          if (!start) start = [hx, hy];
        }
      });
    }
    if (start) badges.push('<g><circle cx="' + X(start[0]) + '" cy="' + Y(start[1]) + '" r="8" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>' +
      '<text x="' + X(start[0]) + '" y="' + (+Y(start[1]) + 3.6).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">' + (i + 1) + '</text></g>');
  });
  out.push(badges.join(''));
  // where X0 Y0 is
  out.push('<g stroke="#1b1f24" stroke-width="1.2"><line x1="' + (+X(0) - 7) + '" y1="' + Y(0) + '" x2="' + (+X(0) + 7) + '" y2="' + Y(0) + '"/><line x1="' + X(0) + '" y1="' + (+Y(0) - 7) + '" x2="' + X(0) + '" y2="' + (+Y(0) + 7) + '"/></g>' +
    '<text x="' + (+X(0) + 9) + '" y="' + (+Y(0) - 6) + '" font-size="10" fill="#1b1f24" font-family="system-ui,sans-serif">X0 Y0</text>');
  out.push('</svg>');
  return out.join('');
}
function jobSheetClose(){ document.getElementById('jsModal').hidden = true; }
// Recalculate a toolpath from its shapes and the material as they are now, keeping its own settings.
function tpRecalc(tp, quiet){
  tpGenerate(tp); persist(); renderToolpathPanel(); draw();
  if (!quiet){
    if (tp.warning) toast('warn', tp.name + ' recalculated', tp.warning);
    else toast('ok', tp.name + ' recalculated', 'Rebuilt from its shapes as they are now.');
  }
}
function tpRecalcAll(){
  var list = tpList().filter(function (tp) { return !multiSheet() || tpSheetOf(tp) === DOC.activeSheet; });
  if (!list.length) return;
  var warned = [];
  list.forEach(function (tp) { tpGenerate(tp); if (tp.warning) warned.push(tp.name); });
  persist(); renderToolpathPanel(); draw();
  var what = list.length === 1 ? '1 toolpath' : list.length + ' toolpaths';
  if (warned.length) toast('warn', what + ' recalculated', 'Check ' + warned.join(', ') + ': ' + (warned.length === 1 ? 'it has' : 'they have') + ' a note.');
  else toast('ok', what + ' recalculated', 'All rebuilt from their shapes and the material as they are now.');
}
