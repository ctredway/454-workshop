function wire(){
  cv = document.getElementById('cv');
  ctx = cv.getContext('2d');
  restore();
  uiCfgLoad();
  buildToolPanel();
  wirePanel();
  unsavedWire();
  clipWire(); selBoxWire(); woodWire(); tplWire(); paramPanelWire();
  keysWire();
  fit();

  document.getElementById('stkT').addEventListener('change', function(e){
    var raw = e.target.value.trim(), pastBefore = tpPastIds();      // to name toolpaths a thinner material puts through it
    if (!raw){ DOC.stock.t = 0; }
    else {
      var t = parseStockLen(raw, stockUnits());
      if (!(t > 0)){ toast('warn', 'Check the thickness', 'Use a number greater than zero, like 3, 0.125 or 1/8.'); syncStockUI(); return; }
      // dimensions using "material" follow it (and Undo takes the reshaping back)
      if ((DOC.dims || []).some(function (d){ return d.expr && paramNamesIn(d.expr).indexOf(PARAM_BUILTIN) >= 0; }) ||
          tpList().some(function (tp){ return Object.keys(tpExprsUsed(tp)).length; })) pushUndo();
      DOC.stock.t = t;
    }
    paramsSayFailed(paramsApplyDims());
    tpParamsApply();
    tpPastNotice(pastBefore);
    syncStockUI(); persist(); renderToolpathPanel(); draw();       // cut-through toolpaths follow it
  });
  document.getElementById('stkZ').addEventListener('change', function(e){
    DOC.stock.zero = e.target.value; persist(); renderToolpathPanel(); draw();
  });
  ['stkW','stkH'].forEach(function(id){
    document.getElementById(id).addEventListener('change', function(){
      var u = stockUnits();
      var w = parseStockLen(document.getElementById('stkW').value, u), h = parseStockLen(document.getElementById('stkH').value, u);
      if (!(w > 0) || !(h > 0)){
        toast('warn', 'Check the material size', 'Use a number greater than zero, like 12, 12.5 or 12 1/2.');
        syncStockUI(); return;                          // put the last good values back
      }
      DOC.stock.w = w; DOC.stock.h = h;
      syncStockUI(); persist(); fit();
    });
  });
  document.getElementById('stkUnits').addEventListener('change', function(e){
    UICFG.stockUnits = e.target.value; uiCfgSave(); syncStockUI();   // same size, shown in the new units
  });
  // display colors (now in the Settings modal, wired once)
  // Shift pressed or released while drawing a line: the preview follows at once
  ['keydown', 'keyup'].forEach(function (ev){ window.addEventListener(ev, function (e){
    if (e.key !== 'Shift' || MOUSE.mx == null || !drawAnchor()) return;
    MOUSE.shift = ev === 'keydown'; MOUSE.snap = resolveSnap(s2w(MOUSE.mx, MOUSE.my)); draw();
  }); });
  var asn = document.getElementById('angleSnapChk');
  if (asn){
    asn.checked = UICFG.angleSnap !== false;
    asn.addEventListener('change', function(){ UICFG.angleSnap = asn.checked; uiCfgSave(); });
  }
  var sd = document.getElementById('showDims');
  if (sd){
    sd.checked = UICFG.showDims !== false;
    sd.addEventListener('change', function(){ UICFG.showDims = sd.checked; uiCfgSave(); draw(); });
  }
  [['colVec','vec'],['colTp','tp'],['colCon','con'],['colDim','dim']].forEach(function(pair){
    var inp = document.getElementById(pair[0]);
    if (!inp) return;
    inp.value = dispCol(pair[1]);
    inp.addEventListener('input', function(){
      UICFG.colors[pair[1]] = inp.value;
      uiCfgSave();
      draw();
    });
  });
  // Settings modal open/close
  var settingsModal = document.getElementById('settingsModal');
  function openSettings(){
    syncStockUI();                                      // current size, in the chosen units
    settingsModal.hidden = false;
  }
  function closeSettings(){ settingsModal.hidden = true; }
  (function themeUI(){
    var cur = themeRead();
    var th = document.getElementById('uiTheme'), ac = document.getElementById('uiAccent'), hx = document.getElementById('uiAccentHex');
    function sync(){
      th.value = cur.theme === 'light' ? 'light' : 'dark';
      ac.value = cur.accent || 'gold';
      hx.value = cur.accent === 'custom' ? (cur.accentHex || ACCENTS.gold) : (ACCENTS[cur.accent] || ACCENTS.gold);
      hx.style.display = ac.value === 'custom' ? '' : 'none';
    }
    sync();
    [th, ac, hx].forEach(function(el){
      el.addEventListener('input', function(){
        cur = {theme: th.value, accent: ac.value, accentHex: hx.value};
        sync(); themeWrite(cur); applyTheme(cur);
      });
    });
    window.addEventListener('storage', function(e){        // the other app changed it
      if (e.key !== '454-theme') return;
      cur = themeRead(); sync(); applyTheme(cur);
    });
    applyTheme(cur);
  })();
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('offObjs').addEventListener('click', function(){ if (OFF) offRender(); });
  document.getElementById('offFlip').addEventListener('click', function(){ if (OFF){ OFF.flip = !OFF.flip; offRender(); } });
  document.getElementById('offDist').addEventListener('input', function(e){
    if (!OFF) return;
    var v = lenIn(e.target.value);
    if (!isNaN(v) && Math.abs(v) > 1e-9) OFF.dist = Math.abs(v);
    offRender();
  });
  document.getElementById('offDist').addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ e.preventDefault(); offApply(); }
    e.stopPropagation();
  });
  document.getElementById('offOk').addEventListener('click', offApply);
  document.getElementById('offCancel').addEventListener('click', function(){ offClose(); setTool('select'); });
  document.getElementById('offX').addEventListener('click', function(){ offClose(); setTool('select'); });
  document.getElementById('tpNew').addEventListener('click', function(){ setTool('select'); cutOpen(null); });
  document.getElementById('tpVcConvert').addEventListener('click', vcMakeEditable);
  sheetWire();
  document.getElementById('tpRecalcAll').addEventListener('click', tpRecalcAll);
  document.getElementById('jsClose').addEventListener('click', jobSheetClose);
  document.getElementById('jsPrint').addEventListener('click', function(){ window.print(); });
  document.getElementById('jsModal').addEventListener('keydown', function(e){ if (e.key === 'Escape' && !e.target.isContentEditable){ e.stopPropagation(); jobSheetClose(); } });
  document.addEventListener('pointerdown', function (e) { var m = document.getElementById('ctxMenu'); if (!m.hidden && !m.contains(e.target)) ctxMenuClose(); }, true);
  window.addEventListener('blur', ctxMenuClose);
  window.addEventListener('resize', ctxMenuClose);
  document.getElementById('ctxMenu').addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(this.querySelectorAll('button:not([disabled])')), at = items.indexOf(document.activeElement);
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); ctxMenuClose(); }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); items[(at + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab'){ e.preventDefault(); ctxMenuClose(); }
  });
  document.getElementById('tpCheck').addEventListener('click', function(){ if (camReady()) vecCheckAll(); });
  document.getElementById('cutX').addEventListener('click', cutClose);
  document.getElementById('cutCancel').addEventListener('click', cutClose);
  document.getElementById('cutOk').addEventListener('click', cutApply);
  document.getElementById('cutTool').addEventListener('click', function(){
    if (!CUT) return;
    if (!TOOLLIB){ toast('info', 'No tool library yet', 'Import your VCarve library from the tool library window, or type the cutter diameter and feeds in yourself.'); libOpen(); return; }
    libOpen(CUT.toolId, function(id){ cutUseTool(id); });
  });
  document.getElementById('cutType').addEventListener('change', function(){
    if (!CUT) return;
    CUT.side = document.getElementById('cutType').value;
    if (CUT.side === 'drill' && !(CUT.plunge > 0)) CUT.plunge = 300;
    cutToForm(); cutRender();                            // boxes now show what this type uses
  });
  document.getElementById('cutDia').addEventListener('input', function(){
    if (CUT && lenIn(document.getElementById('cutDia').value) > 0){ CUT.toolChosen = true; CUT.toolId = null; }   // a typed size is a choice
  });
  ['cutDia','cutDepth','cutStep','cutPeck','cutStepover','cutFeed','cutTabLen','cutTabThk','cutTabStyle','cutOver','cutChamW','cutVAngle','cutChamMode','cutVcAngle','cutVcMax','cutVcTip','cutClear','cutRest','cutRasterAng','cutDir','cutAllow','cutFinPass','cutLead','cutLeadSize','cutRamp','cutRampLen','cutInlayHalf','cutInlayD','cutInlayS','cutInlayM'].forEach(function(id){
    document.getElementById(id).addEventListener('input', function(){ if (CUT){ cutFromForm(); cutRender(); } });
    document.getElementById(id).addEventListener('change', function(){ if (CUT){ cutFromForm(); cutRender(); } });   // lists and tick boxes
  });
  document.getElementById('cutThrough').addEventListener('change', function(){ if (CUT){ cutFromForm(); cutRender(); } });
  document.getElementById('cutTabsOn').addEventListener('change', function(){
    if (!CUT) return;
    cutFromForm();
    if (!CUT.tabsOn) CUT.placing = false;
    else if (!tpTabTotal(CUT)){ CUT.placing = true; CUT.placingStart = false; }   // straight into placing them
    cutRender();
  });
  document.getElementById('cutTabs').addEventListener('input', function(){ if (CUT) cutFromForm(); });
  document.getElementById('cutTabSpread').addEventListener('click', function(){
    if (!CUT) return;
    cutFromForm(); tpAddEvenTabs(CUT, CUT.tabCount); cutRender();
  });
  document.getElementById('cutStartPlace').addEventListener('click', function(){
    if (!CUT) return;
    CUT.placingStart = !CUT.placingStart; if (CUT.placingStart) CUT.placing = false;   // one kind of clicking at a time
    cutRender();
  });
  document.getElementById('cutStartClear').addEventListener('click', function(){
    if (!CUT) return;
    CUT.startPts = {}; CUT.placingStart = false; cutRender();
  });
  document.getElementById('cutTabClear').addEventListener('click', function(){
    if (!CUT) return;
    CUT.tabPts = {}; cutRender();
  });
  document.getElementById('cutTabPlace').addEventListener('click', function(){
    if (!CUT) return;
    CUT.placing = !CUT.placing; if (CUT.placing) CUT.placingStart = false;
    cutRender();
  });
  document.getElementById('cutPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); cutClose(); }
    else if (e.key === 'Enter'){ e.preventDefault(); cutApply(); }
    e.stopPropagation();
  });
  document.getElementById('mirObjs').addEventListener('click', function(){ if (MIR){ MIR.slot = 'objs'; mirRender(); } });
  document.getElementById('mirLine').addEventListener('click', function(){ if (MIR){ MIR.slot = 'line'; mirRender(); } });
  document.getElementById('mirOk').addEventListener('click', mirApply);
  document.getElementById('mirCancel').addEventListener('click', function(){ mirClose(); setTool('select'); });
  document.getElementById('mirX').addEventListener('click', function(){ mirClose(); setTool('select'); });
  document.getElementById('libBtn').addEventListener('click', function(){ libOpen(); });
  document.getElementById('floatDel').addEventListener('click', function(){
    if (DRAW && DRAW.stage === 'dimValue') deleteDim(DRAW.di);
  });
  document.getElementById('dlgOk').addEventListener('click', function(){ dlgEnd(true); });
  document.getElementById('dlgCancel').addEventListener('click', function(){ dlgEnd(false); });
  document.getElementById('dlgAlt').addEventListener('click', function(){ dlgEnd('alt'); });
  document.getElementById('dlgX').addEventListener('click', function(){ dlgEnd(false); });
  document.getElementById('dlgModal').addEventListener('pointerdown', function(e){ if (e.target.id === 'dlgModal') dlgEnd(false); });
  document.getElementById('dlgPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); dlgEnd(false); }
    else if (e.key === 'Enter'){ e.preventDefault(); dlgEnd(true); }
    e.stopPropagation();
  });
  document.getElementById('tdClose').addEventListener('click', closeToolDetails);
  document.getElementById('tdDone').addEventListener('click', closeToolDetails);
  document.getElementById('tdLib').addEventListener('click', function(){
    var t = TD && TOOLLIB ? libMatch(TD.ptool, TD.machineId).tool : null;
    closeToolDetails(); libOpen(t ? t.id : null);
  });
  document.getElementById('toolPanel2').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); closeToolDetails(); }
    e.stopPropagation();
  });
  document.getElementById('toolModal').addEventListener('pointerdown', function(e){ if (e.target.id === 'toolModal') closeToolDetails(); });
  document.getElementById('libClose').addEventListener('click', libCloseDlg);
  document.getElementById('libNewTool').addEventListener('click', libNewTool);
  document.getElementById('libStartEmpty').addEventListener('click', function(){ TOOLLIB = libEmptyLib(); libCommit('Empty library started: add your tools with + Tool'); });
  document.getElementById('libNewMat').addEventListener('click', function(){
    var b = document.getElementById('libNewMat'), i = document.getElementById('libNewMatName');
    b.hidden = true; i.hidden = false; i.value = ''; i.focus();
  });
  document.getElementById('libNewMatName').addEventListener('keydown', function(e){
    e.stopPropagation();
    var i = document.getElementById('libNewMatName');
    if (e.key === 'Enter'){ libAddMaterial(i.value); i.hidden = true; document.getElementById('libNewMat').hidden = false; }
    else if (e.key === 'Escape'){ i.hidden = true; document.getElementById('libNewMat').hidden = false; }
  });
  document.getElementById('libNewMatName').addEventListener('blur', function(){
    var i = document.getElementById('libNewMatName'); if (i.hidden) return;
    if (i.value.trim()) libAddMaterial(i.value);
    i.hidden = true; document.getElementById('libNewMat').hidden = false;
  });
  document.getElementById('libImport').addEventListener('click', function(){ document.getElementById('libFile').click(); });
  document.getElementById('libFile').addEventListener('change', function(ev){
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (f) libImportFile(f);
  });
  document.getElementById('libRemove').addEventListener('click', function(){
    if (!TOOLLIB) return;
    uiDialog({title:'Remove the tool library?',
              body:'All ' + TOOLLIB.tools.length + ' tools go from this browser. Your VCarve tools.vtdb file is not affected, so you can import it again any time.',
              ok:'Remove', danger:true}).then(function(go){
      if (!go) return;
      libClear().then(function(){ TOOLLIB = null; LIBUI.sel = null; libRender(); renderToolpathPanel(); toast('info', 'Tool library removed', 'Import it again any time.'); });
    });
  });
  document.getElementById('libMachine').addEventListener('change', function(e){
    UICFG.libMachine = e.target.value; uiCfgSave(); libRenderTree(e.target.value); libRenderDetail(e.target.value); renderToolpathPanel();
  });
  document.getElementById('libMaterial').addEventListener('change', function(e){
    UICFG.libMaterial = e.target.value; uiCfgSave(); libRenderDetail(libDefaultMachine()); libPickState();
  });
  document.getElementById('libSearch').addEventListener('input', function(e){ LIBUI.q = e.target.value; libRenderTree(libDefaultMachine()); });
  document.getElementById('libPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); libCloseDlg(); }
    else if (e.key === 'Enter' && LIBUI.pick && LIBUI.sel && e.target.id !== 'libSearch'){ e.preventDefault(); libPickNow(); }
    e.stopPropagation();
  });
  document.getElementById('libPickGo').addEventListener('click', libPickNow);
  document.getElementById('libPickCancel').addEventListener('click', libCloseDlg);
  document.getElementById('libModal').addEventListener('pointerdown', function(e){ if (e.target.id === 'libModal') libCloseDlg(); });
  libLoad().then(function(lib){ if (lib && lib.tools){ TOOLLIB = lib; renderToolpathPanel(); } });
  document.getElementById('tpCollapse').addEventListener('click', function(){ UICFG.tpPanel = false; uiCfgSave(); renderToolpathPanel(); });
  document.getElementById('tpStrip').addEventListener('click', function(){ UICFG.tpPanel = true; uiCfgSave(); renderToolpathPanel(); });
  renderToolpathPanel();
  // ---- nesting dialog ----
  document.getElementById('nestCancel').addEventListener('click', closeNestDialog);
  document.getElementById('nestGo').addEventListener('click', runNestDialog);
  document.getElementById('nestAllBtn').addEventListener('click', function(){
    var v = document.getElementById('nestAll').value;
    if (NEST) NEST.parts.forEach(function(pt){ pt.qtyInput.value = v; });
  });
  document.getElementById('nestPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); closeNestDialog(); }
    else if (e.key === 'Enter' && e.target.id !== 'nestAll'){ e.preventDefault(); runNestDialog(); }
    e.stopPropagation();
  });
  // corner type (Round / Dog-bone / T-bone) for the Fillet tool
  document.getElementById('filletTypes').addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!b || !b.dataset.ft) return;
    UICFG.filletType = b.dataset.ft; uiCfgSave();
    refreshFilletTypes(); stagePrompt('fillet0'); draw();
  });

  // ---- message history (bulb in the status bar) ----
  document.getElementById('msgBulb').addEventListener('click', function(){
    setMsgPanel(document.getElementById('msgPanel').hidden);
  });
  document.getElementById('msgClear').addEventListener('click', function(){
    MSG_LOG = []; refreshMsgBulb();
  });
  window.addEventListener('pointerdown', function(ev){           // click anywhere else closes it
    var panel = document.getElementById('msgPanel'), bulb = document.getElementById('msgBulb');
    if (panel.hidden) return;
    if (panel.contains(ev.target) || bulb.contains(ev.target)) return;
    setMsgPanel(false);
  }, true);

  // ---- text dialog: every change previews live on the canvas ----
  function txtLive(){
    if (!TXT) return;
    var e = TXT.ent;
    e.str = document.getElementById('txtStr').value;
    e.font = document.getElementById('txtFont').value;
    var hv = parseFloat(document.getElementById('txtH').value);
    if (hv > 0 && isFinite(hv)) e.h = hv;
    e.align = document.getElementById('txtAlign').value;
    textCurveRowsRead(e);
    fontObj(e.font);
    draw();
    textLocal(e); textCurveNote(e);
  }
  ['txtStr','txtH','txtCGap'].forEach(function(id){ document.getElementById(id).addEventListener('input', txtLive); });
  ['txtFont','txtAlign','txtCPos','txtCSide','txtCRev'].forEach(function(id){ document.getElementById(id).addEventListener('change', txtLive); });
  document.getElementById('txtStraight').addEventListener('click', function(){
    if (!TXT) return;
    textStraighten(TXT.ent); textCurveRowsShow(TXT.ent); draw();
  });
  document.getElementById('txtOK').addEventListener('click', function(){ txtLive(); closeTextModal(true); });
  document.getElementById('txtCancel').addEventListener('click', function(){ closeTextModal(false); });
  document.getElementById('txtCurves').addEventListener('click', function(){
    txtLive();
    if (!TXT || !String(TXT.ent.str).trim()){ closeTextModal(true); return; }
    if (!textLocal(TXT.ent)){ toast('warn', 'Font still loading', 'Wait until the letters appear, then convert.'); return; }
    var ent = TXT.ent;
    closeTextModal(true);
    UNDO.pop();                                   // fold the convert into the same undo step
    var n = convertTextsToCurves([DOC.ents.indexOf(ent)]);
    if (n) toast('ok', 'Placed as curves', 'The text is now ordinary shapes, grouped together. It can be trimmed, offset and cut, but not edited as text.');
  });
  document.getElementById('textPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); closeTextModal(false); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); txtLive(); closeTextModal(true); }
    e.stopPropagation();
  });
  document.getElementById('txtLoadFont').addEventListener('click', function(){ document.getElementById('fontFile').click(); });
  document.getElementById('fontFile').addEventListener('change', function(ev){
    var f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    if (typeof opentype === 'undefined'){
      toast('err', 'Text engine didn\u2019t load', 'Reload the page while online, then try the font again.');
      return;
    }
    var rd = new FileReader();
    rd.onload = function(){
      try{
        var key = registerCustomFont(rd.result, true);
        refreshFontSelect(key);
        txtLive();
        toast('ok', 'Font added', FONTS[key].name + ' is saved in this browser, so it will be here next time.');
      }catch(err){
        toast('err', 'That font file couldn\u2019t be read', 'Use a .ttf, .otf or .woff file. The newer .woff2 format isn\u2019t supported.');
      }
    };
    rd.readAsArrayBuffer(f);
  });

  // ---- double-click text (Select tool) to edit it ----
  cv.addEventListener('dblclick', function(ev){
    var r0 = cv.getBoundingClientRect();
    var sx0 = ev.clientX - r0.left, sy0 = ev.clientY - r0.top;
    var w0 = s2w(sx0, sy0);
    var hitDim = pickDim(sx0, sy0);                 // a dimension line or its value opens for editing
    if (hitDim >= 0){ editDim(hitDim, sx0, sy0); return; }
    if (TOOL !== 'select') return;
    var h0 = pickEntity(w0);
    if (h0 === null) return;
    var already = HANDLES.active && SEL.indexOf(h0) >= 0;
    if (already && DOC.ents[h0].t === 'text'){ openTextModal(h0); return; }
    if (SEL.indexOf(h0) < 0) SEL = [h0];          // double-clicking a member keeps a multi-selection
    HANDLES.sig = selSig(); HANDLES.active = true;
    if (!already){ HANDLES.mode = 'scale'; HANDLES.pivot = null; }
    draw();
  });

  // fonts the user loaded before come back from browser storage
  loadCachedFonts();
  document.getElementById('settingsDone').addEventListener('click', closeSettings);
  document.getElementById('setX').addEventListener('click', closeSettings);
  document.getElementById('nestX').addEventListener('click', closeNestDialog);
  document.getElementById('textX').addEventListener('click', function(){ closeTextModal(false); });
  settingsModal.addEventListener('pointerdown', function(e){ if (e.target === settingsModal) closeSettings(); });

  var IMP = {ex: null};
  function impClose(){ document.getElementById('impModal').hidden = true; IMP.ex = null; IMP.vec = null; IMP.mode = null; }
  // DXF and SVG files ({name, ex}), one or several: add them to the drawing, or replace it
  function vecDialog(list){
    IMP.mode = 'vec'; IMP.vec = list;
    var one = list.length === 1, anyDxf = list.some(function (v){ return !v.ex.svg; });
    document.getElementById('impTitle').textContent = one ? (list[0].ex.svg ? 'Import SVG' : 'Import DXF') : 'Import ' + list.length + ' files';
    document.getElementById('impStock').textContent = list.map(function (v){
      var b = dxfBBox(v.ex.ents), sk = Object.keys(v.ex.skipped || {});
      return (one ? '' : v.name + ': ') + v.ex.ents.length + (v.ex.ents.length === 1 ? ' shape' : ' shapes') + ' \u00b7 ' +
             (b.x1 - b.x0).toFixed(1) + ' \u00d7 ' + (b.y1 - b.y0).toFixed(1) + (v.ex.svg ? ' mm' : ' (the file\u2019s units)') +
             (sk.length ? ' \u00b7 not imported: ' + sk.map(function (k){ return v.ex.skipped[k] + '\u00d7 ' + k; }).join(', ') : '');
    }).join('\n');
    document.querySelectorAll('.impCrvRow').forEach(function(el){ el.hidden = true; });
    document.querySelectorAll('.impVecRow').forEach(function(el){ el.hidden = false; });
    document.querySelectorAll('.impDxfRow').forEach(function(el){ el.hidden = !one; });   // scale to width: one file at a time
    document.getElementById('impUnitsRow').hidden = !anyDxf;                          // an SVG states its own units
    var drawn = !!vecContentBBox();
    document.getElementById('impIntoRow').hidden = !drawn;                            // nothing drawn: nothing to replace
    document.getElementById('impAdd').checked = true;
    document.getElementById('impPlace').value = drawn ? 'beside' : 'origin';
    document.getElementById('impWidth').value = '';
    var dx1 = list.filter(function (v){ return !v.ex.svg; })[0];
    document.getElementById('impIN').checked = !!(dx1 && dx1.ex.units === 1);
    document.getElementById('impMM').checked = !(dx1 && dx1.ex.units === 1);
    document.getElementById('impModal').hidden = false;
  }
  function vecRead(name, text){                     // {name, ex}, or throws saying why
    if (/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text) || /\.svg$/i.test(name)){
      var sv = svgExtract(text);
      if (!sv.ents.length) throw new Error('No shapes in this SVG that 454 can use' + (Object.keys(sv.skipped).length ? ' (it has ' + Object.keys(sv.skipped).join(', ') + ', which aren\u2019t imported: convert text to paths first)' : '') + '.');
      return {name: name, ex: sv};
    }
    if (/^\s*0\s*[\r\n]+\s*SECTION/m.test(text) || text.indexOf('ENTITIES') >= 0 && text.indexOf('$INSUNITS') >= 0 || /\n\s*0\s*\r?\nSECTION/.test(text)){
      var dx = dxfExtract(text);
      if (!dx.ents.length) throw new Error('No vectors in this DXF that 454 can use.');
      return {name: name, ex: dx};
    }
    return null;                                    // neither
  }
  // several files at once: the DXFs and SVGs among them, into one dialog
  DESIGN_IMPORT = importFiles;                        // for Open (unsaved.js)
  function importFiles(files){
    files = Array.prototype.slice.call(files || []);
    if (files.length <= 1){ if (files[0]) importFile(files[0]); return; }
    Promise.all(files.map(function (f){ return f.text().then(function (t){
      try { return vecRead(f.name, t) || {name: f.name, err: 'only DXF and SVG files can be imported together'}; }
      catch (e){ return {name: f.name, err: e.message}; } }); })).then(function (read){
      var ok = read.filter(function (r){ return r.ex; }), bad = read.filter(function (r){ return r.err; });
      if (bad.length) toast(ok.length ? 'warn' : 'err', bad.length === 1 ? 'One file wasn\u2019t imported' : bad.length + ' files weren\u2019t imported',
                            bad.map(function (r){ return r.name + ': ' + r.err; }).join(' \u00b7 '));
      if (ok.length) vecDialog(ok);
    });
  }
  document.getElementById('impCancel').addEventListener('click', impClose);
  document.getElementById('impX').addEventListener('click', impClose);
  document.getElementById('impModal').addEventListener('pointerdown', function(e){
    if (e.target === e.currentTarget) impClose();
  });
  document.getElementById('impGo').addEventListener('click', function(){
    if (IMP.mode === 'vec' && IMP.vec){
      var list = IMP.vec, replace = !document.getElementById('impIntoRow').hidden && document.getElementById('impReplace').checked;
      var place = document.getElementById('impPlace').value, inch = document.getElementById('impIN').checked;
      var wTarget = parseFloat(document.getElementById('impWidth').value);
      pushUndo();
      if (replace) DOC = {stock: DOC.stock, ents: [], guides: [], layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1'};
      layersInit();
      var layersBefore = DOC.layers.length, ref = replace ? null : vecContentBBox(), added = null, sel = [];
      list.forEach(function (v, k){
        var unit = v.ex.svg ? 1 : (inch ? 25.4 : 1), scale = unit;
        if (list.length === 1 && wTarget > 0){ var b = dxfBBox(v.ex.ents), w = (b.x1 - b.x0) * unit; if (w > 1e-9) scale = unit * wTarget / w; }
        // several files: the first where chosen, the rest each beside the one before (never on top of each other)
        var pl = place, beside = place === 'beside' ? bbUnion(ref, added) : added;
        if (k > 0 && place === 'origin') pl = 'beside';
        var r = vecAdd(v.ex, scale, pl, beside);
        sel = sel.concat(r.idx); added = bbUnion(added, r.bb);
      });
      SEL = sel.filter(function (i){ var L = layerById(DOC.ents[i].layer); return !L || (L.visible && !L.locked); });   // ready to move
      syncStockUI(); persist(); fit(); renderLayers(); draw();
      var nNew = DOC.layers.length - layersBefore, names = list.length === 1 ? list[0].name : list.length + ' files';
      toast('ok', (replace ? 'Imported ' : 'Added ') + sel.length + (sel.length === 1 ? ' shape' : ' shapes') + ' from ' + names,
            (nNew ? nNew + (nNew === 1 ? ' new layer' : ' new layers') + ' from the file' + (list.length > 1 ? 's' : '') + '. ' : '') +
            (SEL.length ? 'They\u2019re selected: drag them into place.' : ''));
      impClose();
      return;
    }
    var ex = IMP.ex;
    if (!ex) return;
    var useD = document.getElementById('impDrawing').checked;
    var useP = document.getElementById('impPreview').checked;
    if (!useD && !useP){ impClose(); return; }
    var scale = document.getElementById('impIN').checked ? 25.4 : 1;
    pushUndo();
    var docD = crvToDoc({stockW: ex.stockW, stockH: ex.stockH, stockT: ex.stockT, stockZero: ex.stockZero, contours: useD ? ex.contours : [],
                         contourIds: useD ? ex.contourIds : [], contourSheets: useD ? ex.contourSheets : []}, scale);   // IDs and sheets
    var docP = crvToDoc({stockW: ex.stockW, stockH: ex.stockH, contours: useP ? ex.preview : []}, scale);
    docP.ents.forEach(function(en){ en.tp = true; });
    DOC = {stock: docD.stock, ents: docD.ents.concat(docP.ents), guides: [], dims: [], vcToolpaths: ex.toolpaths || [],
           vcPreview: (ex.preview || []).map(function (c) { return c.map(function (sp) { return [sp[0]*scale, sp[1]*scale, sp[2]]; }); })};
    var sheetsMade = sheetsFromCrv(ex);
    syncStockUI(); persist(); fit();
    if (sheetsMade) toast('info', 'This project has ' + sheetsMade.length + ' sheets',
      sheetsMade.map(function (l) { return l.name; }).join(', ') + ': each has its own toolpaths and its own G-code. Choose the sheet at the top of the Toolpaths panel.');
    impClose();
    renderToolpathPanel();
    if (DOC.stock.t > 0)
      toast('info', 'Material from the project', fmtDisp(DOC.stock.t) + ' ' + unitTag() + ' thick, Z zero on the ' +
            (DOC.stock.zero === 'bottom' ? 'spoilboard' : 'top of the material') + '. Change it in Job setup if that\u2019s not what you\u2019ll cut.');
  });
  window.addEventListener('keydown', function(e){
    if (e.code === 'Escape' && !document.getElementById('impModal').hidden){
      e.stopImmediatePropagation(); impClose();
    }
  }, true);

  function importFile(f){
    if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name)){ traceOpen(f); return; }
    var rd = new FileReader();
    rd.onload = function(){
      var buf = rd.result;
      var head = new Uint8Array(buf, 0, 4);
      if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0){
        // VCarve .crv
        try{
          var ex = crvExtract(buf);
          if (!ex || (!ex.contours.length && !ex.preview.length)){ toast('err', 'Nothing to import', 'No vectors found in this .crv, or it\u2019s a version 454 can\u2019t read yet.'); return; }
          IMP.mode = 'crv'; IMP.ex = ex;
          document.getElementById('impTitle').textContent = 'Import VCarve file';
          document.querySelectorAll('.impCrvRow').forEach(function(el){ el.hidden = false; });
          document.querySelectorAll('.impDxfRow').forEach(function(el){ el.hidden = true; });
          document.getElementById('impStock').textContent =
            'Stock ' + ex.stockW.toFixed(1) + ' x ' + ex.stockH.toFixed(1) + ' (native units)';
          document.getElementById('impDrawingLbl').textContent = 'Drawing vectors (' + ex.contours.length + ')';
          document.getElementById('impPreviewLbl').textContent = 'Toolpath preview vectors (' + ex.preview.length + ')';
          document.getElementById('impDrawing').checked = ex.contours.length > 0;
          document.getElementById('impDrawing').disabled = ex.contours.length === 0;
          document.getElementById('impPreview').checked = false;
          document.getElementById('impPreview').disabled = ex.preview.length === 0;
          var inchGuess = ex.stockW > 0 && ex.stockW <= 60 && ex.stockH <= 60;
          document.getElementById('impIN').checked = inchGuess;
          document.getElementById('impMM').checked = !inchGuess;
          document.getElementById('impModal').hidden = false;
        }catch(err){ toast('err', 'Couldn\u2019t read that .crv', err.message); }
        return;
      }
      var txt2 = new TextDecoder().decode(buf);
      var vec;
      try { vec = vecRead(f.name, txt2); } catch (errV){ toast('err', 'Couldn\u2019t import ' + f.name, errV.message); return; }
      if (vec){ vecDialog([vec]); return; }
      try{
        var d = JSON.parse(txt2);
        if (d && d.stock && d.ents) openDrawing(d, f.name);          // unsaved.js: puts an unsaved drawing aside
        else toast('err', 'Not a 454 Design file', 'This looks like JSON, but not a drawing 454 Design saved.');
      }catch(err2){ toast('err', 'Unknown file type', 'Open a 454 Design drawing or a VCarve .crv, or import a .dxf or .svg.'); }
    };
    rd.readAsArrayBuffer(f);
  }
  document.getElementById('loadFile').addEventListener('change', function(e){
    importFiles(e.target.files);
    e.target.value = '';
  });
  // window-level drop: swallow strays (fixes the file:// self-load console error
  // from panel drags ending outside a drop zone) and enable drop-to-import
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ droppedFiles(e.dataTransfer.files); importFiles(e.dataTransfer.files); }   // droppedFiles: unsaved.js
  });

  // canvas interactions
  var pan = null;
  cv.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  cv.addEventListener('pointerdown', function(e){
    cv.setPointerCapture(e.pointerId);
    MOUSE.shift = e.shiftKey;
    if (e.button === 1 || e.button === 2){ pan = {x:e.clientX, y:e.clientY}; return; }
    var r = cv.getBoundingClientRect();
    var w = s2w(e.clientX - r.left, e.clientY - r.top);
    // node tool: grab a vertex handle to drag it
    if (TOOL === 'node' && NODE && DOC.ents[NODE.ent]){
      var dpts = nodePtsOf(DOC.ents[NODE.ent]);
      if (dpts){
        var dtol = 8/VIEW.scale;
        for (var di = 0; di < dpts.length; di++){
          if (Math.hypot(w.x-dpts[di][0], w.y-dpts[di][1]) < dtol){
            NODE.drag = di; NODE.pushed = false;
            draw(); return;              // don't fall through to the click handler
          }
        }
      }
    }
    // select tool: grab a transform handle
    if (TOOL === 'select' && SEL.length){
      var hh = handleAt(e.clientX - r.left, e.clientY - r.top);
      if (hh){
        var b0 = selBBox();
        DRAW = {stage:'xform', h:hh, b0:b0, start:{x:w.x, y:w.y}, pushed:false,
                pivot: HANDLES.pivot || {x:(b0.x0+b0.x1)/2, y:(b0.y0+b0.y1)/2},
                snaps: SEL.map(function(si){ return snapJSON(DOC.ents[si]); })};
        draw(); return;
      }
    }
    toolClick(w, MOUSE.snap || resolveSnap(w));
  });
  cv.addEventListener('pointermove', function(e){
    var r = cv.getBoundingClientRect();
    MOUSE.mx = e.clientX - r.left; MOUSE.my = e.clientY - r.top;
    if (!FLOAT_AT && document.activeElement !== document.getElementById('promptIn')) placeFloatIn();
    if (pan){
      VIEW.ox += e.clientX - pan.x; VIEW.oy += e.clientY - pan.y;
      pan = {x:e.clientX, y:e.clientY};
      draw(); return;
    }
    var w = s2w(MOUSE.mx, MOUSE.my);
    MOUSE.shift = e.shiftKey;                        // Shift locks a line to the nearest 45 degrees
    MOUSE.snap = resolveSnap(w);
    toolMgrHover(w);   // edit tools compute check/X status for the geometry under the cursor
    // transform handle drag
    if (TOOL === 'select' && DRAW && DRAW.stage === 'xform'){
      if (e.buttons & 1){
        var pw = (MOUSE.snap && MOUSE.snap.k !== 'grid') ? MOUSE.snap : w;   // snap to shapes, not the grid
        xformApply(DRAW, pw, e.altKey, e.shiftKey);
      }
      updateReadout(); draw(); return;
    }
    // cursor shows what a handle will do
    if (TOOL === 'select' && !(e.buttons & 1)){
      var hov = handleAt(MOUSE.mx, MOUSE.my);
      cv.style.cursor = hov ? hov.cur : '';
    } else if (TOOL !== 'select' && cv.style.cursor) cv.style.cursor = '';
    // marquee
    if (TOOL==='select' && DRAW && DRAW.stage==='marq' && (e.buttons & 1)){
      DRAW.ex = w.x; DRAW.ey = w.y;
    }
    // node tool: dragging a vertex
    if (TOOL === 'node' && NODE && NODE.drag !== null && NODE.drag !== undefined && (e.buttons & 1)){
      var ndEnt = DOC.ents[NODE.ent];
      if (ndEnt && ndEnt.pts && ndEnt.pts[NODE.drag]){
        if (!NODE.pushed){ pushUndo(); NODE.pushed = true; }
        ndEnt.pts[NODE.drag][0] = MOUSE.snap.x;
        ndEnt.pts[NODE.drag][1] = MOUSE.snap.y;
        ndEnt._tess = null; ndEnt._tess2 = null;
        persist(); draw();
      }
      return;
    }
    // dragging selection
    if (TOOL==='select' && DRAW && DRAW.stage==='drag' && SEL.length && (e.buttons & 1)){
      var dx = MOUSE.snap.x - DRAW.lx, dy = MOUSE.snap.y - DRAW.ly;
      if (dx || dy){
        if (!DRAW.pushed){ pushUndo(); DRAW.pushed = true; }
        SEL.forEach(function(si){ moveEntity(DOC.ents[si], dx, dy); });
        DRAW.lx = MOUSE.snap.x; DRAW.ly = MOUSE.snap.y;
        DRAW.moved = true; persist();
      }
    }
    updateReadout(); draw();
  });
  cv.addEventListener('pointerup', function(){
    pan = null;
    if (TOOL === 'node' && NODE && NODE.drag !== null && NODE.drag !== undefined){
      NODE.drag = null; NODE.pushed = false; draw();
    }
    if (TOOL === 'select' && DRAW && DRAW.stage === 'xform'){
      var fin = DRAW; DRAW = null;
      if (fin.h.kind !== 'pivot' && fin.h.kind !== 'rot') HANDLES.pivot = null;
      // released where it started? then nothing changed: drop the undo step
      if (fin.pushed && SEL.every(function(si, k){ return snapJSON(DOC.ents[si]) === fin.snaps[k]; })){
        UNDO.pop(); fin.pushed = false;
      }
      if (fin.pushed) persist();
      if (fin.note === 'ellipse')
        toast('info', 'Circles became ellipses', 'Stretching in one direction turns circles and arcs into ellipse outlines. Drag a corner without Shift to keep them round.');
      else if (fin.note === 'text')
        toast('info', 'Angled text scaled evenly', 'Text at an angle can only be scaled evenly. Convert it to curves first to stretch it.');
      draw(); return;
    }
    if (TOOL==='select' && DRAW && DRAW.stage==='drag'){
      // clicking a shape that was already selected, without moving, switches scale <-> rotate
      if (!DRAW.moved && DRAW.wasSel && HANDLES.active) HANDLES.mode = HANDLES.mode === 'scale' ? 'rotate' : 'scale';
      else if (DRAW.moved) HANDLES.pivot = null;
      DRAW = null; draw();
    }
    else if (TOOL==='select' && DRAW && DRAW.stage==='marq'){
      var m = DRAW; DRAW = null;
      var a = w2s(m.sx, m.sy), b = w2s(m.ex, m.ey);
      if (Math.hypot(b.x-a.x, b.y-a.y) < 4){        // it was a click on empty space
        if (!m.shift) SEL = [];
        draw(); return;
      }
      var crossing = m.ex < m.sx;                    // right-to-left = crossing select
      var rx0 = Math.min(m.sx,m.ex), rx1 = Math.max(m.sx,m.ex);
      var ry0 = Math.min(m.sy,m.ey), ry1 = Math.max(m.sy,m.ey);
      var picked = [];
      DOC.ents.forEach(function(en, i){
        if (!entEditable(en)) return;                  // hidden or locked layer
        var bb = entBBox(en);
        var inside = bb.x0 >= rx0 && bb.x1 <= rx1 && bb.y0 >= ry0 && bb.y1 <= ry1;
        var touches = bb.x1 >= rx0 && bb.x0 <= rx1 && bb.y1 >= ry0 && bb.y0 <= ry1;
        if (crossing ? touches : inside) picked.push(i);
      });
      if (m.shift){
        picked.forEach(function(i){ if (SEL.indexOf(i) < 0) SEL.push(i); });
      } else SEL = picked;
      draw();
    }
  });
  cv.addEventListener('wheel', function(e){
    e.preventDefault();
    var r = cv.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var before = s2w(mx, my);
    VIEW.scale *= (e.deltaY > 0 ? 1/1.15 : 1.15);
    VIEW.scale = Math.max(0.2, Math.min(60, VIEW.scale));
    var after = w2s(before.x, before.y);
    VIEW.ox += mx - after.x; VIEW.oy += my - after.y;
    draw();
  }, {passive:false});

  // prompt input
  var pin = document.getElementById('promptIn');
  // Fillet radius arms live as you type — no Enter needed. Other tools still commit on Enter
  // (they need a completed value: coordinates, counts, sweeps). For fillet the field is just the
  // standing radius, so every keystroke that parses to a positive number updates it immediately.
  pin.addEventListener('input', function(){
    if (TOOL !== 'fillet') return;
    var v = lenIn(pin.value);                 // document units, or whatever unit is typed
    if (!isNaN(v) && v > 0 && isFinite(v) && v <= 10000){
      UICFG.filletR = v;
      uiCfgSave();
      filletRShow();
    }
  });
  // the Radius box: live as you type, like the prompt; Enter or Esc hands the keys back to the drawing
  var frIn = document.getElementById('filletR');
  frIn.addEventListener('input', function(){
    var v = lenIn(frIn.value);
    if (!isNaN(v) && v > 0 && isFinite(v) && v <= 10000){
      UICFG.filletR = v; uiCfgSave();
      if (TOOL === 'fillet') document.getElementById('promptLbl').textContent = document.getElementById('promptLbl').textContent.replace(/R[\d.]+/, 'R' + v);
    }
  });
  frIn.addEventListener('keydown', function(e){
    e.stopPropagation();                      // letters here are the radius (e.g. "3mm"), not tool shortcuts
    if (e.key === 'Enter' || e.key === 'Escape'){ filletRShow(); frIn.blur(); }
  });
  frIn.addEventListener('blur', filletRShow);
  pin.addEventListener('keydown', function(e){
    // A tool-hotkey letter typed while the field is focused switches tools (letters are never part
    // of a numeric entry). This lets you go fillet -> type radius -> press T for trim without
    // having to click away from the field first. Only when the field holds no partial number.
    var k = e.key.toLowerCase();
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && letterIsHotkey(k, pin.value)){
      pin.value = ''; pin.blur();
      setTool(TOOL_HOTKEYS[k]);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (e.key === 'Enter'){
      if (TOOL === 'fillet'){ pin.value = ''; stagePrompt('fillet0'); e.stopPropagation(); return; }
      toolCommitText(pin.value); pin.value='';
    }
    if (e.key === 'Escape'){
      pin.value = ''; pin.blur();
      if (DRAW){ DRAW = null; if (TOOL !== 'select') stagePrompt(TOOL + '0'); else hidePrompt(); }
      else if (TOOL !== 'select'){ setTool('select'); }
      draw();
    }
    e.stopPropagation();
  });

  // global keys: type-to-enter numbers, tool hotkeys, editing
  window.addEventListener('keydown', function(e){
    if (!document.getElementById('textModal').hidden) return;   // the text dialog owns the keyboard
    if (!document.getElementById('nestModal').hidden) return;   // so does the nesting dialog
    if (!document.getElementById('paramModal').hidden) return;  // and the parameters list
    if (!document.getElementById('libModal').hidden) return;    // and the tool library
    if (!document.getElementById('toolModal').hidden) return;   // and tool details
    if (!document.getElementById('dlgModal').hidden) return;    // and an in-app dialog
    if (!document.getElementById('woodModal').hidden) return;   // and Preview in wood
    if (e.key === 'Escape' && !document.getElementById('msgPanel').hidden){ setMsgPanel(false); return; }
    var inField = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
    // Ctrl-combos are global: they work from anywhere, including while an input has focus,
    // and regardless of whether a tool is mid-operation.
    if (e.ctrlKey && !e.altKey){
      var ck = e.key.toLowerCase();
      if (ck === 'z'){ e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }   // Ctrl+Shift+Z: redo, as most programs
      if (ck === 'y'){ e.preventDefault(); doRedo(); return; }
      if (ck === 'g' && SEL.length){ e.preventDefault(); if (e.shiftKey) doUngroupSelectionRef(); else doGroupSelectionRef(); return; }
      if (ck === 'u' && SEL.length){ e.preventDefault(); doUngroupSelectionRef(); return; }
    }
    if (inField) return;   // everything below is canvas-context only
    if (e.key === 'Escape'){
      if (DRAW && DRAW.stage === 'xform'){
        SEL.forEach(function(si, k){ restoreInto(DOC.ents[si], DRAW.snaps[k]); });
        if (DRAW.pushed) UNDO.pop();
        DRAW = null;
      }
      else if (DRAW){ DRAW = null; if (TOOL !== 'select') stagePrompt(TOOL + '0'); else hidePrompt(); }
      else if (NODE){ NODE = null; stagePrompt('node0'); }     // close an open node-edit shape
      else if (CUT){ cutClose(); }                             // cancel the toolpath editor
      else if (MIR){ mirClose(); setTool('select'); }          // cancel the mirror
      else if (OFF){ offClose(); setTool('select'); }          // cancel the offset
      else if (MEAS){ MEAS = null; }                           // clear the last measurement
      else if (TOOL !== 'select'){ setTool('select'); }
      else if (HANDLES.active){ HANDLES.active = false; }
      else if (SEL.length){ SEL = []; }
      draw(); return;
    }
    if (e.key.toLowerCase() === 'd' && TOOL === 'select' && SEL.length === 2 && !e.ctrlKey){
      // the edges clicked when each shape was selected (not whichever is nearest the other's centre)
      var dA = SELAT[entId(DOC.ents[SEL[0]])], dB = SELAT[entId(DOC.ents[SEL[1]])];
      var r2 = relInfo(DOC.ents[SEL[0]], DOC.ents[SEL[1]], dA, dB);
      if (r2.kind === 'angle'){
        showPrompt('Lines are not parallel (\u2220 ' + r2.cur.toFixed(2) + '\u00b0) \u2014 distance needs parallel lines. Esc to close.', '', false);
        return;
      }
      if (r2.kind === 'unsupported'){
        showPrompt('No dimension for this pair yet. Esc to close.', '', false);
        return;
      }
      DRAW = {stage:'dimEdit2', a:SEL[1], b:SEL[0]};      // the shape picked LAST stays put
      var _pr = relInfo(DOC.ents[SEL[0]], DOC.ents[SEL[1]], dA, dB);
      var _rad = relRadius(DOC.ents[SEL[0]], DOC.ents[SEL[1]]);
      showPrompt(_rad > 0
        ? 'Distance \u2014 type a number for CENTRE distance, or prefix E for EDGE (e.g. "E5" = edge 5\u00a0mm away). The second-selected item moves.'
        : 'Distance between the two \u2014 type the new value; the second-selected item moves',
        _pr && _pr.cur ? _pr.cur.toFixed(2) : '', true);
      return;
    }
    if (e.key.toLowerCase() === 'd' && TOOL === 'select' && SEL.length === 1 && !e.ctrlKey){
      var de = DOC.ents[SEL[0]];
      DRAW = {stage:'dimEdit', ent:SEL[0]};
      if (de.t === 'line'){
        var dl = Math.hypot(de.x2-de.x1, de.y2-de.y1);
        showPrompt('Line length \u2014 type new length ("80") or length<angle ("80<45"); start point stays anchored', dl.toFixed(2), true);
      } else if (de.t === 'circle'){
        showPrompt('Circle \u2014 type new diameter ("6"), or R for radius ("R3")', (de.r*2).toFixed(2), true);
      } else if (de.t === 'arc'){
        showPrompt('Arc \u2014 type new radius; center and angles stay', de.r.toFixed(2), true);
      } else if (de.t === 'rect'){
        showPrompt('Rect \u2014 type new "W,H"; min corner stays anchored', de.w.toFixed(2) + ',' + de.h.toFixed(2), true);
      } else {
        showPrompt('Polyline \u2014 press N for node editing to move or dimension individual points', '', false);
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !SEL.length && DIMSEL !== null && DOC.dims && DOC.dims[DIMSEL]){
      deleteDim(DIMSEL); e.preventDefault(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEL.length){
      deleteSelection(); return;                 // clipboard.js: the shapes, and the dimensions that measured them
    }
    if (SEL.length && (e.key.indexOf('Arrow') === 0)){
      e.preventDefault();
      var st = e.shiftKey ? 0.1 : 1;
      var dx = e.key==='ArrowLeft' ? -st : e.key==='ArrowRight' ? st : 0;
      var dy = e.key==='ArrowDown' ? -st : e.key==='ArrowUp' ? st : 0;
      pushUndo();
      SEL.forEach(function(si){ moveEntity(DOC.ents[si], dx, dy); });
      persist(); draw(); return;
    }
    if (e.key === 'F9'){ e.preventDefault(); alignBtnClick('mat'); return; }
    // Shift+H / Shift+V flip the selection (Select tool only, so mirror's typed H/V stay data)
    if (e.shiftKey && !e.ctrlKey && !e.altKey && TOOL === 'select' && SEL.length &&
        (e.key === 'H' || e.key === 'h' || e.key === 'V' || e.key === 'v')){
      e.preventDefault(); flipBtnRef(e.key.toLowerCase() === 'h'); return;
    }
    // Shift+M mirror, Shift+R rotate: the tools Fusion gives no key of their own
    if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && SHIFT_HOTKEYS[e.key.toLowerCase()] &&
        DRAW === null && document.activeElement !== document.getElementById('promptIn')){
      e.preventDefault(); setTool(SHIFT_HOTKEYS[e.key.toLowerCase()]); return;
    }
    // construction toggle works whenever something is selected, whatever the active tool
    if ((e.key === 'x' || e.key === 'X') && SEL.length && !e.ctrlKey){
      pushUndo();
      SEL.forEach(function(i){
        var en = DOC.ents[i];
        if (en.con) delete en.con; else en.con = true;
      });
      persist(); draw(); return;
    }
    // if the entry field already has focus, let ITS handler own typing and Enter
    var pinEl = document.getElementById('promptIn');
    if (document.activeElement === pinEl) return;
    if (!e.ctrlKey && !e.altKey && e.key.length === 1 && letterIsHotkey(e.key.toLowerCase(), pinEl.value)){
      setTool(TOOL_HOTKEYS[e.key.toLowerCase()]); return;
    }
    // any printable char while a tool is live routes into the entry bar
    if (TOOL !== 'select' && e.key.length === 1 && !e.ctrlKey && !e.altKey){
      document.getElementById('promptBar').classList.add('on');
      var fbox = document.getElementById('floatIn');
      fbox.hidden = false;                                  // typing opens the box at the cursor
      if (!document.getElementById('floatTag').textContent)
        document.getElementById('floatTag').textContent = unitTag();
      placeFloatIn();
      pinEl.focus();
      pinEl.value += e.key;
      pinEl.dispatchEvent(new Event('input'));             // so it takes effect at once (the fillet radius did only from the 2nd key)
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && TOOL !== 'select'){ toolCommitText(pinEl.value); pinEl.value=''; return; }
    if (e.key === 'Home'){ e.preventDefault(); fit(); return; }   // F is always Fillet, as in Fusion
  });

  new ResizeObserver(function(){ draw(); }).observe(cv);
}
document.addEventListener('DOMContentLoaded', function(){
  wire();
  document.getElementById('verSub').textContent = 'precision 2D sketcher — v' + DESIGN_VERSION;
  document.title = '454 Design v' + DESIGN_VERSION;
});
