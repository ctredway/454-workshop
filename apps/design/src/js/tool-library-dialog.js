// ---- the Tool library dialog ----
var LIBUI = {sel:null, q:'', pick:null, edit:null, draft:null};           // pick: set when choosing a tool for a toolpath
// Opened to manage tools, or (with onPick) to choose one for a toolpath, the way VCarve's
// Tool Database is used both ways. The Machine and Material pickers at the top decide which
// feeds and speeds the chosen tool brings with it.
function libOpen(selectId, onPick){
  if (selectId) LIBUI.sel = selectId;
  LIBUI.pick = onPick || null;
  document.getElementById('libTitle').textContent = onPick ? 'Choose a tool' : 'Tool library';
  document.getElementById('libPickBar').hidden = !onPick;
  document.getElementById('libModal').hidden = false;
  libRender();
  document.getElementById(TOOLLIB ? 'libSearch' : 'libImport').focus();
}
function libCloseDlg(){
  document.getElementById('libModal').hidden = true;
  LIBUI.pick = null;
  document.getElementById('libPickBar').hidden = true;
  document.getElementById('libTitle').textContent = 'Tool library';
}
function libPickNow(){
  if (!LIBUI.pick || !LIBUI.sel || !libTool(LIBUI.sel)) return;
  var fn = LIBUI.pick, id = LIBUI.sel;
  libCloseDlg();
  fn(id);
}
// A small picture of the cutter, like VCarve's tree, so tools can be told apart at a glance.
function libToolIcon(t){
  var ty = (t.typeName || '').toLowerCase(), d;
  if (ty.indexOf('v-bit') >= 0 || ty.indexOf('engrav') >= 0) d = 'M5 2h6v5l-3 7-3-7z';
  else if (ty.indexOf('ball') >= 0) d = 'M5 2h6v8a3 3 0 0 1-6 0z';
  else if (ty.indexOf('drill') >= 0) d = 'M5 2h6v9l-3 3-3-3z';
  else if (ty.indexOf('radius') >= 0) d = 'M5 2h6v10a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 5 12z';
  else d = 'M5 2h6v11.5H5z';                                  // end mill and anything else
  return '<svg class="libIco" viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '"/>' +
         '<path d="M6.5 5.5l3 1.5M6.5 8.5l3 1.5" class="flute"/></svg>';
}
function libRender(){
  var has = !!(TOOLLIB && TOOLLIB.tools.length);
  document.getElementById('libEmpty').hidden = has;
  document.getElementById('libBar').style.display = has ? '' : 'none';
  document.getElementById('libBody').style.display = has ? '' : 'none';
  document.getElementById('libRemove').style.display = has ? '' : 'none';
  document.getElementById('libSource').textContent = has
    ? TOOLLIB.tools.length + ' tools \u00b7 from ' + TOOLLIB.source.file + ' \u00b7 ' + new Date(TOOLLIB.source.importedAt).toLocaleDateString()
    : '';
  if (!has) return;
  var mSel = document.getElementById('libMachine'), matSel = document.getElementById('libMaterial');
  var mid = libDefaultMachine();
  mSel.innerHTML = '';
  TOOLLIB.machines.forEach(function(m){ var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; mSel.appendChild(o); });
  mSel.value = mid;
  matSel.innerHTML = '<option value="">All materials</option>';
  TOOLLIB.materials.forEach(function(m){ var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; matSel.appendChild(o); });
  matSel.value = UICFG.libMaterial && libMaterialName(UICFG.libMaterial) ? UICFG.libMaterial : '';
  libRenderTree(mid);
  libRenderDetail(mid);
  libPickState();
}
function libPickState(){
  var go = document.getElementById('libPickGo');
  if (!go) return;
  var t = LIBUI.sel ? libTool(LIBUI.sel) : null;
  go.disabled = !t;
  document.getElementById('libPickNote').textContent = t
    ? t.name + (UICFG.libMaterial && libMaterialName(UICFG.libMaterial) ? ' \u00b7 feeds for ' + libMaterialName(UICFG.libMaterial) : ' \u00b7 choose a material for its feeds')
    : 'Pick a tool, then Select \u2014 or double-click it.';
}
function libToolRow(t, mid){
  var b = document.createElement('button');
  b.className = 'libItem'; b.setAttribute('role', 'treeitem');
  b.setAttribute('aria-selected', t.id === LIBUI.sel ? 'true' : 'false');
  b.insertAdjacentHTML('beforeend', libToolIcon(t));
  var ln = document.createElement('span'); ln.className = 'ln'; ln.textContent = t.name; b.appendChild(ln);
  if (t.numbers[mid] !== undefined){ var tn = document.createElement('span'); tn.className = 'libT'; tn.textContent = 'T' + t.numbers[mid]; b.appendChild(tn); }
  b.title = t.name;
  b.addEventListener('click', function(){ LIBUI.sel = t.id; libRenderTree(mid); libRenderDetail(mid); libPickState(); });
  b.addEventListener('dblclick', function(){ LIBUI.sel = t.id; if (LIBUI.pick) libPickNow(); });
  return b;
}
function libRenderTree(mid){
  var box = document.getElementById('libTree');
  box.innerHTML = '';
  var q = LIBUI.q.trim().toLowerCase();
  if (q){                                                       // searching: a flat list of matches
    var hits = TOOLLIB.tools.filter(function(t){ return t.name.toLowerCase().indexOf(q) >= 0 || t.typeName.toLowerCase().indexOf(q) >= 0; });
    hits.forEach(function(t){ box.appendChild(libToolRow(t, mid)); });
    if (!hits.length){ var em = document.createElement('p'); em.style.cssText = 'padding:10px 14px;color:var(--muted)'; em.textContent = 'No tools match.'; box.appendChild(em); }
    return;
  }
  // the tools chosen for toolpaths lately, newest first, above the library's own folders
  var recent = (UICFG.recentTools || []).map(libTool).filter(Boolean);
  if (recent.length){
    var rd = document.createElement('details'); rd.open = true;
    var rs = document.createElement('summary'); rs.textContent = 'Recently used'; rd.appendChild(rs);
    var rk = document.createElement('div'); rk.className = 'libKids'; rd.appendChild(rk);
    recent.forEach(function (t) { rk.appendChild(libToolRow(t, mid)); });
    box.appendChild(rd);
  }
  (function add(list, into){
    list.forEach(function(n){
      if (n.tool){ var t = libTool(n.tool); if (t) into.appendChild(libToolRow(t, mid)); return; }
      var d = document.createElement('details');
      var containsSel = LIBUI.sel && JSON.stringify(n).indexOf('"' + LIBUI.sel + '"') >= 0;
      if (containsSel) d.open = true;
      var sm = document.createElement('summary'); sm.textContent = n.name || 'Folder'; d.appendChild(sm);
      var kids = document.createElement('div'); kids.className = 'libKids'; d.appendChild(kids);
      add(n.kids, kids);
      into.appendChild(d);
    });
  })(TOOLLIB.tree, box);
}
// ---- editing the library ----
// A tool's geometry, its number on this machine, and its feeds and speeds for each material, like
// VCarve's tool database. Edits go to a draft; Save writes them to the library in this browser
// (shared with 454 Control). Toolpaths already made keep their own feeds until the tool is chosen again.
function libEmptyLib(){
  return {v: 1, source: {file: '454 tool library', importedAt: Date.now()},
          machines: [{id: 'm454', name: 'My machine', make: '', model: '', controller: ''}],
          materials: [{id: 'mat1', name: 'General'}], tools: [], tree: [{id: '_mine', name: 'My tools', tool: null, kids: []}]};
}
function libAutoName(t){
  var u = t.units === 'in' ? '"' : ' mm', d = t.diameter > 0 ? (t.units === 'in' ? libFraction(t.diameter) : libTrim(t.diameter, 3)) + u : '';
  var ang = (t.type === 3 || t.type === 4) && t.angle > 0 ? libTrim(t.angle, 1) + '\u00b0' + (d ? ' - ' : '') : '';
  return (TOOL_TYPES[t.type] || 'Tool') + ' (' + ang + d + ')';
}
function libMyFolder(){                                        // where new tools go
  var f = TOOLLIB.tree.filter(function (n) { return n.id === '_mine'; })[0];
  if (!f){ f = {id: '_mine', name: 'My tools', tool: null, kids: []}; TOOLLIB.tree.unshift(f); }
  return f;
}
function libTreeRemove(list, toolId){
  for (var i = list.length - 1; i >= 0; i--){ if (list[i].tool === toolId) list.splice(i, 1); else libTreeRemove(list[i].kids || [], toolId); }
}
function libCommit(msg){
  libSave(TOOLLIB).then(function () { if (msg) toast('ok', msg, ''); }, function (e) { toast('err', 'Couldn\u2019t save the tool library', (e && e.message) || ''); });
  libRender();
}
function libNewTool(){
  if (!TOOLLIB) TOOLLIB = libEmptyLib();
  var inch = UICFG.stockUnits === 'in';
  var t = {id: 't' + Date.now().toString(36), fmt: '', type: 1, typeName: TOOL_TYPES[1], units: inch ? 'in' : 'mm', diameter: inch ? 0.25 : 6,
           angle: null, flat: null, tipRadius: null, flutes: 2, fluteLength: null, notes: '', numbers: {}, cuts: [], lineWidth: null};
  t.name = libAutoName(t);
  TOOLLIB.tools.push(t);
  libMyFolder().kids.push({id: '_m' + t.id, tool: t.id, kids: []});
  LIBUI.sel = t.id; LIBUI.edit = t.id; LIBUI.draft = null;
  libCommit(null);
}
function libDuplicate(t){
  var c = JSON.parse(JSON.stringify(t));
  c.id = 't' + Date.now().toString(36); c.name = t.name + ' (copy)'; c.fmt = ''; c.numbers = {};
  TOOLLIB.tools.push(c);
  libMyFolder().kids.push({id: '_m' + c.id, tool: c.id, kids: []});
  LIBUI.sel = c.id; LIBUI.edit = c.id; LIBUI.draft = null;
  libCommit('Duplicated ' + t.name);
}
function libDelete(t){
  var used = tpList().filter(function (x) { return x.toolId === t.id; }).length;
  uiDialog({title: 'Delete \u201c' + t.name + '\u201d?', body: 'It\u2019s removed from the library in this browser, with its feeds and speeds for every material.' +
            (used ? '\n\n' + used + (used === 1 ? ' toolpath uses' : ' toolpaths use') + ' it; they keep their own feeds and speeds.' : ''), ok: 'Delete', cancel: 'Cancel'})
    .then(function (yes) {
      if (!yes) return;
      TOOLLIB.tools = TOOLLIB.tools.filter(function (x) { return x.id !== t.id; });
      libTreeRemove(TOOLLIB.tree, t.id);
      LIBUI.sel = null; LIBUI.edit = null; LIBUI.draft = null;
      libCommit('Deleted ' + t.name);
    });
}
function libAddMaterial(name){
  name = (name || '').trim(); if (!name || !TOOLLIB) return;
  if (TOOLLIB.materials.some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })){ toast('info', 'That material already exists', name); return; }
  var id = 'mat' + Date.now().toString(36);
  TOOLLIB.materials.push({id: id, name: name});
  UICFG.libMaterial = id; uiCfgSave();
  libCommit('Added ' + name + ': choose a tool and Edit to give it feeds and speeds');
}
function libCutOf(t, mid, mat){ return t.cuts.filter(function (c) { return c.machine === mid && c.material === mat; })[0] || null; }
function libRenderEditor(box, t, mid){
  if (!LIBUI.draft || LIBUI.draft.id !== t.id) LIBUI.draft = JSON.parse(JSON.stringify(t));
  var d = LIBUI.draft, mat = document.getElementById('libMaterial').value || '';
  function el(tag, txt, cls){ var e = document.createElement(tag); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e; }
  function field(form, label, input, unit){
    var l = el('label', label); l.htmlFor = input.id; form.appendChild(l);
    var w = el('span'); w.appendChild(input); if (unit){ var u = el('span', unit, 'u'); w.appendChild(u); } form.appendChild(w);
  }
  function num(id, val){ var i = el('input'); i.id = id; i.type = 'text'; i.inputMode = 'decimal'; i.value = val === null || val === undefined ? '' : libTrim(val); i.style.width = '80px'; return i; }
  box.appendChild(el('h4', 'Edit tool'));
  var g = el('div', undefined, 'libForm');
  var nm = el('input'); nm.id = 'ltName'; nm.type = 'text'; nm.value = d.name; nm.style.width = '200px'; field(g, 'Name', nm);
  var ty = el('select'); ty.id = 'ltType';
  Object.keys(TOOL_TYPES).forEach(function (k) { var o = el('option', TOOL_TYPES[k]); o.value = k; ty.appendChild(o); });
  ty.value = String(d.type); field(g, 'Type', ty);
  var un = el('select'); un.id = 'ltUnits'; [['mm', 'millimetres'], ['in', 'inches']].forEach(function (p) { var o = el('option', p[1]); o.value = p[0]; un.appendChild(o); });
  un.value = d.units; field(g, 'Units', un);
  var uu = d.units === 'in' ? 'in' : 'mm';
  field(g, 'Diameter', num('ltDia', d.diameter), uu);
  var vee = +d.type === 3 || +d.type === 4 || +d.type === 5;
  if (vee){ field(g, 'Angle', num('ltAng', d.angle), '\u00b0 included'); field(g, 'Flat tip', num('ltFlat', d.flat || 0), uu); }
  field(g, 'Flutes', num('ltFlutes', d.flutes));
  field(g, 'Tool number', num('ltNum', d.numbers[mid]), 'on ' + libMachineName(mid));
  var nt = el('textarea'); nt.id = 'ltNotes'; nt.rows = 2; nt.value = d.notes || ''; nt.style.width = '200px'; field(g, 'Notes', nt);
  box.appendChild(g);
  // feeds and speeds for the chosen material
  box.appendChild(el('h5', 'Feeds and speeds' + (mat ? ' for ' + libMaterialName(mat) : '') + ' on ' + libMachineName(mid)));
  if (!mat){
    box.appendChild(el('p', 'Choose a material above to set this tool\u2019s feeds and speeds for it. Each material keeps its own.', 'libNote'));
  } else {
    var c = libCutOf(d, mid, mat);
    if (!c){
      box.appendChild(el('p', 'No feeds and speeds for ' + libMaterialName(mat) + ' yet.', 'libNote'));
      var add = el('button', 'Add feeds for ' + libMaterialName(mat));
      add.addEventListener('click', function () {
        libReadDraft();
        var from = d.cuts.filter(function (x) { return x.machine === mid; })[0] || d.cuts[0];   // start from another material's, to adjust
        var nc = from ? JSON.parse(JSON.stringify(from)) : {rateUnits: d.units === 'in' ? 4 : 1, lengthUnits: d.units, feed: null, plunge: null, rpm: 18000, stepdown: null, stepover: null, notes: ''};
        nc.machine = mid; nc.material = mat;
        if (from) nc._from = libMaterialName(from.material) || 'another material';   // said once, so copied units aren't missed
        d.cuts.push(nc); libRender();
      });
      box.appendChild(add);
    } else {
      var f2 = el('div', undefined, 'libForm');
      var ru = el('select'); ru.id = 'lcRate'; [[1, 'mm/min'], [4, 'in/min']].forEach(function (p) { var o = el('option', p[1]); o.value = p[0]; ru.appendChild(o); });
      ru.value = String(c.rateUnits === 4 ? 4 : 1);
      var rl = RATE_UNITS[c.rateUnits === 4 ? 4 : 1], lu = c.lengthUnits === 'in' ? 'in' : 'mm';
      field(f2, 'Feed rate', num('lcFeed', c.feed), rl); field(f2, 'Plunge rate', num('lcPlunge', c.plunge), rl);
      field(f2, 'Rate units', ru);
      field(f2, 'Spindle speed', num('lcRpm', c.rpm), 'rpm');
      field(f2, 'Pass depth', num('lcDown', c.stepdown), lu); field(f2, 'Stepover', num('lcOver', c.stepover), lu);
      box.appendChild(f2);
      if (c._from) box.appendChild(el('p', 'Started from ' + c._from + '\u2019s feeds and speeds (rates in ' + RATE_UNITS[c.rateUnits === 4 ? 4 : 1] +
        ', sizes in ' + (c.lengthUnits === 'in' ? 'inches' : 'millimetres') + '). Adjust them for ' + libMaterialName(mat) + '.', 'libNote'));
      if (c.rateUnits !== 1 && c.rateUnits !== 4) box.appendChild(el('p', 'These rates were imported in unit code ' + c.rateUnits + '; saving stores them in the unit chosen here.', 'libNote'));
    }
  }
  var err = el('p', '', 'libErr'); err.id = 'ltErr'; box.appendChild(err);
  var acts = el('div', undefined, 'libActs');
  var save = el('button', 'Save'); save.className = 'primary';
  save.addEventListener('click', libSaveDraft);
  var cancel = el('button', 'Cancel');
  cancel.addEventListener('click', function () { LIBUI.edit = null; LIBUI.draft = null; libRender(); });
  acts.appendChild(save); acts.appendChild(cancel); box.appendChild(acts);
  box.appendChild(el('p', 'Toolpaths already made keep their own feeds and speeds until you choose the tool for them again.', 'libNote'));
  // changing type or units re-draws the form (units convert the sizes, so the tool stays the same size)
  ty.addEventListener('change', function () { libReadDraft(); d.type = +ty.value; d.typeName = TOOL_TYPES[d.type]; libRender(); });
  un.addEventListener('change', function () {
    libReadDraft();
    var k = un.value === 'in' ? 1 / 25.4 : 25.4;
    if (un.value !== d.units){ ['diameter', 'flat', 'tipRadius', 'fluteLength'].forEach(function (f) { if (d[f]) d[f] = +(d[f] * k).toFixed(5); }); d.units = un.value; }
    libRender();
  });
}
// read the form into the draft (so re-drawing it for a type or unit change loses nothing)
function libReadDraft(){
  var d = LIBUI.draft; if (!d) return;
  var v = function (id) { var e = document.getElementById(id); return e ? e.value : undefined; };
  var nv = function (id) { var t = v(id); return t === undefined || String(t).trim() === '' ? null : parseFloat(t); };
  if (v('ltName') !== undefined) d.name = v('ltName').trim();
  if (v('ltDia') !== undefined) d.diameter = nv('ltDia');
  if (v('ltAng') !== undefined) d.angle = nv('ltAng');
  if (v('ltFlat') !== undefined) d.flat = nv('ltFlat');
  if (v('ltFlutes') !== undefined) d.flutes = nv('ltFlutes');
  if (v('ltNotes') !== undefined) d.notes = v('ltNotes');
  var mid = libDefaultMachine(), n = nv('ltNum');
  if (v('ltNum') !== undefined){ if (n === null) delete d.numbers[mid]; else d.numbers[mid] = Math.round(n); }
  var mat = document.getElementById('libMaterial').value || '', c = mat ? libCutOf(d, mid, mat) : null;
  if (c && v('lcFeed') !== undefined){
    c.feed = nv('lcFeed'); c.plunge = nv('lcPlunge'); c.rpm = nv('lcRpm'); c.stepdown = nv('lcDown'); c.stepover = nv('lcOver');
    c.rateUnits = +v('lcRate'); c.lengthUnits = d.units;
  }
}
function libSaveDraft(){
  libReadDraft();
  var d = LIBUI.draft, err = document.getElementById('ltErr');
  var bad = !(d.diameter > 0) ? 'The diameter has to be more than zero.'
          : ((d.type === 3 || d.type === 4 || d.type === 5) && !(d.angle > 0 && d.angle < 180)) ? 'A V-bit needs its included angle, between 0 and 180 degrees.'
          : d.cuts.some(function (c) { return (c.feed !== null && !(c.feed > 0)) || (c.plunge !== null && !(c.plunge > 0)) || (c.stepdown !== null && !(c.stepdown > 0)); })
            ? 'Feeds, plunge and pass depth have to be more than zero (or left empty).' : '';
  if (bad){ err.textContent = bad; return; }
  var orig = libTool(d.id);
  if (!d.name || (orig && d.name === orig.name && d.fmt)) d.name = d.fmt ? libRenderName(d.fmt, d) : (d.name || libAutoName(d));
  else d.fmt = '';                                             // a name you typed is kept as typed
  d.typeName = TOOL_TYPES[d.type] || d.typeName;
  d.cuts.forEach(function (c) { delete c._from; });
  var i = TOOLLIB.tools.indexOf(orig); if (i >= 0) TOOLLIB.tools[i] = d; else TOOLLIB.tools.push(d);
  LIBUI.edit = null; LIBUI.draft = null;
  libCommit('Saved ' + d.name);
}
function libRenderDetail(mid){
  var box = document.getElementById('libDetail'), t = LIBUI.sel ? libTool(LIBUI.sel) : null;
  box.innerHTML = '';
  if (!t){ var p0 = document.createElement('p'); p0.style.color = 'var(--muted)'; p0.textContent = 'Pick a tool to see its details, tool numbers, and feeds and speeds.'; box.appendChild(p0); return; }
  if (LIBUI.edit === t.id){ libRenderEditor(box, t, mid); return; }
  function el(tag, txt, cls){ var e = document.createElement(tag); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e; }
  box.appendChild(el('h4', t.name));
  var acts = el('div', undefined, 'libActs');
  [['Edit', function () { LIBUI.edit = t.id; LIBUI.draft = null; libRender(); }], ['Duplicate', function () { libDuplicate(t); }], ['Delete', function () { libDelete(t); }]]
    .forEach(function (a) { var b = el('button', a[0]); b.addEventListener('click', a[1]); acts.appendChild(b); });
  box.appendChild(acts);
  box.appendChild(el('div', t.typeName + ' \u00b7 ' + (t.units === 'in' ? 'inches' : 'millimetres'), 'libType'));
  var u = t.units === 'in' ? ' in' : ' mm', dl = el('dl');
  function row(k, v){ if (v === null || v === undefined || v === '') return; dl.appendChild(el('dt', k)); dl.appendChild(el('dd', v)); }
  row('Diameter', t.diameter !== null ? libTrim(t.diameter) + u : null);
  if (t.angle !== null && t.angle !== undefined) row(t.type === 4 ? 'Side angle' : 'Angle', libTrim(t.angle, 2) + '\u00b0');
  if (t.flat) row(t.type === 4 ? 'Tip' : 'Flat diameter', libTrim(t.flat) + u);
  if (t.tipRadius) row('Tip radius', libTrim(t.tipRadius) + u);
  row('Flutes', t.flutes);
  if (t.fluteLength) row('Flute length', libTrim(t.fluteLength) + u);
  if (t.notes) row('Notes', t.notes);
  box.appendChild(el('h5', 'Geometry')); box.appendChild(dl);
  box.appendChild(el('h5', 'Tool numbers'));
  var nums = el('dl'), any = false;
  TOOLLIB.machines.forEach(function(m){ if (t.numbers[m.id] !== undefined){ any = true; nums.appendChild(el('dt', m.name)); nums.appendChild(el('dd', 'T' + t.numbers[m.id])); } });
  box.appendChild(any ? nums : el('p', 'No tool number on any machine.'));
  box.appendChild(el('h5', 'Feeds and speeds \u2014 ' + libMachineName(mid)));
  var cuts = t.cuts.filter(function(c){ return c.machine === mid; });
  if (!cuts.length){ box.appendChild(el('p', 'No feeds and speeds for this machine yet: choose a material above, then Edit.')); return; }
  var tb = el('table'), hr = el('tr');
  ['Material', 'Feed', 'Plunge', 'Spindle', 'Stepdown', 'Stepover'].forEach(function(h){ hr.appendChild(el('th', h)); });
  tb.appendChild(hr);
  var matSel = document.getElementById('libMaterial').value;
  cuts.forEach(function(c){
    var ru = RATE_UNITS[c.rateUnits] || ('code ' + c.rateUnits), lu = c.lengthUnits === 'in' ? ' in' : ' mm';
    var tr = el('tr');
    if (matSel && c.material === matSel) tr.className = 'on';
    [libMaterialName(c.material) || 'Any',
     c.feed !== null ? libTrim(c.feed, 2) + ' ' + ru : '\u2014',
     c.plunge !== null ? libTrim(c.plunge, 2) + ' ' + ru : '\u2014',
     c.rpm !== null ? c.rpm + ' rpm' : '\u2014',
     c.stepdown !== null ? libTrim(c.stepdown) + lu : '\u2014',
     c.stepover !== null ? libTrim(c.stepover) + lu : '\u2014'].forEach(function(v){ tr.appendChild(el('td', v)); });
    tb.appendChild(tr);
  });
  box.appendChild(tb);
}
function libImportFile(f){
  var btn = document.getElementById('libImport');
  btn.disabled = true; btn.textContent = 'Reading\u2026';
  function done(){ btn.disabled = false; btn.textContent = 'Import VCarve library\u2026'; }
  var rd = new FileReader();
  rd.onload = function(){
    var bytes = new Uint8Array(rd.result);
    var head = String.fromCharCode.apply(null, bytes.subarray(0, 15));
    if (head !== 'SQLite format 3'){ done(); toast('err', 'That isn\u2019t a VCarve tool library', 'Pick the tools.vtdb file from VCarve\u2019s ToolDatabase folder.'); return; }
    libLoadSql().then(function(SQL){
      var lib = libFromVtdb(new SQL.Database(bytes), f.name);
      var saveIt = function(){
        return libSave(lib).then(function(){
          TOOLLIB = lib; LIBUI.sel = null; LIBUI.q = ''; document.getElementById('libSearch').value = '';
          done(); libRender(); renderToolpathPanel();
          toast('ok', 'Tool library imported', lib.tools.length + ' tools, ' + lib.machines.length + (lib.machines.length === 1 ? ' machine' : ' machines') + ' and ' +
                lib.materials.length + (lib.materials.length === 1 ? ' material' : ' materials') + ' from ' + f.name + '.');
        });
      };
      if (TOOLLIB && TOOLLIB.tools.length){
        return uiDialog({title:'Replace your tool library?',
                         body:'You have ' + TOOLLIB.tools.length + ' tools from ' + TOOLLIB.source.file + '. Importing ' + f.name +
                              ' with ' + lib.tools.length + ' tools replaces them in this browser. Your VCarve files are not touched.',
                         ok:'Replace', danger:true}).then(function(go){
          if (!go){ done(); return; }
          return saveIt();
        });
      }
      return saveIt();
    }).catch(function(err){
      done();
      toast('err', 'Couldn\u2019t import that library', (err && err.message ? err.message.charAt(0).toUpperCase() + err.message.slice(1) : 'Unknown error') +
            '. Reading a library needs an internet connection the first time.');
    });
  };
  rd.readAsArrayBuffer(f);
}

