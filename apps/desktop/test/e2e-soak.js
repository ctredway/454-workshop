// The soak test's page script (soak.sh fills in SOAK_CFG): connects to the simulated machine, homes, zeroes, loads
// a long, dense 3D-finishing-style job (thousands of short moves a minute), runs it to the end, and samples how the
// page holds up: memory, page size, how late its timers run (a busy or frozen page), and progress. Optionally freezes
// the page on purpose partway through, to see what the machine does when the screen locks up.
(async () => {
  const CFG = SOAK_CFG;
  const log = [], samples = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { log.push('asked: ' + document.getElementById('dlgTitle').textContent); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal');
    if (h && !h.hidden) document.getElementById('homeGo').click();
  }, 100);
  // how late a 50 ms timer fires: the page's responsiveness
  let lagMax = 0, lastTick = performance.now();
  const lagTimer = setInterval(() => { const n = performance.now(); lagMax = Math.max(lagMax, n - lastTick - 50); lastTick = n; }, 50);
  try {
    // CFG.renderFps: draw the 3D view at most this often, to stand in for a PC with a graphics card when the test
    // runs on one without (there, every frame is drawn by the processor and slows everything else down)
    if (CFG.renderFps < 0) window.requestAnimationFrame = () => 0;     // -1: don't draw at all
    else if (CFG.renderFps) { const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 1000 / CFG.renderFps); }
    await serialConnect(true);
    await until(() => SERIAL.connected && SERIAL.settings && SERIAL.settings[130], 20000, 'the settings');
    await until(() => /Alarm|Idle/.test(SERIAL.state || ''), 10000, 'a status report');
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 60000, 'homing');
    sendLine('G53 G0 X-450 Y-450'); sendLine('G53 G0 Z-60');
    const at = (p) => SERIAL.mpos && Math.abs(SERIAL.mpos.x - p.x) < 0.01 && Math.abs(SERIAL.mpos.y - p.y) < 0.01 && Math.abs(SERIAL.mpos.z - p.z) < 0.01;
    await until(() => at({ x: -450, y: -450, z: -60 }) && SERIAL.state === 'Idle', 60000, 'the move to the work');
    sendLine('G10 L20 P1 X0 Y0 Z0');
    await until(() => SERIAL.wco && Math.abs(SERIAL.wco.z + 60) < 0.01, 10000, 'the work zero');
    // the job: raster rows across 300 mm, short moves (CFG.seg mm) with Z rolling, as a 3D finishing pass
    const g = ['G21', 'G90', 'M3 S16000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-1 F600', 'F' + CFG.feed];
    const rowSecs = 300 / CFG.feed * 60, rows = Math.ceil(CFG.minutes * 60 / rowSecs);
    for (let r = 0; r < rows; r++) {
      const y = (r % 400) * 0.5, n = Math.round(300 / CFG.seg);
      for (let i = 1; i <= n; i++) {
        const x = r % 2 ? 300 - i * CFG.seg : i * CFG.seg;
        g.push('G1 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + ' Z' + (-1 - 0.6 * Math.sin(x / 9) * Math.cos(y / 7)).toFixed(3));
      }
      g.push('G1 Y' + ((r + 1) % 400 * 0.5).toFixed(3));
    }
    g.push('G0 Z5', 'M5', 'M30');
    const t0 = performance.now();
    loadText(g.join('\n'), 'soak.nc');
    log.push('loaded ' + g.length + ' lines (' + (g.join('\n').length / 1e6).toFixed(1) + ' MB) in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s; estimate ' + (MODEL.totalTime / 60).toFixed(0) + ' min');
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    jobStart();
    await until(() => JOB.active, 30000, 'the job to start');
    const jt = performance.now(); log.push('job running');
    const freezes = (CFG.freezes || []).slice();
    let nextSample = 0, lastAcked = 0;
    while (JOB.active) {
      const el = (performance.now() - jt) / 1000;
      if (freezes.length && el >= freezes[0].at) {                  // lock the page up, on purpose
        const f = freezes.shift(), s = performance.now(); while (performance.now() - s < f.ms) { /* frozen */ }
        log.push('froze the page for ' + f.ms + ' ms at ' + el.toFixed(0) + ' s');
      }
      if (el >= nextSample) {
        const s = { t: Math.round(el), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null,
          dom: document.getElementsByTagName('*').length, consoleLines: document.getElementById('consoleLog').children.length,
          acked: JOB.acked, of: JOB.total, ackRate: Math.round((JOB.acked - lastAcked) / Math.max(1, CFG.sampleEvery)),
          lagMaxMs: Math.round(lagMax), visible: document.visibilityState, state: SERIAL.state };
        lastAcked = JOB.acked; lagMax = 0; samples.push(s); console.log('SOAK ' + JSON.stringify(s));
        nextSample += CFG.sampleEvery;
      }
      await wait(200);
    }
    log.push('job finished after ' + ((performance.now() - jt) / 60000).toFixed(1) + ' min; status: ' + document.getElementById('jobStatus').textContent);
    await wait(1500);
    if (window.gc) window.gc();
    return { ok: true, log, samples, heapStartMB: +(heap0 / 1e6).toFixed(1), state: SERIAL.state,
             consoleTail: Array.from(document.querySelectorAll('#consoleLog > *')).slice(-8).map((e) => e.textContent) };
  } catch (e) {
    return { ok: false, error: e.message, log, samples, state: SERIAL.state };
  } finally { clearInterval(answer); clearInterval(lagTimer); }
})()
