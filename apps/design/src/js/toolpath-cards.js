// A toolpath described in plain words, as [label, value] rows: on its card, and on the job sheet.
function tpRows(tp){
  var rows = [];
  function row(k, v){ rows.push([k, v]); }
    var dTxt = tp.through ? 'through ' + fmtDisp(DOC.stock.t || 0) + ' + ' + fmtDisp(tp.over) + ' ' + unitTag() : fmtDisp(tpDepth(tp)) + ' ' + unitTag();
  if (tp.side === 'chamfer') row('Depth', 'tip ' + fmtDisp(tpDepth(tp)) + ' ' + unitTag() + ' in ' + Math.ceil(tpDepth(tp) / tp.step) + ' passes');
  else if (tp.side === 'drill') row('Depth', dTxt + (tp.peck > 0 ? ', pecking ' + fmtDisp(tp.peck) : ', one plunge'));
  else row('Depth', dTxt + tpExprSay(tp, 'depth') + ' in ' + Math.ceil(tpDepth(tp) / tp.step) + ' passes');
  if (tp.through && !(DOC.stock.t > 0)) row('Note', 'set the material thickness in Settings');
  var tabN = tp.tabsOn ? tpTabTotal(tp) : 0;
  if (tp.side === 'drill') row('Holes', String(tp.holes ? tp.holes.length : 0));
  else if (tp.side === 'vcarve') row('Carve', (tp.vAngle || 60) + '\u00b0 bit, ' + fmtDisp(tp.vcDepth || 0) + ' ' + unitTag() + ' deep at most' + (tp.vcMax > 0 ? ' (capped)' : ''));
  else if (tp.side === 'chamfer') row('Bevel', fmtDisp(tp.chamW) + ' ' + unitTag() + ' wide, ' + (tp.vAngle || 90) + '\u00b0 bit');
  else if (tp.side === 'pocket' && tpRestSource(tp)) row('Clearing', 'only what \u201c' + tpRestSource(tp).name + '\u201d left: its corners and narrow parts');
  else if (tp.side === 'pocket') row('Clearing', (tp.pocketClear === 'raster' ? 'raster at ' + (tp.rasterAngle || 0) + '\u00b0, ' : 'offset rings, ') + (tp.stepoverPct || 40) + '% stepover' + (tp.islands ? ' \u00b7 ' + tp.islands + (tp.islands === 1 ? ' island' : ' islands') : ''));
  else row('Shapes', tp.ents.length + (tp.tabsOn ? ' \u00b7 ' + tabN + (tp.tabStyle === '3d' ? ' 3D' : '') + (tabN === 1 ? ' tab' : ' tabs') : ' \u00b7 no tabs'));
  if (tp.side === 'pocket' || tp.side === 'inside' || tp.side === 'outside' || tp.side === 'on')
    row('Entry', tp.rampOff ? 'straight plunge' : 'ramps in over ' + fmtDisp(tpRamp(tp)) + ' ' + unitTag());
  if (tp.warning) row('Note', tp.warning);
  if (tpExprProblem(tp)) row('⚠ Parameters', tpExprProblem(tp) + '. It can’t be saved as G-code until that’s put right');
  if (tpPastNow(tp)) row('⚠ Depth', tpPastSay(tp));
  else if (tpDepthUnchecked() && !tp.through) row('Note', 'the depth isn’t checked against the material: set its thickness in Settings');
  return rows;
}
// What kind of toolpath it is, in words
function tpKindName(tp){
  return tp.side === 'vcarve' ? 'V-carve' : tp.side === 'chamfer' ? 'Chamfer' : tp.side === 'pocket' ? 'Pocket' : tp.side === 'drill' ? 'Drilling'
       : tp.side === 'inside' ? 'Profile, inside' : tp.side === 'on' ? 'Profile, on the line' : 'Profile, outside';
}
function renderMyToolpaths(){
  var box = document.getElementById('tpList');
  var all = tpList();
  all.forEach(function (tp, idx) {
    if (multiSheet() && tpSheetOf(tp) !== DOC.activeSheet) return;   // other sheets' toolpaths: shown with their sheet
    var stale = tpStale(tp);
    var card = document.createElement('div');
    card.className = 'tpCard tpMine' + (stale || !tpToolChosen(tp) ? ' tpStale' : '') + (tp.exclude ? ' tpExcluded' : '');
    card.dataset.idx = idx;
    var h = document.createElement('div'); h.className = 'tpName';
    // include in the saved G-code
    var inc = document.createElement('input'); inc.type = 'checkbox'; inc.className = 'tpInc';
    inc.checked = !tp.exclude;
    inc.title = tp.exclude ? 'Left out of the saved G-code \u2014 tick to include it' : 'Included in the saved G-code \u2014 untick to leave it out';
    inc.setAttribute('aria-label', 'Include ' + tp.name + ' when saving G-code');
    inc.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inc.addEventListener('change', function () { tp.exclude = !inc.checked; persist(); renderToolpathPanel(); draw(); });
    // a handle to drag by: dragging the whole card makes the tick box and eye unreliable to click
    var grip = document.createElement('span'); grip.className = 'tpGrip'; grip.draggable = true;
    grip.textContent = '\u2807'; grip.title = 'Drag to change the order';
    grip.setAttribute('aria-hidden', 'true');
    grip.addEventListener('click', function (ev) { ev.stopPropagation(); });
    grip.addEventListener('dragstart', function (e) {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      card.classList.add('tpDragging');
    });
    grip.addEventListener('dragend', function () { card.classList.remove('tpDragging'); });
    h.appendChild(grip);
    h.appendChild(inc);
    var num = document.createElement('span'); num.className = 'tpNum'; num.textContent = (idx + 1) + '';
    num.title = 'Runs ' + (idx === 0 ? 'first' : 'number ' + (idx + 1));
    h.appendChild(num);
    var nm = document.createElement('span'); nm.className = 'tpNm'; nm.textContent = tp.name;
    h.appendChild(nm);
    // show or hide on the drawing
    var eye = document.createElement('button'); eye.className = 'tpEye' + (tp.hidden ? ' off' : '');
    eye.innerHTML = tp.hidden
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><path d="M2.5 13.5l11-11"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>';
    eye.title = tp.hidden ? 'Hidden on the drawing \u2014 click to show' : 'Shown on the drawing \u2014 click to hide';
    eye.setAttribute('aria-label', (tp.hidden ? 'Show ' : 'Hide ') + tp.name);
    eye.setAttribute('aria-pressed', tp.hidden ? 'false' : 'true');
    eye.addEventListener('click', function (ev) { ev.stopPropagation(); tp.hidden = !tp.hidden; persist(); renderToolpathPanel(); draw(); });
    h.appendChild(eye);
    var ty = document.createElement('span'); ty.className = 'tpType';
    ty.textContent = !tpToolChosen(tp) ? 'no tool chosen' : stale ? 'the drawing changed' : (tp.side === 'vcarve' ? 'V-carve' : tp.side === 'chamfer' ? 'chamfer' : tp.side === 'pocket' ? 'pocket' : tp.side === 'drill' ? 'drilling' : tp.side === 'inside' ? 'inside' : tp.side === 'on' ? 'on the line' : 'outside');
    h.appendChild(ty); card.appendChild(h);

    var tl = document.createElement('div'); tl.className = 'tpTool';
    var t = tp.toolId ? libTool(tp.toolId) : null;
    tl.textContent = (t ? t.name : fmtDisp(tp.dia) + ' ' + unitTag() + ' cutter') + ' \u00b7 ' + tp.feed + ' mm/min';
    card.appendChild(tl);

    var dl = document.createElement('dl'); dl.className = 'tpSet';
    function row(k, v){ var dt = document.createElement('dt'); dt.textContent = k; var dd = document.createElement('dd'); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); }
    tpRows(tp).forEach(function (r) { row(r[0], r[1]); });          // the same description the job sheet uses
    card.appendChild(dl);
    var orderNote = tpOrderNote(tp, idx);
    if (orderNote){
      var on = document.createElement('div'); on.className = 'tpOrderNote';
      on.textContent = '\u26a0 ' + orderNote;
      card.appendChild(on);
    }

    var bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    function btn(icon, title, label, fn){
      var b = document.createElement('button');
      b.className = 'tpIcon'; b.innerHTML = TP_ICONS[icon]; b.title = title; b.setAttribute('aria-label', label);
      b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
      return b;
    }
    var up = btn('up', 'Run earlier', 'Move ' + tp.name + ' earlier', function () { tpMoveTo(idx, idx - 1); });
    var dn = btn('down', 'Run later', 'Move ' + tp.name + ' later', function () { tpMoveTo(idx, idx + 1); });
    up.disabled = idx === 0; dn.disabled = idx === all.length - 1;
    bar.appendChild(up); bar.appendChild(dn);
    var gap = document.createElement('span'); gap.style.flex = '1'; bar.appendChild(gap);
    var rc = btn('regen', stale ? 'Out of date: recalculate this toolpath from its shapes and the material as they are now'
                                : 'Recalculate this toolpath from its shapes and the material as they are now, with its own settings',
                 'Recalculate ' + tp.name, function () { tpRecalc(tp); });
    if (stale) rc.classList.add('stale');
    bar.appendChild(rc);
    bar.appendChild(btn('edit', 'Edit this toolpath', 'Edit ' + tp.name, function () { setTool('select'); cutOpen(tp); }));
    var del = btn('del', 'Delete this toolpath', 'Delete ' + tp.name, function () { tpDelete(tp.id); });
    del.classList.add('danger'); bar.appendChild(del);
    card.appendChild(bar);

    card.addEventListener('click', function () { CUTSEL = CUTSEL === tp.id ? null : tp.id; renderToolpathPanel(); draw(); });
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      ctxMenuOpen(e.clientX, e.clientY, [
        {label: stale ? 'Recalculate (out of date)' : 'Recalculate', fn: function () { tpRecalc(tp); }},
        {label: 'Edit\u2026', fn: function () { setTool('select'); cutOpen(tp); }},
        null,
        {label: tp.hidden ? 'Show on the drawing' : 'Hide on the drawing', fn: function () { tp.hidden = !tp.hidden; persist(); renderToolpathPanel(); draw(); }},
        {label: tp.exclude ? 'Include in the G-code' : 'Leave out of the G-code', fn: function () { tp.exclude = !tp.exclude; persist(); renderToolpathPanel(); }},
        null,
        {label: 'Run earlier', disabled: idx === 0, fn: function () { tpMoveTo(idx, idx - 1); }},
        {label: 'Run later', disabled: idx === all.length - 1, fn: function () { tpMoveTo(idx, idx + 1); }},
        null,
        {label: 'Delete', danger: true, fn: function () { tpDelete(tp.id); }}
      ]);
    });
    // drag a card onto another to move it there
    card.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('tpDropOver'); });
    card.addEventListener('dragleave', function () { card.classList.remove('tpDropOver'); });
    card.addEventListener('drop', function (e) {
      e.preventDefault(); card.classList.remove('tpDropOver');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(from)) tpMoveTo(from, idx);
    });
    if (CUTSEL === tp.id) card.style.background = 'var(--accent-faint)';
    box.appendChild(card);
  });
  var onSheet = multiSheet() ? tpList().filter(function (t2) { return tpSheetOf(t2) === DOC.activeSheet; }) : tpList();
  var sheetName = multiSheet() ? layerById(DOC.activeSheet).name : '';
  if (camReady() && multiSheet() && !onSheet.length){
    var none = document.createElement('div');
    none.className = 'tpEmptySheet';
    none.style.cssText = 'padding:10px 14px;font-size:12.5px;color:var(--muted);line-height:1.5';
    none.textContent = 'No toolpaths on ' + sheetName + ' yet. Select its shapes and press + to make one.';
    box.appendChild(none);
  }
  if (camReady() && onSheet.length){
    var ex = document.createElement('button');
    var nInc = onSheet.filter(function (t2) { return !t2.exclude; }).length;
    ex.textContent = (nInc === onSheet.length ? 'Save G-code' : 'Save ' + nInc + ' of ' + onSheet.length) + (sheetName ? ' for ' + sheetName : '') + '\u2026';
    ex.disabled = nInc === 0;
    ex.className = 'primary';
    ex.title = 'Choose where to save the G-code and what to call it';
    ex.style.cssText = 'width:calc(100% - 20px);margin:4px 10px 10px';
    ex.addEventListener('click', tpExport);
    box.appendChild(ex);
    var wd = document.createElement('button');
    wd.textContent = 'Preview in wood';
    wd.title = 'See the material as it will look after these toolpaths, cut by each bit\u2019s real shape';
    wd.style.cssText = 'width:calc(100% - 20px);margin:0 10px 10px';
    wd.disabled = nInc === 0;
    wd.addEventListener('click', woodPreviewOpen);
    box.appendChild(wd);
    var pv = document.createElement('button');
    pv.textContent = 'Preview in 454 Control';
    pv.title = 'Load exactly this G-code into 454 Control: its 3D preview and playback, time estimate and checks. Nothing is sent to the machine.';
    pv.style.cssText = 'width:calc(100% - 20px);margin:0 10px 10px';
    pv.disabled = nInc === 0;
    pv.addEventListener('click', tpPreview);
    box.appendChild(pv);
    var js = document.createElement('button');
    js.textContent = 'Job sheet' + (sheetName ? ' for ' + sheetName : '') + '\u2026';
    js.title = 'Everything about the job on one printable page: material, setup, tools, toolpaths and times';
    js.style.cssText = 'width:calc(100% - 20px);margin:0 10px 10px';
    js.disabled = nInc === 0;
    js.addEventListener('click', jobSheetOpen);
    box.appendChild(js);
  }
}

