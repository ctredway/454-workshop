/* ---------------- game controller (gamepad) jogging ----------------
   An Xbox-style game controller, USB or Bluetooth, as a pendant at the machine. Switched on in Settings ->
   Accessories (off until then, so a controller left on the bench moves nothing). It drives the same jogging the
   jog panel does (jogging.js): held jogs in short segments clamped to the machine's travel and cancelled the
   moment the stick is let go; steps one per press. It only ever jogs or stops. It can't start or resume a job,
   set zero, or run the spindle: a button knocked by accident must never start anything.

     Left stick       jog X and Y while held (eight directions), at the Fast XY speed
     Right stick      jog Z (up and down) while held, at the Fast Z speed
     LB, held         slow: a fifth of the speed, for creeping up on an edge
     D-pad            one step in X or Y, of the step chosen in the jog panel (1 mm when that's Fast)
     Y / A            one step up / down in Z
     X                the next step: 0.025, 0.1, 1, 10 mm
     B                stop: cancels a jog; during a job, Hold

   Safety:
   - A stick starts a jog past GPAD_START and stops under GPAD_STOP (so it doesn't flicker at the edge). A jog keeps
     the direction it started in: pushed another way, it stops, and the stick has to come back to the middle
     before it jogs again. So does any jog this stopped for another reason (the window lost focus, the page was
     hidden, the controller went away, a job or a probe began).
   - Jogs only when the jog panel's buttons could: connected, Idle (or already jogging), not during a job except
     stopped at a tool change, not while probing or running a quick action.
   - The poll keeps a held jog alive (JOGC.alive): if it stops being polled (the browser slows timers for a page in
     the background), jogging.js cancels the jog within GPAD_WATCHDOG ms. */
var GPAD = {timer:null, index:null, name:'', jog:null, needCentre:false, prev:{}, said:{}};
var GPAD_START = 0.5, GPAD_STOP = 0.25, GPAD_POLL = 50, GPAD_WATCHDOG = 300, GPAD_SLOW = 0.2;
var GPAD_STEPS = ['0.025', '0.1', '1', '10'];

function gpadOn(){ return !!(PROFILE.gamepad && PROFILE.gamepad.enabled); }
// the first standard-layout controller the browser sees (it shows them only after a button is pressed)
function gpadFind(){
  var nav = typeof navigator !== 'undefined' ? navigator : null;
  var pads = nav && nav.getGamepads ? nav.getGamepads() : [];
  for (var i = 0; i < pads.length; i++){
    var p = pads[i];
    if (p && p.connected !== false && p.buttons && p.buttons.length >= 16 && p.axes && p.axes.length >= 4) return p;
  }
  return null;
}
// may it jog now? Quietly: the stick is polled 20 times a second, so a refusal is said once, when it's pushed
function gpadMayJog(){
  if (!SERIAL.connected || SERIAL.state === 'Alarm') return false;
  if (SERIAL.state !== 'Idle' && SERIAL.state !== 'Jog') return false;
  if (JOB.active && !atToolChange()) return false;
  if (PROBE.active || QA.active) return false;
  return true;
}
// A held jog from the sticks: {p: direction, slow} or null. The left stick's eight directions, or the right
// stick's up and down; the left stick wins if both are pushed.
function gpadStick(pad, held){
  var lx = pad.axes[0] || 0, ly = -(pad.axes[1] || 0), rz = -(pad.axes[3] || 0);   // (sticks report up as negative)
  var past = function (x, y) { return Math.hypot(x, y) >= (held ? GPAD_STOP : GPAD_START); };
  if (past(lx, ly)){
    var a = Math.atan2(ly, lx), k = Math.round(a / (Math.PI / 4));                 // the nearest of eight directions
    var dirs = {0: [1, 0], 1: [1, 1], 2: [0, 1], 3: [-1, 1], 4: [-1, 0], '-4': [-1, 0], '-3': [-1, -1], '-2': [0, -1], '-1': [1, -1]};
    var d = dirs[k];
    return {p: [d[0], d[1], 0]};
  }
  if (Math.abs(rz) >= (held ? GPAD_STOP : GPAD_START)) return {p: [0, 0, rz > 0 ? 1 : -1]};
  return null;
}
function gpadSame(a, b){ return a && b && a.p.join() === b.p.join() && a.slow === b.slow; }
function gpadStopJog(needCentre){
  if (GPAD.jog){ GPAD.jog = null; if (JOGC.active && JOGC.owner === 'gamepad') jogFastStop(true); }
  if (needCentre) GPAD.needCentre = true;
}
function gpadSayOnce(key, cls, msg){ if (!GPAD.said[key]){ GPAD.said[key] = true; logC(cls, msg); } }

// one look at the controller: called every GPAD_POLL ms while it's switched on
function gpadPoll(){
  var pad = gpadFind();
  if (!gpadOn() || !pad){
    if (GPAD.index !== null){
      gpadStopJog(true);
      logC('sys', 'game controller ' + (pad ? 'switched off in Settings' : 'gone: ' + GPAD.name));
      GPAD.index = null; GPAD.name = ''; GPAD.prev = {};
      gpadStatus();
    }
    return;
  }
  if (GPAD.index !== pad.index){
    // (a browser shows a controller only once a button is pressed: that press, and any button already down, isn't
    // a command; nor is a stick already pushed)
    GPAD.index = pad.index; GPAD.name = pad.id; GPAD.prev = {}; GPAD.needCentre = true;
    pad.buttons.forEach(function (b, i) { GPAD.prev[i] = !!(b && (b.pressed || b.value > 0.5)); });
    logC('sys', 'game controller ready: ' + pad.id + ' (left stick X and Y, right stick Z, B stops)');
    gpadStatus();
  }
  var btn = function (i) { var b = pad.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); };
  var pressed = function (i) { var now = btn(i), was = !!GPAD.prev[i]; GPAD.prev[i] = now; return now && !was; };

  // B: stop, whatever else is going on (checked first, and never needs the machine Idle)
  if (pressed(1)){
    gpadStopJog(true);
    if (JOB.active && !JOB.held && !atToolChange()) jobHold();
    else if (JOGC.active) jogFastStop(true);
  }
  // the page must be in front: a held jog stops, and waits for the stick to come back to the middle
  var visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  if (!visible){ gpadStopJog(true); return; }

  // held jogs from the sticks
  var want = gpadStick(pad, !!GPAD.jog);
  if (want) want.slow = btn(4);
  if (!want){ GPAD.needCentre = false; gpadStopJog(false); }
  else if (GPAD.jog){
    if (!gpadSame(want, GPAD.jog) || !JOGC.active) gpadStopJog(true);             // turned, slowed, or stopped elsewhere
    else JOGC.alive = Date.now();                                                // still held: keep it going
  }
  else if (!GPAD.needCentre){
    if (!gpadMayJog()){
      gpadSayOnce('busy', 'err', 'game controller: can’t jog now — ' + (JOB.active ? 'a job is running' : 'the machine is ' + (SERIAL.connected ? SERIAL.state : 'not connected')));
      GPAD.needCentre = true;
    } else {
      GPAD.said.busy = false;
      GPAD.jog = want;
      jogFastStart(want.p, want.slow ? GPAD_SLOW : 1);
      JOGC.owner = 'gamepad'; JOGC.alive = Date.now();
    }
  }

  // steps: one per press
  var steps = [[12, [0, 1, 0]], [13, [0, -1, 0]], [14, [-1, 0, 0]], [15, [1, 0, 0]], [3, [0, 0, 1]], [0, [0, 0, -1]]];
  steps.forEach(function (s) {
    if (!pressed(s[0]) || GPAD.jog) return;
    if (!gpadMayJog()){ gpadSayOnce('busy', 'err', 'game controller: can’t jog now — the machine is busy'); return; }
    GPAD.said.busy = false;
    jogStepOnce(s[1], PROFILE.jog.inc === 'fast' ? '1' : null);
  });
  // X: the next step size
  if (pressed(2)){
    var at = GPAD_STEPS.indexOf(PROFILE.jog.inc);
    PROFILE.jog.inc = GPAD_STEPS[(at + 1) % GPAD_STEPS.length];
    if (typeof setIncUI === 'function') setIncUI(PROFILE.jog.inc);
    if (typeof profileSave === 'function') profileSave();
    logC('sys', 'game controller: steps of ' + PROFILE.jog.inc + ' mm');
  }
}
// Settings -> Accessories: what it sees
function gpadStatus(){
  var el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('gpStatus') : null;
  if (!el) return;
  el.textContent = !gpadOn() ? '' : GPAD.index !== null ? 'Connected: ' + GPAD.name
    : 'None found yet: plug one in (or pair it) and press any button on it.';
}
// switched on or off in Settings (and at startup)
function gpadSync(){
  if (gpadOn() && !GPAD.timer) GPAD.timer = setInterval(gpadPoll, GPAD_POLL);
  if (!gpadOn() && GPAD.timer){ gpadPoll(); clearInterval(GPAD.timer); GPAD.timer = null; }
  gpadStatus();
}
function gpadWire(){
  if (typeof window !== 'undefined' && window.addEventListener){
    window.addEventListener('gamepadconnected', gpadSync);
    window.addEventListener('gamepaddisconnected', function () { gpadPoll(); });
    window.addEventListener('blur', function () { gpadStopJog(true); });
  }
  gpadSync();
}
