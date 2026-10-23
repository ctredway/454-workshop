// Running only some of a file's toolpaths (Control 0.37.0): the Toolpaths tab's tick boxes. The file's own lines in an
// unticked toolpath are left out; everything else is the normal job (the job builder adds its lifts, spindle stops and
// tool changes as always). Before each ticked toolpath that follows a left-out one, Control puts the machine in the
// state the file expects there, as Recover does: up to the top, a tool change if the left-out part loaded a different
// tool, to where the toolpath starts, the spindle on (with its spin-up wait) if the file had it on, down carefully,
// and the units, plane and modes the file was using.
//
// JobSkip.plan(o) is pure, for the tests (apps/control/test/job-skip.test.mjs):
//   o.lines      the file's lines
//   o.sections   its toolpaths in file order: [{from, to, name}] (line ranges, as the Toolpaths tab finds them)
//   o.skip       [true/false] per section: true = left out
//   o.segs       the file's moves ({line, ...}), from the parser
//   o.stateAt(ln)   the file's state just before line ln (recovery-state.js stateAtLine): position in mm, units, modes,
//                   spindle, tool
//   o.clean(line)   a line without its comments
// Returns null if nothing is left out, {why} if it can't be run that way, or {lines, segs, resumes, kept, skipped}:
// lines with the left-out ones blanked (same numbering, so progress and the preview still match), the moves that are
// still run, and where to put the machine back in step ({ln, st, tool, ownSpin}).
//
// JobSkip.resumeItems(r, mk) is what's sent at one of those places. mk: {zHigh, spinup}.
// JobSkip.apply(list, plan, mk) puts them into a built job (JobBuilder.build), before the toolpath's first move.
var JobSkip = (function () {
  'use strict';
  function plan(o){
    var secs = o.sections || [], skip = o.skip || [];
    if (!secs.some(function (s, i) { return !!skip[i]; })) return null;
    if (secs.every(function (s, i) { return !!skip[i]; })) return {why: 'Every toolpath is unticked, so there’s nothing to run.'};
    var lines = o.lines.slice(), out = function (ln) { for (var i = 0; i < secs.length; i++) if (skip[i] && ln >= secs[i].from && ln <= secs[i].to) return true; return false; };
    for (var ln = 1; ln <= lines.length; ln++) if (out(ln)) lines[ln - 1] = '';
    var segs = (o.segs || []).filter(function (g) { return !out(g.line); });
    var resumes = [], since = false, tool = null;          // tool: in the spindle in this run (null: whatever was loaded)
    for (var i = 0; i < secs.length; i++){
      var s = secs[i];
      if (skip[i]){ since = true; continue; }
      var first = null, fseg = null;
      for (var k = 0; k < segs.length; k++) if (segs[k].line >= s.from && segs[k].line <= s.to){ first = segs[k].line; fseg = segs[k]; break; }
      if (since && first !== null){
        var st = o.stateAt(first), own = '', ownM6 = false, ownSpin = false;
        for (var l2 = s.from; l2 < first; l2++){
          own = o.clean(o.lines[l2 - 1]) || '';
          if (/M0*6(?![\d.])/i.test(own)) ownM6 = true;
          if (/M0*[34](?![\d.])/i.test(own)) ownSpin = true;
        }
        var fl = o.clean(o.lines[first - 1]) || '';
        if ((st.motion === 2 || st.motion === 3) && !/G\s*0*[0123](?![\d.])/i.test(fl))
          return {why: '“' + s.name + '” starts partway along an arc, so it can’t be run without the toolpath before it.'};
        if (st.uncertain)
          return {why: 'This file moves in machine coordinates or changes its offsets (G53, G92, G10 or another work offset) before “' + s.name +
                       '”, so where it starts can’t be worked out. Run the whole file instead.'};
        var needTool = !ownM6 && st.tool !== null && String(st.tool) !== String(tool) ? st.tool : null;
        // Where to go: the toolpath's first move starts where the left-out one ended. When that move is a rapid above
        // the work, go straight to its end instead (it's only getting there), rather than over the left-out toolpath.
        var at = fseg && fseg.rapid && Math.min(fseg.z0, fseg.z1) >= -0.001 ? {x: fseg.x1, y: fseg.y1, z: fseg.z1} : {x: st.x, y: st.y, z: st.z};
        resumes.push({ln: first, st: st, at: at, tool: needTool, ownSpin: ownSpin, name: s.name});
      }
      since = false;
      var after = o.stateAt(Math.min(s.to + 1, o.lines.length + 1));
      if (after.tool !== null) tool = after.tool;
    }
    return {lines: lines, segs: segs, resumes: resumes,
            kept: secs.filter(function (s, i) { return !skip[i]; }), skipped: secs.filter(function (s, i) { return !!skip[i]; })};
  }
  function resumeItems(r, mk){
    var st = r.st, at = r.at || st, inch = st.units === 'in', ln = r.ln, out = [];
    function u(mm){ return inch ? (mm / 25.4).toFixed(4) : mm.toFixed(3); }
    function add(t){ out.push({text: t, ln: ln, syn: true}); }
    add('G21 G90');                                                  // Control's moves are in millimetres
    add(mk.zHigh);                                                   // up out of the way first, every time
    if (r.tool !== null && r.tool !== undefined){                    // the left-out part loaded this tool: load it here
      add('M5');
      out.push({m6: true, ln: ln, tool: String(r.tool), next: {x: at.x, y: at.y}});
      add('G21 G90');                                                // the tool change and BitSetter used millimetres too
    }
    add('G0 X' + at.x.toFixed(3) + ' Y' + at.y.toFixed(3));
    if (st.spindle && (!r.ownSpin || r.tool !== null)){
      add(st.sVal !== null ? 'M3 S' + st.sVal : 'M3');
      if (mk.spinup > 0) add('G4 P' + mk.spinup);
    }
    if (inch) add('G20');
    if (st.plane !== 17) add('G' + st.plane);
    if (st.arcAbs) add('G90.1');
    if (at.z >= -0.001) add('G0 Z' + u(at.z));                      // above the work: straight down
    else {                                                           // into the work: near it fast, then at a plunge feed
      add('G0 Z' + u(at.z + 2));
      var cap = inch ? 15 : 400, pf = st.feedRaw !== null ? Math.min(st.feedRaw, cap) : cap;
      add('G1 Z' + u(at.z) + ' F' + pf);
    }
    if (!st.abs) add('G91');
    // The file's feed, whatever it was last doing: a toolpath at the same feed as the one before has no F of its own
    // (Design writes F only when it changes), and the BitSetter's slow touch leaves the controller at F40. Without
    // this, a ticked toolpath after a left-out one cut at 40 mm/min (Clint, 2026-10-22).
    if (st.feedRaw !== null) add((st.motion === 0 || st.motion === 1 ? 'G' + st.motion + ' ' : '') + 'F' + st.feedRaw);
    else if (st.motion === 0) add('G0');
    return out;
  }
  function apply(list, p, mk){
    for (var i = p.resumes.length - 1; i >= 0; i--){
      var r = p.resumes[i], at = list.length;
      for (var k = 0; k < list.length; k++) if (list[k].ln >= r.ln){ at = k; break; }
      Array.prototype.splice.apply(list, [at, 0].concat(resumeItems(r, mk)));
    }
    return list;
  }
  return {plan: plan, resumeItems: resumeItems, apply: apply};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JobSkip;     // for the tests, in Node

// Control's side: which toolpaths are unticked (by their place in the Toolpaths tab; cleared when a file is opened),
// and the job built with them left out.
var TP_SKIP = [];
function jobSkipPlan(){
  if (!MODEL || !TP_SKIP.some(Boolean)) return null;
  var sum = jobSummary(MODEL);
  if (!sum || sum.list.length < 2) return null;
  return JobSkip.plan({lines: MODEL.lines, sections: sum.list.map(function (r) { return {from: r.from, to: r.to, name: r.name}; }),
                       skip: sum.list.map(function (r, i) { return !!TP_SKIP[i]; }), segs: MODEL.segs, stateAt: stateAtLine, clean: cleanForSend});
}
// {list, plan} for the job as ticked; plan is null when every toolpath runs. {why} when it can't be run that way.
function buildRunList(){
  var p = jobSkipPlan();
  if (!p) return {list: buildJobList(MODEL.lines), plan: null};
  if (p.why) return {why: p.why};
  var list = buildJobList(p.lines, p.segs);
  JobSkip.apply(list, p, {zHigh: zHighCmd(travelZ()), spinup: PROFILE.spindle.spinup});
  return {list: list, plan: p};
}
// Mark the moves of unticked toolpaths (seg.skip), so the 3D view shows them faint, and repaint it
function jobSkipMark(){
  if (!MODEL || !MODEL.segs) return;
  var sum = TP_SKIP.some(Boolean) ? jobSummary(MODEL) : null, out = [];
  if (sum) sum.list.forEach(function (r, i) { if (TP_SKIP[i]) out.push(r); });
  MODEL.segs.forEach(function (g) {
    var s = false;
    for (var k = 0; k < out.length; k++) if (g.line >= out[k].from && g.line <= out[k].to){ s = true; break; }
    g.skip = s;
  });
  if (typeof repaintToolpath === 'function') repaintToolpath();
}
function jobSkipLine(ln){                               // is this line in an unticked toolpath?
  if (!MODEL || !TP_SKIP.some(Boolean)) return false;
  var sum = jobSummary(MODEL);
  return !!(sum && sum.list.some(function (r, i) { return TP_SKIP[i] && ln >= r.from && ln <= r.to; }));
}
