/* ---------------- VCarve text ----------------
   VCarve keeps text as text: each letter's outline is stored once, centred on zero at the text's height, and
   the letters' places are worked out from numbers kept beside them. Read as plain outlines (as they used to
   be), every letter of every block of text lands on the same spot. This reads the numbers and puts each
   letter where VCarve does.

   What a block of text holds (worked out from a tutorial project with twelve blocks, and checked against the
   DXF VCarve exports from it: 1,002 letter outlines of straight text exactly, 8 on a curve to 0.003 in; then
   against a project of Clint's own, test/fixtures: text fitted to a box, and text set left on a curve):
   - its settings (`_txtAL_...`, `_txtblk...`): the words, left or centred, on a curve or not;
   - the box its letters fill, in a space of its own, and a 3 x 3 matrix that puts that space on the page
     (its size, a mirror, its place);
   - its lines; each line's words (a space is a word of one character); each word's characters. A character
     has its code, its font, its advance (how far the pen moves on), its outlines, and then: how far its
     outline's centre is from the pen, the kerning after it, and its height and width. A line ends with how
     far below the line before it sits;
   - text on a curve: the curve, after the last line.
   The classes are written as a programming library writes them (a name the first time, a number after), so
   those numbers differ from file to file and are read where they stand, never looked for.

   The rule: the pen starts at 0; a letter's outline sits at the pen plus its centre's distance; the pen moves
   on by the advance and the kerning. Lines are centred or set left by the letters' own extent. The layout's
   box goes on the recorded box (centres across, tops together), and the matrix puts it on the page. On a
   curve: the row of letters is centred on the middle of the curve by distance along it, or set left starts
   where the curve starts; each letter's own origin (its centre, on the baseline) goes on the curve at its
   centre's distance, turned to the curve's direction there. The curve is kept as it's used (already turned
   round, if Reverse was ticked), and the letters at the size they're drawn (fitted to a box or a curve, or not).

   Only what's been seen is placed. Text set right, or on a curve with other settings than the ones checked
   (off the curve, to one side of it, not filling it), is left out of the drawing and named: convert it to curves in VCarve to bring it in. */

function crvTextStr(vd, q){
  if (vd[q] !== 0xFF || vd[q + 1] !== 0xFE || vd[q + 2] !== 0xFF) return null;
  var len = vd[q + 3], p = q + 4;
  if (len === 0xFF){ len = vd[p] | (vd[p + 1] << 8); p += 2; }
  if (p + 2 * len > vd.length) return null;
  var t = '';
  for (var c = 0; c < len; c++) t += String.fromCharCode(vd[p + 2 * c] | (vd[p + 2 * c + 1] << 8));
  return {t: t, end: p + 2 * len};
}
function crvTextFind(vd, from, to, bytes){
  to = Math.min(to, vd.length);
  for (var i = Math.max(0, from); i + bytes.length <= to; i++){
    var k = 0;
    while (k < bytes.length && vd[i + k] === bytes[k]) k++;
    if (k === bytes.length) return i;
  }
  return -1;
}
function crvTextName(s){                                    // a name as the file writes it: ff fe ff, its length, UTF-16
  var out = [0xFF, 0xFE, 0xFF, s.length];
  for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255, s.charCodeAt(i) >> 8);
  return out;
}
// A class, where an object starts: a name the first time (ffff, a version, the name's length, the name), a
// number of 0x8000 or more after. Returns where it ends, or -1 if that isn't one.
function crvClassRef(vd, p){
  var v = vd[p] | (vd[p + 1] << 8);
  if (v === 0xFFFF){ var len = vd[p + 4] | (vd[p + 5] << 8); return len > 0 && len < 64 ? p + 6 + len : -1; }
  return v >= 0x8000 ? p + 2 : -1;
}

// Read the block of text whose settings start at `mark`. outs: the outlines the drawing was found to hold, by
// where each starts ({end, x0, y0, x1, y1}). Throws, saying what, if it isn't as expected.
function crvTextRead(vd, dv, mark, stop, outs){
  var L = vd.length;
  function f64(o){ if (o < 0 || o + 8 > L) throw new Error('ran off the end'); return dv.getFloat64(o, true); }
  function i32(o){ if (o < 0 || o + 4 > L) throw new Error('ran off the end'); return dv.getInt32(o, true); }
  function num(o, what){ var v = f64(o); if (!isFinite(v) || Math.abs(v) > 1e6) throw new Error(what + ' isn’t a number'); return v; }
  function cls(p, what){ var q = crvClassRef(vd, p); if (q < 0) throw new Error('no ' + what + ' where one should be'); return q; }
  var sp = crvTextFind(vd, mark, stop, crvTextName('_txtblkSpacingValue'));
  if (sp < 0) throw new Error('its settings end unexpectedly');
  var S = sp + 4 + 38, blk = {set: {}, lines: [], curve: null, said: ''};
  // the settings: a name, a kind (0 a number, 1 a whole number, 2 yes or no, 3 words), a value
  for (var p = mark; p < S;){
    var s = crvTextStr(vd, p);
    if (!s){ p++; continue; }
    if (s.t.slice(0, 4) !== '_txt'){ p = s.end; continue; }
    var kind = i32(s.end), e = s.end + 4, v;
    if (kind === 0){ v = f64(e); e += 8; }
    else if (kind === 1){ v = i32(e); e += 4; }
    else if (kind === 2){ v = !!vd[e]; e += 1; }
    else if (kind === 3){ var w = crvTextStr(vd, e); if (!w) throw new Error('a setting’s words are missing'); v = w.t; e = w.end; }
    else throw new Error('a setting of a kind not seen before');
    blk.set[s.t.replace(/^_txt(AL_|blk)/, '')] = v;
    p = e;
  }
  blk.said = String(blk.set.Text || '').replace(/\s+/g, ' ').trim();
  // after the last setting: its place on the page, the layer, the box, the matrix, the sheet
  var TAG = [86, 101, 99, 116, 114, 105, 99, 95, 95, 86, 101, 114, 115, 105, 111, 110];    // Vectric__Version
  function tagged(q){                                          // int 16, the tag, int, int length, an ID; returns [the ID, where it ends]
    if (i32(q) !== 16 || crvTextFind(vd, q + 4, q + 20, TAG) !== q + 4) throw new Error('its layer or sheet isn’t where it should be');
    var n = i32(q + 24), id = '';
    if (n < 1 || n > 64) throw new Error('an ID of an odd length');
    for (var k = 0; k < n; k++) id += String.fromCharCode(vd[q + 28 + k]);
    return [id, q + 28 + n];
  }
  p = S + 12 + 4 + 16;                                         // the setting's value, a whole number, the centre on the page
  var t1 = tagged(p);
  p = t1[1] + 4;
  blk.box = [num(p, 'its box'), num(p + 8, 'its box'), num(p + 16, 'its box'), num(p + 24, 'its box')];
  blk.m = [];
  for (var mi = 0; mi < 6; mi++) blk.m.push(num(p + 32 + 8 * mi, 'its placement'));
  var t2 = tagged(p + 32 + 72);
  blk.sheet = t2[0];
  p = t2[1];
  var nLines = i32(p + 4);
  if (nLines < 1 || nLines > 2000) throw new Error('an odd number of lines');
  p += 8;
  for (var li = 0; li < nLines; li++){
    p = cls(p, 'line');
    var nWords = i32(p + 4), line = {chars: []};
    if (nWords < 0 || nWords > 5000) throw new Error('an odd number of words');
    p += 8;
    for (var wi = 0; wi < nWords; wi++){
      p = cls(p, 'word');
      var nCh = i32(p + 4);
      if (nCh < 0 || nCh > 5000) throw new Error('an odd number of letters');
      p += 8;
      for (var ci = 0; ci < nCh; ci++){
        p = cls(p, 'letter');
        var font = crvTextStr(vd, p + 8);
        if (!font) throw new Error('a letter’s font is missing');
        var ch = {code: i32(p + 4), adv: num(font.end, 'a letter’s advance'), outs: []};
        var q = cls(font.end + 8, 'outline list'), nOut = i32(q + 4);
        if (nOut < 0 || nOut > 500) throw new Error('an odd number of outlines');
        q += 8;
        for (var oi = 0; oi < nOut; oi++){
          var at = -1;
          for (var k2 = q; k2 < q + 120; k2++) if (outs[k2]){ at = k2; break; }     // past its small header
          if (at < 0) throw new Error('a letter’s outline isn’t where it should be');
          ch.outs.push(at); q = outs[at].end;
        }
        var t0 = q + (nOut ? 39 : 17);                         // a space has no outlines, and none of the 22 bytes that end them
        ch.c = num(t0, 'a letter’s centre'); ch.kern = num(t0 + 8, 'a letter’s kerning');
        line.chars.push(ch);
        p = t0 + 64;
      }
    }
    line.drop = num(p, 'a line’s spacing');               // how far below the line before
    var lf = crvTextStr(vd, p + 8);
    if (!lf) throw new Error('a line doesn’t end as expected');
    p = lf.end + 40;
    blk.lines.push(line);
  }
  if (blk.set.IsOnCurve){
    // the curve: 20 bytes, a class and a number, a class and two numbers, a double, 10 bytes; then how many spans, and the spans
    var c = cls(p + 20, 'curve') + 4;
    c = cls(c, 'curve') + 8 + 8 + 10;
    var n = i32(c), spans = [];
    if (n < 1 || n > 10000) throw new Error('its curve has an odd number of spans');
    c += 4;
    for (var si = 0; si < n; si++){
      var ty = vd[c];
      if (!((ty === 0 || ty === 1 || ty === 2) && vd[c + 1] === 2 && vd[c + 2] === 0 && vd[c + 3] === 0 && vd[c + 4] === 0)) throw new Error('its curve isn’t as expected');
      var span = {t: ty, x0: num(c + 9, 'its curve'), y0: num(c + 17, 'its curve'), x1: num(c + 33, 'its curve'), y1: num(c + 41, 'its curve')};
      if (ty === 1){ span.b = num(c + 61, 'its curve'); c += 69; }
      else if (ty === 2){ span.c1 = [num(c + 61, 'its curve'), num(c + 69, 'its curve')]; span.c2 = [num(c + 77, 'its curve'), num(c + 85, 'its curve')]; c += 93; }
      else c += 61;
      spans.push(span);
    }
    blk.curve = spans;
    blk.curveAt = c - 0;                                        // (where it ends)
  }
  return blk;
}

// A curve as pieces to walk along: straight pieces and arcs (a smooth curve as many short straight pieces).
// Returns {len, at(dist)}: at gives {x, y, ang}, the place and direction at a distance along it; past either end
// it carries straight on.
function crvCurvePath(spans){
  var pcs = [], len = 0;
  function line(ax, ay, bx, by){ var l = Math.hypot(bx - ax, by - ay); if (l > 1e-12){ pcs.push({s: len, l: l, ax: ax, ay: ay, ang: Math.atan2(by - ay, bx - ax)}); len += l; } }
  spans.forEach(function (sp){
    if (sp.t === 1 && Math.abs(sp.b) > 1e-12){
      var ch = Math.hypot(sp.x1 - sp.x0, sp.y1 - sp.y0);
      if (ch < 1e-12) return;
      var th = 4 * Math.atan(sp.b), R = Math.abs(ch / (2 * Math.sin(th / 2)));
      var ux = (sp.x1 - sp.x0) / ch, uy = (sp.y1 - sp.y0) / ch, d = ch / 2 / Math.tan(th / 2);
      var cx = (sp.x0 + sp.x1) / 2 - uy * d, cy = (sp.y0 + sp.y1) / 2 + ux * d, l = Math.abs(R * th);
      pcs.push({s: len, l: l, arc: true, cx: cx, cy: cy, R: R, a0: Math.atan2(sp.y0 - cy, sp.x0 - cx), th: th}); len += l;
    } else if (sp.t === 2){
      var px = sp.x0, py = sp.y0;
      for (var k = 1; k <= 64; k++){
        var t = k / 64, u = 1 - t;
        var x = u * u * u * sp.x0 + 3 * u * u * t * sp.c1[0] + 3 * u * t * t * sp.c2[0] + t * t * t * sp.x1;
        var y = u * u * u * sp.y0 + 3 * u * u * t * sp.c1[1] + 3 * u * t * t * sp.c2[1] + t * t * t * sp.y1;
        line(px, py, x, y); px = x; py = y;
      }
    } else line(sp.x0, sp.y0, sp.x1, sp.y1);
  });
  return {len: len, at: function (dist){
    if (!pcs.length) return {x: 0, y: 0, ang: 0};
    var pc = pcs[0];
    if (dist > 0) for (var i = 0; i < pcs.length; i++){ pc = pcs[i]; if (dist <= pc.s + pc.l) break; }
    var d = dist - pc.s;
    if (pc.arc && d >= 0 && d <= pc.l){
      var a = pc.a0 + d / pc.l * pc.th;
      return {x: pc.cx + pc.R * Math.cos(a), y: pc.cy + pc.R * Math.sin(a), ang: a + (pc.th > 0 ? Math.PI / 2 : -Math.PI / 2)};
    }
    if (pc.arc){                                               // past an end of an arc: straight on from that end
      var end = d > pc.l, ae = pc.a0 + (end ? pc.th : 0), ang = ae + (pc.th > 0 ? Math.PI / 2 : -Math.PI / 2), over = end ? d - pc.l : d;
      return {x: pc.cx + pc.R * Math.cos(ae) + over * Math.cos(ang), y: pc.cy + pc.R * Math.sin(ae) + over * Math.sin(ang), ang: ang};
    }
    return {x: pc.ax + d * Math.cos(pc.ang), y: pc.ay + d * Math.sin(pc.ang), ang: pc.ang};
  }};
}

// Why a block can't be placed (words for the person), or '' if it can: only what's been checked against VCarve.
function crvTextCant(blk){
  var s = blk.set;
  if (!s.IsOnCurve) return s.text_justify === 0 || s.text_justify === 2 ? '' : 'it’s set to the right';
  if (!blk.curve || !blk.curve.length) return 'its curve couldn’t be read';
  if (blk.lines.length !== 1) return 'it’s more than one line on a curve';
  if (s.Justification === 1) return 'it’s set to the right on its curve';
  if (s.CurveAlign !== 0 || (s.Justification !== 0 && s.Justification !== 2) || s.Orientation !== 1 ||
      Math.abs((s.FillPercent || 0) - 100) > 1e-9 || Math.abs(s.OffsetDistance || 0) > 1e-9 || Math.abs((s.SpacingValue || 0) - 1) > 1e-9)
    return 'it’s on a curve with settings 454 hasn’t seen';
  return '';
}

// Where each letter outline of a block goes. boxes: each outline's own box, by where it starts ({x0, y0, x1, y1}).
// Returns [{at, T}]: T = [a, b, c, d, e, f], taking a point (x, y) of the outline to (a x + c y + e, b x + d y + f)
// on the page.
function crvTextPlace(blk, boxes){
  var m = blk.m, out = [];
  // a letter's place in the block's own space (turned by ang about its origin, then moved), then the block's matrix
  function put(at, ang, tx, ty){
    var cs = Math.cos(ang), sn = Math.sin(ang);
    out.push({at: at, T: [m[0] * cs + m[1] * sn, m[3] * cs + m[4] * sn, -m[0] * sn + m[1] * cs, -m[3] * sn + m[4] * cs,
                          m[0] * tx + m[1] * ty + m[2], m[3] * tx + m[4] * ty + m[5]]});
  }
  // each line: its letters along the pen, and how far they reach
  var y = 0, lines = blk.lines.map(function (line, li){
    if (li) y -= line.drop;
    var pen = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, items = [];
    line.chars.forEach(function (ch){
      ch.outs.forEach(function (at){
        var b = boxes[at];
        x0 = Math.min(x0, pen + ch.c + b.x0); x1 = Math.max(x1, pen + ch.c + b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
      });
      if (ch.outs.length) items.push({outs: ch.outs, centre: pen + ch.c});
      pen += ch.adv + ch.kern;
    });
    return {items: items, x0: x0, x1: x1, y0: y0 + y, y1: y1 + y, y: y};
  }).filter(function (l){ return l.items.length; });
  if (!lines.length) return out;
  if (blk.set.IsOnCurve){
    // centred: the middle of the letters on the middle of the curve; set left: the letters start where the curve does
    var path = crvCurvePath(blk.curve), l0 = lines[0], from = blk.set.Justification === 0 ? -l0.x0 : path.len / 2 - (l0.x0 + l0.x1) / 2;
    l0.items.forEach(function (it){
      var q = path.at(from + it.centre);
      it.outs.forEach(function (at){ put(at, q.ang, q.x, q.y); });
    });
    return out;
  }
  var centred = blk.set.text_justify === 2;
  lines.forEach(function (l){ l.shift = centred ? -(l.x0 + l.x1) / 2 : -l.x0; });
  var X0 = Math.min.apply(null, lines.map(function (l){ return l.x0 + l.shift; })), X1 = Math.max.apply(null, lines.map(function (l){ return l.x1 + l.shift; }));
  var Y1 = Math.max.apply(null, lines.map(function (l){ return l.y1; }));
  // the layout's box on the recorded one: centres together for centred text, left edges for text set left; tops together
  var ox = centred ? (blk.box[0] + blk.box[2]) / 2 - (X0 + X1) / 2 : blk.box[0] - X0, oy = blk.box[3] - Y1;
  lines.forEach(function (l){
    l.items.forEach(function (it){ it.outs.forEach(function (at){ put(at, 0, it.centre + l.shift + ox, l.y + oy); }); });
  });
  return out;
}

// An outline's spans ([x, y, bulge], closed) moved by T. A bulge is an arc: it stays one if T only turns, moves,
// mirrors and scales evenly; if T stretches, the arc is turned into short straight spans first.
function crvSpansMove(spans, T){
  var even = (Math.abs(T[0] - T[3]) < 1e-9 && Math.abs(T[1] + T[2]) < 1e-9) || (Math.abs(T[0] + T[3]) < 1e-9 && Math.abs(T[1] - T[2]) < 1e-9);
  var flip = T[0] * T[3] - T[1] * T[2] < 0, src = spans;
  if (!even && spans.some(function (s){ return Math.abs(s[2]) > 1e-12; })){
    src = [];
    spans.forEach(function (s, i){
      var nx = spans[(i + 1) % spans.length];
      if (Math.abs(s[2]) < 1e-12){ src.push([s[0], s[1], 0]); return; }
      var path = crvCurvePath([{t: 1, x0: s[0], y0: s[1], x1: nx[0], y1: nx[1], b: s[2]}]), steps = Math.max(4, Math.ceil(Math.abs(4 * Math.atan(s[2])) / 0.05));
      for (var k = 0; k < steps; k++){ var q = path.at(path.len * k / steps); src.push([q.x, q.y, 0]); }
    });
  }
  return src.map(function (s){ return [T[0] * s[0] + T[2] * s[1] + T[4], T[1] * s[0] + T[3] * s[1] + T[5], flip ? -s[2] : s[2]]; });
}
// An outline's own box, arcs included.
function crvSpansBox(spans){
  var b = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
  function add(x, y){ if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  spans.forEach(function (s, i){
    add(s[0], s[1]);
    if (Math.abs(s[2]) > 1e-12){
      var nx = spans[(i + 1) % spans.length], path = crvCurvePath([{t: 1, x0: s[0], y0: s[1], x1: nx[0], y1: nx[1], b: s[2]}]);
      for (var k = 1; k < 16; k++){ var q = path.at(path.len * k / 16); add(q.x, q.y); }
    }
  });
  return b;
}

// Every block of text in the drawing: put its letters where VCarve does. ats, ends: where each of `contours`
// starts and ends in the data. Changes contours in place; returns {placed (blocks), left ([{said, why}]),
// drop (the outlines to leave out, by index), sheets (a sheet ID for outlines that are letters, by index)}.
function crvTextApply(vd, dv, contours, ats, ends){
  var res = {placed: 0, left: [], drop: {}, sheets: {}}, marks = [], name = crvTextName('_txtAL_Version');
  for (var p = crvTextFind(vd, 0, vd.length, name); p >= 0; p = crvTextFind(vd, p + 1, vd.length, name)) marks.push(p);
  if (!marks.length) return res;
  var outs = {}, index = {};
  ats.forEach(function (at, i){ outs[at] = {end: ends[i]}; index[at] = i; });
  marks.forEach(function (mark, bi){
    var stop = marks[bi + 1] || vd.length, blk;
    try { blk = crvTextRead(vd, dv, mark, stop, outs); }
    catch (e){ res.left.push({said: '', why: 'it couldn’t be read (' + e.message + ')', unread: true}); return; }
    var mine = [];
    blk.lines.forEach(function (l){ l.chars.forEach(function (ch){ ch.outs.forEach(function (at){ mine.push(at); }); }); });
    var why = crvTextCant(blk);
    if (why){
      mine.forEach(function (at){ res.drop[index[at]] = true; });
      res.left.push({said: blk.said, why: why});
      return;
    }
    var boxes = {};
    mine.forEach(function (at){ boxes[at] = crvSpansBox(contours[index[at]]); });
    crvTextPlace(blk, boxes).forEach(function (pl){
      var i = index[pl.at];
      contours[i] = crvSpansMove(contours[i], pl.T);
      if (blk.sheet) res.sheets[i] = blk.sheet;
    });
    res.placed++;
  });
  return res;
}
