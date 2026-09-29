/* ============================================================
   MACHINE AREA
   The machine's cutting area drawn around the material, like a guide but not selectable. Its size
   comes from 454 Control's saved work area (same site, same browser storage), a preset, or a custom
   size; where the material sits on the bed is part of the job (Job setup).
   ============================================================ */
function controlWorkArea(){
  try{
    var pr = JSON.parse(localStorage.getItem('454-control-profile') || 'null');
    if (pr && pr.view && pr.view.envW > 0 && pr.view.envD > 0) return {w: +pr.view.envW, h: +pr.view.envD};
  }catch(e){}
  return null;
}
function machineSize(){
  var m = UICFG.machine || {src: 'ctl'};
  if (m.src === 'ctl') return controlWorkArea();
  return m.w > 0 && m.h > 0 ? {w: m.w, h: m.h} : null;
}
function machineRect(){
  var sz = machineSize(); if (!sz) return null;
  var sr = stockRect(), st = DOC.stock, a = st.mAnchor || 'fl', ox = st.mOffX || 0, oy = st.mOffY || 0;
  var x0, y0;
  if (a === 'center'){ x0 = (sr.x0 + sr.x1) / 2 - sz.w / 2; y0 = (sr.y0 + sr.y1) / 2 - sz.h / 2; }
  else {
    x0 = (a === 'fl' || a === 'bl') ? sr.x0 - ox : sr.x1 + ox - sz.w;
    y0 = (a === 'fl' || a === 'fr') ? sr.y0 - oy : sr.y1 + oy - sz.h;
  }
  return {x0: x0, y0: y0, x1: x0 + sz.w, y1: y0 + sz.h, w: sz.w, h: sz.h};
}
function drawMachineArea(ctx){
  if (!UICFG.showMachine) return;
  var m = machineRect(); if (!m) return;
  var sr = stockRect(), tol = 0.01;
  var matOut = sr.x0 < m.x0 - tol || sr.x1 > m.x1 + tol || sr.y0 < m.y0 - tol || sr.y1 > m.y1 + tol;
  var partsOut = DOC.ents.some(function (e) {
    if (e.con || !entVisible(e)) return false;
    var b = entBBox(e);
    return b.x0 < m.x0 - tol || b.x1 > m.x1 + tol || b.y0 < m.y0 - tol || b.y1 > m.y1 + tol;
  });
  var col = matOut ? '#e06c5a' : (partsOut ? '#d98e3f' : '#6fa8dc');
  var a = w2s(m.x0, m.y1), b = w2s(m.x1, m.y0);
  ctx.save();
  ctx.strokeStyle = col; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.3; ctx.setLineDash([10, 6]);
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.font = '11px system-ui, sans-serif';
  var label = 'Machine cutting area ' + fmtDisp(m.w) + ' \u00d7 ' + fmtDisp(m.h) + ' ' + unitTag() +
              (matOut ? ' \u2014 the material doesn\u2019t fit' : partsOut ? ' \u2014 some shapes are outside it' : '');
  ctx.fillText(label, a.x + 6, a.y + 14);
  ctx.restore();
}
function jobMachToForm(){
  var m = UICFG.machine || {src: 'ctl'}, sel = document.getElementById('jobMach');
  sel.value = m.src === 'ctl' ? 'ctl' : (m.src === 'custom' ? 'custom' : m.w + ',' + m.h);
  if (sel.value !== (m.src === 'ctl' ? 'ctl' : m.src === 'custom' ? 'custom' : m.w + ',' + m.h)) sel.value = 'custom';
  document.getElementById('jobMachCustom').hidden = sel.value !== 'custom';
  document.getElementById('jobMW').value = m.w > 0 ? fmtDisp(m.w) : '';
  document.getElementById('jobMH').value = m.h > 0 ? fmtDisp(m.h) : '';
  var cw = controlWorkArea();
  document.getElementById('jobMachNote').textContent = m.src === 'ctl'
    ? (cw ? '454 Control\u2019s work area: ' + fmtDisp(cw.w) + ' \u00d7 ' + fmtDisp(cw.h) + ' ' + unitTag() + '.'
          : 'No 454 Control work area found in this browser yet. Connect to the machine in 454 Control once, or pick the machine here.')
    : '';
  var st = DOC.stock;
  document.getElementById('jobMAnchor').value = st.mAnchor || 'fl';
  document.getElementById('jobMOffRow').hidden = (st.mAnchor || 'fl') === 'center';
  document.getElementById('jobMOffX').value = fmtDisp(st.mOffX || 0);
  document.getElementById('jobMOffY').value = fmtDisp(st.mOffY || 0);
  Array.prototype.forEach.call(document.querySelectorAll('.jobMU'), function (u) { u.textContent = unitTag(); });
}
function jobMachFromForm(){
  var v = document.getElementById('jobMach').value, m = UICFG.machine || {src: 'ctl'};
  if (v === 'ctl') m = {src: 'ctl'};
  else if (v === 'custom'){
    var w = lenIn(document.getElementById('jobMW').value), h = lenIn(document.getElementById('jobMH').value);
    m = {src: 'custom', w: w > 0 ? w : (m.w || 0), h: h > 0 ? h : (m.h || 0)};
  } else { var p = v.split(','); m = {src: 'preset', w: +p[0], h: +p[1]}; }
  UICFG.machine = m; uiCfgSave();
  var st = DOC.stock;
  st.mAnchor = document.getElementById('jobMAnchor').value;
  var ox = lenIn(document.getElementById('jobMOffX').value), oy = lenIn(document.getElementById('jobMOffY').value);
  st.mOffX = ox >= 0 ? ox : 0; st.mOffY = oy >= 0 ? oy : 0;
  persist(); jobMachToForm(); draw();
}
function machAreaToggle(){
  UICFG.showMachine = !UICFG.showMachine; uiCfgSave();
  machAreaBtnSync();
  if (UICFG.showMachine && !machineSize()){
    toast('info', 'Which machine?', 'Set the machine\u2019s cutting area in Job setup, or connect in 454 Control once so Design can read it.');
    if (typeof window.jobOpen === 'function') window.jobOpen();
  }
  draw();
}
function machAreaBtnSync(){
  var b = document.getElementById('machAreaBtn');
  if (b){ b.classList.toggle('active', !!UICFG.showMachine); b.setAttribute('aria-pressed', UICFG.showMachine ? 'true' : 'false'); }
}
