/* ============================================================
   TOOLPATHS (CAM)
   The engine (geom.js + cam.js) is optional: when it isn't loaded, 454 Design
   behaves exactly as before and the panel simply has nothing to create with.
   A toolpath remembers WHICH SHAPES it was made from, so editing the drawing
   marks it out of date rather than silently leaving a wrong path on screen.
   ============================================================ */
function camReady(){ return !!(window.Cam && window.Geom); }
var CUT = null;            // the editor's working state
var CUTSEL = null;         // id of the toolpath highlighted in the panel

function tpList(){ return DOC.toolpaths || (DOC.toolpaths = []); }
function tpNewId(){ return 'tp' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

// A fingerprint of the shapes a toolpath was built from: if this changes, the path is stale.
function tpSignature(ids){
  return ids.map(function (id) {
    var e = entById(id);
    return e ? snapJSON(e) : 'gone';
  }).join('|');
}
function tpOutlines(ids){ return tpOutlinesById(ids).map(function (o) { return o.loop; }); }
function tpOutlinesById(ids){
  var out = [];
  // A group's outlines, and text's letters, all belong to the group or text as picked: a traced
  // logo or a word is one shape to a toolpath. (Toolpaths used to see neither, so a pocket or
  // V-carve on a traced logo or on text found nothing.)
  function collect(e, id){
    if (!e) return;
    if (e.t === 'group'){ e.ents.forEach(function (c) { collect(c, id); }); return; }
    if (e.t === 'text'){ var tc = textToCurves(e); if (tc) collect(tc, id); return; }
    var pts = null;
    if (e.t === 'circle') pts = Geom.circlePoints(e.cx, e.cy, e.r, 0.01);
    else if (e.t === 'rect') pts = [[e.x,e.y],[e.x+e.w,e.y],[e.x+e.w,e.y+e.h],[e.x,e.y+e.h]];
    else if (e.t === 'poly' && e.closed) pts = e.pts.map(function (q) { return [q[0], q[1]]; });
    else if (e.t === 'path' && e.closed) pts = tessPath(e, 0.01).map(function (q) { return [q[0], q[1]]; });
    if (pts && pts.length > 2) out.push({id: id, loop: Geom.clean(pts)});
  }
  ids.forEach(function (id) { collect(entById(id), id); });
  return out;
}
