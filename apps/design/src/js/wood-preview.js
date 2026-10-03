/* ---------------- Preview in wood ----------------
   What the material looks like after the ticked toolpaths: every move of every toolpath, in order, cut into a
   fine grid of heights over the material by the bit's real shape (a flat end mill, a ball-nose, or a V-bit at its
   angle and tip), then drawn shaded, lit from the top left. Pockets, V-carving, tabs and through-cuts show as
   they'll come off the machine, and so would a mistake: a wrong depth, a missed area, or a rapid move (G0) that
   cuts wood, which is counted and said. (A rapid down into wood already cleared, as between a pocket's passes,
   cuts nothing and isn't counted.)
   woodSim and woodShade are plain functions of their inputs (tested on their own); woodPreviewOpen is the window. */
var WOOD_TOP = [226, 190, 140], WOOD_DEEP = [176, 128, 82], WOOD_BOARD = [84, 90, 98];
// Wood thinner than sim.thin above the bottom of the material, in amber: tabs are a fraction of a millimetre to a
// few millimetres at the bottom of a deep cut, so in wood colour they're all but invisible; and a skin that's nearly
// cut through is worth seeing too.
var WOOD_THIN = [236, 150, 38];
// How thin counts as thin: 2 mm, or the thickest tab the ticked toolpaths leave, and a little.
function woodThinBand(){
  var t = 2;
  tpList().forEach(function (tp){ if (!tp.exclude && tp.tabsOn && tp.tabThk > 0) t = Math.max(t, tp.tabThk + 0.25); });
  return t;
}
// The colour of wood at height h: spoilboard where it's cut through, amber where it's thin, else wood by depth.
function woodColour(sim, h){
  if (h <= sim.bottom + 1e-6) return WOOD_BOARD;
  if (sim.thin > 0 && h < sim.bottom + sim.thin) return WOOD_THIN;
  var f = Math.pow(Math.min(1, Math.max(0, (sim.top - h) / Math.max(1e-6, sim.top - sim.bottom))), 0.6);
  return [WOOD_TOP[0] + (WOOD_DEEP[0] - WOOD_TOP[0]) * f, WOOD_TOP[1] + (WOOD_DEEP[1] - WOOD_TOP[1]) * f, WOOD_TOP[2] + (WOOD_DEEP[2] - WOOD_TOP[2]) * f];
}

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
// One straight move of the bit cut into a job's grid of heights; returns the most it took off anywhere. The cells
// it changed are added to job.dirty ({i0, j0, i1, j1}), for whoever is drawing the job as it's cut.
function woodStamp(job, tool, ax, ay, az, bx, by, bz){
  if (Math.min(az, bz) >= job.top) return 0;
  var nx = job.nx, ny = job.ny, z = job.z, cell = job.cell, most = 0;
  var reach = woodReach(tool, job.top - Math.min(az, bz));
  var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - job.x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - job.x0) / cell));
  var j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - job.y0) / cell)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - job.y0) / cell));
  var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  for (var j = j0; j <= j1; j++){
    var cy = job.y0 + (j + 0.5) * cell, row = j * nx;
    for (var i = i0; i <= i1; i++){
      var cx = job.x0 + (i + 0.5) * cell, h;
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
  if (most > 0){
    var d = job.dirty;
    if (!d) job.dirty = {i0: i0, j0: j0, i1: i1, j1: j1};
    else { if (i0 < d.i0) d.i0 = i0; if (j0 < d.j0) d.j0 = j0; if (i1 > d.i1) d.i1 = i1; if (j1 > d.j1) d.j1 = j1; }
  }
  return most;
}
// A job to cut: the material as a grid of heights, uncut, and every move that can cut it, in order.
// parts: [{moves, tool, feed}] in cutting order; box: {x0, y0, x1, y1, top, bottom} (the material); cell: the
// grid's spacing in mm. A move is one whose two ends are both known (as the job sheet's time counts them). Each
// is cut in short steps, so each step's box of cells stays small.
//   mv     nine numbers a move: its part, 1 if it's a rapid (G0), where it starts (x, y, z), where it ends, its steps
//   ends   the time each move ends at, in seconds from the start (feeds as programmed, rapids at JS_RAPID)
//   mi, k  how far it's been cut: every move before mi, and k steps of move mi
var WOOD_MV = 9;
function woodJob(parts, box, cell){
  var nx = Math.max(1, Math.ceil((box.x1 - box.x0) / cell)), ny = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
  var z = new Float32Array(nx * ny); z.fill(box.top);
  var mv = [], ends = [], sec = 0;
  parts.forEach(function (part, pi){
    var x = null, y = null, zz = null, f = part.feed || 1000;
    (part.moves || []).forEach(function (m){
      var nxp = m.x !== undefined ? m.x : x, nyp = m.y !== undefined ? m.y : y, nzp = m.z !== undefined ? m.z : zz;
      if (m.f) f = m.f;
      if (x !== null && y !== null && zz !== null && nxp !== null && nyp !== null && nzp !== null){
        // long moves in short steps, so each one's box of cells stays small
        var len = Math.hypot(nxp - x, nyp - y), n = Math.max(1, Math.ceil(len / Math.max(part.tool.r * 2, cell * 8)));
        mv.push(pi, m.g === 0 ? 1 : 0, x, y, zz, nxp, nyp, nzp, n);
        var far = Math.sqrt((nxp - x) * (nxp - x) + (nyp - y) * (nyp - y) + (nzp - zz) * (nzp - zz));
        sec += far / (m.g === 0 ? JS_RAPID : Math.max(1, f)) * 60;
        ends.push(sec);
      }
      x = nxp; y = nyp; zz = nzp;
    });
  });
  return {nx: nx, ny: ny, cell: cell, x0: box.x0, y0: box.y0, top: box.top, bottom: box.bottom, z: z, parts: parts,
          mv: new Float64Array(mv), ends: new Float64Array(ends), count: ends.length, total: sec,
          mi: 0, k: 0, took: 0, rapidsIn: 0, rapidAt: [], dirty: null};
}
// Cut a job on, to: every move before mi, and k steps of move mi. Forwards only (wood can't be put back).
// A rapid (G0) that takes more than 0.05 mm of wood is counted when its move is finished, and its number kept.
function woodJobTo(job, mi, k){
  var mv = job.mv;
  if (mi >= job.count){ mi = job.count; k = 0; }
  while (job.mi < mi || (job.mi === mi && job.k < k)){
    var o = job.mi * WOOD_MV, tool = job.parts[mv[o]].tool, n = mv[o + 8], upTo = job.mi < mi ? n : Math.min(k, n);
    var x = mv[o + 2], y = mv[o + 3], zz = mv[o + 4], nxp = mv[o + 5], nyp = mv[o + 6], nzp = mv[o + 7];
    for (var q = job.k; q < upTo; q++){
      var a = q / n, b = (q + 1) / n;
      job.took = Math.max(job.took, woodStamp(job, tool, x + (nxp - x) * a, y + (nyp - y) * a, zz + (nzp - zz) * a, x + (nxp - x) * b, y + (nyp - y) * b, zz + (nzp - zz) * b));
    }
    job.k = upTo;
    if (job.k < n) break;
    if (mv[o + 1] === 1 && job.took > 0.05){ job.rapidsIn++; job.rapidAt.push(job.mi); }   // a rapid move that cut wood
    job.mi++; job.k = 0; job.took = 0;
  }
}
// The simulation: the whole job cut. Returns {nx, ny, cell, x0, y0, top, bottom, z (Float32Array, row 0 at y0),
// rapidsIn (G0 moves that cut more than 0.05 mm of wood), deepest, total (the job's time in seconds, as the job
// sheet works it out)}.
function woodSim(parts, box, cell){
  var job = woodJob(parts, box, cell);
  woodJobTo(job, job.count, 0);
  var z = job.z, deepest = box.top;
  for (var q = 0; q < z.length; q++) if (z[q] < deepest) deepest = z[q];
  return {nx: job.nx, ny: job.ny, cell: cell, x0: box.x0, y0: box.y0, top: box.top, bottom: box.bottom, z: z, rapidsIn: job.rapidsIn, deepest: deepest, total: job.total};
}
// The picture: RGBA, row 0 at the top of the material (the far side, as on screen). Light from the top left.
function woodShade(sim){
  var out = new Uint8ClampedArray(sim.nx * sim.ny * 4);
  woodShadeRect(sim, out, 0, 0, sim.nx - 1, sim.ny - 1);
  return out;
}
// The same for part of it: cells i0..i1 by j0..j1 (j counted from y0), into a picture already made.
function woodShadeRect(sim, out, i0, j0, i1, j1){
  var nx = sim.nx, ny = sim.ny, z = sim.z;
  var Lx = -0.5, Ly = 0.5, Lz = 0.707, ln = Math.hypot(Lx, Ly, Lz);
  Lx /= ln; Ly /= ln; Lz /= ln;
  function at(i, j){ i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); return z[j * nx + i]; }
  for (var j = j0; j <= j1; j++){
    var oy = (ny - 1 - j) * nx * 4;                                   // world y up, picture rows down
    for (var i = i0; i <= i1; i++){
      var h = z[j * nx + i], o = oy + i * 4, c;
      c = woodColour(sim, h);                                           // spoilboard, amber where thin, or wood
      var gx = (at(i + 1, j) - at(i - 1, j)) / (2 * sim.cell), gy = (at(i, j + 1) - at(i, j - 1)) / (2 * sim.cell);
      var nl = Math.hypot(gx, gy, 1), lit = Math.max(0, (-gx * Lx - gy * Ly + Lz) / nl);
      var s = 0.45 + 0.6 * lit;
      out[o] = c[0] * s; out[o + 1] = c[1] * s; out[o + 2] = c[2] * s; out[o + 3] = 255;
    }
  }
}
// The ticked toolpaths of the sheet shown, as parts for woodSim, in cutting order.
function woodParts(){
  return tpList().filter(function (tp){ return !tp.exclude && (typeof multiSheet !== 'function' || !multiSheet() || tpSheetOf(tp) === DOC.activeSheet); })
    .map(function (tp){ if (tpStale(tp)) tpGenerate(tp); return {moves: tp.moves || [], tool: woodTool(tp), name: tp.name, feed: tp.feed}; })
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
  woodPlayReset(); woodPreviewOpen.job = null; woodPreviewOpen.in3d = false;
  document.getElementById('woodPlayRow').hidden = true;
  document.getElementById('woodNote').textContent = 'Working it out…';
  setTimeout(function (){                                            // let the window show first
    var box = woodBox(), cell = woodCell(box), bottomless = !(box.bottom > -Infinity);
    if (bottomless) box.bottom = box.top - 50;
    var sim = woodSim(parts, box, cell);
    sim.thin = bottomless ? 0 : woodThinBand();
    var px = woodShade(sim), thinCells = 0;
    if (sim.thin) for (var q = 0; q < sim.z.length; q++) if (sim.z[q] > sim.bottom + 1e-6 && sim.z[q] < sim.bottom + sim.thin) thinCells++;
    var cv = document.getElementById('woodCv');
    cv.width = sim.nx; cv.height = sim.ny;
    var g = cv.getContext && cv.getContext('2d');
    if (g && typeof ImageData !== 'undefined') g.putImageData(new ImageData(px, sim.nx, sim.ny), 0, 0);
    var depth = box.top - sim.deepest, said = [];
    said.push(parts.length + (parts.length === 1 ? ' toolpath' : ' toolpaths') + ', cut in order. Deepest cut ' + fmtDisp(depth) + ' ' + unitTag() +
      (bottomless ? ' (the material’s thickness isn’t set, so through-cuts don’t show as holes).' : '.'));
    if (thinCells) said.push('Amber: wood thinner than ' + fmtDisp(sim.thin) + ' ' + unitTag() + ', such as tabs, and anything nearly cut through.');
    said.push('Worked out from the toolpaths’ moves and bits, to ' + fmtDisp(cell, 2) + ' ' + unitTag() + '. Check it looks as you expect.');
    var note = document.getElementById('woodNote');
    note.textContent = said.join(' ');
    var warn = document.getElementById('woodWarn');
    warn.textContent = sim.rapidsIn ? sim.rapidsIn + (sim.rapidsIn === 1 ? ' rapid move goes' : ' rapid moves go') +
      ' into wood at full speed. Don’t cut this: check the toolpaths’ safe height and the material setup.' : '';
    warn.hidden = !sim.rapidsIn;
    woodPreviewOpen.last = sim;
    woodPreviewOpen.job = {parts: parts, box: box, cell: cell, thin: sim.thin, total: sim.total};   // for watching it cut (wood-play.js)
    woodPlayReady();
    // in 3D where it can be (wood-3d.js); otherwise the flat picture from above
    woodThree(function (ok){
      var host = document.getElementById('wood3d');
      host.hidden = false; cv.hidden = true;
      var in3d = !!(ok && woodShow3D(sim));
      if (!in3d){ host.hidden = true; cv.hidden = false; }
      document.getElementById('woodViews').hidden = !in3d;
      document.getElementById('woodHow').textContent = in3d ? 'Drag to turn it, right-drag to move it, scroll to zoom. Click the cube to look from a side.'
        : ok ? 'The view from above: this computer can’t show it in 3D.'
        : 'The view from above: the 3D view needs a library that didn’t load (check the internet connection).';
      woodPreviewOpen.in3d = in3d;
      if (WOODPLAY) woodPlayShow(WOODPLAY.t);                       // Play was pressed before the 3D view was ready
    });
  }, 30);
}
function woodPreviewClose(){ document.getElementById('woodModal').hidden = true; woodPlayReset(); woodPreviewOpen.job = null; }
function woodWire(){
  var m = document.getElementById('woodModal');
  if (!m) return;
  woodPlayWire();
  document.getElementById('woodX').addEventListener('click', woodPreviewClose);
  document.getElementById('woodClose').addEventListener('click', woodPreviewClose);
  m.addEventListener('click', function (e){ if (e.target === m) woodPreviewClose(); });
  Array.prototype.forEach.call(document.querySelectorAll('#woodViews button'), function (b){
    b.addEventListener('click', function (){ woodView(b.dataset.v); });
  });
  document.getElementById('woodPanel').addEventListener('keydown', function (e){ if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); woodPreviewClose(); } });
}
