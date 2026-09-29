// ---- the editor ----
// A toolpath's tool was chosen if it says so, or if it names a library tool: picking from the
// library is always deliberate. Only toolpaths with neither (the old silent 1/8" default) need one.
function tpToolChosen(tp){ return !!(tp && (tp.toolChosen || tp.toolId)); }
function cutOpen(existing){
  if (!camReady()){
    toast('info', 'The CAM engine isn\u2019t loaded', 'geom.js and cam.js need to sit beside design.html. Without them the panel only shows toolpaths read from a VCarve project.');
    return;
  }
  var picked = SEL.filter(function (i) { return DOC.ents[i] && !DOC.ents[i].con && !DOC.ents[i].tp; });
  // Every setting the editor shows, so a toolpath saved by an older version (missing some of these)
  // opens cleanly instead of breaking the form.
  var CUT_DEFAULTS = {side: 'outside', depth: 3, step: 1, feed: 800, plunge: 300, tabsOn: false, tabCount: 4, tabLen: 4, tabThk: 0.5, tabStyle: 'flat',
                      tabPts: {}, toolId: null, stepoverPct: 40, chamW: 1, vAngle: 90, chamMode: 'edge', peck: 0, over: 0.2, through: false};
  CUT = existing
    ? Object.assign({}, CUT_DEFAULTS, existing, {ents: existing.ents.slice(), editing: existing.id})
    : {ents: picked.map(function (i) { return entId(DOC.ents[i]); }),
       side: 'outside', dia: null, depth: 3, step: 1, feed: 800, plunge: 300,
       tabsOn: false, tabCount: 4, tabLen: 4, tabThk: 0.5, tabPts: {}, toolId: null, editing: null, stepoverPct: 40,
       chamW: 1, vAngle: 90,
       through: false, depth: null, over: 0.2};
  if (existing){ CUT.tabPts = JSON.parse(JSON.stringify(existing.tabPts || {})); CUT.toolChosen = tpToolChosen(existing); }
  // The tool sets every dimension of the cut, so every toolpath has its tool chosen for it: never
  // defaulted, never carried over from another toolpath. Until then there is no tool, and a toolpath
  // without one can't be created or saved as G-code.
  if (!existing){ CUT.dia = null; CUT.toolId = null; CUT.toolChosen = false; }
  if (CUT.tabsOn === undefined) CUT.tabsOn = CUT.tabCount > 0;
  CUT.placing = false;
  document.getElementById('cutTitle').textContent = existing ? 'Edit toolpath' : 'New toolpath';
  document.getElementById('cutOk').textContent = existing ? 'Update' : 'Create';
  cutFillTools();
  cutToForm();
  document.getElementById('cutPanel').hidden = false;
  cutRender();
}
function cutClose(){ CUT = null; document.getElementById('cutPanel').hidden = true; draw(); }
function cutFillTools(){                             // show the chosen tool's name on the button
  var t = CUT && CUT.toolId ? libTool(CUT.toolId) : null;
  var mid = TOOLLIB ? libDefaultMachine() : null;
  document.getElementById('cutToolName').textContent = t
    ? (t.numbers && t.numbers[mid] !== undefined ? 'T' + t.numbers[mid] + ' ' : '') + t.name
    : !(CUT && CUT.dia > 0 && CUT.toolChosen) ? 'Choose a tool'
    : fmtDisp(CUT.dia) + ' ' + unitTag() + ' cutter (set by hand)';
}
// Take diameter, feed and stepdown from the library when a tool is chosen.
function cutUseTool(id){
  CUT.toolId = id || null;
  if (id){                                                   // remembered for the Recently used folder
    UICFG.recentTools = [id].concat((UICFG.recentTools || []).filter(function (x) { return x !== id; })).slice(0, 6);
    uiCfgSave();
  }
  CUT.toolChosen = !!id;
  var t = id ? libTool(id) : null;
  if (!t) return;
  var mm = t.units === 'in' ? 25.4 : 1;
  if (t.diameter) CUT.dia = +(t.diameter * mm).toFixed(3);
  if (t.angle > 0 && t.angle < 180) CUT.vAngle = t.angle;               // a V-bit's included angle
  CUT.vTip = t.flat > 0 ? +(t.flat * mm).toFixed(4) : 0;                // and its flat tip, if any
  var cut = libCutFor(t, libDefaultMachine(), UICFG.libMaterial || null) ||
            t.cuts.filter(function (c) { return c.machine === libDefaultMachine(); })[0] || t.cuts[0];
  if (cut){
    var rate = cut.rateUnits === 4 ? 25.4 : 1;                 // in/min -> mm/min
    var len = cut.lengthUnits === 'in' ? 25.4 : 1;
    if (cut.feed) CUT.feed = Math.round(cut.feed * rate);
    if (cut.plunge) CUT.plunge = Math.round(cut.plunge * rate);
    if (cut.stepdown) CUT.step = +(cut.stepdown * len).toFixed(3);
    if (cut.stepover && CUT.dia > 0) CUT.stepoverPct = Math.max(5, Math.min(95, Math.round(cut.stepover * len / CUT.dia * 100)));
    if (cut.rpm) CUT.rpm = cut.rpm;
  }
  cutFillTools(); cutToForm(); cutRender();
}
function cutToForm(){
  document.getElementById('cutType').value = CUT.side;
  document.getElementById('cutDia').value = CUT.dia > 0 ? fmtDisp(CUT.dia) : '';
  document.getElementById('cutDia').placeholder = 'choose';
  document.getElementById('cutDepth').value = CUT.through ? fmtDisp(tpDepth(CUT)) : (CUT.depth > 0 ? fmtDisp(CUT.depth) : '');
  document.getElementById('cutDepth').placeholder = 'depth';
  document.getElementById('cutThrough').checked = !!CUT.through;
  document.getElementById('cutOver').value = fmtDisp(CUT.over === undefined ? 0.2 : CUT.over);
  document.getElementById('cutStep').value = fmtDisp(CUT.step);
  document.getElementById('cutPeck').value = fmtDisp(CUT.peck || 0);
  document.getElementById('cutStepover').value = CUT.stepoverPct || 40;
  document.getElementById('cutClear').value = CUT.pocketClear === 'raster' ? 'raster' : 'offset';
  document.getElementById('cutDir').value = CUT.climb === false ? 'conv' : 'climb';
  document.getElementById('cutLead').value = CUT.leadType || 'none';
  document.getElementById('cutLeadSize').value = fmtDisp(CUT.leadSize > 0 ? CUT.leadSize : (CUT.dia > 0 ? CUT.dia : 3));
  document.getElementById('cutAllow').value = CUT.allowance > 0 ? fmtDisp(CUT.allowance) : '';
  document.getElementById('cutFinPass').checked = CUT.allowance > 0 ? !!CUT.finishPass : true;
  document.getElementById('cutRasterAng').value = CUT.rasterAngle || 0;
  document.getElementById('cutChamW').value = fmtDisp(CUT.chamW || 1);
  document.getElementById('cutVAngle').value = CUT.vAngle || 90;
  document.getElementById('cutChamMode').value = CUT.chamMode || 'edge';
  document.getElementById('cutVcAngle').value = CUT.vAngle || 60;
  document.getElementById('cutVcMax').value = CUT.vcMax > 0 ? fmtDisp(CUT.vcMax) : '';
  document.getElementById('cutVcTip').value = fmtDisp(CUT.vTip || 0);
  document.getElementById('cutInlayHalf').value = CUT.inlayHalf === 'plug' ? 'plug' : 'pocket';
  document.getElementById('cutInlayD').value = fmtDisp(CUT.inlayD > 0 ? CUT.inlayD : 5);
  document.getElementById('cutInlayS').value = fmtDisp(CUT.inlayS > 0 ? CUT.inlayS : 2.5);
  document.getElementById('cutInlayM').value = fmtDisp(CUT.inlayM > 0 ? CUT.inlayM : 5);
  document.getElementById('cutFeed').value = CUT.side === 'drill' ? (CUT.plunge || CUT.feed) : CUT.feed;
  document.getElementById('cutTabs').value = CUT.tabCount;
  document.getElementById('cutTabsOn').checked = !!CUT.tabsOn;
  document.getElementById('cutTabLen').value = fmtDisp(CUT.tabLen);
  document.getElementById('cutTabThk').value = fmtDisp(CUT.tabThk);
  document.getElementById('cutTabStyle').value = CUT.tabStyle === '3d' ? '3d' : 'flat';
  cutTabShapeFollows();
  document.getElementById('cutUnit').textContent = unitTag();
}
function cutFromForm(){
  CUT.side = document.getElementById('cutType').value;
  var d = lenIn(document.getElementById('cutDia').value); if (d > 0) CUT.dia = d;
  CUT.through = document.getElementById('cutThrough').checked;
  if (!CUT.through){ var dep = lenIn(document.getElementById('cutDepth').value); if (dep > 0) CUT.depth = dep; }
  var ov = lenIn(document.getElementById('cutOver').value); if (!isNaN(ov) && ov >= 0) CUT.over = ov;
  var st = lenIn(document.getElementById('cutStep').value); if (st > 0) CUT.step = st;
  var f = parseFloat(document.getElementById('cutFeed').value);
  if (f > 0){ if (CUT.side === 'drill') CUT.plunge = f; else CUT.feed = f; }
  var pk = lenIn(document.getElementById('cutPeck').value); if (!isNaN(pk) && pk >= 0) CUT.peck = pk;
  var so2 = parseFloat(document.getElementById('cutStepover').value); if (so2 > 0) CUT.stepoverPct = Math.max(5, Math.min(95, so2));
  CUT.pocketClear = document.getElementById('cutClear').value;
  CUT.climb = document.getElementById('cutDir').value !== 'conv';
  CUT.leadType = document.getElementById('cutLead').value;
  var lsz = lenIn(document.getElementById('cutLeadSize').value); if (lsz > 0) CUT.leadSize = lsz;
  var al = document.getElementById('cutAllow').value.trim(); CUT.allowance = al === '' ? 0 : Math.max(0, lenIn(al) || 0);
  CUT.finishPass = document.getElementById('cutFinPass').checked;
  var ra = parseFloat(document.getElementById('cutRasterAng').value); CUT.rasterAngle = isFinite(ra) ? ((ra % 180) + 180) % 180 : 0;
  var cw = lenIn(document.getElementById('cutChamW').value); if (cw > 0) CUT.chamW = cw;
  var va = parseFloat(document.getElementById('cutVAngle').value); if (va > 5 && va < 175) CUT.vAngle = va;
  CUT.chamMode = document.getElementById('cutChamMode').value;
  if (CUT.side === 'inlay'){
    CUT.inlayHalf = document.getElementById('cutInlayHalf').value;
    var iD = lenIn(document.getElementById('cutInlayD').value); if (iD > 0) CUT.inlayD = iD;
    var iS = lenIn(document.getElementById('cutInlayS').value); if (iS > 0) CUT.inlayS = iS;
    var iM = lenIn(document.getElementById('cutInlayM').value); if (iM > 0) CUT.inlayM = iM;
  }
  if (CUT.side === 'vcarve' || CUT.side === 'inlay'){
    var vva = parseFloat(document.getElementById('cutVcAngle').value); if (vva > 5 && vva < 175) CUT.vAngle = vva;
    var vmx = document.getElementById('cutVcMax').value.trim(); CUT.vcMax = vmx === '' ? 0 : Math.max(0, lenIn(vmx) || 0);
    var vtp = lenIn(document.getElementById('cutVcTip').value); if (vtp >= 0) CUT.vTip = vtp;
  }
  CUT.tabsOn = document.getElementById('cutTabsOn').checked;
  var tb = parseInt(document.getElementById('cutTabs').value, 10); if (tb > 0) CUT.tabCount = Math.min(20, tb);
  var tl = lenIn(document.getElementById('cutTabLen').value); if (tl > 0) CUT.tabLen = tl;
  var tt = lenIn(document.getElementById('cutTabThk').value); if (tt > 0) CUT.tabThk = tt;
  CUT.tabStyle = document.getElementById('cutTabStyle').value === '3d' ? '3d' : 'flat';
}
function cutRenderHintExtra(){
  var h = document.getElementById('cutHint');
  if (h && cutRender.extra && h.textContent.indexOf(cutRender.extra.trim()) < 0 && h.textContent.charAt(0) !== '\u26a0') h.textContent += cutRender.extra;
}
function cutRender(){ cutRenderInner(); cutRenderHintExtra(); }   // every hint also says how the walls are finished
function cutRenderInner(){
  if (!CUT) return;
  document.getElementById('cutShapesVal').textContent = CUT.ents.length
    ? CUT.ents.length + (CUT.ents.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('cutShapes').setAttribute('aria-pressed', 'true');
  var inlaying = CUT.side === 'inlay';
  var drilling = CUT.side === 'drill', pocketing = CUT.side === 'pocket', chamfering = CUT.side === 'chamfer', vcarving = CUT.side === 'vcarve' || inlaying;
  document.getElementById('cutInlayRow').hidden = !inlaying;
  document.getElementById('cutInlayPlugBits').style.display = CUT.inlayHalf === 'plug' ? '' : 'none';
  document.getElementById('cutVcMax').hidden = inlaying; document.getElementById('cutVcMaxLbl').hidden = inlaying;
  document.getElementById('cutVcRow').hidden = !vcarving;
  document.getElementById('cutDirRow').hidden = drilling || vcarving;
  document.getElementById('cutFinRow').hidden = !(pocketing || CUT.side === 'inside' || CUT.side === 'outside');
  document.getElementById('cutLeadRow').hidden = !(CUT.side === 'inside' || CUT.side === 'outside');
  document.getElementById('cutLeadU').textContent = unitTag();
  document.getElementById('cutLeadSize').style.display = CUT.leadType && CUT.leadType !== 'none' ? '' : 'none';
  document.getElementById('cutLeadU').style.display = CUT.leadType && CUT.leadType !== 'none' ? '' : 'none';
  document.getElementById('cutAllowU').textContent = unitTag();
  if (vcarving){ CUT.through = false; CUT.placing = false; }
  document.getElementById('cutChamRow').hidden = !chamfering;
  document.getElementById('cutChamModeRow').hidden = !chamfering;
  document.getElementById('cutThroughLbl').style.display = chamfering || vcarving ? 'none' : '';
  if (chamfering){ CUT.through = false; CUT.placing = false; }
  document.getElementById('cutOverlapRow').hidden = !pocketing;
  document.getElementById('cutClearRow').hidden = !pocketing;
  document.getElementById('cutRasterBits').style.display = CUT.pocketClear === 'raster' ? '' : 'none';
  if (pocketing){ CUT.placing = false; document.getElementById('cutTabRow').hidden = true; document.getElementById('cutTabSize').hidden = true; document.getElementById('cutTabTools').hidden = true; }
  var dEl = document.getElementById('cutDepth');
  dEl.disabled = !!CUT.through;
  document.getElementById('cutOverRow').hidden = !CUT.through;
  if (CUT.through) dEl.value = fmtDisp(tpDepth(CUT));
  else if (!(CUT.depth > 0) && document.activeElement !== dEl) dEl.value = '';
  var noThk = CUT.through && !(DOC.stock.t > 0);
  document.getElementById('cutStepRow').hidden = drilling;
  document.getElementById('cutPeckRow').hidden = !drilling;
  document.getElementById('cutTabRow').hidden = drilling || pocketing || chamfering || vcarving;
  document.getElementById('cutFeedLbl').textContent = drilling ? 'Plunge' : 'Feed';
  if (drilling){ CUT.placing = false; }
  var loops = drilling ? tpDrillPoints(CUT.ents) : tpOutlines(CUT.ents);
  cutFillTools();                                        // the tool label follows a typed diameter
  var depthSet = CUT.side === 'chamfer' || CUT.side === 'vcarve' || CUT.side === 'inlay' || CUT.through || CUT.depth > 0;
  var ok = loops.length > 0 && CUT.dia > 0 && !!CUT.toolChosen && depthSet;
  cutRender.extra = (CUT.allowance > 0 && (pocketing || CUT.side === 'inside' || CUT.side === 'outside'))
    ? (CUT.finishPass ? ' Roughs leaving ' + fmtDisp(CUT.allowance) + ' ' + unitTag() + ', then one finishing pass at full depth.'
                      : ' Leaves ' + fmtDisp(CUT.allowance) + ' ' + unitTag() + ' on the walls, for finishing with another toolpath.')
    : '';
  if (CUT.climb === false && !drilling && !vcarving) cutRender.extra += ' Conventional milling.';
  if ((CUT.side === 'inside' || CUT.side === 'outside') && CUT.leadType && CUT.leadType !== 'none')
    cutRender.extra += (CUT.allowance > 0 && CUT.finishPass)
      ? ' The finishing pass leads onto and off the line (' + (CUT.leadType === 'arc' ? 'arc' : 'line') + '); roughing passes ramp in and lead off.'
      : ' ' + (CUT.leadType === 'arc' ? 'Arc' : 'Line') + ' lead off the line at the end; the passes ramp in, so they need no lead-in.';
  document.getElementById('cutOk').disabled = !ok;
  if (CUT.dia > 0 && CUT.toolChosen && !depthSet){
    CUT.preview = []; CUT.previewHoles = null;
    document.getElementById('cutHint').textContent = 'Set the depth: type it, or tick \u201cthrough\u201d to cut right through the material.';
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  if (!(CUT.dia > 0) || !CUT.toolChosen){
    CUT.preview = []; CUT.previewHoles = null;
    document.getElementById('cutHint').textContent = 'Choose the tool first: pick it from the library, or type its diameter. It sets the size of everything this cuts.';
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  var nTabs = CUT.tabsOn ? tpTabTotal(CUT) : 0;
  document.getElementById('cutTabSize').hidden = !CUT.tabsOn;
  document.getElementById('cutTabTools').hidden = !(CUT.tabsOn && CUT.placing);
  document.getElementById('cutTabCount').textContent = CUT.tabsOn ? (nTabs ? nTabs + ' placed' : 'none yet') : '';
  document.getElementById('cutTabPlace').disabled = !CUT.tabsOn || !ok;
  document.getElementById('cutTabPlace').textContent = CUT.placing ? 'Done' : 'Edit tabs';
  document.getElementById('cutTabPlace').setAttribute('aria-pressed', CUT.placing ? 'true' : 'false');
  document.getElementById('cutShapes').setAttribute('aria-pressed', CUT.placing ? 'false' : 'true');
  if (drilling){
    document.getElementById('cutTabSize').hidden = true;
    document.getElementById('cutTabTools').hidden = true;
    var sizes = {}, off = 0;
    loops.forEach(function (h) {
      var k = fmtDisp(h.dia); sizes[k] = (sizes[k] || 0) + 1;
      if (Math.abs(h.dia - CUT.dia) > 0.1) off++;
    });
    var sizeTxt = Object.keys(sizes).map(function (k) { return sizes[k] + ' \u00d7 ' + k; }).join(', ');
    document.getElementById('cutHint').textContent = !CUT.ents.length
      ? 'Click the circles to drill. Each is drilled at its centre.'
      : noThk ? '\u26a0 Set the material thickness in Settings before drilling through \u2014 until then this drills only the overcut.'
      : (loops.length + (loops.length === 1 ? ' hole' : ' holes') + ' (' + sizeTxt + ' ' + unitTag() + '), ' +
         (CUT.through ? 'through ' + fmtDisp(DOC.stock.t || 0) + ' ' + unitTag() + ' + ' + fmtDisp(CUT.over) : fmtDisp(CUT.depth) + ' ' + unitTag() + ' deep') +
         (CUT.peck > 0 ? ', pecking every ' + fmtDisp(CUT.peck) : ', one plunge each') + '.' +
         (off ? ' \u26a0 ' + off + (off === 1 ? ' hole doesn\u2019t' : ' holes don\u2019t') + ' match the ' + fmtDisp(CUT.dia) + ' ' + unitTag() + ' drill.' : ''));
    CUT.preview = ok ? tpGenerate(Object.assign({}, CUT, {ents: CUT.ents})).moves : [];
    CUT.previewHoles = ok ? loops.map(function (h) { return h.p; }) : [];
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    cutIssuesRender();
    draw();
    return;
  }
  CUT.previewHoles = null;
  cutIssuesRender();
  if (chamfering){
    document.getElementById('cutTabSize').hidden = true; document.getElementById('cutTabTools').hidden = true;
    var cdp = tpChamferDepth(CUT);
    dEl.disabled = true; dEl.value = fmtDisp(cdp);
    if (ok){
      var pvc = tpGenerate(Object.assign({}, CUT, {ents: CUT.ents}));
      CUT.preview = pvc.moves;
      CUT.chamBand = tpOutlines(CUT.ents);
      var np = Math.ceil(cdp / CUT.step);
      document.getElementById('cutHint').textContent = pvc.warning
        ? '\u26a0 ' + pvc.warning.charAt(0).toUpperCase() + pvc.warning.slice(1) + '.'
        : (CUT.chamMode === 'in' || CUT.chamMode === 'out')
          ? 'A ' + fmtDisp(CUT.chamW) + ' ' + unitTag() + ' bevel with its top edge on the line, going ' + (CUT.chamMode === 'in' ? 'inside' : 'outside') +
            ': the tip runs ' + fmtDisp(CUT.chamW) + ' ' + unitTag() + ' ' + (CUT.chamMode === 'in' ? 'in' : 'out') + ' from it, ' + fmtDisp(cdp) + ' ' + unitTag() + ' deep, in ' + np + (np === 1 ? ' pass.' : ' passes.')
          : 'A ' + fmtDisp(CUT.chamW) + ' ' + unitTag() + ' bevel: the ' + (CUT.vAngle || 90) + '\u00b0 bit\u2019s tip runs along the edge ' +
            fmtDisp(cdp) + ' ' + unitTag() + ' deep, in ' + np + (np === 1 ? ' pass' : ' passes') + '. Its other side cuts into the waste.';
    } else {
      CUT.preview = []; CUT.chamBand = null;
      document.getElementById('cutHint').textContent = 'Click the edges to bevel: the part\u2019s outline, holes, slots.';
    }
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  CUT.chamBand = null;
  if (inlaying){
    document.getElementById('cutTabSize').hidden = true; document.getElementById('cutTabTools').hidden = true;
    var dEi = document.getElementById('cutDepth'); dEi.disabled = true;
    var iD2 = CUT.inlayD > 0 ? CUT.inlayD : 5, iS2 = CUT.inlayS > 0 ? CUT.inlayS : 2.5, iM2 = CUT.inlayM > 0 ? CUT.inlayM : 5;
    var libV = CUT.toolId ? libTool(CUT.toolId) : null;
    dEi.value = fmtDisp(CUT.inlayHalf === 'plug' ? iM2 : iD2);
    CUT.preview = [];
    document.getElementById('cutHint').textContent = !ok ? 'Click the shapes to inlay: text, a traced logo, or closed outlines.'
      : libV && !(libV.angle > 0) ? '\u26a0 Inlays need a V-bit: this tool has no angle.'
      : CUT.inlayHalf === 'plug'
        ? (iM2 <= iS2 ? '\u26a0 The plug depth must be more than the start depth, or the plug won\u2019t stand proud.'
           : 'Plug: a mirrored copy and a boundary go on an \u201cInlay plug\u201d layer beside the design, then a V-carve starting ' + fmtDisp(iS2) + ' ' + unitTag() +
             ' down to ' + fmtDisp(iM2) + ' ' + unitTag() + ', and a clearing pocket (choose its end mill). Flipped into a ' + fmtDisp(iD2) + ' ' + unitTag() + ' pocket, it seats ' +
             fmtDisp(iS2) + ' ' + unitTag() + ' deep, leaves ' + fmtDisp(Math.max(0, iD2 - iS2)) + ' ' + unitTag() + ' for glue under it, and stands ' + fmtDisp(iM2 - iS2) + ' ' + unitTag() + ' proud to plane off.' +
             ' Trim the inlay piece to the boundary before gluing: stock left outside it would hit the base and stop the plug seating.')
        : 'Pocket: a V-carve to a ' + fmtDisp(iD2) + ' ' + unitTag() + ' flat floor, and a clearing pocket for the floor (choose its end mill). Cut the plug with the same V-bit.';
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  if (vcarving){
    document.getElementById('cutTabSize').hidden = true; document.getElementById('cutTabTools').hidden = true;
    var dEv = document.getElementById('cutDepth'); dEv.disabled = true;
    if (ok){
      var pvv = tpGenerate(Object.assign({}, CUT, {ents: CUT.ents}));
      CUT.preview = pvv.moves; dEv.value = fmtDisp(pvv.vcDepth || 0);
      var nt = pvv.vcNote, lib = CUT.toolId ? libTool(CUT.toolId) : null;
      var notV = lib && !(lib.angle > 0);
      document.getElementById('cutHint').textContent =
        notV ? '\u26a0 V-carving needs a V-bit: this tool has no angle.'
        : pvv.warning ? '\u26a0 ' + pvv.warning.charAt(0).toUpperCase() + pvv.warning.slice(1) + '.'
        : nt ? 'V-carve with a ' + (CUT.vAngle || 60) + '\u00b0 bit: ' + fmtDisp(nt.depth) + ' ' + unitTag() + ' deep at the widest part (' + fmtDisp(nt.widest) + ' ' + unitTag() + ' across)' +
               (nt.passes > 1 ? ', in ' + nt.passes + ' passes' : '') + '.' +
               (nt.flat ? ' Wider parts get a flat floor at the max depth; a clearing pocket for their middles is added with it.' : '')
        : 'Nothing to carve: pick closed shapes, text or a traced logo.';
    } else { CUT.preview = []; dEv.value = ''; document.getElementById('cutHint').textContent = 'Click the shapes to carve: text, a traced logo, or closed outlines.'; }
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  if (pocketing && ok){
    var grp = tpPocketGroups(CUT.ents), isl = grp.reduce(function (s3, g) { return s3 + g.islands.length; }, 0);
    var pv = tpGenerate(Object.assign({}, CUT, {ents: CUT.ents}));
    CUT.preview = pv.moves;
    var so = CUT.dia * (CUT.stepoverPct || 40) / 100;
    document.getElementById('cutHint').textContent = pv.warning
      ? '\u26a0 ' + pv.warning.charAt(0).toUpperCase() + pv.warning.slice(1) + '.'
      : grp.length + (grp.length === 1 ? ' pocket' : ' pockets') + (isl ? ' with ' + isl + (isl === 1 ? ' island' : ' islands') + ' left standing' : '') + '. ' +
        (CUT.through ? 'Through ' + fmtDisp(DOC.stock.t || 0) + ' + ' + fmtDisp(CUT.over) : fmtDisp(tpDepth(CUT)) + ' ' + unitTag() + ' deep') +
        ', ' + Math.ceil(tpDepth(CUT) / CUT.step) + (Math.ceil(tpDepth(CUT) / CUT.step) === 1 ? ' pass' : ' passes') +
        (CUT.pocketClear === 'raster'
           ? ', raster lines ' + fmtDisp(so) + ' ' + unitTag() + ' apart at ' + (CUT.rasterAngle || 0) + '\u00b0, then round the walls.'
           : ', rings ' + fmtDisp(so) + ' ' + unitTag() + ' apart.');
    SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
    draw();
    return;
  }
  document.getElementById('cutHint').textContent = CUT.placing
    ? 'Click the outline to add a tab, click a tab to remove it.'
    : (CUT.tabsOn && ok && !nTabs)
    ? 'Tabs are on but none are placed \u2014 press Edit tabs and click the outline where you want them.'
    : !CUT.ents.length
    ? 'Click closed shapes on the drawing to cut.'
    : (!ok ? 'Nothing here is a closed outline yet. See below for what can be fixed.'
           : noThk ? '\u26a0 Set the material thickness in Settings before cutting through \u2014 until then this cuts only the overcut.'
           : (CUT.through ? 'Through ' + fmtDisp(DOC.stock.t) + ' ' + unitTag() + ' + ' + fmtDisp(CUT.over) + ' overcut. ' : '') +
             'Passes: ' + Math.ceil(tpDepth(CUT) / CUT.step) + ' at ' + fmtDisp(CUT.step) + ' ' + unitTag() +
             (CUT.tabsOn ? ', ' + nTabs + (CUT.tabStyle === '3d' ? ' 3D' : '') + (nTabs === 1 ? ' tab' : ' tabs') + ' ' + fmtDisp(CUT.tabThk) + ' ' + unitTag() + ' thick' : ', no tabs') + '.');
  SEL = CUT.ents.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
  CUT.preview = ok ? tpGenerate(Object.assign({}, CUT, {ents: CUT.ents})).moves : [];
  draw();
}
// Problems with the picked shapes, shown under the hint with a fix where one is safe.
// Recomputed only when the set of shapes changes, not on every keystroke.
function cutIssuesRender(){
  var box = document.getElementById('cutIssues');
  if (!CUT){ box.innerHTML = ''; return; }
  var sig = CUT.ents.join(',') + '#' + CUT.ents.map(function (id) { var e = entById(id); return e ? snapJSON(e).length : 0; }).join(',');
  if (CUT.vecSig !== sig){ CUT.vecSig = sig; CUT.vecIssues = CUT.ents.length ? vecCheck(CUT.ents) : []; }
  var drilling = CUT.side === 'drill';
  var list = (CUT.vecIssues || []).filter(function (i) { return !(drilling && (i.kind === 'open' || i.kind === 'self' || i.kind === 'cross')); });
  box.innerHTML = '';
  list.forEach(function (issue) {
    var row = document.createElement('div');
    row.className = 'cutIssue' + (issue.fix ? ' fixable' : '');
    var t = document.createElement('span'); t.textContent = issue.text; row.appendChild(t);
    if (issue.fix){
      var b = document.createElement('button'); b.textContent = issue.fix;
      b.addEventListener('click', function () {
        vecFix(issue);
        if (issue.kind === 'dup'){                       // the deleted copies leave the toolpath too
          CUT.ents = CUT.ents.filter(function (id) { return !!entById(id); });
        } else if (issue.kind === 'join'){               // the pieces become one shape
          CUT.ents = CUT.ents.filter(function (id) { return issue.ids.indexOf(id) < 0; }).concat([issue.newId]);
        }
        CUT.vecSig = null;
        cutRender();
        toast('ok', issue.fix === 'Join' ? 'Joined into one shape' : issue.fix === 'Close' ? 'Closed' : 'Doubles deleted', 'Undo puts it back as it was.');
      });
      row.appendChild(b);
    }
    box.appendChild(row);
  });
}
function cutClick(w){
  if (CUT.placing){ cutTabClick(w); return; }
  var h = pickEntity(w);
  if (h === null) return;
  var id = entId(DOC.ents[h]);
  var at = CUT.ents.indexOf(id);
  if (at >= 0) CUT.ents.splice(at, 1); else CUT.ents.push(id);
  cutRender();
}
// Add a tab where the outline was clicked, or take away the one that was clicked on.
function cutTabClick(w){
  var hitR = Math.max(CUT.tabLen / 2, 8 / VIEW.scale);
  // on an existing tab? remove it
  for (var id in CUT.tabPts){
    if (CUT.ents.indexOf(id) < 0) continue;
    var list = CUT.tabPts[id];
    for (var i = 0; i < list.length; i++){
      if (Math.hypot(list[i][0] - w.x, list[i][1] - w.y) <= hitR){ list.splice(i, 1); cutRender(); return; }
    }
  }
  // otherwise, the nearest point on the nearest chosen outline
  var best = null;
  tpOutlinesById(CUT.ents).forEach(function (o) {
    var n = o.loop.length;
    for (var k = 0; k < n; k++){
      var a = o.loop[k], b = o.loop[(k + 1) % n];
      var q = Geom.closestOnSeg(w.x, w.y, a[0], a[1], b[0], b[1]);
      var dd = Math.hypot(q[0] - w.x, q[1] - w.y);
      if (!best || dd < best.d) best = {d: dd, id: o.id, p: q};
    }
  });
  if (!best || best.d > 12 / VIEW.scale){ toast('info', 'Click on the outline', 'Tabs go on the edge of the shape being cut.'); return; }
  (CUT.tabPts[best.id] || (CUT.tabPts[best.id] = [])).push([best.p[0], best.p[1]]);
  cutRender();
}
// An inlay is two ordinary toolpaths per half: a V-carve with the V-bit, and a pocket that clears
// the flat floor with an end mill (created with no tool chosen, so saving asks for one). The
// clearing stands off by exactly the width the V-bit's cone reaches at the floor, so the two meet.
// The plug half draws a mirrored copy and a boundary on an "Inlay plug" layer beside the design.
function inlayApply(){
  var D = CUT.inlayD > 0 ? CUT.inlayD : 5, S = CUT.inlayS > 0 ? CUT.inlayS : 2.5, M = CUT.inlayM > 0 ? CUT.inlayM : 5;
  var tanH = Math.tan((CUT.vAngle || 60) / 2 * Math.PI / 180), plug = CUT.inlayHalf === 'plug';
  if (plug && M <= S) return;
  pushUndo(); layersInit();
  var ents = CUT.ents.slice();
  if (plug){
    // mirror about the selection's own centre line, then set it beside the design
    var bb = null;
    ents.forEach(function (id) { var b = entBBox(entById(id)); bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b; });
    var cx = (bb.x0 + bb.x1) / 2, shift = (bb.x1 - bb.x0) + 20, mg = Math.max(6, M * tanH * 2 + 2);
    var keepActive = DOC.activeLayer, lid = layerNew('Inlay plug');
    DOC.activeLayer = keepActive;
    var copies = ents.map(function (id) {
      var c = cloneEnt(entById(id));
      mirrorEnt(c, cx, 0, 0, 1);                        // across the vertical line through the centre
      moveEntity(c, shift, 0);
      c.layer = lid; delete c.id;
      DOC.ents.push(c);
      return entId(c);
    });
    var box = {t: 'rect', x: bb.x0 + shift - mg, y: bb.y0 - mg, w: (bb.x1 - bb.x0) + 2 * mg, h: (bb.y1 - bb.y0) + 2 * mg, layer: lid};
    DOC.ents.push(box);
    ents = [entId(box)].concat(copies);
  }
  var common = {vcFrom: undefined, safeZ: 6, rpm: CUT.rpm || 18000, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false};
  var tpV = Object.assign({}, common, {id: tpNewId(), name: plug ? 'Inlay plug: V-carve' : 'Inlay pocket: V-carve', side: 'vcarve', type: 'vcarve', ents: ents.slice(),
    vAngle: CUT.vAngle || 60, vTip: CUT.vTip || 0, vcMax: plug ? M : D, vcStart: plug ? S : 0, dia: CUT.dia, step: 0,
    feed: CUT.feed, plunge: CUT.plunge, toolId: CUT.toolId, toolChosen: true, through: false});
  var tpC = Object.assign({}, common, {id: tpNewId(), name: plug ? 'Inlay plug: clearing' : 'Inlay pocket: clearing', side: 'pocket', type: 'pocket', ents: ents.slice(),
    depth: plug ? M : D, step: Math.max(0.5, (plug ? M : D) / 2), allowance: (plug ? M - S : D) * tanH, finishPass: false, stepoverPct: 40,
    dia: 3.175, feed: 800, plunge: 300, toolId: null, toolChosen: false, through: false});
  tpGenerate(tpV); tpGenerate(tpC);
  tpInsertByRank(tpC); tpInsertByRank(tpV);             // clearing before the V-carve, as VCarve does
  CUTSEL = tpV.id;
  persist();
  toast('ok', plug ? 'Inlay plug toolpaths created' : 'Inlay pocket toolpaths created',
        (plug ? 'A mirrored copy and its boundary are on the \u201cInlay plug\u201d layer. ' : '') +
        'Open \u201c' + tpC.name + '\u201d and choose the end mill for clearing the floor; G-code can\u2019t be saved until you do.');
  cutClose(); renderToolpathPanel(); draw();
}
// Where a NEW toolpath goes: holes first, then chamfers (cleaner once the holes exist), pockets,
// V-carves, inside profiles, on-the-line, and outside profiles last, while the part is still held.
// It lands after the last toolpath of the same or an earlier kind, so a sequence you've arranged by
// hand is left alone; editing a toolpath never moves it.
var TP_RANK = {drill: 0, chamfer: 1, pocket: 2, vcarve: 3, inside: 4, on: 5, outside: 6};
function tpRank(tp){ var r = TP_RANK[tp.side]; return r === undefined ? 4 : r; }
function tpInsertByRank(tp){
  var list = tpList(), at = list.length, r = tpRank(tp);
  for (var i = list.length - 1; i >= 0; i--){ if (tpRank(list[i]) <= r){ at = i + 1; break; } at = i; }
  list.splice(at, 0, tp);
  return at;
}
// A V-carve capped at a max depth leaves flat middles wherever the shape is wider than the cone at
// that depth. Its clearing pocket stops exactly where the V-bit's floor ends (standing off the outline
// by maxDepth x tan(half angle), as proved for inlays), runs first, and follows the V-carve's settings.
function vcarveClearing(tp){
  var linked = tpList().filter(function (x) { return x.clearFor === tp.id; });
  var tanH = Math.tan((tp.vAngle || 60) / 2 * Math.PI / 180);
  if (!(tp.vcMax > 0) || !tp.vcFlat){
    if (linked.length) return 'The V-carve no longer has flat areas, so \u201c' + linked[0].name + '\u201d isn\u2019t needed: delete it if you like.';
    return '';
  }
  if (linked.length){                                    // keep the pair in step
    linked.forEach(function (c) { c.ents = tp.ents.slice(); c.depth = tp.vcMax; c.allowance = tp.vcMax * tanH; tpGenerate(c); });
    return '';
  }
  var c = {id: tpNewId(), name: tp.name + ': clearing', side: 'pocket', type: 'pocket', ents: tp.ents.slice(), clearFor: tp.id,
           depth: tp.vcMax, step: Math.max(0.5, tp.vcMax / 2), allowance: tp.vcMax * tanH, finishPass: false, stepoverPct: 40,
           dia: 3.175, feed: 800, plunge: 300, toolId: null, toolChosen: false, through: false, safeZ: 6, rpm: 18000, climb: true,
           tabPts: {}, tabsOn: false, hidden: false, exclude: false};
  tpGenerate(c); tpInsertByRank(c);
  return 'Added \u201c' + c.name + '\u201d to clear the flat middles: open it and choose its end mill. It runs before the V-carve.';
}
function cutApply(){
  if (!CUT || !(CUT.dia > 0) || !CUT.toolChosen) return;   // never without a chosen tool
  if (!(CUT.side === 'chamfer' || CUT.side === 'vcarve' || CUT.side === 'inlay' || CUT.through || CUT.depth > 0)) return;   // nor without a depth
  if (CUT.side === 'inlay'){ cutFromForm(); if (CUT.ents.length) inlayApply(); return; }
  cutFromForm();
  if (!CUT.ents.length) return;
  pushUndo();
  var tp = {
    id: CUT.editing || tpNewId(),
    name: CUT.name || (CUT.side === 'drill' ? 'Drilling' : CUT.side === 'pocket' ? 'Pocket' : CUT.side === 'chamfer' ? 'Chamfer' : CUT.side === 'vcarve' ? 'V-carve' : (CUT.side === 'inside' ? 'Inside' : CUT.side === 'on' ? 'On-line' : 'Outside') + ' profile'),
    type: CUT.side === 'drill' ? 'drill' : CUT.side === 'pocket' ? 'pocket' : CUT.side === 'chamfer' ? 'chamfer' : CUT.side === 'vcarve' ? 'vcarve' : 'profile', stepoverPct: CUT.stepoverPct || 40,
    vcMax: CUT.vcMax || 0, vTip: CUT.vTip || 0,
    chamW: CUT.chamW || 1, vAngle: CUT.vAngle || 90, chamMode: CUT.chamMode || 'edge', toolChosen: !!CUT.toolChosen,
    pocketClear: CUT.pocketClear === 'raster' ? 'raster' : 'offset', rasterAngle: CUT.rasterAngle || 0,
    rampLen: CUT.rampLen, allowance: CUT.allowance || 0, climb: CUT.climb !== false, finishPass: !!(CUT.allowance > 0 && CUT.finishPass),
    leadType: CUT.leadType || 'none', leadSize: CUT.leadSize || 0,
    vcFrom: CUT.vcFrom, side: CUT.side, ents: CUT.ents.slice(), peck: CUT.peck || 0,
    through: CUT.side === 'chamfer' || CUT.side === 'vcarve' ? false : !!CUT.through, over: CUT.over === undefined ? 0.2 : CUT.over,
    dia: CUT.dia, depth: CUT.depth, step: CUT.step, feed: CUT.feed, plunge: CUT.plunge,
    tabsOn: CUT.tabsOn && tpTabTotal(CUT) > 0, tabCount: CUT.tabCount, tabLen: CUT.tabLen, tabThk: CUT.tabThk, tabStyle: CUT.tabStyle === '3d' ? '3d' : 'flat',
    tabPts: JSON.parse(JSON.stringify(CUT.tabPts || {})),
    hidden: !!CUT.hidden, exclude: !!CUT.exclude,          // editing a toolpath leaves these alone
    toolId: CUT.toolId, rpm: CUT.rpm || 18000, safeZ: 6
  };
  tpGenerate(tp);
  var list = tpList(), at = -1;
  list.forEach(function (x, i) { if (x.id === tp.id) at = i; });
  if (multiSheet()){
    // a toolpath's shapes must all be on one sheet: its G-code is cut on that sheet's material
    var sheetsUsed = [];
    tp.ents.forEach(function (id) { var e = entById(id); if (e && e.layer && sheetsUsed.indexOf(e.layer) < 0) sheetsUsed.push(e.layer); });
    if (sheetsUsed.length > 1){
      UNDO.pop();                                            // nothing changed: drop the undo step recorded above
      toast('err', 'Those shapes are on different sheets', 'Each sheet is cut from its own material, so a toolpath\u2019s shapes must all be on one sheet (' +
            sheetsUsed.map(function (id) { return layerById(id).name; }).join(', ') + '). Make one toolpath per sheet.');
      return;
    }
    tp.sheet = sheetsUsed[0] || DOC.activeSheet;
  }
  if (at >= 0) list[at] = tp; else tpInsertByRank(tp);   // new ones take their place in the cutting order
  var clearMsg = tp.side === 'vcarve' ? vcarveClearing(tp) : '';
  CUTSEL = tp.id;
  persist();
  toast('ok', at >= 0 ? 'Toolpath updated' : 'Toolpath created',
        tp.type === 'drill'
          ? tp.name + ': ' + (tp.holes ? tp.holes.length : 0) + ' holes with a ' + fmtDisp(tp.dia) + ' ' + unitTag() + ' drill.'
          : tp.name + ': ' + Math.ceil(tpDepth(tp) / tp.step) + ' passes with a ' + fmtDisp(tp.dia) + ' ' + unitTag() + ' cutter' + (tp.side === 'pocket' && tp.islands ? ', leaving ' + tp.islands + (tp.islands === 1 ? ' island' : ' islands') : '') + '.');
  if (clearMsg) toast('info', 'Clearing for the flat areas', clearMsg);
  cutClose();
  renderToolpathPanel();
}

// The tab Shape row is shown and hidden with the Length and Thickness row, wherever that happens
function cutTabShapeFollows(){
  var size = document.getElementById('cutTabSize'), shape = document.getElementById('cutTabShape');
  if (!size || !shape || shape._follows) return;
  shape._follows = true;
  shape.hidden = size.hidden;
  new MutationObserver(function (){ shape.hidden = size.hidden; }).observe(size, {attributes: true, attributeFilter: ['hidden']});
}
