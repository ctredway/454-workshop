/* ---------------- what can be pressed now ----------------
   Clint, 2026-10-23: "when the machine is moving, like a pause and lift, any other movement buttons need to be
   disabled", and "I am very big on hiding or disabling UI elements so its very clear what can or cannot be done".
   moveLockUI() sets every button that moves the machine (or changes where its zero is) from what the machine is doing,
   on every status report and job change. STOP is never disabled. requireIdle() refuses the same moves from the keys
   and the game controller, so a disabled button isn't the only guard.
     moving on its own: pausing or ending (ENDING), lifting after a pause, probing, a quick action, or (outside a job)
       Run or Home: nothing else that moves; Hold stays, to stop it
     a job running: only its own controls (Hold, Pause & lift, End job, Adjust); at a tool change, jogging too
     jogging: the jog buttons, nothing else
     paused and lifted, still: Resume and End job; jogging, to look */
// Paused and still lifting? Done once the controller is Idle with Z at the top (or, lifted by a set amount, unhomed,
// Idle a little after the lift was sent)
function pausedLifting(){
  if (typeof PAUSED === 'undefined' || !PAUSED || !PAUSED.lifting) return false;
  var at = PAUSED.liftZ === null || PAUSED.liftZ === undefined || (SERIAL.mpos && SERIAL.mpos.z >= PAUSED.liftZ - 0.05);
  if (SERIAL.state === 'Idle' && at && performance.now() - (PAUSED.since || 0) > 400) PAUSED.lifting = false;
  return !!PAUSED.lifting;
}
function moveLockState(){
  var st = SERIAL.state || '', on = !!SERIAL.connected;
  var ending = typeof ENDING !== 'undefined' && !!ENDING;
  var paused = typeof PAUSED !== 'undefined' && !!PAUSED;
  var still = (st === 'Idle' || st === 'Alarm') && !pausedLifting();
  var tool = JOB.active && typeof atToolChange === 'function' && atToolChange();
  var moving = ending || (paused && !still) || PROBE.active || (typeof QA !== 'undefined' && QA.active) ||
               (!JOB.active && /^(Run|Home)/.test(st));
  return {on: on, st: st, ending: ending, paused: paused, still: still, tool: tool, moving: moving,
          jogging: st === 'Jog', job: JOB.active};
}
// Why a move asked for from the keys, the game controller or a button can't happen now (null: it can)
function moveLockWhy(){
  var s = moveLockState();
  if (s.ending) return 'the job is pausing or ending: wait until it has stopped and lifted';
  if (s.paused && !s.still) return 'Z is still lifting after the pause: wait until it’s at the top';
  return null;
}
function moveLockUI(){
  var s = moveLockState(), el = function (id){ return document.getElementById(id); };
  var set = function (id, off){ var b = el(id); if (b) b.disabled = !!off; };
  // moves of its own (and zeroing): not while anything else is moving, nor during a job (but at its tool change)
  var free = !s.on || s.moving || s.jogging || (s.job && !s.tool);
  ['homeBtn', 'gotoZero', 'jogZ6', 'jogProbe', 'zeroX', 'zeroY', 'zeroZ', 'zeroAll', 'rbActions', 'bsTest', 'bzStart'].forEach(function (id){ set(id, free); });
  document.querySelectorAll('[data-rp]').forEach(function (b){ b.disabled = free; });
  set('jogTool', free || s.job);                        // a job's bit changes are its own tool-change prompts
  set('jobRun', !s.on || s.moving || s.jogging || s.job || s.paused);
  set('jobRecover', !s.on || s.moving || s.jogging || s.job || s.paused);
  // jogging: the jog buttons themselves stay while jogging; not while anything else moves, or a job cuts
  var jogOff = !s.on || s.moving || (s.job && !s.tool);
  document.querySelectorAll('#jogGrid button').forEach(function (b){ b.disabled = jogOff; });
  set('rbJog', jogOff); set('jogOpen', jogOff); set('bzOpen', jogOff);
  // the job's own controls
  var cutting = s.job && !s.ending && /^(Run|Hold|Door)/.test(s.st);
  ['rbHold', 'jobHold', 'hdrHold'].forEach(function (id){ set(id, !s.on || s.ending || !/^(Run|Jog|Home)/.test(s.st)); });
  var canResume = s.on && !s.ending && ((s.paused && s.still && !s.job) || /^(Hold|Door)/.test(s.st));
  ['rbResume', 'jobResume', 'hdrResume'].forEach(function (id){ set(id, !canResume); });
  set('rbDoor', !(cutting && !JOB.toolWait && !PROBE.active));
  ['rbStop', 'jobStop'].forEach(function (id){ set(id, !(s.on && !s.ending && (s.job || (s.paused && s.still)))); });
  // the Adjust panel's spindle speed: only a VFD's can be changed from here (a router's is on its dial)
  var sp = el('ovSpItem'); if (sp) sp.hidden = !(PROFILE.spindle && PROFILE.spindle.type === 'vfd');
}
