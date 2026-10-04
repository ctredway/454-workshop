// The menu bar: File, Edit, View, Window, Help, as in most programs.
//
// File holds what you do with a file, and changes with the window in front: a drawing's actions in 454 Design,
// Open G-code file in 454 Control. Window switches between the two. Help holds the help, the docs, problem
// reports, updates and About. (It used to be one "454 Workshop" menu holding all of it, with no File menu.)
//
// This builds the menu's description only, with no Electron in it, so it can be tested. main.js gives it the
// actions and turns it into the real menu.
//   kind      'design', 'control' or 'other': the window in front
//   act       { page(name), showDesign, showControl, docs, report, about, closeWindow, devTools }
//             page(name) asks the window in front to do something (its own menuDo, in the page)
//   updates   the update items, from main.js (none in a copy that can't update)
//   recent    454 Design's recent files, newest first: [{path, name, dir}] (design-files.js)
//             act.openRecent(path) opens one; act.clearRecent() empties the list
'use strict';

// A recent file's line in the menu: its name, then the folder it's in (the end of it, if it's long). An & is
// doubled, or Windows would take it as marking the next letter.
function recentLabel(r) {
  const dir = r.dir && r.dir.length > 46 ? '…' + r.dir.slice(-45) : (r.dir || '');
  return (r.name + (dir ? '   (' + dir + ')' : '')).replace(/&/g, '&&');
}
function menuTemplate({ kind, act, updates = [], recent = [] }) {
  // An action the page also has a key for. The key is shown, not taken: the page's own handler does the work,
  // so the menu and the key do one thing, and neither works while one of the page's dialogs has the screen.
  const page = (label, name, key) => Object.assign({ label, click: () => act.page(name) }, key ? { accelerator: key, registerAccelerator: false } : {});
  const sep = { type: 'separator' };
  const fileEnd = [
    // closing goes through each window's own check: Control asks while the machine is busy, Design about an
    // unsaved drawing
    { label: 'Close window', accelerator: 'CmdOrCtrl+W', click: act.closeWindow },
    { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
  ];
  const file = kind === 'design' ? [
    page('New', 'new', 'CmdOrCtrl+N'),
    page('Open…', 'open', 'CmdOrCtrl+O'),
    { label: 'Open recent', submenu: recent.length
      ? recent.map((r) => ({ label: recentLabel(r), click: () => act.openRecent(r.path) })).concat([sep, { label: 'Clear this list', click: act.clearRecent }])
      : [{ label: 'No recent files yet', enabled: false }] },
    page('Import…', 'import', 'CmdOrCtrl+I'),
    page('Save', 'save', 'CmdOrCtrl+S'),
    page('Save As…', 'saveAs', 'CmdOrCtrl+Shift+S'),
    page('Recover last drawing', 'recover'),
    sep,
    page('Export DXF…', 'dxf'),
    page('Export SVG…', 'svg'),
    page('Save G-code…', 'gcode'),
    sep,
    page('Job setup…', 'jobSetup'),
    page('Settings…', 'settings'),
    sep,
    ...fileEnd,
  ] : kind === 'control' ? [
    page('Open G-code file…', 'open', 'CmdOrCtrl+O'),
    sep,
    page('Settings…', 'settings'),
    sep,
    ...fileEnd,
  ] : fileEnd;
  const inApp = kind === 'design' || kind === 'control';
  return [
    { label: 'File', submenu: file },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, sep, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, sep, { role: 'togglefullscreen' },
      sep, { label: 'Toggle developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: act.devTools },
    ] },
    { label: 'Window', submenu: [
      { label: '454 Design', accelerator: 'CmdOrCtrl+2', click: act.showDesign, type: 'checkbox', checked: kind === 'design' },
      { label: '454 Control', accelerator: 'CmdOrCtrl+1', click: act.showControl, type: 'checkbox', checked: kind === 'control' },
    ] },
    { label: 'Help', submenu: [
      ...(inApp ? [page('Help', 'help', 'F1')] : []),
      { label: 'Docs', click: act.docs },
      // a GitHub form in the browser, with this build's version and the computer filled in (report.js)
      { label: 'Report a problem…', click: act.report },
      ...(updates.length ? [sep, ...updates] : []),
      sep,
      { label: 'About 454 Workshop', click: act.about },
    ] },
  ];
}
// Which of the app's windows a page is, from its address
function windowKind(url) {
  let p = '';
  try { p = new URL(url).pathname; } catch (e) { return 'other'; }
  if (p === '/design.html' || p === '/design' || p === '/design/') return 'design';
  if (p === '/' || p === '/index.html' || p === '/control' || p === '/control/') return 'control';   // not /docs/index.html
  return 'other';
}

module.exports = { menuTemplate, windowKind, recentLabel };
