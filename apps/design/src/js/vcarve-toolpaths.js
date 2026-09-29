/* ============================================================
   VCARVE TOOLPATHS -> EDITABLE 454 TOOLPATHS
   The project records each toolpath's settings but not which shapes it cuts. VCarve's saved
   toolpath previews answer that: each preview is an exact offset of the shape it came from
   (a profile's sits one cutter radius outside or inside it, a drill's is centred on it), so
   matching previews to shapes recovers the selection.
   ============================================================ */
// The number written just before position `at` in a tool name ("30" in "SC 30\u00b0 Engraving").
function vcNumberBefore(name, at){
  if (!(at > 0)) return NaN;
  var k = at - 1;
  while (k >= 0 && name.charAt(k) === ' ') k--;
  var end = k + 1;
  while (k >= 0 && '0123456789.'.indexOf(name.charAt(k)) >= 0) k--;
  return end > k + 1 ? parseFloat(name.slice(k + 1, end)) : NaN;
}
// A flat tip's width from names like 'Engraving 0.005" Tip' or 'Tip 0.25 - 3 mm', in mm.
function vcTipFromName(name){
  var low = name.toLowerCase(), at = low.indexOf('tip');
  if (at < 0) return 0;
  // a number right before "Tip" (0.005" Tip) wins; otherwise the one right after (Tip 0.5 - 6 mm)
  var b = at - 1; while (b >= 0 && name.charAt(b) === ' ') b--;
  var inches, val;
  if (b >= 0 && (name.charAt(b) === '"' || '0123456789.'.indexOf(name.charAt(b)) >= 0)){
    inches = name.charAt(b) === '"';
    val = vcNumberBefore(name, inches ? b : b + 1);
  } else {
    var a = at + 3; while (a < name.length && (name.charAt(a) === ' ' || name.charAt(a) === ':')) a++;
    var e2 = a; while (e2 < name.length && '0123456789.'.indexOf(name.charAt(e2)) >= 0) e2++;
    if (name.charAt(e2) === '/') return 0;                  // a fraction like 1/4 is a diameter, not the tip
    val = parseFloat(name.slice(a, e2));
    inches = name.charAt(e2) === '"' || (name.indexOf('"') >= 0 && low.indexOf('mm') < 0);
  }
  if (!(val > 0)) return 0;
  return +(val * (inches ? 25.4 : 1)).toFixed(4);
}
function vcToolDia(t){
  var lib = TOOLLIB ? libMatch({name: t.tool.name, num: t.tool.num}, t.machineId) : null;
  var lt = lib && lib.tool;
  if (lt && lt.diameter) return {dia: lt.diameter * (lt.units === 'in' ? 25.4 : 1), tool: lt};
  var m = /\(([\d.]+)\s*mm\)/i.exec(t.tool.name);
  if (m) return {dia: parseFloat(m[1]), tool: null};
  m = /\((\d+)\s*\/\s*(\d+)\s*"?\)|\((\d+)\s+(\d+)\s*\/\s*(\d+)\s*"?\)/.exec(t.tool.name);
  if (m){ var inch = m[1] ? (+m[1] / +m[2]) : (+m[3] + +m[4] / +m[5]); return {dia: inch * 25.4, tool: null}; }
  return {dia: 3.175, tool: null};
}
function vcPreviewLoops(){
  return (DOC.vcPreview || []).map(function (sp) {
    return tessPath({t: 'path', pts: sp.map(function (q) { return [q[0], q[1], q[2] || 0]; }), closed: true}, 0.02)
             .map(function (p) { return [p[0], p[1]]; });
  });
}
// For each preview, the shape it is a constant offset of: how far, and on which side.
function vcPreviewMatches(shapes){
  var previews = vcPreviewLoops(), out = [];
  var idx = shapes.map(function (sh) { return Geom.pathIndex(sh.loop, true); });
  previews.forEach(function (P, pi) {
    var best = null;
    var step = Math.max(1, Math.floor(P.length / 40));
    shapes.forEach(function (sh, si) {
      var lo = Infinity, hi = -Infinity;
      for (var k = 0; k < P.length; k += step){ var d = idx[si].dist(P[k][0], P[k][1]); if (d < lo) lo = d; if (d > hi) hi = d; }
      if (hi - lo > 0.04) return;                       // not a constant offset of this shape
      var mid = (lo + hi) / 2;
      var inside = Geom.pointInLoop(P[0][0], P[0][1], sh.loop);
      var cand = {preview: pi, id: sh.id, off: mid, side: mid < 1e-3 ? 'on' : (inside ? 'inside' : 'outside'), spread: hi - lo, loop: P};
      if (!best || cand.spread < best.spread) best = cand;
    });
    if (best) out.push(best);
  });
  return out;
}
function vcMakeEditable(){
  if (!camReady() || !DOC.vcToolpaths || !DOC.vcToolpaths.length || DOC.vcConverted) return;
  var shapes = DOC.ents.filter(function (e) { return !e.con && !e.tp; }).map(function (e) {
    var id = entId(e), o = tpOutlinesById([id])[0];
    return o ? {id: id, loop: o.loop, circle: e.t === 'circle' ? e : null} : null;
  }).filter(Boolean);
  // Matching shapes against previews is slow on big projects (every shape against every preview), and
  // only needed for toolpaths VCarve's own record doesn't cover: so it runs once, and only if needed.
  var matchesMemo = null;
  function previewMatches(){ if (!matchesMemo) matchesMemo = vcPreviewMatches(shapes); return matchesMemo; }
  var made = [], unsure = [];
  pushUndo();
  DOC.vcToolpaths.forEach(function (T) {
    var set = T.set || {}, g = function (k) { for (var key in set) if (key.replace(/^_(ppd|dpd|chpd|pkpd|vcpd|mc\w\wd)/, '') === k) return set[key]; };
    var kind = String(g('ToolpathType') || T.type || '');
    var td = vcToolDia(T), D = td.dia;
    // A profile's side comes from ProfileType (0 outside, 1 inside, 2 on the line). The "Profile Inside"
    // or "Profile Outside" label is set when the toolpath is made and isn't updated if it's switched
    // later, so it can say the opposite of what VCarve cuts: VCarve's own calculated paths follow
    // ProfileType. The label is only a fallback for projects without ProfileType.
    var pt = g('ProfileType');
    var side = /VCarve/i.test(kind) || /V-Carve/i.test(T.type) ? 'vcarve' : /Drill/i.test(kind) ? 'drill' : /Chamfer/i.test(T.type) ? 'chamfer' : /Pocket/i.test(kind) ? 'pocket'
             : pt === 1 ? 'inside' : pt === 2 ? 'on' : pt === 0 ? 'outside'
             : /Inside/i.test(kind) ? 'inside' : /Outside/i.test(kind) ? 'outside' : 'outside';
    var cutDepth = +(g('CutDepth') || g('ChamferDepth') || 3), allow = +(g('Allowance') || 0);
    var passes = +(g('NumPasses') || 0), step = passes > 0 ? cutDepth / passes : (+(g('Stepdown') || 0) || Math.max(0.5, cutDepth / 2));
    var tp = {id: tpNewId(), name: T.name, side: side, ents: [], dia: +D.toFixed(4), step: +step.toFixed(4), safeZ: 6,
              rpm: T.tool.rpm || 18000, toolId: td.tool ? td.tool.id : null, climb: +(g('CutDirection') || 0) === 0,
              allowance: allow, tabsOn: false, tabLen: 4, tabThk: 0.5, tabPts: {}, tabCount: 0, stepoverPct: 40,
              vcFrom: T.name, depth: cutDepth, toolChosen: true};
    tp.type = side === 'drill' ? 'drill' : side === 'pocket' ? 'pocket' : side === 'chamfer' ? 'chamfer' : 'profile';
    if (g('DoRamping') && +(g('RampingDistance') || 0) > 0) tp.rampLen = +g('RampingDistance');
    // feeds from the library, for the machine and material VCarve used
    var cut = td.tool ? (libCutFor(td.tool, T.machineId, T.materialId) || td.tool.cuts[0]) : null;
    if (cut){
      var rate = cut.rateUnits === 4 ? 25.4 : 1;
      tp.feed = cut.feed ? Math.round(cut.feed * rate) : 800;
      tp.plunge = cut.plunge ? Math.round(cut.plunge * rate) : Math.round(tp.feed / 2);
      if (cut.rpm && !T.tool.rpm) tp.rpm = cut.rpm;          // what the project used comes first
    } else { tp.feed = 800; tp.plunge = 300; }
    // through the material, when the depth is the thickness plus a little
    var t = DOC.stock.t || 0;
    if (side !== 'chamfer' && t > 0 && cutDepth >= t - 1e-6 && cutDepth - t <= 1){ tp.through = true; tp.over = +(cutDepth - t).toFixed(4); }
    else tp.through = false;
    if (side === 'pocket' && g('DoRaster')){ tp.pocketClear = 'raster'; tp.rasterAngle = +(g('RasterAngle') || 0); }
    if (side === 'drill'){
      var sd = cut && cut.stepdown ? cut.stepdown * (cut.lengthUnits === 'in' ? 25.4 : 1) : cutDepth / 6;
      tp.peck = g('PeckDrill') ? +sd.toFixed(4) : 0;
    }
    if (side === 'vcarve'){
      var vt = td.tool;
      var nm = T.tool.name, nameAng = vcNumberBefore(nm, nm.indexOf('\u00b0'));      // "... 30\u00b0 ..." anywhere in the name
      tp.vAngle = vt && vt.angle > 0 ? vt.angle : (nameAng > 0 ? nameAng : 60);
      tp.vTip = vt && vt.flat > 0 ? +(vt.flat * (vt.units === 'in' ? 25.4 : 1)).toFixed(4) : vcTipFromName(nm);
      tp.vcMax = g('DoFlatBottom') && +(g('FlatDepth') || 0) > 0 ? +g('FlatDepth') : 0;
      tp.step = 0; tp.through = false;
    }
    if (side === 'chamfer'){
      var half = +(g('Angle') || 45);
      tp.vAngle = half * 2;
      tp.chamW = +(cutDepth * Math.tan(half * Math.PI / 180)).toFixed(4);
      tp.chamMode = g('VectorsAtTop') ? (g('Inside') ? 'in' : 'out') : 'edge';
      tp.step = +(g('Stepdown') || step);
    }
    if (g('UseTabs')){
      tp.tabsOn = true;
      var inMM = g('InMM') !== false;
      tp.tabLen = +(g('TabLength') || 4) * (inMM ? 1 : 25.4); tp.tabThk = +(g('TabThickness') || 0.5) * (inMM ? 1 : 25.4);
      tp.tabCount = +(g('tabsNumTabs') || 2);
    }
    // which shapes: VCarve's own record of the vectors this toolpath uses, by ID. Only projects without
    // it fall back to matching the saved previews (which fails if parts moved after calculating).
    if (T.vids && T.vids.length){
      DOC.ents.forEach(function (e) { if (e.vcId && T.vids.indexOf(e.vcId) >= 0) tp.ents.push(entId(e)); });
      if (tp.ents.length) tp.foundBy = 'id';
    }
    var want;
    if (side === 'outside') want = {off: D / 2 + allow, side: 'outside'};
    else if (side === 'inside' || side === 'pocket') want = {off: D / 2 + allow, side: 'inside'};
    else if (side === 'on') want = {off: 0, side: 'on'};
    else if (side === 'chamfer') want = tp.chamMode === 'edge' ? {off: 0, side: 'on'} : {off: tp.chamW, side: tp.chamMode === 'in' ? 'inside' : 'outside'};
    if (!tp.foundBy) previewMatches().forEach(function (m) {
      if (tp.ents.indexOf(m.id) >= 0) return;
      if (side === 'drill' || side === 'vcarve') return;   // matched below: drills by centre, V-carves by containment
      if (Math.abs(m.off - want.off) < 0.06 && m.side === want.side) tp.ents.push(m.id);
    });
    if (side === 'vcarve' && !tp.foundBy){
      // A V-carve's preview is its centre-line, inside the shape it carves: so each unmatched preview
      // belongs to the smallest shape that contains it (not the part outline the text sits on).
      var usedPrev = {}; previewMatches().forEach(function (m) { usedPrev[m.preview] = true; });
      vcPreviewLoops().forEach(function (P, pi) {
        if (usedPrev[pi]) return;
        var best = null, bestA = Infinity;
        shapes.forEach(function (sh) {
          var inside = 0; P.forEach(function (q) { if (Geom.pointInLoop(q[0], q[1], sh.loop)) inside++; });
          if (inside < P.length * 0.9) return;
          var A = Math.abs(Geom.area(sh.loop)); if (A < bestA){ bestA = A; best = sh; }
        });
        if (best && tp.ents.indexOf(best.id) < 0) tp.ents.push(best.id);
      });
    }
    if (side === 'drill' && !tp.foundBy){
      // VCarve draws a drill's preview as the cutter's circle with a mark through the middle, so it
      // isn't a clean offset of anything. Its box is: centred on the hole, as wide as the cutter.
      vcPreviewLoops().forEach(function (P) {
        var xs = P.map(function (q) { return q[0]; }), ys = P.map(function (q) { return q[1]; });
        var bx0 = Math.min.apply(null, xs), bx1 = Math.max.apply(null, xs), by0 = Math.min.apply(null, ys), by1 = Math.max.apply(null, ys);
        var cxp = (bx0 + bx1) / 2, cyp = (by0 + by1) / 2;
        if (Math.abs((bx1 - bx0) - D) > 0.1 || Math.abs((by1 - by0) - D) > 0.1) return;
        shapes.forEach(function (sh) {
          if (!sh.circle || tp.ents.indexOf(sh.id) >= 0) return;
          if (Math.hypot(sh.circle.cx - cxp, sh.circle.cy - cyp) < 0.05) tp.ents.push(sh.id);
        });
      });
    }
    if (tp.side === 'chamfer' && tp.chamMode === 'edge') tp.ents = tp.ents.filter(function (id, i, a) { return a.indexOf(id) === i; });
    if (!tp.ents.length) unsure.push(tp.name);
    tpGenerate(tp);
    made.push(tp);
  });
  if (multiSheet()){
    var split = [];
    made.forEach(function (tp) {
      var bySheet = {};
      tp.ents.forEach(function (id) { var e = entById(id); var k = e && e.layer ? e.layer : DOC.activeSheet; (bySheet[k] = bySheet[k] || []).push(id); });
      var keys = Object.keys(bySheet);
      if (keys.length <= 1){ tp.sheet = keys[0] || DOC.activeSheet; split.push(tp); return; }
      keys.forEach(function (k) {
        var t2 = JSON.parse(JSON.stringify(tp));
        t2.id = tpNewId(); t2.ents = bySheet[k]; t2.sheet = k;
        t2.name = tp.name + ' (' + layerById(k).name + ')';
        tpGenerate(t2); split.push(t2);
      });
    });
    made = split;
  }
  // replace anything converted before from the same project, keep the user's own toolpaths
  DOC.toolpaths = tpList().filter(function (x) { return !x.vcFrom; }).concat(made);
  DOC.vcConverted = true;                    // kept, not deleted, so undo can bring the VCarve list back
  persist(); renderToolpathPanel(); draw();
  toast(unsure.length ? 'info' : 'ok', made.length + ' VCarve toolpaths are now editable',
        made.map(function (x) { return x.name + ' (' + (x.ents.length ? x.ents.length + (x.ents.length === 1 ? ' shape' : ' shapes') : 'shapes not found') + ')'; }).join(', ') +
        (unsure.length ? '. For ' + unsure.join(', ') + ', open Edit and pick the shapes: the project doesn\u2019t say which vectors they use.' : '.'));
}

var TP_ICONS = {
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
  edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.9-3.3L10.8 2.8l2.4 2.4-6.9 6.9z M9.4 4.2l2.4 2.4"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.4 4.5l.7 8.5h5.8l.7-8.5M6.8 7v4M9.2 7v4"/></svg>',
  regen: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.8 8.6A4.9 4.9 0 1 1 11.4 4.2M12.2 1.9v2.8H9.4"/></svg>'
};
