// Toolpath templates: a job's toolpaths saved to a file without their shapes (tools, depths, passes, feeds, tabs,
// ramps, finishing, order), and applied to another drawing, each toolpath finding its shapes by the name of the
// layer they were on. So a sign drawn with its lettering on "Carve" and its outline on "Cut out" gets the same
// toolpaths in one step. A file is plain JSON, sizes in mm:
//   {kind: '454-toolpath-template', version: 1, design: '0.108.0', toolpaths: [{layers: ['Cut out'], ...settings}]}
var TPL_KIND = '454-toolpath-template';
// What a template doesn't keep: which shapes, where the tabs sat on them, and everything worked out from them
var TPL_DROP = ['id', 'ents', 'tabPts', 'startPts', 'past', 'moves', 'sheet', 'sig', 'warning', 'rasterLines', 'vcNote', 'vcFlat', 'vcDepth',
                'rings', 'restRuns', 'islands', 'holes', 'foundBy', 'hidden', 'vcFrom', 'restFrom'];

// The template for the toolpaths on this sheet: each one's settings and the names of its shapes' layers
function tplMake(){
  var list = tpList().filter(function (tp) { return !tp.vcFrom && (!multiSheet() || tpSheetOf(tp) === DOC.activeSheet); });
  return {kind: TPL_KIND, version: 1, design: DESIGN_VERSION, toolpaths: list.map(function (tp) {
    var t = {}, names = [];
    Object.keys(tp).forEach(function (k) { if (TPL_DROP.indexOf(k) < 0 && k.charAt(0) !== '_' && tp[k] !== undefined) t[k] = JSON.parse(JSON.stringify(tp[k])); });
    tp.ents.forEach(function (id) { var e = entById(id), L = e && layerById(e.layer); if (L && names.indexOf(L.name) < 0) names.push(L.name); });
    t.layers = names;
    var src = tpRestSource(tp);                                // a clean-up follows a pocket: by its place in the template
    if (src && list.indexOf(src) >= 0) t.restAfter = list.indexOf(src);
    return t;
  })};
}
// What applying would do, before anything changes: for each template toolpath, the shapes it would cut (on the
// layers of the same names) or why it can't be made here.
function tplPlan(tpl){
  if (!tpl || tpl.kind !== TPL_KIND || !Array.isArray(tpl.toolpaths)) return null;
  var plan = tpl.toolpaths.map(function (t) {
    var names = Array.isArray(t.layers) ? t.layers : [], ents = [];
    DOC.ents.forEach(function (e) {
      var L = layerById(e.layer);
      if (L && names.indexOf(L.name) >= 0 && !e.con && !e.tp) ents.push(entId(e));
    });
    var skip = !(t.dia > 0) ? 'no bit size in the template'
             : !names.length ? 'no layer named in the template'
             : !ents.length ? 'no shapes on ' + names.map(function (n) { return '“' + n + '”'; }).join(' or ')
             : '';
    return {t: t, ents: ents, layers: names, skip: skip};
  });
  plan.forEach(function (p) {                                  // a clean-up without the pocket it follows is no use
    if (!p.skip && p.t.restAfter !== undefined){
      var src = plan[p.t.restAfter];
      if (!src || src.skip) p.skip = 'it cleans up after ' + (src ? '“' + src.t.name + '”, which can’t be made' : 'a pocket that isn’t in the template');
    }
  });
  return plan;
}
// Make the planned toolpaths, after the ones already there, in the template's order. Returns those made.
function tplMakeToolpaths(plan){
  var made = [], ids = [];
  pushUndo();
  plan.forEach(function (p, i) {
    if (p.skip){ ids.push(null); return; }
    var tp = JSON.parse(JSON.stringify(p.t));
    delete tp.layers; delete tp.restAfter;
    tp.id = tpNewId(); tp.ents = p.ents.slice(); tp.tabPts = {}; tp.hidden = false;
    tp.toolChosen = true;                                      // chosen when the template was made
    if (tp.toolId && !libTool(tp.toolId)) delete tp.toolId;    // not in this library: the size alone
    if (p.t.restAfter !== undefined) tp.restFrom = ids[p.t.restAfter];
    if (tp.tabsOn){ tpAddEvenTabs(tp, tp.tabCount || 4); tp.tabsOn = tpTabTotal(tp) > 0; }
    if (multiSheet()){ var e0 = entById(tp.ents[0]); tp.sheet = e0 && e0.layer ? e0.layer : DOC.activeSheet; }
    tpGenerate(tp);
    tpList().push(tp); made.push(tp); ids.push(tp.id);
  });
  tpParamsApply();                                            // their parameters, as this drawing has them
  persist();
  renderToolpathPanel();
  return made;
}

// Save template…: the toolpaths to a file
function tplSave(){
  var tpl = tplMake();
  if (!tpl.toolpaths.length){ toast('info', 'No toolpaths to save', 'Make the toolpaths first, then save them as a template.'); return; }
  var text = JSON.stringify(tpl, null, 1) + '\n', base = (DOC.name || 'toolpaths').replace(/\.(454\.json|json|crv|dxf|svg)$/i, '');
  var n = tpl.toolpaths.length, said = n + (n === 1 ? ' toolpath' : ' toolpaths');
  var name = base + ' template.json';
  if (window.showSaveFilePicker){
    window.showSaveFilePicker({id: 'template', suggestedName: name, types: [{description: 'Toolpath template', accept: {'application/json': ['.json']}}]})
      .then(function (h) { return h.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); }).then(function () {
        toast('ok', 'Template saved', said + ' written to ' + h.name + '. Apply template… makes them in another drawing, on the layers of the same names.'); }); })
      .catch(function (err) { if (err && err.name === 'AbortError') return; toast('err', 'Couldn’t save the template', (err && err.message) || ''); });
    return;
  }
  var blob = new Blob([text], {type: 'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('ok', 'Template downloaded', said + ', saved as ' + name + '.');
}
// Apply template…: pick the file, say what it will make, then make it
function tplOpen(){
  if (window.showOpenFilePicker){
    window.showOpenFilePicker({id: 'template', types: [{description: 'Toolpath template', accept: {'application/json': ['.json']}}]})
      .then(function (hs) { return hs[0].getFile(); })
      .then(function (f) { return f.text().then(function (t) { tplApplyText(t, f.name); }); })
      .catch(function (err) { if (err && err.name === 'AbortError') return; toast('err', 'Couldn’t open the template', (err && err.message) || ''); });
    return;
  }
  document.getElementById('tplFile').click();
}
function tplApplyText(text, fileName){
  var tpl = null;
  try { tpl = JSON.parse(text); } catch (e) {}
  var plan = tplPlan(tpl);
  if (!plan){ toast('err', 'That isn’t a toolpath template', (fileName || 'The file') + ' wasn’t saved by Save template… in 454 Design.'); return Promise.resolve([]); }
  var ok = plan.filter(function (p) { return !p.skip; });
  var lines = plan.map(function (p) {
    return (p.skip ? '✗ ' : '✓ ') + p.t.name + ', ' + fmtDisp(p.t.dia) + ' ' + unitTag() + ' bit: ' +
           (p.skip ? 'not made, ' + p.skip : p.ents.length + (p.ents.length === 1 ? ' shape' : ' shapes') + ' on ' + p.layers.map(function (n) { return '“' + n + '”'; }).join(', '));
  });
  if (!ok.length){
    return uiDialog({title: 'Nothing to make', body: lines.join('\n') + '\n\nEach toolpath finds its shapes by the name of their layer. Put the shapes on layers with these names, then apply the template again.', note: true}).then(function () { return []; });
  }
  return uiDialog({title: 'Apply ' + (fileName || 'the template') + '?',
                   body: lines.join('\n') + '\n\nThey’re added after any toolpaths already here, with tabs spaced evenly. Check each one before cutting: depths that cut through use this drawing’s material thickness.',
                   ok: 'Make ' + ok.length + (ok.length === 1 ? ' toolpath' : ' toolpaths')}).then(function (go) {
    if (!go) return [];
    var made = tplMakeToolpaths(plan);
    toast('ok', 'Template applied', made.length + (made.length === 1 ? ' toolpath' : ' toolpaths') + ' made' + (made.length < plan.length ? ', ' + (plan.length - made.length) + ' skipped' : '') + '.');
    return made;
  });
}
function tplWire(){
  var inp = document.getElementById('tplFile');
  inp.addEventListener('change', function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { tplApplyText(String(r.result), f.name); };
    r.readAsText(f); inp.value = '';
  });
}

// The Save template… and Apply template… buttons, under the toolpaths: drawn whether or not there are any yet,
// since a new drawing with none is where a template is applied
function tplButtons(){
  var box = document.getElementById('tpList');
  if (!box || !camReady()) return;
  var onSheet = multiSheet() ? tpList().filter(function (t2) { return tpSheetOf(t2) === DOC.activeSheet; }) : tpList();
  var tr = document.createElement('div');
  tr.style.cssText = 'display:flex;gap:8px;margin:0 10px 10px';
  var ts = document.createElement('button');
  ts.id = 'tplSaveBtn'; ts.textContent = 'Save template…'; ts.style.flex = '1';
  ts.title = 'Save these toolpaths’ settings (bits, depths, feeds, tabs, order) to a file, to make the same toolpaths in another drawing';
  ts.disabled = !onSheet.length;
  ts.addEventListener('click', tplSave);
  var ta = document.createElement('button');
  ta.id = 'tplApplyBtn'; ta.textContent = 'Apply template…'; ta.style.flex = '1';
  ta.title = 'Make toolpaths from a template: each one cuts the shapes on the layer of the same name as when it was saved';
  ta.addEventListener('click', tplOpen);
  tr.appendChild(ts); tr.appendChild(ta); box.appendChild(tr);
}
