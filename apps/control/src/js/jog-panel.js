/* ---------------- jog modal + keyboard ---------------- */
// Stopped at a tool change with nothing left queued: the one moment during a job when jogging
// and zeroing are safe, and exactly when they're needed without a BitSetter.
// Carry on after a tool change: blocked until Z is zeroed when the new tool needs it.
function toolContinueNow(){
  if (!JOB.toolWait) return;
  if (JOB.toolWait.needZero && !JOB.toolWait.zeroed) return;   // Z must be zeroed for this tool first
  document.getElementById('toolModal').hidden = true;
  var tw = JOB.toolWait;
  // when probing, the machine ends parked over the BitSetter — returning to
  // the work at height is mandatory, not just the highStart preference
  // After probing (parked over the BitSetter) or re-zeroing (the tip is down on the stock), lifting
  // before moving back is mandatory, not the start-high preference: otherwise the bit drags across.
  var wantHigh = (PROFILE.run.highStart || JOB.useBS || tw.zeroed) && SERIAL.homedSeen && tw.next;
  var resume = function(){
    if (wantHigh){
      JOB.list.splice(JOB.idx, 0,
        {text: zHighCmd(travelZ()), ln: 0, syn: true},
        {text: 'G21 G90', ln: 0, syn: true},
        {text: 'G0 X' + tw.next.x.toFixed(3) + ' Y' + tw.next.y.toFixed(3), ln: 0, syn: true});
      JOB.total = JOB.list.length;
      logC('sys', 'traversing at top of travel to X' + tw.next.x.toFixed(1) +
           ' Y' + tw.next.y.toFixed(1) + ' before resuming');
    }
    logC('sys', 'continuing after tool change (T' + tw.tool + ')');
    jobFill();
  };
  JOB.toolWait = null;
  maybeToolPrompt();
  if (JOB.useBS) probeStart(PROBE.refZ !== null ? 'tool' : 'ref', resume);
  else resume();
}
function zeroZNow(){ if (requireIdle('zeroing')){ sendLine('G10 L20 P0 Z0'); markToolZeroed(); bsAfterZero(); } }
function toolJogNow(){ document.getElementById('toolModal').hidden = true; jogModalOpen(); }   // the prompt returns when the panel closes
function toolBzNow(){ document.getElementById('toolModal').hidden = true; bzOpenModal(); }
function markToolZeroed(){
  if (JOB.active && JOB.toolWait){
    JOB.toolWait.zeroed = true;
    logC('sys', 'Z zero set for T' + JOB.toolWait.tool + ' at the tool change');
  }
}
function atToolChange(){ return !!(JOB.active && JOB.toolWait && !JOB.inflight.length && !PROBE.active && !JOB.parkPending); }
function jogModalOpen(){
  if (!atToolChange() && qaBusy('jog')) return;
  if (!SERIAL.connected){ logC('err', 'connect to the machine first'); return; }
  if (JOB.active && !atToolChange()) return;
  document.getElementById('jogModal').hidden = false;
}
function jogModalClose(){
  document.getElementById('jogModal').hidden = true;
  if (atToolChange()) setTimeout(maybeToolPrompt, 0);   // back to the tool-change prompt
  KEYJOG.code = null;
  jogFastStop(true);
  document.querySelectorAll('#jogGrid button.kbdOn').forEach(function(b){ b.classList.remove('kbdOn'); });
}
function kbdBtn(p){ return document.querySelector('#jogGrid button[data-jog="' + p.join(',') + '"]'); }
function jogKeyDown(e){
  if (document.getElementById('jogModal').hidden) return;
  if (e.code === 'Escape'){ e.preventDefault(); jogModalClose(); return; }
  var p = JOG_KEYS[e.code];
  if (!p) return;
  e.preventDefault();
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) e.target.blur();
  if (PROFILE.jog.inc === 'fast'){
    if (e.repeat || KEYJOG.code) return;          // one direction at a time
    if (!requireIdle('jog')) return;
    KEYJOG.code = e.code;
    var b = kbdBtn(p); if (b) b.classList.add('kbdOn');
    jogFastStart(p);
  } else {
    if (e.repeat) return;                          // one step per physical press
    if (!requireIdle('jog')) return;
    var fb = kbdBtn(p);
    if (fb){ fb.classList.add('kbdOn'); setTimeout(function(){ fb.classList.remove('kbdOn'); }, 140); }
    jogStepOnce(p);
  }
}
function jogKeyUp(e){
  if (KEYJOG.code && e.code === KEYJOG.code){
    var p = JOG_KEYS[e.code];
    var b = p && kbdBtn(p); if (b) b.classList.remove('kbdOn');
    KEYJOG.code = null;
    jogFastStop(true);
  }
}

var GRBL_ERRORS = {
  1:'G-code word must be a letter followed by a value.',2:'Bad number format.',
  3:'$ system command not recognized.',4:'Negative value where a positive one is required.',
  5:'Homing is not enabled in settings ($22).',
  8:'Command refused — machine is not Idle. After connecting, the controller boots locked: run Home ($H) first.',
  9:'G-code locked out — machine is in the boot-up Alarm state. Home ($H) to initialize (or $X to unlock without homing).',
  10:'Soft limits require homing to be enabled.',
  11:'Line is longer than GRBL accepts.',15:'Jog target exceeds machine travel.',
  16:'Jog command is malformed.',17:'Laser mode requires PWM output.',
  20:'Unsupported or invalid g-code command.',21:'More than one command from the same modal group on a line.',
  22:'Feed rate has not been set (missing F).',23:'Command needs an integer value.',
  24:'Two commands both using axis words on one line.',25:'Repeated g-code word on a line.',
  26:'No axis words found where required.',28:'Command is missing a required value word.',
  29:'This work coordinate system is not supported.',30:'G53 only valid with G0/G1.',
  31:'Unused axis words on the line.',32:'G2/G3 arc needs at least one in-plane axis word.',
  33:'Arc geometry invalid — radius mismatch or impossible arc.',34:'Arc radius calculation failed.',
  35:'G2/G3 arc is missing its I/J/K offset.',36:'Unused value words on the line.',
  37:'Tool length offset only assignable to Z.',38:'Tool number too large.'
};
var GRBL_ALARMS = {
  1:'Hard limit hit — position lost. Re-home before cutting.',
  2:'Soft limit — a move exceeded travel. Position was kept; unlock ($X) and check your job zero and file extents.',
  3:'Reset while moving — position lost. Re-home.',
  4:'Probe fail: probe already triggered at start.',
  5:'Probe fail: no contact within travel.',
  6:'Homing fail: reset during cycle.',7:'Homing fail: safety door opened.',
  8:'Homing fail: could not clear the switch.',9:'Homing fail: switch not found within travel.'
};

