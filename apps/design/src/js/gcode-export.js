// G-code for every toolpath, in order: one file, or, for a job with more than one bit, one file per bit if asked
function tpExport(checked){
  if (checked !== true){ tpDepthGate('Save anyway', function () { tpExport(true); }); return; }   // past the material? ask first
  var j = tpJob();
  if (!j) return;
  var files = tpBitFiles(j);
  if (files.length < 2){ gcodeSave(j.gc, j.base + '.nc', j.said); return; }
  uiDialog({title: 'One file, or one per bit?',
            body: 'This job uses more than one bit. Save it as:\n\n' +
                  '• One file: 454 Control stops at each bit change and tells you which bit to fit.\n' +
                  '• One file per bit, ' + files.length + ' files, run in this order:\n' +
                  files.map(function (f) { return '    ' + f.name; }).join('\n'),
            ok: 'One file', alt: 'One file per bit'}).then(function (v) {
    if (v === 'alt') gcodeSaveMany(files, j.said);
    else if (v) gcodeSave(j.gc, j.base + '.nc', j.said);
  });
}
// Before anything leaves Design (Save G-code, Preview in 454 Control): any toolpath that goes past the bottom of
// the material is listed, and nothing happens unless the person says so. If the material's thickness isn't set,
// depths can't be checked, and it says that instead. go() runs once it's clear, or when they choose `anyway`.
function tpDepthGate(anyway, go){
  if (!camReady()){ go(); return; }
  var chosen = tpList().filter(function (tp) { return !tp.exclude && (!multiSheet() || tpSheetOf(tp) === DOC.activeSheet); });
  var broken = chosen.filter(function (tp) { return tpExprProblem(tp); });
  if (broken.length){
    uiDialog({title: 'Parameters can’t be worked out', note: true,
              body: broken.map(function (tp) { return '• ' + tp.name + ': ' + tpExprProblem(tp) + '.'; }).join('\n') +
                    '\n\nNothing was saved. Put the parameter right (in fx), or edit the toolpath and type a number.'});
    return;
  }
  var past = chosen.filter(function (tp) { return tpPastNow(tp); });
  var unchecked = tpDepthUnchecked() ? chosen.filter(function (tp) { return !tp.through; }) : [];
  if (!past.length && !unchecked.length){ go(); return; }
  var body = past.length
    ? (past.length === 1 ? 'This toolpath goes' : 'These toolpaths go') + ' past the bottom of the material:\n\n' +
      past.map(function (tp) { return '• ' + tp.name + ' ' + tpPastSay(tp) + '.'; }).join('\n') +
      '\n\nCutting into the spoilboard is sometimes meant. If it isn’t, change the depth (or the material’s thickness in Settings) first.'
    : 'The material’s thickness isn’t set, so these depths can’t be checked against it:\n\n' +
      unchecked.map(function (tp) { return '• ' + tp.name + ', ' + fmtDisp(tpDepth(tp)) + ' ' + unitTag() + ' deep'; }).join('\n') +
      '\n\nSet the thickness in Settings to have them checked.';
  uiDialog({title: past.length ? 'Cutting past the material' : 'Depths not checked', body: body, ok: anyway, danger: !!past.length})
    .then(function (ok) { if (ok) go(); });
}
// The job split where the bit changes, in cutting order: a bit used again later gets another file, so nothing is
// cut out of order (a profile that frees a part mustn't move ahead of carving on it). Each file is a whole job
// for its bit, and its notes say which file of how many it is. Named "<job> - 2 of 3 - T2 <bit>.nc".
function tpBitFiles(j){
  var runs = [];
  j.parts.forEach(function (p) {
    var last = runs[runs.length - 1];
    if (last && last.tool === p.tool) last.parts.push(p); else runs.push({tool: p.tool, toolName: p.toolName, parts: [p]});
  });
  if (runs.length < 2) return [{name: j.base + '.nc', gc: j.gc}];
  var safe = function (s) { return String(s).replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); };   // what Windows allows in a name
  return runs.map(function (r, i) {
    var said = 'File ' + (i + 1) + ' of ' + runs.length + ': T' + r.tool + ', ' + r.toolName + ' (' + r.parts.map(function (p) { return p.name; }).join(', ') + '). Run the files in order.';
    return {name: safe(j.base + ' - ' + (i + 1) + ' of ' + runs.length + ' - T' + r.tool + ' ' + r.toolName) + '.nc', tool: r.tool, toolName: r.toolName,
            toolpaths: r.parts.map(function (p) { return p.name; }),
            gc: Cam.toGcodeJob(r.parts, {safeZ: j.safeZ, notes: [j.notes[0], said].concat(j.notes.slice(1))})};
  });
}
// The job's G-code, exactly as Save G-code writes it, after the same checks; null if something needs
// fixing first (the checks say what).
function tpJob(){
  if (!camReady() || !tpList().length) return null;
  var toolNumber = toolNumbering();              // the same numbers the job sheet shows
  var chosen = tpList().filter(function (tp) { return !tp.exclude && (!multiSheet() || tpSheetOf(tp) === DOC.activeSheet); });   // one sheet per file
  var noTool = chosen.filter(function (tp) { return !tpToolChosen(tp); });
  if (noTool.length){
    uiDialog({title: 'Choose a tool first',
              body: noTool.map(function (tp) { return '\u2022 ' + tp.name; }).join('\n') + '\n\n' +
                    (noTool.length === 1 ? 'This toolpath has' : 'These toolpaths have') + ' no tool chosen, so the G-code would be cut for a size nobody picked. ' +
                    'Open ' + (noTool.length === 1 ? 'it' : 'each') + ' with Edit and choose the tool from the library, or type its diameter.',
              note: true});
    return null;
  }
  var blind = chosen.filter(function (tp) { return tp.through && !(DOC.stock.t > 0); });
  if (blind.length){
    uiDialog({title: 'Set the material thickness first',
              body: blind.map(function (tp) { return '\u2022 ' + tp.name; }).join('\n') + '\n\n' +
                    (blind.length === 1 ? 'This toolpath is' : 'These toolpaths are') + ' set to cut through the material, but its thickness isn\u2019t set, ' +
                    'so ' + (blind.length === 1 ? 'it' : 'they') + ' would cut only the ' + fmtDisp(blind[0].over === undefined ? 0.2 : blind[0].over) + ' ' + unitTag() + ' overcut.\n\n' +
                    'Measure the material and enter its thickness in Settings, then save again.',
              ok: 'Open Settings', cancel: 'Cancel'}).then(function (go) { if (go) openSettings(); });
    return null;
  }
  if (!chosen.length){
    toast('info', 'Nothing to save', 'Every toolpath is unticked. Tick the ones to include in the G-code.');
    return null;
  }
  var parts = chosen.map(function (tp) {
    if (tpStale(tp)) tpGenerate(tp);
    var t = tp.toolId ? libTool(tp.toolId) : null;
    return {moves: tp.moves, name: tp.name, tool: toolNumber(tp), rpm: tp.rpm || 18000,
            toolName: t ? t.name : fmtDisp(tp.dia) + ' ' + unitTag() + (tp.side === 'drill' ? ' drill' : ' cutter')};
  });
  var notes = ['BETA: made with 454 Design\'s toolpaths, which are in beta. Preview this job in 454 Control and run it in the air before cutting material.'];
  if (DOC.stock.t > 0) notes.push('Material: ' + DOC.stock.t.toFixed(2) + ' mm thick');
  notes.push('Z zero: ' + (DOC.stock.zero === 'bottom' ? 'spoilboard, under the material' : 'top of the material'));
  notes.push('XY zero: ' + ORIGIN_NAMES[originKey()] + ' of the material');
  var safeZ = tpSurface() + 6, gc = Cam.toGcodeJob(parts, {safeZ: safeZ, notes: notes});
  var base = (DOC.name || UICFG.lastGcodeName || 'toolpaths').replace(/\.(nc|gcode|tap|ngc)$/i, '');
  if (multiSheet()) base += ' - ' + layerById(DOC.activeSheet).name;       // one file per sheet, named for it
  var tools = {}; parts.forEach(function (p) { tools[p.tool] = 1; });
  var nt = Object.keys(tools).length;
  var total = multiSheet() ? tpList().filter(function (tp) { return tpSheetOf(tp) === DOC.activeSheet; }).length : tpList().length;
  var said = (parts.length < total ? parts.length + ' of ' + total : parts.length) +
             (parts.length === 1 && parts.length === total ? ' toolpath' : ' toolpaths') + (nt > 1 ? ' with ' + nt + ' tools' : '');
  return {gc: gc, base: base, said: said, parts: parts, notes: notes, safeZ: safeZ};
}
// Save with a real Save As dialog where the browser allows it (Chrome and Edge): the person
// picks the folder and the name, and the browser starts in the same folder next time.
// Elsewhere it falls back to a download, which lands wherever downloads go.
function gcodeSave(text, suggested, said){
  if (window.showSaveFilePicker){
    window.showSaveFilePicker({
      id: 'gcode',                                   // remembers the folder between saves
      suggestedName: suggested,
      types: [{description: 'G-code', accept: {'text/plain': ['.nc', '.gcode', '.tap', '.ngc']}}]
    }).then(function (handle) {
      return handle.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      }).then(function () {
        UICFG.lastGcodeName = handle.name; uiCfgSave();
        toast('ok', 'G-code saved', said + ' written to ' + handle.name + '. Open it in 454 Control to check and run it.');
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;  // they cancelled: nothing to say
      toast('err', 'Couldn\u2019t save the G-code', (err && err.message) || 'The browser refused to write the file.');
    });
    return;
  }
  var blob = new Blob([text], {type: 'text/plain'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('ok', 'G-code downloaded', said + ' saved as ' + suggested + ' in your downloads folder. Chrome or Edge would let you choose where.');
}
// Several files into one folder the person picks, asking before replacing any already there. Where the browser
// can't pick a folder, each is downloaded.
function gcodeSaveMany(files, said){
  if (window.showDirectoryPicker){
    var dir;
    window.showDirectoryPicker({id: 'gcode', mode: 'readwrite'}).then(function (d) {
      dir = d;
      return Promise.all(files.map(function (f) {
        return dir.getFileHandle(f.name).then(function () { return f.name; }, function () { return null; });   // already there?
      }));
    }).then(function (there) {
      there = there.filter(Boolean);
      if (!there.length) return true;
      return uiDialog({title: 'Replace ' + (there.length === 1 ? 'a file' : there.length + ' files') + '?',
                       body: 'This folder already has:\n\n' + there.map(function (n) { return '• ' + n; }).join('\n') + '\n\nReplace ' + (there.length === 1 ? 'it' : 'them') + ' with the new G-code?',
                       ok: 'Replace', danger: true});
    }).then(function (go) {
      if (!go) return;
      return files.reduce(function (p, f) {
        return p.then(function () { return dir.getFileHandle(f.name, {create: true}); })
                .then(function (h) { return h.createWritable(); })
                .then(function (w) { return w.write(f.gc).then(function () { return w.close(); }); });
      }, Promise.resolve()).then(function () {
        toast('ok', files.length + ' G-code files saved', said + ', one file per bit, in ' + dir.name + '. Run them in order: ' + files[0].name + ' first.');
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      toast('err', 'Couldn’t save the G-code', (err && err.message) || 'The browser refused to write the files.');
    });
    return;
  }
  files.forEach(function (f, i) {
    setTimeout(function () {
      var a = document.createElement('a'), blob = new Blob([f.gc], {type: 'text/plain'});
      a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, i * 400);                                               // one at a time: browsers drop downloads started together
  });
  toast('ok', files.length + ' G-code files downloaded', said + ', one file per bit, in your downloads folder. If the browser asks, allow it to download several files.');
}





