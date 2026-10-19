// ---- the Inlay wizard ----
// Both halves of a V-carve inlay from the shapes chosen, in one go: the bit that carves it (a V-bit or a tapered
// ball nose) and the end mill that clears its floor are chosen first, then the depths, and Create makes:
//   the pocket, in the base: a clearing pocket and a V-carve on the shapes, grouped as "Inlay pocket";
//   the plug, in the inlay piece: a mirrored copy of the shapes inside a boundary, with its own clearing pocket and
//   V-carve from the start depth down, grouped as "Inlay plug", on a sheet of its own (each sheet is its own piece
//   of material and G-code file) unless that's unticked.
// All of it is one step to undo.
var INW = null;            // the open wizard: {ents, vbit, mill: the chosen tools' settings}
// What a library tool gives a toolpath (as the toolpath editor's cutUseTool does): its size, its shape for a
// V-bit or tapered ball nose, and its feeds and speeds for the material chosen.
function inwToolSettings(id){
  var t = id ? libTool(id) : null;
  if (!t) return null;
  var mm = t.units === 'in' ? 25.4 : 1, o = {toolId: id, name: t.name, dia: t.diameter ? +(t.diameter * mm).toFixed(3) : 0};
  if (t.angle > 0 && t.angle < 180) o.vAngle = t.angle;
  o.vBall = +t.type === 5 && t.tipRadius > 0;
  o.vTipR = o.vBall ? +(t.tipRadius * mm).toFixed(4) : 0;
  o.vTip = !o.vBall && t.flat > 0 ? +(t.flat * mm).toFixed(4) : 0;
  var cut = libCutFor(t, libDefaultMachine(), UICFG.libMaterial || null) || t.cuts.filter(function (c) { return c.machine === libDefaultMachine(); })[0] || t.cuts[0];
  if (cut){
    var rate = cut.rateUnits === 4 ? 25.4 : 1, len = cut.lengthUnits === 'in' ? 25.4 : 1;
    if (cut.feed) o.feed = Math.round(cut.feed * rate);
    if (cut.plunge) o.plunge = Math.round(cut.plunge * rate);
    if (cut.stepdown) o.step = +(cut.stepdown * len).toFixed(3);
    if (cut.stepover && o.dia > 0) o.stepoverPct = Math.max(5, Math.min(95, Math.round(cut.stepover * len / o.dia * 100)));
    if (cut.rpm) o.rpm = cut.rpm;
  }
  return o;
}
function inwOpen(ents){
  INW = {ents: (ents || []).slice(), vbit: INW ? INW.vbit : null, mill: INW ? INW.mill : null};
  // starting depths: 5, 2.5 and 5 mm, or in a drawing in inches, 0.2, 0.1 and 0.2 in (not 0.197 and 0.098)
  var last = UICFG.inlayWiz || {}, inch = dispIn(), dD = inch ? 5.08 : 5, dS = inch ? 2.54 : 2.5;
  if (!INW.vbit && last.vbit && libTool(last.vbit)) INW.vbit = inwToolSettings(last.vbit);
  if (!INW.mill && last.mill && libTool(last.mill)) INW.mill = inwToolSettings(last.mill);
  document.getElementById('inwD').value = fmtDisp(last.D > 0 ? last.D : dD);
  document.getElementById('inwS').value = fmtDisp(last.S > 0 ? last.S : dS);
  document.getElementById('inwM').value = fmtDisp(last.M > 0 ? last.M : dD);
  document.getElementById('inwSheet').checked = last.sheet !== false;
  document.getElementById('inwModal').hidden = false;
  inwRender();
}
function inwClose(){ INW = null; document.getElementById('inwModal').hidden = true; }
function inwDepths(){
  return {D: lenIn(document.getElementById('inwD').value), S: lenIn(document.getElementById('inwS').value), M: lenIn(document.getElementById('inwM').value)};
}
// What stops Create, in words, or ''.
function inwProblem(){
  var d = inwDepths();
  if (!INW.ents.length) return 'Select the shapes to inlay first: close this, select them, and choose Inlay again.';
  if (!INW.vbit || !(INW.vbit.vAngle > 0)) return 'Choose the bit that carves the inlay: a V-bit or a tapered ball nose.';
  if (!INW.mill || !(INW.mill.dia > 0)) return 'Choose the end mill that clears the floor.';
  if (!(d.D > 0) || !(d.S > 0) || !(d.M > 0)) return 'Fill in all three depths.';
  if (!(d.M > d.S)) return 'The plug depth must be more than the start depth, so the plug stands proud of the surface.';
  if (!(d.D > d.S)) return 'The pocket must be deeper than the plug’s start depth, or the plug bottoms out before its walls meet.';
  if (DOC.stock && DOC.stock.t > 0 && (d.D > DOC.stock.t || d.M > DOC.stock.t)) return 'That’s deeper than the material (' + fmtDisp(DOC.stock.t) + ' ' + unitTag() + ', in Job setup).';
  return '';
}
function inwRender(){
  if (!INW) return;
  var u = unitTag(), d = inwDepths(), bit = INW.vbit, mill = INW.mill;
  document.getElementById('inwShapes').textContent = INW.ents.length ? INW.ents.length + (INW.ents.length === 1 ? ' shape' : ' shapes') : 'none selected';
  document.getElementById('inwBit').textContent = bit ? bit.name + ' · ' + bit.vAngle + '°' + (bit.vBall ? ', ' + fmtDisp(bit.vTipR) + ' ' + u + ' tip radius' : bit.vTip > 0 ? ', ' + fmtDisp(bit.vTip) + ' ' + u + ' flat tip' : '') : 'none chosen';
  document.getElementById('inwMill').textContent = mill ? mill.name + ' · ' + fmtDisp(mill.dia) + ' ' + u : 'none chosen';
  ['inwDU', 'inwSU', 'inwMU'].forEach(function (id) { document.getElementById(id).textContent = u; });
  var fit = '';
  if (d.D > 0 && d.S > 0 && d.M > 0 && d.M > d.S && d.D > d.S)
    fit = 'The plug seats ' + fmtDisp(d.S) + ' ' + u + ' into the pocket, with ' + fmtDisp(d.D - d.S) + ' ' + u + ' underneath for glue, and stands ' +
          fmtDisp(d.M - d.S) + ' ' + u + ' proud of the surface, to plane off.';
  document.getElementById('inwFit').textContent = fit;
  var bad = inwProblem();
  document.getElementById('inwProblem').textContent = bad;
  document.getElementById('inwCreate').disabled = !!bad;
}
function inwChoose(which){
  if (!TOOLLIB){ toast('info', 'No tool library yet', 'Open the tool library (the bit icon at the top) and import or add your bits, then choose them here.'); return; }
  var cur = INW[which];
  libOpen(cur ? cur.toolId : null, function (id) {
    var o = inwToolSettings(id);
    if (which === 'vbit' && !(o && o.vAngle > 0)){ toast('warn', 'That isn’t a V-bit', o ? o.name + ' has no angle. An inlay is carved with a V-bit or a tapered ball nose.' : ''); return; }
    INW[which] = o;
    inwRender();
  });
}
// Make both halves, with the Working panel up: the shapes and sheet first, then each of the four toolpaths in turn,
// so it can say which it's on. Resolves with {pocket, plug, sheet} (each half {group, tpV, tpC}), or null.
function inwCreate(){
  if (!INW || inwProblem()) return Promise.resolve(null);
  var d = inwDepths(), keepSheet = document.getElementById('inwSheet').checked, ents = INW.ents.slice();
  UICFG.inlayWiz = {vbit: INW.vbit.toolId, mill: INW.mill.toolId, D: d.D, S: d.S, M: d.M, sheet: keepSheet}; uiCfgSave();
  var base = {vbit: INW.vbit, mill: INW.mill, D: d.D, S: d.S, M: d.M, generate: false}, made = null;
  inwClose();
  return busyRun('Making the inlay\u2026', [
    {label: 'the plug\u2019s shapes', fn: function () { made = inwLayOut(ents, base, keepSheet); }},
    {label: 'Inlay pocket: clearing', fn: function () { tpGenerate(made.pocket.tpC); }},
    {label: 'Inlay pocket: V-carve', fn: function () { tpGenerate(made.pocket.tpV); }},
    {label: 'Inlay plug: clearing', fn: function () { tpGenerate(made.plug.tpC); }},
    {label: 'Inlay plug: V-carve', fn: function () { tpGenerate(made.plug.tpV); return inwDone(made); }}
  ]);
}
// The shapes, sheet, toolpaths and groups, before any toolpath is worked out (one undo for it all).
function inwLayOut(ents, base, keepSheet){
  pushUndo('Inlay wizard'); layersInit();
  var pocket = inlayHalf(Object.assign({plug: false, ents: ents.slice()}, base));
  var plugSheet = null;
  if (keepSheet){
    sheetsInit();
    if (!sheetList().length){ DOC.sheets = [{id: 'S1', name: 'Sheet 1'}]; DOC.activeSheet = 'S1'; }
    var here = DOC.activeSheet;
    DOC.ents.forEach(function (e) { if (!sheetById(e.sheet)) e.sheet = here; });
    tpList().forEach(function (tp) { if (!sheetById(tp.sheet)) tp.sheet = sheetsOfEnts(tp.ents)[0] || here; });
    var n = 1; while (sheetById('S' + n)) n++;
    var nm = 'Inlay plug', k = 2; while (sheetList().some(function (s) { return s.name === nm; })) nm = 'Inlay plug ' + k++;
    plugSheet = {id: 'S' + n, name: nm};
    DOC.sheets.push(plugSheet);
  }
  var plug = inlayHalf(Object.assign({plug: true, ents: ents.slice(), sheet: plugSheet ? plugSheet.id : null}, base));
  [[pocket, 'Inlay pocket'], [plug, 'Inlay plug']].forEach(function (p) {
    var g = {id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: p[1], folded: false};
    var names = tpGroups().map(function (x) { return x.name; }), k2 = 2;
    while (names.indexOf(g.name) >= 0) g.name = p[1] + ' ' + k2++;
    tpGroups().push(g);
    p[0].tpC.group = g.id; p[0].tpV.group = g.id; p[0].group = g;
  });
  tpGroupsTidy();
  return {pocket: pocket, plug: plug, sheet: plugSheet};
}
function inwDone(made){
  var pocket = made.pocket, plug = made.plug, plugSheet = made.sheet;
  persist();
  renderToolpathPanel(); draw();
  toast('ok', 'Inlay toolpaths created',
        'Two groups: “' + pocket.group.name + '”, for the base, and “' + plug.group.name + '”, for the inlay piece' +
        (plugSheet ? ', on its own sheet, “' + plugSheet.name + '”: show it with the Sheet bar. Each sheet saves its own G-code.' : '.') +
        ' Cut the pocket and the plug with the same bit, and trim the inlay piece to the plug’s boundary before gluing.');
  return {pocket: pocket, plug: plug, sheet: plugSheet};
}
// One half of an inlay: its clearing pocket and V-carve, put into the list (the plug's on a mirrored copy of the shapes
// inside a boundary, on `sheet` if given). o: {plug, ents, vbit, mill, D, S, M, sheet}. The caller takes care of undo.
function inlayHalf(o){
  var ents = o.ents.slice(), bitShape = Cam.vbitShape({angle: o.vbit.vAngle, tip: o.vbit.vBall ? 0 : o.vbit.vTip || 0, tipR: o.vbit.vBall ? o.vbit.vTipR : 0});
  if (o.plug){
    // mirrored about the shapes' own centre line; beside the design on the same sheet, or where it is on its own sheet
    var bb = null;
    ents.forEach(function (id) { var b = entBBox(entById(id)); bb = bb ? {x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1)} : b; });
    var cx = (bb.x0 + bb.x1) / 2, shift = o.sheet ? 0 : (bb.x1 - bb.x0) + 20, mg = Math.max(6, bitShape.reach(o.M) * 2 + 2);
    var keepActive = DOC.activeLayer, lid = layerNew('Inlay plug');
    DOC.activeLayer = keepActive;
    var copies = ents.map(function (id) {
      var c = cloneEnt(entById(id));
      mirrorEnt(c, cx, 0, 0, 1);                        // across the vertical line through the centre
      moveEntity(c, shift, 0);
      c.layer = lid; delete c.id; delete c._id;
      if (o.sheet) c.sheet = o.sheet;
      DOC.ents.push(c);
      return entId(c);
    });
    var box = {t: 'rect', x: bb.x0 + shift - mg, y: bb.y0 - mg, w: (bb.x1 - bb.x0) + 2 * mg, h: (bb.y1 - bb.y0) + 2 * mg, layer: lid};
    if (o.sheet) box.sheet = o.sheet;
    DOC.ents.push(box);
    ents = [entId(box)].concat(copies);
  }
  var b = o.vbit, m = o.mill, plug = o.plug, floor = plug ? o.M : o.D;
  var common = {safeZ: 6, climb: true, tabPts: {}, tabsOn: false, hidden: false, exclude: false, through: false};
  if (o.sheet) common.sheet = o.sheet;
  var tpV = Object.assign({}, common, {id: tpNewId(), name: plug ? 'Inlay plug: V-carve' : 'Inlay pocket: V-carve', side: 'vcarve', type: 'vcarve', ents: ents.slice(),
    vAngle: b.vAngle, vTip: b.vBall ? 0 : b.vTip || 0, vcMax: floor, vcStart: plug ? o.S : 0, dia: b.dia, step: 0,
    feed: b.feed || 1000, plunge: b.plunge || 300, rpm: b.rpm || 18000, toolId: b.toolId, toolChosen: true});
  if (b.vBall){ tpV.vBall = true; tpV.vTipR = b.vTipR; }
  if (!plug) delete tpV.vcStart;
  var tpC = Object.assign({}, common, {id: tpNewId(), name: plug ? 'Inlay plug: clearing' : 'Inlay pocket: clearing', side: 'pocket', type: 'pocket', ents: ents.slice(), clearFor: tpV.id,
    depth: floor, step: m.step > 0 ? Math.min(m.step, floor) : Math.max(0.5, floor / 2), allowance: tpVFloorEdge(tpV), finishPass: false, stepoverPct: m.stepoverPct || 40,
    dia: m.dia, feed: m.feed || 800, plunge: m.plunge || 300, rpm: m.rpm || 18000, toolId: m.toolId, toolChosen: true});
  tpInsertByRank(tpC); tpInsertByRank(tpV);             // clearing before the V-carve, as VCarve does
  if (o.generate !== false){ tpGenerate(tpC); tpGenerate(tpV); }   // (the V-carve last: it flattens what the clearing's cutter leaves)
  return {tpV: tpV, tpC: tpC, ents: ents};
}
