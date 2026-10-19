// ---- toolpath groups ----
// A group bundles toolpaths under one name (an inlay's pocket half, say): it folds to one line, its toolpaths are
// shown, hidden, ticked and recalculated together, it moves through the cutting order as one block, and it can be
// saved as a G-code file of its own. DOC.tpGroups lists them ({id, name, folded}); each member has tp.group.
// A group's toolpaths always sit together in the cutting order, where its first one is (tpGroupsTidy keeps it so),
// and are all on one sheet: each sheet is its own piece of material.
var TP_GROUP_RENAMING = null;                           // the id of the group whose header shows a name box
var TP_PICKED = [];                                     // toolpath ids picked with Ctrl+click, to group them
function tpGroups(){ return DOC.tpGroups || (DOC.tpGroups = []); }
function tpGroupById(gid){ return tpGroups().filter(function (g) { return g.id === gid; })[0] || null; }
function tpGroupOf(tp){ return tp && tp.group ? tpGroupById(tp.group) : null; }
function tpGroupMembers(gid){ return tpList().filter(function (t) { return t.group === gid; }); }
// Keep every group together, where its first toolpath is, on that toolpath's sheet; forget empty groups and
// toolpaths' memberships of groups that are gone. Returns true if anything changed.
function tpGroupsTidy(){
  var list = tpList(), groups = tpGroups(), changed = false, sheetOf = {};
  list.forEach(function (t) {
    if (!t.group) return;
    if (!tpGroupById(t.group)){ delete t.group; changed = true; return; }
    if (!(t.group in sheetOf)) sheetOf[t.group] = tpSheetOf(t);
    else if (tpSheetOf(t) !== sheetOf[t.group]){ delete t.group; changed = true; }   // another sheet: not with the others
  });
  var out = [], done = {};
  list.forEach(function (t) {
    if (!t.group){ out.push(t); return; }
    if (done[t.group]) return;
    done[t.group] = true;
    list.forEach(function (m) { if (m.group === t.group) out.push(m); });
  });
  for (var i = 0; i < out.length; i++) if (out[i] !== list[i]){ changed = true; break; }
  if (changed){ list.length = 0; out.forEach(function (t) { list.push(t); }); }
  var kept = groups.filter(function (g) { return done[g.id]; });
  if (kept.length !== groups.length){ DOC.tpGroups = kept; changed = true; }
  return changed;
}
function tpGroupNewName(){
  var names = tpGroups().map(function (g) { return g.name; }), n = tpGroups().length + 1;
  while (names.indexOf('Group ' + n) >= 0) n++;
  return 'Group ' + n;
}
// Make a group of these toolpaths (ids), named `name` or "Group n"; the name box opens, to name it there and then.
function tpGroupMake(ids, name){
  var list = tpList(), members = list.filter(function (t) { return ids.indexOf(t.id) >= 0; });
  if (!members.length) return null;
  var sheet = tpSheetOf(members[0]);
  members = members.filter(function (t) { return tpSheetOf(t) === sheet; });
  pushUndo();
  var g = {id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || tpGroupNewName(), folded: false};
  tpGroups().push(g);
  members.forEach(function (t) { t.group = g.id; });
  tpGroupsTidy();
  TP_PICKED = [];
  if (!name) TP_GROUP_RENAMING = g.id;
  persist(); renderToolpathPanel(); draw();
  return g;
}
function tpGroupJoin(tp, gid){
  var g = tpGroupById(gid);
  if (!g || tp.group === gid) return;
  var others = tpGroupMembers(gid);
  if (others.length && tpSheetOf(others[0]) !== tpSheetOf(tp)){ toast('info', 'Not on that sheet', '\u201c' + g.name + '\u201d is on another sheet. A group\u2019s toolpaths are all cut from one piece of material.'); return; }
  pushUndo(); tp.group = gid; tpGroupsTidy();
  persist(); renderToolpathPanel(); draw();
}
// Out of its group: it goes just after the group's other toolpaths.
function tpGroupLeave(tp){
  if (!tp.group) return;
  pushUndo();
  var list = tpList(), gid = tp.group, rest = tpGroupMembers(gid).filter(function (t) { return t !== tp; });
  delete tp.group;
  if (rest.length){
    list.splice(list.indexOf(tp), 1);
    list.splice(list.indexOf(rest[rest.length - 1]) + 1, 0, tp);
  }
  tpGroupsTidy();
  persist(); renderToolpathPanel(); draw();
}
function tpUngroup(gid){
  var g = tpGroupById(gid); if (!g) return;
  pushUndo();
  tpGroupMembers(gid).forEach(function (t) { delete t.group; });
  DOC.tpGroups = tpGroups().filter(function (x) { return x.id !== gid; });
  persist(); renderToolpathPanel(); draw();
  toast('ok', 'Ungrouped', '\u201c' + g.name + '\u201d is gone; its toolpaths are still there, in the same order.');
}
function tpGroupDelete(gid){
  var g = tpGroupById(gid); if (!g) return;
  var n = tpGroupMembers(gid).length;
  uiDialog({title: 'Delete \u201c' + g.name + '\u201d?', body: 'The group and its ' + (n === 1 ? 'toolpath' : n + ' toolpaths') + ' are deleted. The drawing is untouched, and Undo brings them back.',
            ok: 'Delete', danger: true}).then(function (ok) {
    if (!ok) return;
    pushUndo();
    DOC.toolpaths = tpList().filter(function (t) { return t.group !== gid; });
    DOC.tpGroups = tpGroups().filter(function (x) { return x.id !== gid; });
    if (CUTSEL && !tpList().some(function (t) { return t.id === CUTSEL; })) CUTSEL = null;
    persist(); renderToolpathPanel(); draw();
  });
}
function tpGroupRename(g, name){
  var nm = tpNameClean(name);
  if (!nm || nm === g.name) return false;
  pushUndo(); g.name = nm; persist(); renderToolpathPanel();
  return true;
}
// Show or hide them all: if any is shown, hide them all; if all are hidden, show them all.
function tpGroupShowHide(gid){
  var m = tpGroupMembers(gid), hide = m.some(function (t) { return !t.hidden; });
  m.forEach(function (t) { t.hidden = hide; });
  CUTSEL = null; persist(); renderToolpathPanel(); draw();
}
// In or out of the G-code: if all are in, take them all out; otherwise put them all in.
function tpGroupInclude(gid){
  var m = tpGroupMembers(gid), allIn = m.every(function (t) { return !t.exclude; });
  m.forEach(function (t) { t.exclude = allIn; });
  persist(); renderToolpathPanel(); draw();
}
function tpGroupRecalc(gid){
  var g = tpGroupById(gid), m = tpGroupMembers(gid), warned = [];
  m.forEach(function (t) { tpGenerate(t); if (t.warning) warned.push(t.name); });
  persist(); renderToolpathPanel(); draw();
  if (warned.length) toast('warn', g.name + ' recalculated', 'Check ' + warned.join(', ') + ': ' + (warned.length === 1 ? 'it has' : 'they have') + ' a note.');
  else toast('ok', g.name + ' recalculated', m.length + (m.length === 1 ? ' toolpath' : ' toolpaths') + ' rebuilt from their shapes and the material as they are now.');
}
// Where the group's block starts and ends in the list.
function tpGroupSpan(gid){
  var list = tpList(), a = -1, b = -1;
  list.forEach(function (t, i) { if (t.group === gid){ if (a < 0) a = i; b = i; } });
  return {a: a, b: b};
}
// The place a toolpath or a group's block moves to, one step earlier (-1) or later (1), on its own sheet: past one
// toolpath, or past a whole group. A toolpath in a group moves only within it. -1 if it can't.
function tpStep(idx, dir){
  var list = tpList(), tp = list[idx];
  if (!tp) return -1;
  if (tp.group){
    for (var i = idx + dir; i >= 0 && i < list.length; i += dir) if (list[i].group === tp.group) return i;
    return -1;
  }
  var k = tpNeighbour(idx, dir);
  if (k < 0) return -1;
  if (list[k].group){ var s = tpGroupSpan(list[k].group); return dir < 0 ? s.a : s.b; }
  return k;
}
function tpGroupStep(gid, dir){
  var list = tpList(), s = tpGroupSpan(gid);
  if (s.a < 0) return -1;
  var k = tpNeighbour(dir < 0 ? s.a : s.b, dir);
  if (k < 0) return -1;
  return list[k].group ? (dir < 0 ? tpGroupSpan(list[k].group).a : tpGroupSpan(list[k].group).b) : k;
}
// Move the whole group so it starts at (dir -1) or ends at (dir 1) the place `to`.
function tpGroupMove(gid, dir){
  var to = tpGroupStep(gid, dir);
  if (to < 0) return;
  pushUndo();
  var list = tpList(), s = tpGroupSpan(gid), block = list.splice(s.a, s.b - s.a + 1);
  var at = dir < 0 ? to : to - block.length + 1;
  Array.prototype.splice.apply(list, [at, 0].concat(block));
  persist(); renderToolpathPanel(); draw();
}
// A card dropped on another card: it moves there, and joins that card's group (or leaves its own, onto a card
// that isn't in one). Dropped on a group's header: to the start of that group.
function tpDropOn(from, to, gid){
  var list = tpList(), tp = list[from];
  if (!tp) return;
  if (gid !== undefined){
    var s = tpGroupSpan(gid); if (s.a < 0) return;
    if (tp.group !== gid && tpSheetOf(list[s.a]) !== tpSheetOf(tp)) return;
    pushUndo();
    list.splice(from, 1);
    s = tpGroupSpan(gid);
    list.splice(s.a < 0 ? list.length : s.a, 0, tp);
    tp.group = gid;
  } else {
    var target = list[to];
    if (!target || (from === to)) return;
    pushUndo();
    list.splice(from, 1); list.splice(to, 0, tp);
    if (target.group) tp.group = target.group; else delete tp.group;
  }
  tpGroupsTidy();
  persist(); renderToolpathPanel(); draw();
}
// Save the group's ticked toolpaths as a G-code file of their own.
function tpGroupSave(gid){
  var g = tpGroupById(gid), ids = tpGroupMembers(gid).filter(function (t) { return !t.exclude; }).map(function (t) { return t.id; });
  if (!ids.length){ toast('info', 'Nothing to save', 'Every toolpath in \u201c' + g.name + '\u201d is unticked. Tick the ones to include.'); return; }
  tpExport(false, {ids: ids, name: g.name});
}
// The header line of a group, before its first toolpath's card.
function tpGroupHeader(g, members){
  var head = document.createElement('div');
  head.className = 'tpGroupHead' + (g.folded ? ' tpFolded' : '');
  head.dataset.group = g.id;
  var fold = document.createElement('button'); fold.className = 'tpFold';
  fold.textContent = g.folded ? '\u25b8' : '\u25be';
  fold.title = g.folded ? 'Show this group\u2019s toolpaths' : 'Fold the group to this line';
  fold.setAttribute('aria-label', (g.folded ? 'Show the toolpaths in ' : 'Fold ') + g.name);
  fold.setAttribute('aria-expanded', g.folded ? 'false' : 'true');
  fold.addEventListener('click', function (ev) { ev.stopPropagation(); g.folded = !g.folded; persist(); renderToolpathPanel(); });
  head.appendChild(fold);
  var grip = document.createElement('span'); grip.className = 'tpGrip'; grip.draggable = true;
  grip.textContent = '\u2807'; grip.title = 'Drag to move the whole group'; grip.setAttribute('aria-hidden', 'true');
  grip.addEventListener('click', function (ev) { ev.stopPropagation(); });
  grip.addEventListener('dragstart', function (e) { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'g:' + g.id); });
  head.appendChild(grip);
  var nIn = members.filter(function (t) { return !t.exclude; }).length;
  var inc = document.createElement('input'); inc.type = 'checkbox'; inc.className = 'tpInc';
  inc.checked = nIn === members.length; inc.indeterminate = nIn > 0 && nIn < members.length;
  inc.title = nIn === members.length ? 'All included in the saved G-code \u2014 untick to leave them all out'
            : nIn ? nIn + ' of ' + members.length + ' included \u2014 tick to include them all' : 'All left out of the saved G-code \u2014 tick to include them all';
  inc.setAttribute('aria-label', 'Include the toolpaths in ' + g.name + ' when saving G-code');
  inc.addEventListener('click', function (ev) { ev.stopPropagation(); });
  inc.addEventListener('change', function () { tpGroupInclude(g.id); });
  head.appendChild(inc);
  if (TP_GROUP_RENAMING === g.id){
    var ni = document.createElement('input'); ni.type = 'text'; ni.className = 'tpNmEdit'; ni.maxLength = 60; ni.value = g.name; ni.spellcheck = false;
    ni.setAttribute('aria-label', 'Name of this group');
    var done = false, end = function (save) { if (done) return; done = true; TP_GROUP_RENAMING = null; if (!save || !tpGroupRename(g, ni.value)) renderToolpathPanel(); };
    ['click', 'dblclick', 'mousedown'].forEach(function (evName) { ni.addEventListener(evName, function (ev) { ev.stopPropagation(); }); });
    ni.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter'){ ev.preventDefault(); end(true); } else if (ev.key === 'Escape'){ ev.preventDefault(); end(false); }
    });
    ni.addEventListener('blur', function () { end(true); });
    head.appendChild(ni); head._rename = ni;
  } else {
    var nm = document.createElement('span'); nm.className = 'tpNm'; nm.textContent = g.name;
    nm.title = g.name + ' \u2014 double-click to rename';
    nm.addEventListener('dblclick', function (ev) { ev.stopPropagation(); TP_GROUP_RENAMING = g.id; renderToolpathPanel(); });
    head.appendChild(nm);
  }
  var cnt = document.createElement('span'); cnt.className = 'tpGroupCount';
  cnt.textContent = members.length + (members.length === 1 ? ' toolpath' : ' toolpaths');
  head.appendChild(cnt);
  // what a folded group must still say: any of its toolpaths' warnings
  if (g.folded){
    var warns = [];
    members.forEach(function (t) {
      var st = !tpToolChosen(t) ? 'no tool chosen' : tpStale(t) ? 'the drawing changed: recalculate it' : '';
      tpCardWarnings(t, tpList().indexOf(t)).concat(st ? [st] : []).forEach(function (w) { warns.push(t.name + ': ' + w); });
    });
    if (warns.length){
      var wb = document.createElement('span'); wb.className = 'tpWarnMark'; wb.textContent = '\u26a0';
      wb.title = warns.join('\n'); wb.setAttribute('aria-label', 'Warning: ' + warns.join('. '));
      head.appendChild(wb);
    }
  }
  var allHidden = members.every(function (t) { return t.hidden; });
  var eye = document.createElement('button'); eye.className = 'tpEye' + (allHidden ? ' off' : '');
  eye.innerHTML = allHidden
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><path d="M2.5 13.5l11-11"/></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>';
  eye.title = allHidden ? 'All hidden on the drawing \u2014 click to show them' : 'Shown on the drawing \u2014 click to hide them all';
  eye.setAttribute('aria-label', (allHidden ? 'Show ' : 'Hide ') + 'the toolpaths in ' + g.name);
  eye.addEventListener('click', function (ev) { ev.stopPropagation(); tpGroupShowHide(g.id); });
  head.appendChild(eye);
  head.addEventListener('click', function () { g.folded = !g.folded; persist(); renderToolpathPanel(); });
  head.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var anyShown = members.some(function (t) { return !t.hidden; }), allIn = members.every(function (t) { return !t.exclude; });
    ctxMenuOpen(e.clientX, e.clientY, [
      {label: 'Recalculate the group', fn: function () { tpGroupRecalc(g.id); }},
      {label: 'Rename\u2026', fn: function () { TP_GROUP_RENAMING = g.id; renderToolpathPanel(); }},
      {label: g.folded ? 'Show its toolpaths' : 'Fold to this line', fn: function () { g.folded = !g.folded; persist(); renderToolpathPanel(); }},
      {label: 'Save G-code for this group\u2026', disabled: !camReady(), fn: function () { tpGroupSave(g.id); }},
      null,
      {label: anyShown ? 'Hide them on the drawing' : 'Show them on the drawing', fn: function () { tpGroupShowHide(g.id); }},
      {label: allIn ? 'Leave them out of the G-code' : 'Include them all in the G-code', fn: function () { tpGroupInclude(g.id); }},
      null,
      {label: 'Run the group earlier', disabled: tpGroupStep(g.id, -1) < 0, fn: function () { tpGroupMove(g.id, -1); }},
      {label: 'Run the group later', disabled: tpGroupStep(g.id, 1) < 0, fn: function () { tpGroupMove(g.id, 1); }},
      null,
      {label: 'Ungroup (keep the toolpaths)', fn: function () { tpUngroup(g.id); }},
      {label: 'Delete the group and its toolpaths\u2026', danger: true, fn: function () { tpGroupDelete(g.id); }}
    ]);
  });
  head.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; head.classList.add('tpDropOver'); });
  head.addEventListener('dragleave', function () { head.classList.remove('tpDropOver'); });
  head.addEventListener('drop', function (e) {
    e.preventDefault(); head.classList.remove('tpDropOver');
    var d = e.dataTransfer.getData('text/plain');
    if (/^g:/.test(d)){ tpGroupDropOnGroup(d.slice(2), g.id); return; }
    var from = parseInt(d, 10);
    if (!isNaN(from)) tpDropOn(from, -1, g.id);
  });
  return head;
}
// A group's header dropped on a toolpath card or another group: the group moves to start there.
function tpGroupDropAt(gid, to){
  var list = tpList(), s = tpGroupSpan(gid), target = list[to];
  if (s.a < 0 || !target || target.group === gid || tpSheetOf(target) !== tpSheetOf(list[s.a])) return;
  if (target.group) to = tpGroupSpan(target.group).a;      // not into the middle of another group
  pushUndo();
  var block = list.splice(s.a, s.b - s.a + 1);
  var at = to > s.b ? to - block.length : to;
  Array.prototype.splice.apply(list, [at, 0].concat(block));
  persist(); renderToolpathPanel(); draw();
}
function tpGroupDropOnGroup(gid, onto){ var s = tpGroupSpan(onto); if (s.a >= 0) tpGroupDropAt(gid, s.a); }
