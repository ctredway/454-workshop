/* ---------------- jogging ---------------- */
var STEP_FEEDS = {'0.025':150, '0.1':300, '1':1000, '10':2500};
function jogCmd(p, dist, feed){
  var cmd = '$J=G21G91';
  if (p[0]) cmd += 'X' + (p[0] * dist).toFixed(3);
  if (p[1]) cmd += 'Y' + (p[1] * dist).toFixed(3);
  if (p[2]) cmd += 'Z' + (p[2] * dist).toFixed(3);
  return cmd + 'F' + Math.round(feed);
}
// Lift 6 mm from wherever Z is, as a jog: cancellable like any other, and cut short if the top of
// travel is closer than that, so it can't run into the limit switch.
function jogLiftZ6(){
  if (!requireIdle('lift')) return;
  var d = clampJogDist([0, 0, 1], 6);
  if (!(d > 0.05)){ logC('sys', 'Z is already at the top of its travel'); return; }
  sendLine(jogCmd([0, 0, 1], d, PROFILE.jog.fastZ));
  if (d < 5.95) logC('sys', 'Z lifted ' + d.toFixed(1) + ' mm: that\u2019s as far as the top of travel allows');
}
function jogStepOnce(p){
  var inc = PROFILE.jog.inc, dist = parseFloat(inc);
  var feed = STEP_FEEDS[inc] || 1000;
  if (p[2]) feed = Math.min(feed, PROFILE.jog.fastZ);
  sendLine(jogCmd(p, dist, feed));
}
/* Clamp a fast-jog segment to the machine's remaining travel (0.5 mm margin).
   Only active once this session has homed AND the controller travel is known —
   an unhomed machine has untrusted coordinates, so no clamp is possible. */
function clampJogDist(p, dist){
  var s = SERIAL.settings;
  if (!SERIAL.homedSeen || s[130] === undefined) return dist;
  var trav = [s[130], s[131], s[132]];
  var axes = ['x', 'y', 'z'];
  var scale = 1;
  for (var i = 0; i < 3; i++){
    if (!p[i] || trav[i] === undefined) continue;
    // clamp against the COMMANDED position, not the reported one — status
    // reports lag, and several segments can be issued between them
    var m = JOGC.pred[axes[i]];
    // keep 0.5 mm off each end of this axis's actual range
    var rg = axisRange(axes[i]) || {min: -trav[i], max: 0};
    var room = p[i] > 0 ? ((rg.max - 0.5) - m) : (m - (rg.min + 0.5));
    if (room < 0) room = 0;
    var axScale = Math.min(1, room / dist);
    if (axScale < scale) scale = axScale;
  }
  return dist * scale;
}
function sendJogSeg(){
  var d = clampJogDist(JOGC.p, JOGC.dist);
  if (d < 0.05){
    if (!JOGC.limitHit){ JOGC.limitHit = true; logC('err', 'jog stopped — machine travel limit'); }
    jogFastStop(false);
    return;
  }
  JOGC.inflight++;
  JOGC.pred.x += JOGC.p[0] * d;
  JOGC.pred.y += JOGC.p[1] * d;
  JOGC.pred.z += JOGC.p[2] * d;
  sendLine(jogCmd(JOGC.p, d, JOGC.feed), true);
}
/* Ack-clocked: at most 3 segments in flight; each 'ok' releases the next.
   Send rate therefore locks to the machine's consumption — the RX buffer
   can never overflow the way a blind timer pump could. */
function jogTopUp(){
  while (JOGC.active && !JOGC.limitHit && JOGC.inflight < 3){
    var before = JOGC.inflight;
    sendJogSeg();
    if (JOGC.inflight === before) break; // clamp ended the jog
  }
}
function jogFastStart(p){
  jogFastStop(false);
  var feed = p[2] ? PROFILE.jog.fastZ : PROFILE.jog.fastXY;
  JOGC.p = p; JOGC.feed = feed;
  JOGC.dist = Math.max(0.5, feed / 60 * 0.18); // ~180 ms of motion per segment
  JOGC.pred = {x:SERIAL.mpos.x, y:SERIAL.mpos.y, z:SERIAL.mpos.z};
  JOGC.active = true; JOGC.limitHit = false; JOGC.inflight = 0;
  jogTopUp();
  JOGC.timer = setInterval(function(){
    if (!SERIAL.connected || SERIAL.state === 'Alarm'){ jogFastStop(true); return; }
    sendRT(0x3f); // ~10 Hz status while jogging fast: pins + fresh mpos for the clamp
    jogTopUp();   // watchdog top-up in case an ok was missed
  }, 100);
}
function jogFastStop(cancel){
  if (JOGC.timer){ clearInterval(JOGC.timer); JOGC.timer = null; }
  if (JOGC.active && cancel !== false && SERIAL.connected) sendRT(0x85, 'jog cancel');
  JOGC.active = false;
  JOGC.inflight = 0;
}

