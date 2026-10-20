// Jogging with a game controller (gamepad.js), on Control's real jogging (jogging.js), with a stand-in controller
// and machine that record what would be sent to GRBL.
//   node --test 'apps/control/test/*.test.mjs'
// What matters most: it moves only while held and only when the jog panel could, stops when let go or when anything
// goes wrong, and never starts anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control({ enabled = true } = {}) {
  const pad = { index: 0, id: 'Xbox Wireless Controller', connected: true, axes: [0, 0, 0, 0],
                buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const C = vm.createContext({
    sent: [], rt: [], log: [], held: 0, saved: 0, pads: [pad], visible: 'visible', now: 1000,
    PROFILE: { jog: { inc: '1', fastXY: 3000, fastZ: 600 }, gamepad: { enabled } },
    SERIAL: { connected: true, state: 'Idle', homedSeen: false, settings: {}, mpos: { x: 0, y: 0, z: 0 } },
    JOB: { active: false, held: false }, PROBE: { active: false }, QA: { active: false },
    JOGC: { active: false, timer: null, limitHit: false, inflight: 0, p: null, dist: 0, feed: 0, pred: { x: 0, y: 0, z: 0 }, owner: null, alive: 0 },
    KEYJOG: { code: null }, TOOLWAIT: false, timers: [],
    Math, JSON, Object, Array,
  });
  vm.runInContext(`
    var navigator = {getGamepads: function () { return pads; }};
    var document = {get visibilityState(){ return visible; }, getElementById: function () { return null; }};
    var Date = {now: function () { return now; }};
    var setInterval = function (f) { timers.push(f); return timers.length; };
    var clearInterval = function (id) { if (id) timers[id - 1] = null; };
    function sendLine(t){ sent.push(t); JOGC.inflight > 0 && 0; }
    function sendRT(b){ rt.push(b); }
    function logC(c, t){ log.push([c, t]); }
    function axisRange(){ return null; }
    function atToolChange(){ return TOOLWAIT; }
    function jobHold(){ held++; JOB.held = true; }
    function setIncUI(){}
    function profileSave(){ saved++; }
  `, C);
  vm.runInContext(read('../src/js/jogging.js'), C, { filename: 'jogging.js' });
  vm.runInContext(read('../src/js/gamepad.js'), C, { filename: 'gamepad.js' });
  C.pad = pad;
  // one poll of the controller, after 50 ms
  C.poll = () => { C.now += 50; vm.runInContext('gpadPoll()', C); };
  C.stick = (lx, ly, rz) => { pad.axes = [lx || 0, ly || 0, 0, rz || 0]; };
  C.press = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
  C.jogs = () => C.sent.filter((t) => /^\$J=/.test(t));
  C.cancels = () => C.rt.filter((b) => b === 0x85).length;
  // its first look at the controller (which counts no command)
  C.ready = () => { C.poll(); C.sent.length = 0; C.rt.length = 0; };
  return C;
}

test('off until switched on in Settings: a stick pushed sends nothing', () => {
  const C = control({ enabled: false });
  C.poll(); C.stick(1, 0); C.poll(); C.poll();
  assert.equal(C.sent.length, 0);
});

test('the left stick jogs X and Y while held, at the Fast speed, and letting go cancels the jog', () => {
  const C = control(); C.ready();
  C.stick(1, 0); C.poll();
  assert.ok(C.jogs().length >= 1, 'jogging');
  assert.match(C.jogs()[0], /^\$J=G21G91X[\d.]+F3000$/, 'right, at 3000 mm/min');
  C.stick(0.3, 0); C.poll();
  assert.equal(C.cancels(), 0, 'eased off, but past a quarter: still going');
  C.stick(0.1, 0); C.poll();
  assert.equal(C.cancels(), 1, 'let go: cancelled');
  assert.equal(C.JOGC.active, false);
});

test('a push short of half way doesn’t start a jog', () => {
  const C = control(); C.ready();
  C.stick(0.4, 0); C.poll();
  assert.equal(C.jogs().length, 0);
});

test('eight directions: up and to the left jogs X− and Y+ together; the stick’s up is Y+', () => {
  const C = control(); C.ready();
  C.stick(-0.7, -0.7); C.poll();
  assert.match(C.jogs()[0], /^\$J=G21G91X-[\d.]+Y[\d.]+F3000$/);
});

test('the right stick jogs Z at the Fast Z speed; LB held makes it a fifth', () => {
  const C = control(); C.ready();
  C.stick(0, 0, -0.9); C.poll();
  assert.match(C.jogs()[0], /^\$J=G21G91Z[\d.]+F600$/, 'up');
  C.stick(0, 0, 0); C.poll();
  C.press(4, true); C.stick(0, 0, 0.9); C.poll();
  assert.match(C.jogs().pop(), /^\$J=G21G91Z-[\d.]+F120$/, 'down, slowly');
});

test('pushed a new way while jogging: it stops, and needs the stick back in the middle before it goes again', () => {
  const C = control(); C.ready();
  C.stick(1, 0); C.poll();
  const n = C.jogs().length;
  C.stick(0, -1); C.poll();
  assert.equal(C.cancels(), 1, 'stopped');
  C.poll(); C.poll();
  assert.equal(C.jogs().length, n, 'and doesn’t go the new way');
  C.stick(0, 0); C.poll(); C.stick(0, -1); C.poll();
  assert.match(C.jogs().pop(), /^\$J=G21G91Y[\d.]+F3000$/, 'back to the middle, then it does (pushed up: Y+)');
});

test('steps: one per press of the D-pad, Y and A, of the size chosen; X changes the size', () => {
  const C = control(); C.ready();
  C.press(15, true); C.poll(); C.poll(); C.poll();
  assert.deepEqual(C.jogs(), ['$J=G21G91X1.000F1000'], 'one step for one press, however long it’s held');
  C.press(15, false); C.poll();
  C.press(3, true); C.poll(); C.press(3, false); C.poll();
  C.press(0, true); C.poll(); C.press(0, false); C.poll();
  assert.deepEqual(C.jogs().slice(1), ['$J=G21G91Z1.000F600', '$J=G21G91Z-1.000F600']);
  C.press(2, true); C.poll(); C.press(2, false); C.poll();
  assert.equal(C.PROFILE.jog.inc, '10');
  assert.equal(C.saved, 1, 'remembered');
  C.press(14, true); C.poll();
  assert.equal(C.jogs().pop(), '$J=G21G91X-10.000F2500');
  C.PROFILE.jog.inc = 'fast'; C.press(14, false); C.poll(); C.press(13, true); C.poll();
  assert.equal(C.jogs().pop(), '$J=G21G91Y-1.000F1000', 'the jog panel on Fast: steps of 1 mm');
});

test('the press that wakes the controller, and a stick already pushed then, do nothing', () => {
  const C = control();
  C.press(0, true); C.stick(1, 0);
  C.poll(); C.poll();
  assert.equal(C.sent.length, 0);
  C.stick(0, 0); C.poll(); C.press(0, false); C.poll();
  C.press(0, true); C.poll();
  assert.equal(C.jogs().length, 1, 'pressed again: now it steps');
});

test('B stops a jog; during a job it holds; and it never resumes, starts or zeroes anything', () => {
  const C = control(); C.ready();
  C.stick(1, 0); C.poll();
  C.press(1, true); C.poll();
  assert.equal(C.cancels(), 1);
  assert.equal(C.JOGC.active, false);
  C.press(1, false); C.poll(); C.poll();
  assert.equal(C.JOGC.active, false, 'the stick still pushed: it waits for the middle');
  C.stick(0, 0); C.poll();
  C.JOB.active = true; C.SERIAL.state = 'Run';
  C.sent.length = 0; C.rt.length = 0;                     // (from here on: during the job)
  C.press(1, true); C.poll();
  assert.equal(C.held, 1, 'Hold');
  C.press(1, false); C.poll();
  for (const b of [0, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) { C.press(b, true); C.poll(); C.press(b, false); C.poll(); }
  assert.equal(C.sent.filter((t) => !/^\$J=/.test(t)).length, 0, 'nothing but jogs is ever sent');
  assert.equal(C.rt.length, 0, 'and no realtime command (Hold is jobHold)');
  assert.equal(C.jogs().length, 0, 'no jogs during a job');
});

test('during a job it doesn’t jog, and says so once; at a tool change it does', () => {
  const C = control(); C.ready();
  C.JOB.active = true; C.SERIAL.state = 'Run';
  C.stick(1, 0); C.poll(); C.poll(); C.poll();
  assert.equal(C.jogs().length, 0);
  assert.equal(C.log.filter((l) => /can.t jog now/.test(l[1])).length, 1, 'said once');
  C.stick(0, 0); C.poll();
  C.SERIAL.state = 'Idle'; C.TOOLWAIT = true;
  C.stick(1, 0); C.poll();
  assert.equal(C.jogs().length >= 1, true, 'stopped at a tool change: jogs');
});

test('not during a job even when the machine says Idle for a moment (between commands, as a job starts)', () => {
  const C = control(); C.ready();
  C.JOB.active = true; C.SERIAL.state = 'Idle';
  C.stick(1, 0); C.poll(); C.press(15, true); C.poll();
  assert.equal(C.jogs().length, 0);
});

test('not while probing, running a quick action, locked or disconnected', () => {
  for (const set of [(C) => { C.PROBE.active = true; }, (C) => { C.QA.active = true; }, (C) => { C.SERIAL.state = 'Alarm'; }, (C) => { C.SERIAL.connected = false; }]) {
    const C = control(); C.ready(); set(C);
    C.stick(1, 0); C.poll(); C.press(15, true); C.poll();
    assert.equal(C.jogs().length, 0);
  }
});

test('stops when the controller goes away, when the page is hidden, and when it’s switched off', () => {
  const C = control(); C.ready();
  C.stick(1, 0); C.poll();
  C.pads.length = 0; C.poll();
  assert.equal(C.cancels(), 1, 'unplugged');
  const D = control(); D.ready();
  D.stick(1, 0); D.poll();
  D.visible = 'hidden'; D.poll();
  assert.equal(D.cancels(), 1, 'hidden');
  D.visible = 'visible'; D.poll(); D.poll();
  assert.equal(D.JOGC.active, false, 'back in front with the stick still pushed: waits for the middle');
  const E = control(); E.ready();
  E.stick(1, 0); E.poll();
  E.PROFILE.gamepad.enabled = false; E.poll();
  assert.equal(E.cancels(), 1, 'switched off');
});

test('if the controller stops being polled, the jog stops by itself within 300 ms', () => {
  const C = control(); C.ready();
  C.stick(1, 0); C.poll();
  const tick = C.timers.filter(Boolean).pop();           // the jog's own 100 ms timer (jogging.js)
  C.now += 100; tick();
  assert.equal(C.JOGC.active, true, 'still being polled, recently');
  C.now += 250; tick();
  assert.equal(C.JOGC.active, false, 'no poll for 350 ms: stopped');
  assert.equal(C.cancels(), 1);
});
