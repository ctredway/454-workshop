// Inside 454 Control's page: the simulated GRBL machine plugged in where the serial port goes (no virtual serial port
// needed, so it runs on Windows too), a two-toolpath job run, paused and lifted partway through the first, Resume pressed
// while Z is still lifting, then paused and resumed again, then ended and Resume pressed. Run by e2e-pause.mjs, which
// puts GrblSim and GCODE (made by the CAM engine) in front of this.
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(20); } };
  const asked = [];
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { asked.push(document.getElementById('dlgTitle').textContent); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal'); if (h && !h.hidden) document.getElementById('homeGo').click();
  }, 50);
  const sim = new GrblSim({ settings: { 22: 1, 110: 5000, 111: 5000, 112: 1500 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 } });
  let ctrl = null, sent = 0, last = performance.now();
  const enc = new TextEncoder(), dec = new TextDecoder();
  const port = {
    getInfo: () => ({}), open: async () => {}, close: async () => {},
    readable: new ReadableStream({ start(c) { ctrl = c; } }),
    writable: new WritableStream({ write(chunk) { sim.write(dec.decode(chunk)); } }),
  };
  const pump = setInterval(() => {
    const now = performance.now(); sim.step(Math.min(0.1, (now - last) / 1000) * 4); last = now;   // four times real speed
    while (sent < sim.out.length && ctrl) ctrl.enqueue(enc.encode(sim.out[sent++] + '\r\n'));
  }, 10);
  const atLine = () => (sim.running && sim.running.b ? sim.running.b.line : null);
  try {
    navigator.serial.requestPort = async () => port;
    await serialConnect(true);
    await until(() => SERIAL.connected && SERIAL.settings && SERIAL.settings[130], 15000, 'the settings');
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 30000, 'homing');
    sendLine('G53 G0 X-500 Y-500 Z-60');
    await until(() => SERIAL.state === 'Idle' && Math.abs(SERIAL.mpos.z + 60) < 0.01, 30000, 'the move');
    sendLine('G10 L20 P1 X0 Y0 Z0'); await wait(600);
    loadText(GCODE, 'two-profiles.nc');
    PROFILE.spindle.spinup = 1;
    jobStart();
    await until(() => JOB.active, 15000, 'the job to start');
    await until(() => JOB.lastLn >= 600, 120000, 'line 600 to be sent');
    await wait(300);
    const exec1 = atLine(), wpos1 = Object.assign({}, SERIAL.wpos);
    log.push('pausing: Control had sent up to line ' + JOB.lastLn + '; the machine was running "' + exec1 + '" at work X' + wpos1.x.toFixed(2) + ' Y' + wpos1.y.toFixed(2) + ' Z' + wpos1.z.toFixed(2));
    jobPauseLift();
    await until(() => PAUSED, 30000, 'paused');                      // Resume pressed at once, while Z is still rising
    const liftingAt = SERIAL.mpos.z;
    const off = (id) => document.getElementById(id).disabled;
    log.push('while lifting: Go to XY zero ' + (off('gotoZero') ? 'greyed' : 'PRESSABLE') + ', jog ' + (off('rbJog') ? 'greyed' : 'PRESSABLE') +
             ', Resume ' + (off('rbResume') ? 'greyed' : 'PRESSABLE') + ', STOP ' + (off('rbEstop') ? 'GREYED' : 'pressable'));
    log.push('paused: PAUSED.line ' + PAUSED.line + ' = "' + MODEL.lines[PAUSED.line - 1] + '"; Resume pressed with machine Z at ' + liftingAt.toFixed(2));
    jobResume();
    await until(() => JOB.active, 15000, 'carrying on (1)');
    log.push('resume 1: asked ' + JSON.stringify(asked.slice(-1)));
    await until(() => SERIAL.state === 'Run' && SERIAL.wpos.z < -0.05, 60000, 'cutting again');
    await wait(200);
    log.push('distance from where it stopped: ' + Math.hypot(SERIAL.wpos.x - wpos1.x, SERIAL.wpos.y - wpos1.y).toFixed(2) + ' mm; cutting again at work X' + SERIAL.wpos.x.toFixed(2) + ' Y' + SERIAL.wpos.y.toFixed(2) + ' Z' + SERIAL.wpos.z.toFixed(2) + ', running "' + atLine() + '"');
    await wait(1500);
    log.push('second pause: sent up to ' + JOB.lastLn + ', running "' + atLine() + '"');
    jobPauseLift();
    await until(() => PAUSED && SERIAL.state === 'Idle' && SERIAL.mpos.z > -2.5, 30000, 'paused again');
    await wait(500);
    log.push('paused again: PAUSED.line ' + PAUSED.line + '; JOB.active ' + JOB.active + ', ENDING ' + !!ENDING);
    const n = asked.length;
    jobResume();
    await wait(2000);
    log.push('resume 2: asked ' + JSON.stringify(asked.slice(n)) + '; JOB.active ' + JOB.active + '; PAUSED ' + JSON.stringify(PAUSED));
    await until(() => SERIAL.state === 'Run' && SERIAL.wpos.z < -0.05, 60000, 'cutting again (2)'); await wait(200);
    jobStop(); await until(() => !JOB.active && !ENDING && SERIAL.state === 'Idle', 60000, 'the job to end'); await wait(1500);
    const n2 = asked.length; jobResume(); await wait(500);
    log.push('Resume after End job: asked ' + JSON.stringify(asked.slice(n2)));
    return { ok: true, log, asked, console: Array.from(document.querySelectorAll('#consoleLog > *')).slice(-30).map((e) => e.textContent) };
  } catch (e) {
    return { ok: false, error: e.message, log, asked, state: SERIAL.state, console: Array.from(document.querySelectorAll('#consoleLog > *')).slice(-30).map((e) => e.textContent) };
  } finally { clearInterval(answer); clearInterval(pump); }
})()
