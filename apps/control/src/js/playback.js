/* ============================================================
   Playback + progress coloring
   ============================================================ */
var MODEL = null;
var playT = 0, playing = false, lastFrame = null, doneCount = 0;

function repaintToolpath(){
  if (typeof MODEL === 'undefined' || !MODEL || !cutColors || !rapidColors) return;
  for (var i = 0; i < MODEL.segs.length; i++){
    var sg = MODEL.segs[i], done = i < doneCount;
    var col = sg.g === 0 ? (done ? C_CUT_D : C_CUT) : (done ? C_RAP_D : C_RAP);
    var arr = sg.g === 0 ? cutColors : rapidColors, o = sg.v * 3;
    if (o === undefined || isNaN(o)) continue;
    arr[o] = col[0]; arr[o+1] = col[1]; arr[o+2] = col[2]; arr[o+3] = col[0]; arr[o+4] = col[1]; arr[o+5] = col[2];
  }
  if (cutLine) cutLine.geometry.attributes.color.needsUpdate = true;
  if (rapidLine) rapidLine.geometry.attributes.color.needsUpdate = true;
}
function setProgressColors(newDone){
  if (!MODEL) return;
  var a = Math.min(doneCount, newDone), b = Math.max(doneCount, newDone);
  var toDone = newDone > doneCount;
  for (var i=a; i<b; i++){
    var s = MODEL.segs[i];
    var col = s.g === 0 ? (toDone ? C_CUT_D : C_CUT) : (toDone ? C_RAP_D : C_RAP);
    var arr = s.g === 0 ? cutColors : rapidColors;
    var o = s.v * 3;
    arr[o]=col[0];arr[o+1]=col[1];arr[o+2]=col[2];
    arr[o+3]=col[0];arr[o+4]=col[1];arr[o+5]=col[2];
  }
  if (b > a){
    if (cutLine) cutLine.geometry.attributes.color.needsUpdate = true;
    if (rapidLine) rapidLine.geometry.attributes.color.needsUpdate = true;
  }
  doneCount = newDone;
}

function segAtTime(t){
  var segs = MODEL.segs;
  var lo = 0, hi = segs.length - 1, ans = segs.length;
  while (lo <= hi){
    var mid = (lo + hi) >> 1;
    if (segs[mid].t1 >= t){ ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans; // first seg whose end >= t (may be segs.length)
}

function setTime(t, fromSlider){
  if (!MODEL || !MODEL.segs.length) return;
  playT = Math.max(0, Math.min(MODEL.totalTime, t));
  var idx = segAtTime(playT);
  var segs = MODEL.segs;
  var cur = idx < segs.length ? segs[idx] : segs[segs.length-1];
  var frac = 1;
  if (idx < segs.length){
    var span = cur.t1 - cur.t0;
    frac = span > 1e-9 ? Math.max(0, Math.min(1, (playT - cur.t0)/span)) : 1;
  }
  setProgressColors(idx < segs.length ? idx + (frac >= 1 ? 1 : 1) : segs.length);
  // (current segment shown as done for visibility)
  var px = cur.x0 + (cur.x1-cur.x0)*frac;
  var py = cur.y0 + (cur.y1-cur.y0)*frac;
  var pz = cur.z0 + (cur.z1-cur.z0)*frac;
  if (marker && !(typeof JOB !== 'undefined' && JOB.active)) marker.position.copy(w3(px,py,pz));
  updateDRO(cur, px, py, pz);
  highlightLine(cur.line);
  if (!fromSlider){
    var sl = document.getElementById('timeSlider');
    sl.value = Math.round(playT / Math.max(MODEL.totalTime,1e-9) * 10000);
  }
  document.getElementById('timeReadout').textContent = fmtTime(playT) + ' / ' + fmtTime(MODEL.totalTime);
}

function tick(){
  var now = performance.now();
  if (lastFrame === null) lastFrame = now;
  var dt = Math.min(0.1, (now - lastFrame)/1000);
  lastFrame = now;
  if (VIEWANIM){
    var k = VIEWANIM.dur > 0 ? Math.min(1, (now - VIEWANIM.t0) / VIEWANIM.dur) : 1;
    var e = 1 - Math.pow(1 - k, 3); // ease-out
    orbit.theta = VIEWANIM.fromT + (VIEWANIM.toT - VIEWANIM.fromT) * e;
    orbit.phi   = VIEWANIM.fromP + (VIEWANIM.toP - VIEWANIM.fromP) * e;
    if (VIEWANIM.toTarget) orbit.target.copy(VIEWANIM.fromTarget).lerp(VIEWANIM.toTarget, e);
    if (VIEWANIM.toR !== null) orbit.radius = VIEWANIM.fromR + (VIEWANIM.toR - VIEWANIM.fromR) * e;
    applyCamera();
    if (k >= 1) VIEWANIM = null;
  }
  if (playing && MODEL){
    var speed = parseFloat(document.getElementById('speedSel').value);
    setTime(playT + dt * speed);
    if (playT >= MODEL.totalTime){ playing = false; updatePlayBtn(); }
  }
}

function updatePlayBtn(){
  document.getElementById('btnPlay').textContent = playing ? '❚❚' : '▶';
}

function fmtTime(s){
  s = Math.round(s);
  var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return (h? h+':' + String(m).padStart(2,'0') : m) + ':' + String(ss).padStart(2,'0');
}

function fmtCoord(mm, units){
  if (units === 'in') return (mm/25.4).toFixed(4) + '″';
  return mm.toFixed(3);
}

function updateDRO(seg, x, y, z){
  var rl0 = document.getElementById('recLine');
  if (rl0 && seg) rl0.placeholder = seg.line;       // recovery suggestion follows the preview, connected or not
  if (typeof SERIAL !== 'undefined' && SERIAL.connected) return; // live machine DRO wins
  var u = seg ? seg.units : 'mm';
  document.getElementById('droX').textContent = fmtCoord(x, u);
  document.getElementById('droY').textContent = fmtCoord(y, u);
  document.getElementById('droZ').textContent = fmtCoord(z, u);
  document.getElementById('droF').textContent = seg && !seg.rapid && seg.feed ? Math.round(u==='in'?seg.feed/25.4:seg.feed) + (u==='in'?' ipm':' mm/min') : (seg && seg.rapid ? 'rapid' : '—');
  document.getElementById('droLine').textContent = seg ? seg.line : '—';
  document.getElementById('droTool').textContent = seg && seg.tool !== null && seg.tool !== undefined ? 'T'+seg.tool : '—';
}

/* step by source gcode line */
function stepLine(dir){
  if (!MODEL || !MODEL.segs.length) return;
  playing = false; updatePlayBtn();
  var idx = Math.min(segAtTime(playT), MODEL.segs.length-1);
  var curLine = MODEL.segs[idx].line;
  var i = idx;
  if (dir > 0){
    while (i < MODEL.segs.length && MODEL.segs[i].line === curLine) i++;
    if (i >= MODEL.segs.length){ setTime(MODEL.totalTime); return; }
    setTime(MODEL.segs[i].t1 - 1e-6);
    // land at end of that whole line:
    var ln = MODEL.segs[i].line, j = i;
    while (j+1 < MODEL.segs.length && MODEL.segs[j+1].line === ln) j++;
    setTime(MODEL.segs[j].t1);
  } else {
    // go to end of previous line (or start)
    while (i >= 0 && MODEL.segs[i].line === curLine) i--;
    if (i < 0){ setTime(0); return; }
    var ln2 = MODEL.segs[i].line, j2 = i;
    while (j2-1 >= 0 && MODEL.segs[j2-1].line === ln2) j2--;
    setTime(MODEL.segs[i].t1);
  }
}

