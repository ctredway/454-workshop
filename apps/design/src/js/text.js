function capHeightUnits(font){
  try{
    var g = font.charToGlyph('H');
    if (g && g.index > 0){ var b = g.getBoundingBox(); if (b.y2 > 0) return b.y2; }
  }catch(e){}
  var os2 = font.tables && font.tables.os2;
  if (os2 && os2.sCapHeight > 0) return os2.sCapHeight;
  return font.unitsPerEm * 0.7;
}
// flatten opentype path commands (y-down) into closed contours; Wang's bound picks the
// segment count so every curve stays within `tol` mm of the true outline
function flattenGlyphCommands(cmds, tol, out){
  var cur = null, x = 0, y = 0;
  function close(){ if (cur && cur.length >= 3){
      var a = cur[0], z = cur[cur.length-1];
      if (Math.hypot(a[0]-z[0], a[1]-z[1]) < 1e-9) cur.pop();
      if (cur.length >= 3) out.push(cur);
    } cur = null; }
  cmds.forEach(function(c){
    if (c.type === 'M'){ close(); cur = [[c.x, c.y]]; x = c.x; y = c.y; }
    else if (c.type === 'L'){ if (!cur) cur = [[x, y]]; cur.push([c.x, c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q'){
      if (!cur) cur = [[x, y]];
      var dq = Math.hypot(x - 2*c.x1 + c.x, y - 2*c.y1 + c.y) / 4;
      var nq = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(dq / tol))));
      for (var i = 1; i <= nq; i++){
        var t = i/nq, u = 1-t;
        cur.push([u*u*x + 2*u*t*c.x1 + t*t*c.x, u*u*y + 2*u*t*c.y1 + t*t*c.y]);
      }
      x = c.x; y = c.y;
    }
    else if (c.type === 'C'){
      if (!cur) cur = [[x, y]];
      var d1 = Math.hypot(x - 2*c.x1 + c.x2, y - 2*c.y1 + c.y2);
      var d2 = Math.hypot(c.x1 - 2*c.x2 + c.x, c.y1 - 2*c.y2 + c.y);
      var nc = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(0.75 * Math.max(d1, d2) / tol))));
      for (var j = 1; j <= nc; j++){
        var s2 = j/nc, v = 1-s2;
        cur.push([v*v*v*x + 3*v*v*s2*c.x1 + 3*v*s2*s2*c.x2 + s2*s2*s2*c.x,
                  v*v*v*y + 3*v*v*s2*c.y1 + 3*v*s2*s2*c.y2 + s2*s2*s2*c.y]);
      }
      x = c.x; y = c.y;
    }
    else if (c.type === 'Z'){ close(); }
  });
  close();
}
var TEXT_CACHE = new WeakMap();
// glyph outlines in LOCAL coords (x right, y up, origin = anchor), or null while the font loads
function textLocal(e){
  var font = fontObj(e.font);
  if (!font) return null;
  var sw = e.sw || 1;                                           // horizontal stretch factor
  var sig = [e.str, e.font, e.h, e.align, sw].join('\u0001');
  var c = TEXT_CACHE.get(e);
  if (c && c.sig === sig && c.font === font) return c;
  var fs = e.h * font.unitsPerEm / capHeightUnits(font);        // em size giving cap height = h
  var sc = fs / font.unitsPerEm;
  var lineH = (font.ascender - font.descender) * sc * 1.1;
  var raw = [];
  String(e.str).split('\n').forEach(function(line, li){
    var w = font.getAdvanceWidth(line, fs);
    var ox = e.align === 'center' ? -w/2 : (e.align === 'right' ? -w : 0);
    flattenGlyphCommands(font.getPath(line, ox, li * lineH, fs).commands, 0.01, raw);
  });
  var contours = raw.map(function(ct){ return ct.map(function(p){ return [p[0] * sw, -p[1]]; }); });
  var box = null;
  contours.forEach(function(ct){ ct.forEach(function(p){
    if (!box) box = {x0:p[0], y0:p[1], x1:p[0], y1:p[1]};
    else { box.x0 = Math.min(box.x0,p[0]); box.y0 = Math.min(box.y0,p[1]);
           box.x1 = Math.max(box.x1,p[0]); box.y1 = Math.max(box.y1,p[1]); }
  }); });
  if (!box) box = {x0:0, y0:0, x1:e.h*0.5, y1:e.h};              // blank text: small placeholder
  c = {sig:sig, font:font, contours:contours, box:box, lineH:lineH};
  TEXT_CACHE.set(e, c);
  return c;
}
function textXform(e, lx, ly){
  var fy = e.fy ? -1 : 1, rot = e.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  ly *= fy;
  return [e.x + lx*c - ly*s, e.y + lx*s + ly*c];
}
function textLocalBox(e){
  var L = textLocal(e);
  if (L) return L.box;
  // font still loading: a reasonable estimate so the text is still visible and pickable
  var lines = String(e.str).split('\n'), n = 0;
  lines.forEach(function(l){ n = Math.max(n, l.length); });
  var w = Math.max(1, n) * e.h * 0.62 * (e.sw || 1);
  var ox = e.align === 'center' ? -w/2 : (e.align === 'right' ? -w : 0);
  return {x0:ox, y0:-(lines.length-1) * e.h * 1.45 - e.h * 0.25, x1:ox + w, y1:e.h};
}
function textWorld(e){
  var L = textLocal(e);
  if (!L) return null;
  return L.contours.map(function(ct){ return ct.map(function(p){ return textXform(e, p[0], p[1]); }); });
}
function textCorners(e){
  var b = textLocalBox(e);
  return [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(function(p){ return textXform(e, p[0], p[1]); });
}
// 0 when the point is inside the text's box, otherwise the distance to it
function textHitDist(e, w){
  var rot = -(e.rot || 0), c = Math.cos(rot), s = Math.sin(rot);
  var dx = w.x - e.x, dy = w.y - e.y;
  var lx = dx*c - dy*s, ly = (dx*s + dy*c) * (e.fy ? -1 : 1);
  var b = textLocalBox(e);
  return Math.hypot(Math.max(b.x0 - lx, 0, lx - b.x1), Math.max(b.y0 - ly, 0, ly - b.y1));
}
// text -> ordinary closed shapes (one group per text, one shape per outline)
function textToCurves(e){
  var W = textWorld(e);
  if (!W) return null;
  var shapes = W.filter(function(ct){ return ct.length >= 3; })
                .map(function(ct){ return {t:'poly', pts:ct, closed:true}; });
  if (!shapes.length) return null;
  shapes.forEach(function(sh){ if (e.con) sh.con = true; if (e.tp) sh.tp = true; });
  return shapes.length === 1 ? shapes[0] : {t:'group', ents:shapes};
}

var TXT = null;   // the text being added/edited while the dialog is open
function refreshFontSelect(selKey){
  var sel = document.getElementById('txtFont');
  sel.innerHTML = '';
  function grp(label, keys){
    if (!keys.length) return;
    var g = document.createElement('optgroup'); g.label = label;
    keys.forEach(function(k){ var o = document.createElement('option'); o.value = k; o.textContent = FONTS[k].name; g.appendChild(o); });
    sel.appendChild(g);
  }
  var keys = Object.keys(FONTS);
  FONT_CATS.forEach(function(c){
    grp(c[1], keys.filter(function(k){ return !FONTS[k].custom && FONTS[k].cat === c[0]; }));
  });
  grp('Your fonts', keys.filter(function(k){ return FONTS[k].custom; }));
  if (selKey && !FONTS[selKey]){
    var o = document.createElement('option'); o.value = selKey;
    o.textContent = String(selKey).replace(/^custom:/, '') + ' (not loaded)';
    sel.appendChild(o);
  }
  sel.value = selKey;
}
function openTextModal(idx, at){
  DRAW = null; HANDLES.mode = 'scale'; HANDLES.active = false;
  var e;
  pushUndo();                                     // one undo step for the whole add/edit
  if (idx === null || idx === undefined){
    e = {t:'text', str:'', font: UICFG.lastFont || 'roboto', h: UICFG.lastTextH || 10,
         align:'left', x:at.x, y:at.y, rot:0};
    DOC.ents.push(e);
    TXT = {ent:e, isNew:true};
  } else {
    e = DOC.ents[idx];
    TXT = {ent:e, isNew:false, before:JSON.stringify(e)};
  }
  fontObj(e.font);                                // start loading the font right away
  document.getElementById('textTitle').textContent = TXT.isNew ? 'Add text' : 'Edit text';
  document.getElementById('txtOK').textContent = TXT.isNew ? 'Place text' : 'Update text';
  document.getElementById('txtStr').value = e.str;
  refreshFontSelect(e.font);
  document.getElementById('txtH').value = e.h;
  document.getElementById('txtAlign').value = e.align || 'left';
  document.getElementById('textModal').hidden = false;
  var ta = document.getElementById('txtStr'); ta.focus(); ta.select();
  draw();
}
function closeTextModal(commit){
  if (!TXT) return;
  var e = TXT.ent, i = DOC.ents.indexOf(e);
  document.getElementById('textModal').hidden = true;
  if (!commit){
    if (TXT.isNew){ if (i >= 0) DOC.ents.splice(i, 1); }
    else if (i >= 0) DOC.ents[i] = JSON.parse(TXT.before);
    UNDO.pop();                                   // nothing changed, so drop the undo step
  } else if (!String(e.str).trim()){
    if (i >= 0) DOC.ents.splice(i, 1);
    if (TXT.isNew) UNDO.pop();
    else toast('info', 'Text removed', 'The text was empty, so it was deleted. Undo brings it back.');
  } else {
    UICFG.lastFont = e.font; UICFG.lastTextH = e.h; uiCfgSave();
    SEL = [i];
  }
  TXT = null;
  if (TOOL === 'text') stagePrompt('text0');
  persist(); draw();
}
function convertTextsToCurves(idxs){
  var texts = idxs.filter(function(i){ return DOC.ents[i] && DOC.ents[i].t === 'text'; });
  if (!texts.length) return 0;
  if (texts.some(function(i){ return !textLocal(DOC.ents[i]); })){
    toast('warn', 'Font still loading', 'Wait until the letters appear, then convert again.');
    return 0;
  }
  pushUndo();
  var n = 0;
  DOC.ents = DOC.ents.map(function(e, i){
    if (texts.indexOf(i) < 0) return e;
    var c = textToCurves(e);
    if (c){ n++; return c; }
    return e;
  });
  SEL = []; persist(); draw();
  return n;
}

