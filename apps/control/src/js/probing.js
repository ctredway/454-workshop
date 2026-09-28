/* ---------------- probing engine ----------------
   Generic sequential prober: steps are strings, or {cmd, capture:'label'} for
   G38.2 moves whose [PRB] result should be recorded. Consumers: BitSetter
   tool-length (job-integrated) and BitZero Z zeroing (standalone modal). */
var PROBE = {active:false, steps:null, i:0, name:null, captures:{}, pendingCapture:null,
             onResult:null, refZ:null, previewDone:false, bzPreviewDone:false};

function probeRun(name, steps, onResult){
  if (SERIAL.pins.indexOf('P') >= 0){
    probeFail('probe input already triggered before starting \u2014 check the clip and wiring');
    return;
  }
  PROBE.active = true; PROBE.name = name;
  PROBE.steps = steps; PROBE.i = 0;
  PROBE.captures = {}; PROBE.pendingCapture = null;
  PROBE.onResult = onResult;
  logC('sys', name + ' starting');
  probeNext();
}
function probeNext(){
  if (!PROBE.active) return;
  if (PROBE.i >= PROBE.steps.length){ probeFinish(); return; }
  var it = PROBE.steps[PROBE.i++];
  if (typeof it === 'string'){ PROBE.pendingCapture = null; sendLine(it); }
  else { PROBE.pendingCapture = it.capture; sendLine(it.cmd); }
}
function probeOnPRB(z, success){
  if (!PROBE.active) return;
  if (!success){
    probeFail('probe travelled full distance without contact \u2014 tool loaded? clip attached?');
    return;
  }
  if (PROBE.pendingCapture) PROBE.captures[PROBE.pendingCapture] = z;
}
function probeFail(msg){
  var wasActive = PROBE.active;
  PROBE.active = false; PROBE.onDone = null; PROBE.onResult = null;
  logC('err', 'probe FAILED: ' + msg);
  if (SERIAL.connected) sendLine('G90');
  if (JOB.active){
    JOB.active = false; JOB.inflight = []; JOB.toolWait = null;
    maybeToolPrompt();
    updateJobUI('probe failed \u2014 job aborted. ' + msg);
  } else if (wasActive){
    updateJobUI('probe failed. ' + msg);
    bzStatus('failed \u2014 ' + msg);
  }
}
function probeFinish(){
  PROBE.active = false;
  var cb = PROBE.onResult; PROBE.onResult = null;
  if (cb) cb(PROBE.captures);
}

