/* ---------------- shapes kept lined up ----------------
   The Align buttons line shapes up once; change one afterwards and they come apart. With Keep lined up on
   (the chain button by them), Align also keeps them that way: a hole centred on a board stays centred when the
   board is made wider, by a dimension, a parameter, a step changed on the History bar, or a drag. Clint, 2026-10-23:
   "useful when needing to make sure things stay where they should when something changes".

   DOC.keeps lists them: {id, op, a, b}. a is the shape that moves (its id), b the one it follows (an id, or 'stock'
   for the material); op is the Align button's (ALIGN_OPS). After every change (persist), and after every step the
   History bar does again, each shape that follows is moved, without turning or resizing it, until it's in line
   again; or, kept the same size (Same width, Same height, Same size), resized about its centre. Concentric keeps
   circles' and arcs' own centres together (any other shape's, its box's). A shape follows at most one other in each
   direction (across, up and down, its width, its height), and never, through others, itself. A link whose
   shape is gone moves to a shape in the same place (Fillet corners and Trim remake shapes), or is removed, and said.
   While a shape that has a link is selected, the link is drawn; click its marker to stop keeping it. */
var KEEP_OPS = {
  center: {x: 'c', y: 'c'}, hcenter: {x: 'c'}, vcenter: {y: 'c'},
  left: {x: 'lo'}, right: {x: 'hi'}, top: {y: 'hi'}, bottom: {y: 'lo'},
  mat: {x: 'c', y: 'c'}, matx: {x: 'c'}, maty: {y: 'c'},
  conc: {x: 'p', y: 'p'}, sameW: {w: 1}, sameH: {h: 1}, same: {w: 1, h: 1}
};
var KEEP_AXES = ['x', 'y', 'w', 'h'];
function keepSizeOp(op){ return !!(KEEP_OPS[op] && (KEEP_OPS[op].w || KEEP_OPS[op].h)); }
var KEEP_NAMES = {
  center: 'centred on', hcenter: 'centred left-right on', vcenter: 'centred top-bottom on',
  left: 'with the left edge in line with', right: 'with the right edge in line with', top: 'with the top edge in line with', bottom: 'with the bottom edge in line with',
  mat: 'centred on', matx: 'centred left-right on', maty: 'centred top-bottom on',
  conc: 'concentric with', sameW: 'the same width as', sameH: 'the same height as', same: 'the same size as'
};
var KEEP_BOX = typeof WeakMap === 'function' ? new WeakMap() : null;   // where each link's two shapes were, to find them again
var KEEP_TOL = 0.01;                                                    // mm
var KEEP_HITS = [];                                                     // the markers drawn: {k, x, y} on screen
var KEEP_SAID = 0;

function keepsArr(){ if (!DOC.keeps) DOC.keeps = []; return DOC.keeps; }
function keepBox(id){
  if (id === 'stock') return stockRect();
  var e = entById(id);
  return e ? entBBox(e) : null;
}
function keepAt(b, how, axis){
  var lo = axis === 'x' ? b.x0 : b.y0, hi = axis === 'x' ? b.x1 : b.y1;
  return how === 'lo' ? lo : how === 'hi' ? hi : (lo + hi) / 2;
}
// A shape's own centre: a circle's or an arc's, or the middle of its box
function keepPointE(e){
  if (e.t === 'circle' || e.t === 'arc') return {x: e.cx, y: e.cy};
  var b = entBBox(e);
  return {x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2};
}
// How far shape A has to move to be in line with b (an id, or 'stock') again: {dx, dy}, or null if b isn't there
function keepDeltaE(op, A, b){
  var o = KEEP_OPS[op], fb = keepBox(b);
  if (!o || !A || !fb) return null;
  if (o.x === 'p'){
    var pa = keepPointE(A), pb = b === 'stock' ? {x: (fb.x0 + fb.x1) / 2, y: (fb.y0 + fb.y1) / 2} : keepPointE(entById(b));
    return {dx: pb.x - pa.x, dy: pb.y - pa.y};
  }
  var fa = entBBox(A);
  return {dx: o.x ? keepAt(fb, o.x, 'x') - keepAt(fa, o.x, 'x') : 0,
          dy: o.y ? keepAt(fb, o.y, 'y') - keepAt(fa, o.y, 'y') : 0};
}
// The size a shape gives one kept the same size as it: {w, h}. A circle's or an arc's is its diameter, both ways.
function keepSizeOf(e){
  if (e.t === 'circle' || e.t === 'arc') return {w: 2 * e.r, h: 2 * e.r};
  var b = entBBox(e);
  return {w: b.x1 - b.x0, h: b.y1 - b.y0};
}
// Why shape A can't be kept the same size as B: '' if it can. A rectangle can take any shape's width and height; a
// circle or an arc another's radius; a line another line's length. Other shapes aren't resized: their outlines would
// have to be stretched out of shape.
function keepSizeWhy(A, B){
  if (!A || !B) return 'cant';
  var round = function (e) { return e.t === 'circle' || e.t === 'arc'; };
  if (A.t === 'rect') return '';
  if (round(A)) return round(B) ? '' : 'kind';
  if (A.t === 'line') return B.t === 'line' ? '' : 'kind';
  return 'kind';
}
// Shape A resized to B's size, as op keeps it: a rectangle about its centre, a circle or an arc about its own, a line
// from its start. True if it changed.
function keepResizeE(op, A, B){
  if (keepSizeWhy(A, B)) return false;
  var o = KEEP_OPS[op], s = keepSizeOf(B), tol = 1e-9;
  if (A.t === 'rect'){
    var nw = o.w ? s.w : A.w, nh = o.h ? s.h : A.h;
    if (!(nw > 0) || !(nh > 0) || (Math.abs(nw - A.w) < tol && Math.abs(nh - A.h) < tol)) return false;
    A.x += (A.w - nw) / 2; A.y += (A.h - nh) / 2; A.w = nw; A.h = nh;
    return true;
  }
  if (A.t === 'circle' || A.t === 'arc'){
    if (!(B.r > 0) || Math.abs(A.r - B.r) < tol) return false;
    A.r = B.r; return true;
  }
  var L = Math.hypot(A.x2 - A.x1, A.y2 - A.y1), T = Math.hypot(B.x2 - B.x1, B.y2 - B.y1);
  if (L < 1e-9 || !(T > 0) || Math.abs(L - T) < tol) return false;
  A.x2 = A.x1 + (A.x2 - A.x1) / L * T; A.y2 = A.y1 + (A.y2 - A.y1) / L * T;
  return true;
}
// Shape A put right by op against b (an id, or 'stock'): moved into line, or resized. True if it changed.
function keepFixE(op, A, b){
  if (!A || !KEEP_OPS[op]) return false;
  if (keepSizeOp(op)) return b !== 'stock' && keepResizeE(op, A, entById(b));
  var d = keepDeltaE(op, A, b);
  if (!d || (Math.abs(d.dx) < 1e-9 && Math.abs(d.dy) < 1e-9)) return false;
  moveEntity(A, d.dx, d.dy);
  return true;
}
// The link that moves or sizes shape id in this direction ('x', 'y', 'w' or 'h'), or null
function keepOn(id, axis){
  var ks = DOC.keeps || [];
  for (var i = 0; i < ks.length; i++) if (ks[i].a === id && KEEP_OPS[ks[i].op] && KEEP_OPS[ks[i].op][axis]) return ks[i];
  return null;
}
// Would shape a following b in this direction make a follow itself, through b and the shapes b follows?
function keepLoop(a, b, axis){
  var cur = b, n = 0;
  while (cur && n++ < 1000){
    if (cur === a) return true;
    var k = keepOn(cur, axis);
    cur = k ? k.b : null;
  }
  return false;
}
// Why a can't be kept lined up with b: 'loop' (b follows a, through others), 'cant', or '' if it can
function keepCant(op, a, b){
  var o = KEEP_OPS[op];
  if (!o || !a || !b || a === b) return 'cant';
  if (keepSizeOp(op)){
    if (b === 'stock') return 'cant';
    var why = keepSizeWhy(entById(a), entById(b));
    if (why) return why;
  }
  return KEEP_AXES.some(function (ax) { return o[ax] && keepLoop(a, b, ax); }) ? 'loop' : '';
}
// Keep shape a lined up with b (an id, or 'stock'), as op lines them up: {ok} or {why}.
// A link a already had in the same direction is replaced: the newest says where it goes.
function keepAdd(op, a, b){
  var why = keepCant(op, a, b);
  if (why) return {why: why};
  var axes = KEEP_AXES.filter(function (ax) { return KEEP_OPS[op][ax]; });
  DOC.keeps = keepsArr().filter(function (k) {
    return !(k.a === a && axes.some(function (ax) { return KEEP_OPS[k.op] && KEEP_OPS[k.op][ax]; }));
  });
  DOC.keeps.push({id: 'k' + Math.random().toString(36).slice(2, 9), op: op, a: a, b: b});
  return {ok: true};
}
// The links a shape is in, either end
function keepsOf(id){ return (DOC.keeps || []).filter(function (k) { return k.a === id || k.b === id; }); }

// Every shape that follows another moved back in line, or to its size, a few times round for shapes that follow
// shapes that follow others. Sizes first in each round: a shape resized about its centre is then put back in line.
// Returns the links that changed their shape.
function keepsApply(){
  var ks = DOC.keeps || [], moved = [];
  if (!ks.length) return moved;
  var order = ks.filter(function (k) { return keepSizeOp(k.op); }).concat(ks.filter(function (k) { return !keepSizeOp(k.op); }));
  for (var pass = 0; pass < 10; pass++){
    var any = false;
    order.forEach(function (k) {
      if (!keepFixE(k.op, entById(k.a), k.b)) return;
      any = true;
      if (moved.indexOf(k) < 0) moved.push(k);
    });
    if (!any) break;
  }
  if (KEEP_BOX) ks.forEach(function (k) {
    var fa = keepBox(k.a), fb = k.b === 'stock' ? null : keepBox(k.b);
    if (fa && (fb || k.b === 'stock')) KEEP_BOX.set(k, {a: fa, b: fb});
  });
  return moved;
}
// A shape on this sheet whose box is where box was (a shape a tool remade in place), or null
function keepFindBox(box){
  if (!box) return null;
  var same = function (b) { return Math.abs(b.x0 - box.x0) < KEEP_TOL && Math.abs(b.y0 - box.y0) < KEEP_TOL &&
                                    Math.abs(b.x1 - box.x1) < KEEP_TOL && Math.abs(b.y1 - box.y1) < KEEP_TOL; };
  var found = DOC.ents.filter(function (e) { return entOnSheet(e) && !e.con && same(entBBox(e)); });
  return found.length === 1 ? found[0] : null;               // two in the same place: can't tell which
}
// Links onto shapes a tool remade, or removed when what they link is gone. Returns how many were removed.
function keepsFollow(){
  if (!DOC.keeps || !DOC.keeps.length) return 0;
  var gone = 0;
  DOC.keeps = DOC.keeps.filter(function (k) {
    var was = KEEP_BOX && KEEP_BOX.get(k);
    ['a', 'b'].forEach(function (end) {
      if (k[end] === 'stock' || entById(k[end])) return;
      var e = was && keepFindBox(was[end]);
      if (e) k[end] = entId(e);
    });
    if (k.a !== k.b && entById(k.a) && (k.b === 'stock' || entById(k.b))) return true;
    gone++; return false;
  });
  return gone;
}
// After every change (persist): links followed, and shapes put back in line
function keepsRun(){
  var gone = keepsFollow(), moved = keepsApply();
  if (gone) toast('info', gone === 1 ? 'A shape is no longer kept lined up' : gone + ' shapes are no longer kept lined up',
                  'A shape ' + (gone === 1 ? 'it was' : 'they were') + ' lined up with is no longer in the drawing. Undo brings it back.');
  // a selected shape put back where it was kept, as it was moved on its own: say why, now and then
  var back = moved.filter(function (k) {
    var a = entById(k.a), b = k.b === 'stock' ? null : entById(k.b);
    return a && SEL.indexOf(DOC.ents.indexOf(a)) >= 0 && !(b && SEL.indexOf(DOC.ents.indexOf(b)) >= 0);
  });
  if (back.length && Date.now() - KEEP_SAID > 20000){
    KEEP_SAID = Date.now();
    toast('info', 'Kept lined up', 'The ' + histLower(histShapeName(entById(back[0].a))) + ' is kept ' + KEEP_NAMES[back[0].op] + ' ' +
          keepName(back[0].b) + ', so it stays in line. To move it freely, click the link marker beside it and choose Stop keeping lined up.');
  }
}
function keepName(id){ return id === 'stock' ? 'the material' : 'the ' + histLower(histShapeName(entById(id))); }
// For the History bar: the links as a step leaves them (none: not kept at all)
function keepsForHist(){ return DOC.keeps && DOC.keeps.length ? DOC.keeps : undefined; }
// A step the History bar did again: its shapes put back in line, as they were when it was first done
// (and construction lines put back on the points they were drawn from, line-attach.js)
function keepsAfterStep(p){
  var K = HIST_KEYS.indexOf('keeps'), E = HIST_KEYS.indexOf('ents');
  var keeps = Array.isArray(p[K]) && p[K].length;
  var lines = Array.isArray(p[E]) && p[E].some(function (j) { return /"a[12]":/.test(HIST_STR[j]); });
  if (!keeps && !lines) return p;
  histLoad(p);
  var moved = keeps ? keepsApply().length : 0;
  if (lines) moved += linesFollow();
  return moved ? histPack() : p;
}

/* ---- seen and undone: drawn while a shape in one is selected; its marker clicked to stop keeping it */
// Where a link is drawn, on screen: from a point on the shape that follows (f) to the one it follows (t): along the
// line they share, to the middle of the shape followed, as both are kept on it
function keepEnds(k){
  var op = KEEP_OPS[k.op], fa = keepBox(k.a), fb = keepBox(k.b);
  if (!op || !fa || !fb) return null;
  var f = {x: op.x ? keepAt(fa, op.x, 'x') : (fa.x0 + fa.x1) / 2, y: op.y ? keepAt(fa, op.y, 'y') : (fa.y0 + fa.y1) / 2};
  var t = {x: op.x ? keepAt(fb, op.x, 'x') : (fb.x0 + fb.x1) / 2, y: op.y ? keepAt(fb, op.y, 'y') : (fb.y0 + fb.y1) / 2};
  if (op.x === 'p'){ f = keepPointE(entById(k.a)); t = f; }      // concentric: a cross on the centre they share
  return {f: w2s(f.x, f.y), t: w2s(t.x, t.y), fa: fa, fb: k.b === 'stock' ? null : fb};
}
function keepsShown(){
  if (!DOC.keeps || !DOC.keeps.length || !SEL.length) return [];
  var ids = SEL.map(function (i) { return DOC.ents[i] && DOC.ents[i]._id; });
  return DOC.keeps.filter(function (k) { return ids.indexOf(k.a) >= 0 || ids.indexOf(k.b) >= 0; });
}
// Each link: a dashed line from the shape that follows to the one it follows (a cross where they're centred on each
// other), the one it follows outlined, and a marker (a chain link) off the top right of the shape that follows
function keepsDraw(ctx){
  KEEP_HITS = [];
  var shown = keepsShown(), per = {};
  if (!shown.length) return;
  ctx.save();
  shown.forEach(function (k) {
    var en = keepEnds(k);
    if (!en) return;
    ctx.strokeStyle = THEME.accentLight; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(en.f.x, en.f.y); ctx.lineTo(en.t.x, en.t.y); ctx.stroke();
    if (en.fb){
      var b0 = w2s(en.fb.x0, en.fb.y1), b1 = w2s(en.fb.x1, en.fb.y0);
      ctx.globalAlpha = 0.7; ctx.strokeRect(b0.x - 3, b0.y - 3, b1.x - b0.x + 6, b1.y - b0.y + 6); ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);
    if (Math.hypot(en.f.x - en.t.x, en.f.y - en.t.y) < 1){
      ctx.beginPath(); ctx.moveTo(en.t.x - 6, en.t.y); ctx.lineTo(en.t.x + 6, en.t.y); ctx.moveTo(en.t.x, en.t.y - 6); ctx.lineTo(en.t.x, en.t.y + 6); ctx.stroke();
    }
    var n = per[k.a] = (per[k.a] || 0) + 1, c = w2s(en.fa.x1, en.fa.y1);
    var mx = c.x + 16 + (n - 1) * 22, my = c.y - 16;
    ctx.fillStyle = 'rgba(20,24,29,0.9)';
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.4;
    [[-2.2, 2.2], [2.2, -2.2]].forEach(function (o) {
      ctx.save(); ctx.translate(mx + o[0], my + o[1]); ctx.rotate(-Math.PI / 4);
      ctx.beginPath(); ctx.rect(-3.2, -1.8, 6.4, 3.6); ctx.stroke(); ctx.restore();
    });
    ctx.lineWidth = 1;
    KEEP_HITS.push({k: k, x: mx, y: my});
  });
  ctx.restore();
}
// The link whose marker is at this point on screen, or null
function keepHitAt(sx, sy){
  for (var i = KEEP_HITS.length - 1; i >= 0; i--)
    if (Math.hypot(sx - KEEP_HITS[i].x, sy - KEEP_HITS[i].y) <= 10) return KEEP_HITS[i].k;
  return null;
}
function keepRemove(k){
  if (!DOC.keeps || DOC.keeps.indexOf(k) < 0) return false;
  pushUndo('Stop keeping lined up');
  DOC.keeps = DOC.keeps.filter(function (x) { return x !== k; });
  persist(); draw();
  return true;
}
function keepMenu(k, cx, cy){
  var a = entById(k.a);
  ctxMenuOpen(cx, cy, [
    {label: 'The ' + histLower(histShapeName(a)) + ' is kept ' + KEEP_NAMES[k.op] + ' ' + keepName(k.b), disabled: true, fn: function () {}},
    null,
    {label: 'Stop keeping lined up', danger: true, fn: function () {
      if (keepRemove(k)) toast('ok', 'No longer kept lined up', 'The shapes stay where they are, and move separately from now on. Undo brings the link back.');
    }}
  ]);
}

/* ---- the Keep lined up button */
function keepMode(){ return !!UICFG.alignKeep; }
function keepBtnSync(){
  var b = document.getElementById('alKeep');
  if (b){ b.classList.toggle('active', keepMode()); b.setAttribute('aria-pressed', keepMode() ? 'true' : 'false'); }
}
function keepToggle(){
  UICFG.alignKeep = !keepMode(); uiCfgSave();
  keepBtnSync();
  toast('info', keepMode() ? 'Keep lined up is on' : 'Keep lined up is off',
        keepMode() ? 'The Align buttons, Concentric and Same size now keep shapes that way: change or move the last one picked (or the material) and the others follow. Space evenly isn’t kept.'
                  : 'The Align buttons line shapes up once. Links already made are kept; click a link’s marker to stop keeping it.');
}

/* ---- Concentric, Same width, Same height, Same size: buttons beside Align's. The other shapes are put right against
   the last one picked, which stays as it is, and kept that way while Keep lined up is on. */
var KEEP_SHAPE_OPS = {conc: 'Concentric', sameW: 'Same width', sameH: 'Same height', same: 'Same size'};
// {moved, kept, loops, kinds}, or {err: 'two'}
function keepAlignShapes(op){
  if (SEL.length < 2) return {err: 'two'};
  var ents = SEL.map(function (i) { return DOC.ents[i]; }), B = ents[ents.length - 1], b = entId(B);
  var res = {moved: 0, kept: 0, loops: 0, kinds: 0}, change = [], keep = [];
  ents.slice(0, -1).forEach(function (A) {
    if (keepSizeOp(op) && keepSizeWhy(A, B)){ res.kinds++; return; }
    var a = entId(A);
    if (keepMode()){ if (keepCant(op, a, b)) res.loops++; else keep.push(a); }
    if (keepFixE(op, cloneEnt(A), b)) change.push(A);          // tried on a copy: a step only when something happens
  });
  res.moved = change.length; res.kept = keep.length;
  if (!change.length && !keep.length) return res;
  pushUndo(KEEP_SHAPE_OPS[op] + (keep.length ? ', kept' : ''));
  change.forEach(function (A) { keepFixE(op, A, b); });
  keep.forEach(function (a) { keepAdd(op, a, b); });
  persist();
  return res;
}
