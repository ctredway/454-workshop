// ---- Fillet corners: every corner of the selected shapes at once ----
// A panel like Offset's: the shapes (selected first, or clicked while it's open), the radius and the kind of
// corner (shared with the Fillet tool), and which corners: all of them, only those pointing out, or only those
// pointing in. The drawing shows what OK will do: the new corners in green, and a red ring on each corner
// that can't be done (the radius is too big for the edges beside it, or a dog-bone beside a curve). After OK
// the rings stay on the drawing, so they can be found and fixed, until the next change or Esc.
//
// Dog-bones and T-bones belong only where a cutter can't reach into the corner: a pocket's (or an inside cut's)
// corners that point out of the shape, or a part's corners that point into it. So for them the panel asks which,
// and doesn't offer "all".
var FALL = null;            // the open panel: {objs: entity indices, plan}
var FALL_MARKS = null;      // after OK: [{x, y}] the corners that couldn't be done, shown until the next change

// A turn smaller than this isn't a corner: it's a curve drawn as short straight pieces (a traced or imported
// outline), which would otherwise get a ring on every point.
var FALL_MIN_TURN = 10 * Math.PI / 180;

// The direction a span leaves its start (at 0) or arrives at its end (at 1).
function fallTangent(p0, p1, at){
  var c = spanCurve(p0, p1, p0[2] || 0);
  if (!c) return null;
  if (c.kind === 'line'){ var L = Math.hypot(c.bx - c.ax, c.by - c.ay); return L > 1e-12 ? {x: (c.bx - c.ax) / L, y: (c.by - c.ay) / L} : null; }
  var P = at ? p1 : p0, rx = P[0] - c.cx, ry = P[1] - c.cy, R = Math.hypot(rx, ry) || 1;
  return c.ccw ? {x: -ry / R, y: rx / R} : {x: ry / R, y: -rx / R};
}
// The corners of an outline: [{vi, x, y, out}] for every point where the direction turns by more than
// FALL_MIN_TURN. out: it points out of the shape (true), into it (false), or the shape is open (null).
function fallCorners(pe){
  var n = pe.pts.length, out = [];
  if (n < 3 && !(pe.closed && n >= 2)) return out;
  var sign = 0;
  if (pe.closed){
    var poly = tessPath(pe, 0.05), a2 = 0;
    for (var k = 0; k < poly.length; k++){ var p = poly[k], q = poly[(k + 1) % poly.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    sign = a2 > 0 ? 1 : -1;
  }
  for (var vi = 0; vi < n; vi++){
    if (!pe.closed && (vi === 0 || vi === n - 1)) continue;
    var prev = pe.pts[(vi - 1 + n) % n], cur = pe.pts[vi], next = pe.pts[(vi + 1) % n];
    var tin = fallTangent(prev, cur, 1), tout = fallTangent(cur, next, 0);
    if (!tin || !tout) continue;
    var turn = Math.atan2(tin.x * tout.y - tin.y * tout.x, tin.x * tout.x + tin.y * tout.y);
    if (Math.abs(turn) <= FALL_MIN_TURN) continue;
    out.push({vi: vi, x: cur[0], y: cur[1], out: pe.closed ? turn * sign > 0 : null});
  }
  return out;
}
// What OK would do, without changing the drawing: {results: [{i, ne}], done, missed: [{x, y, why}], corners,
// shapes (with corners), openSkipped (open shapes left out because only some corners were asked for)}.
// opts: {r, kind: 'round'|'dogbone'|'tbone', which: 'all'|'out'|'in'}
function filletAllPlan(objs, opts){
  var plan = {results: [], done: 0, missed: [], corners: 0, shapes: 0, openSkipped: 0};
  var which = opts.kind !== 'round' && opts.which === 'all' ? 'out' : opts.which;
  if (!(opts.r > 0) || !isFinite(opts.r)) return plan;
  objs.forEach(function (i) {
    var e = DOC.ents[i];
    if (!e || !entOnSheet(e)) return;
    var pe = e.t === 'rect' ? rectToPath(e) : e.t === 'poly' ? polyToPath(e) : e.t === 'path' ? e : null;
    if (!pe) return;
    pe = pathClean(pe);
    var corners = fallCorners(pe);
    if (!corners.length) return;
    if (!pe.closed && which !== 'all'){ plan.openSkipped++; return; }
    corners = corners.filter(function (c) { return which === 'all' || (which === 'out') === c.out; });
    if (!corners.length) return;
    plan.shapes++; plan.corners += corners.length;
    // last first: a corner's change is local to it, so the corners before it keep their place in the outline
    var cur = {t: 'path', pts: pe.pts.map(function (q) { return [q[0], q[1], q[2] || 0]; }), closed: !!pe.closed}, any = false;
    corners.sort(function (a, b) { return b.vi - a.vi; }).forEach(function (c) {
      dogboneVertex.why = null;
      var res = opts.kind === 'round' ? filletPathVertex(cur, c.vi, opts.r) : dogboneVertex(cur, c.vi, opts.r, opts.kind, null);
      if (res){ cur = {t: 'path', pts: res.pts, closed: res.closed}; any = true; plan.done++; }
      else plan.missed.push({x: c.x, y: c.y, why: dogboneVertex.why === 'curved' ? 'curved' : 'fit'});
    });
    if (!any) return;
    // everything about the shape but its outline stays: its layer, sheet, ID, construction or toolpath flag
    var keep = {x: 1, y: 1, w: 1, h: 1, pts: 1, closed: 1, t: 1};
    for (var key in e) if (!keep[key] && Object.prototype.hasOwnProperty.call(e, key)) cur[key] = e[key];
    plan.results.push({i: i, ne: cur});
  });
  return plan;
}
function fallOpts(){
  return {r: UICFG.filletR, kind: UICFG.filletType || 'round', which: UICFG.filletAllWhich || 'all'};
}
function fallOpen(){
  FALL = {objs: SEL.filter(function (i) { return DOC.ents[i]; }), plan: null};
  FALL_MARKS = null;
  document.getElementById('fallPanel').hidden = false;
  document.getElementById('fallR').value = fmtDisp(UICFG.filletR);
  fallRender();
}
function fallClose(){ FALL = null; document.getElementById('fallPanel').hidden = true; draw(); }
function fallRender(){
  if (!FALL) return;
  var o = fallOpts(), notRound = o.kind !== 'round';
  if (notRound && o.which === 'all'){ UICFG.filletAllWhich = o.which = 'out'; }
  FALL.plan = filletAllPlan(FALL.objs, o);
  var P = FALL.plan;
  document.getElementById('fallObjsVal').textContent = FALL.objs.length ? FALL.objs.length + (FALL.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('fallObjs').setAttribute('aria-pressed', 'true');
  document.getElementById('fallRU').textContent = unitTag();
  document.getElementById('fallRLbl').textContent = o.kind === 'round' ? 'Radius' : 'Bit radius';
  Array.prototype.forEach.call(document.querySelectorAll('#fallKind button'), function (b) { b.setAttribute('aria-pressed', b.dataset.k === o.kind ? 'true' : 'false'); });
  Array.prototype.forEach.call(document.querySelectorAll('#fallWhich button'), function (b) {
    b.setAttribute('aria-pressed', b.dataset.w === o.which ? 'true' : 'false');
    b.disabled = notRound && b.dataset.w === 'all';
  });
  document.getElementById('fallOk').disabled = !P.done;
  var plural = function (n, one, many){ return n + ' ' + (n === 1 ? one : many); };
  var hint;
  if (!FALL.objs.length) hint = 'Click shapes on the drawing, or select them before choosing Fillet corners.';
  else if (!P.corners) hint = P.openSkipped ? 'Only closed shapes have corners that point out or in. Choose All corners for open shapes.'
                                            : 'None of these shapes has ' + (o.which === 'all' ? 'a corner' : o.which === 'out' ? 'a corner pointing out' : 'a corner pointing in') + ' to change.';
  else {
    hint = plural(P.done, 'corner', 'corners') + ' in ' + plural(P.shapes, 'shape', 'shapes') + ' will change.';
    if (P.missed.length){
      var curved = P.missed.filter(function (m) { return m.why === 'curved'; }).length;
      hint += ' ' + plural(P.missed.length, 'corner is', 'corners are') + ' ringed in red and will stay sharp: ' +
              (curved === P.missed.length ? 'a ' + (o.kind === 'dogbone' ? 'dog-bone' : 'T-bone') + ' needs straight edges either side.'
                                          : 'the ' + (o.kind === 'round' ? 'radius' : 'bit') + ' is too big for the edges beside ' + (P.missed.length === 1 ? 'it.' : 'them.'));
    }
    if (P.openSkipped) hint += ' ' + plural(P.openSkipped, 'open shape is', 'open shapes are') + ' left out: only closed shapes have corners that point out or in.';
  }
  if (notRound) hint += ' Pointing out: a pocket’s or an inside cut’s corners. Pointing in: a part’s, cut out round its outside.';
  document.getElementById('fallHint').textContent = hint;
  SEL = FALL.objs.slice();
  draw();
}
function fallApply(){
  if (!FALL) return;
  var P = filletAllPlan(FALL.objs, fallOpts());
  if (!P.done) return;
  var o = fallOpts();
  pushUndo((o.kind === 'dogbone' ? 'Dog-bone corners ' : o.kind === 'tbone' ? 'T-bone corners ' : 'Fillet corners ') + histLen(o.r));
  P.results.forEach(function (r) { DOC.ents[r.i] = r.ne; });
  SEL = P.results.map(function (r) { return r.i; });
  FALL_MARKS = P.missed.length ? P.missed.map(function (m) { return {x: m.x, y: m.y}; }) : null;
  uiCfgSave(); persist();
  var o = fallOpts(), what = o.kind === 'round' ? 'Rounded' : o.kind === 'dogbone' ? 'Dog-boned' : 'T-boned';
  toast(P.missed.length ? 'warn' : 'ok', 'Fillet corners',
        what + ' ' + P.done + (P.done === 1 ? ' corner' : ' corners') + ' at ' + fmtDisp(o.r) + ' ' + unitTag() + '.' +
        (P.missed.length ? ' ' + P.missed.length + (P.missed.length === 1 ? ' corner is' : ' corners are') + ' ringed in red: ' +
                           (P.missed.length === 1 ? 'it' : 'they') + ' stayed sharp. Round ' + (P.missed.length === 1 ? 'it' : 'them') +
                           ' with the Fillet tool and a smaller radius.' : ''));
  FALL = null; document.getElementById('fallPanel').hidden = true;
  setTool('select');
  draw();
}
function fallClick(w){
  var h = pickEntity(w);
  if (h === null) return;
  var at = FALL.objs.indexOf(h);
  if (at >= 0) FALL.objs.splice(at, 1); else FALL.objs.push(h);
  fallRender();
}
