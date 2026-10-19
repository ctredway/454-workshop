/* ---------------- history: the timeline ----------------
   Every change is a step, as undo always kept them, but named, kept with the drawing, and shown along the bottom of
   the drawing (the History bar): click a step to see the drawing as it was just after it, and click a later one to
   come forward again. Undo and redo move one step along the same line.

   UNDO holds the steps done, oldest first, each with the drawing as it was before it; REDO the steps undone, the
   last one undone at the end, each with the drawing as it was after it. A step is {p, name, at, kind}:
     p     the drawing, in pieces (histPack): one piece for each shape, toolpath, dimension, guide and parameter,
           and one for each of the rest (the material, layers, sheets...). Pieces are kept once (HIST_STR) and shared,
           so a step that changes one shape adds one piece, not another copy of the drawing.
     name  what it did ("Fillet 6 mm"), or null: then it's worked out by comparing the drawing before and after it
     at    when it was done (ms)
     kind  'open' or 'new': the drawing before this step was another drawing (opened, started new, recovered)
   Saving a drawing to a file saves its history with it (histAttach), from the step it was opened or started at;
   opening it brings that history back. The browser's storage keeps it too, so it's there after closing Design. */
var HIST_MAX = 500;
// the parts of the drawing a step keeps, in this order (as docSnap always wrote them); lists get a piece per item
var HIST_KEYS = ['ents', 'guides', 'dims', 'params', 'toolpaths', 'tpGroups', 'vcConverted', 'stock', 'layers', 'activeLayer', 'images', 'sheets'];
var HIST_LIST = {ents: 1, guides: 1, dims: 1, params: 1, toolpaths: 1};
var HIST_STR = [], HIST_ID = new Map();
var HIST_STORE_KEY = 'd454DesignHist';

function histPiece(s){
  var i = HIST_ID.get(s);
  if (i === undefined){ i = HIST_STR.length; HIST_STR.push(s); HIST_ID.set(s, i); }
  return i;
}
function histValues(){
  return {ents: DOC.ents, guides: DOC.guides, dims: DOC.dims || [], params: DOC.params || [], toolpaths: tpLean(DOC.toolpaths),
          tpGroups: DOC.tpGroups || [], vcConverted: !!DOC.vcConverted, stock: DOC.stock, layers: DOC.layers,
          activeLayer: DOC.activeLayer, images: DOC.images, sheets: DOC.sheets || null};
}
// The drawing now, in pieces: for each of HIST_KEYS, -1 (not there), a piece, or a list of pieces.
function histPack(){
  var v = histValues();
  return HIST_KEYS.map(function (k) {
    var x = v[k];
    if (x === undefined) return -1;
    if (HIST_LIST[k] && Array.isArray(x)) return x.map(function (it) { var s = JSON.stringify(it); return histPiece(s === undefined ? 'null' : s); });
    return histPiece(JSON.stringify(x));
  });
}
// Back to the text the pieces came from: exactly what JSON.stringify gives for the drawing's parts.
function histJoin(p){
  var parts = [];
  HIST_KEYS.forEach(function (k, i) {
    var x = p[i];
    if (x === -1) return;
    parts.push(JSON.stringify(k) + ':' + (Array.isArray(x) ? '[' + x.map(function (j) { return HIST_STR[j]; }).join(',') + ']' : HIST_STR[x]));
  });
  return '{' + parts.join(',') + '}';
}
function docSnap(){ return histJoin(histPack()); }

// Pieces no step uses any more are let go now and then.
var HIST_SWEEP_AT = 20000;
function histSweep(){
  if (HIST_STR.length < HIST_SWEEP_AT) return;
  var map = new Map(), str = [], ids = new Map();
  var keep = function (j) {
    var n = map.get(j);
    if (n === undefined){ n = str.length; str.push(HIST_STR[j]); ids.set(HIST_STR[j], n); map.set(j, n); }
    return n;
  };
  UNDO.concat(REDO).forEach(function (e) {
    e.p = e.p.map(function (x) { return x === -1 ? -1 : Array.isArray(x) ? x.map(keep) : keep(x); });
  });
  HIST_STR = str; HIST_ID = ids;
  HIST_SWEEP_AT = Math.max(20000, str.length * 2);
}

function pushUndo(name, kind){
  if (typeof DRY !== 'undefined' && DRY) return;
  FALL_MARKS = null;
  UNDO.push({p: histPack(), name: typeof name === 'string' ? name : null, at: Date.now(), kind: kind || null});
  if (UNDO.length > HIST_MAX) UNDO.shift();
  REDO = [];
  histSweep();
  histChanged();
}
// The step just recorded changed nothing after all (or is folded into the one before): forget it.
function undoDrop(){ UNDO.pop(); histChanged(); }
// a step moving between done and undone: the drawing it keeps is the other side of it
function histMoved(e, p){ return {p: p, name: e.name, at: e.at, kind: e.kind}; }
// Go to the point where n steps are done (0: before the first one kept), in one move.
function histGoTo(n){
  n = Math.max(0, Math.min(n, UNDO.length + REDO.length));
  if (n === UNDO.length) return;
  var cur = histPack();
  while (UNDO.length > n){ var e = UNDO.pop(); REDO.push(histMoved(e, cur)); cur = e.p; }
  while (UNDO.length < n){ var r = REDO.pop(); UNDO.push(histMoved(r, cur)); cur = r.p; }
  docRestore(histJoin(cur)); SEL = []; draw(); persist(); histChanged();
}
function doUndo(){ if (UNDO.length) histGoTo(UNDO.length - 1); }
function doRedo(){ if (REDO.length) histGoTo(UNDO.length + 1); }

/* ---- names: what a step did, from the drawing before and after it */
function histShapeName(e){
  if (!e) return 'Shape';
  if (e.t === 'rect') return 'Rectangle';
  if (e.t === 'circle') return 'Circle';
  if (e.t === 'line') return 'Line';
  if (e.t === 'arc') return 'Arc';
  if (e.t === 'path') return 'Curve';
  if (e.t === 'group') return 'Group';
  if (e.t === 'poly') return e.closed ? 'Shape' : 'Polyline';
  if (e.t === 'text') return 'Text' + (e.str ? ' “' + (e.str.length > 16 ? e.str.slice(0, 15).replace(/\s+$/, '') + '…' : e.str) + '”' : '');
  return 'Shape';
}
// a length for a step's name, in the units shown: "6 mm", "0.25 in"
function histLen(mm){ return parseFloat(fmtDisp(Math.abs(mm))) + (dispIn() ? ' in' : ' mm'); }
function histLower(s){ return s.charAt(0).toLowerCase() + s.slice(1); }
function histParse(j){ try { return JSON.parse(HIST_STR[j]); } catch (e) { return null; } }
function histListDiff(a, b){
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  var inA = new Set(a), inB = new Set(b);
  return {added: b.filter(function (j) { return !inA.has(j); }), removed: a.filter(function (j) { return !inB.has(j); }),
          moved: a.length === b.length && a.some(function (j, i) { return j !== b[i]; })};
}
// Things removed and added with the same id were changed. idOf: an item's id. (A shape is given its id only when
// something needs it: one without was removed and added, and is named as changed below.)
function histPair(d, idOf){
  var gone = {}, out = {added: [], removed: [], changed: []};
  d.removed.forEach(function (j) { var o = histParse(j), id = o && idOf(o); if (id) gone[id] = o; else out.removed.push(o); });
  d.added.forEach(function (j) {
    var o = histParse(j), id = o && idOf(o);
    if (id && gone[id]){ out.changed.push(o); delete gone[id]; } else out.added.push(o);
  });
  for (var id in gone) out.removed.push(gone[id]);
  return out;
}
function histAutoName(a, b){
  var at = function (p, k) { return p[HIST_KEYS.indexOf(k)]; }, said = [];
  var s = histPair(histListDiff(at(a, 'ents'), at(b, 'ents')), function (o) { return o._id; });
  var one = function (list, verb) { return list.length === 1 ? verb + histLower(histShapeName(list[0])) : verb + list.length + ' shapes'; };
  if (s.added.length && !s.removed.length && !s.changed.length) said.push(s.added.length === 1 ? histShapeName(s.added[0]) : 'Added ' + s.added.length + ' shapes');
  else if (s.removed.length && !s.added.length && !s.changed.length) said.push(one(s.removed, 'Deleted '));
  else if (s.changed.length && !s.added.length && !s.removed.length) said.push(one(s.changed, 'Changed '));
  else if (s.added.length || s.removed.length || s.changed.length){
    var many = Math.max(s.added.length + s.changed.length, s.removed.length + s.changed.length);
    said.push(many === 1 ? 'Changed ' + histLower(histShapeName((s.changed.concat(s.added))[0])) : 'Changed ' + many + ' shapes');
  }
  else if (histListDiff(at(a, 'ents'), at(b, 'ents')).moved) said.push('Shape order');
  var t = histPair(histListDiff(at(a, 'toolpaths'), at(b, 'toolpaths')), function (o) { return o.id; });
  var tn = function (o) { return o && o.name ? o.name : 'toolpath'; };
  if (t.added.length === 1 && !t.removed.length && !t.changed.length) said.push('Toolpath ' + tn(t.added[0]));
  else if (t.removed.length === 1 && !t.added.length && !t.changed.length) said.push('Deleted ' + tn(t.removed[0]));
  else if (t.changed.length === 1 && !t.added.length && !t.removed.length) said.push('Edited ' + tn(t.changed[0]));
  else if (t.added.length || t.removed.length || t.changed.length) said.push('Toolpaths');
  else if (histListDiff(at(a, 'toolpaths'), at(b, 'toolpaths')).moved) said.push('Toolpath order');
  var other = [['dims', 'Dimensions'], ['guides', 'Guide lines'], ['params', 'Parameters'], ['stock', 'Material'], ['sheets', 'Sheets'],
               ['layers', 'Layers'], ['activeLayer', 'Layers'], ['images', 'Pictures'], ['tpGroups', 'Toolpath groups'], ['vcConverted', 'Toolpaths']];
  other.forEach(function (o) {
    var x = at(a, o[0]), y = at(b, o[0]);
    var same = Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every(function (j, i) { return j === y[i]; }) : x === y;
    if (!same && said.indexOf(o[1]) < 0) said.push(o[1]);
  });
  if (!said.length) return 'No change';
  return said.length > 2 ? said.slice(0, 2).join(', ') + '…' : said.join(', ');
}

/* ---- the steps, in order, for the History bar: {name, at, kind, n}; clicking one goes to n steps done */
function histSteps(){
  var out = [], cur = null, now = function () { return cur || (cur = histPack()); };
  UNDO.forEach(function (e, i) {
    out.push({name: e.name || histAutoName(e.p, i + 1 < UNDO.length ? UNDO[i + 1].p : now()), at: e.at, kind: e.kind, n: i + 1, done: true});
  });
  for (var j = REDO.length - 1; j >= 0; j--){
    var r = REDO[j];
    out.push({name: r.name || histAutoName(j === REDO.length - 1 ? now() : REDO[j + 1].p, r.p), at: r.at, kind: r.kind, n: UNDO.length + (REDO.length - j), done: false});
  }
  return out;
}

/* ---- kept with the drawing: in its file, and in the browser's storage.
   {v: 1, pieces: [...], states: [...], steps: [{name, at, kind}], at}: step i goes from states[i] to states[i + 1];
   states[at] is the drawing as it is. Only this drawing's steps: from the last one that opened or started it. */
function histForKeeping(){
  var first = 0;
  for (var i = UNDO.length - 1; i >= 0; i--) if (UNDO[i].kind){ first = i + 1; break; }
  var states = [], steps = [];
  UNDO.slice(first).forEach(function (e) { states.push(e.p); steps.push({name: e.name, at: e.at, kind: null}); });
  states.push(histPack());
  var at = states.length - 1;
  for (var j = REDO.length - 1; j >= 0 && !REDO[j].kind; j--){ states.push(REDO[j].p); steps.push({name: REDO[j].name, at: REDO[j].at, kind: null}); }
  if (!steps.length) return null;
  var map = new Map(), pieces = [];
  var put = function (x) { var n = map.get(x); if (n === undefined){ n = pieces.length; pieces.push(HIST_STR[x]); map.set(x, n); } return n; };
  states = states.map(function (p) { return p.map(function (x) { return x === -1 ? -1 : Array.isArray(x) ? x.map(put) : put(x); }); });
  return {v: 1, pieces: pieces.map(function (s) { return JSON.parse(s); }), states: states, steps: steps, at: at};
}
// The drawing's file, with its history added at the end.
function histAttach(text){
  var h = histForKeeping();
  if (!h) return text;
  var end = text.lastIndexOf('}');
  return text.slice(0, end).replace(/\s*$/, '') + ',\n "history": ' + JSON.stringify(h) + '\n}';
}
// A kept history's steps, as steps here (after any already done), for the drawing open now. Wrong or damaged: none,
// and false. If the drawing isn't as the history left it (saved by a version of Design that kept the history but
// didn't add to it), the difference is a step of its own, and the steps that had been undone are left out.
function histTake(h){
  if (!h || h.v !== 1 || !Array.isArray(h.pieces) || !Array.isArray(h.states) || !Array.isArray(h.steps) ||
      h.states.length !== h.steps.length + 1 || !(h.at >= 0 && h.at < h.states.length)) return false;
  try {
    var ids = h.pieces.map(function (o) { var s = JSON.stringify(o); return histPiece(s === undefined ? 'null' : s); });
    var p = h.states.map(function (st) {
      if (!Array.isArray(st) || st.length !== HIST_KEYS.length) throw new Error('state');
      return st.map(function (x) {
        if (x === -1) return -1;
        if (Array.isArray(x)) return x.map(function (j) { if (ids[j] === undefined) throw new Error('piece'); return ids[j]; });
        if (ids[x] === undefined) throw new Error('piece');
        return ids[x];
      });
    });
  } catch (e) { return false; }
  var step = function (i) { var s = h.steps[i] || {}; return {name: typeof s.name === 'string' ? s.name : null, at: +s.at || 0, kind: null}; };
  for (var i = 0; i < h.at; i++){ var e = step(i); e.p = p[i]; UNDO.push(e); }
  if (histJoin(p[h.at]) !== docSnap()) UNDO.push({p: p[h.at], name: null, at: 0, kind: null});
  else for (var j = h.states.length - 1; j > h.at; j--){ var r = step(j - 1); r.p = p[j]; REDO.push(r); }
  while (UNDO.length > HIST_MAX) UNDO.shift();
  histChanged();
  return true;
}
// At startup: the history kept in the browser's storage, if it's this drawing's.
function histRestoreStored(){
  var h;
  try { h = JSON.parse(localStorage.getItem(HIST_STORE_KEY) || 'null'); } catch (e) { return; }
  // only if it's this drawing's history: the drawing as it was left is the drawing that's open
  try { if (histJoin(histStateAt(h)) !== docSnap()) return; } catch (e) { return; }
  histTake(h);
}
// a kept history's drawing as it was left
function histStateAt(h){
  var ids = h.pieces.map(function (o) { return histPiece(JSON.stringify(o)); });
  return h.states[h.at].map(function (x) { return x === -1 ? -1 : Array.isArray(x) ? x.map(function (j) { return ids[j]; }) : ids[x]; });
}
var HIST_STORE_T = null, HIST_STORE_WARNED = false;
function histStore(){
  try {
    var h = histForKeeping();
    if (h) localStorage.setItem(HIST_STORE_KEY, JSON.stringify(h)); else localStorage.removeItem(HIST_STORE_KEY);
  } catch (e) {
    try { localStorage.removeItem(HIST_STORE_KEY); } catch (e2) {}
    if (!HIST_STORE_WARNED){ HIST_STORE_WARNED = true;
      toast('warn', 'The history is too long to keep in the browser', 'It’s here until you close 454 Design, and saving the drawing to a file keeps it in the file.'); }
  }
}

/* ---- the History bar */
var HIST_RENDER_T = null;
function histChanged(){
  if (typeof DRY !== 'undefined' && DRY) return;
  if (!HIST_RENDER_T) HIST_RENDER_T = setTimeout(function () { HIST_RENDER_T = null; histRender(); }, 60);
  clearTimeout(HIST_STORE_T);
  HIST_STORE_T = setTimeout(histStore, 1500);
}
function histWhen(ms){
  if (!ms) return '';
  var d = new Date(ms), now = new Date(), two = function (n) { return (n < 10 ? '0' : '') + n; };
  var t = two(d.getHours()) + ':' + two(d.getMinutes());
  return d.toDateString() === now.toDateString() ? t : d.getDate() + ' ' + 'JanFebMarAprMayJunJulAugSepOctNovDec'.substr(d.getMonth() * 3, 3) + ' ' + t;
}
function histRender(){
  var bar = document.getElementById('histBar');
  if (!bar) return;
  var open = UICFG.histBar !== false;
  bar.classList.toggle('folded', !open);
  var fold = document.getElementById('histFold');
  fold.setAttribute('aria-expanded', open ? 'true' : 'false');
  fold.title = open ? 'Hide the history' : 'Show the history: every change, to go back to';
  var list = document.getElementById('histSteps'), note = document.getElementById('histNote');
  list.textContent = '';
  if (!open){ note.textContent = ''; return; }
  var steps = histSteps(), done = UNDO.length;
  var start = document.createElement('button');
  start.type = 'button'; start.className = 'hStep hStart' + (done === 0 ? ' now' : '');
  start.textContent = 'Start';
  start.title = steps.length ? 'The drawing before the first step kept here' : 'Every change you make shows here, to go back to';
  start.addEventListener('click', function () { histGoTo(0); });
  list.appendChild(start);
  steps.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hStep' + (s.done ? '' : ' undone') + (s.n === done ? ' now' : '') + (s.kind ? ' hDoc' : '');
    b.textContent = s.name;
    b.title = s.name + (s.at ? ' · ' + histWhen(s.at) : '') +
      (s.n === done ? '\nThe drawing is as it was just after this step.' : '\nClick to see the drawing as it was just after this step.');
    b.addEventListener('click', function () { histGoTo(s.n); });
    list.appendChild(b);
  });
  var ahead = REDO.length;
  note.textContent = ahead ? 'Back ' + ahead + (ahead === 1 ? ' step: a change here drops the step after it' : ' steps: a change here drops the ' + ahead + ' after it') : '';
  var now = list.querySelector('.now');
  if (now && now.scrollIntoView) now.scrollIntoView({block: 'nearest', inline: 'center'});
}
function histWire(){
  var fold = document.getElementById('histFold');
  if (!fold || fold.wired) return;
  fold.wired = true;
  fold.addEventListener('click', function () { UICFG.histBar = UICFG.histBar === false; uiCfgSave(); histRender(); });
  // the mouse wheel scrolls the steps along (there's no scroll bar, to keep the bar small)
  var list = document.getElementById('histSteps');
  list.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)){ list.scrollLeft += e.deltaY; e.preventDefault(); }
  }, {passive: false});
  histRender();
}
