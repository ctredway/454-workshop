/* ---------------- the ribbon ----------------
   The drawing tools in tabs across the top of the drawing (RIBBON_TABS, move.js), each tab in labelled sections, with
   each tool's name under its icon (Clint, 2026-11-21, after a mock-up: "like Fusion and other CAD programs"). It folds
   to its tabs for more drawing room: the arrow at the right, or a double-click on a tab. Folded, a tab clicked shows
   its tools over the drawing until one is picked, or the pointer goes elsewhere, or Esc. The tab shown and the fold
   are remembered. The buttons are the same as before (PANEL_BTNS: ids, data-tool, titles), so the keys, the Tools
   menu and the tools themselves don't change. Layers are a tab of the right-hand panel (rightTab, ui-settings.js). */
function buildToolPanel(){
  var host = document.getElementById('toolPanel');
  var tab = ribbonTabNow();
  var tabs = '', panes = '';
  RIBBON_TABS.forEach(function (t) {
    var on = t.id === tab;
    tabs += '<button type="button" class="rbTab" role="tab" id="rbTab-' + t.id + '" data-tab="' + t.id + '" aria-controls="rbPane-' + t.id + '"' +
            ' aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + t.label + '</button>';
    panes += '<div class="rbPane" role="tabpanel" id="rbPane-' + t.id + '" data-tab="' + t.id + '" aria-labelledby="rbTab-' + t.id + '"' + (on ? '' : ' hidden') + '>';
    t.secs.forEach(function (s) {
      panes += '<div class="rbSec" data-sec="' + t.id + '-' + s.id + '"><div class="rbBtns">';
      s.btns.forEach(function (bid) {
        var b = PANEL_BTNS[bid];
        if (!b) return;
        panes += '<button type="button" class="tool' + (b.active ? ' active' : '') + '"' +
                 (b.tool ? ' data-tool="' + b.tool + '"' : '') + (b.id ? ' id="' + b.id + '"' : '') +
                 ' title="' + b.title + '">' + ICON[b.icon] + '<span class="rbName">' + (RIBBON_NAMES[bid] || '') + '</span></button>';
      });
      panes += '</div><div class="rbCap">' + s.label + '</div></div>';
    });
    panes += '</div>';
  });
  host.innerHTML =
    '<div class="rbTabs" role="tablist" aria-label="Drawing tools">' + tabs +
      '<span class="rbGap"></span><button type="button" id="rbFold" class="rbFold" aria-controls="rbPanes">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9 L7 5 L11 9"/></svg></button></div>' +
    '<div class="rbPanes" id="rbPanes">' + panes + '</div>';
  if (typeof helpIconsApply === 'function') helpIconsApply();   // the (i) beside each section's name
  ribbonShow();
  host.querySelectorAll('.rbTab').forEach(function (b) {
    b.addEventListener('click', function () {
      var same = b.dataset.tab === ribbonTabNow();
      ribbonTab(b.dataset.tab);
      if (UICFG.ribbonFolded) ribbonPeek(!(same && host.classList.contains('peek')));
    });
    b.addEventListener('dblclick', function () { ribbonFold(!UICFG.ribbonFolded); });
    b.addEventListener('keydown', function (e) {                // arrow keys move between tabs
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var ids = RIBBON_TABS.map(function (t) { return t.id; }), i = ids.indexOf(ribbonTabNow());
      var next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      ribbonTab(next);
      document.getElementById('rbTab-' + next).focus();
    });
  });
  document.getElementById('rbFold').addEventListener('click', function () { ribbonFold(!UICFG.ribbonFolded); });
  // a tool picked from the ribbon while it's folded: the tools go away again
  document.getElementById('rbPanes').addEventListener('click', function (e) { if (e.target.closest('button.tool')) ribbonPeek(false); });
  if (!buildToolPanel.wired){                               // the page's own listeners, once
    buildToolPanel.wired = true;
    document.addEventListener('pointerdown', function (e) {
      var h = document.getElementById('toolPanel');
      if (h && h.classList.contains('peek') && !h.contains(e.target)) ribbonPeek(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ribbonPeek(false); });
  }
}
function ribbonTabNow(){
  var id = UICFG.ribbonTab;
  return RIBBON_TABS.some(function (t) { return t.id === id; }) ? id : 'draw';   // Draw the first time
}
// Show a tab's tools; remembered
function ribbonTab(id){
  if (!RIBBON_TABS.some(function (t) { return t.id === id; })) return;
  UICFG.ribbonTab = id;
  uiCfgSave();
  ribbonShow();
}
// Fold the ribbon to its tabs, or open it again; remembered
function ribbonFold(folded){
  UICFG.ribbonFolded = !!folded;
  uiCfgSave();
  ribbonPeek(false);
  ribbonShow();
}
// Folded: a tab's tools shown over the drawing for a moment
function ribbonPeek(on){
  var host = document.getElementById('toolPanel');
  if (host) host.classList.toggle('peek', !!on && !!UICFG.ribbonFolded);
}
function ribbonShow(){
  var host = document.getElementById('toolPanel');
  if (!host) return;
  var tab = ribbonTabNow(), folded = !!UICFG.ribbonFolded;
  host.classList.toggle('folded', folded);              // the canvas's size observer redraws it to fit
  host.querySelectorAll('.rbTab').forEach(function (b) {
    var on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
  });
  host.querySelectorAll('.rbPane').forEach(function (p) { p.hidden = p.dataset.tab !== tab; });
  var f = document.getElementById('rbFold');
  if (f){
    f.title = folded ? 'Open the ribbon again' : 'Fold the ribbon away, for more drawing room (or double-click a tab)';
    f.setAttribute('aria-label', folded ? 'Open the ribbon' : 'Fold the ribbon away');
    f.setAttribute('aria-expanded', folded ? 'false' : 'true');
  }
}

/* ---------------- wiring ---------------- */
// Fit (the button, Home, opening a drawing): the shapes drawn, if there are any on the sheet shown, or else the material
// (Clint, 2026-10-26). Changing the material fits the material (fitStock).
function fit(){
  var b = fitDrawnBox();
  if (b) fitBox(b); else fitStock();
}
function fitStock(){ fitBox(stockRect()); }
// The box round every shape that can be seen on the sheet shown (hidden layers left out), or null if there are none
function fitDrawnBox(){
  var b = null;
  (DOC.ents || []).forEach(function (e){
    if (!e || (DOC.layers && !entVisible(e))) return;
    var q = entBBox(e);
    if (!q || !isFinite(q.x0) || !isFinite(q.y1)) return;
    b = b ? {x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1)} : {x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1};
  });
  return b;
}
// Show a box in the middle of the drawing area, as large as fits with a margin (no closer in than the wheel goes)
function fitBox(sr){
  var margin = 40;
  var w = Math.max(sr.x1 - sr.x0, 1e-6), h = Math.max(sr.y1 - sr.y0, 1e-6);
  var sx = (cv.clientWidth - 2*margin) / w;
  var sy = (cv.clientHeight - 2*margin) / h;
  VIEW.scale = Math.max(0.2, Math.min(60, sx, sy));
  var cx = (sr.x0+sr.x1)/2, cy2 = (sr.y0+sr.y1)/2;
  VIEW.ox = cv.clientWidth/2 - cx*VIEW.scale;
  VIEW.oy = cv.clientHeight/2 + cy2*VIEW.scale;
  draw();
}

