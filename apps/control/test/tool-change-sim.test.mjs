// Change tool against the simulated GRBL (packages/grbl, built by `npm run build`): Control's real Change tool,
// BitSetter and probing code, with the controller's answers fed back as serial.js feeds them (an ok moves the probe
// on; a [PRB:...] is its result). With no reference taken (Clint, 2026-10-22: it parked and then didn't measure),
// it must stop the spindle, measure the bit that's in, park, and measure the new bit against it.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GrblSim } from '../../../packages/grbl/dist/index.js';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const BS = { x: -100, y: -50 }, SPOT = { x: -400, y: -800, name: 'front centre' };

function rig(refZ) {
  const sim = new GrblSim({ settings: { 22: 1 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 },
                            probe: { x: BS.x, y: BS.y, z: -60, radius: 3 } });
  const C = vm.createContext({});
  for (const f of ['probing.js', 'bitsetter.js', 'tool-change.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });
  const log = [], sent = [];
  Object.assign(C, {
    SERIAL: { connected: true, homedSeen: true, state: 'Idle', pins: '', unacked: 0, settings: { ...sim.settings }, axisSeen: {} },
    JOB: { active: false }, PROFILE: { bitSetter: { enabled: true, x: BS.x, y: BS.y } }, ZN: { val: 0 },
    document: { getElementById: () => null },
    logC: (c, t) => log.push([c, t]), updateJobUI: () => {}, bzStatus: () => {}, maybeToolPrompt: () => {},
    requireIdle: () => true, qaBusy: () => false, travelZ: () => 5, topZ: () => 2, toolChangeSpot: () => SPOT,
    jogModalClose: () => log.push(['jog', 'close']), jogModalOpen: () => log.push(['jog', 'open']),
    uiNote: (t, b) => { log.push(['note', t, b]); return Promise.resolve(true); },
    uiDialog: (o) => {
      log.push(['ask', o.title, o.ok]);
      if (o.title === 'Change the bit now') sim.opts.probe.z = -58;            // the new bit is 2 mm longer
      return Promise.resolve(true);
    },
    sendLine: (s) => { sent.push(s); sim.write(s + '\n'); },
  });
  vm.runInContext('PROBE.refZ = ' + JSON.stringify(refZ), C);
  let read0 = 0;
  async function run(until, secs) {                     // the simulated machine, in steps of 10 ms
    for (let t = 0; t < secs && !until(); t += 0.01) {
      sim.step(0.01);
      while (read0 < sim.out.length) {
        const line = sim.out[read0++];
        const m = /^\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):(\d)\]/.exec(line);
        if (m) C.probeOnPRB(+m[3], m[4] === '1');
        else if (line === 'ok' && C.PROBE.active) C.probeNext();
        else if (/^(ALARM|error)/.test(line)) log.push(['controller', line]);
      }
      C.SERIAL.state = sim.state;
      await new Promise((r) => setImmediate(r));       // let the dialogs' answers through
    }
  }
  return { sim, C, log, sent, run };
}

async function homeAndWork(R) {
  R.sim.write('$H\n'); await R.run(() => R.sim.homed && R.sim.state === 'Idle', 60);
  R.sendLine = R.C.sendLine;
  R.C.sendLine('G53 G0 X-300 Y-300 Z-40'); R.C.sendLine('M3 S12000');
  await R.run(() => R.sim.state === 'Idle' && R.sim.spindle.on, 30);
}

test('no reference yet: spindle stopped, the bit that’s in measured, then parked, then the new bit measured against it', async () => {
  const R = rig(null);
  await homeAndWork(R);
  assert.equal(R.sim.spindle.on, true);
  R.C.toolChangeStart();
  await R.run(() => R.log.some((e) => e[0] === 'jog' && e[1] === 'open') || R.log.some((e) => e[0] === 'err'), 300);
  const errs = R.log.filter((e) => e[0] === 'err' || e[0] === 'controller');
  assert.deepEqual(errs, [], 'no failures');
  const refZ = vm.runInContext('PROBE.refZ', R.C);
  assert.ok(Math.abs(refZ - -60) < 0.05, 'the bit that set Z zero is the reference: ' + refZ);
  const g43 = R.sent.filter((s) => /^G43\.1/.test(s));
  assert.equal(g43.length, 1);
  assert.ok(Math.abs(+g43[0].slice(7) - 2) < 0.05, 'the new bit is 2 mm longer: ' + g43[0]);
  // the order of what the machine did
  const tl = R.sim.timeline;
  const probes = tl.filter((e) => e.kind === 'probe');
  assert.ok(probes.length >= 4, 'two touch-offs (fast then slow), twice');
  assert.ok(probes.every((e) => !e.spindleOn), 'the spindle was off for every touch-off');
  const firstProbe = tl.indexOf(probes[0]), lastProbe = tl.indexOf(probes[probes.length - 1]);
  const park = tl.findIndex((e) => e.kind === 'move' && Math.abs(e.to.x - SPOT.x) < 0.01 && Math.abs(e.to.y - SPOT.y) < 0.01);
  assert.ok(firstProbe < park && park < lastProbe, 'measured, then parked, then measured again');
  const m5 = R.sent.indexOf('M5'), lift = R.sent.indexOf('G53 G0 Z-2.0');
  assert.ok(lift >= 0 && lift < m5, 'lifted before the spindle stopped');
  assert.deepEqual(R.log.filter((e) => e[0] === 'ask').map((e) => e[2]), ['Go', 'Measure the new bit']);
});

test('with a reference already: straight to the tool-change position, then the new bit measured', async () => {
  const R = rig(-60);
  await homeAndWork(R);
  R.C.toolChangeStart();
  await R.run(() => R.log.some((e) => e[0] === 'jog' && e[1] === 'open') || R.log.some((e) => e[0] === 'err'), 300);
  const tl = R.sim.timeline, probes = tl.filter((e) => e.kind === 'probe');
  const park = tl.findIndex((e) => e.kind === 'move' && Math.abs(e.to.x - SPOT.x) < 0.01);
  assert.ok(park >= 0 && probes.length >= 2 && tl.indexOf(probes[0]) > park, 'parked first, measured once');
  const g43 = R.sent.filter((s) => /^G43\.1/.test(s));
  assert.ok(g43.length === 1 && Math.abs(+g43[0].slice(7) - 2) < 0.05, String(g43));
});
