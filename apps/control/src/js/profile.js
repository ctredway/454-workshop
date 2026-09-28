function profileSave(){
  try{ localStorage.setItem('454-control-profile', JSON.stringify(PROFILE)); }catch(e){}
}
function profileLoad(){
  try{
    var s = localStorage.getItem('454-control-profile') || localStorage.getItem('kerf-profile'); // older saves
    if (!s) return;
    var p = JSON.parse(s);
    if (p.bitSetter) PROFILE.bitSetter = Object.assign(PROFILE.bitSetter, p.bitSetter);
    if (p.bitZero)   PROFILE.bitZero   = Object.assign(PROFILE.bitZero, p.bitZero);
    if (p.spindle)   PROFILE.spindle   = Object.assign(PROFILE.spindle, p.spindle);
    if (p.jog)       PROFILE.jog       = Object.assign(PROFILE.jog, p.jog);
    if (p.run){
      var pk = Object.assign({}, PROFILE.run.park, p.run.park || {});
      PROFILE.run = Object.assign(PROFILE.run, p.run);
      PROFILE.run.park = pk;
    }
    if (p.view)      PROFILE.view      = Object.assign(PROFILE.view, p.view);
    if (Array.isArray(p.quick)) PROFILE.quick = p.quick;
    if (!PROFILE.spinupBumped && PROFILE.spindle.spinup < 7){    // one-time, for old profiles: 7 s is the floor
      PROFILE.spindle.spinup = 7;
    }
    PROFILE.spinupBumped = true;
    if (!PROFILE.highStartForced && PROFILE.run.highStart === false){
      PROFILE.run.highStart = true;                              // one-time: moving low is how clamps get hit
    }
    PROFILE.highStartForced = true;
  }catch(e){}
}
/* retract standoff below Z top-of-travel (machine coords), used by
   start-high, go-to-XY-zero, and (soon) BitSetter parking */
function travelZ(){
  var v = PROFILE.run.travelZ;
  if (!isFinite(v)) v = 5;
  return Math.min(30, Math.max(1, v));
}
// How high to go when a person has to reach the spindle: a tool change, or the end of a job.
// Near the top of Z travel, not just above the work.
function topZ(){
  var v = PROFILE.run.topZ;
  if (!isFinite(v)) v = 2;
  return Math.min(20, Math.max(0.5, v));
}
// Front centre of the machine, in machine coordinates: halfway along X, as far forward as the
// travel allows less a small margin. Taken from the controller's own limits when it has told
// us, otherwise from the work-area setting.
function frontCentre(){
  var g = SERIAL.settings || {};
  var mx = g[130] > 0 ? g[130] : PROFILE.view.envW;
  var my = g[131] > 0 ? g[131] : PROFILE.view.envD;
  if (!(mx > 0) || !(my > 0)) return null;
  var rx = axisRange('x') || {min: -mx, max: 0}, ry = axisRange('y') || {min: -my, max: 0};
  return {x: (rx.min + rx.max) / 2, y: ry.min + 10};           // 10 mm back from the front limit
}
var TC_PRESETS = {fc:'Front centre', fl:'Front left', fr:'Front right', bc:'Back centre', custom:'Captured position'};
function presetSpot(which){
  var g = SERIAL.settings || {};
  var mx = g[130] > 0 ? g[130] : PROFILE.view.envW;
  var my = g[131] > 0 ? g[131] : PROFILE.view.envD;
  if (!(mx > 0) || !(my > 0)) return null;
  var m = 10;                                        // keep clear of the limits
  var rx = axisRange('x') || {min: -mx, max: 0}, ry = axisRange('y') || {min: -my, max: 0};
  var front = ry.min + m, back = ry.max - m, left = rx.min + m, right = rx.max - m, midX = (rx.min + rx.max) / 2;
  if (which === 'fl') return {x:left,  y:front};
  if (which === 'fr') return {x:right, y:front};
  if (which === 'bc') return {x:midX,  y:back};
  return {x:midX, y:front};                          // fc
}
function toolChangeSpot(){
  var tc = PROFILE.run.tc || {};
  if (!tc.enabled) return null;
  if (tc.preset === 'custom'){
    if (tc.x === null || tc.x === undefined || tc.y === null || tc.y === undefined) return null;
    return {x:tc.x, y:tc.y, auto:false, name:'your captured position'};
  }
  var sp = presetSpot(tc.preset || 'fc');
  return sp ? {x:sp.x, y:sp.y, auto:true, name:(TC_PRESETS[tc.preset || 'fc'] || 'Front centre').toLowerCase()} : null;
}
function setIncUI(inc){
  document.querySelectorAll('#jogIncRow button[data-inc]').forEach(function(b){
    b.classList.toggle('incOn', b.dataset.inc === inc);
  });
}
function applyProfileToUI(){
  var v = function(id){ return document.getElementById(id); };
  v('bsEnable').checked = PROFILE.bitSetter.enabled;
  if (PROFILE.bitSetter.x !== null) v('bsX').value = PROFILE.bitSetter.x;
  if (PROFILE.bitSetter.y !== null) v('bsY').value = PROFILE.bitSetter.y;
  v('bzEnable').checked = PROFILE.bitZero.enabled;
  v('bzVersion').value = PROFILE.bitZero.version;
  if (PROFILE.bitZero.thk !== null) v('bzThk').value = PROFILE.bitZero.thk;
  v('spinType').value = PROFILE.spindle.type;
  v('spinupSec').value = PROFILE.spindle.spinup;
  v('jogFeedXY').value = PROFILE.jog.fastXY;
  v('jogFeedZ').value = PROFILE.jog.fastZ;
  v('highStart').checked = PROFILE.run.highStart;
  v('travelZIn').value = PROFILE.run.travelZ;
  v('uiTheme').value = UITHEME.theme === 'light' ? 'light' : 'dark';
  v('uiAccent').value = UITHEME.accent || 'gold';
  v('uiAccentHex').value = accentColour();
  v('uiAccentHex').style.display = v('uiAccent').value === 'custom' ? '' : 'none';
  v('tcEnable').checked = PROFILE.run.tc.enabled !== false;
  v('tcPreset').value = PROFILE.run.tc.preset || 'fc';
  v('tcEndPark').checked = PROFILE.run.parkEnd !== false;
  v('tcX').value = (PROFILE.run.tc.x === null || PROFILE.run.tc.x === undefined) ? '' : PROFILE.run.tc.x;
  v('tcY').value = (PROFILE.run.tc.y === null || PROFILE.run.tc.y === undefined) ? '' : PROFILE.run.tc.y;
  v('pkX').value = PROFILE.run.park.x === null ? '' : PROFILE.run.park.x;
  v('pkY').value = PROFILE.run.park.y === null ? '' : PROFILE.run.park.y;
  v('topZIn').value = PROFILE.run.topZ;
  tcAutoNote();
  setIncUI(PROFILE.jog.inc);
  v('envW').value = PROFILE.view.envW;
  v('envD').value = PROFILE.view.envD;
  syncPresetList();
  v('originSel').value = PROFILE.view.origin;
  v('stockThk').value = PROFILE.view.stock;
  v('rapidRate').value = PROFILE.view.rapidRate;
  v('checkEnvelope').checked = PROFILE.view.checkEnvelope;
  v('showEnvelope').checked = PROFILE.view.showEnvelope;
  buildStage(); buildEnvelope(); renderChecks();
}
function readUIToProfile(){
  var v = function(id){ return document.getElementById(id); };
  PROFILE.bitSetter.enabled = v('bsEnable').checked;
  PROFILE.bitSetter.x = v('bsX').value === '' ? null : parseFloat(v('bsX').value);
  PROFILE.bitSetter.y = v('bsY').value === '' ? null : parseFloat(v('bsY').value);
  PROFILE.bitZero.enabled = v('bzEnable').checked;
  PROFILE.bitZero.version = v('bzVersion').value;
  PROFILE.bitZero.thk = v('bzThk').value === '' ? null : parseFloat(v('bzThk').value);
  PROFILE.spindle.type = v('spinType').value;
  PROFILE.spindle.spinup = parseFloat(v('spinupSec').value) || 0;
  PROFILE.jog.fastXY = parseFloat(v('jogFeedXY').value) || 3000;
  PROFILE.jog.fastZ = parseFloat(v('jogFeedZ').value) || 600;
  PROFILE.run.highStart = v('highStart').checked;
  PROFILE.run.travelZ = parseFloat(v('travelZIn').value) || 5;
  UITHEME.theme = v('uiTheme').value;
  UITHEME.accent = v('uiAccent').value;
  if (v('uiAccent').value === 'custom') UITHEME.accentHex = v('uiAccentHex').value;
  PROFILE.run.tc.enabled = v('tcEnable').checked;
  PROFILE.run.tc.preset = v('tcPreset').value;
  PROFILE.run.park.enabled = !!(v('pkX').value !== '' && v('pkY').value !== '');
  PROFILE.run.parkEnd = v('tcEndPark').checked;
  PROFILE.run.tc.x = v('tcX').value === '' ? null : parseFloat(v('tcX').value);
  PROFILE.run.tc.y = v('tcY').value === '' ? null : parseFloat(v('tcY').value);
  PROFILE.run.park.x = v('pkX').value === '' ? null : parseFloat(v('pkX').value);
  PROFILE.run.park.y = v('pkY').value === '' ? null : parseFloat(v('pkY').value);
  PROFILE.run.topZ = parseFloat(v('topZIn').value) || 2;
  var envUser = !!(PROFILE.view && PROFILE.view.envUser);   // not on the form, so carried across
  PROFILE.view = cfg();
  PROFILE.view.envUser = envUser;
  PROFILE.view.envW = parseFloat(v('envW').value) || 425;
  PROFILE.view.envD = parseFloat(v('envD').value) || 425;
  profileSave();
}
function importProfileJSON(j){
  if (j && ('bitSetterX' in j || 'bitSetterEnabled' in j)){
    // Carbide Motion shapeoko.json
    PROFILE.bitSetter.enabled = !!j.bitSetterEnabled;
    if (typeof j.bitSetterX === 'number') PROFILE.bitSetter.x = j.bitSetterX;
    if (typeof j.bitSetterY === 'number') PROFILE.bitSetter.y = j.bitSetterY;
    if (typeof j.bitZeroType === 'number'){
      PROFILE.bitZero.enabled = j.bitZeroType > 0;
      PROFILE.bitZero.version = j.bitZeroType >= 2 ? 'v2' : 'v1';
    }
    if (typeof j.spindleType === 'number' && j.spindleType > 0) PROFILE.spindle.type = 'vfd';
    logC('sys', 'imported Carbide Motion shapeoko.json — BitSetter at ' +
      PROFILE.bitSetter.x + ', ' + PROFILE.bitSetter.y);
  } else if (j && (j.bitSetter || j.spindle || j.view)){
    if (j.bitSetter) PROFILE.bitSetter = Object.assign(PROFILE.bitSetter, j.bitSetter);
    if (j.bitZero)   PROFILE.bitZero   = Object.assign(PROFILE.bitZero, j.bitZero);
    if (j.spindle)   PROFILE.spindle   = Object.assign(PROFILE.spindle, j.spindle);
    if (j.view)      PROFILE.view      = Object.assign(PROFILE.view, j.view);
    if (j.jog)       PROFILE.jog       = Object.assign(PROFILE.jog, j.jog);
    if (j.run){
      var ipk = Object.assign({}, PROFILE.run.park, j.run.park || {});
      PROFILE.run = Object.assign(PROFILE.run, j.run); PROFILE.run.park = ipk;
    }
    if (Array.isArray(j.quick)) PROFILE.quick = j.quick;
    if (typeof qaRender === 'function') qaRender();
    logC('sys', '454 Control profile imported');
  } else {
    logC('err', 'unrecognized profile file — expected a 454 Control profile or Carbide Motion shapeoko.json');
    return;
  }
  profileSave();
  applyProfileToUI();
}

