// The documentation's screenshots, as code. Each shot opens one of the apps (the desktop app's bundled
// pages, so it works offline), sets it up, and captures part of the screen into src/assets/shots/.
// Regenerate them all with `npm run shots` whenever the interface changes; the docs follow.
//
// A shot:
//   name     the image's file name (src/assets/shots/<name>.png)
//   page     'design.html' or 'index.html' (Control)
//   size     the window size, [width, height]
//   setup    JavaScript run in the page (an async function body). It can use the helpers in PRELUDE,
//            and may return the rectangle to capture ({x, y, width, height}, in page pixels)
//   capture  or a CSS selector to capture, with optional padding: { selector, pad }

// helpers every shot's setup can use
const PRELUDE = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cvRect = () => document.getElementById('cv').getBoundingClientRect();
  // the page rectangle covering a region of the drawing (world units), with padding in pixels
  const region = (x0, y0, x1, y1, pad = 16) => {
    const r = cvRect(), a = w2s(x0, y1), b = w2s(x1, y0);
    return { x: r.left + Math.min(a.x, b.x) - pad, y: r.top + Math.min(a.y, b.y) - pad,
             width: Math.abs(b.x - a.x) + 2 * pad, height: Math.abs(b.y - a.y) + 2 * pad };
  };
  const union = (...rs) => { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.width)), y1 = Math.max(...rs.map((r) => r.y + r.height));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; };
  const box = (sel, pad = 0) => { const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left - pad, y: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad }; };
  // a fresh drawing: material w x h, these shapes, the view fitted to it
  const drawing = (w, h, ents) => { DOC.stock = Object.assign({}, DOC.stock, { w, h, t: 12 }); DOC.ents = ents;
    DOC.toolpaths = []; DOC.guides = []; DOC.dims = []; SEL = []; setTool('select'); fit(); draw(); };
  // the dialog on screen, as a capture rectangle
  const openDialogBox = () => { const d = Array.from(document.querySelectorAll('[role=dialog], [role=alertdialog]'))
    .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 100).pop();
    if (!d) throw new Error('no dialog appeared'); const r = d.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
  // point the mouse at a spot on the drawing (for hover previews)
  // (the pointer's snapped position too: previews like a line's rubber band are drawn to it)
  const hoverAt = (x, y) => { const s = w2s(x, y); MOUSE.mx = s.x; MOUSE.my = s.y; MOUSE.w = { x, y }; MOUSE.x = x; MOUSE.y = y; MOUSE.snap = { x, y, k: 'grid' }; };
`;

const GROUPS = [['file', 'File'], ['create', 'Create vectors'], ['edit', 'Edit vectors'], ['align', 'Align and nest'], ['guides', 'Guides'], ['view', 'View and history']];

const SHOTS = [
  // each tool group in the left panel
  ...GROUPS.map(([id]) => ({
    name: 'design-group-' + id, page: 'design.html', size: [1400, 900],
    setup: `UICFG.collapsed = {}; buildToolPanel(); sideTab('tools'); await wait(200);`,
    capture: { selector: '.tGroup[data-group="' + id + '"]', pad: 0 },
  })),

  // typing an exact value while drawing a line
  { name: 'design-typing', page: 'design.html', size: [1300, 820],
    setup: `drawing(160, 90, [{ t: 'line', x1: 20, y1: 30, x2: 60, y2: 30 }]);
      setTool('line'); DRAW = { stage: 1, x: 60, y: 30 }; hoverAt(95, 52);
      showPrompt(STAGE_LABEL.line1, '@40,0', true, unitTag()); FLOAT_AT = w2s(95, 52); placeFloatIn(); draw(); await wait(150);
      return union(region(10, 15, 110, 60), box('#floatIn', 8));` },

  // Select: the scale handles on a shape
  { name: 'design-select-handles', page: 'design.html', size: [1300, 820],
    setup: `drawing(180, 100, [{ t: 'rect', x: 30, y: 25, w: 70, h: 45 }, { t: 'circle', cx: 140, cy: 48, r: 22 }]);
      SEL = [0]; HANDLES.sig = selSig(); HANDLES.active = true; HANDLES.mode = 'scale'; draw(); await wait(100);
      return region(15, 12, 170, 85, 20);` },

  // Fillet: hovering a sharp corner previews the fillet; the prompt bar holds the radius and corner type
  { name: 'design-fillet-hover', page: 'design.html', size: [1300, 820],
    // framed on the corner being hovered, with the rounded one beside it for comparison
    setup: `drawing(110, 70, [{ t: 'rect', x: 15, y: 15, w: 80, h: 42 }]);
      UICFG.filletR = 10; doFillet({ x: 95, y: 57 }, 10); setTool('fillet'); await wait(80);
      hoverAt(15, 57); HOVER = hoverFillet({ x: 15, y: 57 }); draw(); await wait(100);
      return region(5, 30, 105, 64, 22);` },
  { name: 'design-fillet-bar', page: 'design.html', size: [1500, 820],
    setup: `drawing(160, 100, [{ t: 'rect', x: 20, y: 15, w: 120, h: 70 }]); UICFG.filletR = 12; setTool('fillet'); await wait(150);`,
    capture: { selector: '#promptBar', pad: 6 } },

  // Offset: the panel, with its preview on the drawing
  { name: 'design-offset', page: 'design.html', size: [1180, 700],
    // as a user does it: select the shape, press O (the Offset tool opens its panel), type the distance
    setup: `drawing(160, 100, [{ t: 'rect', x: 45, y: 30, w: 70, h: 40 }]); SEL = [0]; setTool('offset'); if (!OFF) offOpen(); await wait(80);
      const d = document.getElementById('offDist'); d.value = '8'; d.dispatchEvent(new Event('input', { bubbles: true })); await wait(150);
      return box('#cv');` },

  // Text: the Add text panel
  { name: 'design-text-panel', page: 'design.html', size: [1300, 900],
    setup: `drawing(160, 100, []); openTextModal(null, { x: 20, y: 40 }); await wait(250);
      const t = document.querySelector('#textPanel textarea, #textPanel input[type=text]'); if (t) { t.value = 'WORKSHOP'; t.dispatchEvent(new Event('input', { bubbles: true })); } await wait(200);`,
    capture: { selector: '#textPanel', pad: 0 } },

  // Nest parts: the panel
  { name: 'design-nest-panel', page: 'design.html', size: [1300, 900],
    setup: `drawing(300, 200, [{ t: 'rect', x: 20, y: 20, w: 60, h: 40 }]); SEL = [0]; openNestDialog(); await wait(250);`,
    capture: { selector: '#nestPanel', pad: 0 } },
];

// the workshop sign: a plate with drilled holes, a pocket with an island, WORKSHOP V-carved, and an
// outside profile with tabs; four toolpaths, three tools
const SIGN = "\n  const wait = (ms) => new Promise(r => setTimeout(r, ms));\n  const log = [];\n  const b = Math.tan(Math.PI / 8);                                  // a quarter-circle corner, as a bulge\n  const rounded = (x, y, w, h, r) => ({ t: 'path', closed: true, pts: [\n    [x + r, y, 0], [x + w - r, y, b], [x + w, y + r, 0], [x + w, y + h - r, b],\n    [x + w - r, y + h, 0], [x + r, y + h, b], [x, y + h - r, 0], [x, y + r, b]] });\n  const fontKey = Object.keys(FONTS).find(k => /^bebas-neue@/.test(FONTS[k].pkg)) || 'roboto';\n  loadFont(fontKey);\n  const t0 = Date.now(); while (!FONTS[fontKey].font && Date.now() - t0 < 8000) await wait(100);\n  DOC.name = 'Workshop sign';\n  DOC.stock = Object.assign({}, DOC.stock, { w: 320, h: 200, t: 12, zero: 'top', origin: 'fl' });\n  DOC.layers = null; DOC.activeLayer = null; DOC.activeSheet = null;\n  DOC.toolpaths = []; DOC.vcToolpaths = []; DOC.vcPreview = []; DOC.guides = []; DOC.dims = [];\n  DOC.ents = [\n    rounded(20, 20, 280, 160, 14),                                  // 0 the plate\n    { t: 'circle', cx: 38, cy: 38, r: 3.5 }, { t: 'circle', cx: 282, cy: 38, r: 3.5 },\n    { t: 'circle', cx: 38, cy: 162, r: 3.5 }, { t: 'circle', cx: 282, cy: 162, r: 3.5 },   // 1-4 mounting holes\n    rounded(206, 52, 76, 60, 10),                                   // 5 a pocket\n    { t: 'circle', cx: 244, cy: 82, r: 11 },                        // 6 its island\n    { t: 'text', str: 'WORKSHOP', font: fontKey, h: 36, align: 'left', x: 40, y: 128, rot: 0 },   // 7 the words\n  ];\n  if (typeof layersInit === 'function') layersInit();\n  if (typeof syncStockUI === 'function') syncStockUI();\n  const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };\n  async function make(sel, type, dia, opts) {\n    SEL = sel; cutOpen(null); await wait(150);\n    set('cutType', type, 'change'); await wait(150);\n    set('cutDia', String(dia));\n    CUT.toolChosen = true; CUT.dia = dia;\n    if (opts.through) { const th = document.getElementById('cutThrough'); if (!th.checked) th.click(); }\n    if (opts.depth) set('cutDepth', String(opts.depth));\n    if (opts.vAngle) set('cutVcAngle', String(opts.vAngle));\n    if (opts.tabs) { const on = document.getElementById('cutTabsOn'); if (!on.checked) on.click(); await wait(100); set('cutTabs', String(opts.tabs)); document.getElementById('cutTabSpread').click(); await wait(100); }\n    await wait(200);\n    CUT.toolChosen = true; CUT.dia = dia;\n    cutApply(); await wait(300);\n    log.push(type + ': ' + (tpList().length) + ' toolpaths so far');\n  }\n  await make([1, 2, 3, 4], 'drill', 3.175, { through: true });\n  await make([5, 6], 'pocket', 6.35, { depth: 6 });\n  await make([7], 'vcarve', 12.7, { vAngle: 60 });\n  await make([0], 'outside', 6.35, { through: true, tabs: 4 });\n  SEL = []; CUTSEL = null; persist(); renderToolpathPanel();\n  document.querySelectorAll('.toast, #toasts > *').forEach(t => t.remove());\n  fit(); draw(); await wait(800);\n  ";
SHOTS.push({ name: 'design-job-sheet', page: 'design.html', size: [1300, 1000],
  setup: '{ ' + SIGN + ' }' + `; await wait(200); jobSheetOpen(); await wait(400);     // the sign code in its own scope: it has its own helpers
    const top = document.querySelector('#jobSheet').getBoundingClientRect(), pic = document.querySelector('#jobSheet .jsPic').getBoundingClientRect();
    return { x: top.left, y: top.top, width: top.width, height: pic.bottom - top.top + 24 };` });

// Control, connected: fed the lines a real GRBL 1.1 controller sends (greeting, settings, work offset,
// status) for a Shapeoko set up as Control recommends (homing and soft limits on), so Control draws everything itself exactly as it would with a Shapeoko on the USB port.
// Nothing is written to a machine: writes go to a stand-in that accepts and discards them.
const CONTROL_CONNECTED = `
  SERIAL.writer = { write: () => Promise.resolve(), releaseLock: () => {} }; SERIAL.writeChain = Promise.resolve();
  SERIAL.connected = true; SERIAL.homedSeen = true; uiConn(true);
  handleRx("Grbl 1.1f ['$' for help]");
  ['$0=10','$1=255','$2=0','$3=0','$10=255','$11=0.020','$20=1','$21=1','$22=1','$23=0','$24=100.000','$25=1500.000','$27=5.000',
   '$30=24000','$31=0','$32=0','$100=40.000','$101=40.000','$102=40.000','$110=5000.000','$111=5000.000','$112=5000.000',
   '$120=400.000','$121=400.000','$122=400.000','$130=838.000','$131=838.000','$132=80.000'].forEach((l) => handleRx(l));
  handleRx('ok');
  handleRx('[G54:-419.000,-419.000,-72.500]'); handleRx('ok');
  handleRx('<Idle|MPos:-362.400,-331.750,-40.000|FS:0,0|WCO:-419.000,-419.000,-72.500>');   // work position 56.6, 87.25, 32.5
  await wait(150);
  ['connModal', 'homeModal'].forEach((id) => { const m = document.getElementById(id); if (m) m.hidden = true; });
`;
const withJob = (at) => `document.getElementById('sampleBtn').click(); await wait(900);
  ['connModal', 'homeModal'].forEach((id) => { const m = document.getElementById(id); if (m) m.hidden = true; });
  document.getElementById('fitBtn').click(); await wait(300);` + (at ? ` setTime(MODEL.totalTime * ${at}); await wait(500);` : '');
const tab = (id) => `document.getElementById('${id}').click(); await wait(300);`;

SHOTS.push(
  { name: 'control-overview', page: 'index.html', size: [1400, 860],
    setup: CONTROL_CONNECTED + withJob(0.62) },
  { name: 'control-machine-tab', page: 'index.html', size: [1400, 1000],
    setup: CONTROL_CONNECTED + withJob(0) + tab('tabMachine'), capture: { selector: '#paneMachine', pad: 0 } },
  { name: 'control-jog-panel', page: 'index.html', size: [1400, 1000],
    setup: CONTROL_CONNECTED + `document.getElementById('jogOpen').click(); await wait(400);
      const p = document.querySelector('#jogModal > div, #jogPanel'); return box(p.id ? '#' + p.id : '#jogModal > div');` },
  { name: 'control-code-tab', page: 'index.html', size: [1400, 900],
    setup: CONTROL_CONNECTED + withJob(0.4) + tab('tabCode'), capture: { selector: '#paneCode', pad: 0 } },
  { name: 'control-toolpaths-tab', page: 'index.html', size: [1400, 900],
    setup: CONTROL_CONNECTED + withJob(0) + tab('tabTp'), capture: { selector: '#paneTp', pad: 0 } },
  { name: 'control-checks-tab', page: 'index.html', size: [1400, 900],
    setup: CONTROL_CONNECTED + withJob(0) + tab('tabChecks'), capture: { selector: '#paneChecks', pad: 0 } },
  { name: 'control-footer', page: 'index.html', size: [1400, 860],
    setup: CONTROL_CONNECTED + withJob(0.62), capture: { selector: 'footer', pad: 0 } },
  // Run, with two tools and no BitSetter: Control first asks how tool changes should go...
  { name: 'control-toolchange-choice', page: 'index.html', size: [1400, 900],
    setup: CONTROL_CONNECTED + withJob(0) + tab('tabMachine') + `document.getElementById('jobRun').click(); await wait(700);
      return openDialogBox();` },
  // ...then, choosing to re-zero at each change, shows what will happen before anything moves
  { name: 'control-start-dialog', page: 'index.html', size: [1400, 900],
    setup: CONTROL_CONNECTED + withJob(0) + tab('tabMachine') + `document.getElementById('jobRun').click(); await wait(700);
      const choice = Array.from(document.querySelectorAll('button')).find((b) => b.offsetParent && /Re-zero at each change/.test(b.textContent));
      if (!choice) throw new Error('the tool-change choice did not appear'); choice.click(); await wait(800);
      return openDialogBox();` },
  { name: 'control-settings', page: 'index.html', size: [1400, 1000],
    setup: CONTROL_CONNECTED + `document.getElementById('settingsBtn').click(); await wait(400);`, capture: { selector: '#setPanel', pad: 0 } },
);

// ---- Design's workspace ----
// a neutral sample tool library: end mills, V-bits and a ball nose, feeds for four materials
const SAMPLE_LIBRARY = `
  TOOLLIB = libEmptyLib(); TOOLLIB.machines[0].name = 'Shapeoko XXL';
  TOOLLIB.materials = [{ id: 'hw', name: 'Hardwood' }, { id: 'sw', name: 'Softwood' }, { id: 'mdf', name: 'MDF' }, { id: 'ply', name: 'Plywood' }];
  const T = (id, type, dia, extra, feed, plunge, down, over) => Object.assign({ id, fmt: '', type, typeName: TOOL_TYPES[type], units: 'mm', diameter: dia,
    angle: null, flat: null, tipRadius: null, flutes: 2, fluteLength: null, notes: '', numbers: {}, lineWidth: null,
    cuts: ['hw', 'sw', 'mdf', 'ply'].map((m, i) => ({ machine: 'm454', material: m, rateUnits: 1, lengthUnits: 'mm', feed: Math.round(feed * [1, 1.3, 1.4, 1.2][i]),
      plunge: plunge, rpm: 18000, stepdown: down, stepover: over, clearStepover: over, notes: '' })) }, extra);
  TOOLLIB.tools = [
    T('t1', 1, 6.35, { numbers: { m454: 201 }, notes: 'Two-flute up-cut' }, 1100, 300, 1.5, 2.5),
    T('t2', 1, 3.175, { numbers: { m454: 102 } }, 800, 250, 0.8, 1.2),
    T('t3', 3, 12.7, { angle: 60, numbers: { m454: 302 } }, 900, 300, 1.0, 0.5),
    T('t4', 3, 12.7, { angle: 90, numbers: { m454: 301 } }, 900, 300, 1.0, 0.5),
    T('t5', 0, 3.175, { numbers: { m454: 111 } }, 900, 250, 0.5, 0.3),
  ];
  TOOLLIB.tools.forEach((t) => { t.name = libAutoName(t); });
  TOOLLIB.tree = [{ id: '_mine', name: 'My tools', tool: null, kids: TOOLLIB.tools.map((t) => ({ id: '_m' + t.id, tool: t.id, kids: [] })) }];
  UICFG.libMaterial = 'hw';
`;
const SIGN_SETUP = '{ ' + SIGN + ' } await wait(200); CUTSEL = null; renderToolpathPanel(); draw();';
SHOTS.push(
  { name: 'design-overview', page: 'design.html', size: [1400, 860], setup: SIGN_SETUP + ` sideTab('tools'); await wait(200);` },
  { name: 'design-layers', page: 'design.html', size: [1400, 900],
    setup: SIGN_SETUP + `
      DOC.layers = [{ id: 'L1', name: 'Outline', visible: true, locked: false }, { id: 'L2', name: 'Engraving', visible: true, locked: false },
                    { id: 'L3', name: 'Reference', visible: false, locked: true }];
      DOC.ents.forEach((e) => { e.layer = e.t === 'text' ? 'L2' : 'L1'; });
      DOC.ents.push({ t: 'rect', x: 10, y: 10, w: 300, h: 180, layer: 'L3' }); DOC.activeLayer = 'L1';
      sideTab('layers'); renderLayers(); draw(); await wait(200);
      const top = document.getElementById('paneLayers').getBoundingClientRect(), add = document.getElementById('layerAdd').getBoundingClientRect();
      return { x: top.left, y: top.top, width: top.width, height: add.bottom - top.top + 12 };` },
  { name: 'design-job-setup', page: 'design.html', size: [1400, 1000],
    setup: SIGN_SETUP + ` document.getElementById('jobBtn').click(); await wait(300);`, capture: { selector: '#jobPanel', pad: 0 } },
  { name: 'design-settings', page: 'design.html', size: [1400, 1000],
    setup: `document.getElementById('settingsBtn').click(); await wait(300);`, capture: { selector: '#settingsPanel', pad: 0 } },
  { name: 'design-tool-library', page: 'design.html', size: [1400, 1000],
    setup: SAMPLE_LIBRARY + ` document.getElementById('libBtn').click(); await wait(300); LIBUI.sel = 't1'; libRender(); await wait(250);`,
    capture: { selector: '#libPanel', pad: 0 } },
  { name: 'design-toolpaths-panel', page: 'design.html', size: [1400, 1000], setup: SIGN_SETUP, capture: { selector: '#tpPanel', pad: 0 } },
  { name: 'design-toolpath-editor', page: 'design.html', size: [1400, 1000],
    setup: SIGN_SETUP + ` cutOpen(tpList()[1]); await wait(400);`, capture: { selector: '#cutPanel', pad: 0 } },
  { name: 'design-check', page: 'design.html', size: [1400, 900],
    setup: `drawing(200, 120, [{ t: 'rect', x: 20, y: 20, w: 60, h: 40 }, { t: 'rect', x: 20, y: 20, w: 60, h: 40 },
        { t: 'poly', closed: false, pts: [[110, 20], [170, 20], [170, 70], [115, 70]] }, { t: 'line', x1: 30, y1: 90, x2: 30.2, y2: 90 }]);
      vecCheckAll(); await wait(500); return openDialogBox();` },
  { name: 'design-status-bar', page: 'design.html', size: [1400, 860],
    setup: SIGN_SETUP + ` setTool('fillet'); hoverAt(120, 80); const s = w2s(120, 80); document.getElementById('cv').dispatchEvent(new PointerEvent('pointermove', { clientX: s.x + document.getElementById('cv').getBoundingClientRect().left, clientY: s.y + document.getElementById('cv').getBoundingClientRect().top, bubbles: true })); await wait(250);`,
    capture: { selector: 'footer', pad: 0 } },
);

module.exports = { PRELUDE, SHOTS };
