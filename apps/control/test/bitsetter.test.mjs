// The BitSetter's search speed (apps/control/src/js/bitsetter.js): fast enough not to keep you waiting,
// never so fast the machine coasts more than half a millimetre past the switch while it stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { bitSetterSeekRate } = require('../src/js/bitsetter.js');
const coast = (rate, accel) => (rate / 60) ** 2 / (2 * accel);   // mm travelled while stopping from `rate` mm/min

test('a typical Shapeoko searches at 1000 mm/min, five times the old 200', () => {
  assert.equal(bitSetterSeekRate({ 122: 400, 112: 5000 }), 1000);
});
test('the search never coasts more than 0.5 mm past the switch, whatever the Z acceleration', () => {
  for (const a of [25, 50, 100, 200, 300, 400, 800]) {
    const r = bitSetterSeekRate({ 122: a, 112: 5000 });
    if (r > 200) assert.ok(coast(r, a) <= 0.5 + 1e-3, 'accel ' + a + ': ' + r + ' mm/min coasts ' + coast(r, a).toFixed(3));
  }
});
test('it\u2019s never slower than it used to be, and never faster than Z can go', () => {
  assert.equal(bitSetterSeekRate({ 122: 5, 112: 5000 }), 200);
  assert.equal(bitSetterSeekRate({ 122: 400, 112: 600 }), 600);
});
test('before the controller\u2019s settings are read, a middle course', () => {
  assert.equal(bitSetterSeekRate({}), 500);
  assert.equal(bitSetterSeekRate(undefined), 500);
});
