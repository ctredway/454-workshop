/* ---------------- the Selection box: exact position, size and rotation ----------------
   While shapes are selected with Select, a small box at the top of the drawing shows where the selection is
   and how big, and takes typed values, as VCarve's Move, Set Size and Rotate forms do:
     the 3x3 grid picks the reference point: a corner, the middle of a side, or the centre. X and Y are where
       that point is; resizing and rotating keep it where it is.
     X, Y   move the selection so the reference point lands there.
     W, H   resize it; with the padlock closed, the other follows in proportion.
     Rotate turns it by that many degrees, anticlockwise (negative for clockwise), about the reference point.
   Enter (or leaving the box) applies a value, Esc puts it back. Each change is one undo step. Values are in
   the units the drawing is shown in. */
var SELBOX_ANCHORS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];

function selBoxAnchor(){ return SELBOX_ANCHORS.indexOf(UICFG.selAnchor) >= 0 ? UICFG.selAnchor : 'bl'; }
function selBoxLocked(){ return UICFG.selLock !== false; }
// The reference point of box b.
function selBoxPoint(b, a){
  a = a || selBoxAnchor();
  return {x: /l/.test(a) ? b.x0 : /r/.test(a) ? b.x1 : (b.x0 + b.x1) / 2,
          y: /^b/.test(a) ? b.y0 : /^t/.test(a) ? b.y1 : (b.y0 + b.y1) / 2};
}
function selBoxShown(){ return TOOL === 'select' && SEL.length > 0 && !(DRAW && (DRAW.stage === 'marq' || DRAW.stage === 'xform')); }
// Show the selection's numbers (except in the field being typed in).
function selBoxRefresh(){
  var box = document.getElementById('selBox');
  if (!box) return;
  var show = selBoxShown(), b = show ? selBBox() : null;
  box.hidden = !b;
  if (!b) return;
  var p = selBoxPoint(b), vals = {sbX:p.x, sbY:p.y, sbW:b.x1 - b.x0, sbH:b.y1 - b.y0};
  Object.keys(vals).forEach(function (id){
    var el = document.getElementById(id);
    if (document.activeElement !== el) el.value = fmtDisp(vals[id]);
  });
  var r = document.getElementById('sbR');
  if (document.activeElement !== r) r.value = '';
  document.getElementById('sbUnit').textContent = dispIn() ? 'in' : 'mm';
  Array.prototype.forEach.call(document.querySelectorAll('#sbAnchor button'), function (bt){
    bt.setAttribute('aria-pressed', bt.dataset.a === selBoxAnchor() ? 'true' : 'false');
  });
  var lk = document.getElementById('sbLock');
  lk.setAttribute('aria-pressed', selBoxLocked() ? 'true' : 'false');
  lk.title = selBoxLocked() ? 'Proportions kept: changing W changes H to match. Click to size them separately.'
                            : 'Width and height separately. Click to keep the proportions.';
}
// Apply a typed value. field: 'x', 'y', 'w', 'h' or 'r'. Returns false (and says why) if it can't.
function selBoxApply(field, txt){
  if (!SEL.length) return false;
  var b = selBBox();
  if (!b) return false;
  var v = field === 'r' ? parseFloat(String(txt).replace(/[°\s]/g, '')) : lenIn(txt);
  if (!isFinite(v)){ if (String(txt).trim() !== '') toast('warn', 'That isn’t a number', 'Type a number, such as 120 or 45.5.'); return false; }
  var p = selBoxPoint(b), w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (field === 'x' || field === 'y'){
    var dx = field === 'x' ? v - p.x : 0, dy = field === 'y' ? v - p.y : 0;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return true;
    pushUndo();
    SEL.forEach(function (i){ moveEntity(DOC.ents[i], dx, dy); });
  } else if (field === 'w' || field === 'h'){
    if (!(v > 0)){ toast('warn', 'Bigger than nothing', 'A size has to be more than 0.'); return false; }
    var cur = field === 'w' ? w : h, other = field === 'w' ? h : w;
    if (cur < 1e-9){
      toast('warn', 'It has no ' + (field === 'w' ? 'width' : 'height'), 'The selection is a straight ' + (field === 'w' ? 'up-and-down' : 'side-to-side') +
        ' line, so it can’t be stretched that way. Set its ' + (field === 'w' ? 'height' : 'width') + ' instead.');
      return false;
    }
    var k = v / cur, sx = field === 'w' ? k : 1, sy = field === 'h' ? k : 1;
    if (selBoxLocked() && other > 1e-9){ sx = k; sy = k; }
    if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return true;
    pushUndo();
    SCALE_NOTE = null;
    SEL.forEach(function (i){ scaleEnt(DOC.ents[i], p.x, p.y, sx, sy); });
    if (SCALE_NOTE === 'ellipse')
      toast('info', 'Circles became ellipses', 'Stretching one way turns circles and arcs into ellipses. Close the padlock to keep them round.');
    else if (SCALE_NOTE === 'text')
      toast('info', 'Angled text scaled evenly', 'Text at an angle can only be scaled evenly. Convert it to curves first to stretch it.');
  } else if (field === 'r'){
    if (Math.abs(v) < 1e-12) return true;
    pushUndo();
    SEL.forEach(function (i){ rotateEnt(DOC.ents[i], p.x, p.y, v * Math.PI / 180); });
  } else return false;
  HANDLES.pivot = null;
  persist(); draw();
  return true;
}
function selBoxWire(){
  var box = document.getElementById('selBox');
  if (!box) return;
  [['sbX', 'x'], ['sbY', 'y'], ['sbW', 'w'], ['sbH', 'h'], ['sbR', 'r']].forEach(function (pr){
    var el = document.getElementById(pr[0]), shown = '';
    el.addEventListener('focus', function (){ shown = el.value; if (el.select) el.select(); });
    function commit(){
      if (el.value === shown) return;
      shown = el.value;
      selBoxApply(pr[1], el.value);
      if (pr[1] === 'r') el.value = '';
      selBoxRefresh();
    }
    el.addEventListener('keydown', function (ev){
      if (ev.key === 'Enter'){ ev.preventDefault(); commit(); shown = el.value; if (el.select) el.select(); }
      else if (ev.key === 'Escape'){ ev.preventDefault(); el.value = shown; el.blur(); }
    });
    el.addEventListener('blur', function (){ commit(); selBoxRefresh(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#sbAnchor button'), function (bt){
    bt.addEventListener('click', function (){ UICFG.selAnchor = bt.dataset.a; uiCfgSave(); selBoxRefresh(); draw(); });
  });
  document.getElementById('sbLock').addEventListener('click', function (){
    UICFG.selLock = !selBoxLocked(); uiCfgSave(); selBoxRefresh();
  });
}
