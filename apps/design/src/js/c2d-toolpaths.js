// ---- Carbide Create's toolpaths, as 454 toolpaths ----
// Each becomes an ordinary 454 toolpath: editable, recalculated from its shapes, checked like any other. What
// a toolpath cuts is found by Carbide Create's own shape IDs (and, where it picks by layer, the shapes on those
// layers), never by position. Anything that can't be converted for certain is left out and named, with why:
// a wrong side or depth cuts a part wrong, so nothing is guessed.
//
// What's known, and from where:
//   older files (builds 464 to 756): contours carry ofset_dir, 1 outside ("Outside", "cutout", "SignCutOut" in
//     three real projects), -1 inside ("eyes", "nose", cut through a sign), 2 a pocket, 3 a V-carve; type is
//     "contour", "pocket_toolpath", "vcarve_toolpath", or missing in the oldest.
//   current files (build 8xx): "cutout" with path_type, whose meaning ISN'T known yet (two files meant as
//     outside cuts hold different values), so cutouts from current files aren't converted;
//     "advanced_vcarve_toolpath" picks by layer (toolpath_layers, layer IDs).
//   a V bit's angle is half its included angle (#301, a 90 degree bit, is 45; #302, 60 degrees, is 30).

// What kind of 454 toolpath it is: {side}, or {why} it can't be converted
function c2dTpKind(T){
  var ty = String(T.type || '');
  if (/vcarve/.test(ty)) return {side: 'vcarve'};
  if (/pocket/.test(ty)) return {side: 'pocket'};
  if (ty === '' || ty === 'contour'){
    var d = T.ofset_dir;
    if (d === 1) return {side: 'outside'};
    if (d === -1) return {side: 'inside'};
    if (d === 2 && ty === '') return {side: 'pocket'};
    if (d === 3 && ty === '') return {side: 'vcarve'};
    return {why: '454 can’t tell which side of the line it cuts'};
  }
  if (ty === 'cutout') return {why: '454 can’t yet read which side of the line a contour cuts in this version of Carbide Create'};
  return {why: 'it’s a kind of toolpath 454 doesn’t convert yet (' + ty + ')'};
}
// The 454 toolpaths for an extracted project (c2dExtract), whose shapes are already the drawing (DOC).
// Returns {made: [toolpath], left: [{name, why}], notes: [text]}; made are settings only, to be built (c2dBuild).
function c2dToolpaths(ex){
  var out = {made: [], left: [], notes: []};
  var t = DOC.stock.t || 0, byCc = {}, layerName = {}, layerId = {}, groupOff = {};
  DOC.ents.forEach(function (e) { if (e.ccId) byCc[e.ccId] = entId(e); });
  ex.layers.forEach(function (L) { if (L && L.uuid) layerName[L.uuid] = L.name; });
  (DOC.layers || []).forEach(function (L) { layerId[L.name] = L.id; });
  ex.groups.forEach(function (g) { if (g && g.enabled === false) groupOff[g.uuid] = true; });
  var num = function (v) { var n = Math.abs(parseFloat(v)); return isFinite(n) ? n : 0; };   // depths are text in some versions, and negative in the oldest
  ex.toolpaths.forEach(function (T, i) {
    var name = String(T.name || 'Toolpath ' + (i + 1)), kind = c2dTpKind(T), tool = T.tool || {}, sp = T.speeds || {};
    if (kind.why){ out.left.push({name: name, why: kind.why}); return; }
    var side = kind.side, ents = [];
    (T.elements || []).forEach(function (el) { var id = el && byCc[el.uuid]; if (id && ents.indexOf(id) < 0) ents.push(id); });
    (T.toolpath_layers || []).forEach(function (u) {
      var lid = layerId[layerName[u]];
      if (lid) DOC.ents.forEach(function (e) { if (e.layer === lid && !e.con && ents.indexOf(entId(e)) < 0) ents.push(entId(e)); });
    });
    if (!ents.length){ out.left.push({name: name, why: 'the shapes it cuts weren’t found in the drawing'}); return; }
    var dia = +tool.diameter || 0;
    if (!(dia > 0)){ out.left.push({name: name, why: 'it has no bit size'}); return; }
    var end = num(T.end_depth !== undefined ? T.end_depth : T.cut_depth), start = num(T.start_depth), depth = end - start;
    if (side !== 'vcarve' && !(depth > 0)){ out.left.push({name: name, why: 'it has no depth'}); return; }
    var step = +T.stepdown || +T.depth_per_pass || 0;
    var tp = {id: tpNewId(), name: name, side: side, ents: ents, dia: dia, depth: depth, step: step > 0 ? Math.min(step, Math.max(depth, step)) : +(dia / 2).toFixed(3),
              type: side === 'pocket' ? 'pocket' : side === 'vcarve' ? 'vcarve' : 'profile',
              feed: Math.round(+sp.feedrate) || 800, plunge: Math.round(+sp.plungerate) || 300, rpm: Math.round(+sp.rpm) || 18000,
              toolId: null, toolChosen: true, ccFrom: name, ccTool: tool.number ? '#' + tool.number : '',
              through: false, over: 0.2, allowance: 0, climb: true, finishPass: false, leadType: 'none', leadSize: 0,
              tabsOn: false, tabCount: 0, tabLen: 4, tabThk: 1.5, tabStyle: 'flat', tabPts: {}, startPts: {}, exprs: {},
              stepoverPct: 40, pocketClear: 'offset', rasterAngle: 0, rampLen: null, rampOff: T.enable_ramping !== true,
              vcMax: 0, vTip: 0, vAngle: 90, chamW: 1, chamMode: 'edge', peck: 0,
              hidden: false, exclude: T.enabled === false || !!groupOff[T.toolpath_group], safeZ: 6};
    if (start > 0) out.notes.push(name + ' starts ' + fmtDisp(start) + ' ' + unitTag() + ' below the top in Carbide Create; here it cuts ' + fmtDisp(depth) + ' ' + unitTag() + ' from the top.');
    if (side !== 'vcarve' && t > 0 && depth >= t - 1e-6 && depth - t <= 1){ tp.through = true; tp.over = +(depth - t).toFixed(4); }
    if (side === 'pocket'){
      if (+T.stepover > 0) tp.stepoverPct = Math.max(5, Math.min(100, Math.round(+T.stepover / dia * 100)));
      if (T.enable_rest) out.notes.push(name + ' cleans up after a ' + fmtDisp(+T.rest_diameter || 0) + ' ' + unitTag() + ' bit in Carbide Create; here it’s a whole pocket. Edit it and choose Clean up after, if the larger pocket is on the same shapes.');
    }
    if (side === 'vcarve'){
      tp.vAngle = +tool.angle > 0 ? 2 * +tool.angle : 90;
      tp.vcMax = end > 0 && !(t > 0 && end >= t - 1e-6) ? end : 0;     // a limit of the whole thickness is no limit
      tp.depth = 0; tp.through = false;
      if (!(+tool.angle > 0)) out.notes.push(name + ': the bit’s angle isn’t in the project; it’s set to 90°. Check it.');
      if (dia < 1){ tp.vTip = dia; tp.dia = 6.35; out.notes.push(name + ': its bit is given as ' + dia + ' mm across, which looks like the tip. It’s set as a 6.35 mm bit with that tip: check it.'); }
      if (T.pocket_enabled) out.notes.push(name + ' clears its flat areas with a second bit in Carbide Create' + (T.tool_pocket && T.tool_pocket.number ? ' (#' + T.tool_pocket.number + ')' : '') + '; here the V bit does all of it. Add a pocket if you want the areas cleared with an end mill.');
      if (T.inlay_enabled) out.notes.push(name + ' is set up as an inlay in Carbide Create; here it’s a plain V-carve.');
    }
    if (side === 'outside' || side === 'inside'){              // tabs: their size, and how many on each shape, spread evenly
      var most = 0;
      (T.elements || []).forEach(function (el) { if (el && Array.isArray(el.tab_u)) most = Math.max(most, el.tab_u.length); });
      if (most > 0 && !T.ignore_tabs){
        tp.tabThk = +T.tab_height > 0 ? +T.tab_height : 1.5; tp.tabLen = +T.tab_width > 0 ? +T.tab_width : 4;
        tpAddEvenTabs(tp, most); tp.tabCount = most; tp.tabsOn = tpTabTotal(tp) > 0;
        if (tp.tabsOn) out.notes.push(name + ': its tabs are spread evenly round each shape, ' + most + ' each, not where Carbide Create had them. Move them in the editor if it matters.');
      }
    }
    out.made.push(tp);
  });
  return out;
}
// Build converted toolpaths one at a time, with a pause between, so the drawing shows first and the panel fills
// in as each is done: a V-carve over hundreds of shapes can take half a minute.
// Returns a promise, kept when all are built (or the drawing has been replaced).
function c2dBuild(tps){
  return new Promise(function (done) {
    var i = 0;
    function next(){
      while (i < tps.length && tpList().indexOf(tps[i]) < 0) i++;      // deleted, or another drawing opened, meanwhile
      if (i >= tps.length){ if (tps.length){ persist(); renderToolpathPanel(); draw(); } done(); return; }
      tpGenerate(tps[i++]);
      renderToolpathPanel(); draw();
      soon(next);
    }
    // after the screen has been drawn: a timer alone can fire before the drawing, or the last toolpath, is shown
    // (and a plain timer as well: a window that's minimised or hidden draws nothing, and must still finish)
    function soon(f){
      var ran = false, go = function () { if (!ran){ ran = true; f(); } };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { setTimeout(go, 20); });
      setTimeout(go, 300);
    }
    soon(next);                                          // not before the drawing has been shown
  });
}
