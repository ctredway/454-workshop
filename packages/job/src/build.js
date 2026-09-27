// @ts-nocheck
/* The job builder, moved unchanged from 454 Control v0.31.2: turns a G-code file into the list of
   lines 454 sends, adding what files leave out (spin-up waits after M3, lifts before the spindle
   stops, tool-change handling, and every job's ending). Pinned by golden tests against Control
   itself; do not edit without them.

   Control reads three shared objects (the machine profile, the controller's state and the loaded
   file) and writes to its console. Here they're handed in, so the same code runs anywhere. */

export function createJobBuilder(env){
  var PROFILE = env.PROFILE, SERIAL = env.SERIAL, MODEL = env.MODEL;
  function logC(kind, msg){ if (env.log) env.log(kind, msg); }

  function splitGcodeComments(raw){
    var code = '', cur = '', comments = [], depth = 0;
    for (var i = 0; i < raw.length; i++){
      var ch = raw.charAt(i);
      if (depth === 0 && ch === ';'){ comments.push(raw.slice(i + 1)); break; }
      if (ch === '('){ if (depth > 0) cur += ch; else code += ' '; depth++; continue; }
      if (ch === ')' && depth > 0){
        depth--;
        if (depth === 0){ comments.push(cur); cur = ''; } else cur += ch;
        continue;
      }
      if (depth > 0) cur += ch; else code += ch;
    }
    if (depth > 0) comments.push(cur);            // unclosed: the rest of the line is comment
    return {code: code.trim(), comments: comments};
  }

  function cleanForSend(raw){
    return splitGcodeComments(raw).code;
  }

  function topZ(){
    var v = PROFILE.run.topZ;
    if (!isFinite(v)) v = 2;
    return Math.min(20, Math.max(0.5, v));
  }

  function travelZ(){
    var v = PROFILE.run.travelZ;
    if (!isFinite(v)) v = 5;
    return Math.min(30, Math.max(1, v));
  }

  function axisRange(axis){
    var T = SERIAL.settings[{x: 130, y: 131, z: 132}[axis]];
    if (!(T > 0)) return null;
    var homesToMin = !!((SERIAL.settings[23] || 0) & {x: 1, y: 2, z: 4}[axis]);
    var up = !!SERIAL.forceOrigin && homesToMin;
    var seen = SERIAL.axisSeen && SERIAL.axisSeen[axis];
    if (seen === 'up') up = true; else if (seen === 'down') up = false;
    return up ? {min: 0, max: T} : {min: -T, max: 0};
  }

  function describeRanges(){
    return ['x', 'y', 'z'].map(function (ax) {
      var r = axisRange(ax);
      if (!r) return ax.toUpperCase() + ' unknown';
      var seen = SERIAL.axisSeen && SERIAL.axisSeen[ax];
      var how = seen ? 'from positions the machine reported' : (SERIAL.forceOrigin ? 'origin set at home' : 'standard GRBL');
      return ax.toUpperCase() + ' ' + r.min + ' to ' + r.max + ' (' + how + ')';
    }).join('; ');
  }

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

  function presetSpot(which){
    var g = SERIAL.settings || {};
    var mx = g[130] > 0 ? g[130] : PROFILE.view.envW;
    var my = g[131] > 0 ? g[131] : PROFILE.view.envD;
    if (!(mx > 0) || !(my > 0)) return null;
    var m = 10;                                        // keep clear of the limits
    var rx = axisRange('x') || {min: -mx, max: 0}, ry = axisRange('y') || {min: -my, max: 0};
    var front = ry.min + m, back = ry.max - m, left = rx.min + m, right = rx.max - m, midX = (rx.min + rx.max) / 2;
    if (which === 'fl') return {x:left,  y:front};
    if (which === 'fr') return {x:right, y:front};
    if (which === 'bc') return {x:midX,  y:back};
    return {x:midX, y:front};                          // fc
  }

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

  function buildJobList(lines){
    var list = [], injected = 0, retracts = 0;
    // "stop high": climb to traverse height before any spindle stop, so the bit
    // never spins down in (or just above) the material. Same gate as start-high.
    var homed = (typeof SERIAL !== 'undefined') && SERIAL.homedSeen;
    var stopHigh = PROFILE.run.highStart;
    // Where the tool will be, in the machine's own Z, when it reaches this line. Work Z plus the
    // work offset. Needed because "lift to machine Z-5" is an absolute height: if the file is
    // already higher than that, the same command would drive the tool DOWN.
    var wcoZ = (typeof SERIAL !== 'undefined' && SERIAL.wco) ? SERIAL.wco.z : null;
    // The highest Z the file itself ever reaches: its own idea of a safe height. If the tool is
    // already there, it is clear of the work, and lifting further only means coming back down
    // again on the file's next Z move.
    var fileTopZ = null;
    if (typeof MODEL !== 'undefined' && MODEL && MODEL.segs){
      for (var ft = 0; ft < MODEL.segs.length; ft++){
        var fz = Math.max(MODEL.segs[ft].z0, MODEL.segs[ft].z1);
        if (fileTopZ === null || fz > fileTopZ) fileTopZ = fz;
      }
    }
    function workZAt(ln){
      if (typeof MODEL === 'undefined' || !MODEL || !MODEL.segs || !MODEL.segs.length) return null;
      var z = null;
      for (var q2 = 0; q2 < MODEL.segs.length; q2++){
        if (MODEL.segs[q2].line > ln) break;
        z = MODEL.segs[q2].z1;
      }
      return z;
    }
    function machineZAt(ln){
      if (wcoZ === null || typeof MODEL === 'undefined' || !MODEL || !MODEL.segs || !MODEL.segs.length) return null;
      var z = null;
      for (var q = 0; q < MODEL.segs.length; q++){
        if (MODEL.segs[q].line > ln) break;
        z = MODEL.segs[q].z1;
      }
      return z === null ? null : z + wcoZ;
    }
    var atTraverse = false;                  // has a lift already put the tool at traverse height?
    // A tool change or the end of a job: always go near the top of travel, whatever height the
    // file was using, so there is room to get at the spindle.
    function retractHigh(ln){
      if (!homed){                                     // no machine coordinates: relative, up only
        list.push({text:'G91 G0 Z' + travelZ().toFixed(1), ln:ln, syn:true});
        list.push({text:'G90', ln:ln, syn:true});
      } else {
        list.push({text:zHighCmd(topZ()), ln:ln, syn:true});
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
      var target = zBelowTop(travelZ());
      var mz = homed ? machineZAt(ln) : null;
      if (homed && mz !== null){
        if (mz >= target - 0.01) return;                  // already at or above traverse height: a "lift" would go down
        list.push({text:zHighCmd(travelZ()), ln:ln, syn:true});
        atTraverse = true;
      } else if (homed){
        // homed but the work offset isn't known yet: lift relative, which can only go up
        list.push({text:'G91 G0 Z' + travelZ().toFixed(1), ln:ln, syn:true});
        list.push({text:'G90', ln:ln, syn:true});
        atTraverse = true;
      } else {
        // not homed, so machine heights mean nothing: lift relative to wherever the tool is
        list.push({text:'G91 G0 Z' + travelZ().toFixed(1), ln:ln, syn:true});
        list.push({text:'G90', ln:ln, syn:true});
      }
      retracts++;
    }
    var fileSpin = {on: false, s: null, ccw: false};
    for (var i = 0; i < lines.length; i++){
      var ln = i + 1;
      var c = cleanForSend(lines[i]);
      if (!c || c === '%') continue;
      if (/M0*6(?![\d.])/i.test(c)){
        var tm = /T\s*(\d+)/i.exec(c);
        // safety: the spindle must be stopped before we invite a tool change
        var prev = list.length ? list[list.length - 1] : null;
        retractHigh(ln);                               // up out of the way first, every time
        if (!(prev && prev.text && /M0*5(?![\d.])/i.test(prev.text))) list.push({text:'M5', ln:ln, syn:true});
        var m6e = {m6:true, ln:ln, tool: tm ? tm[1] : '?', next:null};
        // where does the file go after this change? (first XY move beyond the M6)
        if (typeof MODEL !== 'undefined' && MODEL && MODEL.segs){
          for (var ni = 0; ni < MODEL.segs.length; ni++){
            var sg = MODEL.segs[ni];
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
            var ca = cleanForSend(lines[ka]);
            if (!ca) continue;
            if (/M0*[345](?![\d.])/i.test(ca)){ restartByFile = true; break; }
            if (/[XYZ]\s*[-+.\d]/i.test(ca)) break;
          }
          if (!restartByFile){
            list.push({text:(fileSpin.ccw ? 'M4' : 'M3') + (fileSpin.s !== null ? ' S' + fileSpin.s : ''), ln:ln, syn:true});
            if (PROFILE.spindle.spinup > 0){ list.push({text:'G4 P' + PROFILE.spindle.spinup, ln:ln, syn:true}); injected++; }
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
      if (/M0*3(?![\d.])/i.test(c) && PROFILE.spindle.spinup > 0){
        var nxt = '';
        for (var k = i + 1; k < lines.length; k++){
          var cc = cleanForSend(lines[k]);
          if (cc){ nxt = cc; break; }
        }
        // the file's own dwell only counts if it's at least as long as ours —
        // a token G4 P1 from the post must not suppress real spin-up time
        var nd = /G0*4(?![\d.]).*?P\s*([\d.]+)/i.exec(nxt);
        var fileDwell = nd ? parseFloat(nd[1]) : 0;
        if (fileDwell < PROFILE.spindle.spinup){
          list.push({text:'G4 P' + PROFILE.spindle.spinup, ln:ln, syn:true});
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
    if (typeof MODEL !== 'undefined' && MODEL && MODEL.segs && MODEL.segs.length){
      var lastSeg = MODEL.segs[MODEL.segs.length - 1];
      endXY = {x:lastSeg.x1, y:lastSeg.y1};
    }
    var em = homed ? endingMoves(endXY) : {cmds: (!endXY || Math.hypot(endXY.x, endXY.y) > 0.02) ? ['G90 G0 X0 Y0'] : [], zeroed: true, parked: null};
    em.cmds.forEach(function (c) { list.push({text: c, ln: lines.length, syn: true}); });
    list.zeroed = em.zeroed; list.parked = em.parked;
    tail.forEach(function(it){ list.push(it); });
    list.injected = injected;
    list.retracts = retracts;
    return list;
  }

  return { buildJobList: buildJobList, endingMoves: endingMoves, axisRange: axisRange, topZ: topZ, travelZ: travelZ, bitSetterReady: bitSetterReady };
}
