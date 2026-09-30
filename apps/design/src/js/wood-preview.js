/* ---------------- Preview in wood ----------------
   What the material looks like after the ticked toolpaths: every move of every toolpath, in order, cut into a
   fine grid of heights over the material by the bit's real shape (a flat end mill, a ball-nose, or a V-bit at its
   angle and tip), then drawn shaded, lit from the top left. Pockets, V-carving, tabs and through-cuts show as
   they'll come off the machine, and so would a mistake: a wrong depth, a missed area, or a rapid move (G0) that
   cuts wood, which is counted and said. (A rapid down into wood already cleared, as between a pocket's passes,
   cuts nothing and isn't counted.)
   woodSim and woodShade are plain functions of their inputs (tested on their own); woodPreviewOpen is the window. */
var WOOD_TOP = [226, 190, 140], WOOD_DEEP = [176, 128, 82], WOOD_BOARD = [84, 90, 98];

// The bit's shape for a toolpath: {kind:'flat'|'ball'|'v', r, half (V: half the included angle, radians), tip}
function woodTool(tp){
  var r = (tp.dia > 0 ? tp.dia : 3) / 2;
  if (tp.side === 'vcarve' || tp.side === 'chamfer' || tp.side === 'inlay')
    return {kind:'v', r: tp.dia > 0 ? r : 50, half: (tp.vAngle || 60) / 2 * Math.PI / 180, tip: tp.vTip || 0};
  var t = tp.toolId && typeof libTool === 'function' ? libTool(tp.toolId) : null;
  if (t && /ball/i.test(t.typeName || '')) return {kind:'ball', r:r};
  return {kind:'flat', r:r};
}
// How far the bit reaches sideways when its tip is `depth` below the top: a V-bit's cone widens with depth.
function woodReach(tool, depth){
  if (tool.kind !== 'v') return tool.r;
  return Math.min(tool.r, tool.tip / 2 + Math.max(0, depth) * Math.tan(tool.half));
}
// Height of the bit's cutting edge at distance d from its axis, above its tip (Infinity beyond its reach).
function woodEdge(tool, d){
  if (d > tool.r + 1e-12) return Infinity;
  if (tool.kind === 'flat') return 0;
  if (tool.kind === 'ball') return tool.r - Math.sqrt(Math.max(0, tool.r * tool.r - d * d));
  return d <= tool.tip / 2 ? 0 : (d - tool.tip / 2) / Math.tan(tool.half);
}
// The simulation. parts: [{moves, tool}] in cutting order; box: {x0, y0, x1, y1, top, bottom} (the material);
// cell: the grid's spacing in mm. Returns {nx, ny, cell, x0, y0, top, bottom, z (Float32Array, row 0 at y0),
// rapidsIn (G0 moves that cut more than 0.05 mm of wood), deepest}.
function woodSim(parts, box, cell){
  var nx = Math.max(1, Math.ceil((box.x1 - box.x0) / cell)), ny = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
  var z = new Float32Array(nx * ny); z.fill(box.top);
  var rapidsIn = 0;
  // cut one straight move into the grid; returns the most it took off anywhere
  function stamp(tool, ax, ay, az, bx, by, bz){
    if (Math.min(az, bz) >= box.top) return 0;
    var most = 0;
    var reach = woodReach(tool, box.top - Math.min(az, bz));
    var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - box.x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - box.x0) / cell));
    var j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - box.y0) / cell)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - box.y0) / cell));
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (var j = j0; j <= j1; j++){
      var cy = box.y0 + (j + 0.5) * cell, row = j * nx;
      for (var i = i0; i <= i1; i++){
        var cx = box.x0 + (i + 0.5) * cell, h;
        if (tool.kind === 'flat'){
          // a flat bit cuts to its tip wherever the cell is under it: the lowest tip height while within reach
          var fx = ax - cx, fy = ay - cy, qa = L2, qb = 2 * (fx * dx + fy * dy), qc = fx * fx + fy * fy - tool.r * tool.r;
          if (qa < 1e-18){ if (qc > 0) continue; h = Math.min(az, bz); }
          else {
            var disc = qb * qb - 4 * qa * qc;
            if (disc < 0) continue;
            var sq = Math.sqrt(disc), t1 = (-qb - sq) / (2 * qa), t2 = (-qb + sq) / (2 * qa);
            if (t2 < 0 || t1 > 1) continue;
            t1 = Math.max(0, t1); t2 = Math.min(1, t2);
            h = Math.min(az + (bz - az) * t1, az + (bz - az) * t2);
          }
        } else {
          var t = L2 > 1e-18 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / L2)) : 0;
          var px = ax + dx * t, py = ay + dy * t, e = woodEdge(tool, Math.hypot(cx - px, cy - py));
          if (e === Infinity) continue;
          h = az + (bz - az) * t + e;
        }
        if (h < z[row + i]){ if (z[row + i] - h > most) most = z[row + i] - h; z[row + i] = h; }
      }
    }
    return most;
  }
  parts.forEach(function (part){
    var x = null, y = null, zz = null;
    (part.moves || []).forEach(function (m){
      var nxp = m.x !== undefined ? m.x : x, nyp = m.y !== undefined ? m.y : y, nzp = m.z !== undefined ? m.z : zz;
      if (x !== null && y !== null && zz !== null && nxp !== null && nyp !== null && nzp !== null){
        // long moves in short steps, so each one's box of cells stays small
        var len = Math.hypot(nxp - x, nyp - y), n = Math.max(1, Math.ceil(len / Math.max(part.tool.r * 2, cell * 8)));
        var took = 0;
        for (var k = 0; k < n; k++){
          var a = k / n, b = (k + 1) / n;
          took = Math.max(took, stamp(part.tool, x + (nxp - x) * a, y + (nyp - y) * a, zz + (nzp - zz) * a, x + (nxp - x) * b, y + (nyp - y) * b, zz + (nzp - zz) * b));
        }
        if (m.g === 0 && took > 0.05) rapidsIn++;                        // a rapid move that cut wood
      }
      x = nxp; y = nyp; zz = nzp;
    });
  });
  var deepest = box.top;
  for (var q = 0; q < z.length; q++) if (z[q] < deepest) deepest = z[q];
  return {nx:nx, ny:ny, cell:cell, x0:box.x0, y0:box.y0, top:box.top, bottom:box.bottom, z:z, rapidsIn:rapidsIn, deepest:deepest};
}
// The picture: RGBA, row 0 at the top of the material (the far side, as on screen). Light from the top left.
function woodShade(sim){
  var nx = sim.nx, ny = sim.ny, z = sim.z, out = new Uint8ClampedArray(nx * ny * 4);
  var span = Math.max(1e-6, sim.top - sim.bottom), Lx = -0.5, Ly = 0.5, Lz = 0.707, ln = Math.hypot(Lx, Ly, Lz);
  Lx /= ln; Ly /= ln; Lz /= ln;
  function at(i, j){ i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); return z[j * nx + i]; }
  for (var j = 0; j < ny; j++){
    var oy = (ny - 1 - j) * nx * 4;                                   // world y up, picture rows down
    for (var i = 0; i < nx; i++){
      var h = z[j * nx + i], o = oy + i * 4, c;
      if (h <= sim.bottom + 1e-6) c = WOOD_BOARD;                      // cut through: the spoilboard shows
      else {
        var f = Math.min(1, Math.max(0, (sim.top - h) / span)), k = Math.pow(f, 0.6);
        c = [WOOD_TOP[0] + (WOOD_DEEP[0] - WOOD_TOP[0]) * k, WOOD_TOP[1] + (WOOD_DEEP[1] - WOOD_TOP[1]) * k, WOOD_TOP[2] + (WOOD_DEEP[2] - WOOD_TOP[2]) * k];
      }
      var gx = (at(i + 1, j) - at(i - 1, j)) / (2 * sim.cell), gy = (at(i, j + 1) - at(i, j - 1)) / (2 * sim.cell);
      var nl = Math.hypot(gx, gy, 1), lit = Math.max(0, (-gx * Lx - gy * Ly + Lz) / nl);
      var s = 0.45 + 0.6 * lit;
      out[o] = c[0] * s; out[o + 1] = c[1] * s; out[o + 2] = c[2] * s; out[o + 3] = 255;
    }
  }
  return out;
}
// The ticked toolpaths of the sheet shown, as parts for woodSim, in cutting order.
function woodParts(){
  return tpList().filter(function (tp){ return !tp.exclude && (typeof multiSheet !== 'function' || !multiSheet() || tpSheetOf(tp) === DOC.activeSheet); })
    .map(function (tp){ if (tpStale(tp)) tpGenerate(tp); return {moves: tp.moves || [], tool: woodTool(tp), name: tp.name}; })
    .filter(function (p){ return p.moves.length; });
}
function woodBox(){
  var sr = stockRect(), top = tpSurface(), t = DOC.stock.t > 0 ? DOC.stock.t : 0;
  return {x0: sr.x0, y0: sr.y0, x1: sr.x1, y1: sr.y1, top: top, bottom: t > 0 ? top - t : -Infinity};
}
function woodCell(box){
  var area = (box.x1 - box.x0) * (box.y1 - box.y0);
  return Math.min(1, Math.max(0.1, Math.sqrt(area / 2.5e6)));      // about 2.5 million cells at most
}
function woodPreviewOpen(){
  if (!camReady()){ toast('info', 'Toolpaths are still loading', 'Try again in a moment.'); return; }
  var parts = woodParts();
  if (!parts.length){ toast('info', 'Nothing to preview', 'Tick the toolpaths to include, then preview again.'); return; }
  var modal = document.getElementById('woodModal');
  modal.hidden = false;
  document.getElementById('woodNote').textContent = 'Working it out…';
  setTimeout(function (){                                            // let the window show first
    var box = woodBox(), cell = woodCell(box), bottomless = !(box.bottom > -Infinity);
    if (bottomless) box.bottom = box.top - 50;
    var sim = woodSim(parts, box, cell), px = woodShade(sim);
    var cv = document.getElementById('woodCv');
    cv.width = sim.nx; cv.height = sim.ny;
    var g = cv.getContext && cv.getContext('2d');
    if (g && typeof ImageData !== 'undefined') g.putImageData(new ImageData(px, sim.nx, sim.ny), 0, 0);
    var depth = box.top - sim.deepest, said = [];
    said.push(parts.length + (parts.length === 1 ? ' toolpath' : ' toolpaths') + ', cut in order. Deepest cut ' + fmtDisp(depth) + ' ' + unitTag() +
      (bottomless ? ' (the material’s thickness isn’t set, so through-cuts don’t show as holes).' : '.'));
    said.push('Worked out from the toolpaths’ moves and bits, to ' + fmtDisp(cell, 2) + ' ' + unitTag() + '. Check it looks as you expect.');
    var note = document.getElementById('woodNote');
    note.textContent = said.join(' ');
    var warn = document.getElementById('woodWarn');
    warn.textContent = sim.rapidsIn ? sim.rapidsIn + (sim.rapidsIn === 1 ? ' rapid move goes' : ' rapid moves go') +
      ' into wood at full speed. Don’t cut this: check the toolpaths’ safe height and the material setup.' : '';
    warn.hidden = !sim.rapidsIn;
    woodPreviewOpen.last = sim;
  }, 30);
}
function woodPreviewClose(){ document.getElementById('woodModal').hidden = true; }
function woodWire(){
  var m = document.getElementById('woodModal');
  if (!m) return;
  document.getElementById('woodX').addEventListener('click', woodPreviewClose);
  document.getElementById('woodClose').addEventListener('click', woodPreviewClose);
  m.addEventListener('click', function (e){ if (e.target === m) woodPreviewClose(); });
  document.getElementById('woodPanel').addEventListener('keydown', function (e){ if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); woodPreviewClose(); } });
}
