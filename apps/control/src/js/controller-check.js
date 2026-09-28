// After connecting, read the controller's own settings back and check the ones 454 Control
// depends on. Wrong values here fail quietly: no homing means no machine coordinates, a low
// $30 caps spindle RPM, laser mode changes how S is handled.
function controllerCheck(quiet){
  var g = SERIAL.settings || {}, out = [];
  function has(n){ return g[n] !== undefined; }
  if (!has(22)){ out.push({sev:'info', t:'Controller settings not read yet \u2014 try again in a moment.'}); return out; }
  if (g[22] === 0) out.push({sev:'err', t:'Homing is disabled ($22 = 0). 454 Control needs a homed machine: no homing means no machine coordinates, so lifting clear, parking and the BitSetter can\u2019t work.'});
  else if (g[20] === 0) out.push({sev:'warn', t:'Soft limits are off ($20 = 0). With homing on, soft limits stop a move before it hits a limit switch.'});
  if (g[32] === 1) out.push({sev:'err', t:'Laser mode is on ($32 = 1). For milling it should be 0, or spindle speeds behave oddly and M3 doesn\u2019t hold the spindle on through moves.'});
  var envW = PROFILE.view.envW, envD = PROFILE.view.envD;
  function travelOff(axis, n2, want){
    if (!has(n2) || !(want > 0)) return;
    var have = g[n2];
    if (Math.abs(have - want) > Math.max(5, want * 0.05))
      out.push(PROFILE.view.envUser
        ? {sev:'info', t:axis + ' travel: the controller says ' + have.toFixed(1) + ' mm ($' + n2 + '); you\u2019ve set the work area to ' + want + ' mm, so that\u2019s used.'}
        : {sev:'warn', t:axis + ' travel differs: the controller says ' + have.toFixed(1) + ' mm ($' + n2 + '), your work area setting says ' + want + ' mm. One of them is wrong.'});
  }
  travelOff('X', 130, envW); travelOff('Y', 131, envD);
  if (has(30)){
    // $30 = 1000 is normal for a trim router on a Carbide board; a VFD needs its real maximum
    if (PROFILE.spindle.type === 'vfd' && g[30] < 10000)
      out.push({sev:'warn', t:'Maximum spindle speed is ' + g[30] + ' ($30), but your spindle is set to VFD. A VFD is usually 24000 \u2014 a low value caps every S word in your files.'});
    if (typeof MODEL !== 'undefined' && MODEL && MODEL.sMax && MODEL.sMax > g[30] && PROFILE.spindle.type === 'vfd')
      out.push({sev:'err', t:'The loaded file asks for S' + MODEL.sMax + ', above the controller\u2019s maximum of ' + g[30] + ' ($30). The spindle will be capped.'});
  }
  if (has(27) && g[27] <= 0) out.push({sev:'warn', t:'Homing pull-off is 0 ($27). The switches stay pressed after homing, which can trip alarms.'});
  if (has(110) && PROFILE.view.rapidRate > g[110] * 1.2)
    out.push({sev:'info', t:'Time estimates assume ' + PROFILE.view.rapidRate + ' mm/min rapids, but the machine\u2019s maximum X rate is ' + g[110] + ' ($110). Estimates will read short.'});
  if (has(130) && has(131)) out.push({sev:'info', t:'Machine coordinates: ' + describeRanges() + '. Jog limits, tool-change positions and lifts use these.'});
  if (!out.filter(function (f) { return f.sev !== 'info'; }).length && !quiet) out.push({sev:'ok', t:'Controller settings look right: homing on, travel matches your work area, spindle maximum ' + (has(30) ? g[30] : '?') + '.'});
  return out;
}
function controllerCheckShow(auto){
  var found = controllerCheck(false);
  found.forEach(function(f){ logC(f.sev === 'err' ? 'err' : 'sys', 'controller check: ' + f.t); });
  var bad = found.filter(function(f){ return f.sev === 'err' || f.sev === 'warn'; });
  if (auto && !bad.length) return;                       // nothing to interrupt for
  uiDialog({title: bad.length ? 'Check these controller settings' : 'Controller settings',
            body: (bad.length ? found : found).map(function(f){
              return (f.sev === 'err' ? '\u26a0\u26a0 ' : f.sev === 'warn' ? '\u26a0 ' : '') + f.t;
            }).join('\n\n') + (bad.length ? '\n\nThey are changed in the controller itself ($ settings), not here. Carbide Motion\u2019s setup wizard writes them for Shapeoko machines.' : ''),
            ok:'OK', note:true});
}
// On opening with no machine attached, offer to connect. Skippable, and rememberable, because
// reading and checking a file offline is a perfectly good reason to open the app.
function connAsk(){
  if (SERIAL.connected || PROFILE.askConnect === false) return;
  var note = document.getElementById('connNote');
  if (!SERIAL.supported) note.textContent = 'This browser can\u2019t talk to serial devices. Use Chrome or Edge on desktop to connect.';
  else note.textContent = '';
  document.getElementById('connGo').disabled = !SERIAL.supported;
  document.getElementById('connAsk').checked = PROFILE.askConnect !== false;
  document.getElementById('connModal').hidden = false;
  document.getElementById(SERIAL.supported ? 'connGo' : 'connSkip').focus();
}
function connClose(){
  PROFILE.askConnect = document.getElementById('connAsk').checked;
  profileSave();
  document.getElementById('connModal').hidden = true;
}
