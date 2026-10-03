// The menu bar (src/app-menu.js): File, Edit, View, Window, Help, as in most programs. File follows the window in
// front. Built here without Electron, from the same description main.js turns into the real menu.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { menuTemplate, windowKind } = require('../src/app-menu.js');

function build(kind, updates) {
  const did = [];
  const act = { page: (n) => did.push('page:' + n) };
  for (const k of ['showDesign', 'showControl', 'docs', 'report', 'about', 'closeWindow', 'devTools']) act[k] = () => did.push(k);
  return { menu: menuTemplate({ kind, act, updates }), did };
}
const labels = (items) => items.map((i) => i.type === 'separator' ? '-' : i.label || i.role);
const sub = (menu, name) => menu.find((m) => m.label === name).submenu;
const item = (menu, top, label) => sub(menu, top).find((i) => i.label === label);

describe('the menu bar', () => {
  it('is File, Edit, View, Window, Help, whichever window is in front', () => {
    for (const kind of ['design', 'control', 'other']) expect(labels(build(kind).menu)).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
    expect(labels(build('design').menu)).not.toContain('454 Workshop');
  });
  it('File, in 454 Design: a drawing’s actions, then Job setup and Settings, then Close and Exit', () => {
    expect(labels(sub(build('design').menu, 'File'))).toEqual(['New', 'Open…', 'Import…', 'Save', 'Save As…', 'Recover last drawing', '-',
      'Export DXF…', 'Export SVG…', 'Save G-code…', '-', 'Job setup…', 'Settings…', '-', 'Close window', 'Exit']);
  });
  it('File, in 454 Control: Open G-code file, Settings, Close and Exit', () => {
    expect(labels(sub(build('control').menu, 'File'))).toEqual(['Open G-code file…', '-', 'Settings…', '-', 'Close window', 'Exit']);
  });
  it('File, in the docs or About: only Close and Exit', () => {
    expect(labels(sub(build('other').menu, 'File'))).toEqual(['Close window', 'Exit']);
  });
  it('each File item asks the page for its own action', () => {
    const want = { 'New': 'new', 'Open…': 'open', 'Import…': 'import', 'Save': 'save', 'Save As…': 'saveAs', 'Recover last drawing': 'recover', 'Export DXF…': 'dxf',
      'Export SVG…': 'svg', 'Save G-code…': 'gcode', 'Job setup…': 'jobSetup', 'Settings…': 'settings' };
    const { menu, did } = build('design');
    for (const [label, name] of Object.entries(want)) { did.length = 0; item(menu, 'File', label).click(); expect(did).toEqual(['page:' + name]); }
    const c = build('control');
    item(c.menu, 'File', 'Open G-code file…').click(); item(c.menu, 'File', 'Settings…').click();
    expect(c.did).toEqual(['page:open', 'page:settings']);
    const d = build('design');
    item(d.menu, 'File', 'Close window').click();
    expect(d.did).toEqual(['closeWindow']);
    expect(item(d.menu, 'File', 'Exit').role).toBe('quit');
  });
  it('the keys the pages already answer to are shown beside their items, and left to the pages', () => {
    const { menu } = build('design');
    const shown = { 'New': 'CmdOrCtrl+N', 'Open…': 'CmdOrCtrl+O', 'Import…': 'CmdOrCtrl+I', 'Save': 'CmdOrCtrl+S', 'Save As…': 'CmdOrCtrl+Shift+S' };
    for (const [label, key] of Object.entries(shown)) {
      expect(item(menu, 'File', label).accelerator).toBe(key);
      expect(item(menu, 'File', label).registerAccelerator, label + ': the page handles the key, with its own rules about open dialogs').toBe(false);
    }
    expect(item(menu, 'Help', 'Help').accelerator).toBe('F1');
    expect(item(menu, 'Help', 'Help').registerAccelerator).toBe(false);
    expect(item(build('control').menu, 'File', 'Open G-code file…').registerAccelerator).toBe(false);
    // the app's own keys are the menu's to take
    expect(item(menu, 'File', 'Close window').accelerator).toBe('CmdOrCtrl+W');
    expect(item(menu, 'File', 'Close window').registerAccelerator).toBeUndefined();
  });
  it('Window switches between the two apps, with the same keys as before, and ticks the one in front', () => {
    const { menu, did } = build('design');
    expect(labels(sub(menu, 'Window'))).toEqual(['454 Design', '454 Control']);
    expect(item(menu, 'Window', '454 Design').accelerator).toBe('CmdOrCtrl+2');
    expect(item(menu, 'Window', '454 Control').accelerator).toBe('CmdOrCtrl+1');
    item(menu, 'Window', '454 Control').click(); item(menu, 'Window', '454 Design').click();
    expect(did).toEqual(['showControl', 'showDesign']);
    expect([item(menu, 'Window', '454 Design').checked, item(menu, 'Window', '454 Control').checked]).toEqual([true, false]);
    const c = build('control').menu;
    expect([item(c, 'Window', '454 Design').checked, item(c, 'Window', '454 Control').checked]).toEqual([false, true]);
    const o = build('other').menu;
    expect([item(o, 'Window', '454 Design').checked, item(o, 'Window', '454 Control').checked]).toEqual([false, false]);
  });
  it('Help holds the help, the docs, problem reports, updates and About', () => {
    const updates = [{ label: 'Check for updates…' }, { label: 'Updates', submenu: [] }];
    const { menu, did } = build('design', updates);
    expect(labels(sub(menu, 'Help'))).toEqual(['Help', 'Docs', 'Report a problem…', '-', 'Check for updates…', 'Updates', '-', 'About 454 Workshop']);
    item(menu, 'Help', 'Help').click(); item(menu, 'Help', 'Docs').click(); item(menu, 'Help', 'Report a problem…').click(); item(menu, 'Help', 'About 454 Workshop').click();
    expect(did).toEqual(['page:help', 'docs', 'report', 'about']);
    // a copy that can't update itself has no update items, and no stray divider
    expect(labels(sub(build('control').menu, 'Help'))).toEqual(['Help', 'Docs', 'Report a problem…', '-', 'About 454 Workshop']);
    // the docs window has no help of its own to open
    expect(labels(sub(build('other', updates).menu, 'Help'))).toEqual(['Docs', 'Report a problem…', '-', 'Check for updates…', 'Updates', '-', 'About 454 Workshop']);
  });
  it('Edit and View are as they were', () => {
    const { menu } = build('design');
    expect(labels(sub(menu, 'Edit'))).toEqual(['undo', 'redo', '-', 'cut', 'copy', 'paste', 'selectAll']);
    expect(labels(sub(menu, 'View'))).toEqual(['reload', 'resetZoom', 'zoomIn', 'zoomOut', '-', 'togglefullscreen', '-', 'Toggle developer tools']);
  });
});

describe('which window is in front', () => {
  it('is told from its address', () => {
    expect(windowKind('app://0.0.1.198/design.html?cam')).toBe('design');
    expect(windowKind('app://0.0.1.198/index.html')).toBe('control');
    expect(windowKind('app://0.0.1.198/')).toBe('control');
    expect(windowKind('app://0.0.1.198/docs/design-tools.html')).toBe('other');
    expect(windowKind('app://0.0.1.198/docs/index.html')).toBe('other');
    expect(windowKind('app://0.0.1.198/about.html')).toBe('other');
    expect(windowKind('not an address')).toBe('other');
  });
});
