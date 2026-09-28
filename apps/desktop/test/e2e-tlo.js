// Runs inside the app's page: a tool length offset left over from an earlier job's tool change must not
// shift the next job's depth. (It did: Z zero was set with the old offset still active in the controller,
// and the next tool change replaced that offset, so the job cut deeper by the old offset.)
// Needs a probe switch where the BitSetter is: P454_SIM_PROBE=-100,-50,-70,5
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { log.push('asked: ' + document.getElementById('dlgTitle').textContent); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal');
    if (h && !h.hidden) document.getElementById('homeGo').click();
    const t = document.getElementById('toolModal');
    if (t && !t.hidden && !document.getElementById('toolContinue').disabled) { log.push('tool change: continued'); document.getElementById('toolContinue').click(); }
  }, 150);
  try {
    await serialConnect(true);
    await until(() => SERIAL.connected && SERIAL.settings && SERIAL.settings[130], 15000, 'the settings');
    await until(() => /Alarm|Idle/.test(SERIAL.state || ''), 10000, 'a status report');
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 30000, 'homing'); log.push('homed');
    PROFILE.bitSetter.enabled = true; PROFILE.bitSetter.x = -100; PROFILE.bitSetter.y = -50;
    sendLine('G43.1 Z20');                                   // left over from an earlier job's tool change
    log.push('a 20 mm tool length offset is active, as an earlier tool change would leave it');
    sendLine('G53 G0 X-400 Y-400'); sendLine('G53 G0 Z-60');
    const at = (p) => SERIAL.mpos && Math.abs(SERIAL.mpos.x - p.x) < 0.01 && Math.abs(SERIAL.mpos.y - p.y) < 0.01 && Math.abs(SERIAL.mpos.z - p.z) < 0.01;
    await until(() => at({ x: -400, y: -400, z: -60 }) && SERIAL.state === 'Idle', 30000, 'the move to the work');
    log.push('the tool touches the material top at machine Z -60');
    document.getElementById('zeroAll').click();              // Zero all, which offers the BitSetter reference
    await until(() => PROBE.refZ !== null && !PROBE.active, 60000, 'the reference');
    await until(() => SERIAL.state === 'Idle', 20000, 'the machine to settle');
    log.push('Z zero set; BitSetter reference taken');
    loadText(['G21', 'G90', 'M6 T9', 'M3 S18000', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-1 F300', 'G1 X20', 'G0 Z5', 'M5', 'M30'].join('\n'), 'starts-with-a-tool-change.nc');
    jobStart();
    await until(() => JOB.active, 15000, 'the job to start'); log.push('job running');
    await until(() => !JOB.active, 180000, 'the job to finish'); log.push('job finished');
    await wait(500);
    return { ok: true, log };
  } catch (e) {
    return { ok: false, error: e.message, log };
  } finally { clearInterval(answer); }
})()
