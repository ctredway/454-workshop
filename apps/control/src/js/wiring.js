/* ============================================================
   Config + wiring
   ============================================================ */
function cfg(){
  return {
    w: parseFloat(document.getElementById('envW').value) || 425,
    d: parseFloat(document.getElementById('envD').value) || 425,
    origin: document.getElementById('originSel').value,
    checkEnvelope: document.getElementById('checkEnvelope').checked,
    showEnvelope: document.getElementById('showEnvelope').checked,
    stock: parseFloat(document.getElementById('stockThk').value) || 0,
    rapidRate: parseFloat(document.getElementById('rapidRate').value) || 5000
  };
}

// The time estimate uses the controller's own limits once they've been read.
function plannerOpts(){
  var s = SERIAL.settings || {}, o = {rapidRate: cfg().rapidRate};
  if (s[120] > 0 && s[121] > 0 && s[122] > 0){
    o.accel = {x: s[120], y: s[121], z: s[122]};
    o.maxRate = {x: s[110], y: s[111], z: s[112]};
    o.junctionDev = s[11];
  }
  return o;
}
function loadText(text, name){
  if (typeof JOB !== 'undefined' && JOB.active){
    uiNote('A job is running', 'Stop the job on the machine before loading a new file.');
    return;
  }
  document.getElementById('fileName').textContent = name;
  document.getElementById('dropHint').style.display = 'none';
  MODEL = parseGcode(text, plannerOpts());
  doneCount = 0; playT = 0; playing = false; updatePlayBtn();
  curHiLine = -1; issueSelLine = -1;
  buildToolpath(MODEL);
  var bb = modelBBox(MODEL);
  buildStage();
  buildEnvelope();
  showJobFromTop();                               // frame the job, and animate to the top view
  renderCode();
  renderChecks();
  renderStats();
  TPSUM_SEL = null; renderToolpathSummary();
  var ss = document.getElementById('sectionSel');
  if (MODEL.sections && MODEL.sections.length){
    var opts = '<option value="">jump to toolpath…</option>';
    MODEL.sections.forEach(function(sec){
      opts += '<option value="' + sec.line + '">' + escapeHtml(sec.name) + '</option>';
    });
    ss.innerHTML = opts;
    ss.style.display = '';
  } else {
    ss.style.display = 'none';
  }
  if (MODEL.segs.length) setTime(0);
  else document.getElementById('timeReadout').textContent = '0:00 / 0:00';
}

var SAMPLE = [
'(454 Control sample — 60mm pocket + tabbed profile, 2 tools)',
'(Posted in the style of VCarve GRBL mm output)',
'(Toolpaths used in this file:)',
'(Circle Pocket)',
'(Outside Profile)',
'(Tools used in this file: )',
'(1 = End Mill {6 mm})',
'(2 = End Mill {3 mm})',
'G21',
'G90',
'G17',
'(Toolpath:- Circle Pocket)',
'T1 M6',
'M3 S18000',
'G0 Z6.000',
'G0 X45.000 Y40.000',
'G1 Z-1.500 F250',
'G3 X45.000 Y40.000 I-12.000 J0.000 F900',
'G3 X45.000 Y40.000 I-12.000 J0.000',
'G1 Z-3.000 F250',
'G3 X45.000 Y40.000 I-12.000 J0.000 F900',
'G3 X45.000 Y40.000 I-12.000 J0.000',
'G0 Z6.000',
'M5',
'(Toolpath:- Outside Profile)',
'T2 M6',
'M3 S16000',
'G0 X-5.000 Y10.000',
'G1 Z-2.000 F200',
'G1 Y70.000 F700',
'G2 X5.000 Y80.000 I10.000 J0.000',
'G1 X85.000',
'G2 X95.000 Y70.000 I0.000 J-10.000',
'G1 Y10.000',
'G2 X85.000 Y0.000 I-10.000 J0.000',
'G1 X5.000',
'G2 X-5.000 Y10.000 I0.000 J10.000',
'G1 Z-4.000 F200',
'G1 Y70.000 F700',
'G2 X5.000 Y80.000 I10.000 J0.000',
'G1 X85.000',
'G2 X95.000 Y70.000 I0.000 J-10.000',
'G1 Y10.000',
'G2 X85.000 Y0.000 I-10.000 J0.000',
'G1 X5.000',
'G2 X-5.000 Y10.000 I0.000 J10.000',
'G0 Z6.000',
'G0 X0.000 Y0.000',
'M5',
'M30'
].join('\n');

function wire(){
  initThree();

  document.getElementById('openBtn').addEventListener('click', function(){
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function(e){
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function(){ loadText(rd.result, f.name); };
    rd.readAsText(f);
    e.target.value = '';
  });
  document.getElementById('sampleBtn').addEventListener('click', function(){
    loadText(SAMPLE, '454-sample.nc');
  });

  var dragDepth = 0;
  window.addEventListener('dragenter', function(e){ e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', function(e){ dragDepth--; if (dragDepth<=0){ dragDepth=0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function(){ loadText(rd.result, f.name); };
    rd.readAsText(f);
  });

  // tabs
  var tabs = [['tabMachine','paneMachine'],['tabCode','paneCode'],['tabTp','paneTp'],['tabChecks','paneChecks']];   // Machine first, and open
  tabs.forEach(function(t){
    document.getElementById(t[0]).addEventListener('click', function(){
      tabs.forEach(function(u){
        document.getElementById(u[0]).classList.toggle('active', u[0]===t[0]);
        document.getElementById(u[1]).classList.toggle('active', u[1]===t[1]);
      });
      if (t[1]==='paneCode') renderCode();
    });
  });

  // code interactions
  document.getElementById('sectionSel').addEventListener('change', function(e){
    if (!e.target.value) return;
    document.getElementById('followChk').checked = false;
    jumpToLine(parseInt(e.target.value, 10));
    e.target.value = '';
  });
  document.getElementById('codeScroller').addEventListener('scroll', renderCode);
  document.getElementById('codeSpacer').addEventListener('click', function(e){
    var el = e.target.closest('.cl');
    if (!el) return;
    document.getElementById('followChk').checked = false;
    jumpToLine(parseInt(el.dataset.ln, 10));
  });
  new ResizeObserver(renderCode).observe(document.getElementById('codeScroller'));

  // checks interactions
  document.getElementById('checksList').addEventListener('click', function(e){
    var el = e.target.closest('.issue');
    if (!el) return;
    issueSelLine = parseInt(el.dataset.ln, 10);
    tabs.forEach(function(u){
      document.getElementById(u[0]).classList.toggle('active', u[0]==='tabCode');
      document.getElementById(u[1]).classList.toggle('active', u[1]==='paneCode');
    });
    document.getElementById('followChk').checked = false;
    jumpToLine(issueSelLine);
    renderCode();
  });

  // transport
  document.getElementById('btnPlay').addEventListener('click', function(){
    if (!MODEL || !MODEL.segs.length) return;
    if (!playing && playT >= MODEL.totalTime) setTime(0);
    playing = !playing; updatePlayBtn();
  });
  document.getElementById('btnStart').addEventListener('click', function(){ playing=false; updatePlayBtn(); setTime(0); });
  document.getElementById('btnEnd').addEventListener('click', function(){ if(MODEL){ playing=false; updatePlayBtn(); setTime(MODEL.totalTime);} });
  document.getElementById('btnStepF').addEventListener('click', function(){ stepLine(1); });
  document.getElementById('btnStepB').addEventListener('click', function(){ stepLine(-1); });
  document.getElementById('timeSlider').addEventListener('input', function(e){
    if (!MODEL || JOB.active) return;
    playing = false; updatePlayBtn();
    setTime(parseInt(e.target.value,10)/10000 * MODEL.totalTime, true);
  });
  window.addEventListener('keydown', function(e){
    if (!document.getElementById('jogModal').hidden) return; // jog modal owns the keyboard
    if (!document.getElementById('setModal').hidden) return;  // settings modal open
    if (!document.getElementById('bzModal').hidden) return;   // probe modal open
    if (!document.getElementById('qaModal').hidden) return;   // quick-action editor open
    if (!document.getElementById('homeModal').hidden) return; // homing prompt open
    if (!document.getElementById('connModal').hidden) return; // connect prompt open
    if (!document.getElementById('dlgModal').hidden) return;  // an in-app dialog owns the keyboard
    if (!document.getElementById('toolModal').hidden) return; // so does the tool-change prompt
    // the shortcuts most programs have: Ctrl+O opens a G-code file (refused during a job, as the button is),
    // F1 the docs. Nothing here moves the machine.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o'){ e.preventDefault(); document.getElementById('openBtn').click(); return; }
    if (e.key === 'F1'){ e.preventDefault(); document.getElementById('openDocs').click(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space'){ e.preventDefault(); document.getElementById('btnPlay').click(); }
    else if (e.code === 'ArrowRight'){ stepLine(1); }
    else if (e.code === 'ArrowLeft'){ stepLine(-1); }
  });

  // hud
  document.getElementById('fitBtn').addEventListener('click', fitView);

  // settings
  document.getElementById('showRapids').addEventListener('change', function(e){
    if (rapidLine) rapidLine.visible = e.target.checked;
  });
  ['showEnvelope','envW','envD','originSel'].forEach(function(id){
    document.getElementById(id).addEventListener('change', function(){ buildStage(); buildEnvelope(); renderChecks(); });
  });
  ['checkEnvelope','stockThk'].forEach(function(id){
    document.getElementById(id).addEventListener('change', renderChecks);
  });
  document.getElementById('machinePreset').addEventListener('change', function(e){
    var val = e.target.value;
    if (val === 'ctl'){                                  // back to automatic
      PROFILE.view.envUser = false;
      var m = detectModel();
      if (m){ document.getElementById('envW').value = m.x; document.getElementById('envD').value = m.y; }
      else logC('sys', 'the work area will be filled in from the controller when you connect');
    } else {
      PROFILE.view.envUser = true;
      if (val){ var p = val.split(','); document.getElementById('envW').value = p[0]; document.getElementById('envD').value = p[1]; }
    }
    buildStage(); buildEnvelope(); renderChecks();
  });
  // typing a size is a choice too
  ['envW','envD'].forEach(function(id){
    document.getElementById(id).addEventListener('input', function(){ PROFILE.view.envUser = true; syncPresetList(); });
  });
  document.getElementById('rapidRate').addEventListener('change', function(){
    if (MODEL){
      // re-parse to rebuild timing
      var name = document.getElementById('fileName').textContent;
      loadText(MODEL.lines.join('\n'), name);
    }
  });
}

