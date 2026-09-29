function renderToolpathPanel(){
  sheetBar();                                  // always current, even after opening another project
  var list = DOC.vcConverted ? [] : (DOC.vcToolpaths || []), pan = document.getElementById('tpPanel');
  if (!pan) return;
  var open = UICFG.tpPanel !== false;                    // always present; open unless collapsed
  pan.classList.toggle('collapsed', !open);              // the canvas's size observer redraws it to fit
  document.getElementById('tpStrip').setAttribute('aria-expanded', open ? 'true' : 'false');
  document.getElementById('tpCollapse').setAttribute('aria-expanded', open ? 'true' : 'false');
  document.getElementById('tpStripCount').textContent = list.length ? '(' + list.length + ')' : '';
  var mine = tpList();
  document.getElementById('tpNew').hidden = !camReady();
  document.getElementById('tpBeta').hidden = !camReady();                // CAM is in beta: say so where it's used
  document.getElementById('tpRecalcAll').hidden = !camReady() || !tpList().length;   // only when there's something to recalculate
  var camMissing = document.getElementById('tpCamMissing');
  if (camMissing) camMissing.hidden = !(window.__camWanted && !camReady());
  document.getElementById('tpCheck').hidden = !camReady();
  var total = list.length + mine.length;
  document.getElementById('tpCount').textContent = total ? total + (total === 1 ? ' toolpath' : ' toolpaths') : '';
  document.getElementById('tpEmpty').hidden = !!total;
  document.getElementById('tpSrcNote').hidden = !list.length;
  document.getElementById('tpVcBar').hidden = !(list.length && camReady());
  document.getElementById('tpList').innerHTML = '';
  sheetBar();
  if (mine.length) renderMyToolpaths();
  if (!list.length){
    document.getElementById('tpLibNote').innerHTML = '';
    return;
  }
  var ln = document.getElementById('tpLibNote');
  ln.innerHTML = '';
  if (!TOOLLIB){
    ln.appendChild(document.createTextNode('Import your VCarve tool library to check these tools against your own bits.'));
    var ib = document.createElement('button'); ib.textContent = 'Open tool library'; ib.addEventListener('click', function(){ libOpen(); });
    ln.appendChild(document.createElement('br')); ln.appendChild(ib);
  } else {
    var fromProj = list.some(function(t){ return t.machineId && libMachineName(t.machineId); });
    ln.textContent = 'Compared with your tool library' + (fromProj ? ', using the machine each toolpath was made for where the library has it; otherwise ' : ', using ') +
                     libMachineName(libDefaultMachine()) + '.';
  }
  var box = document.getElementById('tpList');
  list.forEach(function(tp){
    var s = tp.set || {}, rows = [];
    function pre(){ return tp.type === 'Profile' ? '_ppd' : tp.type === 'Drilling' ? '_dpd' : tp.type === 'Chamfer' ? '_chpd' : tp.type === 'V-Carve' ? '_vcpd' : '_pkpd'; }
    var P = pre(), inch = s[P + 'InMM'] === false;
    function len(v){ return typeof v === 'number' ? (+v.toFixed(inch ? 4 : 3)) + (inch ? ' in' : ' mm') : '\u2014'; }
    function row(k, v){ rows.push([k, v]); }
    if (tp.type === 'Profile'){
      var side = s._ppdProfileType === 0 ? 'Outside' : s._ppdProfileType === 1 ? 'Inside' : (s._ppdProfileType === undefined ? '\u2014' : 'code ' + s._ppdProfileType);
      row('Side', side);
      row('Cut depth', len(s._ppdCutDepth));
      if (s._ppdStartDepth) row('Start depth', len(s._ppdStartDepth));
      if (s._ppdAllowance) row('Allowance', len(s._ppdAllowance));
      row('Tabs', s._ppdUseTabs ? len(s._ppdTabLength) + ' long \u00d7 ' + len(s._ppdTabThickness) + ' thick' : 'none');
      if (s._mcrdDoRamping !== undefined) row('Ramps', s._mcrdDoRamping ? 'on' : 'off');
    } else if (tp.type === 'Drilling'){
      row('Cut depth', len(s._dpdCutDepth));
      if (s._dpdStartDepth) row('Start depth', len(s._dpdStartDepth));
      row('Peck drilling', s._dpdPeckDrill ? 'yes' : 'no');
      if (s._dpdRetractGap !== undefined) row('Retract gap', len(s._dpdRetractGap));
      if (s._dpdUseDwell) row('Dwell', s._dpdDwellTime + ' s');
    } else if (tp.type === 'Chamfer'){
      if (s._chpdAngle !== undefined) row('Angle', s._chpdAngle + '\u00b0');
      row('Chamfer depth', len(s._chpdChamferDepth));
      if (s._chpdInside !== undefined) row('Side', s._chpdInside ? 'Inside' : 'Outside');
    } else if (tp.type === 'V-Carve'){
      row('Flat depth', s._vcpdDoFlatBottom ? len(s._vcpdFlatDepth) : 'none');
      if (s._vcpdStartDepth) row('Start depth', len(s._vcpdStartDepth));
    } else if (tp.type === 'Pocket'){
      var pk = s._pkpdCutDepth !== undefined ? '_pkpd' : '_mtpkpd';     // some pockets store under a second prefix
      inch = s[pk + 'InMM'] === false;
      row('Cut depth', len(s[pk + 'CutDepth']));
      if (s[pk + 'StartDepth']) row('Start depth', len(s[pk + 'StartDepth']));
      row('Strategy', s[pk + 'DoRaster'] ? 'Raster' : 'Offset');
    }
    var card = document.createElement('div'); card.className = 'tpCard';
    var h = document.createElement('div'); h.className = 'tpName'; h.textContent = tp.name;
    var ty = document.createElement('span'); ty.className = 'tpType'; ty.textContent = tp.type === 'Toolpath' ? 'type not recognized yet' : tp.type;
    h.appendChild(ty); card.appendChild(h);
    var tl;
    if (tp.tool){
      tl = document.createElement('button'); tl.className = 'tpTool tpToolBtn';
      tl.title = 'Show the details of this tool';
      tl.addEventListener('click', function(){ openToolDetailsFor(tp); });
    } else tl = document.createElement('div'), tl.className = 'tpTool';
    tl.textContent = tp.tool ? 'T' + tp.tool.num + ' \u00b7 ' + tp.tool.name + ' \u00b7 ' + tp.tool.rpm + ' rpm' : 'Tool not found in the file';
    card.appendChild(tl);
    if (TOOLLIB && tp.tool){
      // the project's own machine when the library knows it, else the library's chosen machine
      var mid = tp.machineId && libMachineName(tp.machineId) ? tp.machineId : libDefaultMachine();
      var mr = libMatch(tp.tool, mid), lb = document.createElement('button');
      lb.className = 'tpLib ' + (mr.status === 'match' ? 'ok' : mr.status === 'number' ? 'warn' : 'miss');
      if (mr.status === 'match') lb.textContent = '\u2713 In your library as T' + tp.tool.num;
      else if (mr.status === 'number') lb.textContent = mr.libNum !== undefined
        ? '\u26a0 Your library has this bit as T' + mr.libNum + ' (the project uses T' + tp.tool.num + ')'
        : '\u26a0 In your library, but with no tool number on ' + libMachineName(mid);
      else lb.textContent = 'Not in your tool library';
      lb.title = 'Show the details of this tool';
      lb.addEventListener('click', function(){ openToolDetailsFor(tp); });
      card.appendChild(lb);
      var matId = tp.materialId && libMaterialName(tp.materialId) ? tp.materialId : null;
      var cut = mr.tool && matId ? libCutFor(mr.tool, mid, matId) : null;
      if (cut){ var ct = document.createElement('div'); ct.className = 'tpCut'; ct.textContent = libMaterialName(matId) + ': ' + libCutText(cut); card.appendChild(ct); }
    }
    if (rows.length){
      var dl = document.createElement('dl'); dl.className = 'tpSet';
      rows.forEach(function(r){
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      card.appendChild(dl);
    }
    box.appendChild(card);
  });
}

