/* ============================================================
   JOB SUMMARY, per toolpath. Toolpaths come from name comments when the
   post-processor writes them, otherwise from tool changes, otherwise the
   whole file is one. Everything else is measured from the moves themselves.
   ============================================================ */
function jobSummary(model){
  if (!model || !model.segs || !model.segs.length) return null;
  var segs = model.segs, lines = model.lines, how, bounds;
  if (model.sections && model.sections.length){
    how = 'named';
    bounds = model.sections.map(function(x){ return {line:x.line, name:x.name, toolDesc:x.tool || null}; });
  } else if (model.tools && model.tools.length > 1){
    how = 'tools';
    bounds = model.tools.map(function(x){
      var ti = model.toolInfo && model.toolInfo[x.tool];
      return {line:x.line, name:'T' + x.tool + (ti ? ' \u2014 ' + ti.desc : '')};
    });
  } else {
    how = 'file';
    bounds = [{line:1, name:'Whole file'}];
  }
  bounds.sort(function(a, b){ return a.line - b.line; });
  bounds.forEach(function(b){ b.from = b.line; });
  // Some posts write the tool change and spindle speed just BEFORE the next toolpath's name.
  // Those set-up lines belong to the toolpath they are setting up, so pull each boundary back
  // over any set-up lines directly above it (tool, spindle, comments, blank lines; no motion).
  if (how === 'named') bounds.forEach(function(b, bi){
    if (bi === 0) return;
    var ln = b.from - 1;
    while (ln > bounds[bi - 1].from){
      var c = (cleanForSend(lines[ln - 1]) || '').trim();
      if (c === '' || /^(M0*6|M0*[345]|T\d|S[\d.])/i.test(c.replace(/^N\d+\s*/i, '')) && !/[XYZ]/i.test(c)) ln--;
      else break;
    }
    b.from = ln + 1;
  });
  if (bounds[0].from > 1){
    var cutsBefore = segs.some(function(g){ return g.line < bounds[0].from && !g.rapid; });
    if (cutsBefore) bounds.unshift({line:1, from:1, name:'Before the first toolpath'});
    else bounds[0].from = 1;                                   // setup moves belong to the first toolpath
  }
  function sAt(ln){                                            // spindle speed in effect on a line
    for (var i = Math.min(ln, lines.length) - 1; i >= 0; i--){
      var m = /S\s*([\d.]+)/i.exec(cleanForSend(lines[i]) || '');
      if (m) return parseFloat(m[1]);
    }
    return null;
  }
  var out = [], total = model.totalTime || 0;
  bounds.forEach(function(b, bi){
    var to = bi + 1 < bounds.length ? bounds[bi + 1].from - 1 : lines.length;
    var mine = segs.filter(function(g){ return g.line >= b.from && g.line <= to; });
    var r = {name:b.name, line:b.line, from:b.from, to:to, units:'mm', tool:null, toolDesc:b.toolDesc || null, moves:mine.length,
             cut:0, rapid:0, time:0, zTop:null, zBottom:null, levels:[], plunges:0,
             feed:null, plungeFeed:null, feedMin:null, feedMax:null, rpm:[], ext:null};
    if (mine.length){
      r.units = mine[0].units || 'mm';
      for (var k = 0; k < mine.length; k++) if (mine[k].tool !== null && mine[k].tool !== undefined){ r.tool = mine[k].tool; break; }
      r.time = mine[mine.length - 1].t1 - mine[0].t0;
    }
    var feedDist = {}, plungeDist = {}, lv = {}, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    mine.forEach(function(g){
      var dx = g.x1 - g.x0, dy = g.y1 - g.y0, dz = g.z1 - g.z0, xy = Math.hypot(dx, dy), L = Math.hypot(xy, dz);
      if (g.rapid){ r.rapid += L; return; }
      r.cut += L;
      [g.z0, g.z1].forEach(function(z){
        if (r.zTop === null || z > r.zTop) r.zTop = z;
        if (r.zBottom === null || z < r.zBottom) r.zBottom = z;
      });
      x0 = Math.min(x0, g.x0, g.x1); x1 = Math.max(x1, g.x0, g.x1); y0 = Math.min(y0, g.y0, g.y1); y1 = Math.max(y1, g.y0, g.y1);
      var f = g.feed ? Math.round(g.feed) : null;
      if (xy < 1e-3 && dz < 0){                                // a straight plunge
        r.plunges++;
        if (f) plungeDist[f] = (plungeDist[f] || 0) + L;
      } else {
        if (f){
          feedDist[f] = (feedDist[f] || 0) + L;
          r.feedMin = r.feedMin === null ? f : Math.min(r.feedMin, f);   // the range covers cutting moves only
          r.feedMax = r.feedMax === null ? f : Math.max(r.feedMax, f);
        }
        if (Math.abs(dz) < 1e-6 && xy > 1e-3) lv[g.z0.toFixed(3)] = true;   // cutting level
      }
    });
    function mode(dist){ var best = null; for (var k2 in dist) if (best === null || dist[k2] > dist[best]) best = k2; return best === null ? null : +best; }
    r.feed = mode(feedDist); r.plungeFeed = mode(plungeDist);
    r.levels = Object.keys(lv).map(Number).sort(function(a, b){ return b - a; });
    if (x0 !== Infinity) r.ext = {x0:x0, y0:y0, x1:x1, y1:y1};
    // speeds set in this toolpath, plus the inherited one only if cutting starts before a new speed is set
    var rpms = {}, firstCut = null, ownBeforeCut = false;
    for (var q = 0; q < mine.length; q++) if (!mine[q].rapid){ firstCut = mine[q].line; break; }
    for (var li = b.from; li <= to; li++){
      var sm = /S\s*([\d.]+)/i.exec(cleanForSend(lines[li - 1]) || '');
      if (!sm) continue;
      rpms[parseFloat(sm[1])] = true;
      if (firstCut === null || li <= firstCut) ownBeforeCut = true;
    }
    if (!ownBeforeCut){ var s0 = sAt(b.from); if (s0 !== null) rpms[s0] = true; }
    r.rpm = Object.keys(rpms).map(Number).filter(function(v){ return v > 0; });
    r.share = total > 0 ? r.time / total : 0;
    out.push(r);
  });
  return {how:how, list:out};
}
var TPSUM_SEL = null;
function renderToolpathSummary(){
  var box = document.getElementById('tpSum'), badge = document.getElementById('tpBadge'), head = document.getElementById('tpSumHead');
  if (!box) return;
  box.innerHTML = '';
  var sum = jobSummary(MODEL);
  if (!sum){ badge.textContent = '0'; head.textContent = 'Load a G-code file to see its toolpaths.'; return; }
  badge.textContent = String(sum.list.length);
  head.textContent = sum.how === 'named'
    ? sum.list.length + (sum.list.length === 1 ? ' toolpath, named in the file.' : ' toolpaths, named in the file.') + ' Click one to show it in the preview.'
    : sum.how === 'tools'
    ? 'This file doesn\u2019t name its toolpaths, so they\u2019re grouped by tool change (' + sum.list.length + ' tools). Click one to show it in the preview.'
    : 'This file doesn\u2019t name its toolpaths and uses one tool, so it\u2019s summarized as a whole.';
  sum.list.forEach(function(r, i){
    var inch = r.units === 'in', U = inch ? 25.4 : 1, lu = inch ? ' in' : ' mm', fu = inch ? ' in/min' : ' mm/min';
    function L(v, dp){ return (v / U).toFixed(dp === undefined ? (inch ? 3 : 2) : dp); }
    function D(v){ return v >= 1000 * U && !inch ? (v / 1000).toFixed(2) + ' m' : (v / U).toFixed(inch ? 1 : 0) + lu; }
    var card = document.createElement('button');
    card.className = 'tpsCard' + (TPSUM_SEL === i ? ' on' : '');
    card.setAttribute('aria-pressed', TPSUM_SEL === i ? 'true' : 'false');
    var h = document.createElement('div'); h.className = 'tpsName';
    h.textContent = (i + 1) + ' \u00b7 ' + r.name;
    var tm = document.createElement('span'); tm.className = 'tpsTime';
    tm.textContent = '~' + fmtTime(r.time) + (r.share ? ' \u00b7 ' + Math.round(r.share * 100) + '%' : '');
    h.appendChild(tm); card.appendChild(h);
    var ti = r.tool !== null && MODEL.toolInfo ? MODEL.toolInfo[r.tool] : null;
    var tl = document.createElement('div'); tl.className = 'tpsTool';
    var desc = ti ? ti.desc : r.toolDesc;
    tl.textContent = r.tool !== null ? 'T' + r.tool + (desc ? ' \u00b7 ' + desc : '') : (desc || 'No tool change before this toolpath');
    card.appendChild(tl);
    var dl = document.createElement('dl'); dl.className = 'tpsSet';
    function row(k, v){ var dt = document.createElement('dt'); dt.textContent = k; var dd = document.createElement('dd'); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); }
    if (r.cut > 0){
      row('Deepest cut', 'Z ' + L(r.zBottom) + lu);     // plunges start at safe height, so the top isn't meaningful
      if (r.levels.length){
        var shown = r.levels.slice(0, 6).map(function(z){ return L(z); }).join(', ') + (r.levels.length > 6 ? ', \u2026' : '');
        row('Cutting levels', r.levels.length + (r.levels.length === 1 ? ' level' : ' levels') + ' (' + shown + ')');
      }
      if (r.feed !== null) row('Feed', L(r.feed, 0) + fu + (r.feedMin !== r.feedMax ? '  (range ' + L(r.feedMin, 0) + '\u2013' + L(r.feedMax, 0) + ')' : ''));
      if (r.plungeFeed !== null) row('Plunge', L(r.plungeFeed, 0) + fu + ' \u00b7 ' + r.plunges + (r.plunges === 1 ? ' plunge' : ' plunges'));
      if (r.rpm.length) row('Spindle', r.rpm.map(function(v){ return v + ' rpm'; }).join(', '));
      if (r.ext) row('Area', 'X ' + L(r.ext.x0, 1) + '\u2013' + L(r.ext.x1, 1) + ' \u00b7 Y ' + L(r.ext.y0, 1) + '\u2013' + L(r.ext.y1, 1) + lu);
      row('Distance', 'cutting ' + D(r.cut) + ' \u00b7 rapid ' + D(r.rapid));
    } else {
      row('Cutting', 'none (moves only)');
    }
    row('Lines', r.from + '\u2013' + r.to);
    card.appendChild(dl);
    card.addEventListener('click', function(){
      TPSUM_SEL = i;
      var target = null;                                        // first move in this toolpath
      for (var k = 0; k < MODEL.segs.length; k++) if (MODEL.segs[k].line >= r.from){ target = MODEL.segs[k].line; break; }
      if (target !== null && target <= r.to) jumpToLine(target);
      renderToolpathSummary();
    });
    box.appendChild(card);
  });
}

function renderStats(){
  function set(id, v){ document.getElementById(id).textContent = v; }
  if (!MODEL || !MODEL.segs.length){
    set('stX','—');set('stY','—');set('stZ','—');set('stT','—');set('stD','—');set('stTools','—');
    document.getElementById('codeCount').textContent = MODEL ? MODEL.lines.length + ' lines' : '';
    return;
  }
  var bb = modelBBox(MODEL);
  set('stX', bb.cmin.x.toFixed(1) + ' … ' + bb.cmax.x.toFixed(1) + ' mm');
  set('stY', bb.cmin.y.toFixed(1) + ' … ' + bb.cmax.y.toFixed(1) + ' mm');
  set('stZ', bb.cmin.z.toFixed(2) + ' / ' + bb.cmax.z.toFixed(2) + ' mm');
  set('stT', '~' + fmtTime(MODEL.totalTime));
  set('stD', (MODEL.cutDist/1000).toFixed(1) + ' m / ' + (MODEL.rapidDist/1000).toFixed(1) + ' m');
  var tl = MODEL.tools.map(function(t){ return 'T' + (t.tool===null||t.tool===undefined?'?':t.tool); });
  var el = document.getElementById('stTools');
  el.textContent = tl.length ? tl.join(' → ') : 'none (no M6)';
  el.title = MODEL.tools.map(function(t){
    var ti = MODEL.toolInfo[t.tool];
    return 'T' + t.tool + (ti ? ' — ' + ti.desc : '');
  }).join('\n');
  document.getElementById('codeCount').textContent = MODEL.lines.length + ' lines · ' + MODEL.segs.length + ' segments';
}

