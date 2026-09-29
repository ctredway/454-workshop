// ---- alignment (matches VCarve) ----
// mat*   : move the whole selection, as a block, within the material
// the rest: move every selected shape to line up with the LAST one picked, which stays put
// dist*  : space the shapes evenly, the two outermost staying put
var ALIGN_OPS = {
  mat:'Center in material', matx:'Center left-right in material', maty:'Center top-bottom in material',
  center:'Center on last picked', hcenter:'Line up centers left-right', vcenter:'Line up centers top-bottom',
  left:'Align left edges', right:'Align right edges', top:'Align top edges', bottom:'Align bottom edges',
  disth:'Space evenly left to right', distv:'Space evenly top to bottom'
};
function alignSelection(op){
  if (!SEL.length) return {err:'none'};
  function cx(b){ return (b.x0 + b.x1) / 2; }
  function cy(b){ return (b.y0 + b.y1) / 2; }
  var items = SEL.map(function(i){ return {i:i, b:entBBox(DOC.ents[i])}; });
  var moves = [];
  if (op === 'mat' || op === 'matx' || op === 'maty'){
    var sb = selBBox(), sr = stockRect();
    var dx = op === 'maty' ? 0 : cx(sr) - cx(sb), dy = op === 'matx' ? 0 : cy(sr) - cy(sb);
    items.forEach(function(it){ moves.push([it.i, dx, dy]); });
  }
  else if (op === 'disth' || op === 'distv'){
    if (items.length < 3) return {err:'three'};
    var hz = op === 'disth';
    items.sort(function(a, b){ return hz ? cx(a.b) - cx(b.b) : cy(a.b) - cy(b.b); });
    var first = items[0].b, last = items[items.length-1].b;
    var span = hz ? last.x1 - first.x0 : last.y1 - first.y0, total = 0;
    items.forEach(function(it){ total += hz ? it.b.x1 - it.b.x0 : it.b.y1 - it.b.y0; });
    var gap = (span - total) / (items.length - 1), cur = hz ? first.x0 : first.y0;
    items.forEach(function(it){
      var d = cur - (hz ? it.b.x0 : it.b.y0);
      moves.push(hz ? [it.i, d, 0] : [it.i, 0, d]);
      cur += (hz ? it.b.x1 - it.b.x0 : it.b.y1 - it.b.y0) + gap;
    });
  }
  else {
    if (items.length < 2) return {err:'two'};
    var a = items[items.length-1].b;                      // the anchor: last picked, never moves
    items.slice(0, -1).forEach(function(it){
      var b = it.b, mx = 0, my = 0;
      if (op === 'center'){ mx = cx(a) - cx(b); my = cy(a) - cy(b); }
      else if (op === 'hcenter') mx = cx(a) - cx(b);
      else if (op === 'vcenter') my = cy(a) - cy(b);
      else if (op === 'left')   mx = a.x0 - b.x0;
      else if (op === 'right')  mx = a.x1 - b.x1;
      else if (op === 'top')    my = a.y1 - b.y1;
      else if (op === 'bottom') my = a.y0 - b.y0;
      moves.push([it.i, mx, my]);
    });
  }
  var real = moves.filter(function(m){ return Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9; });
  if (!real.length) return {moved:0};
  pushUndo();
  real.forEach(function(m){ moveEntity(DOC.ents[m[0]], m[1], m[2]); });
  persist();
  return {moved:real.length};
}
function alignBtnClick(op){
  var r = alignSelection(op);
  if (r.err === 'none') toast('info', 'Select something first', 'Select the shapes to align, then choose an alignment.');
  else if (r.err === 'two') toast('info', 'Pick two or more', 'Shapes align to the LAST one you pick, which stays put. Select the shapes to move, then Shift-click the one to line them up with.');
  else if (r.err === 'three') toast('info', 'Pick three or more', 'Even spacing needs at least three shapes. The two outermost stay put and the rest are spaced between them.');
  draw();
}

// flip the selection in place about its own centre
// Flip the selection. Selecting a construction line along with the shapes is the natural way to
// say "mirror about this line", so that is what happens; otherwise the selection flips about its
// own middle.
function flipSelection(horizontal){
  if (!SEL.length) return false;
  var axisIdx = null, others = [];
  SEL.forEach(function(i){
    var e = DOC.ents[i];
    if (e && e.t === 'line' && e.con && axisIdx === null) axisIdx = i; else others.push(i);
  });
  if (axisIdx !== null && others.length){          // a line in the selection means "mirror about this"
    toast('info', 'Use Mirror for that', 'Flip turns the selection over where it stands. To mirror across that construction line, press Shift+M and pick the shapes and the line.');
    return false;
  }
  var b = selBBox();
  if (!b) return false;
  var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  var before = SEL.map(function(i){ return snapJSON(DOC.ents[i]); }).join('|');
  pushUndo();
  SEL.forEach(function(i){ mirrorEnt(DOC.ents[i], cx, cy, horizontal ? 0 : 1, horizontal ? 1 : 0); });
  var after = SEL.map(function(i){ return snapJSON(DOC.ents[i]); }).join('|');
  if (after === before)                                  // a symmetric shape flips onto itself
    toast('info', 'Nothing moved', 'The selection is symmetric about its own centre, so flipping it looks identical. To mirror it somewhere else, use Mirror (Shift+M) with a line, or select a construction line too.');
  persist();
  return true;
}

// run a transform over the selection; copy=true keeps originals and selects the new copies
function applySel(copy, fn){
  if (!SEL.length) return false;
  pushUndo();
  if (copy){
    var newIdx = [];
    SEL.forEach(function(i){
      var c = cloneEnt(DOC.ents[i]);
      fn(c);
      newIdx.push(DOC.ents.length);
      DOC.ents.push(c);
    });
    SEL = newIdx; // chainable: copy again moves from the new position
  } else {
    SEL.forEach(function(i){ fn(DOC.ents[i]); });
  }
  return true;
}

