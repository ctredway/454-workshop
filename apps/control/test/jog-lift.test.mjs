// The jog panel's Z to +6 mm (jogging.js jogLiftZ6): Z to 6 mm above the work's Z zero, up or down, as in Carbide
// Motion, so the zero can be checked with a 6 mm block. Clint, 2026-10-23: it lifted 6 mm from where Z was ("the correct
// thing is to go down to the current Z for the material, not the machine travel"). Control's real file, with the
// machine replaced by a recorder; then the same command run on the simulated GRBL machine.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GrblSim } from '../../../packages/grbl/dist/index.js';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
// a homed Shapeoko 5 Pro (Z 120 mm of travel, 0 at the top) with Z zero set wcoZ below the top, Z now at z
function control(z, wcoZ, more = {}) {
  const C = vm.createContext({});
  vm.runInContext(read('../src/js/jogging.js'), C, { filename: 'jogging.js' });
  vm.runInContext(read('../src/js/bitsetter.js'), C, { filename: 'bitsetter.js' });
  Object.assign(C, {
    sent: [], logs: [],
    SERIAL: Object.assign({ homedSeen: true, settings: { 130: 1237, 131: 1237, 132: 120 }, mpos: { x: -300, y: -300, z },
                            wco: { x: -500, y: -500, z: wcoZ }, axisSeen: {} }, more),
    PROFILE: { jog: { fastZ: 800 }, bitSetter: { enabled: false } },
    JOGC: { active: false, pred: { x: 0, y: 0, z: 0 } },
    requireIdle: () => true,
    sendLine: (s) => C.sent.push(s),
    logC: (c, t) => C.logs.push(c + ': ' + t),
  });
  return C;
}

test('from near the top, Z goes down to 6 mm above Z zero', () => {
  const C = control(-5, -90);                                  // Z zero 90 mm down; Z 5 mm below the top
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G90Z6.000F800'], 'to Z 6 in the work’s coordinates, X and Y untouched');
  assert.ok(C.logs.some((t) => /6 mm above Z zero/.test(t)));
});
test('from below it (the bit at the material), Z goes up to 6 mm above Z zero: the same command', () => {
  const C = control(-90, -90);
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G90Z6.000F800']);
});
test('a Z zero closer to the top than 6 mm: as high as travel allows, and it says so', () => {
  const C = control(-3, -4);                                   // zero 4 mm below the top: 3.5 mm above it is the most
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G90Z3.500F800']);
  assert.ok(C.logs.some((t) => /only 4\.0 mm below the top/.test(t)), C.logs.join(' | '));
});
test('refused before homing, and with Z zero at the top: nothing sent', () => {
  const C = control(-50, -90, { homedSeen: false });
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], []);
  assert.ok(C.logs.some((t) => /^err: .*homed/.test(t)));
  const T = control(-50, 0);
  T.jogLiftZ6();
  assert.deepEqual([...T.sent], []);
  assert.ok(T.logs.some((t) => /^err: .*Set Z zero again/.test(t)));
});
test('on the simulated machine: from near the top, and from below, Z ends 6 mm above Z zero', () => {
  for (const startZ of [-2, -95]) {
    const sim = new GrblSim({ start: { x: -300, y: -300, z: -90 } });
    const send = (l) => sim.write(l + '\n');
    const settle = () => { for (let t = 0; t < 60 && (sim.planner.length || sim.running); t += 0.01) sim.step(0.01); };
    send('$X'); send('G21 G90'); send('G10 L20 P1 Z0'); settle();     // Z zero at machine Z -90
    send('G53 G0 Z' + startZ); settle();
    const st0 = /MPos:[-\d.]+,[-\d.]+,([-\d.]+).*WCO:[-\d.]+,[-\d.]+,([-\d.]+)/.exec(sim.status());
    const C = control(+st0[1], +st0[2]);
    C.jogLiftZ6();
    C.sent.forEach(send); settle();
    const st = /MPos:([-\d.]+),([-\d.]+),([-\d.]+).*WCO:[-\d.]+,[-\d.]+,([-\d.]+)/.exec(sim.status());
    assert.ok(Math.abs((+st[3] - +st[4]) - 6) < 1e-6, 'from machine Z ' + startZ + ': work Z ' + (+st[3] - +st[4]));
    assert.deepEqual([+st[1], +st[2]], [-300, -300], 'X and Y stay put');
    assert.deepEqual(sim.out.filter((l) => /^(error|ALARM)/.test(l)), [], 'the controller took every line');
  }
});
