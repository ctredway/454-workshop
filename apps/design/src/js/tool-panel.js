function buildToolPanel(){
  setTimeout(function(){
    var add = document.getElementById('layerAdd');
    if (add && !add.wired){ add.wired = true; add.addEventListener('click', function(){ pushUndo(); layersInit(); DOC.activeLayer = layerNew(); persist(); renderLayers(); }); }
    if (typeof renderLayers === 'function') renderLayers();
  }, 0);
  var host = document.getElementById('toolPanel');
  var html = '';
  orderedGroups().forEach(function(g){
    html += '<div class="tGroup' + (UICFG.collapsed[g.id] ? ' collapsed' : '') + '" data-group="' + g.id + '">' +
            '<h4 draggable="true"><span class="caret">\u25bc</span>' + g.label + '<span class="grip">\u22ee\u22ee</span></h4>';
    if (g.html){ html += '<div class="tRows">' + g.html + '</div></div>'; return; }
    html += '<div class="tGrid">';
    (g.btns || []).forEach(function(bid){
      var b = PANEL_BTNS[bid];
      if (!b) return;
      html += '<button class="tool' + (b.active ? ' active' : '') + '"' +
              (b.tool ? ' data-tool="' + b.tool + '"' : '') +
              (b.id ? ' id="' + b.id + '"' : '') +
              ' title="' + b.title + '">' + ICON[b.icon] + '</button>';
    });
    html += '</div></div>';
  });
  var tab = UICFG.sideTab === 'layers' ? 'layers' : 'tools';
  host.innerHTML =
    '<div class="sideTabs" role="tablist" aria-orientation="vertical" aria-label="Side panel">' +
      '<button class="sideTab" role="tab" id="sideTabTools" data-tab="tools" aria-controls="paneTools" aria-selected="' + (tab === 'tools') + '" tabindex="' + (tab === 'tools' ? 0 : -1) + '">Tools</button>' +
      '<button class="sideTab" role="tab" id="sideTabLayers" data-tab="layers" aria-controls="paneLayers" aria-selected="' + (tab === 'layers') + '" tabindex="' + (tab === 'layers' ? 0 : -1) + '">Layers</button>' +
    '</div>' +
    '<div class="sidePane" id="paneTools" role="tabpanel" aria-labelledby="sideTabTools"' + (tab === 'tools' ? '' : ' hidden') + '>' + html + '</div>' +
    '<div class="sidePane" id="paneLayers" role="tabpanel" aria-labelledby="sideTabLayers"' + (tab === 'layers' ? '' : ' hidden') + '>' +
      '<div class="paneHead">Layers</div>' +
      '<div id="layerList" role="list" aria-label="Layers"></div>' +
      '<button id="layerAdd" class="layerAdd" title="Add a layer and make it the one new shapes go on">+ Layer</button>' +
    '</div>';
  host.querySelectorAll('.sideTab').forEach(function(t){
    t.addEventListener('click', function(){ sideTab(t.dataset.tab); });
    t.addEventListener('keydown', function(e){                  // arrow keys move between tabs
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var next = t.dataset.tab === 'tools' ? 'layers' : 'tools';
      sideTab(next);
      var el = document.getElementById(next === 'tools' ? 'sideTabTools' : 'sideTabLayers'); if (el) el.focus();
    });
  });

  // collapse on header click; drag headers to reorder groups
  var dragging = null;
  host.querySelectorAll('.tGroup h4').forEach(function(h){
    var grp = h.parentElement;
    h.addEventListener('click', function(){
      var id = grp.dataset.group;
      UICFG.collapsed[id] = !UICFG.collapsed[id];
      grp.classList.toggle('collapsed', UICFG.collapsed[id]);
      uiCfgSave();
    });
    h.addEventListener('dragstart', function(e){
      dragging = grp.dataset.group;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'kerf-group:' + grp.dataset.group);
    });
  });
  host.querySelectorAll('.tGroup').forEach(function(grp){
    grp.addEventListener('dragover', function(e){ e.preventDefault(); grp.classList.add('dragOver'); });
    grp.addEventListener('dragleave', function(){ grp.classList.remove('dragOver'); });
    grp.addEventListener('drop', function(e){
      e.preventDefault(); grp.classList.remove('dragOver');
      if (!dragging || dragging === grp.dataset.group) return;
      var order = orderedGroups().map(function(g){ return g.id; });
      order.splice(order.indexOf(dragging), 1);
      order.splice(order.indexOf(grp.dataset.group), 0, dragging);
      UICFG.order = order;
      uiCfgSave();
      buildToolPanel();     // rebuild in the new order
      wirePanel();          // re-attach button handlers
    });
  });
}

/* ---------------- wiring ---------------- */
function fit(){
  var sr = stockRect();
  var margin = 40;
  var sx = (cv.clientWidth - 2*margin) / (sr.x1 - sr.x0);
  var sy = (cv.clientHeight - 2*margin) / (sr.y1 - sr.y0);
  VIEW.scale = Math.max(0.5, Math.min(sx, sy));
  var cx = (sr.x0+sr.x1)/2, cy2 = (sr.y0+sr.y1)/2;
  VIEW.ox = cv.clientWidth/2 - cx*VIEW.scale;
  VIEW.oy = cv.clientHeight/2 + cy2*VIEW.scale;
  draw();
}

