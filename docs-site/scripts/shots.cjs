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

const GROUPS = [['file', 'File'], ['create', 'Create vectors'], ['edit', 'Edit vectors'], ['align', 'Align and nest'], ['guides', 'Guides']];

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

// ---- the CAM reference: each toolpath type on a drawing, made through the editor as a user makes it ----
const CAM = `
  const rounded = (x, y, w, h, r) => { const b = Math.tan(Math.PI / 8); return { t: 'path', closed: true, pts: [
    [x + r, y, 0], [x + w - r, y, b], [x + w, y + r, 0], [x + w, y + h - r, b], [x + w - r, y + h, 0], [x + r, y + h, b], [x, y + h - r, 0], [x, y + r, b]] }; };
  const star = (cx, cy, ro, ri) => ({ t: 'poly', closed: true, pts: Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }) });
  const setv = (id, v, ev) => { const el = document.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
  // select the shapes, open the editor, set the cut, press Create (or leave the editor open)
  const camMake = async (sel, type, o = {}) => {
    SEL = sel; cutOpen(null); await wait(120);
    setv('cutType', type, 'change'); await wait(150);
    CUT.toolChosen = true; CUT.dia = o.dia || 6.35; setv('cutDia', CUT.dia);
    if (o.through){ const th = document.getElementById('cutThrough'); if (!th.checked) th.click(); } else if (o.depth) setv('cutDepth', o.depth);
    if (o.vAngle){ setv('cutVAngle', o.vAngle); setv('cutVcAngle', o.vAngle); }
    if (o.chamW) setv('cutChamW', o.chamW);
    if (o.clear) setv('cutClear', o.clear, 'change');
    if (o.rasterAng !== undefined) setv('cutRasterAng', o.rasterAng);
    if (o.lead) setv('cutLead', o.lead, 'change');
    if (o.inlay){ setv('cutInlayHalf', o.inlay, 'change'); if (o.inlayD) setv('cutInlayD', o.inlayD); }
    if (o.tabs){ const on = document.getElementById('cutTabsOn'); if (!on.checked) on.click(); await wait(80); setv('cutTabs', o.tabs); document.getElementById('cutTabSpread').click(); }
    await wait(150); CUT.toolChosen = true; CUT.dia = o.dia || 6.35;
    if (o.keepOpen) return;
    cutApply(); await wait(300);
  };
  const showAll = () => { SEL = []; CUTSEL = null; renderToolpathPanel(); draw(); };
`;
// region: a fixed area of the drawing, or 'all' for everything drawn; select: highlight the first toolpath
// (tabs and leads are only drawn on the selected one)
const camShot = (name, setup, region, select) => ({ name, page: 'design.html', size: [1300, 820],
  setup: CAM + setup + ` showAll();` + (select ? ` CUTSEL = tpList()[0].id; renderToolpathPanel(); draw();` : '') + ` await wait(200);` +
    (region === 'all' ? `
      // everything drawn, not just the material: collapse the panel, clear messages, zoom to fit it all
      document.getElementById('tpCollapse').click(); await wait(250);
      document.querySelectorAll('.toast, #toasts > *').forEach((t) => t.remove());
      const bb = DOC.ents.map(entBBox).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
      const cv = cvRect(), w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
      VIEW.scale = Math.min(cv.width / w, cv.height / h) * 0.8;
      VIEW.ox = cv.width / 2 - (bb.x0 + w / 2) * VIEW.scale; VIEW.oy = cv.height / 2 + (bb.y0 + h / 2) * VIEW.scale;
      draw(); await wait(150);
      return region(bb.x0 - 6, bb.y0 - 6, bb.x1 + 6, bb.y1 + 6, 12);` : ` return region(${region});`) });
SHOTS.push(
  camShot('cam-profile', `drawing(160, 100, [rounded(20, 15, 120, 70, 10)]); await camMake([0], 'outside', { through: true, tabs: 4, lead: 'arc' });`, '4, 2, 156, 98, 12', true),
  { name: 'cam-profile-editor', page: 'design.html', size: [1300, 1000],
    setup: CAM + `drawing(160, 100, [rounded(20, 15, 120, 70, 10)]); await camMake([0], 'outside', { through: true, tabs: 4, lead: 'arc', keepOpen: true }); await wait(250);`,
    capture: { selector: '#cutPanel', pad: 0 } },
  camShot('cam-pocket-offset', `drawing(160, 100, [rounded(20, 15, 120, 70, 12), { t: 'circle', cx: 80, cy: 50, r: 14 }]); await camMake([0, 1], 'pocket', { depth: 6, clear: 'offset' });`, '10, 5, 150, 95, 12'),
  camShot('cam-pocket-raster', `drawing(160, 100, [rounded(20, 15, 120, 70, 12), { t: 'circle', cx: 80, cy: 50, r: 14 }]); await camMake([0, 1], 'pocket', { depth: 6, clear: 'raster', rasterAng: 0 });`, '10, 5, 150, 95, 12'),
  camShot('cam-drill', `drawing(160, 100, [rounded(20, 15, 120, 70, 10)].concat([35, 65, 95, 125].flatMap((x) => [30, 70].map((y) => ({ t: 'circle', cx: x, cy: y, r: 3 })))));
    await camMake([1, 2, 3, 4, 5, 6, 7, 8], 'drill', { dia: 6, through: true });`, '10, 5, 150, 95, 12'),
  camShot('cam-chamfer', `drawing(160, 100, [rounded(25, 20, 110, 60, 6)]); await camMake([0], 'chamfer', { dia: 12.7, vAngle: 90, chamW: 3 });`, '12, 8, 148, 92, 12', true),
  camShot('cam-vcarve', `const fk = Object.keys(FONTS).find((k) => /^bebas-neue@/.test(FONTS[k].pkg)) || 'roboto'; loadFont(fk);
    const t0 = Date.now(); while (!FONTS[fk].font && Date.now() - t0 < 8000) await wait(100);
    drawing(160, 100, [{ t: 'text', str: '454', font: fk, h: 55, align: 'left', x: 30, y: 23, rot: 0 }]); await camMake([0], 'vcarve', { dia: 12.7, vAngle: 60 });`, '18, 12, 142, 88, 12'),
  // an inlay: the pocket in the star, and the plug, which Design makes on a mirrored copy beside the design
  camShot('cam-inlay', `drawing(120, 100, [star(55, 50, 32, 14)]);
    await camMake([0], 'inlay', { dia: 12.7, vAngle: 60, inlay: 'pocket', inlayD: 3 }); await camMake([0], 'inlay', { dia: 12.7, vAngle: 60, inlay: 'plug', inlayD: 3 });`, 'all'),
);

// ---- parameters, the depth check and the start point ----
// A cabinet side with a dado for its shelf, and the shelf: the dado's width and the shelf's length come from
// parameters, typed into the dimensions as a user types them. The Parameters list is open beside the drawing.
SHOTS.push({ name: 'design-parameters', page: 'design.html', size: [1700, 860],
  setup: `toast = function () {};
    drawing(960, 460, [{ t: 'rect', x: 30, y: 30, w: 300, h: 400 }, { t: 'rect', x: 30, y: 220, w: 300, h: 18 }, { t: 'rect', x: 370, y: 30, w: 564, h: 300 }]);
    DOC.stock.t = 18;
    DOC.params = [{ name: 'thickness', expr: '18', unit: 'mm', note: 'the plywood, measured' }, { name: 'width', expr: '600', unit: 'mm', note: 'outside to outside' },
      { name: 'shelf', expr: 'width - 2 * thickness', unit: 'mm', note: 'fits between the sides' }, { name: 'dado_depth', expr: 'thickness / 3', unit: 'mm', note: '' }];
    const side = DOC.ents[0], dado = DOC.ents[1], sh = DOC.ents[2];
    addDim({ kind: 'side', a: entId(dado), at: hintOf(dado, { x: 30, y: 229 }) });
    addDim({ kind: 'side', a: entId(sh), at: hintOf(sh, { x: 650, y: 30 }) });
    addDim({ kind: 'side', a: entId(side), at: hintOf(side, { x: 180, y: 430 }) });
    const type = (i, txt) => { DRAW = { stage: 'dimValue', di: i }; DIMSEL = i; toolCommitText(txt); };
    type(0, 'thickness'); type(1, 'shelf');
    DRAW = null; DIMSEL = -1; SEL = []; setTool('select');
    document.getElementById('tpCollapse').click(); await wait(250);
    const sr = stockRect(); VIEW.scale = 0.85; VIEW.ox = 90 - sr.x0 * VIEW.scale; VIEW.oy = cvRect().height / 2 + (sr.y0 + sr.y1) / 2 * VIEW.scale; draw();
    document.getElementById('paramsBtn').click(); await wait(300);
    return union(region(sr.x0 - 85, sr.y0, sr.x1, sr.y1, 14), box('#paramPanel', 10));` });
// Two pockets in 12 mm material: one half the material deep, from a parameter, and one typed as 15 mm,
// which goes through. The panel's cards, and what Save G-code says first.
const PAST = CAM + `drawing(200, 120, [rounded(20, 20, 70, 80, 8), rounded(110, 20, 70, 80, 8)]); DOC.params = [];
  await camMake([0], 'pocket', { depth: 'material / 2' }); await camMake([1], 'pocket', { depth: 15 }); showAll();
  document.querySelectorAll('.toast, #toasts > *').forEach((t) => t.remove()); await wait(200);`;
SHOTS.push(
  { name: 'cam-depth-check', page: 'design.html', size: [1400, 1000], setup: PAST, capture: { selector: '#tpPanel', pad: 0 } },
  { name: 'cam-save-past', page: 'design.html', size: [1400, 900], setup: PAST + ` tpExport(); await wait(500); return openDialogBox();` },
  camShot('cam-start-point', `drawing(160, 100, [rounded(20, 15, 120, 70, 10)]); await camMake([0], 'outside', { through: true, keepOpen: true });
    cutStartClick({ x: 110, y: 85 }); await wait(100); cutApply(); await wait(300);`, '4, 2, 156, 98, 12', true),
);

// The Sheet bar, in a project with two sheets
SHOTS.push({ name: 'design-sheets', page: 'design.html', size: [1400, 900],
  setup: SIGN_SETUP + ` toast = function () {}; sheetAdd(); sheetRename('S1', 'Sign'); sheetRename('S2', 'Backer'); sheetShow('S1'); await wait(300);
    document.querySelectorAll('.toast, #toasts > *').forEach((t) => t.remove());
    const top = document.querySelector('#tpPanel').getBoundingClientRect(), bar = document.getElementById('tpSheetBar').getBoundingClientRect();
    return { x: top.left, y: bar.top - 6, width: top.width, height: bar.height + 12 };` });

module.exports = { PRELUDE, SHOTS };
