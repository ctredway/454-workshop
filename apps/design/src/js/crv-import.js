// VCarve's sheets: a multi-sheet project lays every sheet out in the same space, each vector's header
// ends with the ID of the sheet it's on, and the sheets themselves (name and ID) are listed after
// the vectors (vcCadSheet). Found by reading Letters.crv: the IDs split the 31 outlines 21 / 10, and
// every overlapping pair of outlines is one from each sheet.
var UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
function crvAscii(vd, a, b){ var t = ''; for (var k = Math.max(0, a); k < Math.min(vd.length, b); k++) t += String.fromCharCode(vd[k]); return t; }
function crvSheetBefore(vd, at){
  var m = crvAscii(vd, at - 160, at).match(UUID_RE);
  return m ? m[m.length - 1] : null;
}
function crvSheets(vd){
  var tag = crvAscii(vd, 0, vd.length).indexOf('vcCadSheet');
  if (tag < 0) return [];
  var out = [];
  for (var q = tag; q + 8 < vd.length; q++){
    if (vd[q] !== 0xFF || vd[q + 1] !== 0xFE || vd[q + 2] !== 0xFF) continue;     // a name, as UTF-16
    var len = vd[q + 3], name = '';
    for (var c = 0; c < len; c++) name += String.fromCharCode(vd[q + 4 + 2 * c] | (vd[q + 5 + 2 * c] << 8));
    var id = (crvAscii(vd, q - 36, q).match(UUID_RE) || [])[0];                      // the sheet's ID sits just before its name
    if (id && name) out.push({id: id, name: name});
    q += 3 + 2 * len;
  }
  return out;
}
// The material, from the MaterialSize stream: it holds the block's two opposite corners (x, y, z at 6, 14, 22
// and at 30, 38, 46), not its size. Its size is the difference; XY zero is wherever 0, 0 falls in it, and Z
// zero is at whichever of its top and bottom sits at 0. (The high corner used to be taken as the size, which
// is only right with XY zero at the low corner: a 12 x 9 job zeroed at its centre was read as 6 x 4.5, with
// no thickness. Seen in five projects; none yet with Z zero at the bottom.)
function crvMaterial(ms){
  var out = {w: 0, h: 0, t: 0, zero: 'top', x0: 0, y0: 0};
  if (!ms || ms.length < 54) return out;
  var dv = new DataView(ms.buffer, ms.byteOffset, ms.byteLength), v = [];
  for (var k = 0; k < 6; k++) v.push(dv.getFloat64(6 + 8 * k, true));
  var ok = function (n){ return isFinite(n) && Math.abs(n) < 1e6; };
  if (ok(v[0]) && ok(v[3]) && v[3] - v[0] > 0){ out.w = v[3] - v[0]; out.x0 = v[0]; }
  if (ok(v[1]) && ok(v[4]) && v[4] - v[1] > 0){ out.h = v[4] - v[1]; out.y0 = v[1]; }
  if (ok(v[2]) && ok(v[5]) && v[5] - v[2] > 0.01 && v[5] - v[2] < 500){ out.t = v[5] - v[2]; out.zero = Math.abs(v[2]) < 1e-6 ? 'bottom' : 'top'; }
  return out;
}
// Where XY zero is on a material w by h whose low corner is at (x0, y0): Design's name for it, or null if it
// isn't at a corner or the centre.
function crvZeroAt(w, h, x0, y0){
  var e = Math.max(1e-6, Math.max(w, h) * 1e-6), near = function (a, b){ return Math.abs(a - b) <= e; };
  if (near(x0, 0) && near(y0, 0)) return 'corner';
  if (near(x0, -w / 2) && near(y0, -h / 2)) return 'center';
  if (near(x0, -w) && near(y0, 0)) return 'fr';
  if (near(x0, 0) && near(y0, -h)) return 'bl';
  if (near(x0, -w) && near(y0, -h)) return 'br';
  return null;
}
function crvExtract(buf){
  var ole = oleParse(buf);
  if (!ole) return null;
  var vd = ole.stream('2dDataV2');
  if (!vd) return null;
  var mat = crvMaterial(ole.stream('MaterialSize'));
  var stockW = mat.w, stockH = mat.h, stockT = mat.t, stockZero = mat.zero;
  var dv = new DataView(vd.buffer, vd.byteOffset, vd.byteLength);
  // layer markers: ff fe ff <len> utf16 strings; layer names precede their content.
  // VCarve serializes the 'Toolpath Previews' layer first, drawing layers after.
  var layers = [];
  for (var si = 0; si < vd.length - 4; si++){
    if (vd[si] === 0xFF && vd[si+1] === 0xFE && vd[si+2] === 0xFF){
      var slen = vd[si+3];
      if (slen >= 1 && slen <= 96 && si + 4 + slen*2 <= vd.length){
        var txt = '', printable = true;
        for (var sc = 0; sc < slen; sc++){
          var ch = vd[si+4+sc*2] | (vd[si+5+sc*2] << 8);
          if (ch < 32 || ch > 126){ printable = false; break; }
          txt += String.fromCharCode(ch);
        }
        if (printable && layers.length < 2) layers.push({off: si, name: txt});
      }
    }
    if (layers.length >= 2) break;
  }
  var drawingStart = 0;
  if (layers.length && /toolpath/i.test(layers[0].name))
    drawingStart = layers.length > 1 ? layers[1].off : vd.length; // previews-only file: nothing is drawing
  var contours = [], preview = [], contourIds = [], contourSheets = [], contourAts = [], contourEnds = [], i = 0, L = vd.length;
  // A segment starts with its kind: 0 line, 1 arc (a bulge follows), 2 cubic Bezier (two control
  // points follow). Missing the Bezier kind used to drop whole outlines: VCarve's smooth curves
  // are Beziers, so any shape with one simply vanished on import.
  function isHdr(o){ return o+9 <= L && (vd[o] === 0 || vd[o] === 1 || vd[o] === 2) && vd[o+1] === 2 && vd[o+2] === 0 && vd[o+3] === 0 && vd[o+4] === 0; }
  while (i < L - 73){
    var n = dv.getInt32(i, true);
    if (n >= 2 && n <= 100000 && isHdr(i+4)){
      var o = i + 4, spans = [], ok = true;
      for (var k = 0; k < n; k++){
        if (!isHdr(o) || o + 61 > L){ ok = false; break; }
        var x = dv.getFloat64(o+9, true), y = dv.getFloat64(o+17, true);
        if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5){ ok = false; break; }
        if (vd[o] === 1){
          if (o + 69 > L){ ok = false; break; }
          var b = dv.getFloat64(o+61, true);
          if (!isFinite(b) || Math.abs(b) > 100){ ok = false; break; }
          spans.push([x, y, b]); o += 69;
        } else if (vd[o] === 2){
          // Bezier: start, end, then the two control points. Flattened into short straight
          // steps, fine enough that the result stays within 0.01 mm of the true curve.
          if (o + 93 > L){ ok = false; break; }
          var ex2 = dv.getFloat64(o+33, true), ey2 = dv.getFloat64(o+41, true);
          var c1x = dv.getFloat64(o+61, true), c1y = dv.getFloat64(o+69, true);
          var c2x = dv.getFloat64(o+77, true), c2y = dv.getFloat64(o+85, true);
          if (![ex2, ey2, c1x, c1y, c2x, c2y].every(function (v) { return isFinite(v) && Math.abs(v) < 1e5; })){ ok = false; break; }
          var hull = Math.hypot(c1x - x, c1y - y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(ex2 - c2x, ey2 - c2y);
          var steps = Math.max(8, Math.min(200, Math.ceil(Math.sqrt(hull / 0.01) * 0.75)));
          spans.push([x, y, 0]);
          for (var bs = 1; bs < steps; bs++){
            var t = bs / steps, u = 1 - t;
            var bx = u*u*u*x + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*ex2;
            var by = u*u*u*y + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*ey2;
            spans.push([bx, by, 0]);
          }
          o += 93;
        } else { spans.push([x, y, 0]); o += 61; }
      }
      if (ok && spans.length >= n){
        (i < drawingStart ? preview : contours).push(spans);
        // VCarve follows each vector with its 16-byte ID; toolpaths list the IDs of the vectors they use
        if (i >= drawingStart){
          var hx = '';
          if (o + 16 <= L) for (var hb = 0; hb < 16; hb++) hx += (vd[o + hb] < 16 ? '0' : '') + vd[o + hb].toString(16);
          contourIds.push(/^0+$/.test(hx) ? null : hx);
          contourSheets.push(crvSheetBefore(vd, i));      // the sheet it's on (multi-sheet projects)
          contourAts.push(i); contourEnds.push(o);        // where it is in the data: text's letters are found by it (crv-text.js)
        }
        i = o; continue;
      }
    }
    i++;
  }
  // Text: put each letter where VCarve does, or leave the block out and say so (crv-text.js). A block that
  // can't be read at all is left as it was found.
  var text = {placed: 0, left: [], drop: {}, sheets: {}};
  try { text = crvTextApply(vd, dv, contours, contourAts, contourEnds); } catch (e){ text.left.push({said: '', why: 'the text couldn\u2019t be read (' + e.message + ')', unread: true}); }
  Object.keys(text.sheets).forEach(function (k){ if (!contourSheets[k]) contourSheets[k] = text.sheets[k]; });
  if (Object.keys(text.drop).length){
    var keep = function (v, k){ return !text.drop[k]; };
    contours = contours.filter(keep); contourIds = contourIds.filter(keep); contourSheets = contourSheets.filter(keep);
  }
  var toolpaths = [];
  try{ var td = ole.stream('ToolpathData'); if (td){ toolpaths = vcToolpathsFrom(td); vcToolpathVectors(td, toolpaths, contourIds); } }catch(e){}   // never block the import
  return {stockW: stockW, stockH: stockH, stockT: stockT, stockZero: stockZero, stockAt: [mat.x0, mat.y0], contours: contours, contourIds: contourIds,
          contourSheets: contourSheets, sheets: crvSheets(vd), preview: preview, toolpaths: toolpaths,
          textPlaced: text.placed, textLeft: text.left};
}
function crvToDoc(ex, scale){
  var ents = [];
  ex.contours.forEach(function(spans, ci){
    var vcId = ex.contourIds ? ex.contourIds[ci] : null;           // VCarve's ID, so converted toolpaths find it
    var vcSheet = ex.contourSheets ? ex.contourSheets[ci] : null;   // and its sheet, in a multi-sheet project
    function tag(e){ if (vcId) e.vcId = vcId; if (vcSheet) e.vcSheet = vcSheet; return e; }
    var sc = spans.map(function(sp){ return [sp[0]*scale, sp[1]*scale, sp[2]]; });
    // circle: 4 spans, uniform quarter bulge, equidistant from centroid
    if (sc.length === 4 && sc.every(function(sp){ return Math.abs(Math.abs(sp[2]) - 0.41421356) < 1e-4; })){
      var cx = (sc[0][0]+sc[1][0]+sc[2][0]+sc[3][0])/4;
      var cy = (sc[0][1]+sc[1][1]+sc[2][1]+sc[3][1])/4;
      var r = Math.hypot(sc[0][0]-cx, sc[0][1]-cy);
      if (sc.every(function(sp){ return Math.abs(Math.hypot(sp[0]-cx, sp[1]-cy) - r) < Math.max(1e-6, r*1e-4); })){
        ents.push(tag({t:'circle', cx:cx, cy:cy, r:r}));
        return;
      }
    }
    if (sc.every(function(sp){ return Math.abs(sp[2]) < 1e-9; })){
      ents.push(tag({t:'poly', pts: sc.map(function(sp){ return [sp[0], sp[1]]; }), closed:true}));
    } else {
      ents.push(tag({t:'path', pts: sc, closed:true}));
    }
  });
  var st = {w: Math.max(10, ex.stockW*scale), h: Math.max(10, ex.stockH*scale), origin:'corner'};
  if (ex.stockT > 0){ st.t = ex.stockT * scale; st.zero = ex.stockZero || 'top'; }
  // XY zero where the project has it: at a corner or the centre of the material. Anywhere else, the shapes are
  // moved so the material's front-left corner is zero, and `moved` says by how much.
  var moved = null;
  if (ex.stockAt && ex.stockW > 0 && ex.stockH > 0){
    var zero = crvZeroAt(ex.stockW, ex.stockH, ex.stockAt[0], ex.stockAt[1]);
    if (zero) st.origin = zero;
    else { moved = [-ex.stockAt[0] * scale, -ex.stockAt[1] * scale]; ents.forEach(function (e){ moveEntity(e, moved[0], moved[1]); }); }
  }
  return {stock: st, ents: ents, guides: [], moved: moved};
}

