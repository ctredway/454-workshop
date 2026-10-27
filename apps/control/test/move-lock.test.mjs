// What can be pressed now (move-lock.js): every button that moves the machine, or changes its zero, is greyed while
// something else is moving it, and the job's own controls only when they mean something. Clint, 2026-10-23: "when the
// machine is moving, like a pause and lift, any other movement buttons need to be disabled"; and the Adjust panel's
// spindle speed hidden for a router. Control's real page and files, in a stand-in browser page.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control(o = {}) {
  const page = read('../src/control.html').replace(/^@@include .*$/gm, '');
  const { document } = parseHTML(page);
  document.querySelectorAll('script').forEach((s) => s.remove());   // the page's own code isn't run here
  const C = vm.createContext({ document });
  for (const f of ['../src/js/machine-state.js', '../src/js/move-lock.js']) vm.runInContext(read(f), C, { filename: f });
  Object.assign(C, {
    SERIAL: { connected: true, state: 'Idle' }, JOB: { active: false, toolWait: null, inflight: [] },
    PROBE: { active: false }, QA: { active: false }, PROFILE: { spindle: { type: 'vfd' } },
    ENDING: null, PAUSED: null, logs: [], logC: (c, t) => C.logs.push(t), atToolChange: () => false,
  }, o);
  C.el = (id) => document.getElementById(id);
  C.off = (id) => C.el(id).disabled;
  C.rp = () => [...document.querySelectorAll('[data-rp]')].every((b) => b.disabled);
  C.jog = () => [...document.querySelectorAll('#jogGrid button')].every((b) => b.disabled);
  return C;
}
const MOVES = ['homeBtn', 'gotoZero', 'jogZ6', 'jogProbe', 'jogTool', 'zeroX', 'zeroY', 'zeroZ', 'zeroAll', 'rbActions', 'jobRun', 'jobRecover', 'rbJog', 'jogOpen'];
const STOPS = ['estopBtn', 'rbEstop', 'jogEstop', 'spEstop', 'bzEstop'];
const states = (C, ids) => Object.fromEntries(ids.map((id) => [id, C.off(id)]));
const all = (ids, v) => Object.fromEntries(ids.map((id) => [id, v]));

test('idle, no job: everything that moves can be pressed; the job’s own controls can’t', () => {
  const C = control(); C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, false));
  assert.equal(C.rp(), false); assert.equal(C.jog(), false);
  assert.deepEqual(states(C, ['rbHold', 'rbResume', 'rbDoor', 'rbStop']), all(['rbHold', 'rbResume', 'rbDoor', 'rbStop'], true));
});
test('pausing (holding, then lifting): nothing else that moves, and no Hold, Resume or Pause & lift; STOP always', () => {
  const C = control({ ENDING: { stage: 'holding', pause: true } });
  C.JOB.active = true; C.SERIAL.state = 'Hold'; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
  assert.equal(C.rp(), true); assert.equal(C.jog(), true);
  assert.deepEqual(states(C, ['rbHold', 'rbResume', 'rbDoor', 'rbStop']), all(['rbHold', 'rbResume', 'rbDoor', 'rbStop'], true));
  assert.deepEqual(states(C, STOPS), all(STOPS, false));
  C.SERIAL.state = 'Run'; C.moveLockUI();                  // still slowing: the controller hasn't said Hold yet
  assert.equal(C.off('rbHold'), true, 'no second Hold while it pauses');
  // after the reset that clears the queue: the job isn't running and the controller says Idle, but it's still pausing
  C.JOB.active = false; C.ENDING.stage = 'reset'; C.SERIAL.state = 'Idle'; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
  assert.equal(C.jog(), true);
  assert.deepEqual(states(C, ['rbResume', 'rbStop']), { rbResume: true, rbStop: true });
});
test('paused, and held while lifting: still locked', () => {
  const C = control({ PAUSED: { line: 593 } });
  C.SERIAL.state = 'Hold'; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
  assert.equal(C.jog(), true);
});
test('paused, Z still lifting: still locked; once it’s at the top: Resume and End job, and jogging to look', () => {
  const C = control({ PAUSED: { line: 593 } });
  C.SERIAL.state = 'Run'; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
  assert.deepEqual(states(C, ['rbResume', 'rbStop']), { rbResume: true, rbStop: true });
  C.SERIAL.state = 'Idle'; C.moveLockUI();
  assert.deepEqual(states(C, ['rbResume', 'rbStop', 'rbDoor', 'rbHold']), { rbResume: false, rbStop: false, rbDoor: true, rbHold: true });
  assert.equal(C.jog(), false, 'jogging, to look');
  assert.deepEqual(states(C, ['jobRun', 'jobRecover']), { jobRun: true, jobRecover: true }, 'not another job');
});
test('a job cutting: only its own controls; held: Resume too', () => {
  const C = control();
  C.JOB.active = true; C.SERIAL.state = 'Run'; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
  assert.equal(C.jog(), true);
  assert.deepEqual(states(C, ['rbHold', 'rbDoor', 'rbStop', 'rbResume']), { rbHold: false, rbDoor: false, rbStop: false, rbResume: true });
  C.SERIAL.state = 'Hold'; C.moveLockUI();
  assert.equal(C.off('rbResume'), false);
});
test('at a job’s tool change: jogging and zeroing, but not Change tool… (the job’s prompt does that)', () => {
  const C = control({ atToolChange: () => true });
  C.JOB.active = true; C.JOB.toolWait = { tool: '2' }; C.moveLockUI();
  assert.deepEqual(states(C, ['zeroZ', 'jogOpen', 'jogProbe', 'jogTool']), { zeroZ: false, jogOpen: false, jogProbe: false, jogTool: true });
  assert.equal(C.jog(), false);
  assert.equal(C.off('rbDoor'), true, 'no Pause & lift at a tool change');
});
test('moving outside a job (Go to XY zero, homing): nothing else, but Hold; jogging: the jog buttons only', () => {
  for (const st of ['Run', 'Home']) {
    const C = control(); C.SERIAL.state = st; C.moveLockUI();
    assert.deepEqual(states(C, MOVES), all(MOVES, true), st);
    assert.equal(C.off('rbHold'), false, st + ': Hold stops it');
  }
  const C = control(); C.SERIAL.state = 'Jog'; C.moveLockUI();
  assert.equal(C.jog(), false, 'jogging: the jog buttons');
  assert.deepEqual(states(C, ['gotoZero', 'jogZ6', 'zeroZ', 'homeBtn']), all(['gotoZero', 'jogZ6', 'zeroZ', 'homeBtn'], true));
});
test('the keys and the game controller are refused too while pausing or lifting (requireIdle)', () => {
  const C = control({ ENDING: { stage: 'reset', pause: true } });
  assert.equal(C.requireIdle('jog'), false);
  assert.match(C.logs.at(-1), /^jog blocked — the job is pausing or ending/);
  C.ENDING = null; C.PAUSED = { line: 5 }; C.SERIAL.state = 'Run';
  assert.equal(C.requireIdle('lift'), false);
  C.SERIAL.state = 'Idle';
  assert.equal(C.requireIdle('jog'), true, 'paused and still: jogging to look is fine');
});
test('a router: no Spindle speed row in the Adjust panel (its speed is on its dial); a VFD: there', () => {
  const C = control(); C.PROFILE.spindle.type = 'router'; C.moveLockUI();
  assert.equal(C.el('ovSpItem').hidden, true);
  C.PROFILE.spindle.type = 'vfd'; C.moveLockUI();
  assert.equal(C.el('ovSpItem').hidden, false);
});
test('not connected: nothing that moves', () => {
  const C = control(); C.SERIAL.connected = false; C.moveLockUI();
  assert.deepEqual(states(C, MOVES), all(MOVES, true));
});
test('just after the lift is sent the controller still says Idle: locked until Z is at the top', () => {
  let now = 1000;
  const C = control({ performance: { now: () => now } });
  C.PAUSED = { line: 593, lifting: true, since: 1000, liftZ: -2 };
  C.SERIAL.state = 'Idle'; C.SERIAL.mpos = { x: 0, y: 0, z: -64.5 }; C.moveLockUI();
  assert.deepEqual(states(C, ['gotoZero', 'rbJog', 'rbResume']), { gotoZero: true, rbJog: true, rbResume: true }, 'Idle, but not lifted yet');
  C.SERIAL.state = 'Run'; C.SERIAL.mpos.z = -30; now += 500; C.moveLockUI();
  assert.equal(C.off('rbResume'), true, 'on its way up');
  C.SERIAL.state = 'Idle'; C.SERIAL.mpos.z = -2; now += 500; C.moveLockUI();
  assert.deepEqual(states(C, ['rbJog', 'rbResume']), { rbJog: false, rbResume: false }, 'at the top and still');
});
