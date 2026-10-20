/* ---------------- history: changing a step, and the steps after it done again ----------------
   As in Fusion's timeline: double-click a step on the History bar, change its numbers (a rectangle's size, an
   offset's distance, a fillet's radius, how far a move went), and every step after it is done again on the drawing
   as it now is. A step that can't be done again (the shape it works on is gone, or was changed in a way it can't
   follow) turns red and is skipped, and is done again if a later change makes it possible.

   How each step is done again:
   - A step with a recipe (step.recipe: {op, ids, ...}) is done again by its tool, on the shapes it names by id, as
     they are now (HIST_OPS). Moves, resizes and rotations, offsets and fillet corners have recipes. An offset's new
     shapes keep the ids they first had, so the steps after it still find them.
   - Any other step is done again from what it changed (step.orig: the drawing before and after it, as first
     recorded): the shapes it added are added, those it removed are removed, and those it changed are given their new
     form, but only if they are still as the step found them. Otherwise it's red: it never guesses.
   A step that only added a shape (a rectangle, a circle, a line or text) can be changed too: its shape's numbers.
   Steps before an opened or new drawing are another drawing's: changing one leaves this drawing as it is. */
var HIST_KEYED = {ents: '_id', toolpaths: 'id'};
var HIST_KEYOF = {ents: new Map(), toolpaths: new Map()};
var HIST_WHY = {
  gone: 'A shape it works on is gone.',
  changed: 'A shape it changes is different now, so it can’t be done the same way.',
  cant: 'It can’t be done on the shapes as they are now.'
};
var HIST_REPLAYING = false;

// The step being recorded now (the last pushUndo) is done again by this recipe. Returns it, to fill in as it goes.
function histRecipe(r){
  if ((typeof DRY !== 'undefined' && DRY) || !UNDO.length) return null;
  UNDO[UNDO.length - 1].recipe = r;
  return r;
}
function histIdsOf(idx){ return idx.map(function (i) { return entId(DOC.ents[i]); }); }
// the shapes' places in the drawing, from their ids; null if any is gone
function histIndexes(ids){
  var at = {};
  DOC.ents.forEach(function (e, i) { if (e && e._id) at[e._id] = i; });
  var out = [];
  for (var k = 0; k < ids.length; k++){ if (at[ids[k]] === undefined) return null; out.push(at[ids[k]]); }
  return out;
}

/* ---- the tools that do their steps again. fields: what can be changed (len: a length in the units shown; deg:
   degrees; text). run: does it to the drawing (DOC), on the shapes idx; true, or why not. */
function histFilletName(kind, r){ return (kind === 'dogbone' ? 'Dog-bone ' : kind === 'tbone' ? 'T-bone ' : 'Fillet ') + histLen(r); }
// a point as a fraction of a box's width and height (the middle of a box with none), and back
function histFrac(b, x, y){
  var w = b.x1 - b.x0, h = b.y1 - b.y0;
  return {fx: w > 1e-9 ? (x - b.x0) / w : 0.5, fy: h > 1e-9 ? (y - b.y0) / h : 0.5};
}
// where a shape was clicked, as a place on its box (so the same place on it when it's bigger or moved), and its id
function histClickAt(i, w){
  var e = i !== null && i !== undefined ? DOC.ents[i] : null, b = e && entBBox(e);
  return b ? {id: entId(e), at: histFrac(b, w.x, w.y)} : null;
}
function histFromFrac(b, f){ return {x: b.x0 + f.fx * (b.x1 - b.x0), y: b.y0 + f.fy * (b.y1 - b.y0)}; }
var HIST_SELBOX_LABEL = {x: 'X', y: 'Y', w: 'Width', h: 'Height', r: 'Angle'};
var HIST_OPS = {
  move: {
    name: function () { return 'Move'; },
    fields: function () { return [{k: 'dx', label: 'Across', kind: 'len'}, {k: 'dy', label: 'Up', kind: 'len'}]; },
    run: function (r, idx) { idx.forEach(function (i) { moveEntity(DOC.ents[i], r.dx, r.dy); }); return true; }
  },
  selbox: {                     // the selection box's X, Y, width, height and angle (selbox.js)
    name: function (r) { return r.field === 'r' ? 'Rotate ' + parseFloat(r.v.toFixed(2)) + '°' : r.field === 'w' || r.field === 'h' ? 'Resize' : 'Move'; },
    fields: function (r) { return [{k: 'v', label: HIST_SELBOX_LABEL[r.field], kind: r.field === 'r' ? 'deg' : 'len', min: r.field === 'w' || r.field === 'h' ? 0 : null}]; },
    run: function (r, idx) { SEL = idx; return selBoxDo(r.field, r.v, {anchor: r.anchor, lock: r.lock}) ? true : HIST_WHY.cant; }
  },
  offset: {
    name: function (r) { return 'Offset ' + histLen(r.dist); },
    fields: function () { return [{k: 'dist', label: 'Distance', kind: 'len', min: 0}]; },
    run: function (r, idx) {
      var was = OFF;
      OFF = {objs: idx, dist: r.dist, flip: r.flip};
      var res = offResults();
      OFF = was;
      if (!res.length) return 'At this distance it makes no shape from the shapes as they are now.';
      res.forEach(function (ne, k) { if (r.out && r.out[k]) ne._id = r.out[k]; DOC.ents.push(ne); });
      return true;
    }
  },
  fillet: {                     // one corner (fillets.js doFillet): by its place in the outline, which must still have as many
    name: function (r) { return histFilletName(r.kind, r.r); },
    fields: function () { return [{k: 'r', label: 'Radius', kind: 'len', min: 0}]; },
    run: function (r, idx) {
      var e = DOC.ents[idx[0]], pe = e.t === 'poly' ? polyToPath(e) : e.t === 'path' ? e : e.t === 'rect' ? rectToPath(e) : null;
      if (!pe) return 'Its shape has no corners now.';
      pe = pathClean(pe);
      if (pe.pts.length !== r.n) return 'Its outline has a different number of corners now, so it can\u2019t tell which one to round.';
      var at = pe.pts[r.vi], keep = UICFG.filletType;
      UICFG.filletType = r.kind;
      var ne = cornerResult({e: e, i: idx[0], vi: r.vi, pe: pe}, r.r, {x: at[0] + r.wx, y: at[1] + r.wy});
      UICFG.filletType = keep;
      if (!ne) return 'That corner can\u2019t be rounded at that radius now.';
      cornerKeep(e, ne);
      DOC.ents.splice(idx[0], 1, ne);
      return true;
    }
  },
  xform: {                      // dragging the selection's handles (tool-manager.js xformApply)
    name: function (r) {
      if (r.kind === 'rot') return 'Rotate ' + parseFloat((+r.ang).toFixed(2)) + '\u00b0';
      return Math.abs(r.sx - r.sy) < 1e-9 ? 'Scale ' + parseFloat((r.sx * 100).toFixed(1)) + '%' : 'Stretch';
    },
    fields: function (r) {
      return r.kind === 'rot' ? [{k: 'ang', label: 'Angle', kind: 'deg'}]
                              : [{k: 'sx', label: 'Across', kind: 'pct', min: 0}, {k: 'sy', label: 'Up', kind: 'pct', min: 0}];
    },
    run: function (r, idx) {
      SEL = idx;
      var b = selBBox();
      if (!b || !r.at) return HIST_WHY.cant;
      var o = histFromFrac(b, r.at);
      if (r.kind === 'rot') idx.forEach(function (i) { rotateEnt(DOC.ents[i], o.x, o.y, r.ang * Math.PI / 180); });
      else { SCALE_NOTE = null; idx.forEach(function (i) { scaleEnt(DOC.ents[i], o.x, o.y, r.sx, r.sy); }); }
      return true;
    }
  },
  mirror: {
    name: function () { return 'Mirror'; },
    fields: function () { return []; },
    run: function (r, idx) {
      var li = histIndexes([r.line]), e = li && DOC.ents[li[0]];
      if (!e || e.t !== 'line') return 'The line it mirrors about is gone.';
      var vx = e.x2 - e.x1, vy = e.y2 - e.y1, L = Math.hypot(vx, vy);
      if (L < 1e-9) return 'The line it mirrors about has no length now.';
      idx.forEach(function (i) { var c = cloneEnt(DOC.ents[i]); mirrorEnt(c, e.x1, e.y1, vx / L, vy / L); DOC.ents.push(c); });
      return true;
    }
  },
  bool: {                       // Weld, Subtract, Intersect (booleans.js)
    name: function (r) { return {weld: 'Weld', subtract: 'Subtract', intersect: 'Intersect'}[r.kind] || 'Combine'; },
    fields: function () { return []; },
    run: function (r, idx) {
      SEL = idx;
      var res = boolApply(r.kind);
      return res.ok ? true : res.title + '.';
    }
  },
  join: {
    name: function () { return 'Join'; },
    fields: function () { return []; },
    run: function (r, idx) { SEL = idx; return doJoin() ? true : 'Its shapes don\u2019t join up now.'; }
  },
  explode: {
    name: function () { return 'Explode'; },
    fields: function () { return []; },
    run: function (r, idx) { SEL = idx; return doExplode() ? true : 'There\u2019s nothing in it to break apart now.'; }
  },
  node: {                       // a point dragged with the Node tool: the same point, by its place in the outline, as far
    name: function (r) { return 'Move point ' + (r.vi + 1); },
    fields: function () { return [{k: 'dx', label: 'Across', kind: 'len'}, {k: 'dy', label: 'Up', kind: 'len'}]; },
    run: function (r, idx) {
      var e = DOC.ents[idx[0]];
      if (!e.pts || (e.t !== 'poly' && e.t !== 'path')) return 'Its shape has no points to move now.';
      if (e.pts.length !== r.n) return 'Its outline has a different number of points now, so it can\u2019t tell which one to move.';
      e.pts[r.vi][0] += r.dx; e.pts[r.vi][1] += r.dy;
      e._tess = null; e._tess2 = null;
      return true;
    }
  },
  trim: {                       // the piece of the shape where it was clicked, between whatever crosses it now
    name: function () { return 'Trim'; },
    fields: function () { return []; },
    run: function (r, idx) {
      var b = entBBox(DOC.ents[idx[0]]);
      return b && doTrim(histFromFrac(b, r.at), idx[0]) ? true : 'Nothing crosses it there now, so there\u2019s no piece to trim.';
    }
  },
  extend: {                     // the end nearer where it was clicked, to whatever it reaches now
    name: function () { return 'Extend'; },
    fields: function () { return []; },
    run: function (r, idx) {
      var b = entBBox(DOC.ents[idx[0]]);
      return b && doExtend(histFromFrac(b, r.at), idx[0]) ? true : 'There\u2019s nothing for it to reach now.';
    }
  },
  filletAll: {
    name: function (r) { return (r.kind === 'dogbone' ? 'Dog-bone corners ' : r.kind === 'tbone' ? 'T-bone corners ' : 'Fillet corners ') + histLen(r.r); },
    fields: function () { return [{k: 'r', label: 'Radius', kind: 'len', min: 0}]; },
    run: function (r, idx) {
      var P = filletAllPlan(idx, {r: r.r, kind: r.kind, which: r.which});
      if (!P.done) return 'None of its corners can be rounded at that radius now.';
      P.results.forEach(function (x) { DOC.ents[x.i] = x.ne; });
      return true;
    }
  }
};
// A shape a step added: the numbers that can be changed, by kind.
var HIST_SHAPE_FIELDS = {
  rect: [{k: 'x', label: 'X', kind: 'len'}, {k: 'y', label: 'Y', kind: 'len'}, {k: 'w', label: 'Width', kind: 'len', min: 0}, {k: 'h', label: 'Height', kind: 'len', min: 0}],
  circle: [{k: 'cx', label: 'Centre X', kind: 'len'}, {k: 'cy', label: 'Centre Y', kind: 'len'}, {k: 'd', label: 'Diameter', kind: 'len', min: 0}],
  line: [{k: 'x1', label: 'Start X', kind: 'len'}, {k: 'y1', label: 'Start Y', kind: 'len'}, {k: 'x2', label: 'End X', kind: 'len'}, {k: 'y2', label: 'End Y', kind: 'len'}],
  text: [{k: 'str', label: 'Text', kind: 'text'}, {k: 'h', label: 'Height', kind: 'len', min: 0}]
};

/* ---- doing a step again */
// the drawing as a step keeps it, into DOC, to do a step's tool on
function histLoad(p){
  var s = JSON.parse(histJoin(p));
  HIST_KEYS.forEach(function (k) { if (k in s) DOC[k] = s[k]; else delete DOC[k]; });
}
function histKeyOf(j, k){
  var m = HIST_KEYOF[k], id = m.get(j);
  if (id === undefined){ var o = histParse(j); id = (o && typeof o === 'object' && o[HIST_KEYED[k]]) || null; m.set(j, id); }
  return id;
}
function histSame(x, y){
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every(function (j, i) { return j === y[i]; });
  return x === y;
}
// What a step did to a list kept by id (b: before, a: after), done to the list as it is now (c). Throws why not.
function histPatchList(k, b, a, c){
  var key = function (j) { return histKeyOf(j, k); }, ok = true;
  var map = function (list) { var m = new Map(); list.forEach(function (j) { var id = key(j); if (!id || m.has(id)) ok = false; m.set(id, j); }); return m; };
  var B = map(b), A = map(a), C = map(c);
  var whole = function () { if (histSame(c, b)) return a; if (histSame(c, a)) return c; throw HIST_WHY.changed; };
  if (!ok) return whole();                                 // (something without an id: all or nothing)
  var common = function (list, other) { return list.map(key).filter(function (id) { return other.has(id); }).join('\n'); };
  if (common(b, A) !== common(a, B)) return whole();       // it put things in another order: all or nothing
  var drop = {};
  B.forEach(function (j, id) {
    if (A.has(id) || !C.has(id)) return;                    // kept, or gone already
    if (C.get(id) !== j) throw HIST_WHY.changed;
    drop[id] = true;
  });
  var out = c.filter(function (j) { return !drop[key(j)]; });
  A.forEach(function (j, id) {
    if (!B.has(id) || B.get(id) === j) return;
    if (!C.has(id)) throw HIST_WHY.gone;
    var cj = C.get(id);
    if (cj === j) return;
    if (cj !== B.get(id)) throw HIST_WHY.changed;
    out[out.indexOf(cj)] = j;
  });
  var prev = null;                                         // what it added goes after what it followed
  a.forEach(function (j) {
    var id = key(j);
    if (!B.has(id)){
      if (C.has(id)){ if (C.get(id) !== j) throw HIST_WHY.changed; }
      else {
        var at = 0;
        if (prev !== null) for (var q = 0; q < out.length; q++) if (key(out[q]) === prev){ at = q + 1; break; }
        out.splice(at, 0, j);
      }
    }
    if (C.has(id) || !B.has(id)) prev = id;           // (one that's gone isn't there to follow)
  });
  return out;
}
// what a step did (orig), done to the drawing as it is now (c)
function histPatch(o, c){
  return HIST_KEYS.map(function (k, i) {
    var b = o.b[i], a = o.a[i], x = c[i];
    if (histSame(b, a)) return x;
    if (HIST_KEYED[k] && Array.isArray(b) && Array.isArray(a) && Array.isArray(x)) return histPatchList(k, b, a, x);
    if (histSame(x, b)) return a;
    if (histSame(x, a)) return x;
    throw HIST_WHY.changed;
  });
}
function histRun(st, p){
  histLoad(p);
  var idx = histIndexes(st.recipe.ids || []);
  if (!idx) return {why: HIST_WHY.gone};
  // the new shapes get the ids they had the first time, in the same order
  HIST_IDS_NEXT = (st.made || st.recipe.out || []).slice();
  try {
    var ok = HIST_OPS[st.recipe.op].run(st.recipe, idx);
    if (ok === true) histGiveIds();
  } finally { HIST_IDS_NEXT = null; }
  if (ok !== true) return {why: typeof ok === 'string' ? ok : HIST_WHY.cant};
  // shapes it made go on the layer and sheet they went on the first time (not the ones being drawn on now)
  var first = {}, E = HIST_KEYS.indexOf('ents');
  if (st.orig && Array.isArray(st.orig.a[E])) st.orig.a[E].forEach(function (j) { var id = histKeyOf(j, 'ents'); if (id) first[id] = j; });
  DOC.ents.forEach(function (e) {
    if (!e || e.layer !== undefined || !first[e._id]) return;
    var o = histParse(first[e._id]);
    if (o && o.layer !== undefined) e.layer = o.layer;
    if (o && o.sheet !== undefined) e.sheet = o.sheet;
  });
  return {p: histPack()};
}
// Each step from 'from' on keeps what it first did, before any is done again.
function histKeepOrig(L, from){
  for (var i = from; i < L.steps.length; i++) if (!L.steps[i].orig) L.steps[i].orig = {b: L.s[i], a: L.s[i + 1]};
}
// Do the steps from 'from' (up to 'to') again, stopping at another drawing's (the step that opened or started it,
// after L.edited, the step changed). Returns how many couldn't be done (now red).
function histReplay(L, from, to){
  histKeepOrig(L, from);
  var keepSel = SEL, failed = 0, first = L.edited !== undefined ? L.edited : from;
  to = Math.min(to === undefined ? L.steps.length : to, L.steps.length);
  DRY = true; HIST_REPLAYING = true;
  try {
    for (var i = from; i < to && !L.stopped; i++){
      if (i > first && L.steps[i].kind){ L.stopped = true; break; }
      var st = L.steps[i], r;
      try { r = st.recipe && HIST_OPS[st.recipe.op] ? histRun(st, L.s[i]) : {p: histPatch(st.orig, L.s[i])}; }
      catch (e) { r = {why: typeof e === 'string' ? e : HIST_WHY.cant}; }
      if (r.why){ st.failed = r.why; L.s[i + 1] = L.s[i]; failed++; }
      else { delete st.failed; L.s[i + 1] = r.p; }
    }
  } finally { DRY = false; HIST_REPLAYING = false; SEL = keepSel; }
  return failed;
}

/* ---- changing a step */
// What step i lets you change: {title, fields: [{k, label, kind, min, value}], change(step, values)}, or null.
function histEditInfo(L, i){
  var st = L.steps[i];
  if (!st || st.kind) return null;
  if (st.recipe && HIST_OPS[st.recipe.op]){
    var op = HIST_OPS[st.recipe.op];
    if (!op.fields(st.recipe).length) return null;
    return {title: st.name || op.name(st.recipe),
            fields: op.fields(st.recipe).map(function (f) { return Object.assign({value: st.recipe[f.k]}, f); }),
            change: function (s, v) {
              var r = Object.assign({}, s.recipe, v);
              s.recipe = r; s.name = op.name(r);
            }};
  }
  // a step that only added one shape: that shape's numbers
  var o = st.orig || {b: L.s[i], a: L.s[i + 1]}, E = HIST_KEYS.indexOf('ents');
  for (var k = 0; k < HIST_KEYS.length; k++) if (k !== E && !histSame(o.b[k], o.a[k])) return null;
  if (!Array.isArray(o.b[E]) || !Array.isArray(o.a[E])) return null;
  var d = histListDiff(o.b[E], o.a[E]);
  if (d.added.length !== 1 || d.removed.length) return null;
  var shape = histParse(d.added[0]), fields = shape && HIST_SHAPE_FIELDS[shape.t];
  if (!fields) return null;
  var piece = d.added[0];
  return {title: st.name || histShapeName(shape),
          fields: fields.map(function (f) { return Object.assign({value: f.k === 'd' ? shape.r * 2 : shape[f.k]}, f); }),
          change: function (s, v) {
            var e = histParse(piece);
            for (var f in v){ if (f === 'd') e.r = v.d / 2; else e[f] = v[f]; }
            var j = histPiece(JSON.stringify(e)), a = o.a.slice();
            a[E] = o.a[E].map(function (x) { return x === piece ? j : x; });
            s.orig = {b: o.b, a: a};
          }};
}
/* ---- taking back a change to a step: the whole line of steps as it was before it (HIST_EDITS), and as it was
   after it, to put it back (HIST_EDITS_UNDONE). A copy of the line is cheap: its drawings are shared pieces. The
   last 30 changes. HIST_SEQ orders them among the steps, so that Undo takes back whichever came last. */
var HIST_EDITS = [], HIST_EDITS_UNDONE = [], HIST_SEQ = 0, HIST_EDITS_MAX = 30;
function histEntryCopy(e){ var o = {}; for (var k in e) o[k] = e[k]; return o; }
function histLineCopy(){
  var cur = histPack();
  histMadeFlush();
  return {undo: UNDO.map(histEntryCopy), redo: REDO.map(histEntryCopy), cur: cur, stale: HIST_STALE_FROM};
}
function histLinePut(c){
  UNDO = c.undo.map(histEntryCopy); REDO = c.redo.map(histEntryCopy); HIST_STALE_FROM = c.stale === undefined ? null : c.stale;
  docRestore(histJoin(c.cur)); SEL = []; draw(); persist(); histChanged();
}
function histEditUndo(){
  var ed = HIST_EDITS.pop();
  if (!ed) return;
  histLinePut(ed.before);
  HIST_EDITS_UNDONE.push(ed);
  toast('info', 'Took back the change to \u201c' + ed.name + '\u201d', 'The steps after it are as they were before it. Redo (Ctrl+Y) puts the change back.');
}
function histEditRedo(){
  var ed = HIST_EDITS_UNDONE.pop();
  if (!ed) return;
  histLinePut(ed.after);
  ed.seq = ++HIST_SEQ;
  HIST_EDITS.push(ed);
  toast('info', 'Put back the change to \u201c' + ed.name + '\u201d', '');
}
// pieces let go of (histSweep): the copies' drawings too
function histSweepEdits(re){
  var fix = function (c) {
    c.cur = re(c.cur);
    c.undo.concat(c.redo).forEach(function (e) { e.p = re(e.p); if (e.orig) e.orig = {b: re(e.orig.b), a: re(e.orig.a)}; });
  };
  HIST_EDITS.concat(HIST_EDITS_UNDONE).forEach(function (ed) { fix(ed.before); fix(ed.after); });
}

// Change step i (values: {field: value}), and do the steps after it again. Returns how many turned red; or, when
// there are more than HIST_BUSY_STEPS to do again, a promise of it, done in parts with the Working panel up.
var HIST_BUSY_STEPS = 40, HIST_BUSY_PART = 25;
function histEdit(i, values){
  if (!histEditInfo(histLine(), i)) return -1;
  var before = histLineCopy();                                      // (before anything changes: to take it back)
  histFresh();                                                      // steps after a change made in the middle: up to date first
  var L = histLine(), info = histEditInfo(L, i), title = info && info.title;
  if (!info){ histLinePut(before); return -1; }
  histKeepOrig(L, i);
  info.change(L.steps[i], values);
  L.edited = i;
  var finish = function (failed) {
    histSetLine(L); SEL = []; draw(); persist(); histChanged();
    HIST_EDITS.push({before: before, after: histLineCopy(), name: title, seq: ++HIST_SEQ});
    if (HIST_EDITS.length > HIST_EDITS_MAX) HIST_EDITS.shift();
    HIST_EDITS_UNDONE = [];
    return failed;
  };
  if (L.steps.length - i <= HIST_BUSY_STEPS || typeof busyRun !== 'function') return finish(histReplay(L, i));
  var failed = 0, parts = [];
  for (var a = i; a < L.steps.length; a += HIST_BUSY_PART) (function (a) {
    parts.push({label: 'Steps ' + (a + 1) + ' to ' + Math.min(a + HIST_BUSY_PART, L.steps.length) + ' of ' + L.steps.length,
                fn: function () { failed += histReplay(L, a, a + HIST_BUSY_PART); }});
  })(a);
  return busyRun('Doing the steps after it again…', parts).then(function () { return finish(failed); });
}

/* ---- the panel for it: double-click a step */
var HIST_EDITING = null;
function histEditOpen(i, chip){
  var L = histLine(), info = histEditInfo(L, i), st = L.steps[i];
  if (!info){
    if (st && st.recipe && HIST_OPS[st.recipe.op])
      toast('info', 'Nothing to change in this step', 'It has no numbers of its own. When you change a step before it, it\u2019s done again on its shapes as they are then.');
    else
      toast('info', 'This step can\u2019t be changed', 'Steps that drew a rectangle, circle, line or text, and fillets, offsets, moves, resizes, rotations, stretches and points moved, can be changed. Others can be gone back to, not changed (yet).');
    return;
  }
  histEditClose();
  HIST_EDITING = {i: i};
  var box = document.createElement('div');
  box.id = 'histEdit'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Change ' + info.title);
  var head = document.createElement('div'); head.className = 'heHead';
  var h = document.createElement('b'); h.textContent = 'Change: ' + info.title; head.appendChild(h);
  box.appendChild(head);
  var inputs = [];
  info.fields.forEach(function (f) {
    var row = document.createElement('label'); row.className = 'heRow';
    var t = document.createElement('span'); t.textContent = f.label; row.appendChild(t);
    var inp = document.createElement('input'); inp.type = 'text'; inp.autocomplete = 'off';
    if (f.kind !== 'text') inp.inputMode = 'decimal';
    inp.value = f.kind === 'len' ? fmtDisp(f.value) : f.kind === 'deg' ? String(parseFloat((+f.value).toFixed(3))) :
                f.kind === 'pct' ? String(parseFloat((f.value * 100).toFixed(2))) : String(f.value == null ? '' : f.value);
    row.appendChild(inp);
    var u = document.createElement('span'); u.className = 'heUnit'; u.textContent = f.kind === 'len' ? unitTag() : f.kind === 'deg' ? '\u00b0' : f.kind === 'pct' ? '%' : '';
    row.appendChild(u);
    box.appendChild(row);
    inputs.push({f: f, inp: inp});
  });
  var note = document.createElement('p'); note.className = 'heNote';
  note.textContent = 'The steps after it are done again. Any that can\u2019t be turn red and are skipped. Undo (Ctrl+Z) takes the change back.';
  box.appendChild(note);
  var btns = document.createElement('div'); btns.className = 'mirBtns';
  var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'primary'; ok.textContent = 'Change';
  btns.appendChild(cancel); btns.appendChild(ok); box.appendChild(btns);
  var apply = function () {
    var v = {}, bad = null;
    inputs.forEach(function (x) {
      if (x.f.kind === 'text'){ v[x.f.k] = x.inp.value; return; }
      var n = x.f.kind === 'len' ? lenIn(x.inp.value) : x.f.kind === 'pct' ? parseFloat(x.inp.value) / 100 : parseFloat(x.inp.value);
      if (!isFinite(n) || (x.f.min !== null && x.f.min !== undefined && !(n > x.f.min))){ if (!bad) bad = x; return; }
      v[x.f.k] = n;
    });
    if (bad){ toast('warn', 'That isn’t a number it can use', bad.f.label + (bad.f.min === 0 ? ' must be more than 0.' : ': type a number, such as 50 or 12.5.')); bad.inp.focus(); return; }
    histEditClose();
    Promise.resolve(histEdit(i, v)).then(function (failed) {
    if (failed > 0) toast('warn', 'Changed: ' + failed + (failed === 1 ? ' step after it couldn’t be done again' : ' steps after it couldn’t be done again'),
                          (failed === 1 ? 'It’s red on the History bar, and skipped. ' : 'They’re red on the History bar, and skipped. ') + 'Hover over a red step to see why. Changing this step back brings it back.');
    });
  };
  ok.addEventListener('click', apply);
  cancel.addEventListener('click', histEditClose);
  box.addEventListener('keydown', function (e) {
    if (e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); apply(); }
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); histEditClose(); }
    else e.stopPropagation();                              // typing here isn't a shortcut
  });
  document.getElementById('canvasWrap').appendChild(box);
  if (chip && chip.offsetLeft !== undefined){
    var bar = document.getElementById('histBar'), list = document.getElementById('histSteps');
    box.style.left = Math.max(10, Math.min(bar.offsetLeft + chip.offsetLeft - list.scrollLeft, bar.offsetLeft + bar.offsetWidth - 280)) + 'px';
  }
  if (inputs[0]){ inputs[0].inp.focus(); if (inputs[0].inp.select) inputs[0].inp.select(); }
}
function histEditClose(){
  var b = document.getElementById('histEdit');
  if (b) b.remove();
  HIST_EDITING = null;
}
