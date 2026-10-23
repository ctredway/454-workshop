// The jog panel's Z +6 mm (jogging.js jogLiftZ6): a 6 mm lift from where Z is now, cut short at the top of travel.
// Clint, 2026-10-22: it did nothing. It measured the room above from the position a held jog last started from (the top,
// before any held jog), so it found none. Control's real file, with the machine replaced by a recorder.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control(z) {
  const C = vm.createContext({});
  vm.runInContext(read('../src/js/jogging.js'), C, { filename: 'jogging.js' });
  vm.runInContext(read('../src/js/bitsetter.js'), C, { filename: 'bitsetter.js' });
  Object.assign(C, {
    sent: [], logs: [],
    SERIAL: { homedSeen: true, settings: { 130: 838, 131: 838, 132: 100 }, mpos: { x: -300, y: -300, z }, axisSeen: {} },
    PROFILE: { jog: { fastZ: 800 }, bitSetter: { enabled: false } },
    JOGC: { active: false, pred: { x: 0, y: 0, z: 0 } },       // as Control starts: no held jog yet
    requireIdle: () => true,
    sendLine: (s) => C.sent.push(s),
    logC: (c, t) => C.logs.push(t),
  });
  return C;
}

test('Z +6 mm lifts 6 mm from where Z is, before any held jog', () => {
  const C = control(-40);
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G91Z6.000F800']);
});

test('near the top it lifts only as far as the top of travel allows, and says so', () => {
  const C = control(-3);
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G91Z2.500F800']);
  assert.ok(C.logs.some((t) => /lifted 2\.5 mm/.test(t)));
});

test('after a held jog somewhere else, it still measures from where Z is now', () => {
  const C = control(-60);
  C.JOGC.pred = { x: -10, y: -10, z: -1 };                   // where an earlier held jog started
  C.jogLiftZ6();
  assert.deepEqual([...C.sent], ['$J=G21G91Z6.000F800']);
});
