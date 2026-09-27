// @ts-nocheck
/* The G-code parser, moved unchanged from 454 Control v0.31.0 (synced: time estimate with the
   controller's acceleration, lowest spindle speed). Pinned by golden tests; do not edit without them. */

var SUPPORTED_G = {0:1,1:1,2:1,3:1,4:1,17:1,18:1,19:1,20:1,21:1,28:1,28.2:1,90:1,91:1,91.1:1,90.1:1,53:1};
var IGNORED_G   = {40:'G40 cutter compensation off — accepted but ignored by Carbide Motion',
                   43:'G43 tool length offset — accepted but ignored by Carbide Motion',
                   49:'G49 cancel tool length offset — accepted but ignored',
                   54:'work coordinate system — accepted but ignored; Carbide Motion manages WCS internally',
                   55:'work coordinate system — accepted but ignored',56:'work coordinate system — accepted but ignored',
                   57:'work coordinate system — accepted but ignored',58:'work coordinate system — accepted but ignored',
                   59:'work coordinate system — accepted but ignored'};
var SUPPORTED_M = {0:1,1:1,2:1,3:1,5:1,6:1,30:1};
var IGNORED_M   = {7:'M7 mist coolant — accepted but ignored',9:'M9 coolant off — accepted but ignored'};

// Re-time the moves the way GRBL's planner runs them, from the controller's own limits:
// per-axis maximum rates ($110-112) and accelerations ($120-122), and junction deviation ($11),
// which sets how fast a corner can be taken. Two passes, backward then forward, fix the speed at
// each junction; each move then accelerates, cruises and decelerates within its length.
// Only t0/t1 change. Dwells between moves are kept, and the machine is at rest wherever GRBL
// stops the planner: the start, dwells, and spindle, coolant, tool-change and program stops.

function retimeWithPlanner(segs, opts){
  var A = opts.accel, V = opts.maxRate || {}, jd = opts.junctionDev > 0 ? opts.junctionDev : 0.01;
  var n = segs.length;
  if (!n || !(A.x > 0 && A.y > 0 && A.z > 0)) return;
  var L = new Float64Array(n), vn = new Float64Array(n), ac = new Float64Array(n), vj = new Float64Array(n), gap = new Float64Array(n);
  var ux = new Float64Array(n), uy = new Float64Array(n), uz = new Float64Array(n);
  var prevT1 = 0;
  for (var i = 0; i < n; i++){
    var sg = segs[i], dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0, dz = sg.z1 - sg.z0;
    var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    L[i] = len; ux[i] = dx / len; uy[i] = dy / len; uz[i] = dz / len;
    gap[i] = sg.t0 - prevT1; prevT1 = sg.t1;
    // the slowest axis along this direction limits both speed and acceleration
    var cap = Infinity, acc = Infinity;
    [['x', ux[i]], ['y', uy[i]], ['z', uz[i]]].forEach(function (q) {
      var u = Math.abs(q[1]);
      if (u < 1e-9) return;
      if (V[q[0]] > 0) cap = Math.min(cap, V[q[0]] / u);
      acc = Math.min(acc, A[q[0]] / u);
    });
    var want = sg.rapid ? (isFinite(cap) ? cap : opts.rapidRate) : (sg.feed || opts.rapidRate);
    vn[i] = Math.min(want, cap) / 60;                   // mm/s
    ac[i] = acc;                                        // mm/s^2
    // how fast the junction INTO this move can be taken
    if (i === 0 || sg.stop || gap[i] > 1e-6) vj[i] = 0;
    else {
      var cosT = -(ux[i-1]*ux[i] + uy[i-1]*uy[i] + uz[i-1]*uz[i]);
      if (cosT > 0.999999) vj[i] = 0;                      // straight back on itself
      else if (cosT < -0.999999) vj[i] = Infinity;         // straight on
      else {
        var sinH = Math.sqrt(0.5 * (1 - cosT));
        vj[i] = Math.sqrt(Math.min(ac[i-1], ac[i]) * jd * sinH / (1 - sinH));
      }
      vj[i] = Math.min(vj[i], vn[i-1], vn[i]);
    }
  }
  // backward: every move must be able to slow to the next junction (and to rest at the end)
  var entry = new Float64Array(n + 1);
  entry[n] = 0;
  for (var b = n - 1; b >= 0; b--){
    var next = (b + 1 < n && vj[b + 1] === 0) ? 0 : entry[b + 1];
    entry[b] = Math.min(vj[b], Math.sqrt(next*next + 2 * ac[b] * L[b]));
  }
  // forward: and must be able to reach it from the previous one
  for (var f = 1; f < n; f++){
    if (vj[f] === 0){ entry[f] = 0; continue; }
    entry[f] = Math.min(entry[f], Math.sqrt(entry[f-1]*entry[f-1] + 2 * ac[f-1] * L[f-1]));
  }
  // each move: accelerate from its entry speed, cruise, decelerate to the next entry speed
  var t = 0;
  for (var k = 0; k < n; k++){
    var v0 = entry[k], v1 = (k + 1 < n && vj[k + 1] !== 0) ? entry[k + 1] : 0, v = vn[k], a = ac[k], d = L[k];
    var da = Math.max(0, (v*v - v0*v0) / (2*a)), dd = Math.max(0, (v*v - v1*v1) / (2*a)), dt;
    if (da + dd <= d) dt = (v - v0) / a + (v - v1) / a + (d - da - dd) / v;
    else {                                                // never reaches full speed
      var vp = Math.sqrt(Math.max(v0*v0, v1*v1, (2*a*d + v0*v0 + v1*v1) / 2));
      dt = Math.max(0, (vp - v0) / a) + Math.max(0, (vp - v1) / a);
      if (!(dt > 0)) dt = d / Math.max(v, 1e-6);
    }
    t += gap[k];
    segs[k].t0 = t; t += dt; segs[k].t1 = t;
  }
}

function parseGcode(text, opts){
  opts = opts || {};
  var rapidRate = opts.rapidRate || 5000; // mm/min
  var lines = text.split(/\r\n|\r|\n/);
  var issues = [];
  var segs = [];        // micro segments {x0,y0,z0,x1,y1,z1,rapid,line,feed,t0,t1,units,tool}
  var lineFirstSeg = {}; // source line -> first seg index
  var tools = [];        // {line, tool}
  var toolInfo = {};     // tool number -> {desc, dia (mm|null)}
  var sections = [];     // {line, name} from CAM toolpath comments
  var hctx = {inToolList:false, lastComment:null, awaitTool:null};
  var maxIssues = 800;

  function addToolInfo(n, desc){
    desc = desc.replace(/\s+/g, ' ').trim();
    if (!desc) return;
    var dia = null;
    var dm = /\{\s*([\d.]+)\s*(mm|in|inch)?\s*\}/i.exec(desc) || /D\s*=\s*([\d.]+)/.exec(desc);
    if (dm){
      dia = parseFloat(dm[1]);
      if (dm[2] && /in/i.test(dm[2])) dia *= 25.4;
    }
    if (toolInfo[n] === undefined) toolInfo[n] = {desc: desc, dia: dia};
  }
  // recognizes Vectric (VCarve/Aspire), Fusion 360, and generic comment styles
  function harvestComment(txt, lineNo){
    var t = txt.trim();
    if (!t) return;
    if (/tools?\s+used\s+in\s+this\s+file/i.test(t)){ hctx.inToolList = true; return; }
    if (hctx.inToolList){
      var lm = /^(\d+)\s*=\s*(.+)$/.exec(t);
      if (lm){ addToolInfo(lm[1], lm[2]); return; }
      hctx.inToolList = false; // any other comment ends the list
    }
    if (/toolpaths?\s+used\s+in\s+this\s+file/i.test(t)) return; // header line, not a section
    // post-processors decorate these differently ("| Toolpath:- Outsides", "Toolpath Name: Outsides")
    var tp = /^tool\s*path(?:\s*name)?\s*[:=]\s*-?\s*(.+)$/i.exec(t.replace(/^[\s|*=#~_.-]+/, ''));
    if (tp){
      sections.push({line: lineNo, name: tp[1].replace(/[\s|*=#~_-]+$/, '').trim()});
      hctx.awaitTool = sections.length - 1;      // the next real comment names its tool
      return;
    }
    if (hctx.awaitTool !== null){
      var tdesc = t.replace(/^[\s|*=#~_-]+|[\s|*=#~_-]+$/g, '').replace(/^tool\s*[:=]\s*/i, '');
      if (tdesc && !/^tool\s*path/i.test(tdesc)){ sections[hctx.awaitTool].tool = tdesc; hctx.awaitTool = null; return; }
    }
    var fu = /^T(\d+)\s+D\s*=\s*([\d.]+)(.*)$/i.exec(t); // Fusion 360 style
    if (fu){
      var parts = fu[3].split('-');
      var fdesc = parts[parts.length - 1].trim();
      addToolInfo(fu[1], (fdesc || 'tool') + ' D=' + fu[2]);
      return;
    }
    hctx.lastComment = {text: t, line: lineNo};
  }

  function issue(sev, line, msg, key){
    if (issues.length >= maxIssues) return;
    if (key){ if (issue._seen[key]) { issue._seen[key]++; return; } issue._seen[key] = 1; }
    issues.push({sev:sev, line:line, msg:msg, key:key});
  }
  issue._seen = {};

  var st = {
    units: 'mm', unitsSeen:false,
    abs: true, arcAbs:false,
    plane: 17,
    motion: null,
    feed: null,
    spindle: false,
    tool: null,
    x:0, y:0, z:0,
    time: 0
  };
  var cutDist = 0, rapidDist = 0, sMax = 0, sMin = 0;

  function toMM(v){ return st.units === 'in' ? v * 25.4 : v; }

  function pushSeg(x1,y1,z1, rapid, lineNo){
    var dx=x1-st.x, dy=y1-st.y, dz=z1-st.z;
    var len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if (len < 1e-9) { st.x=x1; st.y=y1; st.z=z1; return; }
    var rate = rapid ? rapidRate : (st.feed || rapidRate);
    var dt = len / rate * 60; // seconds
    var s = {x0:st.x,y0:st.y,z0:st.z,x1:x1,y1:y1,z1:z1,rapid:rapid,line:lineNo,
             feed: rapid?null:st.feed, t0:st.time, t1:st.time+dt, units:st.units, tool:st.tool};
    if (st.stopBefore){ s.stop = true; st.stopBefore = false; }   // the machine is at rest before this move
    segs.push(s);
    if (lineFirstSeg[lineNo] === undefined) lineFirstSeg[lineNo] = segs.length-1;
    if (rapid) rapidDist += len; else cutDist += len;
    st.time += dt;
    st.x=x1; st.y=y1; st.z=z1;
  }

  // arc: motion 2 = CW, 3 = CCW. Coordinates in mm (already converted).
  function pushArc(tx,ty,tz, params, motion, lineNo){
    // plane axis mapping: [u, v, w] where arc is in u-v plane
    var map;
    if (st.plane === 17) map = {u:'x', v:'y', w:'z', iu:'i', iv:'j'};
    else if (st.plane === 18) map = {u:'z', v:'x', w:'y', iu:'k', iv:'i'}; // G18: XZ plane, but GRBL treats as Z-X
    else map = {u:'y', v:'z', w:'x', iu:'j', iv:'k'};

    var s = {x:st.x, y:st.y, z:st.z};
    var e = {x:tx, y:ty, z:tz};
    var su = s[map.u], sv = s[map.v], eu = e[map.u], ev = e[map.v];
    var cu, cv, r;

    if (params.r !== undefined){
      r = Math.abs(params.r);
      var du = eu - su, dv = ev - sv;
      var d2 = du*du + dv*dv;
      if (d2 < 1e-12){ issue('err', lineNo, 'Arc with R has identical start and end point — invalid (GRBL error 33).'); return; }
      var disc = 4*r*r - d2;
      if (disc < 0){
        issue('err', lineNo, 'Arc radius too small to reach the end point (GRBL error 33).');
        disc = 0;
      }
      var h = -Math.sqrt(disc / d2);
      if (motion === 3) h = -h;
      if (params.r < 0) h = -h;
      cu = su + 0.5*(du - dv*h);
      cv = sv + 0.5*(dv + du*h);
    } else if (params.i !== undefined || params.j !== undefined || params.k !== undefined){
      var oi = params[map.iu] || 0, oj = params[map.iv] || 0;
      if (st.arcAbs){ cu = oi; cv = oj; } else { cu = su + oi; cv = sv + oj; }
      r = Math.sqrt((su-cu)*(su-cu) + (sv-cv)*(sv-cv));
      var r2 = Math.sqrt((eu-cu)*(eu-cu) + (ev-cv)*(ev-cv));
      if (r > 0.001 && Math.abs(r - r2) > Math.max(0.3, r*0.005)){
        issue('warn', lineNo, 'Arc start and end radii differ by ' + (Math.abs(r-r2)).toFixed(3) + ' mm — GRBL may reject this arc (error 33).');
      }
    } else {
      issue('err', lineNo, 'G' + motion + ' arc has no I/J/K offsets and no R — move skipped.');
      return;
    }

    var a0 = Math.atan2(sv - cv, su - cu);
    var a1 = Math.atan2(ev - cv, eu - cu);
    var da = a1 - a0;
    if (motion === 2){ // CW: angle decreases
      if (da >= -1e-9) da -= 2*Math.PI;
    } else {           // CCW: angle increases
      if (da <= 1e-9) da += 2*Math.PI;
    }
    // full circle: identical start/end with IJK form
    if (Math.abs(su-eu) < 1e-9 && Math.abs(sv-ev) < 1e-9 && params.r === undefined){
      da = (motion === 2) ? -2*Math.PI : 2*Math.PI;
    }
    var steps = Math.max(8, Math.min(240, Math.ceil(Math.abs(da) * Math.max(r,0.5) / 0.6)));
    var sw = s[map.w], ew = e[map.w];
    for (var k=1;k<=steps;k++){
      var t = k/steps;
      var a = a0 + da*t;
      var p = {};
      p[map.u] = cu + r*Math.cos(a);
      p[map.v] = cv + r*Math.sin(a);
      p[map.w] = sw + (ew - sw)*t;
      pushSeg(p.x, p.y, p.z, false, lineNo);
    }
    // snap exact endpoint
    st.x = tx; st.y = ty; st.z = tz;
  }

  var KNOWN_LETTERS = {G:1,M:1,X:1,Y:1,Z:1,I:1,J:1,K:1,R:1,F:1,S:1,T:1,N:1,P:1,L:1,H:1,D:1};

  for (var li = 0; li < lines.length; li++){
    var raw = lines[li];
    var lineNo = li + 1;
    // harvest CAM metadata from comments before stripping them
    var sc = splitGcodeComments(raw);
    sc.comments.forEach(function(ct){ harvestComment(ct, lineNo); });
    var code = sc.code;
    if (!code || code === '%') continue;
    hctx.awaitTool = null;                       // real code ends a toolpath's header comments

    var words = [];
    var re = /([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g, m;
    var consumed = code.replace(re, ' ');
    if (/[A-Za-z0-9]/.test(consumed.replace(/\s/g,''))){
      issue('warn', lineNo, 'Unrecognised text on line: "' + code.slice(0,60) + '"', 'garbage');
    }
    while ((m = re.exec(code)) !== null){
      words.push([m[1].toUpperCase(), parseFloat(m[2])]);
    }
    if (!words.length) continue;

    var params = {}, gcodes = [], mcodes = [], hasAxis = false, sawT;
    for (var w = 0; w < words.length; w++){
      var L = words[w][0], V = words[w][1];
      if (!KNOWN_LETTERS[L]){
        issue('warn', lineNo, 'Word "' + L + V + '" is not part of the GRBL dialect — GRBL will reject this line.', 'letter'+L);
        continue;
      }
      if (L === 'G') gcodes.push(V);
      else if (L === 'M') mcodes.push(V);
      else if (L === 'F'){ st.feed = toMM(V); }
      else if (L === 'S'){ params.s = V; if (V > sMax) sMax = V; if (V > 0 && (!sMin || V < sMin)) sMin = V; }
      else if (L === 'T'){ sawT = V; }
      else if (L === 'N'){ /* line number, ignore */ }
      else {
        params[L.toLowerCase()] = V;
        if (L==='X'||L==='Y'||L==='Z') hasAxis = true;
      }
    }
    if (sawT !== undefined) st.pendingTool = sawT;

    var g53line = false, skipMotion = false;

    for (var gi = 0; gi < gcodes.length; gi++){
      var g = gcodes[gi];
      if (g === 0 || g === 1 || g === 2 || g === 3) st.motion = g;
      else if (g === 4){
        var dwell = params.p !== undefined ? params.p : 0;
        st.time += dwell; // GRBL: P is seconds
        st.stopBefore = true;
        skipMotion = skipMotion || !hasAxis;
      }
      else if (g === 17 || g === 18 || g === 19) st.plane = g;
      else if (g === 20){ st.units = 'in'; st.unitsSeen = true; }
      else if (g === 21){ st.units = 'mm'; st.unitsSeen = true; }
      else if (g === 90) st.abs = true;
      else if (g === 91) st.abs = false;
      else if (g === 90.1) st.arcAbs = true;
      else if (g === 91.1) st.arcAbs = false;
      else if (g === 28 || g === 28.2){
        issue('info', lineNo, 'G28 moves to a machine-defined position — 454 Control cannot know where that is, so this move is not drawn.', 'g28');
        skipMotion = true;
      }
      else if (g === 53){
        g53line = true;
        issue('info', lineNo, 'G53 uses machine coordinates — the work offset is unknown here, so this move is not drawn.', 'g53');
      }
      else if (IGNORED_G[g] !== undefined){
        issue('info', lineNo, 'G' + g + ': ' + IGNORED_G[g], 'gI'+g);
      }
      else if (g === 81 || g === 82 || g === 83 || g === 73 || g === 76 || g === 80 || g === 85 || g === 86 || g === 89){
        issue('err', lineNo, 'G' + g + ' canned cycle — not supported by GRBL or Carbide Motion. Re-post with canned cycles off / "single moves".', 'canned'+g);
        skipMotion = true;
      }
      else if (g === 41 || g === 42){
        issue('err', lineNo, 'G' + g + ' cutter compensation — not supported by GRBL. Apply compensation in CAM instead.', 'comp'+g);
      }
      else if (g === 38 || Math.abs(g - 38.2) < 0.001 || Math.abs(g-38.3)<0.001 || Math.abs(g-38.4)<0.001 || Math.abs(g-38.5)<0.001){
        issue('warn', lineNo, 'G38.x probe move — supported by GRBL but not something Carbide Motion expects inside a job file.', 'probe');
        skipMotion = true;
      }
      else if (!SUPPORTED_G[g]){
        issue('err', lineNo, 'G' + g + ' is not in the GRBL / Carbide Motion supported set — the job will fault on this line.', 'gU'+g);
        skipMotion = true;
      }
    }

    // spindle, coolant, tool change and program stops all wait for motion to finish in GRBL
    if (mcodes.length) st.stopBefore = true;
    for (var mi = 0; mi < mcodes.length; mi++){
      var mc = mcodes[mi];
      if (mc === 3) st.spindle = true;
      else if (mc === 4){ st.spindle = true; issue('warn', lineNo, 'M4 (reverse / laser-mode spindle) — Carbide Motion lists only M3/M5. Trim routers ignore direction, but expect a warning.', 'm4'); }
      else if (mc === 5) st.spindle = false;
      else if (mc === 6){
        var t = st.pendingTool !== undefined ? st.pendingTool : st.tool;
        st.tool = t;
        tools.push({line: lineNo, tool: t});
        if (t !== null && t !== undefined && toolInfo[t] === undefined &&
            hctx.lastComment && lineNo - hctx.lastComment.line <= 2){
          addToolInfo(t, hctx.lastComment.text);
        }
        var tdesc = (t !== null && t !== undefined && toolInfo[t]) ? ' (' + toolInfo[t].desc + ')' : '';
        issue('info', lineNo, 'M6 tool change to T' + (t === null || t === undefined ? '?' : t) + tdesc + ' — Carbide Motion pauses here (BitSetter / tool-length routine).', undefined);
      }
      else if (mc === 0 || mc === 1 || mc === 2 || mc === 30){ /* stops — fine */ }
      else if (IGNORED_M[mc] !== undefined) issue('info', lineNo, 'M' + mc + ': ' + IGNORED_M[mc], 'mI'+mc);
      else if (mc === 8) issue('warn', lineNo, 'M8 flood coolant — GRBL accepts it, but it is not in the Carbide Motion supported list.', 'm8');
      else issue('err', lineNo, 'M' + mc + ' is not supported by GRBL / Carbide Motion.', 'mU'+mc);
    }

    // motion execution
    if (!skipMotion && !g53line && (hasAxis || ((st.motion===2||st.motion===3) && (params.i!==undefined||params.j!==undefined||params.k!==undefined||params.r!==undefined)))){
      if (st.motion === null){
        issue('err', lineNo, 'Axis words with no motion mode active (no G0/G1/G2/G3 seen yet) — GRBL error 22/25.', 'nomode');
        continue;
      }
      var tx = st.x, ty = st.y, tz = st.z;
      if (st.abs){
        if (params.x !== undefined) tx = toMM(params.x);
        if (params.y !== undefined) ty = toMM(params.y);
        if (params.z !== undefined) tz = toMM(params.z);
      } else {
        if (params.x !== undefined) tx += toMM(params.x);
        if (params.y !== undefined) ty += toMM(params.y);
        if (params.z !== undefined) tz += toMM(params.z);
      }
      if (st.motion === 0){
        pushSeg(tx,ty,tz, true, lineNo);
      } else {
        if (!st.feed){
          issue('err', lineNo, 'Feed move with no feed rate set (no F word yet) — GRBL error 22.', 'nofeed');
        }
        if (!st.spindle){
          issue('warn', lineNo, 'Cutting move before the spindle is started (no M3 yet).', 'nospindle');
        }
        if (st.motion === 1){
          pushSeg(tx,ty,tz, false, lineNo);
        } else {
          // convert I/J/K to mm
          var ap = {};
          if (params.i !== undefined) ap.i = toMM(params.i);
          if (params.j !== undefined) ap.j = toMM(params.j);
          if (params.k !== undefined) ap.k = toMM(params.k);
          if (params.r !== undefined) ap.r = toMM(params.r);
          pushArc(tx,ty,tz, ap, st.motion, lineNo);
        }
      }
    }
  }

  if (!st.unitsSeen && segs.length)
    issues.unshift({sev:'warn', line:1, msg:'No G20/G21 units command found — GRBL will use whatever mode it was last in. VCarve posts normally emit one; add it to be safe.'});

  // duplicate-suppression summary
  for (var key in issue._seen){
    if (issue._seen[key] > 1){
      for (var q=0;q<issues.length;q++){
        if (issues[q].key === key){ issues[q].msg += ' (×' + issue._seen[key] + ' occurrences — first shown)'; break; }
      }
    }
  }

  // A toolpath named twice with no cutting in between is one toolpath (a post may write the
  // name in its header and again at the start of the first toolpath).
  sections = sections.filter(function(sec, i){
    if (i === 0) return true;
    var prev = sections[i - 1];
    if (prev.name !== sec.name) return true;
    var cut = false;
    for (var k = 0; k < segs.length && !cut; k++) if (!segs[k].rapid && segs[k].line >= prev.line && segs[k].line < sec.line) cut = true;
    if (!cut && !prev.tool && sec.tool) prev.tool = sec.tool;
    return cut;
  });
  st.trailGap = segs.length ? st.time - segs[segs.length - 1].t1 : 0;
  if (opts.accel) retimeWithPlanner(segs, opts);
  var totalTime = segs.length ? Math.max(st.time, segs[segs.length - 1].t1 + st.trailGap) : st.time;
  return {segs:segs, issues:issues, tools:tools, toolInfo:toolInfo, sections:sections,
          lineFirstSeg:lineFirstSeg,
          cutDist:cutDist, rapidDist:rapidDist, totalTime:totalTime, lines:lines, sMax:sMax, sMin:sMin};
}

function splitGcodeComments(raw){
  var code = '', cur = '', comments = [], depth = 0;
  for (var i = 0; i < raw.length; i++){
    var ch = raw.charAt(i);
    if (depth === 0 && ch === ';'){ comments.push(raw.slice(i + 1)); break; }
    if (ch === '('){ if (depth > 0) cur += ch; else code += ' '; depth++; continue; }
    if (ch === ')' && depth > 0){
      depth--;
      if (depth === 0){ comments.push(cur); cur = ''; } else cur += ch;
      continue;
    }
    if (depth > 0) cur += ch; else code += ch;
  }
  if (depth > 0) comments.push(cur);            // unclosed: the rest of the line is comment
  return {code: code.trim(), comments: comments};
}

function cleanForSend(raw){
  return splitGcodeComments(raw).code;
}

export { parseGcode, retimeWithPlanner, splitGcodeComments, cleanForSend, SUPPORTED_G, SUPPORTED_M };
