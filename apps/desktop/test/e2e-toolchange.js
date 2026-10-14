// Runs inside the app's page: Change tool from the jog panel, through Control's own code, against the simulated
// machine with a BitSetter (P454_SIM_PROBE). Zero Z (which takes the reference), start the spindle, then change
// the tool: it must lift, stop the spindle, go to the tool-change position, and measure the new bit.
(async () => {
  const log = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms, what) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting for ' + what); await wait(50); } };
  const notes = [], samples = [];
  const answer = setInterval(() => {
    const d = document.getElementById('dlgModal');
    if (d && !d.hidden) { notes.push(document.getElementById('dlgTitle').textContent + ' [' + document.getElementById('dlgOk').textContent + ']'); document.getElementById('dlgOk').click(); }
    const h = document.getElementById('homeModal');
    if (h && !h.hidden) document.getElementById('homeGo').click();
  }, 100);
  const sampler = setInterval(() => samples.push({ z: SERIAL.mpos.z, x: SERIAL.mpos.x, y: SERIAL.mpos.y, s: SERIAL.speed, st: SERIAL.state }), 50);
  try {
    await serialConnect(true);
    await until(() => SERIAL.connected, 5000, 'the port to open');
    await until(() => SERIAL.settings && SERIAL.settings[130], 15000, 'the settings');
    await until(() => /Alarm|Idle/.test(SERIAL.state || ''), 10000, 'a status report');
    if (!SERIAL.homedSeen) sendLine('$H');
    await until(() => SERIAL.homedSeen && SERIAL.state === 'Idle', 30000, 'homing'); log.push('homed');
    PROFILE.bitSetter.enabled = true; PROFILE.bitSetter.x = -100; PROFILE.bitSetter.y = -50;
    PROFILE.run.tc = { enabled: true, preset: 'fc' };
    sendLine('G53 G0 X-300 Y-300 Z-40');                    // somewhere over the work
    await wait(300); await until(() => SERIAL.state === 'Idle', 20000, 'the move');
    zeroZNow();                                               // Zero Z: offers to measure the reference (answered yes)
    await until(() => PROBE.refZ !== null && !PROBE.active && SERIAL.state === 'Idle', 60000, 'the reference');
    log.push('reference taken at machine Z ' + PROBE.refZ.toFixed(3));
    sendLine('G53 G0 X-300 Y-300 Z-40'); await wait(300); await until(() => SERIAL.state === 'Idle', 20000, 'back over the work');
    sendLine('M3 S12000'); await until(() => SERIAL.speed > 0, 5000, 'the spindle');
    log.push('spindle on, at machine Z ' + SERIAL.mpos.z.toFixed(1));
    const c0 = document.getElementById('consoleLog').children.length, s0 = samples.length;
    jogModalOpen();
    document.getElementById('jogTool').click();
    await until(() => notes.some((n) => /^Change the bit now/.test(n)), 60000, 'the change prompt');
    await until(() => !PROBE.active && SERIAL.state === 'Idle' && document.getElementById('dlgModal').hidden && !document.getElementById('jogModal').hidden, 60000, 'the measurement');
    await wait(400);
    const sent = Array.from(document.getElementById('consoleLog').children).slice(c0).map((d) => d.textContent).filter((t) => /^→|BitSetter|tool/.test(t));
    const ss = samples.slice(s0);
    const firstStopped = ss.findIndex((p) => p.s === 0);
    return { ok: true, log, notes, sent, spindleStoppedAtZ: firstStopped >= 0 ? ss[firstStopped].z : null,
             lowestZWhileSpinning: Math.min(...ss.filter((p) => p.s > 0).map((p) => p.z)),
             end: { mpos: SERIAL.mpos, state: SERIAL.state, tlo: PROBE.tlo, swapped: PROBE.toolSwapped, jogOpen: !document.getElementById('jogModal').hidden },
             tcSpot: toolChangeSpot(), travelZ: SERIAL.settings[132] };
  } catch (e) {
    return { ok: false, error: e.message, log, notes, state: SERIAL.state };
  } finally { clearInterval(answer); clearInterval(sampler); }
})()
