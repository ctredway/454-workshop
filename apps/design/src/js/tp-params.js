// Parameters in a toolpath: its depth, tab length and tab thickness can be a parameter or arithmetic with one
// (material / 2, tab_thk), which the toolpath remembers (tp.exprs) and works out again when parameters or the
// material change (tpParamsApply). Because a depth decides how deep the bit goes:
//   - a depth that uses a parameter needs the material's thickness set, so it can always be checked against it
//     (tpPastMaterial), and every change that moves it names any toolpath it puts past the material;
//   - a toolpath whose parameters can't be worked out (one deleted, the thickness cleared) says so on its card,
//     and Save G-code and Preview in 454 Control refuse it until it's put right.
//   tp.exprs = {depth: {e: 'material / 2', u: 'mm'}, tabThk: {e: 'tab_thk', u: 'mm'}}
var TP_EXPR_FIELDS = [
  {key: 'depth',  id: 'cutDepth',  label: 'Depth',         depth: true},
  {key: 'tabLen', id: 'cutTabLen', label: 'Tab length'},
  {key: 'tabThk', id: 'cutTabThk', label: 'Tab thickness'}
];
// Why an expression can't be this field's value now ('' if it can): {v, why}
function tpExprEval(f, e, u){
  if (f.depth && paramUsesNames(e) && !(DOC.stock && DOC.stock.t > 0))
    return {why: 'a depth from a parameter needs the material’s thickness, so it can be checked against it: set it in Settings'};
  var r = paramTry(e, u);
  if (r.why) return {why: r.why.charAt(0).toLowerCase() + r.why.slice(1).replace(/\.$/, '')};
  if (!(r.v > 0)) return {why: e + ' comes to ' + fmtDisp(r.v) + ' ' + unitTag() + ', and it has to be more than 0'};
  return {v: r.v};
}
// Read one of the fields in the editor: a measurement (unlinked), arithmetic without names (worked out once), or
// an expression with parameters (remembered). A mistake is kept in CUT.exprWhy, and Create refuses until it's put right.
function cutReadExprField(f){
  var el = document.getElementById(f.id), raw = el.value.trim();
  CUT.exprs = CUT.exprs || {}; CUT.exprWhy = CUT.exprWhy || {};
  delete CUT.exprWhy[f.key];
  if (!raw) return;
  var plain = lenInPlain(raw);
  if (!isNaN(plain)){ if (plain > 0){ CUT[f.key] = plain; delete CUT.exprs[f.key]; } return; }
  var unit = stockUnits(), r = tpExprEval(f, raw, unit);
  if (r.why){ CUT.exprWhy[f.key] = f.label + ': ' + r.why; return; }
  CUT[f.key] = r.v;
  if (paramUsesNames(raw)) CUT.exprs[f.key] = {e: raw, u: unit};      // linked
  else delete CUT.exprs[f.key];                                    // just arithmetic: worked out, not linked
}
// What the editor's fields show: a linked one its expression, else its number
function cutExprFieldText(key, fallback){ var x = CUT.exprs && CUT.exprs[key]; return x ? x.e : fallback; }
// The first thing wrong in the editor's parameter fields, or ''
function cutExprProblem(){
  var w = CUT && CUT.exprWhy ? CUT.exprWhy : {};
  for (var k in w) if (w[k]) return w[k];
  return '';
}
// The expressions a toolpath really uses (a through cut's depth is the material's; tabs only when on)
function tpExprsUsed(tp){
  var x = tp.exprs || {}, out = {};
  if (x.depth && !tp.through && tp.side !== 'vcarve' && tp.side !== 'chamfer') out.depth = x.depth;
  if (tp.tabsOn && x.tabLen) out.tabLen = x.tabLen;
  if (tp.tabsOn && x.tabThk) out.tabThk = x.tabThk;
  return out;
}
// Why a toolpath's parameters can't be worked out now, or ''
function tpExprProblem(tp){
  var used = tpExprsUsed(tp);
  for (var i = 0; i < TP_EXPR_FIELDS.length; i++){
    var f = TP_EXPR_FIELDS[i], x = used[f.key];
    if (!x) continue;
    var r = tpExprEval(f, x.e, x.u);
    if (r.why) return f.label + ' (' + x.e + '): ' + r.why;
  }
  return '';
}
// After parameters or the material change: every toolpath using them takes the new values and is recalculated.
// Returns the toolpaths that can't be worked out, each with why.
function tpParamsApply(){
  var failed = [];
  tpList().forEach(function (tp) {
    var used = tpExprsUsed(tp), changed = false;
    if (!Object.keys(used).length) return;
    var why = tpExprProblem(tp);
    if (why){ failed.push({tp: tp, why: why}); return; }
    TP_EXPR_FIELDS.forEach(function (f) {
      var x = used[f.key]; if (!x) return;
      var v = tpExprEval(f, x.e, x.u).v;
      if (Math.abs((tp[f.key] || 0) - v) > 1e-9){ tp[f.key] = v; changed = true; }
    });
    if (changed) tpGenerate(tp);
  });
  if (failed.length) toast('err', failed.length === 1 ? failed[0].tp.name + ': its parameters can’t be worked out' : failed.length + ' toolpaths: their parameters can’t be worked out',
                           failed.slice(0, 3).map(function (f) { return f.tp.name + ': ' + f.why + '.'; }).join(' ') + ' It can’t be saved as G-code until that’s put right.');
  return failed;
}
// " = material / 2" after a value on a card, when it comes from a parameter
function tpExprSay(tp, key){ var x = tpExprsUsed(tp)[key]; return x ? ' = ' + x.e : ''; }
