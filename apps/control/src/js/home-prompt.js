var HOME_ASKED = false;
function homeMaybeAsk(){
  if (HOME_ASKED || !SERIAL.connected || SERIAL.homedSeen) return;
  if (PROFILE.askHome === false) return;
  if (JOB.active || PROBE.active || QA.active) return;
  var st = SERIAL.state || '';
  if (st !== 'Idle' && st !== 'Alarm') return;                 // wait until it is sitting still
  HOME_ASKED = true;
  document.getElementById('homeAsk').checked = PROFILE.askHome !== false;
  document.getElementById('homeModal').hidden = false;
  document.getElementById('homeGo').focus();
}
function homeClose(){
  PROFILE.askHome = document.getElementById('homeAsk').checked;
  profileSave();
  document.getElementById('homeModal').hidden = true;
}
function homeNow(){
  homeClose();
  if (!SERIAL.connected) return;
  logC('sys', 'homing ($H)');
  sendLine('$H');
}
