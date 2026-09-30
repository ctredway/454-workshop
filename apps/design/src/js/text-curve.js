/* ---------------- text along a curve ----------------
   Select a text and a line, arc, circle or outline, and press Text on curve: the letters are laid along it, each
   turned to follow it, and the text stays text (its words, font and height can still be changed).
   The text keeps its own copy of the curve (e.curve: points in mm relative to the text's anchor), so moving,
   turning, scaling or mirroring the text carries the curve with it, changing the letter height doesn't change
   the curve, and the curve itself can be deleted or kept as a guide. Settings, in the Text panel:
     e.cpos   'start' | 'center' | 'end'   where along the curve the text sits (on a closed curve: begins at,
                                           centres on, or ends at its top, or with Reverse, its bottom)
     e.cside  'above' | 'below'            letters stand on the curve, or hang from it (tops on the curve)
     e.cgap   mm                            space between the curve and the letters
     e.crev   true                          run the other way (a circle's bottom, reading left to right)
   An open curve is stored reading left to right and a closed one clockwise, so by default the text sits on top
   of the curve, reading left to right. */

// The curve's points, in world coordinates, or null for a shape that can't carry text.
function textCurvePoints(e){
  if (!e) return null;
  var step = 0.02, pts = null, closed = false;
  if (e.t === 'line') pts = [[e.x1, e.y1], [e.x2, e.y2]];
  else if (e.t === 'arc'){
    var sw = arcSweepOf(e.a0, e.a1, e.ccw), n = Math.max(2, Math.ceil(sw / step));
    pts = [];
    for (var i = 0; i <= n; i++){ var q = arcPtAt(e, sw * i / n); pts.push([q.x, q.y]); }
  } else if (e.t === 'circle'){
    var m = Math.max(24, Math.ceil(2 * Math.PI / step));
    pts = []; closed = true;
    for (var j = 0; j < m; j++){ var a = 2 * Math.PI * j / m; pts.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]); }
  } else if (e.t === 'rect'){ pts = [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]]; closed = true; }
  else if (e.t === 'poly'){ pts = e.pts.map(function (q){ return [q[0], q[1]]; }); closed = !!e.closed; }
  else if (e.t === 'path'){ pts = tessPath(e, step).map(function (q){ return [q[0], q[1]]; }); closed = !!e.closed; }
  if (!pts || pts.length < 2) return null;
  var len = 0;
  for (var k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  if (len < 1e-6) return null;
  return {pts:pts, closed:closed};
}
// Lay text e along the curve c (from textCurvePoints). Resets its turn and mirror: the curve sets its direction.
function textFitCurve(e, c){
  var pts = c.pts.slice();
  if (c.closed){
    var a2 = 0; for (var i = 0; i < pts.length; i++){ var p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
    if (a2 > 0) pts.reverse();                                    // clockwise
  } else if (pts[0][0] > pts[pts.length - 1][0] + 1e-9) pts.reverse();   // left to right
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach(function (p){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  var ax = (x0 + x1) / 2, ay = (y0 + y1) / 2;
  e.x = ax; e.y = ay; e.rot = 0; delete e.fy; delete e.sw;
  e.curve = {pts: pts.map(function (p){ return [p[0] - ax, p[1] - ay]; }), closed: c.closed};
  if (!e.cpos) e.cpos = 'center';
  if (!e.cside) e.cside = 'above';
  if (!(e.cgap >= 0)) e.cgap = 0;
}
function textStraighten(e){
  delete e.curve; delete e.cpos; delete e.cside; delete e.cgap; delete e.crev;
}
function textCurveSig(e){
  return e.curve ? [JSON.stringify(e.curve), e.cpos, e.cside, e.cgap, !!e.crev].join('\u0002') : '';
}
// The curve as used for laying out: points in local coordinates, in running order, with
// the distance along it to each point. A closed curve starts at its top (bottom when reversed) and repeats that
// point at the end.
function textCurveRun(e){
  var pts = e.curve.pts.map(function (p){ return [p[0], p[1]]; });
  if (e.crev) pts.reverse();
  if (e.curve.closed){
    var best = 0;
    for (var i = 1; i < pts.length; i++) if (e.crev ? pts[i][1] < pts[best][1] - 1e-9 : pts[i][1] > pts[best][1] + 1e-9) best = i;
    pts = pts.slice(best).concat(pts.slice(0, best));
    pts.push(pts[0]);
  }
  var cum = [0];
  for (var j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  return {pts:pts, cum:cum, len:cum[cum.length - 1], closed:e.curve.closed};
}
// Point and direction at distance s along the run. An open curve carries on straight past its ends; a closed
// one goes round again.
function textCurveAt(run, s){
  var pts = run.pts, cum = run.cum, n = pts.length;
  if (run.closed){ s = s % run.len; if (s < 0) s += run.len; }
  var i;
  if (s <= 0) i = 0;
  else if (s >= run.len) i = n - 2;
  else { var lo = 0, hi = n - 1; while (hi - lo > 1){ var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; } i = lo; }
  while (i < n - 2 && cum[i + 1] - cum[i] < 1e-12) i++;
  var a = pts[i], b = pts[i + 1], L = cum[i + 1] - cum[i] || 1e-12;
  var tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L, u = s - cum[i];
  return {x: a[0] + tx * u, y: a[1] + ty * u, tx:tx, ty:ty};
}
// The letters' outlines in local coordinates (y up), laid along the curve. fs: font size; lineH: line spacing.
function textCurveContours(e, font, fs, lineH){
  var run = textCurveRun(e), gap = e.cgap || 0, out = [], longest = 0;
  String(e.str).split('\n').forEach(function (line, li){
    var W = font.getAdvanceWidth(line, fs);
    longest = Math.max(longest, W);
    var s0 = e.cpos === 'start' ? 0 : e.cpos === 'end' ? (run.closed ? -W : run.len - W) : (run.closed ? -W / 2 : (run.len - W) / 2);
    var off = (e.cside === 'below' ? -(gap + e.h) : gap) - li * lineH;
    font.forEachGlyph(line, 0, 0, fs, {kerning:true}, function (glyph, gx, gy, gfs){
      var adv = (glyph.advanceWidth || 0) * gfs / font.unitsPerEm;
      var at = textCurveAt(run, s0 + gx + adv / 2), nx = -at.ty, ny = at.tx;
      var raw = [];
      flattenGlyphCommands(glyph.getPath(-adv / 2, 0, gfs).commands, 0.01, raw);
      raw.forEach(function (ct){
        out.push(ct.map(function (p){
          var u = p[0], v = -p[1] + off;                        // font y is down
          return [at.x + u * at.tx + v * nx, at.y + u * at.ty + v * ny];
        }));
      });
    });
  });
  TEXT_CURVE_LONG.set(e, longest > run.len + 1e-6);
  return out;
}
var TEXT_CURVE_LONG = new WeakMap();                              // does the text run past the curve's length?
function textCurveTooLong(e){ return !!(e.curve && TEXT_CURVE_LONG.get(e)); }

// The Text on curve button: a text and one curve selected.
function textOnCurveClick(){
  var texts = SEL.filter(function (i){ return DOC.ents[i] && DOC.ents[i].t === 'text'; });
  var others = SEL.filter(function (i){ return DOC.ents[i] && DOC.ents[i].t !== 'text'; });
  if (texts.length !== 1 || others.length !== 1){
    toast('info', 'Select a text and a curve', 'Select one text and one line, arc, circle or outline (Shift+click adds to the selection), then press Text on curve.');
    if (!SEL.length) stagePrompt('selFirst');
    return false;
  }
  var c = textCurvePoints(DOC.ents[others[0]]);
  if (!c){ toast('warn', 'Text can’t follow that', 'Use a line, an arc, a circle, a rectangle or an outline. For a group, ungroup it and pick one piece.'); return false; }
  pushUndo();
  var e = DOC.ents[texts[0]];
  textFitCurve(e, c);
  SEL = [texts[0]];
  persist(); draw();
  toast('ok', 'Text on the curve', 'It sits on top, reading left to right. Double-click the text to change where it sits, which side, the gap, or to reverse it. The curve is still there to keep or delete.');
  return true;
}
// The Text panel's curve settings: shown for text on a curve.
function textCurveRowsShow(e){
  var box = document.getElementById('txtCurveRows');
  if (!box) return;
  box.hidden = !e.curve;
  document.getElementById('txtAlign').disabled = !!e.curve;   // Along the curve does its job
  if (!e.curve) return;
  document.getElementById('txtCPos').value = e.cpos || 'center';
  document.getElementById('txtCSide').value = e.cside || 'above';
  document.getElementById('txtCGap').value = +(e.cgap || 0).toFixed(3);
  document.getElementById('txtCRev').checked = !!e.crev;
  textCurveNote(e);
}
function textCurveNote(e){
  var n = document.getElementById('txtCurveNote');
  if (n) n.textContent = textCurveTooLong(e) ? 'The text is longer than the curve: make the letters smaller, or the curve longer.' : '';
}
// Read the Text panel's curve settings into e.
function textCurveRowsRead(e){
  if (!e.curve) return;
  e.cpos = document.getElementById('txtCPos').value;
  e.cside = document.getElementById('txtCSide').value;
  var g = parseFloat(document.getElementById('txtCGap').value);
  if (g >= 0 && isFinite(g)) e.cgap = g;
  e.crev = document.getElementById('txtCRev').checked || undefined;
  if (!e.crev) delete e.crev;
}
