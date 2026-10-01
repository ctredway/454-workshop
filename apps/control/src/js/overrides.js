/* ---------------- real-time overrides + Z nudge ---------------- */
var OV_BYTES = {'f0':0x90,'f+10':0x91,'f-10':0x92,'f+1':0x93,'f-1':0x94,
                'r100':0x95,'r50':0x96,'r25':0x97,
                's0':0x99,'s+10':0x9A,'s-10':0x9B,'s+1':0x9C,'s-1':0x9D};
function sendOverride(key){
  ADJ.want = null;                                     // a press by hand: stop putting the last job's back
  var b = OV_BYTES[key];
  if (b !== undefined && SERIAL.connected) sendRT(b);
}
// Every job starts with feed, spindle and rapid at 100% and no Z nudge, unless "Keep for the next job" is
// ticked in the Adjust panel. Then the next job starts with the last job's, after asking. The tick isn't
// saved: 454 Control always opens with it off.
//   keep: the tick.  ov: [feed, rapid, spindle] % as the controller last reported them during a job.
//   want: the percentages being put back at the start of a job, until the controller reports them.
var ADJ = {keep: false, ov: null, want: null, tries: 0};
function adjKeepSet(on){
  ADJ.keep = !!on;
  var el = document.getElementById('ovKeep');
  if (el) el.checked = ADJ.keep;
}
// What a job would start with, in words; '' when everything is at normal or nothing is kept.
function adjKeptText(){
  if (!ADJ.keep) return '';
  var o = ADJ.ov || [100, 100, 100], out = [];
  if (o[0] !== 100) out.push('feed ' + o[0] + '%');
  if (o[2] !== 100) out.push('spindle ' + o[2] + '%');
  if (o[1] !== 100) out.push('rapid ' + o[1] + '%');
  if (ZN.val) out.push('Z nudge ' + (ZN.val > 0 ? '+' : '') + ZN.val.toFixed(2) + ' mm');
  return out.join(', ');
}
// The controller reported its percentages. During a job they're remembered. (A file's M2 or M30 puts
// them back to 100% in the controller as the job ends, so they can't be read afterwards.)
function adjSeen(){
  if (ADJ.want) adjChase();
  else if (JOB.active && SERIAL.ov) ADJ.ov = SERIAL.ov.slice(0, 3);
}
// Putting kept percentages back: one step for each report from the controller, towards what's wanted.
// Not all at once: the controller notes "a step was asked for", not how many, so steps sent together
// count as one. It reports its percentages straight after each change, and that brings the next step.
function adjChase(){
  var w = ADJ.want, o = SERIAL.ov;
  if (!w || !o) return;
  var step = function (d) { return d >= 10 ? '+10' : d <= -10 ? '-10' : d > 0 ? '+1' : '-1'; };
  var key = o[0] !== w[0] ? 'f' + step(w[0] - o[0]) : o[2] !== w[2] ? 's' + step(w[2] - o[2]) : o[1] !== w[1] ? 'r' + w[1] : null;
  if (key === null){
    ADJ.want = null;
    if (ADJ.tries) logC('sys', 'kept from the last job: feed ' + w[0] + '%, spindle ' + w[2] + '%, rapid ' + w[1] + '%');
    return;
  }
  if (OV_BYTES[key] === undefined || ++ADJ.tries > 60){
    ADJ.want = null;
    logC('err', 'couldn’t put the last job’s feed and spindle percentages back: they are at feed ' + o[0] + '%, spindle ' + o[2] + '%, rapid ' + o[1] + '%. Set them in the Adjust panel.');
    return;
  }
  if (SERIAL.connected) sendRT(OV_BYTES[key]);
}
// Kept percentages start going back before the "start?" window, while the machine is idle, so they're
// in place by the time the job moves. Only a report from the controller starts it: what was last heard
// (SERIAL.ov) may be from before the file's M30 put everything to 100%.
function adjRestore(){
  ADJ.tries = 0;
  ADJ.want = ADJ.keep && ADJ.ov ? ADJ.ov.slice(0, 3) : null;
}
// A job is starting (or resuming). Nothing kept: everything back to normal.
function adjBegin(){
  if (!ADJ.keep){
    ADJ.want = null; ZN.val = 0;
    sendRT(0x90); sendRT(0x99); sendRT(0x95);          // feed, spindle, rapid: 100%
  }
  znDisplay();
}
var ZN = {val:0};
function znDisplay(){
  var el = document.getElementById('znLbl');
  if (el) el.textContent = 'Z ' + (ZN.val >= 0 ? '+' : '') + ZN.val.toFixed(2);
}
function znAdjust(d){
  if (!JOB.active){ logC('err', 'Z nudge applies during a running job'); return; }
  ZN.val = (d === 0) ? 0 : Math.round((ZN.val + d) * 100) / 100;
  var tlo = (PROBE.tlo || 0) + ZN.val;
  // A nudge still waiting to be sent (the controller's buffer is full on long cuts) sits next in line:
  // this one replaces it. Adding another in front would send them newest first, and the oldest would
  // be the one left in force, with the panel showing the newest.
  var next = JOB.list[JOB.idx];
  if (next && next.zn) next.text = 'G43.1 Z' + tlo.toFixed(3);
  else JOB.list.splice(JOB.idx, 0, {text: 'G43.1 Z' + tlo.toFixed(3), ln: 0, syn: true, zn: true});
  JOB.total = JOB.list.length;
  logC('sys', 'Z nudge ' + (ZN.val >= 0 ? '+' : '') + ZN.val.toFixed(2) + ' mm (G43.1 queued, lands within buffered moves)');
  znDisplay();
  jobFill();
}
// A Z nudge lasts for the job it was made in. Left in the controller it shifts the next job by the same
// amount with nothing on screen saying so: the Adjust panel starts every job at Z +0.00. So it comes off
// when the job finishes, and before another starts if the last one ended some other way. The tool's own
// length offset, from the BitSetter, stays. ("Keep for the next job" leaves it on, and the next job asks.)
function znRemove(when){
  if (!ZN.val) return;
  var was = ZN.val;
  ZN.val = 0; znDisplay();
  if (!SERIAL.connected) return;
  sendLine('G43.1 Z' + (PROBE.tlo || 0).toFixed(3));
  logC('sys', 'Z nudge of ' + (was >= 0 ? '+' : '') + was.toFixed(2) + ' mm taken off ' + when +
       ': the next job cuts at the depths in its file. Nudge again in that job if it needs it.');
}
// A kept nudge, sent again before a job: the controller drops it when it's reset (End job, the red STOP).
function znApply(){
  if (!ZN.val || !SERIAL.connected) return;
  sendLine('G43.1 Z' + ((PROBE.tlo || 0) + ZN.val).toFixed(3));
}

function tcAutoNote(){
  var el = document.getElementById('tcAutoNote');
  if (!el) return;
  var sp = toolChangeSpot();
  el.textContent = !sp
    ? (PROFILE.run.tc.preset === 'custom' ? 'No position captured yet \u2014 jog there and press Capture.'
                                          : 'Tool changes happen wherever the file stopped.')
    : 'Tool changes go to ' + sp.name + ': X' + sp.x.toFixed(1) + ' Y' + sp.y.toFixed(1) +
      (sp.auto ? ', worked out from the machine travel.' : '.');
}
// How every job ends, finished or ended early, in Carbide Motion's order: (lifted and spindle off
// already) back to the job's XY zero, then park, by default at the back centre of the machine.
// A captured end position overrides the back centre. Parking needs a homed machine.
function endParkSpot(){
  if (PROFILE.run.parkEnd === false) return null;
  var pk = PROFILE.run.park;
  if (pk.enabled && pk.x !== null && pk.y !== null) return {x: +pk.x, y: +pk.y, name: 'your captured end position'};
  var bc = presetSpot('bc');
  return bc ? {x: bc.x, y: bc.y, name: 'the back centre'} : null;
}
function endingMoves(atXY){
  var out = [], zeroed = 'already', parked = null;
  if (!atXY || Math.hypot(atXY.x, atXY.y) > 0.02){ out.push('G90 G0 X0 Y0'); zeroed = true; }
  var sp = SERIAL.homedSeen ? endParkSpot() : null;
  if (sp){ out.push('G53 G0 X' + sp.x.toFixed(3) + ' Y' + sp.y.toFixed(3)); parked = sp; }
  return {cmds: out, zeroed: zeroed, parked: parked};
}
function parkReady(){                                        // can we move for a tool change?
  return !!toolChangeSpot() && SERIAL.homedSeen;
}
function runPark(done){
  var sp = toolChangeSpot();
  if (!sp){ done(); return; }
  probeRun('Tool-change position', [
    zHighCmd(topZ()),                          // right up, so there is room to work
    'G53 G0 X' + sp.x.toFixed(3) + ' Y' + sp.y.toFixed(3)
  ], function(){ done(); });
}

/* rapid position: fractions of the controller's real travel, 10 mm off the
   rails, always moving at traverse height. Machine coords, so homing required. */
function rapidTo(fx, fy){
  if (!requireIdle('rapid position')) return;
  var t = SERIAL.settings;
  if (!SERIAL.homedSeen || t[130] === undefined || t[131] === undefined){
    logC('err', 'rapid position needs a homed machine and controller config \u2014 home first');
    return;
  }
  var m = 10;                                          // stay this far inside the travel
  var rx = axisRange('x'), ry = axisRange('y');
  var x = rx.min + m + (rx.max - rx.min - 2 * m) * fx;
  var y = ry.min + m + (ry.max - ry.min - 2 * m) * fy;
  sendLine(zHighCmd(travelZ()));
  sendLine('G53 G0 X' + x.toFixed(1) + ' Y' + y.toFixed(1));
}

