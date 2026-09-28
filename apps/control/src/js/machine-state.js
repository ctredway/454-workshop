/* ============================================================
   WEB SERIAL — GRBL 1.1 machine layer
   Streams with the character-counting protocol (RX buffer kept
   ≤ RX_CAP bytes in flight). M6 lines are intercepted, never sent.
   ============================================================ */
var RX_CAP = 100; // GRBL RX buffer is 128; leave headroom

var SERIAL = {
  supported: (typeof navigator !== 'undefined' && 'serial' in navigator),
  port:null, reader:null, writer:null, connected:false,
  lineBuf:'', state:'offline',
  wco:{x:0,y:0,z:0}, mpos:{x:0,y:0,z:0}, wpos:{x:0,y:0,z:0},
  feed:0, speed:0, pins:'', ov:[100,100,100],
  settings:{}, offsets:{}, buildInfo:'', queried:false, rateApplied:false,
  homedSeen:false, prevState:'',
  pollTimer:null, writeChain:null, verbose:false
};

var JOB = {active:false, held:false, list:null, total:0, idx:0,
           inflight:[], acked:0, lastLn:0, toolWait:null, startedAt:0};
var JOGC = {active:false, timer:null, limitHit:false, inflight:0, p:null, dist:0, feed:0, pred:{x:0,y:0,z:0}};
var KEYJOG = {code:null};
var JOG_KEYS = {ArrowLeft:[-1,0,0], ArrowRight:[1,0,0], ArrowUp:[0,1,0], ArrowDown:[0,-1,0], PageUp:[0,0,1], PageDown:[0,0,-1]};

// Commands that must not be sent while the machine is busy. Zeroing, rapid moves, going to zero
// and starting the spindle need it stopped; jogs may also follow a jog already under way, which
// GRBL allows. During a job, only the moment it waits at a tool change counts as stopped.
function requireIdle(what){
  if (SERIAL.state === 'Alarm'){
    logC('err', what + ' blocked \u2014 machine is locked. Home ($H) first.');
    return false;
  }
  var jogLike = what === 'jog' || what === 'lift';
  var ok = SERIAL.state === 'Idle' || (jogLike && SERIAL.state === 'Jog');
  if (JOB.active && !atToolChange()) ok = false;
  if (!ok){
    var said = {Run: 'moving', Hold: 'on hold', Jog: 'jogging', Home: 'homing', Door: 'stopped by the door switch', Check: 'in check mode', Sleep: 'asleep'}[SERIAL.state];
    logC('err', what + ' blocked \u2014 the machine is ' + (JOB.active ? 'running a job' : (said || 'busy')) + '. Wait until it stops.');
    return false;
  }
  return true;
}

