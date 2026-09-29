/* ---------------- persistence ---------------- */
function persist(){
  if (typeof renderLayers === 'function' && !persist.layerQueued){
    persist.layerQueued = true;
    setTimeout(function(){ persist.layerQueued = false; renderLayers(); }, 0);
  }
  try{ localStorage.setItem('d454Design', docForStorage()); }
  catch(e){                                             // say so: losing work quietly is the worst outcome
    if (!persist.warned){ persist.warned = true;
      toast('err', 'This drawing couldn\u2019t be saved in the browser', 'The browser\u2019s storage is full. Save the drawing to a file to keep it.'); }
  }
}
// Material is often sold in inches even when the work is metric, so its size can be entered
// in either. The drawing always stays in millimetres.
function stockUnits(){ return UICFG.stockUnits === 'in' ? 'in' : 'mm'; }
// Display units. The drawing itself is always millimetres; these only change what is shown
// and what typed dimension values mean.
function dispIn(){ return stockUnits() === 'in'; }
function toDisp(mm){ return dispIn() ? mm / 25.4 : mm; }
function fmtDisp(mm, dp){ return toDisp(mm).toFixed(dp !== undefined ? dp : (dispIn() ? 3 : 2)); }
function unitTag(){ return dispIn() ? 'in' : 'mm'; }
function fmtStockLen(mm, u){
  if (u === 'in') return libFraction(mm / 25.4 + 1e-12);   // 304.8 -> "12", 12.7 -> "1/2", else decimals
  return String(+mm.toFixed(3));
}
// "12", "12.5", "12 1/2", "12-1/2", "3/4"; a trailing mm, in or " overrides the chosen units
// Every typed LENGTH goes through here: a plain number means the document units, and a unit
// written after it wins ("25mm" while working in inches, or 1/2" while working in mm).
// Angles, counts and percentages are not lengths and are left alone.
function lenIn(txt){
  var t = String(txt).trim().toLowerCase();
  if (!t) return NaN;
  var u = stockUnits(), m = /^(.*?)\s*(mm|cm|in|"|\u2033)$/.exec(t);
  if (m){ t = m[1].trim(); u = m[2] === 'mm' ? 'mm' : m[2] === 'cm' ? 'cm' : 'in'; }
  var sign = 1;
  if (/^[+-]/.test(t)){ if (t.charAt(0) === '-') sign = -1; t = t.slice(1).trim(); }
  var v = NaN, f;
  if ((f = /^(\d+(?:\.\d+)?)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(t))) v = +f[1] + f[2] / f[3];
  else if ((f = /^(\d+)\s*\/\s*(\d+)$/.exec(t))) v = f[1] / f[2];
  else if (/^\d*\.?\d+$/.test(t)) v = parseFloat(t);
  if (!isFinite(v)) return NaN;
  return sign * (u === 'in' ? v * 25.4 : u === 'cm' ? v * 10 : v);
}
function parseStockLen(txt, u){
  var t = String(txt).trim().toLowerCase();
  var m = /^(.*?)\s*(mm|in|"|″)$/.exec(t);
  if (m){ t = m[1].trim(); u = m[2] === 'mm' ? 'mm' : 'in'; }
  var v = NaN, mm2;
  if ((mm2 = /^(\d+(?:\.\d+)?)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(t))) v = +mm2[1] + mm2[2] / mm2[3];
  else if ((mm2 = /^(\d+)\s*\/\s*(\d+)$/.exec(t))) v = mm2[1] / mm2[2];
  else if (/^\d*\.?\d+$/.test(t)) v = parseFloat(t);
  if (!(v > 0) || !isFinite(v)) return NaN;
  return u === 'in' ? v * 25.4 : v;
}
function syncStockUI(){
  if (typeof bgChipSync === 'function') bgChipSync();
  var u = stockUnits();
  document.getElementById('stkUnits').value = u;
  document.getElementById('stkW').value = fmtStockLen(DOC.stock.w, u);
  document.getElementById('stkH').value = fmtStockLen(DOC.stock.h, u);
  var ok0 = originKey();
  Array.prototype.forEach.call(document.getElementById('stkOriginPick').children, function (b) {
    if (b.dataset && b.dataset.o) b.setAttribute('aria-checked', b.dataset.o === ok0 ? 'true' : 'false');
  });
  document.getElementById('stkOriginName').textContent = ORIGIN_NAMES[ok0].charAt(0).toUpperCase() + ORIGIN_NAMES[ok0].slice(1);
  document.getElementById('stkT').value = DOC.stock.t > 0 ? fmtStockLen(DOC.stock.t, u) : '';
  document.getElementById('stkZ').value = DOC.stock.zero === 'bottom' ? 'bottom' : 'top';
  var eq = document.getElementById('stkEq');
  eq.textContent = u === 'in'
    ? '= ' + DOC.stock.w.toFixed(2) + ' \u00d7 ' + DOC.stock.h.toFixed(2) + ' mm in the drawing. Fractions work: 12 1/2 or 3/4.'
    : '= ' + (DOC.stock.w / 25.4).toFixed(3) + ' \u00d7 ' + (DOC.stock.h / 25.4).toFixed(3) + ' in';
}
function restore(){ // startup ONLY: pulls the persisted doc. Never call after setting DOC.
  try{
    var s = localStorage.getItem('d454Design') || localStorage.getItem('kerfDesign'); // fallback: pre-rename work
    if (s){ var d = JSON.parse(s); if (d && d.stock) DOC = d; }
  }catch(e){}
  syncStockUI();
  tpRebuildAll();                                     // toolpaths come back as settings only
}

