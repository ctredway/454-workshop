/* ---------------- Ellipse, Polygon and Star ----------------
   Three drawing tools, each started with a click on the centre:
     Ellipse  then a corner of its box, or type its width and height ("120,60").
     Polygon  then one of its corners, or type R (to the corners), D (across the corners) or F (across the flats,
              the size a spanner fits). Type S and a number any time for the number of sides.
     Star     then the tip of a point (or type R), then where its inner corners sit (click, or type their radius).
              Type S and a number any time for the number of points.
   A polygon and a star are ordinary closed polylines. An ellipse is a closed path of arcs, each through three
   points on the ellipse, as many as it takes to stay within 0.0005 mm of the true curve: finer than any bit
   cuts, and it offsets, dimensions and exports (as arcs) like any other outline. */
var SHAPE_ELLIPSE_TOL = 0.0005;

function shapeSides(){ var n = Math.round(UICFG.polySides || 6); return n >= 3 && n <= 100 ? n : 6; }
function shapePoints(){ var n = Math.round(UICFG.starPoints || 5); return n >= 3 && n <= 100 ? n : 5; }

// A closed ellipse with its axes square-on, as a path of arcs (or a circle, if it is one).
function ellipseShape(cx, cy, rx, ry){
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!(rx > 1e-6) || !(ry > 1e-6)) return null;
  if (Math.abs(rx - ry) < 1e-9) return {t:'circle', cx:cx, cy:cy, r:rx};
  function E(t){ return {x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t)}; }
  var best = null;
  for (var N = 8; N <= 2048; N *= 2){
    var pts = [], worst = 0;
    for (var i = 0; i < N; i++){
      var t0 = 2 * Math.PI * i / N, t1 = 2 * Math.PI * (i + 1) / N;
      var A = E(t0), B = E(t1), g = arcFrom3(A, B, E((t0 + t1) / 2));
      if (!g){ pts.push([A.x, A.y, 0]); continue; }
      var sw = arcSweepOf(g.a0, g.a1, g.ccw);
      pts.push([A.x, A.y, Math.tan(sw / 4) * (g.ccw ? 1 : -1)]);
      [0.125, 0.25, 0.375, 0.625, 0.75, 0.875].forEach(function (q){
        var P = E(t0 + (t1 - t0) * q);
        worst = Math.max(worst, Math.abs(Math.hypot(P.x - g.cx, P.y - g.cy) - g.r));
      });
    }
    best = pts;
    if (worst <= SHAPE_ELLIPSE_TOL) break;
  }
  return {t:'path', closed:true, pts:best};
}
// A regular polygon: n corners at radius r around (cx, cy), the first at angle a0.
function polygonShape(cx, cy, r, n, a0){
  var pts = [];
  for (var k = 0; k < n; k++){ var a = a0 + 2 * Math.PI * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return {t:'poly', closed:true, pts:pts};
}
// A star: n points at radius r1, inner corners at radius r2, the first point at angle a0.
function starShape(cx, cy, r1, r2, n, a0){
  var pts = [];
  for (var k = 0; k < 2 * n; k++){
    var a = a0 + Math.PI * k / n, r = k % 2 ? r2 : r1;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return {t:'poly', closed:true, pts:pts};
}

// What the tool would make if the pointer (or a typed point) were at p, while drawing. null if nothing yet.
function shapeFromDraw(p){
  if (!DRAW || !p) return null;
  var dx = p.x - DRAW.x, dy = p.y - DRAW.y, r = Math.hypot(dx, dy);
  if (TOOL === 'ellipse' && DRAW.stage === 1) return ellipseShape(DRAW.x, DRAW.y, dx, dy);
  if (TOOL === 'polygon' && DRAW.stage === 1) return r > 1e-6 ? polygonShape(DRAW.x, DRAW.y, r, shapeSides(), Math.atan2(dy, dx)) : null;
  if (TOOL === 'star' && DRAW.stage === 1) return r > 1e-6 ? starShape(DRAW.x, DRAW.y, r, r * 0.5, shapePoints(), Math.atan2(dy, dx)) : null;
  if (TOOL === 'star' && DRAW.stage === 2) return r > 1e-6 && r < DRAW.r ? starShape(DRAW.x, DRAW.y, DRAW.r, r, shapePoints(), DRAW.a) : null;
  return null;
}
function shapeAdd(e, next){
  if (!e) return false;
  pushUndo(); DOC.ents.push(e);
  DRAW = null; stagePrompt(next); persist(); draw();
  return true;
}
// A click for one of the three tools. Returns true if it was one of them.
function shapeToolClick(p){
  if (TOOL !== 'ellipse' && TOOL !== 'polygon' && TOOL !== 'star') return false;
  if (!DRAW){ DRAW = {stage:1, x:p.x, y:p.y}; stagePrompt(TOOL + '1'); return true; }
  if (TOOL === 'star' && DRAW.stage === 1){
    var r = Math.hypot(p.x - DRAW.x, p.y - DRAW.y);
    if (r > 1e-6){ DRAW = {stage:2, x:DRAW.x, y:DRAW.y, r:r, a:Math.atan2(p.y - DRAW.y, p.x - DRAW.x)}; stagePrompt('star2'); }
    return true;
  }
  var e = shapeFromDraw(p);
  if (e) shapeAdd(e, TOOL + '0');
  else if (TOOL === 'star') toast('info', 'Inside the points', 'The inner corners go between the centre and the tips: click closer to the centre.');
  return true;
}
// Typed text for one of the three tools. Returns true if it was one of them (whether or not it was understood).
function shapeToolText(txt){
  if (TOOL !== 'ellipse' && TOOL !== 'polygon' && TOOL !== 'star') return false;
  var t = txt.trim(), m;
  if (TOOL !== 'ellipse' && (m = t.match(/^[Ss]\s*(\d+)$/))){          // S6: sides or points, any time
    var n = +m[1];
    if (n < 3 || n > 100){ toast('warn', 'Between 3 and 100', 'A ' + (TOOL === 'star' ? 'star needs 3 to 100 points.' : 'polygon needs 3 to 100 sides.')); return true; }
    if (TOOL === 'star') UICFG.starPoints = n; else UICFG.polySides = n;
    uiCfgSave(); stagePrompt(TOOL + (DRAW ? DRAW.stage : 0)); draw();
    return true;
  }
  if (!DRAW){                                                          // the centre, typed
    var c = parseNumericPoint(t, null);
    if (c){ DRAW = {stage:1, x:c.x, y:c.y}; stagePrompt(TOOL + '1'); draw(); }
    return true;
  }
  if (TOOL === 'ellipse'){
    var wh = t.split(',');
    if (wh.length === 2 && !/^@/.test(t)){
      var w = lenIn(wh[0]), h = lenIn(wh[1]);
      if (w > 0 && h > 0) shapeAdd(ellipseShape(DRAW.x, DRAW.y, w / 2, h / 2), 'ellipse0');
    }
    return true;
  }
  if (TOOL === 'star' && DRAW.stage === 2){                            // inner radius: "12" or "R12"
    var ri = lenIn(t.replace(/^[Rr]\s*/, ''));
    if (ri > 0 && ri < DRAW.r) shapeAdd(starShape(DRAW.x, DRAW.y, DRAW.r, ri, shapePoints(), DRAW.a), 'star0');
    else if (!isNaN(ri)) toast('warn', 'Smaller than the points', 'The inner corners’ radius has to be less than the points’ (' + +DRAW.r.toFixed(3) + ' mm).');
    return true;
  }
  // polygon corner or star tip: R to the corners, D across them, F across the flats (polygon), or a point
  m = t.match(/^([RrDdFf])\s*(.+)$/);
  var n2 = TOOL === 'star' ? shapePoints() : shapeSides(), r = NaN;
  if (m){
    var v = lenIn(m[2]), k = m[1].toUpperCase();
    r = k === 'R' ? v : k === 'D' ? v / 2 : (TOOL === 'polygon' ? v / 2 / Math.cos(Math.PI / n2) : NaN);
    if (!(r > 0)) return true;
    // typed sizes stand square: a polygon on a flat, a star with a point straight up
    var a0 = TOOL === 'polygon' ? -Math.PI / 2 + Math.PI / n2 : Math.PI / 2;
    if (TOOL === 'polygon') shapeAdd(polygonShape(DRAW.x, DRAW.y, r, n2, a0), 'polygon0');
    else { DRAW = {stage:2, x:DRAW.x, y:DRAW.y, r:r, a:a0}; stagePrompt('star2'); draw(); }
    return true;
  }
  var p = parseNumericPoint(t, {x:DRAW.x, y:DRAW.y});
  if (p) shapeToolClick(p);
  return true;
}
// The dashed preview while drawing.
function shapeToolPreview(ctx, m){
  var e = shapeFromDraw(m);
  if (TOOL === 'star' && DRAW && DRAW.stage === 2 && !e){                  // pointer past the tips: show the tips' circle
    var c0 = w2s(DRAW.x, DRAW.y); ctx.arc(c0.x, c0.y, DRAW.r * VIEW.scale, 0, Math.PI * 2); return;
  }
  if (!e) return;
  if (TOOL === 'ellipse' && e.t === 'circle'){ var cc = w2s(e.cx, e.cy); ctx.arc(cc.x, cc.y, e.r * VIEW.scale, 0, Math.PI * 2); return; }
  if (TOOL === 'ellipse'){
    var ce = w2s(DRAW.x, DRAW.y);
    ctx.ellipse(ce.x, ce.y, Math.abs(m.x - DRAW.x) * VIEW.scale, Math.abs(m.y - DRAW.y) * VIEW.scale, 0, 0, Math.PI * 2);
    return;
  }
  e.pts.forEach(function (q, i){ var s = w2s(q[0], q[1]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  ctx.closePath();
}
