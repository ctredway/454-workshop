// ---- adding a DXF or SVG to the drawing ----
var VEC_GAP = 10;                                     // mm between what's drawn and what's added beside it
function vecContentBBox(){                            // what's drawn (not VCarve's toolpath ghosts); null if nothing
  var list = DOC.ents.filter(function (e){ return !e.tp; });
  return list.length ? dxfBBox(list) : null;
}
function bbUnion(a, b){ return !a ? b : !b ? a : {x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)}; }
// Add one file's shapes: scaled, then placed at the origin, beside `ref` (bottoms aligned), or where the file
// has them. Layers match existing ones by name; new names become new layers; DXF's default layer "0", and
// SVG content outside any layer, go on the active layer. Returns the new shapes' indices and bounds.
function vecAdd(ex, scale, place, ref){
  var ents = ex.ents.map(cloneEnt);
  if (scale !== 1) vecScaleEnts(ents, scale);
  var bb = dxfBBox(ents), dx = 0, dy = 0;
  if (place === 'origin' || (place === 'beside' && !ref)){ dx = -bb.x0; dy = -bb.y0; }
  else if (place === 'beside'){ dx = ref.x1 + VEC_GAP - bb.x0; dy = ref.y0 - bb.y0; }
  if (dx || dy) ents.forEach(function (e){ moveEntity(e, dx, dy); });
  layersInit();
  var byName = function (nm){ return DOC.layers.filter(function (L){ return L.name.toLowerCase() === String(nm).toLowerCase(); })[0]; };
  var first = DOC.ents.length;
  ents.forEach(function (e){
    var nm = e.dxfLayer, L = null;
    delete e.dxfLayer;
    if (nm !== undefined && nm !== '0' && nm !== ''){
      L = byName(nm);
      if (!L){
        L = layerById(layerNew(String(nm)));
        var t = (ex.layers || []).filter(function (x){ return x.name === nm; })[0];
        if (t){ L.visible = t.visible !== false; L.locked = !!t.locked; }
      }
    }
    e.layer = L ? L.id : DOC.activeLayer;
    if (L && /^construction$/i.test(L.name)) e.con = true;
    DOC.ents.push(e);
  });
  var idx = []; for (var i = first; i < DOC.ents.length; i++) idx.push(i);
  return {idx: idx, bb: dxfBBox(ents)};
}
function vecScaleEnts(ents, scale){                   // uniform scale about the origin
  ents.forEach(function(e){
    if (e.t === 'line'){ e.x1*=scale; e.y1*=scale; e.x2*=scale; e.y2*=scale; }
    else if (e.t === 'circle'){ e.cx*=scale; e.cy*=scale; e.r*=scale; }
    else if (e.t === 'arc'){ e.cx*=scale; e.cy*=scale; e.r*=scale; }
    else if (e.t === 'rect'){ e.x*=scale; e.y*=scale; e.w*=scale; e.h*=scale; }
    else if (e.pts){ e.pts = e.pts.map(function(pt){
      return pt.length > 2 ? [pt[0]*scale, pt[1]*scale, pt[2]] : [pt[0]*scale, pt[1]*scale]; }); }
  });
}
function dxfToDoc(ex, scale, toOrigin, keepStock){
  var ents = ex.ents.map(cloneEnt);
  var dx = 0, dy = 0;
  if (scale !== 1){
    ents.forEach(function(e){
      // uniform scale about origin
      if (e.t === 'line'){ e.x1*=scale; e.y1*=scale; e.x2*=scale; e.y2*=scale; }
      else if (e.t === 'circle'){ e.cx*=scale; e.cy*=scale; e.r*=scale; }
      else if (e.t === 'arc'){ e.cx*=scale; e.cy*=scale; e.r*=scale; }
      else if (e.t === 'rect'){ e.x*=scale; e.y*=scale; e.w*=scale; e.h*=scale; }
      else if (e.pts){ e.pts = e.pts.map(function(pt){
        return pt.length > 2 ? [pt[0]*scale, pt[1]*scale, pt[2]] : [pt[0]*scale, pt[1]*scale]; }); }
    });
  }
  if (toOrigin){
    var bb = dxfBBox(ents);
    dx = -bb.x0; dy = -bb.y0;
    ents.forEach(function(e){ moveEntity(e, dx, dy); });
  }
  // DXF layers become Design layers, in the file's order, keeping which were off or locked.
  // A layer named "Construction" (as 454 exports) brings its shapes back as construction lines.
  var names = [];
  (ex.layers || []).forEach(function (L) { if (names.indexOf(L.name) < 0 && ents.some(function (e) { return e.dxfLayer === L.name; })) names.push(L.name); });
  ents.forEach(function (e) { if (e.dxfLayer !== undefined && names.indexOf(e.dxfLayer) < 0) names.push(e.dxfLayer); });
  if (!names.length) names = ['0'];
  var layers = names.map(function (nm, ix) {
    var t = (ex.layers || []).filter(function (L) { return L.name === nm; })[0];
    return {id: 'L' + (ix + 1), name: names.length === 1 && nm === '0' ? 'Layer 1' : nm, visible: t ? t.visible : true, locked: t ? t.locked : false};
  });
  ents.forEach(function (e) {
    var ix = Math.max(0, names.indexOf(e.dxfLayer === undefined ? '0' : e.dxfLayer));
    e.layer = layers[ix].id;
    if (/^construction$/i.test(names[ix])) e.con = true;
    delete e.dxfLayer;
  });
  return {stock: keepStock, ents: ents, guides: [], layers: layers, activeLayer: layers[layers.length - 1].id};
}

