// Runs inside the app's page: does what you'd do at the machine, through Control's own code.
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  const consoleTail = () => Array.from(document.querySelectorAll('#consoleLog > *')).slice(-12).map((e) => e.textContent);
  // answer any question with its default button, but note what was asked
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { log.push('asked: ' + document.getElementById('dlgTitle').textContent); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal');
    if (h && !h.hidden) { log.push('asked: home the machine?'); document.getElementById('homeGo').click(); }
  }, 100);
  try {
    localStorage.setItem('454-e2e-shared', 'hello from Control');     // for the Design window to find
    log.push('Web Serial is the desktop stand-in: ' + (typeof navigator.serial.requestPort === 'function' && !!window.desktop454));
    await serialConnect(true);
    await until(() => SERIAL.connected, 5000, 'the port to open'); log.push('connected');
    await until(() => SERIAL.settings && SERIAL.settings[130], 15000, 'the settings'); log.push('settings read: $130=' + SERIAL.settings[130] + ', $22=' + SERIAL.settings[22]);
    await until(() => /Alarm|Idle/.test(SERIAL.state || ''), 10000, 'a status report'); log.push('state after connecting: ' + SERIAL.state);
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 30000, 'homing'); log.push('homed, Idle');
    sendLine('G53 G0 X-400 Y-400'); sendLine('G53 G0 Z-60');
    // Wait until the machine has ARRIVED and is Idle. Waiting only for Idle raced the status reports:
    // the last report before the move still said Idle, so the test went on while the machine was
    // travelling, and Run was (rightly) refused with "Machine isn't ready".
    const at = (p) => SERIAL.mpos && Math.abs(SERIAL.mpos.x - p.x) < 0.01 && Math.abs(SERIAL.mpos.y - p.y) < 0.01 && Math.abs(SERIAL.mpos.z - p.z) < 0.01;
    await until(() => at({ x: -400, y: -400, z: -60 }) && SERIAL.state === 'Idle', 30000, 'the move to the work');
    sendLine('G10 L20 P1 X0 Y0 Z0');
    await until(() => SERIAL.wco && Math.abs(SERIAL.wco.x + 400) < 0.01 && Math.abs(SERIAL.wco.y + 400) < 0.01 && Math.abs(SERIAL.wco.z + 60) < 0.01, 10000, 'the work zero');
    log.push('work zero set at machine X-400 Y-400 Z-60');
    loadText(['G21', 'G90', 'M3 S12000', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-1 F300', 'G1 X30 F1500', 'G1 Y30', 'G1 X10', 'G1 Y10', 'G0 Z5', 'M5', 'M30'].join('\n'), 'square.nc');
    log.push('loaded a 20 mm square; spin-up wait ' + PROFILE.spindle.spinup + ' s');
    jobStart();
    await until(() => JOB.active, 15000, 'the job to start'); log.push('job running');
    await until(() => !JOB.active, 180000, 'the job to finish'); log.push('job finished');
    await wait(500);
    return { ok: true, log, state: SERIAL.state, console: consoleTail() };
  } catch (e) {
    return { ok: false, error: e.message, log, state: SERIAL.state, console: consoleTail() };
  } finally { clearInterval(answer); }
})()
