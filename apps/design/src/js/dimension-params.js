// Dimensions driven by parameters: type a name or some arithmetic into a dimension (dado, shelf_gap * 2,
// material + 0.2) and it remembers it (d.expr, worked out in d.exprUnit). Change a parameter, or the material's
// thickness, and every dimension using it is applied again (paramsApplyDims). Typing a plain number unlinks it.

// A dimension's expression worked out now: {v} in mm, {why} if it can't be, or null if it has none
function dimExprValue(d){ return d && d.expr ? paramTry(d.expr, d.exprUnit || 'mm') : null; }

// Apply every dimension that has an expression, until they all hold. Applying one can move what another one
// measures (a shape's width, then its distance from the next), so it goes round until nothing changes, a few
// times at most. Returns what couldn't be held, each with why, in plain words.
function paramsApplyDims(){
  var dims = (DOC.dims || []).filter(function (d) { return d.expr; }), failed = [], why = {};
  if (!dims.length) return failed;
  for (var pass = 0; pass < 8; pass++){
    var changed = false;
    dims.forEach(function (d, i) {
      var r = dimExprValue(d), cur = dimValue(d);
      if (r.why || cur === null || !(r.v > 0) || Math.abs(cur - r.v) < 1e-6) return;
      relApply.why = dimApply.why = null;
      if (dimApply(d, r.v)) changed = true;
      else why[i] = relApply.why || dimApply.why || '';
    });
    if (!changed) break;
  }
  dims.forEach(function (d, i) {
    var r = dimExprValue(d), cur = dimValue(d);
    if (r.why) failed.push({d: d, why: r.why});
    else if (cur === null) failed.push({d: d, why: 'the shapes it measures are gone'});
    else if (!(r.v > 0)) failed.push({d: d, why: d.expr + ' comes to ' + fmtDisp(r.v) + ' ' + unitTag() + ', and a size has to be more than 0'});
    else if (Math.abs(cur - r.v) > 1e-3) failed.push({d: d, why: why[i] || ('it can’t be ' + fmtDisp(r.v) + ' ' + unitTag() + ' while the other dimensions hold')});
  });
  relApply.why = dimApply.why = null;
  return failed;
}
// Whether a dimension shows what its expression says (false: something moved it, or it can't be worked out)
function dimExprHolds(d){
  var r = dimExprValue(d), cur = dimValue(d);
  return !r || (!r.why && cur !== null && Math.abs(cur - r.v) <= 1e-3);
}
// Say what didn't hold, after parameters were applied
function paramsSayFailed(failed){
  if (!failed.length) return;
  toast('warn', failed.length === 1 ? 'A dimension couldn’t follow its parameters' : failed.length + ' dimensions couldn’t follow their parameters',
        failed.slice(0, 4).map(function (f) { return (f.d.expr || '') + ': ' + f.why + '.'; }).join(' ') +
        ' They’re marked ⚠ on the drawing.');
}
// What was typed into a dimension: a plain measurement (a number, a fraction, with a unit), the same with e for
// "to the edge", or an expression that uses parameters or arithmetic. Returns {v}, {v, edge}, {v, expr, unit} or {why}.
function dimReadTyped(raw){
  var t = String(raw).trim();
  var plain = lenIn(t);
  if (!isNaN(plain)) return {v: plain};
  if (/^[eE]/.test(t) || /[eE]$/.test(t)){                     // "25e" or "e 25": to the edge, as before
    var ve = lenIn(t.replace(/^[eE]\s*|\s*[eE]$/g, '').trim());
    if (!isNaN(ve)) return {v: ve, edge: true};
  }
  var unit = stockUnits(), r = paramTry(t, unit);
  if (r.why) return {why: r.why};
  return {v: r.v, expr: t, unit: unit};
}
