function jobFill(){
  if (PROBE.active) return; // probe sequence owns the wire
  if (JOB.ending) return;   // End job pressed: nothing more from the file
  while (JOB.active && !JOB.held && !JOB.toolWait && JOB.idx < JOB.total){
    var it = JOB.list[JOB.idx];
    if (it.m6){
      // Without a BitSetter, a tool change after cutting has started needs Z zeroed again for the
      // new tool. A change before anything has been cut is the tool you zeroed with.
      var cutBefore = !!(MODEL && MODEL.segs.some(function (sg) { return !sg.rapid && sg.line < it.ln; }));
      JOB.toolWait = {line: it.ln, tool: it.tool, next: it.next, needZero: !JOB.useBS && cutBefore, zeroed: false};
      JOB.parkPending = parkReady();
      JOB.idx++; JOB.acked++;
      logC('sys', 'tool change at line ' + it.ln + ' (T' + it.tool + ') — waiting for buffer to drain');
      break;
    }
    var bytes = it.text.length + 1;
    if (inflightBytes() + bytes > RX_CAP) break;
    JOB.inflight.push({len: bytes, ln: it.ln, syn: it.syn});
    sendLine(it.text, !SERIAL.verbose);
    JOB.idx++;
  }
  maybeToolPrompt();
  updateJobUI();
  if (JOB.active && JOB.idx >= JOB.total && !JOB.inflight.length && !JOB.toolWait) jobDone();
}

function maybeToolPrompt(){
  var b = document.getElementById('toolBanner');
  if (JOB.active && JOB.toolWait && !JOB.inflight.length && JOB.parkPending && !PROBE.active){
    JOB.parkPending = false;
    runPark(function(){ maybeToolPrompt(); });
    b.style.display = 'none';
    return;
  }
  if (JOB.active && JOB.toolWait && !JOB.inflight.length && !PROBE.active){
    var ti = MODEL && MODEL.toolInfo ? MODEL.toolInfo[JOB.toolWait.tool] : null;
    document.getElementById('toolBannerTxt').textContent =
      'Tool change — T' + JOB.toolWait.tool + (ti ? ': ' + ti.desc : '') +
      ' (line ' + JOB.toolWait.line + ')';
    b.style.display = 'block';
    var ti2 = MODEL && MODEL.toolInfo ? MODEL.toolInfo[JOB.toolWait.tool] : null;
    var which = 'Insert T' + JOB.toolWait.tool + (ti2 ? ' \u2014 ' + ti2.desc : '');
    document.getElementById('toolWhich').textContent = which;
    var tw = JOB.toolWait, needZero = !!tw.needZero;
    document.getElementById('toolSteps').textContent =
      'The spindle has stopped and the machine is waiting.\n\n' +
      '1. Change the tool and check the stickout.\n' +
      (JOB.useBS ? '2. Press continue: the new tool is measured on the BitSetter and its length applied automatically.\n' +
                   '3. Keep clear \u2014 the machine moves as soon as you continue.'
       : needZero ? '2. Set Z zero for the new tool, with the BitZero or by jogging down and zeroing. Without a BitSetter it would otherwise cut at the old tool\u2019s depth.\n' +
                    '3. Continue: the machine lifts, moves to the next cut, and carries on.'
       : '2. This is the first tool, before anything is cut: Z zero should already have been set with it.\n' +
         '3. Keep clear \u2014 the machine moves as soon as you continue.');
    document.getElementById('toolZeroRow').hidden = !needZero;
    document.getElementById('toolBz').hidden = !(PROFILE.bitZero && PROFILE.bitZero.enabled);
    var zs = document.getElementById('toolZeroState');
    zs.textContent = tw.zeroed ? '\u2713 Z zero set for this tool.' : 'Z zero not set for this tool yet.';
    zs.style.color = tw.zeroed ? 'var(--ok)' : 'var(--amber)';
    var go = document.getElementById('toolContinue');
    go.disabled = needZero && !tw.zeroed;
    go.title = go.disabled ? 'Set Z zero for the new tool first' : '';
    document.getElementById('toolModal').hidden = false;
    (go.disabled ? document.getElementById(PROFILE.bitZero && PROFILE.bitZero.enabled ? 'toolBz' : 'toolJog') : go).focus();
  } else {
    b.style.display = 'none';
    document.getElementById('toolModal').hidden = true;
  }
}

function onAck(ok, code){
  if (!JOB.active || !JOB.inflight.length) return;
  var e = JOB.inflight.shift();
  JOB.acked++;
  if (e.ln > 0){
    JOB.lastLn = e.ln;
    document.getElementById('droLine').textContent = e.ln;
  }
  // paint progress in the 3D view up to this source line
  if (!e.syn && MODEL && MODEL.lineFirstSeg[e.ln] !== undefined){
    var si = MODEL.lineFirstSeg[e.ln], j = si;
    while (j + 1 < MODEL.segs.length && MODEL.segs[j + 1].line === e.ln) j++;
    setTime(MODEL.segs[j].t1);
  }
  if (!ok){
    JOB.held = true;
    sendRT(0x21, '! (feed hold — error at line ' + e.ln + ')');
    updateJobUI('error:' + code + ' at line ' + e.ln + ' — held. Fix and Resume, or Stop.');
    return;
  }
  jobFill();
}

function jobStart(opts){
  opts = opts || {};
  if (qaBusy('run a job')) return;
  if (!MODEL || !MODEL.segs.length){ uiNote('No file loaded', 'Open a G-code file first.'); return; }
  // Homing first, always: without it the machine's own coordinates mean nothing, so lifting to
  // traverse height, parking and the BitSetter all quietly stop working.
  if (SERIAL.connected && !SERIAL.homedSeen){
    logC('err', 'job not started \u2014 the machine has not homed this session');
    HOME_ASKED = false; PROFILE.askHome = true;
    homeMaybeAsk();
    if (document.getElementById('homeModal').hidden)
      uiNote('Home the machine first', 'Machine coordinates are needed for lifting clear, parking and the BitSetter.');
    return;
  }
  if (!SERIAL.connected){ uiNote('Not connected', 'Connect to the machine first, on the Machine tab.'); return; }
  if (JOB.active) return;
  if (SERIAL.state !== 'Idle'){
    uiNote('Machine isn’t ready', 'A job can only start from Idle. The machine is ' + SERIAL.state + ' — home or unlock it first.');
    return;
  }
  // A nudge still on from a job that didn't finish (an alarm, a failed probe): off before this one is
  // described, well ahead of its first line, so the controller's answer isn't counted as the job's.
  if (!ADJ.keep) znRemove('before this job');
  else if (adjKeptText() && !opts.keepChosen){
    // "Keep for the next job" is ticked, and the Adjust panel can't be reached between jobs: ask here.
    uiDialog({title: 'Start with the last job’s adjustments?',
              body: '“Keep for the next job” is ticked in the Adjust panel, so this job would start with:\n\n' +
                    '   ' + adjKeptText() + '\n\n' +
                    '• Keep them: this job starts with them, as the last one ended.\n' +
                    '• Back to normal: feed, spindle and rapid at 100%, no Z nudge, and the tick comes off.',
              ok: 'Keep them', alt: 'Back to normal', cancel: 'Cancel'}).then(function (v) {
      if (v === 'alt') adjKeepSet(false);
      if (v === true || v === 'alt') jobStart(Object.assign({}, opts, {keepChosen: true}));
    });
    return;
  }
  else { znApply(); adjRestore(); }
  var bb = modelBBox(MODEL);
  var all = MODEL.issues.concat(dynamicChecks(MODEL, cfg()));
  var errs = all.filter(function(i){ return i.sev === 'err'; }).length;
  var list = buildJobList(MODEL.lines);

  // "start high": traverse to the file's first XY point at top of travel first
  var highStartNote = '';
  if (PROFILE.run.highStart){
    if (!SERIAL.homedSeen){
      highStartNote = 'Start high: skipped — not homed (preview only).\n';
    } else {
      var p0 = JobBuilder.startHighTarget(list, MODEL.segs);   // none when the file changes tools first
      if (!p0 && list.some(function (it){ return it.m6; }))
        highStartNote = 'Start high: the file changes tools before it moves, so the machine goes to the tool change first; after it, it traverses at the top to the first cut.\n';
      if (p0){
        list.unshift({text: 'G0 X' + p0.x.toFixed(3) + ' Y' + p0.y.toFixed(3), ln: 0, syn: true});
        list.unshift({text: 'G21 G90', ln: 0, syn: true});
        list.unshift({text: zHighCmd(travelZ()), ln: 0, syn: true});
        highStartNote = 'Start high: traverse ' + travelZ().toFixed(0) + ' mm below Z top to X' + p0.x.toFixed(1) +
                        ' Y' + p0.y.toFixed(1) + ', then the file plunges there. Also applies after each tool change.\n';
      }
    }
  }

  var msg = 'Run "' + document.getElementById('fileName').textContent + '" on the machine?\n\n' +
    'Cut extents  X: ' + bb.cmin.x.toFixed(1) + ' … ' + bb.cmax.x.toFixed(1) + ' mm\n' +
    '             Y: ' + bb.cmin.y.toFixed(1) + ' … ' + bb.cmax.y.toFixed(1) + ' mm\n' +
    '             Z: ' + bb.cmin.z.toFixed(2) + ' … ' + bb.cmax.z.toFixed(2) + ' mm\n' +
    'Checks tab: ' + (errs ? errs + ' error(s) — review before running!' : 'no errors') + '\n';

  var tp = travelPreflight();
  if (tp){
    if (tp.ok) msg += 'Machine travel: fits from the current zero (per controller config; assumes homed).\n';
    else msg += '*** TRAVEL WARNING: ' + tp.msgs.join('; ') + ' — expect a soft-limit alarm or a rail hit! ***\n';
  } else {
    msg += 'Machine travel: not checked (controller config not read yet).\n';
  }
  // a router's speed is set on its dial, so S values only matter for a VFD
  if (PROFILE.spindle.type === 'vfd' && MODEL.sMin > 0 && SERIAL.settings[31] > 0 && MODEL.sMin < SERIAL.settings[31])
    msg += '\u26a0 Spindle: the file asks for S' + MODEL.sMin + ', below the controller\u2019s minimum of ' + SERIAL.settings[31] + ' ($31); it will run at ' + SERIAL.settings[31] + '.\n';
  if (PROFILE.spindle.type === 'vfd' && MODEL.sMax && SERIAL.settings[30] !== undefined && MODEL.sMax > SERIAL.settings[30]){
    msg += '*** SPINDLE: file commands S' + MODEL.sMax + ' but the controller max ($30) is ' +
           SERIAL.settings[30] + ' — RPM will be capped. ***\n';
  }
  var bsErr = bitSetterReady();
  var firstCut = null;
  for (var fc = 0; fc < MODEL.segs.length; fc++) if (!MODEL.segs[fc].rapid){ firstCut = MODEL.segs[fc].line; break; }
  var startsWithToolChange = MODEL.tools.some(function (t) { return firstCut === null || t.line < firstCut; });
  // Like Carbide Motion: with a BitSetter set up, the tool is measured at Start whether or not the
  // file changes tools. Against a reference taken at Z zero, that also catches a swapped bit.
  var useBS = (bsErr === null);
  // Tool changes after cutting has started, with no BitSetter to measure the new tools: decide
  // how before anything moves, rather than finding out at the first change.
  var laterChanges = MODEL.tools.filter(function (t) { return MODEL.segs.some(function (sg) { return !sg.rapid && sg.line < t.line; }); }).length;
  if (laterChanges && bsErr !== null && !opts.rezeroChosen){
    uiDialog({title: 'This job changes tools, but the BitSetter isn\u2019t set up',
              body: 'It changes tool ' + laterChanges + (laterChanges === 1 ? ' time' : ' times') + ' after cutting starts. The BitSetter is ' +
                    'unavailable (' + bsErr + ').\n\n' +
                    'Each new tool is a different length, so without a BitSetter it needs Z zeroed again before it cuts, or it cuts at the wrong depth.\n\n' +
                    '\u2022 Set up the BitSetter to have every tool measured automatically, or\n' +
                    '\u2022 re-zero Z yourself at each change: the tool-change prompt will ask you to, with the BitZero or by jogging.',
              ok: 'Re-zero at each change', alt: 'Set up the BitSetter', cancel: 'Cancel'}).then(function (v) {
      if (v === true) jobStart(Object.assign({}, opts, {rezeroChosen: true}));
      else if (v === 'alt'){
        document.getElementById('setModal').hidden = false;
        var accTab = document.querySelector('#smTabs button[data-sm="smAcc"]');
        if (accTab) accTab.click();
      }
    });
    return;
  }
  if (MODEL.tools.length > 1){
    var names = MODEL.tools.map(function(t){
      var ti = MODEL.toolInfo[t.tool];
      return 'T' + t.tool + (ti ? ' ' + ti.desc : '');
    }).join(' → ');
    msg += 'Multi-tool file: ' + names + '\n';
    var tcSp = toolChangeSpot();
    msg += tcSp ? '   At each change: up to ' + topZ().toFixed(1) + ' mm below the top of travel, then X' + tcSp.x.toFixed(1) + ' Y' + tcSp.y.toFixed(1) + (tcSp.auto ? ' (front centre).\n' : ' (your captured spot).\n')
                : '   At each change the machine stays where the file stopped \u2014 set a tool-change position in Settings.\n';
  }
  if (PROFILE.bitSetter.enabled && bsErr !== null)
    msg += '*** The BitSetter is switched on but can\u2019t be used: ' + bsErr + '. No tool will be measured. ***\n';
  if (MODEL.tools.length > 0 || useBS){
    if (useBS){
      var firstTool = startsWithToolChange && MODEL.tools.length ? 'T' + MODEL.tools[0].tool : null;
      var when = firstTool ? 'when you confirm ' + firstTool + ' is loaded' : 'at the start';
      if (PROBE.refZ !== null){
        msg += 'BitSetter: reference taken when Z was zeroed. The first tool is measured against it ' + when + ', and every new tool at each change.\n';
      } else {
        msg += 'BitSetter: no reference yet, so the first tool is measured AS the reference ' + when + ', then every new tool at each change.\n';
        msg += '\u26a0 Z zero must have been set with ' + (firstTool ? firstTool : 'the tool in the spindle now') + '. Setting Z zero offers to take the reference then, which avoids this.\n';
      }
      if (!PROBE.previewDone){
        PROBE.previewDone = true;
        msg += '  First probe this session — exact sequence:\n    ' + probeSteps().join('\n    ') + '\n';
      }
    } else {
      msg += laterChanges ? 'No BitSetter: at each tool change you\u2019ll set Z zero for the new tool before continuing.\n'
                          : 'BitSetter INACTIVE (' + bsErr + ') — not needed: no tool changes after cutting starts.\n';
    }
  }
  var hasM3 = list.some(function(it){ return it.text && /M0*[34](?![\d.])/i.test(it.text); });   // a spindle start: M3 or M4
  if (list.injected){
    msg += 'Spin-up: a G4 P' + PROFILE.spindle.spinup + ' s dwell will be inserted after each spindle start (' +
           list.injected + '\u00d7).\n';
    if (list.dwellZ !== undefined)
      msg += (list.dwellZ < 1
        ? '\u26a0 The bit waits for the spindle at Z ' + list.dwellZ.toFixed(2) + ', at or below the job zero \u2014 this file starts the spindle after descending.\n'
        : '   It waits at Z ' + list.dwellZ.toFixed(2) + ' above the job zero and only descends afterwards.\n');
  } else if (hasM3 && PROFILE.spindle.spinup > 0){
    msg += 'Spin-up: the file already dwells \u2265 ' + PROFILE.spindle.spinup + ' s after the spindle starts — nothing added.\n';
  } else if (hasM3){
    msg += '*** SPIN-UP DWELL IS 0 — motion begins immediately after the spindle starts. Set it in Machine profile. ***\n';
  }
  if (list.retracts){
    msg += 'Stop high: Z climbs clear before each spindle stop (' + list.retracts + '\u00d7).\n';
  }
  var endBits = [];
  if (PROFILE.run.highStart) endBits.push(SERIAL.homedSeen ? 'lift to traverse height' : 'lift ' + travelZ().toFixed(1) + ' mm (not homed, so relative)');
  endBits.push('spindle off');
  endBits.push(list.zeroed === 'already' ? 'the file ends at the job’s XY zero' : 'back to the job’s XY zero');
  if (list.parked) endBits.push('then park at ' + list.parked.name + ' (X' + list.parked.x.toFixed(1) + ' Y' + list.parked.y.toFixed(1) + ')');
  msg += 'At the end: ' + endBits.join(', ') + '.\n';
  msg += highStartNote;
  if (adjKeptText()) msg += '⚠ Kept from the last job (Adjust panel): ' + adjKeptText() + '.\n';
  if (!PROFILE.run.highStart)
    msg += '*** START & STOP HIGH IS OFF — the machine will travel at whatever height the file uses and will not lift before stopping the spindle. Turn it on in Machine settings unless you have a reason. ***\n';
  msg += '\nWork zero set? Right tool loaded? Hand near the e-stop?\n' +
    'For a new file, consider an air cut first (zero Z above the stock).';
  uiDialog({title:'Start this job?', body:msg, ok:'Start job'}).then(function(go){
  if (!go){ logC('sys', 'job not started'); return; }

  jogModalClose();
  JOB.active = true; JOB.held = false; JOB.toolWait = null;
  JOB.list = list; JOB.total = list.length;
  JOB.idx = 0; JOB.acked = 0; JOB.lastLn = 0; JOB.inflight = [];
  JOB.startedAt = performance.now();
  JOB.clock = {last: JOB.startedAt, machine: 0, tool: 0, hold: 0, probe: 0};
  JOB.spinupAdded = (list.injected || 0) * (PROFILE.spindle.spinup || 0);   // waits Control inserted
  JOB.estimate = MODEL.totalTime; JOB.name = document.getElementById('fileName').textContent;
  JOB.useBS = useBS;
  JOB.parkPending = false;
  PROBE.tlo = 0;
  adjBegin();                                // feed, spindle, rapid and the Z nudge: back to normal, or the last job's if kept
  bzCloseModal();
  fitView();
  animateView(0, 0.02); // snap to Top for the run \u2014 camera stays free afterward
  playing = false; updatePlayBtn(); setTime(0);
  logC('sys', 'job started — ' + JOB.total + ' blocks' + (list.injected ? ' (incl. ' + list.injected + ' spin-up dwells)' : ''));
  // With a reference from when Z was zeroed, the loaded tool is measured against it: no change
  // if it's the same bit, and a swap since zeroing is compensated rather than silently wrong.
  // A file that loads its first tool (M6) before cutting gets the tool prompt straight away, and
  // the tool is measured there, as Carbide Motion does. Only a file with no such M6 is measured here.
  if (JOB.useBS && !startsWithToolChange) probeStart(PROBE.refZ !== null ? 'tool' : 'ref', jobFill);
  else jobFill();
  });
}

function jobHold(){
  if (!SERIAL.connected) return;
  JOB.held = true;
  sendRT(0x21, '! (feed hold)');
  updateJobUI('held — Resume to continue');
}
function jobResume(){
  if (!SERIAL.connected) return;
  sendRT(0x7e, '~ (resume)');
  if (JOB.active){ JOB.held = false; jobFill(); }
}
// END JOB, done properly. GRBL can only cancel moves it has already queued by resetting, and a
// reset while moving loses the machine's position. So: hold, wait until the machine has actually
// stopped, reset to clear the queue (safe once still, and position is kept), then lift clear and
// move off the part the same way a finished job does. The red STOP stays the instant halt.
var ENDING = null;
function jobStop(){
  if (!SERIAL.connected) return;
  if (ENDING) return;                                  // already ending
  recoveryNote('stopped');
  PROBE.active = false; PROBE.onDone = null;
  JOB.ending = true;                                   // send nothing more from the file
  ENDING = {stage: 'holding', since: performance.now()};
  sendRT(0x21, '! (feed hold)');
  updateJobUI('ending \u2014 slowing to a stop\u2026');
  logC('sys', 'ending the job: holding, then lifting clear');
  ENDING.timer = setInterval(endingTick, 100);
}
function endingTick(){
  if (!ENDING) return;
  var waited = performance.now() - ENDING.since;
  if (ENDING.stage === 'holding'){
    var stopped = (SERIAL.state === 'Hold' && SERIAL.subState === '0') || SERIAL.state === 'Idle';
    if (!stopped && waited < 8000) return;             // still decelerating
    if (!stopped) logC('err', 'the machine didn\u2019t report stopping \u2014 resetting anyway; re-home before the next job');
    ENDING.stage = 'reset'; ENDING.since = performance.now();
    sendRT(0x18, 'ctrl-x (soft reset: clears the queued moves)');
    JOB.active = false; JOB.held = false; JOB.toolWait = null; JOB.inflight = [];
    maybeToolPrompt();
    updateJobUI('ending \u2014 queue cleared, lifting clear\u2026');
    return;
  }
  if (ENDING.stage === 'reset'){
    if (waited < 1200) return;                         // give the controller time to come back
    clearInterval(ENDING.timer);
    var done = ENDING; ENDING = null; JOB.ending = false;
    if (SERIAL.state === 'Alarm'){
      updateJobUI('ended, but the controller is in alarm \u2014 home it before moving');
      logC('err', 'job ended; controller reports ALARM after the reset, so nothing was moved');
      return;
    }
    // lift and park exactly as the end of a finished job does
    var cmds = ['G90', 'G21'];
    if (SERIAL.homedSeen) cmds.push(zHighCmd(topZ()));
    else { cmds.push('G91 G0 Z' + travelZ().toFixed(1)); cmds.push('G90'); }
    if (SERIAL.homedSeen){
      var wp = SERIAL.wpos ? {x: SERIAL.wpos.x, y: SERIAL.wpos.y} : null;
      endingMoves(wp).cmds.forEach(function (c) { cmds.push(c); });
    }
    cmds.forEach(function (c) { sendLine(c); });
    updateJobUI('ended \u2014 lifted clear' + (cmds.some(function (c) { return /G53 G0 X/.test(c); }) ? ' and parked' : '') + '. Recover can resume from where it stopped.');
    logC('sys', 'job ended: spindle off, lifted clear');
  }
}
// Where a running job's time goes. Each status report's interval lands in one bucket: the machine
// moving the job, waiting at a tool change, held, or measuring on the BitSetter. Only the first is
// comparable with the estimate, which knows nothing of the others.
function jobClockTick(){
  if (!JOB.active || !JOB.clock) return;
  var now = performance.now(), dt = (now - JOB.clock.last) / 1000;
  JOB.clock.last = now;
  if (!(dt > 0) || dt > 5) return;                     // a gap in reports (tab asleep, reconnect) isn't counted
  var b = PROBE.active ? 'probe' : JOB.toolWait ? 'tool' : (JOB.held || SERIAL.state === 'Hold') ? 'hold' : 'machine';
  JOB.clock[b] += dt;
}
function jobDone(){
  jobClockTick();
  JOB.active = false;
  if (!ADJ.keep) znRemove('now the job has finished'); // a nudge is for this job only, unless it's kept
  var total = (performance.now() - JOB.startedAt) / 1000, c = JOB.clock || {machine: total, tool: 0, hold: 0, probe: 0};
  var machine = Math.max(0, c.machine - (JOB.spinupAdded || 0)), est = JOB.estimate || 0;
  var diff = est > 0 ? (machine - est) / est * 100 : null;
  var extras = [];
  if (JOB.spinupAdded > 0.5) extras.push(fmtTime(JOB.spinupAdded) + ' spin-up waits');
  if (c.tool > 0.5) extras.push(fmtTime(c.tool) + ' at tool changes');
  if (c.probe > 0.5) extras.push(fmtTime(c.probe) + ' measuring tools');
  if (c.hold > 0.5) extras.push(fmtTime(c.hold) + ' held');
  var line = 'Job finished in ' + fmtTime(total) + ': machine time ' + fmtTime(machine) +
             (est > 0 ? ' against an estimate of ' + fmtTime(est) + ' (' + (diff >= 0 ? '+' : '') + diff.toFixed(0) + '%)' : '') +
             (extras.length ? '; also ' + extras.join(', ') : '') + '.';
  updateJobUI('done \u2014 ' + fmtTime(total) + (est > 0 ? ' (machine ' + fmtTime(machine) + ', estimated ' + fmtTime(est) + ')' : ''));
  logC('sys', line);
  // kept, so a pattern shows over several jobs
  try{
    var hist = JSON.parse(localStorage.getItem('454-control-jobtimes') || '[]');
    hist.push({when: new Date().toISOString(), file: JOB.name || '', est: +est.toFixed(1), machine: +machine.toFixed(1), total: +total.toFixed(1)});
    localStorage.setItem('454-control-jobtimes', JSON.stringify(hist.slice(-50)));
    var withEst = hist.filter(function (h) { return h.est > 30; });
    if (withEst.length >= 3){
      var avg = withEst.reduce(function (a, h) { return a + (h.machine - h.est) / h.est; }, 0) / withEst.length * 100;
      logC('sys', 'over the last ' + withEst.length + ' jobs, machine time has run ' + (avg >= 0 ? avg.toFixed(0) + '% longer' : (-avg).toFixed(0) + '% shorter') + ' than estimated');
    }
  }catch(e){}
}
