// Runs inside Design's window: everything Design fetches must come from the app, and it must work.
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  try {
    log.push('CAM engine loaded: ' + (typeof Cam !== 'undefined' && typeof Cam.pocket === 'function'));
    log.push('opentype.js loaded: ' + (typeof opentype !== 'undefined'));
    loadFont('roboto');
    await until(() => FONTS.roboto.font || FONTS.roboto.failed, 10000, 'the font');
    log.push('Text font Roboto loaded: ' + !!FONTS.roboto.font + (FONTS.roboto.font ? ' (' + FONTS.roboto.font.numGlyphs + ' glyphs)' : ''));
    const SQL = await libLoadSql();                   // Design's loader hands back sql.js ready to use
    const r = new SQL.Database().exec('select 6 * 7');
    log.push('tool-database reader (sql.js, WebAssembly): 6 x 7 = ' + r[0].values[0][0]);
    DOC.stock.t = 6; DOC.stock.zero = 'top';
    DOC.ents.push({ t: 'rect', x: 20, y: 20, w: 40, h: 30 });
    SEL = [DOC.ents.length - 1]; cutOpen(null);
    CUT.side = 'outside'; CUT.dia = 3.175; CUT.toolChosen = true; CUT.through = true; CUT.feed = 1000; CUT.step = 1;
    cutApply();
    log.push('toolpath made: ' + tpList().length + ' toolpath, ' + tpList()[0].moves.length + ' moves');
    let text = null;
    window.showSaveFilePicker = (o) => Promise.resolve({ name: o.suggestedName, createWritable: () => Promise.resolve({ write: (t) => { text = t; return Promise.resolve(); }, close: () => Promise.resolve() }) });
    tpExport();
    await until(() => text !== null, 5000, 'the G-code');
    log.push('G-code saved: ' + text.split('\n').length + ' lines');
    await until(() => localStorage.getItem('454-e2e-shared'), 15000, 'the note Control saved');
    log.push('saved by Control, read by Design: "' + localStorage.getItem('454-e2e-shared') + '"');
    return { ok: true, log };
  } catch (e) { return { ok: false, error: e.message, log }; }
})()
