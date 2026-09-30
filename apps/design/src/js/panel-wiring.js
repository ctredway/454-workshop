function wirePanel(){
  document.querySelectorAll('#toolPanel .tool[data-tool]').forEach(function(b){
    b.classList.toggle('active', b.dataset.tool === TOOL);
    b.addEventListener('click', function(){ setTool(b.dataset.tool); });
  });
  document.getElementById('machAreaBtn').addEventListener('click', machAreaToggle);
  document.getElementById('dxfBtn').addEventListener('click', dxfSave);
  document.getElementById('svgBtn').addEventListener('click', svgSave);
  machAreaBtnSync();
  if (!wirePanel.jobWired){                             // Job setup's fields aren't rebuilt with the panel: wire once
    wirePanel.jobWired = true;
    ['jobMach','jobMW','jobMH','jobMAnchor','jobMOffX','jobMOffY'].forEach(function(id){
      document.getElementById(id).addEventListener('change', jobMachFromForm);
    });
    document.getElementById('jobMach').addEventListener('change', function(){
      document.getElementById('jobMachCustom').hidden = document.getElementById('jobMach').value !== 'custom';
    });
  }
  document.getElementById('clearGuides').addEventListener('click', function(){
    if (!DOC.guides.length) return;
    pushUndo(); DOC.guides = []; persist(); draw();
  });
  document.getElementById('undoBtn').addEventListener('click', doUndo);
  document.getElementById('redoBtn').addEventListener('click', doRedo);
  document.getElementById('fitBtn2').addEventListener('click', fit);
  // ---- Group: bundle selected vectors into one object (geometry untouched) ----
  function doGroupSelection(){
    if (SEL.length < 2){
      toast('info', 'Select two or more', 'Group bundles several vectors into one object. Select at least two.');
      return;
    }
    pushUndo();
    var flat = [];
    SEL.map(function(i){ return DOC.ents[i]; })
       .forEach(function(m){ if (m.t === 'group') flat = flat.concat(m.ents); else flat.push(m); });
    var keep = DOC.ents.filter(function(_, i){ return SEL.indexOf(i) < 0; });
    keep.push({t:'group', ents: flat});
    DOC.ents = keep;
    SEL = [DOC.ents.length-1];
    persist(); draw();
    toast('ok', 'Grouped', flat.length + ' vectors are now one object. All geometry kept \u2014 it selects and moves as one piece.');
  }
  // ---- Ungroup: break groups back into their members ----
  function doUngroupSelection(){
    var groupIdx = SEL.filter(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'group'; });
    if (!groupIdx.length){
      toast('info', 'No group selected', 'Select a grouped object to break it back into separate vectors.');
      return;
    }
    pushUndo();
    var out = [], freed = 0;
    DOC.ents.forEach(function(e, i){
      if (groupIdx.indexOf(i) >= 0){ e.ents.forEach(function(me){ me.layer = e.layer; out.push(me); freed++; }); }
      else out.push(e);
    });
    DOC.ents = out; SEL = [];
    persist(); draw();
    toast('ok', 'Ungrouped', 'Broke the group into ' + freed + ' separate vectors.');
  }
  document.getElementById('groupBtn').addEventListener('click', doGroupSelection);
  document.getElementById('ungroupBtn').addEventListener('click', doUngroupSelection);
  doGroupSelectionRef = doGroupSelection;
  doUngroupSelectionRef = doUngroupSelection;

  document.getElementById('nestBtn').addEventListener('click', openNestDialog);
  document.getElementById('flipHBtn').addEventListener('click', function(){ flipBtnRef(true); });
  document.getElementById('flipVBtn').addEventListener('click', function(){ flipBtnRef(false); });
  document.getElementById('curvesBtn').addEventListener('click', curvesBtnClick);
  [['alMat','mat'],['alMatX','matx'],['alMatY','maty'],['alCenter','center'],['alHCenter','hcenter'],['alVCenter','vcenter'],
   ['alLeft','left'],['alRight','right'],['alTop','top'],['alBottom','bottom'],['alDistH','disth'],['alDistV','distv']]
    .forEach(function(pr){ document.getElementById(pr[0]).addEventListener('click', function(){ alignBtnClick(pr[1]); }); });
  ['weld','subtract','intersect'].forEach(function (k){
    document.getElementById(k + 'Btn').addEventListener('click', function(){ boolBtnClick(k); });
  });
  document.getElementById('joinBtn').addEventListener('click', function(){
    if (!SEL.length){
      toast('info', 'Nothing selected', 'Select the open vectors you want to join, then press Join.');
      stagePrompt('selFirst'); return;
    }
    var n0 = DOC.ents.length;
    if (doJoin()){
      persist(); draw();
      toast('ok', doJoin.merged ? 'Merged into one outline' : 'Joined',
            doJoin.merged ? 'Opened the shapes at their junctions and chained everything into a single profile.'
                          : 'Connected the selected pieces.');
      doJoin.merged = false;
    } else if (doJoin.lastMiss === 'closed'){
      toast('info', 'Those vectors are already closed',
        'Join stitches OPEN vectors whose ends meet into one contour. If you want these to behave as a single object while keeping all the geometry, use Group instead.');
    } else {
      toast('warn', 'Nothing to join', 'Select at least two open pieces (lines, arcs, or open polylines) whose ends meet.');
    }
  });
  document.getElementById('explodeBtn').addEventListener('click', function(){
    if (!SEL.length){
      toast('info', 'Nothing selected', 'Select shapes to break into separate lines and arcs.');
      stagePrompt('selFirst'); return;
    }
    if (SEL.some(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'text'; })){
      var nx = convertTextsToCurves(SEL.slice());
      if (nx) toast('ok', 'Converted to curves', nx + ' text object' + (nx>1?'s are':' is') + ' now ordinary shapes, grouped per text.');
      return;
    }
    if (SEL.some(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'group'; })){
      toast('info', 'That is a group', 'Use Ungroup to break a grouped object apart. Explode breaks a contour into lines and arcs.');
      return;
    }
    if (doExplode()){ persist(); draw(); toast('ok', 'Exploded', 'Broke the contour into individual lines and arcs.'); }
    else toast('warn', 'Nothing to explode', 'Explode works on rectangles, polylines and paths.');
  });
  Array.prototype.forEach.call(document.getElementById('stkOriginPick').children, function (b) {
    if (b.dataset && b.dataset.o) b.addEventListener('click', function(){ setJobOrigin(b.dataset.o); });
  });
  function jobOpen(){ syncStockUI(); jobMachToForm(); document.getElementById('jobModal').hidden = false; document.getElementById('stkW').focus(); }
  function jobClose(){ document.getElementById('jobModal').hidden = true; }
  window.jobOpen = jobOpen; window.jobClose = jobClose;
  document.getElementById('jobBtn').addEventListener('click', jobOpen);
  document.getElementById('setJobBtn').addEventListener('click', function(){ document.getElementById('settingsModal').hidden = true; jobOpen(); });
  document.getElementById('jobX').addEventListener('click', jobClose);
  document.getElementById('jobDone').addEventListener('click', jobClose);
  document.getElementById('jobModal').addEventListener('pointerdown', function(e){ if (e.target === e.currentTarget) jobClose(); });
  ['trThr','trInv','trSmooth','trSpeck','trW','trBg','trFit'].forEach(function (id) {
    var el = document.getElementById(id);
    // re-trace after a short pause while a slider or box is still changing, at once on a final change
    el.addEventListener('input', function(){
      if (!TRACE) return;
      clearTimeout(traceRun.pending);
      traceRun.pending = setTimeout(function(){ if (TRACE){ traceFromForm(); traceRun(); } }, 140);
    });
    el.addEventListener('change', function(){ if (TRACE){ clearTimeout(traceRun.pending); traceFromForm(); traceRun(); } });
  });
  document.getElementById('trAuto').addEventListener('click', function(){ if (TRACE){ TRACE.thr = traceOtsu(TRACE.lum); traceToForm(); traceRun(); } });
  document.getElementById('trOk').addEventListener('click', traceApply);
  document.getElementById('trCancel').addEventListener('click', traceClose);
  document.getElementById('traceX').addEventListener('click', traceClose);
  document.getElementById('layerList') && null;
  document.getElementById('newBtn').addEventListener('click', newDrawing);         // unsaved.js
  document.getElementById('saveBtn').addEventListener('click', function(){ saveDrawing(); });
  document.getElementById('saveAsBtn').addEventListener('click', function(){ saveDrawing(true); });
  document.getElementById('recoverBtn').addEventListener('click', recoverDrawing);
  syncRecoverBtn();
  document.getElementById('loadBtn').addEventListener('click', function(){ openFiles(); });   // unsaved.js
}

