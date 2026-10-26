/* ---------------- Make toolpaths: proposed from the drawing, added on OK ----------------
   Clint, 2026-10-26: "I am always looking for ways to go faster but I also know I need to go well. Can we create a
   routine that looks at a drawing and generate tool paths and give a short summary of what was generated." It proposes;
   nothing is added until he says so, and what it can't decide, it leaves out and says why. His rules (asked, the same
   day):
   - a closed shape inside a part (a hole, a slot, a cut-out) is cut through: an inside profile;
   - a round hole the size of a bit in the tool library is drilled with that bit;
   - the cutting bit is the one used last (the library's Recently used), its feeds and speeds from the library;
   - a part (a closed shape inside nothing, or inside a hole) is cut out through, an outside profile, with the tabs
     used last.
   Left out, and said: text, open shapes, shapes a toolpath already cuts, hidden layers and other sheets, construction
   lines, and holes narrower than the bit. Nothing at all without the material's thickness: every cut goes through it.
   The toolpaths go where new ones go in the cutting order (holes, then inside profiles, then the parts), and each is
   worked out, its time estimated and its checks run (too deep for the bit, warnings), before it's offered. */
var AUTO = null;                                       // the summary open: {plan, bitId}
var AUTO_TOL = 0.01;                                   // mm: a hole this close to a bit's size is that bit's

// The library's bits that can cut a profile (not V-bits or engraving bits), the most recently used first
function autoCutters(){
  if (!TOOLLIB || !TOOLLIB.tools) return [];
  var recent = UICFG.recentTools || [];
  return TOOLLIB.tools.filter(function (t) {
    var ty = String(t.typeName || '').toLowerCase();
    return t.diameter > 0 && !(t.angle > 0 && t.angle < 180) && ty.indexOf('v-bit') < 0 && ty.indexOf('engrav') < 0 && ty.indexOf('drill') < 0;
  }).sort(function (a, b) {
    var ia = recent.indexOf(a.id), ib = recent.indexOf(b.id);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
}
function autoBitMM(t){ return t.diameter * (t.units === 'in' ? 25.4 : 1); }
// A library bit (any kind but a V-bit) the size of a round hole, a drill first; or null
function autoDrillFor(dia){
  if (!TOOLLIB || !TOOLLIB.tools) return null;
  var fits = TOOLLIB.tools.filter(function (t) { return t.diameter > 0 && !(t.angle > 0 && t.angle < 180) && Math.abs(autoBitMM(t) - dia) <= AUTO_TOL; });
  fits.sort(function (a, b) { return (String(b.typeName).toLowerCase().indexOf('drill') >= 0) - (String(a.typeName).toLowerCase().indexOf('drill') >= 0); });
  return fits[0] || null;
}
function autoBitName(t){ return t ? t.name : ''; }

// A new toolpath, as the editor makes one, for this bit
function autoTp(side, ids, t, name){
  var tp = {id: tpNewId(), name: name, side: side, type: side === 'drill' ? 'drill' : 'profile', ents: ids.slice(),
            through: true, over: 0.2, depth: 0, step: 1, feed: 800, plunge: 300, rpm: 18000, safeZ: 6, climb: true,
            stepoverPct: 40, peck: 0, allowance: 0, finishPass: false, leadType: 'none', leadSize: 0,
            tabsOn: false, tabPts: undefined, startPts: {}, exprs: {}, hidden: false, exclude: false,
            toolId: t.id, toolChosen: true, auto: true};
  var known = {};
  libToolSettingsOnto(t, known);
  ['dia', 'feed', 'plunge', 'step', 'rpm', 'stepoverPct'].forEach(function (k) { if (known[k] !== undefined) tp[k] = known[k]; });
  tp.guessed = [];
  var cut = t.cuts && t.cuts.length;
  if (!cut){ tp.guessed.push('the library has no feeds for this bit: 800 mm/min, plunging at 300, were used'); }
  if (!(known.step > 0)){ tp.step = +(tp.dia / 2).toFixed(3); tp.guessed.push('no stepdown in the library: half the bit, ' + fmtDisp(tp.step) + ' ' + unitTag() + ', a pass'); }
  if (multiSheet()) tp.sheet = DOC.activeSheet;
  return tp;
}

// What would be made, for this cutting bit (a library id, or none yet): {stop, tps: [{tp, what, time, warn}], left: [...]}
function autoPlan(bitId){
  var plan = {tps: [], left: [], stop: ''};
  if (!(DOC.stock && DOC.stock.t > 0)){ plan.stop = 'Set the material’s thickness in Job setup first: every cut this makes goes through it.'; return plan; }
  if (!TOOLLIB || !TOOLLIB.tools || !TOOLLIB.tools.length){ plan.stop = 'There are no bits in the tool library yet. Add your bits (Toolpaths → New toolpath → Choose a tool), then try again.'; return plan; }
  var cutter = bitId ? libTool(bitId) : null;
  // the shapes to think about
  var cut = {};
  tpList().forEach(function (tp) { if (!multiSheet() || tpOnSheet(tp)) (tp.ents || []).forEach(function (id) { cut[id] = tp.name; }); });
  var said = {};
  var leave = function (key, n, why) { said[key] = said[key] || {n: 0, why: why}; said[key].n += n; };
  var shapes = [];
  DOC.ents.forEach(function (e) {
    if (!e || e.con) return;
    if (DOC.layers && !entVisible(e)) return;
    if (!entOnSheet(e)) return;
    var id = entId(e);
    if (cut[id]){ leave('cut', 1, 'already cut by a toolpath'); return; }
    if (e.t === 'text'){ leave('text', 1, 'text: V-carve or profile it yourself, so the letters come out as you want'); return; }
    var closed = e.t === 'rect' || e.t === 'circle' || ((e.t === 'poly' || e.t === 'path') && e.closed);
    if (!closed){ leave('open', 1, e.t === 'group' ? 'groups: ungroup them, or make their toolpaths yourself' : 'not closed, so there’s no inside or outside: join them first'); return; }
    var o = tpOutlinesById([id])[0];
    if (!o){ leave('open', 1, 'not closed, so there’s no inside or outside: join them first'); return; }
    // an outline that crosses or doubles back on itself has no clear inside (a VCarve drill mark: a circle with a cross
    // through it, left by Make editable): as Check says (vector-check.js)
    var revisits = function (pts){                    // through the same point twice (not the closing one): it doubles back
      for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++){
        if (i === 0 && j === pts.length - 1) continue;
        if (Math.abs(pts[i][0] - pts[j][0]) < 1e-6 && Math.abs(pts[i][1] - pts[j][1]) < 1e-6) return true;
      }
      return false;
    };
    if (e.t !== 'circle' && e.t !== 'rect' && ((e.pts && e.pts.length <= 400 && revisits(e.pts)) ||
        (o.loop.length > 3 && Geom.splitSelfIntersections(Geom.clean(o.loop)).length > 1))){
      leave('self', 1, 'crosses itself, so its inside isn’t clear: redraw it or node-edit it (Check finds these)'); return;
    }
    var b = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
    o.loop.forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]); b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]); });
    shapes.push({e: e, id: id, loop: o.loop, box: b, area: (b.x1 - b.x0) * (b.y1 - b.y0)});
  });
  // a shape stacked on another (a copy left by Make editable, or pasted in place): cut once. The same box, within 0.05 mm,
  // and the same length round, within 5%, whatever kind of shape (a circle, and the 8-sided outline drawn on it)
  var loopLen = function (l) { var s = 0; for (var k = 0; k < l.length; k++){ var a = l[k], c = l[(k + 1) % l.length]; s += Math.hypot(c[0] - a[0], c[1] - a[1]); } return s; };
  shapes.forEach(function (s) { s.len = loopLen(s.loop); });
  var twins = 0;
  shapes = shapes.filter(function (s, i) {
    var twin = shapes.slice(0, i).some(function (o) {
      var bt = 0.05;                                   // a circle's traced points sit a little inside it: its box is that much smaller
      return Math.abs(o.box.x0 - s.box.x0) <= bt && Math.abs(o.box.y0 - s.box.y0) <= bt && Math.abs(o.box.x1 - s.box.x1) <= bt &&
             Math.abs(o.box.y1 - s.box.y1) <= bt && Math.abs(o.len - s.len) <= Math.max(AUTO_TOL, s.len * 0.05);
    });
    if (twin) twins++;
    return !twin;
  });
  if (twins) leave('twin', twins, 'stacked on another shape: cut once (delete the copies if you don’t need them)');
  // a shape drawn round another closer than the bit is wide all the way round (an outline offset from a part, left by
  // Make editable): the bit can't cut both, and the ring between can't be a part. Left out, and said.
  if (cutter){
    var cw = autoBitMM(cutter), hug = 0;
    shapes = shapes.filter(function (s) {
      var hugs = shapes.some(function (o) {
        if (o === s || o.area >= s.area) return false;
        var g = [o.box.x0 - s.box.x0, o.box.y0 - s.box.y0, s.box.x1 - o.box.x1, s.box.y1 - o.box.y1];
        return g.every(function (v) { return v > -1e-9 && v < cw; }) && Geom.pointInLoop(o.loop[0][0], o.loop[0][1], s.loop);
      });
      if (hugs) hug++;
      return !hugs;
    });
    if (hug) leave('hug', hug, 'drawn round another shape closer than the ' + autoBitName(cutter) + ' is wide (an offset copy?): the bit can’t cut both');
  }
  // how deep each is: inside how many of the others (a part 0, a hole in it 1, a part in the hole 2...)
  shapes.forEach(function (s) {
    s.depth = shapes.filter(function (o) {
      if (o === s || o.area <= s.area) return false;
      var ob = o.box, sb = s.box;
      if (sb.x0 < ob.x0 - 1e-9 || sb.y0 < ob.y0 - 1e-9 || sb.x1 > ob.x1 + 1e-9 || sb.y1 > ob.y1 + 1e-9) return false;
      return Geom.pointInLoop(s.loop[0][0], s.loop[0][1], o.loop);
    }).length;
  });
  var parts = shapes.filter(function (s) { return s.depth % 2 === 0; }), holes = shapes.filter(function (s) { return s.depth % 2 === 1; });
  // round holes a bit fits: drilled, one toolpath for each bit
  var drills = {}, inside = [], narrow = 0;
  holes.forEach(function (h) {
    var t = h.e.t === 'circle' ? autoDrillFor(h.e.r * 2) : null;
    if (t){ (drills[t.id] = drills[t.id] || {t: t, ids: []}).ids.push(h.id); return; }
    inside.push(h);
  });
  Object.keys(drills).forEach(function (k) {
    var d = drills[k], tp = autoTp('drill', d.ids, d.t, 'Holes, ' + fmtDisp(autoBitMM(d.t)) + ' ' + unitTag() + ' drilled');
    if (tpDepth(tp) > 3 * tp.dia) tp.peck = +tp.dia.toFixed(3);    // deep for its size: pecked, a bit's width at a time
    plan.tps.push({tp: tp, what: d.ids.length + (d.ids.length === 1 ? ' round hole the size of ' : ' round holes the size of ') + autoBitName(d.t) + ', drilled' + (tp.peck ? ' in pecks' : '')});
  });
  if (!cutter){
    if (inside.length || parts.length) plan.stop = plan.stop || 'Choose the bit to cut with.';
    return autoFinish(plan, said);
  }
  var cd = autoBitMM(cutter);
  inside = inside.filter(function (h) {
    var ok = Geom.offsetLoop(h.loop, -cd / 2, {tol: 0.005}).length > 0;
    if (!ok) narrow++;
    return ok;
  });
  if (narrow) leave('narrow', narrow, 'narrower than the ' + autoBitName(cutter) + ': it can’t get in (drill them, or use a smaller bit)');
  if (inside.length){
    var ti = autoTp('inside', inside.map(function (h) { return h.id; }), cutter, 'Inside cuts');
    plan.tps.push({tp: ti, what: inside.length + (inside.length === 1 ? ' hole, slot or cut-out' : ' holes, slots and cut-outs') + ', cut through round the inside'});
  }
  if (parts.length){
    var tabs = cutTabsStart(), to = autoTp('outside', parts.map(function (p) { return p.id; }), cutter, 'Parts');
    to.tabsOn = true; to.tabCount = tabs.count; to.tabLen = tabs.len; to.tabThk = tabs.thk; to.tabStyle = tabs.style;
    plan.tps.push({tp: to, what: parts.length + (parts.length === 1 ? ' part' : ' parts') + ', cut out through, ' + tabs.count + ' tabs each (' +
                  fmtDisp(tabs.thk) + ' ' + unitTag() + ' thick, ' + fmtDisp(tabs.len) + ' ' + unitTag() + ' long)'});
  }
  return autoFinish(plan, said);
}
// Each one worked out: its time, and what it's worth knowing (its own warning, too deep for its bit, guesses made)
function autoFinish(plan, said){
  plan.tps.forEach(function (p) {
    tpGenerate(p.tp);
    p.time = typeof tpTimeSec === 'function' ? tpTimeSec(p.tp) : 0;
    p.warn = [p.tp.warning, tpTooDeep(p.tp)].filter(Boolean).concat(p.tp.guessed || []);
  });
  plan.left = Object.keys(said).map(function (k) { return {n: said[k].n, why: said[k].why}; });
  return plan;
}

/* ---- the summary */
function autoOpen(){
  if (!camReady()) return;
  var cutters = autoCutters();
  AUTO = {bitId: cutters.length ? cutters[0].id : null};
  var sel = document.getElementById('autoBit');
  sel.innerHTML = '';
  if (!cutters.length){ var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'No cutting bits in the library'; sel.appendChild(o0); }
  cutters.forEach(function (t) { var o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
  sel.value = AUTO.bitId || '';
  autoRender();
  document.getElementById('autoModal').hidden = false;
  document.getElementById('autoAdd').focus();
}
function autoClose(){ AUTO = null; document.getElementById('autoModal').hidden = true; draw(); }
function autoRender(){
  if (!AUTO) return;
  AUTO.plan = autoPlan(AUTO.bitId);
  var p = AUTO.plan, list = document.getElementById('autoList'), left = document.getElementById('autoLeft');
  list.innerHTML = ''; left.innerHTML = '';
  document.getElementById('autoStop').textContent = p.stop;
  document.getElementById('autoStop').hidden = !p.stop;
  document.getElementById('autoBitRow').hidden = !TOOLLIB || !TOOLLIB.tools || !TOOLLIB.tools.length;
  p.tps.forEach(function (it, i) {
    var row = document.createElement('label'); row.className = 'autoItem';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.on !== false; cb.dataset.i = i;
    cb.addEventListener('change', function () { it.on = cb.checked; autoCount(); });
    var tx = document.createElement('div');
    var b = document.createElement('b'); b.textContent = it.tp.name; tx.appendChild(b);
    var d = document.createElement('span');
    d.textContent = it.what + '. ' + autoBitName(libTool(it.tp.toolId)) + ', ' + fmtDisp(tpDepth(it.tp)) + ' ' + unitTag() + ' deep' +
                    (it.time ? ', about ' + fmtDur(it.time) : '') + '.';
    tx.appendChild(d);
    it.warn.forEach(function (w) { var wv = document.createElement('span'); wv.className = 'autoWarn'; wv.textContent = '⚠ ' + w.charAt(0).toUpperCase() + w.slice(1); tx.appendChild(wv); });
    row.appendChild(cb); row.appendChild(tx); list.appendChild(row);
  });
  if (!p.tps.length && !p.stop){ var none = document.createElement('p'); none.className = 'snote'; none.textContent = 'Nothing to make: every shape is left out, below.'; list.appendChild(none); }
  p.left.forEach(function (l) {
    var li = document.createElement('li'); li.textContent = l.n + (l.n === 1 ? ' shape: ' : ' shapes: ') + l.why; left.appendChild(li);
  });
  document.getElementById('autoLeftHead').hidden = !p.left.length;
  autoCount();
}
function autoCount(){
  var n = AUTO && AUTO.plan ? AUTO.plan.tps.filter(function (it) { return it.on !== false; }).length : 0;
  var add = document.getElementById('autoAdd');
  add.disabled = !n;
  add.textContent = n ? 'Add ' + n + (n === 1 ? ' toolpath' : ' toolpaths') : 'Nothing to add';
}
// Add the ones ticked: one step, in the cutting order, and say what was made
function autoApply(){
  if (!AUTO || !AUTO.plan) return;
  var chosen = AUTO.plan.tps.filter(function (it) { return it.on !== false; });
  if (!chosen.length) return;
  pushUndo('Make toolpaths');
  chosen.forEach(function (it) {
    var tp = it.tp; delete tp.guessed; delete tp.auto;
    if (tp.tabsOn) cutTabsRemember(tp);
    tpInsertByRank(tp);
  });
  persist();
  autoClose();
  renderToolpathPanel(); draw();
  var warns = chosen.reduce(function (n, it) { return n + it.warn.length; }, 0);
  toast(warns ? 'warn' : 'ok', chosen.length === 1 ? 'A toolpath was made' : chosen.length + ' toolpaths were made',
        chosen.map(function (it) { return it.tp.name; }).join(', ') + '. ' +
        (warns ? 'Some have notes (⚠ on their cards): read them before cutting. ' : '') + 'Check them in Preview in wood, and air-cut the first job.');
}
