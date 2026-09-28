/* ----- BitZero (standalone Z zeroing) ----- */
var BZ = {circuitOk:false};
function bzStatus(t){
  var el = document.getElementById('bzStatusLine');
  if (el) el.textContent = t;
}
function bitZeroSteps(){
  return [
    'G21 G91',
    {cmd: 'G38.2 Z-25 F150', capture: 'zf'},
    'G0 Z1.5',
    {cmd: 'G38.2 Z-4 F40', capture: 'z'},
    'G0 Z3',
    'G90'
  ];
}
function bzOpenModal(){
  if (!SERIAL.connected){ logC('err', 'connect to the machine first'); return; }
  if (JOB.active && !atToolChange()) return;
  BZ.circuitOk = false;
  bzUpdateCircuit();
  bzStatus('ready');
  document.getElementById('bzModal').hidden = false;
}
function bzCloseModal(){ document.getElementById('bzModal').hidden = true; if (atToolChange()) maybeToolPrompt(); }
function bzUpdateCircuit(){
  var el = document.getElementById('bzCircuit');
  if (!el || document.getElementById('bzModal').hidden) return;
  if (!BZ.circuitOk && !PROBE.active && SERIAL.pins.indexOf('P') >= 0){
    BZ.circuitOk = true;
    logC('sys', 'BitZero: probe circuit verified');
  }
  el.textContent = BZ.circuitOk ? 'circuit verified \u2713'
                                : 'circuit: touch the probe pin to the plate to verify';
  el.classList.toggle('ok', BZ.circuitOk);
}
function bzStart(){
  if (!atToolChange() && qaBusy('probe')) return;
  if (!SERIAL.connected || (JOB.active && !atToolChange()) || PROBE.active) return;
  if (SERIAL.state === 'Alarm'){ bzStatus('machine is locked \u2014 home ($H) or unlock ($X) first'); return; }
  readUIToProfile();
  var thk = PROFILE.bitZero.thk;
  if (!(thk > 0 && thk < 30)){ bzStatus('set the plate thickness first (caliper it)'); return; }
  if (!BZ.circuitOk){ bzStatus('verify the circuit first \u2014 touch the probe pin to the plate'); return; }
  var bzGo = function(){
    bzStatus('probing\u2026');
    probeRun('BitZero Z', bitZeroSteps(), function(cap){
      if (cap.z === undefined){ probeFail('sequence completed but no probe result was received'); return; }
      var wcoZ = cap.z - thk;
      sendLine('G10 L2 P0 Z' + wcoZ.toFixed(3));
      markToolZeroed();
      setTimeout(bsAfterZero, 1500);                    // once the lift has finished
      var lift = (thk + 10).toFixed(2);
      sendLine('G90 G0 Z' + lift);
      logC('sys', 'BitZero: stock top set as work Z0 (plate ' + thk.toFixed(2) +
           ' mm, trigger at machine Z ' + cap.z.toFixed(3) + '). Lifting to Z' + lift + '.');
      bzStatus('done \u2014 Z0 = stock top. Paper-test it before cutting.');
    });
  };
  if (!PROBE.bzPreviewDone){                      // show the exact sequence once per session
    PROBE.bzPreviewDone = true;
    var seq = bitZeroSteps().map(function(x){ return typeof x === 'string' ? x : x.cmd; }).join('\n    ');
    uiDialog({title:'BitZero Z probe \u2014 first run this session',
              body:'Exact sequence:\n\n    ' + seq +
                   '\n\nThen: G10 L2 P0 Z(trigger \u2212 ' + thk + ' mm) sets stock top as work Z0, and the tool lifts 10 mm.' +
                   '\n\n\u26a0 The tool tip must be 2\u201310 mm above the plate.',
              ok:'Probe'}).then(function(go){ if (go) bzGo(); });
    return;
  }
  bzGo();
}

