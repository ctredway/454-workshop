/* ============================================================
   TOOL MANAGER  (state machine)
   One place owns the active tool and every transition. Tools declare a
   descriptor; the manager drives enter/exit/hover/click/text uniformly so
   state (focus, prompt, DRAW, selection) can never leak between tools.
   ============================================================ */
var TOOLS = {
  // kind: 'create' (draws new geometry), 'edit' (acts on existing, gives check/X hover),
  //       'transform' (acts on a selection), 'select'
  select:{kind:'select', prompt:null, keepSel:true},
  line:  {kind:'create', prompt:'line0'},
  text:  {kind:'create', prompt:'text0'},
  measure:{kind:'create', prompt:'measure0'},
  rect:  {kind:'create', prompt:'rect0'},
  circle:{kind:'create', prompt:'circle0'},
  ellipse:{kind:'create', prompt:'ellipse0'},
  polygon:{kind:'create', prompt:'polygon0'},
  star:  {kind:'create', prompt:'star0'},
  poly:  {kind:'create', prompt:'poly0'},
  arc:   {kind:'create', prompt:'arc0'},
  guide: {kind:'create', prompt:'guide0'},
  fillet:{kind:'edit',   prompt:'fillet0', hover:hoverFillet},
  trim:  {kind:'edit',   prompt:'trim0',   hover:hoverTrim},
  extend:{kind:'edit',   prompt:'extend0', hover:hoverExtend},
  node:  {kind:'edit',   prompt:'node0',   hover:hoverNode},
  dim:   {kind:'edit',   prompt:'dim0',    hover:hoverDim},
  offset:{kind:'transform', prompt:'offset0', keepSel:true},
  copy:  {kind:'transform', prompt:'copy0',   keepSel:true},
  mirror:{kind:'transform', prompt:'mirror0', keepSel:true, letters:'hv'},
  rotate:{kind:'transform', prompt:'rotate0', keepSel:true},
  array: {kind:'transform', prompt:'array0',  keepSel:true}
};
// HOVER STATUS: each edit tool interrogates the geometry under the cursor and returns
// {action:'do'|'undo'|'none', hint?, preview?} so the cursor can show check / X / neutral,
// exactly like VCarve. These NEVER mutate — they only report what a click would do.
function hoverFillet(w){
  // is the cursor near a corner that can be filleted (or an already-filleted arc to remove)?
  var tol = 10/VIEW.scale;
  var uf = filletRemovable(w);
  if (uf) return {action:'unfillet', at:{x:uf.X.x, y:uf.X.y}, preview:[uf.A, [uf.X.x, uf.X.y], uf.B]};
  var pk = cornerPick(w);
  if (pk){
    var at = {x:pk.pe.pts[pk.vi][0], y:pk.pe.pts[pk.vi][1]};
    var ne = cornerResult(pk, UICFG.filletR, w);
    if (!ne) return {action:'none', at:at};
    var s0 = ne.pts[pk.vi], s1 = ne.pts[(pk.vi + 1) % ne.pts.length];  // the new corner span
    var prev = tessPath({t:'path', closed:false, pts:[[s0[0], s0[1], s0[2] || 0], [s1[0], s1[1], 0]]}, 0.05);
    return {action:'do', at:at, preview:prev};
  }
  if ((UICFG.filletType || 'round') !== 'round') return {action:'none'};
  // two-line corner?
  var near = [];
  DOC.ents.forEach(function(e2, i2){
    if (e2.t !== 'line' || !entOnSheet(e2)) return;
    var d = distToSeg(w.x, w.y, e2.x1, e2.y1, e2.x2, e2.y2);
    if (d < tol*1.6) near.push(d);
  });
  if (near.length >= 2) return {action:'do', hint:'fillet R'+UICFG.filletR};
  return {action:'none'};
}
function hoverTrim(w){
  var idx = pickEntity(w);
  if (idx === null) return {action:'none'};
  var e = DOC.ents[idx];
  if (e.t === 'group') return {action:'none', hint:'ungroup it first to trim it', at:{x:w.x, y:w.y}};
  if (e.t === 'line' || e.t === 'circle' || e.t === 'arc' || e.t === 'poly' || e.t === 'path' || e.t === 'rect'){
    var gone = trimPreview(w);
    if (!gone || !gone.length) return {action:'none', hint:'nothing crosses this to trim to', at:{x:w.x, y:w.y}};
    return {action:'do', hint:'trim', idx:idx, cut:gone};
  }
  return {action:'none'};
}
function hoverExtend(w){
  var idx = pickEntity(w);
  if (idx === null) return {action:'none'};
  var e = DOC.ents[idx];
  if (e.t === 'line' || e.t === 'arc'){
    var add = extendPreview(w);
    if (!add || !add.length) return {action:'none', hint:'nothing ahead to extend to', at:{x:w.x, y:w.y}};
    return {action:'do', hint:'extend', idx:idx, grow:add};
  }
  return {action:'none', hint:'extend needs a line or arc'};
}
var HOVER = null; // last computed hover status, for cursor feedback in draw()
// the Radius box in the prompt bar: shows the fillet radius in the drawing's units
function filletRShow(){
  var f = document.getElementById('filletR'), u = document.getElementById('filletRU');
  if (f && document.activeElement !== f) f.value = fmtDisp(UICFG.filletR);
  if (u) u.textContent = unitTag();
}
function refreshFilletTypes(){
  var ft = UICFG.filletType || 'round';
  var box = document.getElementById('filletTypes');
  if (!box || !box.querySelectorAll) return;
  box.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.ft === ft ? 'true' : 'false'); });
}
var DIMSEL = null; // index of the dimension under edit, if any
// Transform handles around the selection (Select tool). Click a selected shape again to switch
// between SCALE handles (corners proportional, sides one direction) and ROTATE handles.
var HANDLES = {mode:'scale', pivot:null, sig:'', active:false};   // active: shown after a double-click
function selSig(){ return SEL.slice().sort(function(a,b){ return a-b; }).join(','); }
function selHandleBox(){
  var b = selBBox();
  if (!b) return null;
  var tl = w2s(b.x0, b.y1), br = w2s(b.x1, b.y0), pad = 6;
  return {b:b, L:tl.x - pad, T:tl.y - pad, R:br.x + pad, B:br.y + pad};
}
function selHandleList(){
  var hb = selHandleBox();
  if (!hb) return [];
  var b = hb.b, mx = (hb.L + hb.R) / 2, my = (hb.T + hb.B) / 2;
  if (HANDLES.mode === 'rotate'){
    var pv = HANDLES.pivot || {x:(b.x0+b.x1)/2, y:(b.y0+b.y1)/2}, ps = w2s(pv.x, pv.y), o = 10;
    return [
      {kind:'rot', sx:hb.L-o, sy:hb.B+o, cur:'grab'}, {kind:'rot', sx:hb.R+o, sy:hb.B+o, cur:'grab'},
      {kind:'rot', sx:hb.R+o, sy:hb.T-o, cur:'grab'}, {kind:'rot', sx:hb.L-o, sy:hb.T-o, cur:'grab'},
      {kind:'pivot', sx:ps.x, sy:ps.y, cur:'move'}
    ];
  }
  return [   // w* = the handle's own world position, a* = the opposite side that stays put
    {kind:'corner', sx:hb.L, sy:hb.B, wx:b.x0, wy:b.y0, ax:b.x1, ay:b.y1, cur:'nesw-resize'},
    {kind:'corner', sx:hb.R, sy:hb.B, wx:b.x1, wy:b.y0, ax:b.x0, ay:b.y1, cur:'nwse-resize'},
    {kind:'corner', sx:hb.R, sy:hb.T, wx:b.x1, wy:b.y1, ax:b.x0, ay:b.y0, cur:'nesw-resize'},
    {kind:'corner', sx:hb.L, sy:hb.T, wx:b.x0, wy:b.y1, ax:b.x1, ay:b.y0, cur:'nwse-resize'},
    {kind:'y', sx:mx, sy:hb.B, wy:b.y0, ay:b.y1, cur:'ns-resize'},
    {kind:'y', sx:mx, sy:hb.T, wy:b.y1, ay:b.y0, cur:'ns-resize'},
    {kind:'x', sx:hb.L, sy:my, wx:b.x0, ax:b.x1, cur:'ew-resize'},
    {kind:'x', sx:hb.R, sy:my, wx:b.x1, ax:b.x0, cur:'ew-resize'}
  ];
}
function handleAt(mx, my){
  if (TOOL !== 'select' || !SEL.length || !HANDLES.active) return null;
  var hs = selHandleList();
  for (var i = hs.length - 1; i >= 0; i--)                 // pivot is last, so it wins ties
    if (Math.hypot(mx - hs[i].sx, my - hs[i].sy) <= 9) return hs[i];
  return null;
}
function snapJSON(e){
  return JSON.stringify(e, function(k, v){ return (k === '_tess' || k === '_tess2') ? undefined : v; });
}
function restoreInto(obj, json){        // put an entity back to a saved state without replacing the object
  var src = JSON.parse(json);
  Object.keys(obj).forEach(function(k){ delete obj[k]; });
  Object.assign(obj, src);
}
// re-apply the whole transform from the ORIGINAL shapes each frame, so nothing accumulates
function xformApply(D, w, alt, shift){
  SEL.forEach(function(si, k){ restoreInto(DOC.ents[si], D.snaps[k]); });
  var h = D.h, b = D.b0;
  if (h.kind === 'pivot'){ HANDLES.pivot = {x:w.x, y:w.y}; return; }
  function undoOnce(){ if (!D.pushed){ pushUndo(); D.pushed = true; } }
  if (h.kind === 'rot'){
    var pv = D.pivot;
    var a = Math.atan2(w.y - pv.y, w.x - pv.x) - Math.atan2(D.start.y - pv.y, D.start.x - pv.x);
    if (shift){ var step = Math.PI / 12; a = Math.round(a / step) * step; }       // 15 degree steps
    D.ang = a;
    if (Math.abs(a) < 1e-12) return;
    undoOnce();
    SEL.forEach(function(si){ rotateEnt(DOC.ents[si], pv.x, pv.y, a); });
    return;
  }
  var ox = (b.x0 + b.x1) / 2, oy = (b.y0 + b.y1) / 2;             // Alt: scale about the centre
  if (!alt){ if (h.ax !== undefined) ox = h.ax; if (h.ay !== undefined) oy = h.ay; }
  function ratio(pv2, hv, ov){ var den = hv - ov; return Math.abs(den) < 1e-9 ? 1 : (pv2 - ov) / den; }
  var sx = 1, sy = 1;
  if (h.kind === 'x') sx = ratio(w.x, h.wx, ox);
  else if (h.kind === 'y') sy = ratio(w.y, h.wy, oy);
  else if (shift){ sx = ratio(w.x, h.wx, ox); sy = ratio(w.y, h.wy, oy); }          // Shift: free stretch
  else {                                                                             // proportional
    var vx = h.wx - ox, vy = h.wy - oy, L2 = vx*vx + vy*vy;
    sx = sy = L2 > 1e-18 ? ((w.x - ox) * vx + (w.y - oy) * vy) / L2 : 1;
  }
  sx = Math.max(0.001, sx); sy = Math.max(0.001, sy);
  D.sx = sx; D.sy = sy;
  if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return;
  undoOnce();
  SCALE_NOTE = null;
  SEL.forEach(function(si){ scaleEnt(DOC.ents[si], ox, oy, sx, sy); });
  if (SCALE_NOTE) D.note = SCALE_NOTE;
}
var NODE = null;  // {ent:index, drag:vertexIndex|null} while the node tool has a shape open
function nodePtsOf(e){
  // uniform [x,y,bulge] view of an editable entity, or null
  if (!e) return null;
  if (e.t === 'poly') return e.pts.map(function(q){ return [q[0], q[1], 0]; });
  if (e.t === 'path') return e.pts.map(function(q){ return [q[0], q[1], q[2]||0]; });
  return null;
}
function hoverDim(w){
  // hovering an existing dimension label?
  if (UICFG.showDims && DOC.dims){
    var sp = w2s(w.x, w.y);
    for (var i = 0; i < DOC.dims.length; i++){
      var h = DOC.dims[i]._hit;
      if (h && Math.abs(sp.x-h.x) < h.w/2 && Math.abs(sp.y-h.y) < h.h/2)
        return {action:'do', hint:'edit this dimension'};
    }
  }
  var idx = pickEntity(w);
  if (idx === null) return {action:'none'};
  return {action:'do', hint: DRAW && DRAW.stage === 'dimPick2' ? 'second shape' : 'dimension this', idx:idx};
}
function hoverNode(w){
  if (NODE && DOC.ents[NODE.ent]){
    var pts = nodePtsOf(DOC.ents[NODE.ent]);
    if (pts){
      var tolv = 8/VIEW.scale;
      for (var i = 0; i < pts.length; i++)
        if (Math.hypot(w.x-pts[i][0], w.y-pts[i][1]) < tolv)
          return {action:'do', hint:'point ' + (i+1), at:{x:pts[i][0], y:pts[i][1]}};
      return {action:'do', hint:'segment'};
    }
  }
  var idx = pickEntity(w);
  if (idx === null) return {action:'none'};
  var e = DOC.ents[idx];
  if (e.t === 'poly' || e.t === 'path') return {action:'do', hint:'edit points', idx:idx};
  return {action:'none', hint:'node editing works on polylines and paths'};
}
var doGroupSelectionRef = function(){}, doUngroupSelectionRef = function(){};
function flipBtnRef(horizontal){
  if (!SEL.length){ toast('info', 'Select something first', 'Flip mirrors the selected shapes in place. Select them, then flip.'); return; }
  if (flipSelection(horizontal)) draw();
}
function curvesBtnClick(){
  var n = convertTextsToCurves(SEL.slice());
  if (n) toast('ok', 'Converted to curves', n + ' text object' + (n>1?'s are':' is') + ' now ordinary shapes, grouped per text. They can be trimmed, offset and cut, but not edited as text.');
  else if (!SEL.some(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'text'; }))
    toast('info', 'Select text first', 'Convert to curves turns selected text into shapes. Select one or more text objects, then press it.');
}
// Single source of truth for tool hotkeys — both the canvas handler and the entry field use this.
// Keys follow Autodesk Fusion where Fusion has one: L line, R rectangle, C circle, T trim,
// O offset, I measure, D dimension, X construction, F fillet, M move/copy. S is deliberately
// left free (Fusion uses it for its command search). Tools Fusion has no key for keep ours,
// with Shift+M mirror and Shift+R rotate sitting beside their unshifted partners.
var TOOL_HOTKEYS = {v:'select', l:'line', r:'rect', c:'circle', p:'poly', a:'arc', g:'guide',
                    f:'fillet', t:'trim', e:'extend', m:'copy', o:'offset', d:'dim',
                    i:'measure', n:'node', y:'array', k:'text'};
var SHIFT_HOTKEYS = {m:'mirror', r:'rotate'};
// Is a typed letter a TOOL HOTKEY, or DATA for the active tool? Letters are data while an operation
// is in progress (D5 diameter, R2.5 radius, E5 edge distance) and when the idle tool itself takes
// letters (mirror's H / V / HH / VV). Otherwise a hotkey letter switches tools on the first press.
function letterIsHotkey(k, fieldVal){
  if (!TOOL_HOTKEYS[k]) return false;
  if (TOOL === 'select') return true;
  if (DRAW !== null) return false;                                   // mid-operation: data
  var desc = TOOLS[TOOL];
  if (desc && desc.letters && desc.letters.indexOf(k) >= 0) return false;
  if (TOOL === 'fillet') return true;                                // radius already armed live
  return !/[0-9.\-@<,]/.test(fieldVal || '');                        // don't break a half-typed value
}

function toolMgrEnter(t){
  var desc = TOOLS[t] || TOOLS.select;
  // clean slate: no leftover in-progress geometry, no stolen focus, field cleared
  DRAW = null;
  if (t !== 'mirror' && MIR) mirClose();
  if (t !== 'offset' && OFF) offClose();
  if (t !== 'node') NODE = null;
  HANDLES.active = false;
  MEAS = null;
  var ftBox = document.getElementById('filletTypes');
  if (ftBox){ ftBox.hidden = t !== 'fillet'; refreshFilletTypes(); }
  var frBox = document.getElementById('filletRBox');
  if (frBox){ frBox.hidden = t !== 'fillet'; if (t === 'fillet') filletRShow(); }
  var pinEl = document.getElementById('promptIn');
  if (pinEl){ pinEl.value = ''; pinEl.blur(); }
  hidePrompt();
  // selection policy: create/select/edit tools drop selection; transforms keep it
  if (!desc.keepSel) SEL = [];
  HOVER = null;
  if (desc.prompt) stagePrompt(desc.prompt);
  if (t === 'mirror' && !MIR) mirOpen();            // the panel is the tool
  if (t === 'offset' && !OFF) offOpen();
  // reflect in the panel
  document.querySelectorAll('#toolPanel .tool[data-tool]').forEach(function(b){
    b.classList.toggle('active', b.dataset.tool === t);
  });
}
function toolMgrHover(w){
  var desc = TOOLS[TOOL];
  HOVER = (desc && desc.hover) ? desc.hover(w) : null;
}

function setTool(t){
  if (!TOOLS[t]) t = 'select';
  TOOL = t;
  toolMgrEnter(t);
  draw();
}
