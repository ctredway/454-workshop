// The Z nudge in the Adjust panel (apps/control/src/js/overrides.js): it shifts the running job up or down, and
// it must not outlive that job. Left in the controller it shifts the next job by the same amount while the panel
// reads Z +0.00. Unless "Keep for the next job" is ticked: then the nudge and the feed, spindle and rapid
// percentages carry into the next job, which asks first. Control's real files (overrides.js, job-run.js,
// job-streaming.js) run here against a stand-in machine that records every line sent and steps its
// percentages the way GRBL does.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = (f) => fs.readFileSync(new URL('../src/js/' + f, import.meta.url), 'utf8');
function control() {
  const sent = [], log = [], els = {};
  const el = (id) => els[id] || (els[id] = { style: {}, textContent: '', hidden: false, classList: { toggle() {} }, focus() {} });
  // The stand-in controller's percentages [feed, rapid, spindle]. Like GRBL, it notes that a kind of step was
  // asked for, not how many: the same step sent twice before it next looks counts once.
  const ctrl = { ov: [100, 100, 100], asked: new Set(), bytes: [], deaf: false };
  const clamp = (v) => Math.max(10, Math.min(200, v));
  const steps = { 0x90: (o) => { o[0] = 100; }, 0x91: (o) => { o[0] = clamp(o[0] + 10); }, 0x92: (o) => { o[0] = clamp(o[0] - 10); }, 0x93: (o) => { o[0] = clamp(o[0] + 1); }, 0x94: (o) => { o[0] = clamp(o[0] - 1); },
    0x95: (o) => { o[1] = 100; }, 0x96: (o) => { o[1] = 50; }, 0x97: (o) => { o[1] = 25; },
    0x99: (o) => { o[2] = 100; }, 0x9A: (o) => { o[2] = clamp(o[2] + 10); }, 0x9B: (o) => { o[2] = clamp(o[2] - 10); }, 0x9C: (o) => { o[2] = clamp(o[2] + 1); }, 0x9D: (o) => { o[2] = clamp(o[2] - 1); } };
  const C = vm.createContext({
    sent, log, els, ctrl,
    SERIAL: { connected: true, state: 'Idle', ov: [100, 100, 100] },
    PROBE: { active: false, tlo: 0, refZ: null },
    JOB: { active: false, held: false, list: null, total: 0, idx: 0, acked: 0, inflight: [], toolWait: null },
    MODEL: null, RX_CAP: 100, PROFILE: { run: { tc: {}, park: {} } },
    document: { getElementById: el, querySelectorAll: () => [] },
    performance: { now: () => 1000 }, localStorage: { getItem: () => null, setItem() {} },
    sendLine: (s) => { sent.push(s); }, sendRT: (b) => { ctrl.bytes.push(b); ctrl.asked.add(b); }, logC: (cls, t) => { log.push(t); },
    updateJobUI() {}, fmtTime: (s) => s + ' s', setTime() {},
    // enough for jobStart to run up to where it works out the job, which stops it here ("reached the job")
    qaBusy: () => false, modelBBox: () => { throw new Error('reached the job'); },
    asked: [], uiDialog: (o) => ({ then(f) { C.asked.push({ title: o.title, body: o.body, answer: f }); } }),
  });
  for (const f of ['overrides.js', 'job-streaming.js', 'job-run.js']) vm.runInContext(src(f), C, { filename: f });
  // a job of `n` cutting lines, started the way jobStart leaves it
  C.start = (n) => {
    Object.assign(C.JOB, { active: true, held: false, toolWait: null, idx: 0, acked: 0, inflight: [], startedAt: 0, clock: null,
      list: Array.from({ length: n }, (_, i) => ({ text: 'G1 X' + i, ln: i + 1 })), total: n });
    vm.runInContext('adjBegin(); jobFill()', C);
  };
  // the controller acts on what it was asked, then reports its percentages (as it does after any change)
  C.report = (times = 1) => {
    for (let i = 0; i < times; i++) {
      if (!ctrl.deaf) for (const b of ctrl.asked) if (steps[b]) steps[b](ctrl.ov);
      ctrl.asked.clear();
      C.SERIAL.ov = vm.runInContext('[' + ctrl.ov.join(',') + ']', C);
      vm.runInContext('adjSeen()', C);
    }
  };
  // the job's last line is its M30: the controller puts its percentages back to 100% as it answers
  C.finish = () => { C.answerAll(); ctrl.ov = [100, 100, 100]; };
  C.press = (key) => { vm.runInContext('sendOverride(' + JSON.stringify(key) + ')', C); C.report(); };
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

// ---- Every job starts at normal, unless "Keep for the next job" is ticked ----
const plain = (v) => JSON.parse(JSON.stringify(v));
test('unticked: the next job starts with feed, spindle and rapid at 100% and no nudge', () => {
  const C = control();
  C.start(3);
  C.press('f-10'); C.press('s+10'); C.press('r50');
  C.run('znAdjust(0.1)');
  assert.deepEqual(C.ctrl.ov, [90, 50, 110]);
  C.answerAll();                                         // a file with no M30: the controller keeps its percentages
  assert.deepEqual(C.ctrl.ov, [90, 50, 110]);
  assert.equal(C.run('adjKeptText()'), '', 'nothing is kept');
  C.start(3);
  C.report();
  assert.deepEqual(C.ctrl.ov, [100, 100, 100]);
  assert.equal(C.ZN.val, 0);
  assert.equal(C.sent.filter((s) => /^G43\.1/.test(s)).pop(), 'G43.1 Z0.000');
});
test('ticked: the nudge stays on when the job finishes, and the next job is told what it starts with', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  assert.equal(C.els.ovKeep.checked, true);
  C.start(3);
  C.press('f-10'); C.press('f-10'); C.press('s+10'); C.press('r50');
  C.run('znAdjust(0.1)');
  C.finish();
  assert.equal(C.JOB.active, false);
  assert.equal(offsets(C).pop(), 'G43.1 Z0.100', 'nothing took the nudge off');
  assert.equal(C.ZN.val, 0.1);
  assert.equal(C.run('adjKeptText()'), 'feed 80%, spindle 110%, rapid 50%, Z nudge +0.10 mm');
});
test('ticked: the percentages go back one step for each report, and arrive exactly', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  for (const k of ['f-10', 'f-10', 'f-1', 'f-1', 'f-1', 's+10', 's+1', 'r25']) C.press(k);
  assert.deepEqual(C.ctrl.ov, [77, 25, 111]);
  C.finish();
  C.report(3);                                           // idle reports after the M30: 100% everywhere
  assert.deepEqual(plain(C.ADJ.ov), [77, 25, 111], 'what the job ended with is still remembered');
  C.ctrl.bytes.length = 0;
  C.run('znApply(); adjRestore()');                      // what starting a job does before its window
  assert.equal(C.ctrl.bytes.length, 0, 'nothing is sent until the controller reports');
  C.report(20);
  assert.deepEqual(C.ctrl.ov, [77, 25, 111]);
  assert.equal(C.ctrl.bytes.length, 8, 'in 8 steps: feed -10 -10 -1 -1 -1, spindle +10 +1, rapid 25');
  assert.equal(C.ADJ.want, null, 'and it has stopped');
  assert.ok(C.log.some((t) => /kept from the last job: feed 77%, spindle 111%, rapid 25%/.test(t)));
  C.start(3);                                            // the job itself: nothing put back to 100%
  C.report();
  assert.deepEqual(C.ctrl.ov, [77, 25, 111]);
});
test('ticked: a kept nudge is sent again before the job, with the tool’s offset (a reset drops it)', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.PROBE.tlo = 0.5;
  C.start(3);
  C.run('znAdjust(-0.1)');
  C.finish();
  const n = C.sent.length;
  C.run('znApply()');
  assert.deepEqual(plain(C.sent.slice(n)), ['G43.1 Z0.400']);
  C.start(3);
  assert.equal(C.ZN.val, -0.1, 'and starting the job leaves it');
  assert.equal(C.els.znLbl.textContent, 'Z -0.10');
});
test('what was last heard may be out of date: only a report starts the putting back', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  C.press('f-10');
  C.finish();                                            // the controller is at 100% now; SERIAL.ov still says 90
  assert.deepEqual(plain(C.SERIAL.ov), [90, 100, 100]);
  C.run('adjRestore()');
  assert.notEqual(C.ADJ.want, null, 'not taken as done already');
  C.report(3);
  assert.deepEqual(C.ctrl.ov, [90, 100, 100]);
});
test('percentages reported after the job has finished aren’t taken as the job’s', () => {
  const C = control();
  C.start(3);
  C.press('f-10');
  C.finish();
  C.report(2);
  assert.deepEqual(plain(C.ADJ.ov), [90, 100, 100]);
});
test('a press by hand while they’re going back stops it: the hand wins', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  for (let i = 0; i < 5; i++) C.press('f-10');
  C.finish();
  C.run('adjRestore()');
  C.report(2);                                           // the first report starts it, the second shows one step
  assert.deepEqual(C.ctrl.ov, [90, 100, 100]);
  C.press('f0');
  C.report(5);
  assert.deepEqual(C.ctrl.ov, [100, 100, 100]);
  assert.equal(C.ADJ.want, null);
});
test('a controller that doesn’t respond: it gives up and says so', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  C.press('f-10');
  C.finish();
  C.ctrl.deaf = true; C.ctrl.bytes.length = 0;
  C.run('adjRestore()');
  C.report(100);
  assert.equal(C.ADJ.want, null);
  assert.equal(C.ctrl.bytes.length, 60);
  assert.ok(C.log.some((t) => /couldn’t put the last job’s feed and spindle percentages back/.test(t)));
});
test('unticking: nothing is kept, and the next job takes the nudge off', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  C.press('f-10');
  C.run('znAdjust(0.1)');
  C.finish();
  C.run('adjKeepSet(false)');
  assert.equal(C.run('adjKeptText()'), '');
  C.run('adjRestore()');
  assert.equal(C.ADJ.want, null);
  C.run('znRemove("before this job")');
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.000');
});
test('a nudge left in the panel with no connection to take it off: the next job still starts at Z +0.00', () => {
  const C = control();
  C.start(3);
  C.run('znAdjust(0.1)');
  C.JOB.active = false;
  C.start(3);
  assert.equal(C.ZN.val, 0);
  assert.equal(C.els.znLbl.textContent, 'Z +0.00');
});
test('after giving up once, the next job tries afresh', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3);
  C.press('f-10');
  C.finish();
  C.ctrl.deaf = true;
  C.run('adjRestore()');
  C.report(100);
  C.ctrl.deaf = false; C.ctrl.asked.clear();
  C.run('adjRestore()');
  C.report(3);
  assert.deepEqual(C.ctrl.ov, [90, 100, 100]);
});
// Starting a job, as far as its first window. (Past that it needs the whole app: the stand-in stops it there.)
function readyToStart(keep) {
  const C = control();
  if (keep) C.run('adjKeepSet(true)');
  C.start(3);
  C.press('f-10');
  C.run('znAdjust(0.1)');
  C.finish();
  C.MODEL = { segs: [{}] }; C.SERIAL.homedSeen = true;
  return C;
}
const reachesTheJob = (f) => assert.throws(f, /reached the job/);
test('starting a job, unticked: no question, and the nudge is off before the job is worked out', () => {
  const C = readyToStart(false);
  reachesTheJob(() => C.run('jobStart()'));
  assert.equal(C.asked.length, 0);
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.000');
});
test('starting a job, ticked: it asks first, saying what would be kept, and sends nothing until answered', () => {
  const C = readyToStart(true);
  const n = C.sent.length;
  C.run('jobStart()');
  assert.equal(C.asked.length, 1);
  assert.equal(C.asked[0].title, 'Start with the last job’s adjustments?');
  assert.ok(C.asked[0].body.includes('feed 90%, Z nudge +0.10 mm'), C.asked[0].body);
  assert.equal(C.sent.length, n);
  assert.equal(C.ADJ.want, null);
});
test('starting a job, ticked, “Keep them”: the nudge is sent again and the percentages start going back', () => {
  const C = readyToStart(true);
  C.run('jobStart()');
  reachesTheJob(() => C.asked[0].answer(true));
  assert.equal(C.asked.length, 1, 'asked once, not again');
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.100');
  assert.deepEqual(plain(C.ADJ.want), [90, 100, 100]);
  assert.equal(C.ADJ.keep, true);
});
test('starting a job, ticked, “Back to normal”: the tick comes off and the nudge with it', () => {
  const C = readyToStart(true);
  C.run('jobStart()');
  reachesTheJob(() => C.asked[0].answer('alt'));
  assert.equal(C.ADJ.keep, false);
  assert.equal(C.els.ovKeep.checked, false);
  assert.equal(C.sent[C.sent.length - 1], 'G43.1 Z0.000');
  assert.equal(C.ZN.val, 0);
  assert.equal(C.ADJ.want, null);
});
test('starting a job, ticked, Cancel: nothing changes and nothing starts', () => {
  const C = readyToStart(true);
  const n = C.sent.length;
  C.run('jobStart()');
  C.asked[0].answer(false);
  assert.equal(C.sent.length, n);
  assert.equal(C.ZN.val, 0.1);
  assert.equal(C.ADJ.keep, true);
});
test('starting a job, ticked, with nothing adjusted: no question', () => {
  const C = control();
  C.run('adjKeepSet(true)');
  C.start(3); C.finish();
  C.MODEL = { segs: [{}] }; C.SERIAL.homedSeen = true;
  reachesTheJob(() => C.run('jobStart()'));
  assert.equal(C.asked.length, 0);
});
// These can't be run here either, so the source is read: the controller's reports reach adjSeen, both ways of
// starting a job go through adjBegin, and with the tick on, starting asks before the main window.
test('the wiring: reports, job start, resume and the tick box', () => {
  assert.ok(src('status.js').includes("else if (k === 'Ov'){ SERIAL.ov = v; adjSeen(); }"));
  const run = src('job-run.js'), start = run.slice(run.indexOf('function jobStart('));
  assert.ok(start.indexOf('Start with the last job') > 0 && start.indexOf('Start with the last job') < start.indexOf('Start this job?'));
  assert.ok(start.indexOf('adjBegin();') > start.indexOf('Start this job?'), 'jobStart, once Start is pressed');
  const rec = src('recovery.js'), from = rec.slice(rec.indexOf('function jobStartFrom('));
  assert.ok(from.indexOf('adjBegin();') > from.indexOf('Resume from line'), 'resume, once Resume is pressed');
  assert.ok(!/sendRT\(0x90\)/.test(run + rec), 'and nothing else puts the percentages to 100% behind its back');
  assert.ok(src('machine-tab.js').includes("getElementById('ovKeep').addEventListener('change', function(){ adjKeepSet(this.checked); })"));
  assert.ok(fs.readFileSync(new URL('../src/control.html', import.meta.url), 'utf8').includes('id="ovKeep"'));
});
