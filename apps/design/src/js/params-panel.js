// The Parameters list (the fx button beside Dimension): add, change, rename and delete the drawing's parameters
// (params.js). A change is checked first (a mistake, or a parameter that would depend on itself, is said and
// nothing changes), then every dimension using it follows (dimension-params.js), as one Undo.
function paramPanelOpen(){
  document.getElementById('paramModal').hidden = false;
  paramPanelRender();
  var add = document.getElementById('paramNewName');
  if (add) add.focus();
}
function paramPanelClose(){ document.getElementById('paramModal').hidden = true; draw(); }
function paramPanelSay(txt, bad){
  var s = document.getElementById('paramSay');
  s.textContent = txt || ''; s.classList.toggle('bad', !!bad);
}
// The value an expression comes to, for showing: "= 18.30 mm", or why it can't be worked out
function paramShow(p){
  try { return {txt: '= ' + fmtDisp(paramValue(p.name)) + ' ' + unitTag()}; }
  catch (e) { return {txt: e.message, bad: true}; }
}
function paramPanelRender(){
  var box = document.getElementById('paramList');
  if (!box) return;
  box.innerHTML = '';
  function cell(tag, cls, txt){ var c = document.createElement(tag); if (cls) c.className = cls; if (txt !== undefined) c.textContent = txt; return c; }
  // the material's thickness, always there
  var mat = cell('div', 'prow pbuilt');
  mat.appendChild(cell('span', 'pname', PARAM_BUILTIN));
  mat.appendChild(cell('span', 'pexpr', 'the material’s thickness, from Settings'));
  mat.appendChild(cell('span', 'pval', DOC.stock && DOC.stock.t > 0 ? '= ' + fmtDisp(DOC.stock.t) + ' ' + unitTag() : 'not set'));
  box.appendChild(mat);
  paramsArr().forEach(function (p, i) {
    var row = cell('div', 'prow');
    var nm = document.createElement('input'); nm.type = 'text'; nm.value = p.name; nm.className = 'pname'; nm.setAttribute('aria-label', 'Name of parameter ' + (i + 1)); nm.spellcheck = false;
    nm.addEventListener('change', function () { paramPanelRename(p, nm.value.trim(), nm); });
    var ex = document.createElement('input'); ex.type = 'text'; ex.value = p.expr; ex.className = 'pexpr'; ex.setAttribute('aria-label', p.name + ': value or arithmetic'); ex.spellcheck = false;
    ex.title = 'A number, or arithmetic using other parameters, like thickness + 0.2. Numbers are ' + (p.unit === 'in' ? 'inches' : 'mm') + ' unless they say otherwise (18mm, 3/4in).';
    ex.addEventListener('change', function () { paramPanelSetExpr(p, ex.value.trim(), ex); });
    var sh = paramShow(p), val = cell('span', 'pval' + (sh.bad ? ' bad' : ''), sh.txt);
    var users = paramUsers(p), n = users.dims + users.params.length;
    val.title = n ? 'Used by ' + [users.dims ? users.dims + (users.dims === 1 ? ' dimension' : ' dimensions') : '', users.params.join(', ')].filter(Boolean).join(' and ') : 'Not used yet';
    var del = cell('button', 'pdel', '✕'); del.title = 'Delete ' + p.name; del.setAttribute('aria-label', 'Delete ' + p.name);
    del.addEventListener('click', function () { paramPanelDelete(p); });
    row.appendChild(nm); row.appendChild(ex); row.appendChild(val); row.appendChild(del);
    var note = document.createElement('input'); note.type = 'text'; note.value = p.note || ''; note.className = 'pnote'; note.placeholder = 'note (optional)'; note.setAttribute('aria-label', p.name + ': note');
    note.addEventListener('change', function () { pushUndo(); p.note = note.value; persist(); });
    row.appendChild(note);
    box.appendChild(row);
  });
  document.getElementById('paramEmpty').hidden = paramsArr().length > 0;
  document.getElementById('paramNewUnit').textContent = unitTag();
}
// Apply after a change: every dimension follows; say what couldn't
function paramPanelApplied(said){
  var failed = paramsApplyDims();
  persist(); draw(); paramPanelRender();
  paramPanelSay(said, false);
  paramsSayFailed(failed);
}
// Would this expression work for p (no mistakes, no loops)? '' if so, else why
function paramExprProblem(p, expr){
  var was = {expr: p.expr, unit: p.unit};
  p.expr = expr; p.unit = stockUnits();
  try { paramValue(p.name); return ''; }
  catch (e) { return e.message; }
  finally { p.expr = was.expr; p.unit = was.unit; }
}
function paramPanelSetExpr(p, expr, input){
  if (expr === p.expr && p.unit === stockUnits()) return;
  var why = paramExprProblem(p, expr);
  if (why){ paramPanelSay(why + ' Nothing changed.', true); input.value = p.expr; return; }
  pushUndo();
  p.expr = expr; p.unit = stockUnits();                     // typed in the units shown now
  paramPanelApplied(p.name + ' is now ' + expr + '.');
}
function paramPanelRename(p, to, input){
  if (to === p.name) return;
  var why = paramNameProblem(to, p);
  if (why){ paramPanelSay(why, true); input.value = p.name; return; }
  pushUndo();
  var from = p.name;
  paramRename(p, to);
  persist(); draw(); paramPanelRender();
  paramPanelSay(from + ' is now called ' + to + ', everywhere it’s used.', false);
}
function paramPanelDelete(p){
  var u = paramUsers(p);
  if (u.dims || u.params.length){
    paramPanelSay(p.name + ' is used by ' + [u.dims ? u.dims + (u.dims === 1 ? ' dimension' : ' dimensions') : '', u.params.join(', ')].filter(Boolean).join(' and ') +
                  '. Change those first, then delete it.', true);
    return;
  }
  pushUndo();
  paramsArr().splice(paramsArr().indexOf(p), 1);
  persist(); paramPanelRender();
  paramPanelSay(p.name + ' deleted. Undo brings it back.', false);
}
function paramPanelAdd(){
  var nmEl = document.getElementById('paramNewName'), exEl = document.getElementById('paramNewExpr');
  var name = nmEl.value.trim(), expr = exEl.value.trim();
  if (!name){ paramPanelSay('Give it a name, like thickness or shelf_gap.', true); nmEl.focus(); return; }
  var why = paramNameProblem(name);
  if (why){ paramPanelSay(why, true); nmEl.focus(); return; }
  if (!expr){ paramPanelSay('Give ' + name + ' a value, like 18 or thickness + 0.2.', true); exEl.focus(); return; }
  var p = {name: name, expr: expr, unit: stockUnits(), note: ''};
  paramsArr().push(p);
  why = paramExprProblem(p, expr);
  paramsArr().pop();
  if (why){ paramPanelSay(why, true); exEl.focus(); return; }
  pushUndo();
  paramsArr().push(p);
  nmEl.value = ''; exEl.value = '';
  persist(); paramPanelRender();
  paramPanelSay(name + ' added. Type it into a dimension to use it.', false);
  nmEl.focus();
}
function paramPanelWire(){
  document.getElementById('paramX').addEventListener('click', paramPanelClose);
  document.getElementById('paramDone').addEventListener('click', paramPanelClose);
  document.getElementById('paramAdd').addEventListener('click', paramPanelAdd);
  ['paramNewName', 'paramNewExpr'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) { if (e.key === 'Enter'){ e.preventDefault(); paramPanelAdd(); } });
  });
  document.getElementById('paramModal').addEventListener('keydown', function (e) {
    if (e.key === 'Escape'){ e.preventDefault(); paramPanelClose(); }
  });
}
