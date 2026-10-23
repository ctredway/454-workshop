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
// A toolpath as a step keeps it: its settings, not what's worked out from them (TP_NOT_SETTINGS, undo.js), which
// follows from the settings and the shapes and is worked out again when it's needed.
var HIST_TP_RESULTS = {past: 1, sig: 1, warning: 1, vcNote: 1, vcFloor: 1, vcDepth: 1, vcFlat: 1, rings: 1, restRuns: 1, islands: 1, rasterLines: 1, floorLeft: 1};
function histTpSettings(list){
  return tpLean(list).map(function (tp) {
    var c = {};
    for (var k in tp) if (!HIST_TP_RESULTS[k]) c[k] = tp[k];
    return c;
  });
}
// a shape as a step keeps it: without the outline worked out for drawing and picking (_tess), kept on paths
function histEntText(e){
  if (e && (e._tess !== undefined || e._tess2 !== undefined || e.t === 'group')) return snapJSON(e);
  return JSON.stringify(e);
}
function histValues(){
  return {ents: DOC.ents, guides: DOC.guides, dims: DOC.dims || [], params: DOC.params || [], toolpaths: histTpSettings(DOC.toolpaths),
          tpGroups: DOC.tpGroups || [], vcConverted: !!DOC.vcConverted, stock: DOC.stock, layers: DOC.layers,
          activeLayer: DOC.activeLayer, images: DOC.images, sheets: DOC.sheets || null};
}
// A shape just made is put on the layer, and the sheet, being drawn on, as the Layers panel does when it's next shown
// (layersInit): so a step keeps it there, and a step done again (history-replay.js) can be compared with it.
function histTidy(){
  if (!DOC.ents || !DOC.layers || !DOC.layers.length || typeof layerById !== 'function') return;
  var sheets = typeof multiSheet === 'function' && multiSheet();
  DOC.ents.forEach(function (e) {
    if (!e || typeof e !== 'object') return;
    if (!layerById(e.layer)) e.layer = DOC.activeLayer;
    if (sheets && !sheetById(e.sheet)) e.sheet = DOC.activeSheet;
  });
}
// The drawing now, in pieces: for each of HIST_KEYS, -1 (not there), a piece, or a list of pieces.
// Every shape is given its id first (and a copy that shares one, its own): a step's changes are kept by shape,
// so that they can be done again on a drawing that's different before them (histPatch).
function histPack(){
  histTidy();
  var seen = {};
  (DOC.ents || []).forEach(function (e) {
    if (!e || typeof e !== 'object') return;
    if (e._id && seen[e._id]) delete e._id;
    seen[entId(e)] = true;
  });
  var v = histValues();
  return HIST_KEYS.map(function (k) {
    var x = v[k];
    if (x === undefined) return -1;
    if (HIST_LIST[k] && Array.isArray(x)) return x.map(function (it) { var s = k === 'ents' ? histEntText(it) : JSON.stringify(it); return histPiece(s === undefined ? 'null' : s); });
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
  var re = function (p) { return p.map(function (x) { return x === -1 ? -1 : Array.isArray(x) ? x.map(keep) : keep(x); }); };
  UNDO.concat(REDO).forEach(function (e) {
    e.p = re(e.p);
    if (e.orig) e.orig = {b: re(e.orig.b), a: re(e.orig.a)};
  });
  if (typeof histSweepEdits === 'function') histSweepEdits(re);   // the changes to steps that can be undone
  HIST_STR = str; HIST_ID = ids; HIST_KEYOF = {ents: new Map(), toolpaths: new Map()};
  HIST_SWEEP_AT = Math.max(20000, str.length * 2);
}

// The ids given to new shapes since the last step was recorded: that step's (step.made), so that done again it gives
// the same ones, and the steps after it still find its shapes. (Ids given while it was being done are its too.)
var HIST_MADE = [], HIST_IDS_NEXT = null;
function histMadeFlush(){
  if (HIST_MADE.length && UNDO.length){ var top = UNDO[UNDO.length - 1]; top.made = (top.made || []).concat(HIST_MADE); }
  HIST_MADE = [];
}
// A tool that makes shapes gives them their ids as it finishes, in the drawing's order, so done again it gives them
// the same ones in the same order, whatever else asks for an id in between.
function histGiveIds(){ (DOC.ents || []).forEach(function (e) { if (e && typeof e === 'object') entId(e); }); }
// A change made with steps undone (gone back on the History bar) goes in there, as in Fusion: the steps after it
// stay, still undone, and are done again on top of it when the drawing goes forward to them (histFresh). Until then
// their drawings are out of date: HIST_STALE_FROM is the first step whose are (null: none). (It used to be Undo's
// way, Clint 2026-10-20: a change dropped every step after it.)
var HIST_STALE_FROM = null;
function pushUndo(name, kind){
  if (typeof DRY !== 'undefined' && DRY) return;
  FALL_MARKS = null;
  var p = histPack();
  var keep = REDO.length && !kind ? REDO : null;        // (a new or opened drawing starts afresh: histStartAfresh)
  if (keep){
    // each step that will be done again keeps what it did the first time (as histKeepOrig does): the next to do
    // went from the drawing as it is to its own; each after it, from the one before's
    for (var j = REDO.length - 1; j >= 0; j--)
      if (!REDO[j].orig) REDO[j].orig = {b: j === REDO.length - 1 ? p : REDO[j + 1].p, a: REDO[j].p};
  }
  // ids given to shapes in the drawing are the last step's; any others were given by the tool starting this one, to
  // shapes it hasn't put in yet (Weld's), and are this step's
  var inDoc = {};
  (DOC.ents || []).forEach(function (e) { if (e && e._id) inDoc[e._id] = true; });
  var later = HIST_MADE.filter(function (id) { return !inDoc[id]; });
  HIST_MADE = HIST_MADE.filter(function (id) { return inDoc[id]; });
  histMadeFlush();
  HIST_MADE = later;
  UNDO.push({p: p, name: typeof name === 'string' ? name : null, at: Date.now(), kind: kind || null, seq: ++HIST_SEQ});
  HIST_EDITS_UNDONE = [];                               // a new step: a change to a step that was undone stays undone
  if (UNDO.length > HIST_MAX){ UNDO.shift(); if (HIST_STALE_FROM !== null) HIST_STALE_FROM = Math.max(0, HIST_STALE_FROM - 1); }
  REDO = keep || [];
  if (keep) HIST_STALE_FROM = UNDO.length;               // the first step after this one (any later were too)
  else HIST_STALE_FROM = null;
  histSweep();
  histChanged();
}
// Bring the steps after a change made in the middle up to date: do them again on top of it. Steps that can't be
// done now turn red, as when a step is changed. Returns how many did.
function histFresh(){
  if (HIST_STALE_FROM === null || typeof histReplay !== 'function') return 0;
  var L = histLine(), from = HIST_STALE_FROM;
  HIST_STALE_FROM = null;
  if (from >= L.steps.length) return 0;
  var failed = histReplay(L, from);
  histSetLine(L);
  if (failed) toast('warn', failed === 1 ? 'A step can’t be done now' : failed + ' steps can’t be done now',
    'They’re red on the History bar, and skipped: the shapes they changed aren’t there, or aren’t as they were. Hover over one to see why.');
  return failed;
}
// Another drawing from here on (New, Open, Recover, Don't save on closing): the steps of the one before go, with any
// changes to steps that could be taken back. Its steps up to the one that started this drawing, or (all) every step.
// Only once the drawing before is safe, in its file or put aside for Recover: if it couldn't be put aside, Undo is
// the way back to it, and its steps stay.
function histStartAfresh(all){
  var last = -1;
  if (!all) for (var i = UNDO.length - 1; i >= 0; i--) if (UNDO[i].kind){ last = i; break; }
  if (all){ UNDO = []; REDO = []; HIST_STALE_FROM = null; }
  else if (last >= 0){ UNDO.splice(0, last + 1); if (HIST_STALE_FROM !== null) HIST_STALE_FROM = Math.max(0, HIST_STALE_FROM - last - 1); }   // (steps undone are this drawing's)
  HIST_MADE = [];
  if (typeof HIST_EDITS !== 'undefined'){ HIST_EDITS = []; HIST_EDITS_UNDONE = []; }
  histChanged();
}
// The step just recorded changed nothing after all (or is folded into the one before): forget it.
function undoDrop(){ UNDO.pop(); HIST_MADE = []; histChanged(); }
// a step moving between done and undone: the drawing it keeps is the other side of it (the rest goes with it)
function histMoved(e, p){ var o = {}; for (var k in e) o[k] = e[k]; o.p = p; return o; }
// Go to the point where n steps are done (0: before the first one kept), in one move.
function histGoTo(n){
  n = Math.max(0, Math.min(n, UNDO.length + REDO.length));
  if (n === UNDO.length) return;
  if (n > UNDO.length) histFresh();                     // going forward: the steps there done again, if they need it
  var cur = histPack();
  histMadeFlush();
  while (UNDO.length > n){ var e = UNDO.pop(); REDO.push(histMoved(e, cur)); cur = e.p; }
  while (UNDO.length < n){ var r = REDO.pop(); UNDO.push(histMoved(r, cur)); cur = r.p; }
  HIST_EDITS_UNDONE = [];
  docRestore(histJoin(cur)); SEL = []; draw(); persist(); histChanged();
}
// Undo takes back whichever came last: a step, or a change made to a step on the History bar (history-replay.js).
// Redo, straight after taking back a change to a step, puts it back.
function doUndo(){
  var ed = HIST_EDITS[HIST_EDITS.length - 1], top = UNDO[UNDO.length - 1];
  if (ed && !(top && top.seq > ed.seq)){ histEditUndo(); return; }
  if (UNDO.length) histGoTo(UNDO.length - 1);
}
function doRedo(){
  if (HIST_EDITS_UNDONE.length){ histEditRedo(); return; }
  if (REDO.length) histGoTo(UNDO.length + 1);
}

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
function histAutoName(a, b){ return histAuto(a, b).name; }
// What a step did, from the drawing before and after it: {name, icon} (the icon a key of ICON or HIST_ICON).
function histAuto(a, b){
  var at = function (p, k) { return p[HIST_KEYS.indexOf(k)]; }, said = [], icons = [];
  var say = function (n, ic) { said.push(n); icons.push(ic || 'changed'); };
  var s = histPair(histListDiff(at(a, 'ents'), at(b, 'ents')), function (o) { return o._id; });
  var one = function (list, verb) { return list.length === 1 ? verb + histLower(histShapeName(list[0])) : verb + list.length + ' shapes'; };
  if (s.added.length && !s.removed.length && !s.changed.length)
    say(s.added.length === 1 ? histShapeName(s.added[0]) : 'Added ' + s.added.length + ' shapes', s.added.length === 1 ? histShapeIcon(s.added[0]) : 'copy');
  else if (s.removed.length && !s.added.length && !s.changed.length) say(one(s.removed, 'Deleted '), 'trash');
  else if (s.changed.length && !s.added.length && !s.removed.length) say(one(s.changed, 'Changed '));
  else if (s.added.length || s.removed.length || s.changed.length){
    var many = Math.max(s.added.length + s.changed.length, s.removed.length + s.changed.length);
    say(many === 1 ? 'Changed ' + histLower(histShapeName((s.changed.concat(s.added))[0])) : 'Changed ' + many + ' shapes');
  }
  else if (histListDiff(at(a, 'ents'), at(b, 'ents')).moved) say('Shape order');
  var t = histPair(histListDiff(at(a, 'toolpaths'), at(b, 'toolpaths')), function (o) { return o.id; });
  var tn = function (o) { return o && o.name ? o.name : 'toolpath'; };
  if (t.added.length === 1 && !t.removed.length && !t.changed.length) say('Toolpath ' + tn(t.added[0]), 'toolpath');
  else if (t.removed.length === 1 && !t.added.length && !t.changed.length) say('Deleted ' + tn(t.removed[0]), 'trash');
  else if (t.changed.length === 1 && !t.added.length && !t.removed.length) say('Edited ' + tn(t.changed[0]), 'toolpath');
  else if (t.added.length || t.removed.length || t.changed.length) say('Toolpaths', 'toolpath');
  else if (histListDiff(at(a, 'toolpaths'), at(b, 'toolpaths')).moved) say('Toolpath order', 'toolpath');
  var other = [['dims', 'Dimensions', 'dim'], ['guides', 'Guide lines', 'guide'], ['params', 'Parameters', 'params'], ['stock', 'Material', 'mach'],
               ['sheets', 'Sheets', 'layers'], ['layers', 'Layers', 'layers'], ['activeLayer', 'Layers', 'layers'], ['images', 'Pictures', 'image'],
               ['tpGroups', 'Toolpath groups', 'toolpath'], ['vcConverted', 'Toolpaths', 'toolpath']];
  other.forEach(function (o) {
    var x = at(a, o[0]), y = at(b, o[0]);
    var same = Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every(function (j, i) { return j === y[i]; }) : x === y;
    if (!same && said.indexOf(o[1]) < 0) say(o[1], o[2]);
  });
  if (!said.length) return {name: 'No change', icon: 'dot'};
  return {name: said.length > 2 ? said.slice(0, 2).join(', ') + '\u2026' : said.join(', '), icon: icons[0]};
}
// the icon for a shape a step added: its tool's
function histShapeIcon(e){
  return {rect: 'rect', circle: 'circ', line: 'line', arc: 'arc', path: 'curves', text: 'text', group: 'group'}[e && e.t] ||
         (e && e.t === 'poly' ? (e.closed ? 'polygon' : 'poly') : 'changed');
}
// The icons the toolbar hasn't got, in its style (ICON, move.js, has the rest).
var HIST_ICON = {
  move: '<svg viewBox="0 0 18 18"><path d="M9 2v14M2 9h14"/><path d="M7 4l2-2 2 2M7 14l2 2 2-2M4 7l-2 2 2 2M14 7l2 2-2 2"/></svg>',
  resize: '<svg viewBox="0 0 18 18"><rect x="2.5" y="8.5" width="7" height="7"/><path d="M9 3h6v6M15 3l-6 6"/></svg>',
  trash: '<svg viewBox="0 0 18 18"><path d="M3 5h12M7 5V3h4v2M4.5 5l1 10.5h7l1-10.5M7.5 8v5M10.5 8v5"/></svg>',
  toolpath: '<svg viewBox="0 0 18 18"><path d="M7 2h4v5.5L9 16 7 7.5z"/><path d="M7 4.5l4 1.5M7 7.5l3.5-1.2"/></svg>',
  layers: '<svg viewBox="0 0 18 18"><path d="M9 3l7 3.5-7 3.5-7-3.5z"/><path d="M2 10.5l7 3.5 7-3.5"/></svg>',
  image: '<svg viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="1"/><circle cx="6.5" cy="7" r="1.3"/><path d="M3 14l4.5-4 3 2.5 2.5-2 3 3"/></svg>',
  changed: '<svg viewBox="0 0 18 18"><path d="M3 15l1-4 8-8 3 3-8 8z"/><path d="M10.5 4.5l3 3"/></svg>',
  start: '<svg viewBox="0 0 18 18"><path d="M4 3v12"/><path d="M14 4L7 9l7 5z"/></svg>',
  dot: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="2"/></svg>'
};
// A named step's icon, by what its name starts with (the tools name their steps: Fillet 6 mm, Opened shelf.454.json).
var HIST_NAME_ICON = [['Opened', 'load'], ['New drawing', 'neu'], ['Recovered', 'recover'], ['Import', 'import'], ['Paste', 'copy'],
  ['Duplicate', 'copy'], ['Align', 'aLeft'], ['Space evenly', 'aDistH'], ['Flip', 'flipH'], ['Nest', 'nest'], ['Trace image', 'image'],
  ['Text on curve', 'textCurve'], ['Inlay wizard', 'toolpath'], ['Make editable', 'toolpath'], ['Template', 'toolpath'], ['Fix shapes', 'node'],
  ['Fillet corners', 'filletall'], ['Dog-bone corners', 'filletall'], ['T-bone corners', 'filletall'], ['Fillet', 'fillet'], ['Dog-bone', 'fillet'],
  ['T-bone', 'fillet'], ['Weld', 'weld'], ['Subtract', 'subtract'], ['Intersect', 'intersect'], ['Join', 'join'], ['Explode', 'expl'],
  ['Mirror', 'mirror'], ['Offset', 'offs'], ['Move point', 'node'], ['Move', 'move'], ['Resize', 'resize'], ['Scale', 'resize'],
  ['Stretch', 'resize'], ['Rotate', 'rotate'], ['Trim', 'trim'], ['Extend', 'extend']];
function histNameIcon(name){
  for (var i = 0; i < HIST_NAME_ICON.length; i++) if (name.indexOf(HIST_NAME_ICON[i][0]) === 0) return HIST_NAME_ICON[i][1];
  return null;
}
function histIconSvg(key){ return HIST_ICON[key] || (typeof ICON !== 'undefined' && ICON[key]) || HIST_ICON.changed; }

/* ---- the whole line of steps: s, the drawings (s[i] before step i, s[i + 1] after it); steps, each step's record
   ({name, at, kind, recipe, orig, failed}); n, how many are done (s[n] is the drawing as it is) */
function histLine(){
  var s = [], steps = [];
  UNDO.forEach(function (e) { s.push(e.p); steps.push(e); });
  s.push(histPack());
  histMadeFlush();
  for (var j = REDO.length - 1; j >= 0; j--){ s.push(REDO[j].p); steps.push(REDO[j]); }
  return {s: s, steps: steps, n: UNDO.length};
}
// The line back as undo's lists, and the drawing as the line has it now.
function histSetLine(L){
  UNDO = []; REDO = [];
  for (var i = 0; i < L.n; i++) UNDO.push(histMoved(L.steps[i], L.s[i]));
  for (var j = L.steps.length - 1; j >= L.n; j--) REDO.push(histMoved(L.steps[j], L.s[j + 1]));
  docRestore(histJoin(L.s[L.n]));
}

/* ---- the steps, in order, for the History bar: {name, at, kind, n, done, failed, i}; clicking one goes to n
   steps done */
function histSteps(){
  var L = histLine();
  return L.steps.map(function (e, i) {
    // a red step, or one waiting to be done again (its drawings out of date): named for what it did
    var o = (e.failed || (HIST_STALE_FROM !== null && i >= HIST_STALE_FROM)) && e.orig ? e.orig : {b: L.s[i], a: L.s[i + 1]};
    // unnamed: named by its recipe (a handle drag's, once it's moved), or for what it changed
    var op = e.recipe && typeof HIST_OPS !== 'undefined' && HIST_OPS[e.recipe.op];
    var named = e.name || (op && (e.recipe.op !== 'xform' || e.recipe.kind) ? op.name(e.recipe) : null);
    var auto = named ? null : histAuto(o.b, o.a);
    return {name: named || auto.name, icon: (named && histNameIcon(named)) || (auto && auto.icon) || 'changed', at: e.at, kind: e.kind, n: i + 1, done: i < L.n,
            failed: e.failed || null, i: i};
  });
}

/* ---- kept with the drawing: in its file, and in the browser's storage.
   {v: 1, pieces: [...], states: [...], extra: [...], steps: [{name, at, recipe, failed, orig}], at}: step i goes from
   states[i] to states[i + 1]; states[at] is the drawing as it is; a step's orig is two of extra (histReplay). Only
   this drawing's steps: from the last one that opened or started it. */
function histForKeeping(){
  var L = histLine(), first = 0;
  for (var i = L.n - 1; i >= 0; i--) if (L.steps[i].kind){ first = i + 1; break; }
  var last = L.steps.length;
  for (var j = L.n; j < L.steps.length; j++) if (L.steps[j].kind){ last = j; break; }
  if (last <= first) return null;
  var map = new Map(), pieces = [], extra = [];
  var put = function (x) { var n = map.get(x); if (n === undefined){ n = pieces.length; pieces.push(HIST_STR[x]); map.set(x, n); } return n; };
  var pack = function (p) { return p.map(function (x) { return x === -1 ? -1 : Array.isArray(x) ? x.map(put) : put(x); }); };
  var steps = L.steps.slice(first, last).map(function (e) {
    var o = {name: e.name, at: e.at, kind: null};
    if (e.recipe) o.recipe = e.recipe;
    if (e.failed) o.failed = e.failed;
    if (e.made && e.made.length) o.made = e.made;
    if (e.exprs) o.exprs = e.exprs;                           // lengths that follow parameters
    if (e.orig){ o.orig = [extra.length, extra.length + 1]; extra.push(pack(e.orig.b), pack(e.orig.a)); }
    return o;
  });
  var states = L.s.slice(first, last + 1).map(pack);           // (before the pieces are listed: it adds to them)
  var h = {v: 1, pieces: pieces.map(function (s) { return JSON.parse(s); }), states: states, extra: extra, steps: steps, at: L.n - first};
  // steps after a change made in the middle, not done again yet: from which (their drawings are out of date)
  if (HIST_STALE_FROM !== null && HIST_STALE_FROM < last) h.stale = Math.max(0, HIST_STALE_FROM - first);
  return h;
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
    var unpack = function (st) {
      if (!Array.isArray(st) || st.length !== HIST_KEYS.length) throw new Error('state');
      return st.map(function (x) {
        if (x === -1) return -1;
        if (Array.isArray(x)) return x.map(function (j) { if (ids[j] === undefined) throw new Error('piece'); return ids[j]; });
        if (ids[x] === undefined) throw new Error('piece');
        return ids[x];
      });
    };
    var p = h.states.map(unpack), extra = (Array.isArray(h.extra) ? h.extra : []).map(unpack);
  } catch (e) { return false; }
  var step = function (i) {
    var s = h.steps[i] || {}, o = {name: typeof s.name === 'string' ? s.name : null, at: +s.at || 0, kind: null};
    if (s.recipe && typeof s.recipe === 'object' && HIST_OPS[s.recipe.op]) o.recipe = s.recipe;
    if (typeof s.failed === 'string') o.failed = s.failed;
    if (Array.isArray(s.made) && s.made.every(function (id) { return typeof id === 'string'; })) o.made = s.made;
    if (s.exprs && typeof s.exprs === 'object'){
      var ex = {};
      Object.keys(s.exprs).forEach(function (k) { var x = s.exprs[k]; if (x && typeof x.e === 'string' && (x.u === 'mm' || x.u === 'in' || x.u === 'num')) ex[k] = {e: x.e, u: x.u}; });
      if (Object.keys(ex).length) o.exprs = ex;
    }
    if (Array.isArray(s.orig) && extra[s.orig[0]] && extra[s.orig[1]]) o.orig = {b: extra[s.orig[0]], a: extra[s.orig[1]]};
    return o;
  };
  var base = UNDO.length;
  for (var i = 0; i < h.at; i++){ var e = step(i); e.p = p[i]; UNDO.push(e); }
  if (histJoin(p[h.at]) !== docSnap()) UNDO.push({p: p[h.at], name: null, at: 0, kind: null});
  else {
    for (var j = h.states.length - 1; j > h.at; j--){ var r = step(j - 1); r.p = p[j]; REDO.push(r); }
    // steps waiting to be done again after a change made in the middle (only steps undone ever are)
    if (Number.isInteger(h.stale) && h.stale >= h.at && h.stale < h.steps.length) HIST_STALE_FROM = base + h.stale;
  }
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
var HIST_RENDER_T = null, HIST_CLICK = {i: -1, t: 0};
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
  fold.title = open ? 'History: hide the steps' : 'History: show the steps, every change, to go back to';
  var list = document.getElementById('histSteps'), note = document.getElementById('histNote');
  list.textContent = '';
  if (!open){ note.textContent = ''; return; }
  histTipHide();
  var steps = histSteps(), done = UNDO.length;
  // each step is its tool's icon; its name shows on hover, or when it has the keyboard's focus (histTip)
  var start = document.createElement('button');
  start.type = 'button'; start.className = 'hStep hStart' + (done === 0 ? ' now' : '');
  start.innerHTML = HIST_ICON.start;
  start.setAttribute('aria-label', 'Start');
  histTipOn(start, function () { return {name: 'Start', more: steps.length ? 'The drawing before the first step kept here.' : 'Every change you make shows here, to go back to.'}; });
  start.addEventListener('click', function () { histGoTo(0); });
  start.addEventListener('contextmenu', function (e) { e.preventDefault(); histMenu(e, null); });
  list.appendChild(start);
  steps.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hStep' + (s.done ? '' : ' undone') + (s.n === done ? ' now' : '') + (s.kind ? ' hDoc' : '') + (s.failed ? ' failed' : '');
    b.innerHTML = histIconSvg(s.icon);
    b.setAttribute('aria-label', s.name + (s.failed ? ' (skipped)' : ''));
    histTipOn(b, function () {
      return {name: s.name, when: s.at ? histWhen(s.at) : '', why: s.failed,
              more: (s.n === done ? 'The drawing is as it was just after it.' : 'Click to go back to just after it.') + (s.kind ? '' : ' Double-click to change it.')};
    });
    // A click goes there; a double-click (a second click on the same step soon after) changes it. Counted here, not
    // left to the browser: the first click redraws the bar, so the second lands on a new button.
    b.addEventListener('click', function () {
      var t = Date.now(), again = HIST_CLICK.i === s.i && t - HIST_CLICK.t < 500;
      HIST_CLICK = again ? {i: -1, t: 0} : {i: s.i, t: t};
      if (again){ histRender(); histEditOpen(s.i, histChip(s.i)); }
      else histGoTo(s.n);
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); histMenu(e, s); });
    b.dataset.n = s.n;
    list.appendChild(b);
  });
  // the marker, just after the step the drawing is at (or after Start)
  var chips = list.querySelectorAll('.hStep');
  var mark = histMarker(done, steps.length);
  if (chips[done] && chips[done].nextSibling) list.insertBefore(mark, chips[done].nextSibling); else list.appendChild(mark);
  var ahead = REDO.length;
  note.textContent = ahead ? 'Back ' + ahead + (ahead === 1 ? ' step. A change goes in here; the step after it is redone on top.' :
    ' steps. A change goes in here; the ' + ahead + ' after it are redone on top.') : '';
  var now = list.querySelector('.now');
  if (now && now.scrollIntoView) now.scrollIntoView({block: 'nearest', inline: 'center'});
}
// A step's button on the bar (by its place in the line)
function histChip(i){ return document.querySelectorAll('#histSteps .hStep')[i + 1] || null; }
// Right-click a step (s), or Start (null): go there, change it, delete it, or remove everything after the marker
function histMenu(e, s){
  var ahead = REDO.length, items = [];
  if (s){
    var L = histLine(), editable = !s.kind && typeof histEditInfo === 'function' && !!histEditInfo(L, s.i);
    items.push({label: 'Go to just after it', disabled: s.n === UNDO.length, fn: function () { histGoTo(s.n); }});
    items.push({label: 'Change…', disabled: !editable, fn: function () { histEditOpen(s.i, histChip(s.i)); }});
    items.push(null);
    items.push({label: 'Delete this step', danger: true, disabled: !!s.kind, fn: function () {
      var r = histDelete(s.i);
      if (typeof r === 'string'){ toast('warn', 'This step can’t be deleted', r); return; }
      Promise.resolve(r).then(function (failed) {
        toast(failed > 0 ? 'warn' : 'ok', 'Deleted “' + s.name + '”',
              (failed > 0 ? failed + (failed === 1 ? ' step after it needed it and is' : ' steps after it needed it and are') + ' red now, and skipped. ' : 'The steps after it were done again without it. ') +
              'Undo (Ctrl+Z) puts it back.');
      });
    }});
  } else items.push({label: 'Go to the start', disabled: UNDO.length === 0, fn: function () { histGoTo(0); }});
  if (ahead){
    items.push(null);
    items.push({label: 'Remove all ' + ahead + (ahead === 1 ? ' step' : ' steps') + ' after the marker', danger: true, fn: function () {
      var n = histDropAfter();
      toast('ok', 'Removed ' + n + (n === 1 ? ' step' : ' steps') + ' after the marker', 'Undo (Ctrl+Z) puts them back.');
    }});
  }
  ctxMenuOpen(e.clientX, e.clientY, items);
}
// The marker: drag it along the bar to go back or forward (it lands in the gap nearest the pointer, and the drawing goes
// there when it's let go), or give it the keyboard's focus and use the arrow keys, Home and End.
function histMarker(done, total){
  var m = document.createElement('div');
  m.className = 'hMark'; m.tabIndex = 0;
  m.setAttribute('role', 'slider'); m.setAttribute('aria-label', 'History marker: drag to go back or forward');
  m.setAttribute('aria-valuemin', '0'); m.setAttribute('aria-valuemax', String(total)); m.setAttribute('aria-valuenow', String(done));
  m.title = 'Drag to go back or forward through the steps (or use the arrow keys)';
  var list = function () { return document.getElementById('histSteps'); };
  // how many steps are before the pointer: the gap it's nearest, among the steps' middles
  var gapAt = function (x) {
    var chips = list().querySelectorAll('.hStep'), n = 0;
    for (var k = 1; k < chips.length; k++){ var r = chips[k].getBoundingClientRect(); if (x > r.left + r.width / 2) n = k; }
    return n;
  };
  var to = done;
  m.addEventListener('pointerdown', function (e) {
    e.preventDefault(); m.focus();
    if (m.setPointerCapture) m.setPointerCapture(e.pointerId);
    m.classList.add('drag'); histTipHide();
  });
  m.addEventListener('pointermove', function (e) {
    if (!m.classList.contains('drag')) return;
    var n = gapAt(e.clientX), chips = list().querySelectorAll('.hStep');
    if (n === to || !chips[n]) return;
    to = n;
    if (chips[n].nextSibling !== m) list().insertBefore(m, chips[n].nextSibling);   // shown where it'll go
    m.setAttribute('aria-valuenow', String(n));
  });
  var drop = function () {
    if (!m.classList.contains('drag')) return;
    m.classList.remove('drag');
    if (to !== UNDO.length) histGoTo(to);
  };
  m.addEventListener('pointerup', drop);
  m.addEventListener('pointercancel', drop);
  m.addEventListener('keydown', function (e) {
    var n = e.key === 'ArrowLeft' ? UNDO.length - 1 : e.key === 'ArrowRight' ? UNDO.length + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? total : null;
    if (n === null) return;
    e.preventDefault(); e.stopPropagation();
    n = Math.max(0, Math.min(total, n));
    if (n !== UNDO.length){ histGoTo(n); histRender(); var nm = document.querySelector('#histSteps .hMark'); if (nm) nm.focus(); }   // (drawn now, to keep the focus on it)
  });
  m.addEventListener('contextmenu', function (e) { e.preventDefault(); histMenu(e, null); });
  return m;
}
// The label over the History bar naming the step under the pointer (or with the keyboard's focus): shown at once,
// where a browser's own tooltip would wait.
function histTipOn(b, what){
  var show = function () {
    var tip = document.getElementById('histTip'), w = what();
    if (!tip) return;
    tip.textContent = '';
    var n = document.createElement('b'); n.textContent = w.name; tip.appendChild(n);
    if (w.when){ var t = document.createElement('span'); t.className = 'htWhen'; t.textContent = w.when; tip.appendChild(t); }
    if (w.why){ var y = document.createElement('span'); y.className = 'htWhy'; y.textContent = 'Skipped: ' + w.why; tip.appendChild(y); }
    if (w.more){ var m = document.createElement('span'); m.className = 'htMore'; m.textContent = w.more; tip.appendChild(m); }
    tip.hidden = false;
    var bar = document.getElementById('histBar'), list = document.getElementById('histSteps');
    var left = bar.offsetLeft + b.offsetLeft - list.scrollLeft;          // (a step's place is from the bar's edge)
    var room = bar.parentNode ? bar.parentNode.offsetWidth : 0;          // (kept inside the drawing's area)
    tip.style.left = Math.max(10, room ? Math.min(left, room - tip.offsetWidth - 10) : left) + 'px';
  };
  b.addEventListener('mouseenter', show);
  b.addEventListener('focus', show);
  b.addEventListener('mouseleave', histTipHide);
  b.addEventListener('blur', histTipHide);
}
function histTipHide(){ var tip = document.getElementById('histTip'); if (tip) tip.hidden = true; }
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
