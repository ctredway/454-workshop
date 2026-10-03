/* ---------------- Preview in wood: watching it cut ----------------
   Play, pause and a slider under the picture. The same simulation as the finished preview (woodJob, woodJobTo in
   wood-preview.js), cut a little at a time and drawn from above as it goes, with the cutter shown where it is.
   Played to the end, it's the finished preview's wood exactly (tested).
   Time is the job sheet's: feeds as programmed, rapids at JS_RAPID, no acceleration. A guide, not a promise.
   Wood can't be un-cut, so going back starts again from the nearest of a few copies of the wood kept on the way
   (WOOD_KEEPS of them, taken as play first passes each point), or from uncut. */
var WOODPLAY = null;     // {job, px, img, g, t, playing, speed, keeps, at, last, raf, stamp}
var WOOD_KEEPS = 4;      // copies of the wood kept for going back: at 1/5, 2/5, 3/5 and 4/5 of the job
var WOOD_SPEEDS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

function woodClock(sec){
  sec = Math.max(0, Math.round(sec));
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
// The speed that plays the whole job in about 45 seconds or less.
function woodSpeedFor(total){
  for (var i = 0; i < WOOD_SPEEDS.length; i++) if (total / WOOD_SPEEDS[i] <= 45) return WOOD_SPEEDS[i];
  return WOOD_SPEEDS[WOOD_SPEEDS.length - 1];
}
// Where a job is at time t (seconds): {mi, frac (how far through move mi), k (its steps cut by then), x, y, z, part}.
// A step is cut when the cutter is half way along it, so the wood shown is never more than half a step from the
// cutter. At or past the end: mi is the number of moves, and the cutter is where the last move ended.
function woodAt(job, t){
  var n = job.count, mv = job.mv, ends = job.ends;
  if (!n) return {mi: 0, frac: 0, k: 0, x: null, y: null, z: null, part: -1};
  if (t >= job.total){
    var e = (n - 1) * WOOD_MV;
    return {mi: n, frac: 0, k: 0, x: mv[e + 5], y: mv[e + 6], z: mv[e + 7], part: mv[e]};
  }
  t = Math.max(0, t);
  var lo = 0, hi = n - 1;                                   // the first move that ends after t
  while (lo < hi){ var mid = (lo + hi) >> 1; if (ends[mid] > t) hi = mid; else lo = mid + 1; }
  var o = lo * WOOD_MV, t0 = lo ? ends[lo - 1] : 0, span = ends[lo] - t0;
  var frac = span > 1e-12 ? Math.min(1, Math.max(0, (t - t0) / span)) : 1, steps = mv[o + 8];
  return {mi: lo, frac: frac, k: Math.min(steps, Math.floor(frac * steps + 0.5)),
          x: mv[o + 2] + (mv[o + 5] - mv[o + 2]) * frac, y: mv[o + 3] + (mv[o + 6] - mv[o + 3]) * frac,
          z: mv[o + 4] + (mv[o + 7] - mv[o + 4]) * frac, part: mv[o]};
}
// A copy of a job's wood and how far it's cut, to go back to; and going back to one.
function woodKeep(job){
  return {z: new Float32Array(job.z), mi: job.mi, k: job.k, took: job.took, rapidsIn: job.rapidsIn, rapids: job.rapidAt.length};
}
function woodKeepLoad(job, keep){
  if (keep){ job.z.set(keep.z); job.mi = keep.mi; job.k = keep.k; job.took = keep.took; job.rapidsIn = keep.rapidsIn; job.rapidAt.length = keep.rapids; }
  else { job.z.fill(job.top); job.mi = 0; job.k = 0; job.took = 0; job.rapidsIn = 0; job.rapidAt.length = 0; }
}
// Cut a job to where it is at time t, forwards or back. keeps: the copies kept so far (filled in here as play
// passes each point). Returns 'on' when it only cut forwards (job.dirty says where), 'all' when it went back.
function woodSeek(job, keeps, t){
  var at = woodAt(job, t), back = at.mi < job.mi || (at.mi === job.mi && at.k < job.k), i;
  if (back){
    var best = null;
    for (i = 0; i < keeps.length; i++){
      var kp = keeps[i];
      if (kp && (kp.mi < at.mi || (kp.mi === at.mi && kp.k <= at.k)) && (!best || kp.mi > best.mi)) best = kp;
    }
    woodKeepLoad(job, best);
    job.dirty = null;
  }
  // cut on, stopping at each point a copy is due
  for (i = 0; i < WOOD_KEEPS; i++){
    var due = Math.floor(job.count * (i + 1) / (WOOD_KEEPS + 1));
    if (!keeps[i] && due > 0 && job.mi < due && at.mi >= due){ woodJobTo(job, due, 0); keeps[i] = woodKeep(job); }
  }
  woodJobTo(job, at.mi, at.k);
  return back ? 'all' : 'on';
}

// ---- the window's part ----
// The picture's rectangle (canvas pixels) for cells i0..i1 by j0..j1, a cell wider all round: a cell's shading
// looks at its neighbours.
function woodPlayPut(P, i0, j0, i1, j1){
  var job = P.job;
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(job.nx - 1, i1 + 1); j1 = Math.min(job.ny - 1, j1 + 1);
  if (i1 < i0 || j1 < j0) return;
  woodShadeRect(job, P.px, i0, j0, i1, j1);
  if (P.g) P.g.putImageData(P.img, 0, 0, i0, job.ny - 1 - j1, i1 - i0 + 1, j1 - j0 + 1);
}
// The cutter, from above: a ring the size of the bit where it is now (a V-bit: as wide as it's cutting), filled
// while it's below the top of the material. What it covered last time is put back first.
function woodPlayCutter(P, at){
  var job = P.job, g = P.g;
  if (!g) return;
  if (P.last){ g.putImageData(P.img, 0, 0, P.last[0], P.last[1], P.last[2], P.last[3]); P.last = null; }
  if (at.x === null || at.part < 0 || P.t >= job.total) return;         // finished: the board alone
  var tool = job.parts[at.part].tool, inWood = at.z < job.top - 1e-9;
  var r = Math.max(1.5, (tool.kind === 'v' ? Math.max(woodReach(tool, job.top - at.z), 0.5) : tool.r) / job.cell);
  var cx = (at.x - job.x0) / job.cell, cy = job.ny - (at.y - job.y0) / job.cell, lw = Math.max(1, job.nx / 500);
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = inWood ? 'rgba(40,120,235,.6)' : 'rgba(255,255,255,.18)'; g.fill();
  g.lineWidth = lw; g.strokeStyle = inWood ? '#0b3d91' : 'rgba(255,255,255,.9)'; g.stroke();
  g.beginPath(); g.arc(cx, cy, Math.max(0.8, lw * 0.8), 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  // on a big board the bit is a speck: a wider, fainter ring round it, so the eye can find it
  var find = job.nx / 60;
  if (r < find * 0.6){
    g.beginPath(); g.arc(cx, cy, find, 0, Math.PI * 2);
    g.lineWidth = lw * 1.5; g.strokeStyle = inWood ? 'rgba(40,120,235,.55)' : 'rgba(255,255,255,.55)'; g.stroke();
  } else find = 0;
  g.restore();
  var pad = Math.ceil(Math.max(r, find) + lw * 2 + 2), x0 = Math.max(0, Math.floor(cx - pad)), y0 = Math.max(0, Math.floor(cy - pad));
  P.last = [x0, y0, Math.min(job.nx, Math.ceil(cx + pad)) - x0, Math.min(job.ny, Math.ceil(cy + pad)) - y0];
  if (P.last[2] <= 0 || P.last[3] <= 0) P.last = null;
}
// Make the player for the job the preview was opened with (woodPreviewOpen.job), the first time it's wanted.
function woodPlayStart(){
  if (WOODPLAY) return WOODPLAY;
  var src = woodPreviewOpen.job;
  if (!src) return null;
  var job = woodJob(src.parts, src.box, src.cell);
  job.thin = src.thin;
  var cv = document.getElementById('woodCv'), g = cv && cv.getContext ? cv.getContext('2d') : null;
  var P = WOODPLAY = {job: job, keeps: [], t: 0, playing: false, speed: +document.getElementById('woodSpeed').value || 1, last: null, raf: 0, stamp: 0, g: null, img: null,
                      px: new Uint8ClampedArray(job.nx * job.ny * 4)};
  if (g && typeof ImageData !== 'undefined'){ P.g = g; P.img = new ImageData(P.px, job.nx, job.ny); }
  return P;
}
// Show the job at time t: cut the wood to there, redraw what changed, place the cutter, set the slider and clock.
function woodPlayShow(t){
  var P = woodPlayStart();
  if (!P) return;
  var job = P.job;
  P.t = Math.max(0, Math.min(job.total, t));
  woodFlat(true);
  var first = !P.drawn, how = woodSeek(job, P.keeps, P.t);
  if (first || how === 'all'){ P.last = null; woodPlayPut(P, 0, 0, job.nx - 1, job.ny - 1); P.drawn = true; }
  else if (job.dirty) woodPlayPut(P, job.dirty.i0, job.dirty.j0, job.dirty.i1, job.dirty.j1);
  job.dirty = null;
  woodPlayCutter(P, woodAt(job, P.t));
  woodPlayUI();
}
function woodPlayUI(){
  var P = WOODPLAY, src = woodPreviewOpen.job, total = P ? P.job.total : src ? src.total : 0, t = P ? P.t : total;
  var b = document.getElementById('woodPlay'), sl = document.getElementById('woodSeek');
  var playing = !!(P && P.playing);
  b.textContent = playing ? '❚❚ Pause' : '▶ Play';
  b.title = playing ? 'Pause' : t >= total ? 'Watch the toolpaths cut, from uncut wood' : 'Carry on from here';
  b.setAttribute('aria-pressed', playing ? 'true' : 'false');
  sl.value = String(total > 0 ? Math.round(t / total * 1000) : 1000);
  sl.setAttribute('aria-valuetext', woodClock(t) + ' of ' + woodClock(total));
  document.getElementById('woodTime').textContent = woodClock(t) + ' / ' + woodClock(total);
}
// One frame: dt seconds of real time have passed.
function woodPlayTick(dt){
  var P = WOODPLAY;
  if (!P || !P.playing) return;
  var t = P.t + dt * P.speed;
  if (t >= P.job.total){ t = P.job.total; P.playing = false; }
  woodPlayShow(t);
}
function woodPlayFrame(now){
  var P = WOODPLAY;
  if (!P || !P.playing){ if (P) P.raf = 0; return; }
  var dt = P.stamp ? Math.min(0.25, (now - P.stamp) / 1000) : 0;     // a stalled tab doesn't leap ahead
  P.stamp = now;
  woodPlayTick(dt);
  P.raf = P.playing ? requestAnimationFrame(woodPlayFrame) : 0;
}
function woodPlayToggle(){
  var P = woodPlayStart();
  if (!P) return;
  if (P.playing){ P.playing = false; woodPlayUI(); return; }
  if (!P.drawn || P.t >= P.job.total) woodPlayShow(0);                 // from uncut wood
  P.playing = true; P.stamp = 0;
  woodPlayUI();
  P.raf = requestAnimationFrame(woodPlayFrame);
}
// The flat picture from above (where the cut is played), or the 3D view of the finished cut.
function woodFlat(on){
  var cv = document.getElementById('woodCv'), host = document.getElementById('wood3d'), can3d = !!woodPreviewOpen.in3d;
  if (on === (woodFlat.on || false) && woodFlat.set) return;
  woodFlat.on = on; woodFlat.set = true;
  if (can3d){ host.hidden = on; cv.hidden = !on; document.getElementById('woodViews').hidden = on; }
  document.getElementById('woodTo3d').hidden = !(on && can3d);
  if (on) document.getElementById('woodHow').textContent = 'From above. The ring is the cutter: blue while it’s in the wood.';
  else if (can3d) document.getElementById('woodHow').textContent = 'Drag to turn it, right-drag to move it, scroll to zoom.';
}
// Back to the finished cut in 3D.
function woodPlayTo3d(){
  var P = WOODPLAY;
  if (P){ P.playing = false; P.t = P.job.total; }
  woodFlat(false);
  woodPlayUI();
}
// A new preview, or the window closed: forget the player.
function woodPlayReset(){
  if (WOODPLAY && WOODPLAY.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(WOODPLAY.raf);
  WOODPLAY = null; woodFlat.set = false; woodFlat.on = false;
  var to3d = document.getElementById('woodTo3d'); if (to3d) to3d.hidden = true;
}
// The preview has been worked out: set the speed that plays this job in about 45 seconds, and the clock.
function woodPlayReady(){
  var src = woodPreviewOpen.job, sel = document.getElementById('woodSpeed');
  document.getElementById('woodPlayRow').hidden = !(src && src.total > 0);
  if (!src) return;
  sel.value = String(woodSpeedFor(src.total));
  woodPlayUI();
}
function woodPlayWire(){
  var sel = document.getElementById('woodSpeed');
  if (!sel) return;
  WOOD_SPEEDS.forEach(function (s){
    var o = document.createElement('option'); o.value = String(s); o.textContent = s === 1 ? 'Real time' : s + '×';
    sel.appendChild(o);
  });
  sel.addEventListener('change', function (){ if (WOODPLAY) WOODPLAY.speed = +sel.value || 1; });
  document.getElementById('woodPlay').addEventListener('click', woodPlayToggle);
  document.getElementById('woodTo3d').addEventListener('click', woodPlayTo3d);
  document.getElementById('woodSeek').addEventListener('input', function (){
    var src = woodPreviewOpen.job;
    if (src) woodPlayShow(src.total * (+this.value || 0) / 1000);
  });
}
