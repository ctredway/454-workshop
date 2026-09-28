function parseStatus(s){
  var body = s.replace(/[<>]/g, '');
  var f = body.split('|');
  SERIAL.state = f[0].split(':')[0];
  SERIAL.subState = f[0].indexOf(':') > 0 ? f[0].split(':')[1] : '';
  jobClockTick();
  if (SERIAL.state !== parseStatus.lastState){ parseStatus.lastState = SERIAL.state; if (typeof bsRefNote === 'function') bsRefNote(); }
  if (SERIAL.prevState === 'Home' && SERIAL.state === 'Idle') SERIAL.homedSeen = true;
  if (typeof ENDING !== 'undefined' && ENDING) endingTick();
  SERIAL.prevState = SERIAL.state;
  SERIAL.spindleOn = /\|A:[^|>]*[SC]/.test(s);   // A:S / A:C = spindle running; no A field = everything off
  if (!HOME_ASKED) setTimeout(homeMaybeAsk, 0);
  var pinsNow = '', posIs = null, posV = null;
  for (var i = 1; i < f.length; i++){
    var ci = f[i].indexOf(':');
    if (ci < 0) continue;
    var k = f[i].slice(0, ci), raw = f[i].slice(ci + 1);
    if (k === 'Pn'){ pinsNow = raw; continue; }
    var v = raw.split(',').map(parseFloat);
    // $13=1 makes the controller report positions in inches; everything here works in mm
    if (SERIAL.settings[13] === 1 && (k === 'MPos' || k === 'WPos' || k === 'WCO')) v = v.map(function (q) { return q * 25.4; });
    if (k === 'MPos' || k === 'WPos'){ posIs = k; posV = v; }     // worked out below, once any WCO in this report is read
    else if (k === 'WCO'){
      SERIAL.wco = {x:v[0], y:v[1], z:v[2]};
    } else if (k === 'FS'){ SERIAL.feed = v[0]; SERIAL.speed = v[1]; }
    else if (k === 'F'){ SERIAL.feed = v[0]; }
    else if (k === 'Ov'){ SERIAL.ov = v; }
  }
  // The position, using this report's work offset: GRBL lists MPos before WCO, so working it out as MPos
  // was read used the previous offset, and after zeroing the work position lagged one report behind.
  if (posIs === 'MPos'){
    SERIAL.mpos = {x:posV[0], y:posV[1], z:posV[2]};
    SERIAL.wpos = {x:posV[0]-SERIAL.wco.x, y:posV[1]-SERIAL.wco.y, z:posV[2]-SERIAL.wco.z};
  } else if (posIs === 'WPos'){
    SERIAL.wpos = {x:posV[0], y:posV[1], z:posV[2]};
    SERIAL.mpos = {x:posV[0]+SERIAL.wco.x, y:posV[1]+SERIAL.wco.y, z:posV[2]+SERIAL.wco.z};
  }
  var pinsPrev = SERIAL.pins;
  SERIAL.pins = pinsNow; // Pn only appears while a pin is active, so absence = all clear
  if (pinsNow !== pinsPrev) pinTripJogGuard(pinsPrev, pinsNow);
  uiStatus();
  if (SERIAL.homedSeen && SERIAL.mpos){                // positions well to one side settle each axis
    SERIAL.axisSeen = SERIAL.axisSeen || {};
    ['x', 'y', 'z'].forEach(function (ax) {
      var v = SERIAL.mpos[ax];
      if (!isFinite(v) || SERIAL.axisSeen[ax]) return;
      if (v > 2) SERIAL.axisSeen[ax] = 'up'; else if (v < -2) SERIAL.axisSeen[ax] = 'down';
    });
  }
}

/* stop any jog the moment a watched sensor becomes newly active.
   Edge-triggered on purpose: a held/stuck switch never blocks jogging
   AWAY from it. Applies only to jog motion — probing cycles (state Run)
   are untouched, since driving into the probe is their whole job. */
var PIN_NAMES = {X:'X limit switch', Y:'Y limit switch', Z:'Z limit switch', P:'probe (BitSetter/BitZero)', D:'door'};
function pinTripJogGuard(prev, cur){
  var newly = '';
  for (var i = 0; i < cur.length; i++){
    var ch = cur[i];
    if (PIN_NAMES[ch] && prev.indexOf(ch) < 0) newly += ch;
  }
  if (!newly) return;
  if (SERIAL.state === 'Jog' || JOGC.active || KEYJOG.code){
    if (JOGC.timer){ clearInterval(JOGC.timer); JOGC.timer = null; }
    JOGC.active = false;
    KEYJOG.code = null;
    document.querySelectorAll('#jogGrid button.kbdOn').forEach(function(b){ b.classList.remove('kbdOn'); });
    sendRT(0x85, 'jog cancel — sensor');
    var names = newly.split('').map(function(c){ return PIN_NAMES[c]; }).join(', ');
    logC('err', 'jog stopped — ' + names + ' triggered. Release the key/button, then jog away.');
  }
}

function uiStatus(){
  var st = SERIAL.state;
  var chipTop = document.getElementById('hdrState');
  chipTop.textContent = st === 'Alarm' ? 'Alarm — home to unlock' : (st === 'Home' ? 'homing…' : st);
  chipTop.dataset.s = st;
  var ab = document.getElementById('alarmBanner');
  ab.style.display = (st === 'Alarm') ? 'block' : 'none';
  document.getElementById('droX').textContent = SERIAL.wpos.x.toFixed(3);
  document.getElementById('droY').textContent = SERIAL.wpos.y.toFixed(3);
  document.getElementById('droZ').textContent = SERIAL.wpos.z.toFixed(3);
  document.getElementById('rbX').textContent = SERIAL.wpos.x.toFixed(3);
  document.getElementById('rbY').textContent = SERIAL.wpos.y.toFixed(3);
  document.getElementById('rbZ').textContent = SERIAL.wpos.z.toFixed(3);
  var rbS = document.getElementById('rbState');
  rbS.textContent = chipTop.textContent; rbS.dataset.s = st;
  document.getElementById('droF').textContent =
    (SERIAL.feed ? Math.round(SERIAL.feed) + ' mm/min' : '—') +
    (SERIAL.speed ? ' · S' + Math.round(SERIAL.speed) : '');
  document.getElementById('mposChip').textContent =
    'machine ' + SERIAL.mpos.x.toFixed(1) + ', ' + SERIAL.mpos.y.toFixed(1) + ', ' + SERIAL.mpos.z.toFixed(1);
  var pc = document.getElementById('pinChip');
  if (SERIAL.pins){ pc.style.display = ''; pc.textContent = 'pins: ' + SERIAL.pins; }
  else pc.style.display = 'none';
  // spindle state (commanded S from the FS status field)
  var spinning = SERIAL.speed > 0;
  var hs = document.getElementById('hdrSpindle');
  hs.textContent = spinning ? 'S' + Math.round(SERIAL.speed) + ' — stop' : 'spindle off';
  hs.classList.toggle('on', spinning);
  document.getElementById('spinState').textContent = spinning ? 'running · S' + Math.round(SERIAL.speed) : 'stopped';
  // jog modal mirrors
  document.getElementById('jmX').textContent = SERIAL.wpos.x.toFixed(3);
  document.getElementById('jmY').textContent = SERIAL.wpos.y.toFixed(3);
  document.getElementById('jmZ').textContent = SERIAL.wpos.z.toFixed(3);
  var jm = document.getElementById('jmState');
  jm.textContent = st; jm.dataset.s = st;
  document.getElementById('jogOpen').disabled = JOB.active && !atToolChange();
  if (JOB.active && !atToolChange() && !document.getElementById('jogModal').hidden) jogModalClose();
  document.getElementById('bzOpen').disabled = JOB.active && !atToolChange();
  if (JOB.active && !atToolChange() && !document.getElementById('bzModal').hidden) bzCloseModal();
  bzUpdateCircuit();
  // live marker while a job (or manual motion during one) is happening
  if (JOB.active && marker){
    marker.position.copy(w3(SERIAL.wpos.x, SERIAL.wpos.y, SERIAL.wpos.z));
  }
  if (JOB.active){
    document.getElementById('ovF').textContent = 'F ' + SERIAL.ov[0] + '%';
    document.getElementById('ovS').textContent = 'S ' + SERIAL.ov[2] + '%';
  }
  if (JOB.active && (st === 'Hold' || st === 'Door')){
    document.getElementById('jobStatus').textContent =
      'held (' + st + ') at line ' + JOB.lastLn + ' — Resume to continue';
  }
}

function uiConn(on){
  document.getElementById('connectBtn').textContent = on ? 'Disconnect' : 'Connect to machine';
  document.getElementById('choosePort').hidden = true;
  if (!on) refreshConnectLabel();
  document.getElementById('connChip').textContent = on ? 'connected' : 'not connected';
  document.getElementById('mControls').classList.toggle('disabledArea', !on);
  document.getElementById('hdrMachine').classList.toggle('on', on);
  if (!on){
    var chipTop = document.getElementById('hdrState');
    chipTop.textContent = 'offline'; chipTop.dataset.s = '';
  }
}

