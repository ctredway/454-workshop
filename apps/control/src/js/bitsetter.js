/* ----- BitSetter (job-integrated tool length) ----- */
// The machine coordinates each axis can reach. Standard GRBL counts from -travel up to 0 whichever
// way an axis homes. Firmware built to set the origin at home instead counts UP from 0 on an axis
// that homes towards its minimum. The build options say which; positions the machine reports
// after homing confirm it, and win if they disagree.
function axisRange(axis){
  var T = SERIAL.settings[{x: 130, y: 131, z: 132}[axis]];
  if (!(T > 0)) return null;
  var homesToMin = !!((SERIAL.settings[23] || 0) & {x: 1, y: 2, z: 4}[axis]);
  var up = !!SERIAL.forceOrigin && homesToMin;
  var seen = SERIAL.axisSeen && SERIAL.axisSeen[axis];
  if (seen === 'up') up = true; else if (seen === 'down') up = false;
  return up ? {min: 0, max: T} : {min: -T, max: 0};
}
// Machine Z for "this far below the top of travel", whichever way the Z axis counts.
function zBelowTop(n){ var r = axisRange('z'); return (r ? r.max : 0) - n; }
function zHighCmd(n){ return 'G53 G0 Z' + zBelowTop(n).toFixed(1); }
function bitSetterReady(){ // null = ready, else the reason it isn't
  if (!PROFILE.bitSetter.enabled) return 'disabled in Machine profile';
  if (PROFILE.bitSetter.x === null || PROFILE.bitSetter.y === null)
    return 'position not set \u2014 jog over the button and use Capture';
  if (!SERIAL.homedSeen) return 'machine has not homed this session';
  var s = SERIAL.settings;
  if (s[130] === undefined || s[131] === undefined) return 'controller travel not read yet';
  // A captured position is where the machine actually went, so it's honoured. It's only refused
  // if it can't exist on this machine whichever way its coordinates count: beyond the full travel
  // in both directions, which means a typing slip or a profile from another machine.
  var x = PROFILE.bitSetter.x, y = PROFILE.bitSetter.y;
  if (Math.abs(x) > s[130] + 25 || Math.abs(y) > s[131] + 25)
    return 'stored position (' + x + ', ' + y + ') can\u2019t be on this machine, which travels ' + s[130] + ' \u00d7 ' + s[131] +
           ' mm \u2014 jog over the button and capture it again';
  var rx = axisRange('x'), ry = axisRange('y');
  if ((x < rx.min - 1 || x > rx.max + 1 || y < ry.min - 1 || y > ry.max + 1) && !bitSetterReady.noted){
    bitSetterReady.noted = true;                        // worth knowing, not worth refusing
    logC('sys', 'note: the BitSetter position (' + x + ', ' + y + ') lies outside the range worked out for this machine (' +
         describeRanges() + '). It is used as captured. If jogging near the ends seems limited, run Check controller settings (Settings \u2192 Machine).');
  }
  return null;
}
// How each axis's range was worked out, for the controller check and for diagnosing a machine.
function describeRanges(){
  return ['x', 'y', 'z'].map(function (ax) {
    var r = axisRange(ax);
    if (!r) return ax.toUpperCase() + ' unknown';
    var seen = SERIAL.axisSeen && SERIAL.axisSeen[ax];
    var how = seen ? 'from positions the machine reported' : (SERIAL.forceOrigin ? 'origin set at home' : 'standard GRBL');
    return ax.toUpperCase() + ' ' + r.min + ' to ' + r.max + ' (' + how + ')';
  }).join('; ');
}
// Test the BitSetter: the same moves as a real measurement, but it only reports. It never takes
// a reference or applies an offset, so it's safe at any time the machine is idle.
function bsTest(){
  if (!SERIAL.connected){ logC('err', 'connect to the machine first'); return; }
  if (JOB.active || PROBE.active) return;
  var why = bitSetterReady();
  if (why !== null){ uiNote('The BitSetter can\u2019t be tested yet', 'It\u2019s ' + (PROFILE.bitSetter.enabled ? 'switched on, but ' + why : 'switched off') + '.'); return; }
  if (!requireIdle('BitSetter test')) return;
  uiDialog({title: 'Test the BitSetter?',
            body: 'The machine will lift, move over the BitSetter, touch off with the tool in the spindle, and lift again.\n\nNothing is changed: no reference is taken and no offset applied.',
            ok: 'Run the test', cancel: 'Cancel'}).then(function (go) {
    if (!go) return;
    updateJobUI('BitSetter test\u2026');
    probeRun('BitSetter test', probeSteps(), function (cap) {
      if (cap.z === undefined){ probeFail('the test finished but no probe result was received'); return; }
      var msg = 'The BitSetter works: the tool triggered it at machine Z ' + cap.z.toFixed(3) + '.';
      if (PROBE.refZ !== null){
        var d = cap.z - PROBE.refZ;
        msg += Math.abs(d) < 0.02 ? '\n\nThis is the same length as the reference tool, within ' + Math.abs(d).toFixed(3) + ' mm.'
             : '\n\nThis tool is ' + Math.abs(d).toFixed(3) + ' mm ' + (d > 0 ? 'longer' : 'shorter') + ' than the reference tool.';
      } else msg += '\n\nNo reference has been taken yet: setting Z zero offers to take one.';
      logC('sys', 'BitSetter test: triggered at machine Z ' + cap.z.toFixed(3) + (PROBE.refZ !== null ? ' (reference ' + PROBE.refZ.toFixed(3) + ')' : ''));
      updateJobUI('BitSetter test done.');
      uiNote('BitSetter test', msg);
    });
  });
}
// How fast to search down for the BitSetter. The search only has to find it: the reading comes from the
// slow second touch. What speed costs is how far the machine coasts past the switch while it stops, which
// depends on the Z axis's acceleration ($122, mm/s^2): coasting distance = v^2 / 2a. So: the fastest that
// coasts at most 0.5 mm, no faster than 1000 mm/min or Z's own maximum rate ($112), and never slower than
// the 200 mm/min it used to be. A typical Shapeoko (400 mm/s^2) gets 1000 mm/min.
function bitSetterSeekRate(settings){
  var a = settings && settings[122] > 0 ? settings[122] : null;          // mm/s^2
  var vmax = settings && settings[112] > 0 ? settings[112] : 1000;        // mm/min
  if (a === null) return 500;                                             // not read yet: a middle course
  var v = Math.sqrt(2 * a * 0.5) * 60;                                    // mm/min that coasts 0.5 mm
  return Math.max(200, Math.min(1000, vmax, Math.floor(v / 10) * 10));   // rounded down: the limit holds
}
function probeSteps(){ // BitSetter sequence (name kept: the preflight preview prints it)
  var down = Math.max(10, (SERIAL.settings[132] || 80) - travelZ() - 1);
  return [
    zHighCmd(travelZ()),
    'G53 G0 X' + PROFILE.bitSetter.x.toFixed(3) + ' Y' + PROFILE.bitSetter.y.toFixed(3),
    'G21 G91',
    {cmd: 'G38.2 Z-' + down.toFixed(1) + ' F' + bitSetterSeekRate(SERIAL.settings), capture: 'zf'},   // find it, quickly
    'G0 Z2',
    {cmd: 'G38.2 Z-5 F40', capture: 'z'},                                                 // measure it, slowly
    'G90',
    zHighCmd(travelZ())
  ];
}
function probeStart(kind, onDone){ // BitSetter entry point (job code calls this)
  // Measuring a tool means comparing it with the reference. With no reference there is nothing to
  // compare with, and the arithmetic would apply the tool's whole machine Z as its length offset,
  // so this measurement becomes the reference instead.
  if (kind === 'tool' && PROBE.refZ === null){
    logC('sys', 'BitSetter: no reference yet, so this tool becomes the reference');
    kind = 'ref';
  }
  updateJobUI(kind === 'ref' ? 'BitSetter: probing reference tool\u2026' : 'BitSetter: probing new tool\u2026');
  probeRun(kind === 'ref' ? 'BitSetter reference' : 'BitSetter tool', probeSteps(), function(cap){
    if (cap.z === undefined){ probeFail('sequence completed but no probe result was received'); return; }
    if (kind === 'ref'){
      PROBE.refZ = cap.z;
      logC('sys', 'BitSetter: reference tool triggers at machine Z ' + PROBE.refZ.toFixed(3));
      bsRefNote();
    } else {
      var delta = cap.z - PROBE.refZ;
      PROBE.tlo = delta;
      sendLine('G43.1 Z' + (delta + ZN.val).toFixed(3));
      logC('sys', 'BitSetter: new tool triggers at Z ' + cap.z.toFixed(3) +
           ' \u2014 length offset ' + (delta >= 0 ? '+' : '') + delta.toFixed(3) + ' mm applied (G43.1)');
    }
    if (onDone) onDone();
  });
}

// Before Z zero is set: cancel the controller's tool length offset (G43.1). It belongs to the old zero
// and the old reference. Setting a new zero with it still active builds it into the zero, and the next
// tool change, which replaces the offset, then shifts the whole job by it: a job starting with a tool
// change once cut 20 mm too deep this way. The Z nudge belongs to the old zero too.
function clearToolOffset(){
  sendLine('G49');
  PROBE.tlo = 0;
  if (typeof ZN !== 'undefined') ZN.val = 0;
}
// Setting Z zero makes the tool in the spindle the one every later tool must be measured
// against. So the reference is taken right then, with that tool, the way Carbide Motion does:
// measuring it later (at job start) would silently use whatever bit happens to be in by then.
function bsAfterZero(){
  var why = bitSetterReady();
  if (why !== null){
    if (PROFILE.bitSetter.enabled)                      // switched on but unusable: say so, don't go quiet
      uiNote('The BitSetter can\u2019t measure this tool', 'It\u2019s switched on, but ' + why + '.\n\n' +
             'Until that\u2019s sorted, tools won\u2019t be measured, and a tool change would cut at the old tool\u2019s depth.');
    bsRefNote();
    return;
  }
  PROBE.refZ = null; PROBE.tlo = 0;                     // the old reference belonged to the old zero
  uiDialog({title: 'Measure this tool on the BitSetter?',
            body: 'Z zero was just set with the tool that\u2019s in the spindle. Measuring it now makes it the reference: ' +
                  'every tool is measured against it, so tool changes keep this zero, and swapping bits before pressing Start is caught.\n\n' +
                  'The machine will lift, move to the BitSetter and touch off.',
            ok: 'Measure now', cancel: 'Later'}).then(function (go) {
    if (!go){ logC('sys', 'BitSetter reference not taken \u2014 the tool in the spindle at Start will be used instead'); return; }
    probeStart('ref', function () {
      updateJobUI('BitSetter reference taken with the tool that set Z zero.');
      bsRefNote();
    });
  });
}
function bsRefNote(){
  var el = document.getElementById('bsRefState');
  if (!el) return;
  var why = bitSetterReady();
  if (!PROFILE.bitSetter.enabled){ el.textContent = 'not set up'; el.style.color = ''; return; }
  if (why !== null){ el.textContent = 'switched on but unavailable: ' + why; el.style.color = 'var(--amber)'; return; }
  el.textContent = PROBE.refZ === null ? 'ready, no reference yet' : 'reference taken (machine Z ' + PROBE.refZ.toFixed(3) + ')';
  el.style.color = '';
}

if (typeof module !== 'undefined' && module.exports) module.exports = { bitSetterSeekRate: bitSetterSeekRate };   // for the tests
