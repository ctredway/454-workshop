/* ----- Change tool, from the jog panel (Carbide Motion's Change tool) ----- */
// Outside a job: lift Z right up, stop the spindle (after lifting, so it never stops in the material), go to the
// tool-change position, and wait while the bit is changed. With the BitSetter set up and a reference taken (when
// Z was zeroed), the new bit is then measured and its length applied, so Z zero is kept. Otherwise Z zero belongs
// to the old bit: Control says to set it again, and the next job's Start says so too until it is.
// A job's own tool changes (M6) are handled by its tool-change prompt, not here.

// What a change will do, worked out from the state alone (so it can be tested). o: {homed, liftCmd, spot,
// bsOn, bsWhy (null = ready), refZ}. Returns {why} if it can't be done, or {steps, measure, intro, swap}.
function toolChangePlan(o){
  if (!o.homed) return {why: 'The machine hasn’t been homed since it was connected. Lifting to the top and going to the ' +
                             'tool-change position use the machine’s own coordinates, which mean nothing until it homes.\n\nHome it first.'};
  var steps = [o.liftCmd, 'M5'];
  if (o.spot) steps.push('G53 G0 X' + o.spot.x.toFixed(3) + ' Y' + o.spot.y.toFixed(3));
  var measure = o.bsWhy === null && o.refZ !== null;
  var where = o.spot ? 'move to the tool-change position (' + o.spot.name + ', X' + o.spot.x.toFixed(1) + ' Y' + o.spot.y.toFixed(1) + ')'
                     : 'stay where it is (no tool-change position is set: Settings → Machine → Parking)';
  var intro = 'The machine will lift Z right up, stop the spindle, and ' + where + '. Then it waits while you change the bit.\n\n';
  if (measure) intro += 'Afterwards the new bit is measured on the BitSetter and its length applied, so your Z zero is kept.';
  else if (o.bsWhy === null) intro += '⚠ The BitSetter has no reference yet (it’s taken when you set Z zero), so the new bit can’t be ' +
                                       'measured against the old one. After the change, set Z zero again with the new bit.';
  else if (o.bsOn) intro += '⚠ The BitSetter is switched on but can’t be used: ' + o.bsWhy + '. After the change, set Z zero again with the new bit.';
  else intro += 'Your Z zero was set with the old bit. After the change, set Z zero again with the new one.';
  var swap = 'The spindle is off. Wait for it to stop turning, then change the bit and check its stickout.\n\n' +
             (measure ? 'Press Measure the new bit when it’s in, and keep clear: the machine moves to the BitSetter straight away.'
                      : 'Press Done when it’s in, then set Z zero for the new bit (Zero Z, or Probe…) before you cut.');
  return {steps: steps, measure: measure, intro: intro, swap: swap};
}

function toolChangeStart(){
  if (!SERIAL.connected){ logC('err', 'connect to the machine first'); return; }
  if (JOB.active){ logC('err', 'Change tool: a job is running, and its own tool-change prompt handles its changes.'); return; }
  if (PROBE.active || qaBusy('change the tool')) return;
  if (!requireIdle('tool change')) return;
  var p = toolChangePlan({homed: !!SERIAL.homedSeen, liftCmd: SERIAL.homedSeen ? zHighCmd(topZ()) : null, spot: toolChangeSpot(),
                          bsOn: !!PROFILE.bitSetter.enabled, bsWhy: bitSetterReady(), refZ: PROBE.refZ});
  if (p.why){ uiNote('The tool can’t be changed yet', p.why); return; }
  uiDialog({title: 'Change the tool?', body: p.intro, ok: 'Go'}).then(function (go) {
    if (!go) return;
    jogModalClose();                                     // releases keyboard jog; it opens again afterwards
    updateJobUI('Tool change: moving…');
    probeRun('Tool change', p.steps, function () {
      uiDialog({title: 'Change the bit now', body: p.swap, ok: p.measure ? 'Measure the new bit' : 'Done',
                cancel: 'Don’t measure', note: !p.measure}).then(function (ok) {
        if (p.measure && ok){
          probeStart('tool', function () {
            PROBE.toolSwapped = false;
            updateJobUI('Tool changed and measured: Z zero is kept.');
            jogModalOpen();
          });
          return;
        }
        // Not measured: Z zero is the old bit's until it's set again (clearToolOffset clears this, by every route).
        PROBE.toolSwapped = true;
        logC('err', 'tool changed but not measured — set Z zero for the new bit before cutting');
        updateJobUI('Tool changed: set Z zero for the new bit before cutting.');
        jogModalOpen();
      });
    });
  });
}
