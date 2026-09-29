// Toolpaths run in the order listed. Moving one is undoable like any other edit.
function tpMoveTo(from, to){
  var list = tpList();
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
  pushUndo();
  var item = list.splice(from, 1)[0];
  list.splice(to, 0, item);
  persist(); renderToolpathPanel(); draw();
}
function tpIndex(id){ var at = -1; tpList().forEach(function (x, i) { if (x.id === id) at = i; }); return at; }
// Anything cut inside a part after that part's outside profile may be cutting a part that is
// already loose. Only a nudge: with tabs it can be fine, but drilling first is the safe habit.
function tpOrderNote(tp, idx){
  if (tp.side !== 'drill' && tp.side !== 'inside' && tp.side !== 'pocket' && tp.side !== 'chamfer' && tp.side !== 'vcarve') return null;
  var list = tpList();
  if (tp.exclude) return null;
  for (var i = 0; i < idx; i++){
    var prior = list[i];
    if (prior.side !== 'outside' || prior.exclude) continue;
    var inside = tp.ents.some(function (id) {
      if (prior.ents.indexOf(id) >= 0) return true;        // the very edge that was cut free (a chamfer on it, say)
      var probe = tp.side === 'drill' ? tpDrillPoints([id])[0] : null;
      var pt = probe ? probe.p : (tpOutlinesById([id])[0] || {loop: [[NaN, NaN]]}).loop[0];
      return tpOutlinesById(prior.ents).some(function (o) { return Geom.pointInLoop(pt[0], pt[1], o.loop); });
    });
    if (inside) return 'Runs after \u201c' + prior.name + '\u201d, which cuts round it' +
                       (prior.tabsOn ? '. The tabs should hold it, but running this first is safer.' : ' with no tabs \u2014 the part may be loose by then.');
  }
  return null;
}
function tpDelete(id){
  var list = tpList(), at = -1;
  list.forEach(function (x, i) { if (x.id === id) at = i; });
  if (at < 0) return;
  pushUndo();
  var name = list[at].name;
  list.splice(at, 1);
  if (CUTSEL === id) CUTSEL = null;
  persist(); renderToolpathPanel(); draw();
  toast('ok', 'Toolpath deleted', name + ' removed. The drawing is untouched.');
}
// Tool numbers (T1, T2...) for a job, taken in cutting order: each distinct tool gets its number from the
// library for this machine, or the next free one. Shared by the G-code export and the job sheet, so they agree.
function toolNumbering(){
  var mid = TOOLLIB ? libDefaultMachine() : null, nextNum = 1, numFor = {};
  return function (tp){
    var key = tp.toolId || ('dia' + tp.dia);
    if (numFor[key]) return numFor[key];
    var t = tp.toolId ? libTool(tp.toolId) : null;
    var n2 = t && t.numbers && t.numbers[mid] !== undefined ? t.numbers[mid] : null;
    if (!n2){ while (Object.keys(numFor).some(function (k) { return numFor[k] === nextNum; })) nextNum++; n2 = nextNum++; }
    numFor[key] = n2;
    return n2;
  };
}
