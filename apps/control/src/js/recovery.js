// When a running job is interrupted, work out where the machine actually was. GRBL accepts
// lines well ahead of the cutting, so the last line SENT overstates progress; the line whose
// path passes nearest the machine's last position is where cutting really stopped. The
// EARLIEST such line wins: recutting a little is harmless, skipping is not.
function recoveryNote(why){
  if (!JOB.active || !MODEL || !MODEL.segs || !MODEL.segs.length) return;
  var last = JOB.lastLn || 0, P = SERIAL.wpos;
  var best = null;
  if (P && last > 0){
    for (var i = 0; i < MODEL.segs.length; i++){
      var g = MODEL.segs[i];
      if (g.line > last) break;
      if (g.line < last - 3000) continue;
      var dx = g.x1 - g.x0, dy = g.y1 - g.y0, dz = g.z1 - g.z0, L2 = dx*dx + dy*dy + dz*dz;
      var t = L2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((P.x-g.x0)*dx + (P.y-g.y0)*dy + (P.z-g.z0)*dz) / L2));
      var d = Math.hypot(g.x0 + t*dx - P.x, g.y0 + t*dy - P.y, g.z0 + t*dz - P.z);
      if (!best || d < best.d - 0.05) best = {d:d, line:g.line};
    }
  }
  var line = best && best.d < 5 ? best.line : Math.max(1, last - 20);
  JOB.stopInfo = {why:why, lastSent:last, line:line, near: best ? best.d : null};
  var rl = document.getElementById('recLine');
  if (rl){ rl.value = line; rl.placeholder = line; }
  logC('sys', 'job interrupted (' + why + '). Cutting stopped around line ' + line +
       (best && best.d < 5 ? ' (nearest the machine\u2019s last position)' : ' (estimated: position unknown)') +
       '; line ' + last + ' was the last one sent. The Recover box is set to ' + line + ' \u2014 check the spot in the preview first.');
  try{ jumpToLine(line); }catch(e){}
}

function jobStartFrom(target){
  if (!MODEL || !MODEL.segs.length){ uiNote('No file loaded', 'Open the G-code file you were running.'); return; }
  if (!SERIAL.connected){ uiNote('Not connected', 'Connect to the machine first.'); return; }
  if (JOB.active) return;
  if (SERIAL.state !== 'Idle'){ uiNote('Machine isn’t ready', 'Recovery can only start from Idle. The machine is ' + SERIAL.state + '.'); return; }
  if (!SERIAL.homedSeen){ uiNote('Home first', 'Recovery needs a homed machine. Your work zero is stored in the controller and survives homing, so you won\u2019t need to re-zero.'); return; }
  znRemove('before resuming');                          // the Adjust panel starts at Z +0.00: the controller must too
  var snapped = recoverySnap(target);
  if (snapped === null){ uiNote('Nothing to resume there', 'No motion line at or before line ' + target + '.'); return; }
  var st = stateAtLine(snapped);
  var full = buildJobList(MODEL.lines);
  var si = -1;
  for (var i = 0; i < full.length; i++){ if (full[i].ln === snapped && !full[i].m6){ si = i; break; } }
  if (si < 0){ uiNote('Nothing to resume there', 'Line ' + snapped + ' isn\u2019t a sendable command.'); return; }
  var slice = full.slice(si);
  // strip a leading m6 marker chain remnant is unnecessary: slice starts at the motion line

  var inch = st.units === 'in';
  function u(mm){ return inch ? (mm / 25.4).toFixed(4) : mm.toFixed(3); }
  var pre = [];
  pre.push({text:'G21 G90', ln:0, syn:true});
  pre.push({text:zHighCmd(travelZ()), ln:0, syn:true});
  pre.push({text:'G0 X' + st.x.toFixed(3) + ' Y' + st.y.toFixed(3), ln:0, syn:true});
  if (st.spindle){
    pre.push({text: st.sVal !== null ? 'M3 S' + st.sVal : 'M3', ln:0, syn:true});
    if (PROFILE.spindle.spinup > 0) pre.push({text:'G4 P' + PROFILE.spindle.spinup, ln:0, syn:true});
  }
  if (inch) pre.push({text:'G20', ln:0, syn:true});
  if (st.plane !== 17) pre.push({text:'G' + st.plane, ln:0, syn:true});
  if (st.arcAbs) pre.push({text:'G90.1', ln:0, syn:true});
  // approach: rapid straight down if resuming into a rapid; careful plunge into a cut
  var seg0 = MODEL.segs[MODEL.lineFirstSeg[snapped]];
  if (seg0.rapid || st.z >= -0.001){
    pre.push({text:'G0 Z' + u(st.z), ln:0, syn:true});
  } else {
    pre.push({text:'G0 Z' + u(st.z + 2), ln:0, syn:true});
    var cap = inch ? 15 : 400; // plunge cap in file units/min
    var pf = st.feedRaw !== null ? Math.min(st.feedRaw, cap) : cap;
    pre.push({text:'G1 Z' + u(st.z) + ' F' + pf, ln:0, syn:true});
  }
  if (!st.abs) pre.push({text:'G91', ln:0, syn:true});
  if (st.motion === 1 && st.feedRaw !== null) pre.push({text:'G1 F' + st.feedRaw, ln:0, syn:true});
  else if (st.motion === 0) pre.push({text:'G0', ln:0, syn:true});

  var bsErr = bitSetterReady();
  var useBS = (bsErr === null && MODEL.tools.length > 0);
  var bsFresh = useBS && PROBE.refZ === null;            // no reference this session: measure one now
  var firstTool = MODEL.tools.length ? MODEL.tools[0].tool : null;
  var laterTool = st.tool !== null && firstTool !== null && String(st.tool) !== String(firstTool);
  var toolLine;
  if (useBS && !bsFresh)
    toolLine = 'BitSetter: the tool in the spindle is measured first, and its length is compensated against this session\u2019s reference.\n';
  else if (useBS)
    toolLine = 'BitSetter: no reference yet this session, so the tool in the spindle is measured AS the reference.\n' +
               '\u26a0 Z zero must have been set with the tool that is in the spindle NOW.\n';
  else if (laterTool)
    toolLine = '\u26a0\u26a0 TOOL LENGTH: this point is cut with T' + st.tool + ', but Z zero is normally set with T' + firstTool +
               ' (the file\u2019s first tool). Without a BitSetter the controller has no length compensation after a reset.\n' +
               '   Re-zero Z with T' + st.tool + ' in the spindle BEFORE resuming, or the depth will be off by the difference in tool length.\n';
  else
    toolLine = 'VERIFY: tool T' + (st.tool === null ? '?' : st.tool) + ' is loaded and Z zero is valid for it.\n';

  var msg = 'RECOVERY \u2014 resume at line ' + snapped +
            (snapped !== target ? ' (snapped back from ' + target + ': that line continues a modal move)' : '') + '\n\n' +
            'Computed state there:\n' +
            '  position X' + u(st.x) + ' Y' + u(st.y) + ' Z' + u(st.z) + (inch ? ' (in)' : ' (mm)') + '\n' +
            '  tool T' + (st.tool === null ? '?' : st.tool) +
            ' \u00b7 spindle ' + (st.spindle ? ('ON S' + st.sVal) : 'off') +
            ' \u00b7 feed ' + (st.feedRaw !== null ? st.feedRaw : '\u2014') + '\n\n' +
            'Sequence: climb to top \u2192 rapid to XY \u2192 ' +
            (st.spindle ? 'spindle + ' + PROFILE.spindle.spinup + 's dwell \u2192 ' : '') +
            (seg0.rapid || st.z >= -0.001 ? 'rapid to Z' : 'rapid to Z+2, feed-plunge to Z') + ' \u2192 stream.\n' +
            toolLine +
            (st.uncertain ? '\u26a0 The file uses machine-coordinate, offset or work-coordinate commands before this line \u2014 the computed position may be wrong. Air-check first.\n' : '') +
            '\nProceed?';
  uiDialog({title:'Resume from line ' + snapped + '?', body:msg, ok:'Resume'}).then(function(go){
  if (!go){ logC('sys', 'recovery cancelled'); return; }

  JOB.active = true; JOB.held = false; JOB.toolWait = null; JOB.parkPending = false;
  JOB.list = pre.concat(slice);
  JOB.total = JOB.list.length; JOB.idx = 0; JOB.acked = 0;
  JOB.inflight = []; JOB.startedAt = performance.now(); JOB.lastLn = snapped;
  JOB.useBS = useBS;
  ZN.val = 0; znDisplay();
  sendRT(0x90); sendRT(0x99); sendRT(0x95);
  bzCloseModal(); jogModalClose();
  fitView(); animateView(0, 0.02);
  playing = false; updatePlayBtn();
  var fs = MODEL.lineFirstSeg[snapped];
  if (fs !== undefined) setTime(MODEL.segs[fs].t0);
  logC('sys', 'RECOVERY: resuming at line ' + snapped + ' (' + JOB.total + ' blocks)');
  updateJobUI();
  if (JOB.useBS) probeStart(bsFresh ? 'ref' : 'tool', jobFill);
  else jobFill();
  });
}

function updateJobUI(statusText){
  var pct = JOB.total ? Math.round(JOB.acked / JOB.total * 100) : 0;
  document.getElementById('jobBarFill').style.width = pct + '%';
  var el = document.getElementById('jobStatus');
  var txt;
  if (statusText) txt = statusText;
  else if (JOB.active) txt = 'line ' + (JOB.lastLn || 0) + ' \u00b7 ' + pct + '% \u00b7 ' +
                             fmtTime((performance.now() - JOB.startedAt) / 1000);
  else if (!JOB.acked) txt = 'no job running';
  else txt = el.textContent;
  el.textContent = txt;
  // viewport run bar
  var rbEl = document.getElementById('runBar');
  rbEl.classList.toggle('on', JOB.active || SERIAL.connected);   // visible whenever there's a machine
  rbEl.classList.toggle('job', JOB.active);                      // job-only controls appear with the job
  rbMenuRender();
  document.getElementById('rbFill').style.width = pct + '%';
  document.getElementById('rbTxt').textContent = txt;
  document.getElementById('ovF').textContent = 'F ' + SERIAL.ov[0] + '%';
  document.getElementById('ovS').textContent = 'S ' + SERIAL.ov[2] + '%';
}

