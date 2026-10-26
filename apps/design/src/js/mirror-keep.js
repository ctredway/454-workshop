/* ---------------- mirrored copies that stay mirrored ----------------
   Clint, 2026-10-25: "I draw a set of circles and I use the dimension tool to set them a certain distance from a line, if
   I mirror those circles, if I move the originals or change the dimension value, the mirrored vectors should move as
   well". With "Keep the copies mirrored" ticked in the Mirror panel (it is, unless unticked), each copy is linked to its
   original and the mirror line: DOC.keeps gets {id, op: 'mirror', a: the copy, b: the original, line}, and after every
   change (persist), and after each step the History bar does again, the copy is made again as the original mirrored
   about the line, where they are now. A copy changed by itself lets go (it's yours now); one whose original or line is
   gone stays as it is. The link is drawn, and stopped, like Keep lined up's (keep-lined-up.js). */
var MIRROR_SKIP = {_id: 1, layer: 1, sheet: 1, _tess: 1, _tess2: 1};

// A shape's geometry, without what isn't its shape (its id, layer, sheet, and the outline worked out for drawing)
function mirrorGeom(e){
  var c = {};
  for (var k in e) if (!MIRROR_SKIP[k]) c[k] = e[k];
  return JSON.parse(JSON.stringify(c));
}
function mirrorSig(e){
  var s = JSON.stringify(mirrorGeom(e)), h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}
// The same shape, near enough: every number within a millionth of a millimetre
function mirrorSame(x, y){
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1e-6;
  if (Array.isArray(x)) return Array.isArray(y) && x.length === y.length && x.every(function (v, i) { return mirrorSame(v, y[i]); });
  if (x && typeof x === 'object'){
    if (!y || typeof y !== 'object') return false;
    var kx = Object.keys(x).sort(), ky = Object.keys(y).sort();
    return kx.join() === ky.join() && kx.every(function (k) { return mirrorSame(x[k], y[k]); });
  }
  return x === y;
}
// The original mirrored about the line as they are now, or null if the line has no length
function mirrorOf(src, ln){
  var vx = ln.x2 - ln.x1, vy = ln.y2 - ln.y1, L = Math.hypot(vx, vy);
  if (L < 1e-9) return null;
  var c = cloneEnt(src);
  mirrorEnt(c, ln.x1, ln.y1, vx / L, vy / L);
  return c;
}
// Every kept copy made again from its original. Returns {changed, gone, letGo}.
function mirrorsFollow(){
  var out = {changed: 0, gone: 0, letGo: 0};
  if (!DOC.keeps || !DOC.keeps.length) return out;
  DOC.keeps = DOC.keeps.filter(function (k) {
    if (k.op !== 'mirror') return true;
    var C = entById(k.a), S = entById(k.b), Ln = entById(k.line);
    if (!C || !S || !Ln || Ln.t !== 'line'){ out.gone++; return false; }
    var want = mirrorOf(S, Ln);
    if (!want){ out.gone++; return false; }
    var w = mirrorGeom(want);
    if (mirrorSame(mirrorGeom(C), w)){
      var now = mirrorSig(C);
      if (k.sig !== now){ k.sig = now; out.changed++; }               // (moved with its original and the line)
      return true;
    }
    if (k.sig && mirrorSig(C) !== k.sig){ out.letGo++; return false; }   // the copy was changed by itself
    var keep = {_id: C._id, layer: C.layer, sheet: C.sheet};
    Object.keys(C).forEach(function (key) { delete C[key]; });
    Object.assign(C, w);
    Object.keys(keep).forEach(function (key) { if (keep[key] !== undefined) C[key] = keep[key]; });
    k.sig = mirrorSig(C); out.changed++;
    return true;
  });
  return out;
}
// The Mirror panel's "Keep the copies mirrored" (on unless unticked)
function mirrorKeepOn(){ return UICFG.mirrorKeep !== false; }
// Link each copy just made to its original (ids) and the line: Mirror, and its step done again
function mirrorLink(copies, originals, lineId){
  copies.forEach(function (c, i) {
    var a = entId(c);                                         // named after its copy: done again, the same link
    keepsArr().push({id: 'm' + a, op: 'mirror', a: a, b: originals[i], line: lineId, sig: mirrorSig(c)});
  });
}
// After every change (persist): the copies made again, and what let go said
function mirrorsRun(){
  var r = mirrorsFollow();
  if (r.letGo) toast('info', r.letGo === 1 ? 'A copy is no longer kept mirrored' : r.letGo + ' copies are no longer kept mirrored',
                     'You changed ' + (r.letGo === 1 ? 'a mirrored copy' : 'mirrored copies') + ' by itself, so ' + (r.letGo === 1 ? 'it no longer follows its original' : 'they no longer follow their originals') +
                     '. Undo puts the link back.');
  if (r.gone) toast('info', r.gone === 1 ? 'A copy is no longer kept mirrored' : r.gone + ' copies are no longer kept mirrored',
                    'The original or the mirror line is no longer in the drawing. The copies stay as they are; Undo brings the link back.');
}
