// Runs inside the app's page: the BitSetter, through Control's own code, against the simulated machine's
// probe switch (P454_SIM_PROBE). Checks it's found at the faster search speed, then measured slowly.
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  const notes = [];
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { notes.push(document.getElementById('dlgTitle').textContent + ': ' + (document.getElementById('dlgBody') || {}).textContent); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal');
    if (h && !h.hidden) document.getElementById('homeGo').click();
  }, 100);
  try {
    await serialConnect(true);
    await until(() => SERIAL.connected, 5000, 'the port to open');
    await until(() => SERIAL.settings && SERIAL.settings[130], 15000, 'the settings');
    log.push('Z acceleration ($122) ' + SERIAL.settings[122] + ' mm/s\u00b2, Z max rate ($112) ' + SERIAL.settings[112] + ' mm/min');
    await until(() => /Alarm|Idle/.test(SERIAL.state || ''), 10000, 'a status report');
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 30000, 'homing'); log.push('homed');
    PROFILE.bitSetter.enabled = true; PROFILE.bitSetter.x = -100; PROFILE.bitSetter.y = -50;
    const seek = probeSteps().find((s) => s.capture === 'zf').cmd, fine = probeSteps().find((s) => s.capture === 'z').cmd;
    log.push('search: ' + seek + ' | measure: ' + fine);
    const t0 = Date.now();
    bsTest();
    await until(() => notes.some((n) => /^BitSetter test/.test(n) && !/^Test the/.test(n)) || notes.some((n) => /fail|couldn/i.test(n)), 120000, 'the test to finish');
    log.push('probe took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    await wait(300);
    return { ok: true, log, notes, state: SERIAL.state };
  } catch (e) {
    return { ok: false, error: e.message, log, notes, state: SERIAL.state };
  } finally { clearInterval(answer); }
})()
