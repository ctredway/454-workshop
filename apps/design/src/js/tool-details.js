var TD = null;
function openToolDetails(ctx){
  TD = ctx;
  var pt = ctx.ptool || {}, mid = ctx.machineId, mat = ctx.materialId;
  var mr = TOOLLIB ? libMatch(pt, mid) : {status:'nolib'}, lt = mr.tool || null;
  function el(tag, txt, cls){ var e = document.createElement(tag); if (txt !== undefined && txt !== null) e.textContent = txt; if (cls) e.className = cls; return e; }
  document.getElementById('tdTitle').textContent = pt.name || 'Tool';
  document.getElementById('tdSub').textContent = 'T' + pt.num + (ctx.usedBy && ctx.usedBy.length
    ? ' \u00b7 used by ' + ctx.usedBy.map(function(u){ return u.name; }).join(', ') : '');
  var body = document.getElementById('tdBody');
  body.innerHTML = '';
  // --- project vs library ---
  body.appendChild(el('h5', 'In this project and in your library'));
  var tb = el('table'), hr = el('tr');
  ['', 'Project', 'Tool library'].forEach(function(h){ hr.appendChild(el('th', h)); });
  tb.appendChild(hr);
  function cmp(label, pv, lv, state){
    var tr = el('tr'); tr.appendChild(el('td', label));
    tr.appendChild(el('td', pv)); tr.appendChild(el('td', lv, state || ''));
    tb.appendChild(tr);
  }
  var libName = !TOOLLIB ? 'no library imported' : lt ? lt.name : 'not in your library';
  cmp('Name', pt.name || '\u2014', libName, lt ? 'ok' : (TOOLLIB ? 'warn' : ''));
  var ln = lt ? lt.numbers[mid] : undefined;
  cmp('Tool number', 'T' + pt.num,
      !lt ? '\u2014' : ln === undefined ? 'none on this machine' : 'T' + ln + (ln === pt.num ? '  \u2713' : '  \u2260'),
      !lt ? '' : ln === pt.num ? 'ok' : 'warn');
  var cut = lt && mat ? libCutFor(lt, mid, mat) : null;
  cmp('Spindle speed', pt.rpm ? pt.rpm + ' rpm' : '\u2014',
      cut && cut.rpm !== null ? cut.rpm + ' rpm' + (pt.rpm === cut.rpm ? '  \u2713' : '  \u2260') : '\u2014',
      cut && cut.rpm !== null ? (pt.rpm === cut.rpm ? 'ok' : 'warn') : '');
  body.appendChild(tb);
  if (TOOLLIB){                                   // machine and material only mean something with a library
    body.appendChild(el('p', 'Machine: ' + (libMachineName(mid) || '\u2014') + (ctx.machineFromProject ? ' (from the project)' : ' (your library\u2019s choice)') +
      ' \u00b7 Material: ' + (mat ? libMaterialName(mat) + ' (from the project)' : 'not recorded in a way your library recognizes'), 'tdNote'));
  }
  if (!TOOLLIB){
    body.appendChild(el('p', 'Import your VCarve tool library to see this bit\u2019s shape and feeds and speeds here.', 'tdNote'));
  } else if (!lt){
    body.appendChild(el('p', 'This bit isn\u2019t in your tool library, so its shape and cutting values can\u2019t be shown. The project keeps its own copy of them, in a form 454 can\u2019t read yet.', 'tdNote'));
  }
  // --- geometry ---
  if (lt){
    body.appendChild(el('h5', 'Shape'));
    var u = lt.units === 'in' ? ' in' : ' mm', dl = el('dl');
    function row(k, v){ if (v === null || v === undefined || v === '') return; dl.appendChild(el('dt', k)); dl.appendChild(el('dd', v)); }
    row('Type', lt.typeName);
    row('Diameter', lt.diameter !== null ? libTrim(lt.diameter) + u : null);
    if (lt.angle !== null && lt.angle !== undefined) row(lt.type === 4 ? 'Side angle' : 'Angle', libTrim(lt.angle, 2) + '\u00b0');
    if (lt.flat) row(lt.type === 4 ? 'Tip' : 'Flat diameter', libTrim(lt.flat) + u);
    if (lt.tipRadius) row('Tip radius', libTrim(lt.tipRadius) + u);
    row('Flutes', lt.flutes);
    if (lt.fluteLength) row('Flute length', libTrim(lt.fluteLength) + u);
    if (lt.notes) row('Notes', lt.notes);
    body.appendChild(dl);
    // --- feeds and speeds ---
    body.appendChild(el('h5', 'Feeds and speeds \u2014 ' + libMachineName(mid)));
    var cuts = lt.cuts.filter(function(c){ return c.machine === mid; });
    if (!cuts.length) body.appendChild(el('p', 'Your library has no cutting data for this bit on this machine.', 'tdNote'));
    else {
      var ft = el('table'), fh = el('tr');
      ['Material', 'Feed', 'Plunge', 'Spindle', 'Stepdown', 'Stepover'].forEach(function(h){ fh.appendChild(el('th', h)); });
      ft.appendChild(fh);
      cuts.forEach(function(c){
        var ru = RATE_UNITS[c.rateUnits] || ('code ' + c.rateUnits), lu = c.lengthUnits === 'in' ? ' in' : ' mm', tr = el('tr');
        if (mat && c.material === mat) tr.className = 'on';
        [libMaterialName(c.material) || 'Any',
         c.feed !== null ? libTrim(c.feed, 2) + ' ' + ru : '\u2014',
         c.plunge !== null ? libTrim(c.plunge, 2) + ' ' + ru : '\u2014',
         c.rpm !== null ? c.rpm + ' rpm' : '\u2014',
         c.stepdown !== null ? libTrim(c.stepdown) + lu : '\u2014',
         c.stepover !== null ? libTrim(c.stepover) + lu : '\u2014'].forEach(function(v){ tr.appendChild(el('td', v)); });
        ft.appendChild(tr);
      });
      body.appendChild(ft);
      if (mat) body.appendChild(el('p', 'The highlighted row is the project\u2019s material.', 'tdNote'));
    }
  }
  // --- where it's used ---
  if (ctx.usedBy && ctx.usedBy.length){
    body.appendChild(el('h5', 'Used in this project by'));
    var ul = el('dl');
    ctx.usedBy.forEach(function(ub){ ul.appendChild(el('dt', ub.name)); ul.appendChild(el('dd', ub.type)); });
    body.appendChild(ul);
  }
  var lb = document.getElementById('tdLib');
  lb.style.display = lt ? '' : 'none';
  document.getElementById('toolModal').hidden = false;
  document.getElementById('tdDone').focus();
}
function closeToolDetails(){ document.getElementById('toolModal').hidden = true; TD = null; }
// open the details for one toolpath's tool, with everything the project knows about it
function openToolDetailsFor(tp){
  var list = DOC.vcToolpaths || [];
  var fromProj = !!(TOOLLIB && tp.machineId && libMachineName(tp.machineId));
  var usedBy = list.filter(function(o){ return o.tool && tp.tool && o.tool.num === tp.tool.num && o.tool.name === tp.tool.name; })
                   .map(function(o){ return {name:o.name, type:o.type === 'Toolpath' ? 'toolpath' : o.type}; });
  openToolDetails({ptool:tp.tool, machineId: fromProj ? tp.machineId : (TOOLLIB ? libDefaultMachine() : null),
                   machineFromProject: fromProj,
                   materialId: TOOLLIB && tp.materialId && libMaterialName(tp.materialId) ? tp.materialId : null,
                   usedBy: usedBy});
}

