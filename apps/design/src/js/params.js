// Parameters: named values saved with the drawing (DOC.params), used in place of numbers. A parameter is a
// name and an expression: a number (thickness = 18.3), or arithmetic on numbers and other parameters
// (dado = thickness + 0.2, gap = (height - 3 * thickness) / 2). Dimensions can be set to an expression, and
// remember it: change a parameter and every dimension using it changes too (dimension-params.js).
//
// Units: each expression is worked out in the units it was typed in (unit: 'mm' or 'in'), so a bare number means
// that unit, and parameters are converted into it first. That keeps sums and scaling right in either unit:
// "(height - 3 * thickness) / 2" typed in inches gives inches. A number can say its unit: 18mm, 3/4in, 3/4".
//   DOC.params = [{name: 'thickness', expr: '18.3', unit: 'mm', note: 'birch ply, measured'}]
// The material's thickness (Settings) is always there as "material", in mm, and can't be changed here.
function paramsArr(){ if (!DOC.params) DOC.params = []; return DOC.params; }
var PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
var PARAM_BUILTIN = 'material';

// Split an expression into numbers (with any unit), names, operators and brackets; null if it has anything else
function paramTokens(src){
  var s = String(src), i = 0, out = [], m;
  while (i < s.length){
    var c = s.charAt(i);
    if (/\s/.test(c)){ i++; continue; }
    // a number, or a fraction with a unit after it (3/4in is three quarters of an inch, not 3 / 4in)
    if ((m = /^(\d+\.?\d*|\.\d+)(?:\s*\/\s*(\d+\.?\d*)(?=\s*(?:mm|cm|in|"|″)))?(?:\s*(mm|cm|in)(?![A-Za-z0-9_])|\s*("|″))?/i.exec(s.slice(i)))){
      var u = m[4] ? 'in' : m[3] ? m[3].toLowerCase() : null;
      if (m[2] !== undefined && !(parseFloat(m[2]) > 0)) return null;
      out.push({t: 'num', v: m[2] !== undefined ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(m[1]), u: u === 'mm' ? 'mm' : u === 'cm' ? 'cm' : u ? 'in' : null});
      i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))){ out.push({t: 'name', v: m[0]}); i += m[0].length; continue; }
    if ('+-*/()'.indexOf(c) >= 0){ out.push({t: c}); i++; continue; }
    return null;
  }
  return out;
}
// Work out an expression, in its own unit: look(name) gives a parameter's value in mm (or throws why not).
// Returns mm, or throws an Error saying what's wrong, in plain words.
function paramEval(src, unit, look){
  var toks = paramTokens(src);
  if (!toks) throw new Error('Only numbers, names, + - * / and brackets can be used.');
  if (!toks.length) throw new Error('It’s empty.');
  var k = 0, per = unit === 'in' ? 25.4 : 1;                   // mm in one of the expression's units
  function peek(){ return toks[k]; }
  function expr(){                                            // sums
    var v = term();
    while (peek() && (peek().t === '+' || peek().t === '-')){ var op = toks[k++].t, r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term(){                                            // products
    var v = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')){
      var op = toks[k++].t, r = unary();
      if (op === '/' && Math.abs(r) < 1e-12) throw new Error('It divides by zero.');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function unary(){
    if (peek() && peek().t === '-'){ k++; return -unary(); }
    if (peek() && peek().t === '+'){ k++; return unary(); }
    return atom();
  }
  function atom(){
    var t = toks[k++];
    if (!t) throw new Error('It ends too soon.');
    if (t.t === 'num') return t.u ? t.v * (t.u === 'in' ? 25.4 : t.u === 'cm' ? 10 : 1) / per : t.v;
    if (t.t === 'name') return look(t.v) / per;
    if (t.t === '('){ var v = expr(); if (!peek() || peek().t !== ')') throw new Error('A bracket isn’t closed.'); k++; return v; }
    throw new Error('Something’s missing before “' + t.t + '”.');
  }
  var v = expr();
  if (k < toks.length) throw new Error('Something’s missing before “' + (toks[k].v !== undefined ? toks[k].v : toks[k].t) + '”.');
  if (!isFinite(v)) throw new Error('It doesn’t come to a number.');
  return v * per;
}
// The parameter called name (any case), or null
function paramByName(name){
  var n = String(name).toLowerCase();
  return paramsArr().filter(function (p) { return p.name.toLowerCase() === n; })[0] || null;
}
// A parameter's value in mm, or throws why it can't be worked out (unknown name, a loop, a bad expression)
function paramValue(name, seen){
  if (String(name).toLowerCase() === PARAM_BUILTIN){
    if (!(DOC.stock && DOC.stock.t > 0)) throw new Error('“material” is the material’s thickness, which isn’t set (Settings).');
    return DOC.stock.t;
  }
  var p = paramByName(name);
  if (!p) throw new Error('There’s no parameter called “' + name + '”.');
  seen = seen || [];
  if (seen.indexOf(p.name.toLowerCase()) >= 0) throw new Error('“' + p.name + '” depends on itself (' + seen.concat(p.name.toLowerCase()).join(' → ') + ').');
  var chain = seen.concat(p.name.toLowerCase());
  try { return paramEval(p.expr, p.unit, function (n) { return paramValue(n, chain); }); }
  catch (e) { if (seen.length) throw e; throw new Error(p.name + ': ' + e.message); }
}
// An expression's value in mm, with the drawing's parameters: {v} or {why}
function paramTry(src, unit){
  try { return {v: paramEval(src, unit, function (n) { return paramValue(n, []); })}; }
  catch (e) { return {why: e.message}; }
}
// Does this text use a parameter (a name), rather than just being a number?
function paramUsesNames(src){ var t = paramTokens(src); return !!(t && t.some(function (x) { return x.t === 'name'; })); }
// The names an expression uses, in lower case
function paramNamesIn(src){ var t = paramTokens(src) || [], out = [];
  t.forEach(function (x) { if (x.t === 'name' && out.indexOf(x.v.toLowerCase()) < 0) out.push(x.v.toLowerCase()); }); return out; }
// Give a parameter a new name, and change it in every expression that uses it (other parameters, dimensions)
function paramRename(p, to){
  var from = p.name.toLowerCase();
  var swap = function (src) {
    // (a unit after a number, as in 18mm, is never mistaken for it: a parameter can't be called mm, cm or in)
    return String(src).replace(/[A-Za-z_][A-Za-z0-9_]*/g, function (w) { return w.toLowerCase() === from ? to : w; });
  };
  paramsArr().forEach(function (q) { if (q !== p) q.expr = swap(q.expr); });
  (DOC.dims || []).forEach(function (d) { if (d.expr) d.expr = swap(d.expr); });
  tpList().forEach(function (tp) { Object.keys(tp.exprs || {}).forEach(function (k) { tp.exprs[k].e = swap(tp.exprs[k].e); }); });
  p.name = to;
}
// Why a name can't be used for a parameter (or '' if it can): other than the given one
function paramNameProblem(name, except){
  if (!PARAM_NAME.test(name)) return 'A name is letters, digits and _, starting with a letter (like shelf_gap).';
  if (name.toLowerCase() === PARAM_BUILTIN) return '“material” is the material’s thickness, from Settings.';
  if (/^(mm|cm|in)$/i.test(name)) return '“' + name + '” is a unit.';
  var p = paramByName(name);
  if (p && p !== except) return 'There’s already a parameter called “' + p.name + '”.';
  return '';
}
// Where a parameter is used: other parameters' names, and how many dimensions
function paramUsers(p){
  var n = p.name.toLowerCase();
  return {params: paramsArr().filter(function (q) { return q !== p && paramNamesIn(q.expr).indexOf(n) >= 0; }).map(function (q) { return q.name; }),
          dims: (DOC.dims || []).filter(function (d) { return d.expr && paramNamesIn(d.expr).indexOf(n) >= 0; }).length,
          tps: tpList().filter(function (tp) { return Object.keys(tp.exprs || {}).some(function (k) { return paramNamesIn(tp.exprs[k].e).indexOf(n) >= 0; }); }).map(function (tp) { return tp.name; })};
}
// "2 dimensions, dado and the toolpath Pocket"
function paramUsersSay(u){
  return [u.dims ? u.dims + (u.dims === 1 ? ' dimension' : ' dimensions') : '', u.params.join(', '),
          (u.tps || []).length ? ((u.tps.length === 1 ? 'the toolpath ' : 'the toolpaths ') + u.tps.join(', ')) : ''].filter(Boolean).join(' and ');
}
