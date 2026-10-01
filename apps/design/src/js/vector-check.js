/* ============================================================
   VECTOR CHECKING
   Drawings that look right can still be wrong for cutting: an outline whose ends don't quite
   meet, a shape that arrived from a DXF as a pile of separate lines, the same line drawn
   twice, an outline that crosses itself. Each makes a toolpath quietly wrong, so they are
   found before anything is cut, and fixed where a fix is safe.
   ============================================================ */
var VEC_GAP = 0.5;          // ends this close count as "meant to meet", mm
var VEC_JOIN = 0.05;        // pieces whose ends are this close belong together, mm

function vecPolyline(e){
  if (!e) return null;
  if (e.t === 'line') return {pts: [[e.x1, e.y1], [e.x2, e.y2]], closed: false};
  if (e.t === 'arc'){
    var sw = arcSweepOf(e.a0, e.a1, e.ccw), n = Math.max(8, Math.ceil(Math.abs(sw) / 0.05)), pts = [];
    for (var i = 0; i <= n; i++){ var q = arcPtAt(e, sw * i / n); pts.push([q.x, q.y]); }
    return {pts: pts, closed: false};
  }
  if (e.t === 'circle') return {pts: Geom.circlePoints(e.cx, e.cy, e.r, 0.02), closed: true};
  if (e.t === 'rect') return {pts: [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]], closed: true};
  if (e.t === 'poly') return {pts: e.pts.map(function (q) { return [q[0], q[1]]; }), closed: !!e.closed};
  if (e.t === 'path') return {pts: tessPath(e, 0.05).map(function (q) { return [q[0], q[1]]; }), closed: !!e.closed};
  return null;                                           // text and anything else: not checked
}
// A key that is the same for two identical shapes, even if one was drawn the other way round.
function vecKey(e){
  function r(v){ return Math.round(v * 1000) / 1000; }
  if (e.t === 'line'){
    var a = [r(e.x1), r(e.y1)], b = [r(e.x2), r(e.y2)];
    return 'L' + (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? a.concat(b) : b.concat(a)).join(',');
  }
  if (e.t === 'circle') return 'C' + [r(e.cx), r(e.cy), r(e.r)].join(',');
  if (e.t === 'rect') return 'R' + [r(e.x), r(e.y), r(e.w), r(e.h)].join(',');
  if (e.t === 'arc') return 'A' + [r(e.cx), r(e.cy), r(e.r), r(e.a0), r(e.a1), e.ccw ? 1 : 0].join(',');
  if (e.t === 'poly' || e.t === 'path'){
    var pts = e.pts.map(function (q) { return r(q[0]) + ',' + r(q[1]) + (q[2] ? ',' + r(q[2]) : ''); });
    var f = pts.join(';'), b2 = pts.slice().reverse().join(';');
    return e.t[0] + (e.closed ? 'c' : 'o') + (f < b2 ? f : b2);
  }
  return null;
}
function vecBox(pts){
  var b = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
  pts.forEach(function (q) { if (q[0] < b.x0) b.x0 = q[0]; if (q[0] > b.x1) b.x1 = q[0]; if (q[1] < b.y0) b.y0 = q[1]; if (q[1] > b.y1) b.y1 = q[1]; });
  return b;
}
// A grid of one outline's segments, built once and reused for every comparison.
function vecSegGrid(pts){
  var b = vecBox(pts), span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
  var cell = Math.max(span / 48, 0.05), grid = {};
  for (var i = 0; i < pts.length; i++){
    var p = pts[i], q = pts[(i + 1) % pts.length];
    var x0 = Math.floor(Math.min(p[0], q[0]) / cell), x1 = Math.floor(Math.max(p[0], q[0]) / cell);
    var y0 = Math.floor(Math.min(p[1], q[1]) / cell), y1 = Math.floor(Math.max(p[1], q[1]) / cell);
    for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++){
      var k = cx + ',' + cy; (grid[k] || (grid[k] = [])).push(i);
    }
  }
  return {pts: pts, box: b, cell: cell, grid: grid};
}
// Do two closed outlines cross? Only segments sharing a grid cell are ever compared.
function vecLoopsCross(A, B){
  var ba = A.box, bb = B.box;
  if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) return false;
  var a = A.pts, b = B.pts, cell = A.cell;
  for (var j = 0; j < b.length; j++){
    var p = b[j], q = b[(j + 1) % b.length];
    if (Math.max(p[0], q[0]) < ba.x0 || Math.min(p[0], q[0]) > ba.x1 || Math.max(p[1], q[1]) < ba.y0 || Math.min(p[1], q[1]) > ba.y1) continue;
    var x0 = Math.floor(Math.min(p[0], q[0]) / cell), x1 = Math.floor(Math.max(p[0], q[0]) / cell);
    var y0 = Math.floor(Math.min(p[1], q[1]) / cell), y1 = Math.floor(Math.max(p[1], q[1]) / cell);
    for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++){
      var list = A.grid[cx + ',' + cy];
      if (!list) continue;
      for (var k = 0; k < list.length; k++){
        var i = list[k], c = a[i], d = a[(i + 1) % a.length];
        var x = Geom.segX(p[0], p[1], q[0], q[1], c[0], c[1], d[0], d[1]);
        if (x && x.t > 1e-9 && x.t < 1 - 1e-9 && x.u > 1e-9 && x.u < 1 - 1e-9) return true;
      }
    }
  }
  return false;
}

// Look over some shapes (by id) and report what's wrong. Each issue says what it is, which
// shapes, and how to fix it if a fix is safe.
function vecCheck(ids){
  var issues = [], polys = {};
  ids.forEach(function (id) { var e = entById(id); if (e && !e.con) polys[id] = vecPolyline(e); });
  var live = ids.filter(function (id) { return polys[id]; });

  // stacked duplicates
  var seen = {};
  live.forEach(function (id) {
    var k = vecKey(entById(id));
    if (!k) return;
    (seen[k] || (seen[k] = [])).push(id);
  });
  var dupIds = [];
  Object.keys(seen).forEach(function (k) { if (seen[k].length > 1) dupIds = dupIds.concat(seen[k].slice(1)); });
  if (dupIds.length) issues.push({kind: 'dup', ids: dupIds, fix: 'Delete',
    text: dupIds.length + (dupIds.length === 1 ? ' shape is' : ' shapes are') + ' drawn twice, on top of another. The toolpath would cut them twice.'});
  var gone = {}; dupIds.forEach(function (id) { gone[id] = 1; });
  live = live.filter(function (id) { return !gone[id]; });

  // open ends: one shape nearly closed, or several pieces that together make a loop
  var open = live.filter(function (id) { return !polys[id].closed; });
  var nearly = open.filter(function (id) {
    var pts = polys[id].pts, e = entById(id);
    if (e.t !== 'poly' && e.t !== 'path') return false;
    return Geom.dist(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]) <= VEC_GAP;
  });
  if (nearly.length) issues.push({kind: 'close', ids: nearly, fix: 'Close',
    text: nearly.length + (nearly.length === 1 ? ' outline doesn\u2019t' : ' outlines don\u2019t') + ' quite close \u2014 the ends are under ' + fmtDisp(VEC_GAP) + ' ' + unitTag() + ' apart.'});
  var rest = open.filter(function (id) { return nearly.indexOf(id) < 0; });
  var chains = vecChains(rest, polys);
  var joinable = chains.filter(function (c) { return c.closed && c.ids.length > 1; });
  joinable.forEach(function (c) {
    issues.push({kind: 'join', ids: c.ids, chain: c, fix: 'Join',
      text: c.ids.length + ' separate pieces make up one outline. A toolpath needs them joined into one shape.'});
  });
  var loose = rest.filter(function (id) { return !joinable.some(function (c) { return c.ids.indexOf(id) >= 0; }); });
  if (loose.length) issues.push({kind: 'open', ids: loose,
    text: loose.length + (loose.length === 1 ? ' shape is' : ' shapes are') + ' open. Profiles and pockets need closed outlines; drilling doesn\u2019t mind.'});

  // outlines that cross themselves, and outlines that cross each other
  var closedIds = live.filter(function (id) { return polys[id].closed && polys[id].pts.length > 3; });
  var selfX = closedIds.filter(function (id) {
    var e = entById(id);
    if (e.t === 'circle' || e.t === 'rect') return false;
    return Geom.splitSelfIntersections(Geom.clean(polys[id].pts)).length > 1;
  });
  if (selfX.length) issues.push({kind: 'self', ids: selfX,
    text: selfX.length + (selfX.length === 1 ? ' outline crosses' : ' outlines cross') + ' itself. The inside and outside are ambiguous, so the toolpath can\u2019t be trusted. Redraw or node-edit it.'});
  // outlines crossing each other: sort by left edge so only neighbours in X are compared, and
  // index each outline once
  var grids = {};
  closedIds.forEach(function (id) { grids[id] = vecSegGrid(Geom.clean(polys[id].pts)); });
  var order = closedIds.slice().sort(function (p1, q1) { return grids[p1].box.x0 - grids[q1].box.x0; });
  var crossPairs = [];
  for (var a = 0; a < order.length; a++){
    var A = grids[order[a]];
    for (var b = a + 1; b < order.length; b++){
      var B = grids[order[b]];
      if (B.box.x0 > A.box.x1) break;                   // everything further right starts past A
      if (vecLoopsCross(A, B)) crossPairs.push([order[a], order[b]]);
    }
  }
  if (crossPairs.length){
    var ids2 = []; crossPairs.forEach(function (pr) { if (ids2.indexOf(pr[0]) < 0) ids2.push(pr[0]); if (ids2.indexOf(pr[1]) < 0) ids2.push(pr[1]); });
    issues.push({kind: 'cross', ids: ids2,
      text: crossPairs.length + (crossPairs.length === 1 ? ' pair of outlines crosses' : ' pairs of outlines cross') + ' each other. Cutting both would cut into each part.'});
  }
  return issues;
}
// Group open pieces whose ends meet into chains, in order, noting whether a chain closes.
function vecChains(ids, polys){
  var pieces = ids.map(function (id) { var p = polys[id].pts; return {id: id, a: p[0], b: p[p.length - 1], used: false}; });
  function near(p, q){ return Geom.dist(p[0], p[1], q[0], q[1]) <= VEC_JOIN; }
  var chains = [];
  pieces.forEach(function (start) {
    if (start.used) return;
    start.used = true;
    var seq = [{id: start.id, rev: false}], head = start.a, tail = start.b, grew = true;
    while (grew){
      grew = false;
      for (var i = 0; i < pieces.length; i++){
        var pc = pieces[i];
        if (pc.used) continue;
        if (near(pc.a, tail)){ seq.push({id: pc.id, rev: false}); tail = pc.b; pc.used = grew = true; }
        else if (near(pc.b, tail)){ seq.push({id: pc.id, rev: true}); tail = pc.a; pc.used = grew = true; }
        else if (near(pc.b, head)){ seq.unshift({id: pc.id, rev: false}); head = pc.a; pc.used = grew = true; }
        else if (near(pc.a, head)){ seq.unshift({id: pc.id, rev: true}); head = pc.b; pc.used = grew = true; }
      }
    }
    chains.push({ids: seq.map(function (s2) { return s2.id; }), seq: seq, closed: seq.length > 1 && near(head, tail)});
  });
  return chains;
}
// Apply a fix. Everything is one undoable step.
function vecFix(issue){
  pushUndo();
  if (issue.kind === 'dup'){
    var drop = {}; issue.ids.forEach(function (id) { drop[id] = 1; });
    DOC.ents = DOC.ents.filter(function (e) { return !drop[entId(e)]; });
  } else if (issue.kind === 'close'){
    issue.ids.forEach(function (id) { var e = entById(id); if (e) e.closed = true; });
  } else if (issue.kind === 'join'){
    var pts = [], polys = {};
    issue.chain.seq.forEach(function (s2) {
      var pl = vecPolyline(entById(s2.id)).pts.slice();
      if (s2.rev) pl.reverse();
      if (pts.length) pl.shift();                        // the shared end is already there
      pts = pts.concat(pl);
    });
    if (pts.length > 1 && Geom.dist(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]) <= VEC_JOIN) pts.pop();
    var drop2 = {}; issue.ids.forEach(function (id) { drop2[id] = 1; });
    var at = DOC.ents.findIndex(function (e) { return drop2[entId(e)]; });
    DOC.ents = DOC.ents.filter(function (e) { return !drop2[entId(e)]; });
    var joined = {t: 'poly', pts: pts, closed: true};
    DOC.ents.splice(Math.max(0, at), 0, joined);
    issue.newId = entId(joined);
  }
  persist(); draw();
  return issue;
}
// The whole drawing, from the Toolpaths panel's Check button.
// Shapes that no toolpath cuts: the thing you preview in VCarve to catch. Only closed shapes
// count, since those are what toolpaths cut; construction lines are left out, so anything drawn
// purely for reference can be made construction (X) and it stops being reported.
function tpUncutIssues(){
  var list = tpList().filter(tpOnSheet);
  if (!list.length) return [];
  var used = {}, usedOff = {};
  list.forEach(function (tp) { (tp.ents || []).forEach(function (id) { (tp.exclude ? usedOff : used)[id] = 1; }); });
  var cand = DOC.ents.filter(function (e) {
    if (e.con || e.tp || e.t === 'text' || !entOnSheet(e)) return false;
    return e.t === 'circle' || e.t === 'rect' || ((e.t === 'poly' || e.t === 'path') && e.closed);
  });
  var never = [], offOnly = [];
  cand.forEach(function (e) {
    var id = entId(e);
    if (used[id]) return;
    (usedOff[id] ? offOnly : never).push(e);
  });
  function kinds(arr){
    var c = {circle: 0, rect: 0, other: 0};
    arr.forEach(function (e) { if (e.t === 'circle') c.circle++; else if (e.t === 'rect') c.rect++; else c.other++; });
    var bits = [];
    if (c.circle) bits.push(c.circle + (c.circle === 1 ? ' circle' : ' circles'));
    if (c.rect) bits.push(c.rect + (c.rect === 1 ? ' rectangle' : ' rectangles'));
    if (c.other) bits.push(c.other + (c.other === 1 ? ' outline' : ' outlines'));
    return bits.join(', ');
  }
  var out = [];
  if (never.length) out.push({kind: 'uncut', ids: never.map(entId),
    text: never.length + (never.length === 1 ? ' shape isn\u2019t' : ' shapes aren\u2019t') + ' cut by any toolpath: ' + kinds(never) +
          '. If one is only there for reference, make it a construction line (X) and it won\u2019t be counted.'});
  if (offOnly.length) out.push({kind: 'uncutOff', ids: offOnly.map(entId),
    text: offOnly.length + (offOnly.length === 1 ? ' shape is' : ' shapes are') + ' only in unticked toolpaths (' + kinds(offOnly) +
          '), so the saved G-code won\u2019t cut ' + (offOnly.length === 1 ? 'it.' : 'them.')});
  return out;
}
function vecCheckAll(){
  var ids = DOC.ents.filter(function (e) { return !e.con && !e.tp && e.t !== 'text' && entOnSheet(e); }).map(entId);
  var issues = vecCheck(ids).concat(tpUncutIssues());
  if (!issues.length){
    toast('ok', 'The drawing looks ready to cut', ids.length + ' shapes checked: nothing open, nothing doubled, nothing crossing' +
          (tpList().length ? ', and every shape is in a toolpath.' : '.'));
    return issues;
  }
  var fixable = issues.filter(function (i) { return i.fix; });
  var problem = []; issues.forEach(function (i) { problem = problem.concat(i.ids); });
  SEL = problem.map(function (id) { return DOC.ents.indexOf(entById(id)); }).filter(function (i) { return i >= 0; });
  draw();
  uiDialog({title: issues.length + (issues.length === 1 ? ' thing needs' : ' things need') + ' a look before cutting',
            body: issues.map(function (i) { return '\u2022 ' + i.text + (i.fix ? '  [' + i.fix + ' can fix this]' : ''); }).join('\n\n') +
                  '\n\nThe shapes concerned are selected on the drawing.',
            ok: fixable.length ? 'Fix what can be fixed' : 'OK', cancel: 'Leave it', note: !fixable.length}).then(function (go) {
    if (!go || !fixable.length) return;
    fixable.forEach(function (i) { if (i.kind !== 'join' || i.chain) vecFix(i); });
    var left = vecCheck(DOC.ents.filter(function (e) { return !e.con && !e.tp && e.t !== 'text' && entOnSheet(e); }).map(entId));
    SEL = [];
    toast(left.length ? 'info' : 'ok', 'Fixed ' + fixable.length + (fixable.length === 1 ? ' problem' : ' problems'),
          left.length ? left.length + ' still need you: ' + left.map(function (i) { return i.text.split('.')[0]; }).join('; ') + '.' : 'The drawing is ready to cut.');
    renderToolpathPanel(); draw();
  });
  return issues;
}

