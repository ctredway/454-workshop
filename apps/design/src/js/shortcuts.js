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
function keysWire(){
  window.addEventListener('keydown', function (e){
    if (CLIP_DIALOGS.some(function (id){ var m = document.getElementById(id); return m && !m.hidden; })) return;
    if (e.key === 'F1'){ e.preventDefault(); document.getElementById('openDocs').click(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var k = e.key.toLowerCase(), t = e.target;
    var inField = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (k === 's'){ e.preventDefault(); saveDrawing(e.shiftKey); return; }
    if (k === 'o' && !e.shiftKey){ e.preventDefault(); openFiles(); return; }
    if (k === 'n' && !e.shiftKey){ e.preventDefault(); newDrawing(); return; }
    if (inField) return;
    if (k === 'a' && !e.shiftKey){ e.preventDefault(); selectAll(); }
    else if (k === 'd' && !e.shiftKey){ e.preventDefault(); clipDuplicate(); }
  });
}
