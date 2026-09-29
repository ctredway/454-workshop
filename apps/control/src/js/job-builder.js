// The job builder: what a job actually sends to the machine. The file's own lines, plus everything
// 454 Control adds to make it safe: a spin-up wait after each spindle start (unless the file's own wait
// is at least as long), a lift before each spindle stop (never downwards), and at each tool change a
// lift to the top, a spindle stop, and a restart if the file assumes the spindle is still running. At
// the end: lift, stop the spindle, return to the job's XY zero and park, with the file's own M2 or M30
// kept last.
//
// JobBuilder.build(lines, m) is a pure function: everything it needs about the machine and the settings
// is passed in (m), so it can be tested on its own (apps/control/test/job-builder.test.mjs). Control's
// buildJobList(), below it, gathers m from Control's state and calls it.
//
//   m.homed      has the machine homed this session? (machine coordinates mean something)
//   m.wcoZ       the work offset's Z, or null if it isn't known yet
//   m.stopHigh   "Start & stop high" (Settings -> Job)
//   m.spinup     the spin-up wait after the spindle starts (M3 or M4), in seconds (0: none)
//   m.segs       the parsed job's moves ({line, x0, y0, z0, x1, y1, z1}), or null
//   m.zMax       the top of Z travel, in machine coordinates
//   m.travelZ    traverse height: how far below the top of travel to travel at, in mm
//   m.topZ       how far below the top of travel to lift at tool changes and the end, in mm
//   m.clean      a line of the file with its comments removed
//   m.endingMoves(endXY) -> {cmds, zeroed, parked}: the moves off the part at the end (homed only)
var JobBuilder = (function () {
  'use strict';
  function build(lines, m){
  function zHighCmd(n){ return 'G53 G0 Z' + zBelowTop(n).toFixed(1); }     // absolute, below the top of travel
  function zBelowTop(n){ return (m.zMax || 0) - n; }

  var list = [], injected = 0, retracts = 0;
  // "stop high": climb to traverse height before any spindle stop, so the bit
  // never spins down in (or just above) the material. Same gate as start-high.
  var homed = !!m.homed;
  var stopHigh = m.stopHigh;
  // Where the tool will be, in the machine's own Z, when it reaches this line. Work Z plus the
  // work offset. Needed because "lift to machine Z-5" is an absolute height: if the file is
  // already higher than that, the same command would drive the tool DOWN.
  var wcoZ = m.wcoZ === undefined ? null : m.wcoZ;
  // The highest Z the file itself ever reaches: its own idea of a safe height. If the tool is
  // already there, it is clear of the work, and lifting further only means coming back down
  // again on the file's next Z move.
  var fileTopZ = null;
  var SEGS = m.segs || null;
  if (SEGS){
    for (var ft = 0; ft < SEGS.length; ft++){
      var fz = Math.max(SEGS[ft].z0, SEGS[ft].z1);
      if (fileTopZ === null || fz > fileTopZ) fileTopZ = fz;
    }
  }
  function workZAt(ln){
    if (!SEGS || !SEGS.length) return null;
    var z = null;
    for (var q2 = 0; q2 < SEGS.length; q2++){
      if (SEGS[q2].line > ln) break;
      z = SEGS[q2].z1;
    }
    return z;
  }
  function machineZAt(ln){
    if (wcoZ === null || !SEGS || !SEGS.length) return null;
    var z = null;
    for (var q = 0; q < SEGS.length; q++){
      if (SEGS[q].line > ln) break;
      z = SEGS[q].z1;
    }
    return z === null ? null : z + wcoZ;
  }
  var atTraverse = false;                  // has a lift already put the tool at traverse height?
  // A tool change or the end of a job: always go near the top of travel, whatever height the
  // file was using, so there is room to get at the spindle.
  function retractHigh(ln){
    if (!homed){                                     // no machine coordinates: relative, up only
      list.push({text:'G91 G0 Z' + m.travelZ.toFixed(1), ln:ln, syn:true});
      list.push({text:'G90', ln:ln, syn:true});
    } else {
      list.push({text:zHighCmd(m.topZ), ln:ln, syn:true});
    }
    atTraverse = true;
    retracts++;
  }
  function retractBeforeStop(ln){
    // "Start & stop high" off: no lift when the tool is already clear of the material. But a spindle
    // is never stopped with the tool in the material, whatever the setting: the bit can snap or burn
    // as it spins down, and would restart buried.
    if (!stopHigh){ var wzs = workZAt(ln); if (wzs === null || wzs >= -0.001) return; }
    if (atTraverse) return;                // already up there: nothing to do
    var wz = workZAt(ln);
    if (wz === null) return;               // nothing has moved yet: position unknown, and nothing to lift away from
    if (fileTopZ !== null && wz >= fileTopZ - 0.01) return;   // already at the file's own safe height
    var pv = list.length ? list[list.length - 1] : null;
    if (pv && pv.text && (/^G53 G0 Z/.test(pv.text) || pv.text.indexOf('G91 G0 Z') === 0)) return; // already climbing
    var target = zBelowTop(m.travelZ);
    var mz = homed ? machineZAt(ln) : null;
    if (homed && mz !== null){
      if (mz >= target - 0.01) return;                  // already at or above traverse height: a "lift" would go down
      list.push({text:zHighCmd(m.travelZ), ln:ln, syn:true});
      atTraverse = true;
    } else if (homed){
      // homed but the work offset isn't known yet: lift relative, which can only go up
      list.push({text:'G91 G0 Z' + m.travelZ.toFixed(1), ln:ln, syn:true});
      list.push({text:'G90', ln:ln, syn:true});
      atTraverse = true;
    } else {
      // not homed, so machine heights mean nothing: lift relative to wherever the tool is
      list.push({text:'G91 G0 Z' + m.travelZ.toFixed(1), ln:ln, syn:true});
      list.push({text:'G90', ln:ln, syn:true});
    }
    retracts++;
  }
  var fileSpin = {on: false, s: null, ccw: false};
  for (var i = 0; i < lines.length; i++){
    var ln = i + 1;
    var c = m.clean(lines[i]);
    if (!c || c === '%') continue;
    if (/M0*6(?![\d.])/i.test(c)){
      var tm = /T\s*(\d+)/i.exec(c);
      // safety: the spindle must be stopped before we invite a tool change
      var prev = list.length ? list[list.length - 1] : null;
      retractHigh(ln);                               // up out of the way first, every time
      if (!(prev && prev.text && /M0*5(?![\d.])/i.test(prev.text))) list.push({text:'M5', ln:ln, syn:true});
      var m6e = {m6:true, ln:ln, tool: tm ? tm[1] : '?', next:null};
      // where does the file go after this change? (first XY move beyond the M6)
      if (SEGS){
        for (var ni = 0; ni < SEGS.length; ni++){
          var sg = SEGS[ni];
          if (sg.line > ln && (Math.abs(sg.x1 - sg.x0) > 0.001 || Math.abs(sg.y1 - sg.y0) > 0.001)){
            m6e.next = {x: sg.x1, y: sg.y1};
            break;
          }
        }
      }
      list.push(m6e);
      // 454 stopped the spindle for the change. If the file had it running and doesn't start it again
      // before its next move (it thinks it never stopped), start it again here, at the file's speed,
      // with the usual spin-up wait, while the tool is still up at the top. Otherwise the rest of the
      // job would plunge a stationary bit into the material.
      if (fileSpin.on){
        var restartByFile = false;
        for (var ka = i + 1; ka < lines.length; ka++){
          var ca = m.clean(lines[ka]);
          if (!ca) continue;
          if (/M0*[345](?![\d.])/i.test(ca)){ restartByFile = true; break; }
          if (/[XYZ]\s*[-+.\d]/i.test(ca)) break;
        }
        if (!restartByFile){
          list.push({text:(fileSpin.ccw ? 'M4' : 'M3') + (fileSpin.s !== null ? ' S' + fileSpin.s : ''), ln:ln, syn:true});
          if (m.spinup > 0){ list.push({text:'G4 P' + m.spinup, ln:ln, syn:true}); injected++; }
        }
      }
      continue;
    }
    // the file's own idea of the spindle: running or not, and at what speed
    var sw = /S\s*([\d.]+)/i.exec(c);
    if (sw) fileSpin.s = parseFloat(sw[1]);
    if (/M0*[34](?![\d.])/i.test(c)){ fileSpin.on = true; fileSpin.ccw = /M0*4(?![\d.])/i.test(c); }
    else if (/M0*5(?![\d.])/i.test(c)) fileSpin.on = false;
    if (/M0*5(?![\d.])/i.test(c)) retractBeforeStop(ln);
    list.push({text:c, ln:ln});
    if (/Z/i.test(c)) atTraverse = false;   // the file moved Z, so the tool may be anywhere again
    if (/M0*[34](?![\d.])/i.test(c) && m.spinup > 0){      // a spindle start, either direction
      var nxt = '';
      for (var k = i + 1; k < lines.length; k++){
        var cc = m.clean(lines[k]);
        if (cc){ nxt = cc; break; }
      }
      // the file's own dwell only counts if it's at least as long as ours —
      // a token G4 P1 from the post must not suppress real spin-up time
      var nd = /G0*4(?![\d.]).*?P\s*([\d.]+)/i.exec(nxt);
      var fileDwell = nd ? parseFloat(nd[1]) : 0;
      if (fileDwell < m.spinup){
        list.push({text:'G4 P' + m.spinup, ln:ln, syn:true});
      var dz = workZAt(ln);                          // where the bit waits while the spindle spins up
      if (dz !== null && (list.dwellZ === undefined || dz < list.dwellZ)) list.dwellZ = dz;
        injected++;
      }
    }
  }
  // End of the job: lift clear, stop the spindle, then move away from the part so it can be
  // measured or unclamped without reaching over the bit.
  var endAt = list.length;
  for (var e2 = list.length - 1; e2 >= 0; e2--){          // keep the file's own M2/M30 last
    var et = list[e2].text || '';
    if (!et) continue;
    if (/M0*(2|30)(?![\d.])/i.test(et)) endAt = e2;
    break;
  }
  var tail = list.splice(endAt);
  retractHigh(lines.length);                          // finish high, so the part is easy to reach
  var spinStillOn = false;                                // is the spindle actually still running?
  for (var s2 = list.length - 1; s2 >= 0; s2--){
    var st2 = list[s2].text || '';
    if (/M0*5(?![\d.])/i.test(st2)) break;                 // last spindle command was a stop
    if (/M0*[34](?![\d.])/i.test(st2)){ spinStillOn = true; break; }
  }
  if (spinStillOn) list.push({text:'M5', ln:lines.length, syn:true});
  // Then off the part, as Carbide Motion does: back to the job's XY zero, then park.
  var endXY = null;
  if (SEGS && SEGS.length){
    var lastSeg = SEGS[SEGS.length - 1];
    endXY = {x:lastSeg.x1, y:lastSeg.y1};
  }
  var em = homed ? m.endingMoves(endXY) : {cmds: (!endXY || Math.hypot(endXY.x, endXY.y) > 0.02) ? ['G90 G0 X0 Y0'] : [], zeroed: true, parked: null};
  em.cmds.forEach(function (c) { list.push({text: c, ln: lines.length, syn: true}); });
  list.zeroed = em.zeroed; list.parked = em.parked;
  tail.forEach(function(it){ list.push(it); });
  list.injected = injected;
  list.retracts = retracts;
  return list;
  }
  // "Start high": where to go, high up, before the job begins: the file's first XY point, so the file's first
  // move down lands on the work. Not when the file changes tools before it moves anywhere: the tool change
  // lifts to the top and goes to the tool-change position itself (or stays put, if none is set), and after it
  // Control traverses high to the first cut. Going to the first cut before the change was a wasted trip over
  // the work, straight back to the tool change. list: what build() made; segs: the file's moves.
  function startHighTarget(list, segs){
    var p0 = null;
    for (var si = 0; si < (segs || []).length; si++){
      var sg = segs[si];
      if (Math.abs(sg.x1 - sg.x0) > 0.001 || Math.abs(sg.y1 - sg.y0) > 0.001){ p0 = {x: sg.x1, y: sg.y1, line: sg.line}; break; }
    }
    if (!p0) return null;
    for (var li = 0; li < list.length; li++) if (list[li].m6 && list[li].ln <= p0.line) return null;
    return {x: p0.x, y: p0.y};
  }
  return { build: build, startHighTarget: startHighTarget };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JobBuilder;     // for the tests, in Node

// Control's job builder: its state, gathered for JobBuilder.build
function buildJobList(lines){
  var zr = axisRange('z');
  return JobBuilder.build(lines, {
    homed: (typeof SERIAL !== 'undefined') && SERIAL.homedSeen,
    wcoZ: (typeof SERIAL !== 'undefined' && SERIAL.wco) ? SERIAL.wco.z : null,
    stopHigh: PROFILE.run.highStart,
    spinup: PROFILE.spindle.spinup,
    segs: (typeof MODEL !== 'undefined' && MODEL && MODEL.segs) ? MODEL.segs : null,
    zMax: zr ? zr.max : 0,
    travelZ: travelZ(),
    topZ: topZ(),
    clean: cleanForSend,
    endingMoves: endingMoves,
  });
}

