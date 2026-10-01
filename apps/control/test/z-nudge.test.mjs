// The Z nudge in the Adjust panel (apps/control/src/js/overrides.js): it shifts the running job up or down, and
// it must not outlive that job. Left in the controller it shifts the next job by the same amount while the panel
// reads Z +0.00. Control's real files (overrides.js, job-run.js, job-streaming.js) run here against a stand-in
// machine that records every line sent.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = (f) => fs.readFileSync(new URL('../src/js/' + f, import.meta.url), 'utf8');
function control() {
  const sent = [], log = [], els = {};
  const el = (id) => els[id] || (els[id] = { style: {}, textContent: '', hidden: false, classList: { toggle() {} }, focus() {} });
  const C = vm.createContext({
    sent, log, els,
    SERIAL: { connected: true, state: 'Idle' },
    PROBE: { active: false, tlo: 0, refZ: null },
    JOB: { active: false, held: false, list: null, total: 0, idx: 0, acked: 0, inflight: [], toolWait: null },
    MODEL: null, RX_CAP: 100, PROFILE: { run: { tc: {}, park: {} } },
    document: { getElementById: el, querySelectorAll: () => [] },
    performance: { now: () => 1000 }, localStorage: { getItem: () => null, setItem() {} },
    sendLine: (s) => { sent.push(s); }, sendRT() {}, logC: (cls, t) => { log.push(t); },
    updateJobUI() {}, fmtTime: (s) => s + ' s', setTime() {},
  });
  for (const f of ['overrides.js', 'job-streaming.js', 'job-run.js']) vm.runInContext(src(f), C, { filename: f });
  // a job of `n` cutting lines, started the way jobStart leaves it
  C.start = (n) => {
    Object.assign(C.JOB, { active: true, held: false, toolWait: null, idx: 0, acked: 0, inflight: [], startedAt: 0, clock: null,
      list: Array.from({ length: n }, (_, i) => ({ text: 'G1 X' + i, ln: i + 1 })), total: n });
    C.ZN.val = 0;
    vm.runInContext('jobFill()', C);
  };
  C.answerAll = () => { let guard = 0; while (C.JOB.active && C.JOB.inflight.length && guard++ < 1000) vm.runInContext('onAck(true)', C); };
  C.run = (code) => vm.runInContext(code, C);
  return C;
}
const offsets = (C) => C.sent.filter((s) => /^G43\.1/.test(s));

test('a nudge during a job goes to the controller as the tool’s offset plus the nudge', () => {
  const C = control();
  C.PROBE.tlo = 0.5;
  C.start(3);
  C.run('znAdjust(0.1); znAdjust(0.1)');
  assert.deepEqual(offsets(C), ['G43.1 Z0.600', 'G43.1 Z0.700']);
  assert.equal(C.els.znLbl.textContent, 'Z +0.20');
});
test('when the job finishes the nudge comes off, and the tool’s own offset stays', () => {
  const C = control();
  C.PROBE.tlo = 0.5;
  C.start(3);
  C.run('znAdjust(0.1)');
  C.answerAll();
  assert.equal(C.JOB.active, false, 'the job finished');
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.500', 'the last thing sent puts the offset back to the tool’s alone');
  assert.equal(C.ZN.val, 0);
  assert.equal(C.els.znLbl.textContent, 'Z +0.00');
  assert.ok(C.log.some((t) => /Z nudge of \+0\.10 mm taken off/.test(t)), 'and the log says so');
});
test('a nudge up of 1 mm with no BitSetter: the controller is back at no offset for the next job', () => {
  const C = control();
  C.start(2);
  for (let i = 0; i < 10; i++) C.run('znAdjust(0.1)');
  assert.equal(C.els.znLbl.textContent, 'Z +1.00');
  C.answerAll();
  assert.deepEqual(Array.from(offsets(C)).slice(-2), ['G43.1 Z1.000', 'G43.1 Z0.000']);
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.000');
});
test('nudges pressed faster than the controller takes lines in: the newest is the one left in force', () => {
  const C = control();
  // long lines fill the controller's buffer, so nothing more can be sent until it answers
  Object.assign(C.JOB, { active: true, idx: 0, acked: 0, inflight: [], startedAt: 0, clock: null,
    list: Array.from({ length: 6 }, (_, i) => ({ text: 'G1 X' + i + ' Y123.456 Z-12.345 F1000 (a long line)', ln: i + 1 })), total: 6 });
  C.run('jobFill()');
  assert.ok(C.JOB.idx < 6, 'the buffer is full with lines still to send');
  C.run('znAdjust(0.1); znAdjust(0.1); znAdjust(0.1)');
  assert.deepEqual(offsets(C), [], 'none could be sent yet');
  assert.equal(C.JOB.list.filter((it) => it.zn).length, 1, 'one waits, not three');
  C.run('onAck(true)');                                  // the controller answers one line: room again
  C.run('onAck(true)');
  assert.deepEqual(offsets(C), ['G43.1 Z0.300'], 'and it is the newest');
  C.run('znAdjust(-0.02)');                              // after one has gone: a new line, not a change to the sent one
  C.answerAll();
  assert.deepEqual(offsets(C), ['G43.1 Z0.300', 'G43.1 Z0.280', 'G43.1 Z0.000']);
  assert.equal(C.JOB.active, false);
  assert.deepEqual(Array.from(C.sent.filter((s) => /^G1 /.test(s)), (s) => s.slice(0, 5)), ['G1 X0', 'G1 X1', 'G1 X2', 'G1 X3', 'G1 X4', 'G1 X5'], 'and every line of the job itself still went, in order');
});
test('a job with no nudge sends nothing extra when it finishes', () => {
  const C = control();
  C.PROBE.tlo = 0.5;
  C.start(3);
  C.answerAll();
  assert.equal(C.JOB.active, false);
  assert.deepEqual(offsets(C), []);
});
test('a nudge put back to 0 during the job: nothing more to take off', () => {
  const C = control();
  C.start(3);
  C.run('znAdjust(0.1); znAdjust(0)');
  C.answerAll();
  assert.deepEqual(offsets(C), ['G43.1 Z0.100', 'G43.1 Z0.000']);
});
test('a job that ended some other way (an alarm): the nudge comes off before the next job, once', () => {
  const C = control();
  C.PROBE.tlo = -2;
  C.start(3);
  C.run('znAdjust(-0.1)');
  C.JOB.active = false;                                  // what an alarm does: no finish
  assert.equal(C.ZN.val, -0.1, 'still on');
  C.run('znRemove("before this job")');
  assert.equal(offsets(C).pop(), 'G43.1 Z-2.000');
  assert.equal(C.ZN.val, 0);
  const n = C.sent.length;
  C.run('znRemove("before this job")');
  assert.equal(C.sent.length, n, 'a second time sends nothing');
});
test('not connected: nothing is sent, and the panel still goes back to 0', () => {
  const C = control();
  C.start(3);
  C.run('znAdjust(0.1)');
  C.JOB.active = false; C.SERIAL.connected = false;
  const n = C.sent.length;
  C.run('znRemove("before this job")');
  assert.equal(C.sent.length, n);
  assert.equal(C.ZN.val, 0);
});
// Starting a job and resuming one can't be run here (they need the whole app), so this reads their source:
// each takes the nudge off before its "start?" window, so the controller's answer comes back before the job's
// first line is sent and isn't counted as the job's.
for (const [file, fn, ask] of [['job-run.js', 'function jobStart(', 'Start this job?'], ['recovery.js', 'function jobStartFrom(', 'Resume from line']]) {
  test(fn.replace('function ', '').replace('(', '') + ' takes a leftover nudge off before it asks to start', () => {
    const s = src(file), body = s.slice(s.indexOf(fn));
    const at = body.indexOf('znRemove('), asks = body.indexOf(ask), idle = body.indexOf("SERIAL.state !== 'Idle'");
    assert.ok(at > 0 && asks > 0 && idle > 0, 'found them');
    assert.ok(at > idle, 'only once the machine is known to be idle');
    assert.ok(at < asks, 'and before the window');
  });
}
