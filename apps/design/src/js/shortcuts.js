/* ---------------- the keyboard shortcuts most programs have ----------------
   Ctrl+S save (to the same file, once saved), Ctrl+Shift+S save as, Ctrl+O open, Ctrl+N new, Ctrl+A select
   all, Ctrl+D duplicate, F1 the docs. Elsewhere: Ctrl+Z undo and Ctrl+Y or Ctrl+Shift+Z redo, Ctrl+G and
   Ctrl+U group (wiring.js); Ctrl+C, Ctrl+X, Ctrl+V (clipboard.js); the tools' single letters (tool-manager.js).
   While a dialog is open, it has the keyboard. In a text box, Ctrl+A and Ctrl+D are left to the box. */
// Select everything that can be selected: what isn't on a hidden or locked layer.
function selectAll(){
  if (TOOL !== 'select') setTool('select');
  SEL = [];
  DOC.ents.forEach(function (e, i){ if (entEditable(e)) SEL.push(i); });
  draw(); if (typeof updateReadout === 'function') updateReadout();
}
// The desktop app's File and Help menus act through here, so a menu item does exactly what its button or its
// keys do, and nothing while a dialog (or the help) has the screen: the same rule the keys follow.
function menuDo(what, arg){
  if (typeof helpIsOpen === 'function' && helpIsOpen()) return false;
  if (what === 'help'){ helpOpen(); return true; }
  if (CLIP_DIALOGS.some(function (id){ var m = document.getElementById(id); return m && !m.hidden; })) return false;
  var press = function (id){ var b = document.getElementById(id); if (b && !b.disabled) b.click(); };
  if (what === 'new') newDrawing();
  else if (what === 'open') openFiles('open');
  else if (what === 'import') openFiles('import');
  else if (what === 'recent') openRecent(arg);
  else if (what === 'save') saveDrawing(false);
  else if (what === 'saveAs') saveDrawing(true);
  else if (what === 'recover') press('recoverBtn');
  else if (what === 'dxf') press('dxfBtn');
  else if (what === 'svg') press('svgBtn');
  else if (what === 'jobSetup') press('jobBtn');
  else if (what === 'settings') press('settingsBtn');
  else if (what === 'gcode'){
    if (camReady() && tpShownList().some(function (t){ return !t.exclude; })) tpExport();
    else toast('info', 'No toolpaths to save', 'Make a toolpath first: select shapes, then press + in the Toolpaths panel.');
  }
  else return false;
  return true;
}
function keysWire(){
  window.addEventListener('keydown', function (e){
    if (CLIP_DIALOGS.some(function (id){ var m = document.getElementById(id); return m && !m.hidden; })) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var k = e.key.toLowerCase(), t = e.target;
    var inField = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (k === 's'){ e.preventDefault(); saveDrawing(e.shiftKey); return; }
    if (k === 'o' && !e.shiftKey){ e.preventDefault(); openFiles('open'); return; }
    if (k === 'i' && !e.shiftKey){ e.preventDefault(); openFiles('import'); return; }
    if (k === 'n' && !e.shiftKey){ e.preventDefault(); newDrawing(); return; }
    if (inField) return;
    if (k === 'a' && !e.shiftKey){ e.preventDefault(); selectAll(); }
    else if (k === 'd' && !e.shiftKey){ e.preventDefault(); clipDuplicate(); }
  });
}
