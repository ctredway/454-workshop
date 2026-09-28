/* ---------------- controller config ---------------- */
var GRBL_SETTING_NAMES = {
  0:'step pulse, µs',1:'step idle delay, ms',2:'step invert mask',3:'direction invert mask',
  4:'step enable invert',5:'limit pins invert',6:'probe pin invert',10:'status report mask',
  11:'junction deviation, mm',12:'arc tolerance, mm',13:'report in inches',
  20:'soft limits enabled',21:'hard limits enabled',22:'homing enabled',
  23:'homing direction mask',24:'homing feed, mm/min',25:'homing seek, mm/min',
  26:'homing debounce, ms',27:'homing pull-off, mm',30:'max spindle rpm',31:'min spindle rpm',
  32:'laser mode',100:'X steps/mm',101:'Y steps/mm',102:'Z steps/mm',
  110:'X max rate, mm/min',111:'Y max rate, mm/min',112:'Z max rate, mm/min',
  120:'X accel, mm/s²',121:'Y accel, mm/s²',122:'Z accel, mm/s²',
  130:'X max travel, mm',131:'Y max travel, mm',132:'Z max travel, mm'
};

function doQuery(){
  if (SERIAL.queried || !SERIAL.connected) return;
  SERIAL.queried = true;
  logC('sys', 'reading controller: $I, $$, $#');
  setTimeout(function(){ sendLine('$I', true); }, 100);
  setTimeout(function(){ sendLine('$$', true); }, 300);
  setTimeout(function(){ sendLine('$#', true); }, 700);
  setTimeout(function(){ if (SERIAL.connected) controllerCheckShow(true); }, 1600);   // after $$ has come back
}

function detectModel(){
  var s = SERIAL.settings, x = s[130], y = s[131];
  if (x === undefined || y === undefined) return null;
  var models = [
    [420,430,'Shapeoko 3'],[830,430,'Shapeoko XL'],[830,850,'Shapeoko XXL'],
    [845,850,'Shapeoko XXL'],[870,440,'Shapeoko Pro XL'],[870,850,'Shapeoko Pro XXL'],
    [445,445,'Shapeoko 4 Standard'],[203,203,'Nomad'],[205,205,'Nomad']
  ];
  var best = null, bd = 1e9;
  for (var i = 0; i < models.length; i++){
    var d = Math.abs(models[i][0]-x) + Math.abs(models[i][1]-y);
    if (d < bd){ bd = d; best = models[i]; }
  }
  var name = bd <= 30 ? best[2] : 'custom machine';
  var z = s[102];
  var zt = z === 40 ? 'belt Z' : z === 200 ? 'Z-Plus' : z === 320 ? 'HDZ' : '';
  return {name:name, zt:zt, x:x, y:y, z:s[132]};
}

var cfgApplyTimer = null;
function scheduleCfgApply(){
  if (cfgApplyTimer) clearTimeout(cfgApplyTimer);
  cfgApplyTimer = setTimeout(applyCfg, 300); // after the $$ burst settles
}
// $30 tells the spindle type on a Carbide board: 1000 for a trim router (its speed is on its dial),
// the real maximum, usually 24000, for a VFD.
function spindleFromController(){
  var s = SERIAL.settings;
  if (s[30] === undefined || PROFILE.spindle.typeUser) return;
  var t = s[30] <= 1000 ? 'router' : (s[30] >= 10000 ? 'vfd' : null);
  if (!t || t === PROFILE.spindle.type) return;
  PROFILE.spindle.type = t;
  var el = document.getElementById('spinType'); if (el) el.value = t;
  if (t === 'vfd' && (PROFILE.spindle.spinup || 0) < 7){ PROFILE.spindle.spinup = 7; var su = document.getElementById('spinupSec'); if (su) su.value = 7; }
  profileSave();
  logC('sys', 'spindle set to ' + (t === 'vfd' ? 'VFD' : 'trim router') + ' from the controller ($30 = ' + s[30] + ')');
}
// The spindle speed box only offers what the controller can do, for a VFD.
function applySpindleRange(){
  var el = document.getElementById('rpmIn'), s = SERIAL.settings;
  if (!el) return;
  if (PROFILE.spindle.type === 'vfd' && s[30] > 0){
    el.max = s[30]; el.min = s[31] > 0 ? s[31] : 0;
    var v = parseFloat(el.value) || 0;
    if (v > s[30]) el.value = s[30]; else if (s[31] > 0 && v < s[31]) el.value = s[31];
  } else { el.removeAttribute && el.removeAttribute('max'); el.removeAttribute && el.removeAttribute('min'); }
}
function applyCfg(){
  spindleFromController();
  applySpindleRange();
  cfgApplyTimer = null;
  var s = SERIAL.settings;
  var m = detectModel();
  if (m){
    document.getElementById('modelChip').textContent =
      m.name + (m.zt ? ' · ' + m.zt : '') + ' · travel ' + m.x + ' × ' + m.y + (m.z ? ' × ' + m.z : '') + ' mm';
    // sync the work-area envelope to the board's real travel
    var w = document.getElementById('envW'), d = document.getElementById('envD');
    var cw = parseFloat(w.value), cd = parseFloat(d.value);
    var differs = !isFinite(cw) || !isFinite(cd) || Math.abs(cw - m.x) > 1 || Math.abs(cd - m.y) > 1;
    if (PROFILE.view.envUser){
      // you chose this work area, so it stays; just say if the controller disagrees
      if (differs) logC('sys', 'keeping your work area of ' + cw + ' \u00d7 ' + cd + ' mm; the controller\u2019s travel is ' + m.x + ' \u00d7 ' + m.y +
                        ' mm (choose \u201cFrom the controller\u201d in Settings \u2192 Machine to use that)');
    } else if (differs){
      w.value = m.x; d.value = m.y;
      buildStage(); buildEnvelope(); renderChecks(); readUIToProfile();
      logC('sys', 'work area set from controller: ' + m.x + ' \u00d7 ' + m.y + ' mm');
    }
  }
  // fast-jog rates from the controller's max rates (once per connect)
  if (!SERIAL.jogRateApplied && s[110] !== undefined){
    SERIAL.jogRateApplied = true;
    document.getElementById('jogFeedXY').value = Math.round(s[110]);
    if (s[112] !== undefined) document.getElementById('jogFeedZ').value = Math.round(s[112]);
    readUIToProfile();
    logC('sys', 'fast jog rates set from controller: XY ' + Math.round(s[110]) +
         (s[112] !== undefined ? ', Z ' + Math.round(s[112]) : '') + ' mm/min');
  }
  // re-time a loaded file with the controller's acceleration, once per connect
  if (!SERIAL.accelApplied && s[120] > 0 && s[121] > 0 && s[122] > 0 && MODEL){
    SERIAL.accelApplied = true;
    var before = MODEL.totalTime;
    loadText(MODEL.lines.join('\n'), document.getElementById('fileName').textContent);
    logC('sys', 'time estimate now uses the controller\u2019s acceleration: ~' + fmtTime(before) + ' \u2192 ~' + fmtTime(MODEL.totalTime));
  }
  // real rapid rate for time estimates
  if (!SERIAL.rateApplied && s[110] !== undefined && MODEL){
    var rr = Math.min(s[110], s[111] !== undefined ? s[111] : s[110]);
    var cur = parseFloat(document.getElementById('rapidRate').value);
    if (Math.abs(cur - rr) > cur * 0.02){
      SERIAL.rateApplied = true;
      document.getElementById('rapidRate').value = rr;
      readUIToProfile();
      loadText(MODEL.lines.join('\n'), document.getElementById('fileName').textContent);
      logC('sys', 'time estimate now uses the controller rapid rate: ' + rr + ' mm/min');
    }
  }
  renderCfgTable();
}
function renderCfgTable(){
  var t = document.getElementById('cfgTable');
  var keys = Object.keys(SERIAL.settings).map(Number).sort(function(a,b){ return a-b; });
  if (!keys.length){ t.style.display = 'none'; return; }
  var html = SERIAL.buildInfo ? '<div style="color:var(--info)">' + escapeHtml(SERIAL.buildInfo) + '</div>' : '';
  for (var i = 0; i < keys.length; i++){
    var k = keys[i];
    html += '<div>$' + k + ' = ' + SERIAL.settings[k] +
            (GRBL_SETTING_NAMES[k] ? '  <span style="color:var(--faint)">— ' + GRBL_SETTING_NAMES[k] + '</span>' : '') + '</div>';
  }
  if (SERIAL.offsets.G28) html += '<div style="color:var(--info)">G28 position: ' + SERIAL.offsets.G28.join(', ') + '</div>';
  if (SERIAL.offsets.TLO) html += '<div style="color:var(--info)">tool length offset: ' + SERIAL.offsets.TLO.join(', ') + '</div>';
  t.innerHTML = html;
  t.style.display = 'block';
  document.getElementById('cfgChip').textContent = keys.length + ' settings read';
}

/* fits-from-current-zero check against the board's real travel */
function travelPreflight(){
  var s = SERIAL.settings;
  if (!SERIAL.connected || s[130] === undefined || s[131] === undefined || !MODEL) return null;
  var bb = modelBBox(MODEL), tol = 0.5, msgs = [];
  function chk(axis, lo, hi, travel, label){
    var mLo = lo + SERIAL.wco[axis], mHi = hi + SERIAL.wco[axis];
    var rg = axisRange(axis) || {min: -travel, max: 0};
    if (mHi > rg.max + tol) msgs.push(label + '+ side by ' + (mHi - rg.max).toFixed(1) + ' mm');
    if (mLo < rg.min - tol) msgs.push(label + '− side by ' + (rg.min - mLo).toFixed(1) + ' mm');
  }
  chk('x', bb.min.x, bb.max.x, s[130], 'X overruns the ');
  chk('y', bb.min.y, bb.max.y, s[131], 'Y overruns the ');
  if (s[132] !== undefined) chk('z', bb.min.z, bb.max.z, s[132], 'Z overruns the ');
  return {ok: !msgs.length, msgs: msgs};
}

