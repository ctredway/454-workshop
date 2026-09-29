// stroke just the outline path of an entity (no fill), in the CURRENT ctx style
// Offset, with the same shape of panel: what to offset, how far, which way, with a preview.
var OFF = null;
function offOpen(){
  OFF = {objs: SEL.filter(function(i){ return DOC.ents[i]; }), dist: UICFG.lastOffset || 5, flip:false};
  document.getElementById('offPanel').hidden = false;
  document.getElementById('offDist').value = fmtDisp(OFF.dist);
  offRender();
}
function offClose(){ OFF = null; document.getElementById('offPanel').hidden = true; draw(); }
function offResults(){
  if (!OFF || !OFF.objs.length || !(Math.abs(OFF.dist) > 1e-9)) return [];
  var d = OFF.flip ? -OFF.dist : OFF.dist, out = [];
  OFF.objs.forEach(function(i){
    var e = DOC.ents[i];
    if (!e || e.t === 'text') return;
    var ne = offsetEnt(e, d);
    if (ne){ if (e.tp) ne.tp = true; if (e.con) ne.con = true; out.push(ne); }
  });
  return out;
}
function offRender(){
  if (!OFF) return;
  document.getElementById('offObjsVal').textContent = OFF.objs.length ? OFF.objs.length + (OFF.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  document.getElementById('offObjs').setAttribute('aria-pressed', 'true');
  document.getElementById('offUnit').textContent = unitTag();
  document.getElementById('offDir').textContent = OFF.flip ? 'inward' : 'outward';
  var res = offResults();
  document.getElementById('offOk').disabled = !res.length;
  var texts = OFF.objs.filter(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'text'; }).length;
  document.getElementById('offHint').textContent = !OFF.objs.length
    ? 'Click shapes on the drawing to offset.'
    : (texts ? 'Text can\u2019t be offset \u2014 convert it to curves first. ' : '') +
      (res.length ? 'Direction flips which side the new shape goes.' : 'That distance doesn\u2019t leave a usable shape \u2014 try a smaller one.');
  SEL = OFF.objs.slice();
  draw();
}
function offApply(){
  var res = offResults();
  if (!res.length) return;
  pushUndo();
  var made = [];
  res.forEach(function(ne){ made.push(DOC.ents.length); DOC.ents.push(ne); });
  SEL = made;
  UICFG.lastOffset = OFF.dist; uiCfgSave();
  persist();
  toast('ok', 'Offset', made.length + (made.length === 1 ? ' shape' : ' shapes') + ' at ' + fmtDisp(OFF.dist) + ' ' + unitTag() + '.');
  offClose();
  setTool('select');
}
function offClick(w){
  var h = pickEntity(w);
  if (h === null) return;
  var at = OFF.objs.indexOf(h);
  if (at >= 0) OFF.objs.splice(at, 1); else OFF.objs.push(h);
  offRender();
}
// Mirror, the way Fusion does it: a panel with the things to mirror and the line to mirror
// about. The panel floats beside the drawing, so picking on the canvas keeps working.
var MIR = null;
function mirOpen(){
  MIR = {objs: SEL.filter(function(i){ return DOC.ents[i] && !(DOC.ents[i].t === 'line' && DOC.ents[i].con); }),
         line: null, slot: 'objs'};
  var pre = SEL.filter(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'line'; });   // a line already picked
  if (pre.length === 1 && MIR.objs.length) MIR.line = pre[0];
  if (MIR.objs.length) MIR.slot = MIR.line === null ? 'line' : 'objs';
  document.getElementById('mirPanel').hidden = false;
  mirRender();
}
function mirClose(){
  MIR = null;
  document.getElementById('mirPanel').hidden = true;
  draw();
}
function mirRender(){
  if (!MIR) return;
  var oV = document.getElementById('mirObjsVal'), lV = document.getElementById('mirLineVal');
  oV.textContent = MIR.objs.length ? MIR.objs.length + (MIR.objs.length === 1 ? ' shape' : ' shapes') : 'none';
  lV.textContent = MIR.line === null ? 'none' : (DOC.ents[MIR.line] && DOC.ents[MIR.line].con ? 'construction line' : 'line');
  document.getElementById('mirObjs').setAttribute('aria-pressed', MIR.slot === 'objs' ? 'true' : 'false');
  document.getElementById('mirLine').setAttribute('aria-pressed', MIR.slot === 'line' ? 'true' : 'false');
  document.getElementById('mirHint').textContent = MIR.slot === 'objs'
    ? (MIR.line === null
        ? 'Click the shapes to mirror, then click a construction line for the axis (or use the Mirror line field).'
        : 'Click shapes on the drawing to add or remove them.')
    : 'Click the line to mirror about \u2014 a construction line (X) is the usual choice.';
  document.getElementById('mirOk').disabled = !(MIR.objs.length && MIR.line !== null);
  SEL = MIR.objs.slice();                            // selected shapes stay highlighted as usual
  draw();
}
function mirAxis(){
  var e = MIR && MIR.line !== null ? DOC.ents[MIR.line] : null;
  if (!e || e.t !== 'line') return null;
  var vx = e.x2 - e.x1, vy = e.y2 - e.y1, L = Math.hypot(vx, vy);
  return L < 1e-9 ? null : {x:e.x1, y:e.y1, ux:vx/L, uy:vy/L};
}
function mirApply(){
  var ax = mirAxis();
  if (!MIR || !MIR.objs.length || !ax) return;
  pushUndo();
  var made = [];
  MIR.objs.forEach(function(i){
    var c = cloneEnt(DOC.ents[i]);
    mirrorEnt(c, ax.x, ax.y, ax.ux, ax.uy);
    made.push(DOC.ents.length);
    DOC.ents.push(c);
  });
  SEL = made;
  persist();
  toast('ok', 'Mirrored', made.length + (made.length === 1 ? ' copy' : ' copies') + ' made. The originals and the mirror line are untouched.');
  mirClose();
  setTool('select');
}
function mirClick(w){                                 // a canvas click while the panel is open
  var h = pickEntity(w);
  if (h === null) return;
  var e = DOC.ents[h];
  // A construction line is an axis, not a thing to mirror: take it as the mirror line whichever
  // field is active. Without this, clicking it just adds it to Objects and nothing can happen.
  if (MIR.line === null && e && e.t === 'line' && e.con){
    MIR.line = h;
    MIR.objs = MIR.objs.filter(function(i){ return i !== h; });
    MIR.slot = 'objs';
    mirRender();
    return;
  }
  if (MIR.slot === 'objs'){
    if (h === MIR.line){ toast('info', 'That is the mirror line', 'Pick a different shape, or change the mirror line first.'); return; }
    if (e && e.t === 'line' && MIR.line === null)
      toast('info', 'Using that line as the axis?', 'Click the Mirror line field first, then click the line. Construction lines (X) are taken as the axis automatically.');
    var at = MIR.objs.indexOf(h);
    if (at >= 0) MIR.objs.splice(at, 1); else MIR.objs.push(h);
  } else {
    if (DOC.ents[h].t !== 'line'){ toast('info', 'Pick a line', 'The mirror line has to be a line. A construction line (X) is the usual choice.'); return; }
    MIR.line = h;
    MIR.objs = MIR.objs.filter(function(i){ return i !== h; });
    if (!MIR.objs.length) MIR.slot = 'objs';
  }
  mirRender();
}
