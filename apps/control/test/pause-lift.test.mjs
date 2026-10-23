// Pause & lift on the run bar (job-run.js jobPauseLift). It used to send the controller's safety-door signal, whose
// lift ("parking") isn't built into stock Shapeoko firmware: the spindle stopped but Z never lifted (Clint,
// 2026-10-22). Now Control does it: hold, wait until still, reset to clear the queue, lift to the top and stay there;
// Resume carries on from where it stopped (Recover's way, keeping the job's adjustments); End job finishes.
// Control's real files, with the machine, the clock and the dialogs replaced by recorders.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control() {
  const C = vm.createContext({});
  for (const f of ['job-run.js', 'overrides.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });
  let now = 0, tick = null;
  Object.assign(C, {
    rt: [], lines: [], said: [], resumed: null,
    performance: { now: () => now },
    setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; },
    SERIAL: { connected: true, homedSeen: true, state: 'Run', subState: '', wpos: { x: 40, y: 30, z: -3 }, ov: [80, 100, 100] },
    JOB: { active: true, held: false, toolWait: null, inflight: [], lastLn: 120 },
    PROBE: { active: false, tlo: 0 },
    sendRT: (b) => C.rt.push(b), sendLine: (s) => C.lines.push(s),
    recoveryNote: (why) => { C.JOB.stopInfo = { why, line: 117 }; },
    zHighCmd: (n) => 'G53 G0 Z' + (-n).toFixed(1), topZ: () => 2, travelZ: () => 5,
    endingMoves: () => ({ cmds: ['G90 G0 X0 Y0', 'G53 G0 X-419.000 Y-10.000'] }),
    updateJobUI: (t) => { if (t) C.said.push(t); }, logC: () => {}, maybeToolPrompt: () => {}, uiNote: (t) => C.said.push('note: ' + t),
    jobStartFrom: (ln, o) => { C.resumed = { ln, paused: !!(o && o.paused) }; },
    jobFill: () => {}, znDisplay: () => {},
    document: { getElementById: () => ({ textContent: '', checked: false }) },
  });
  C.advance = (ms) => { now += ms; if (tick) tick(); };
  return C;
}

test('Pause & lift: hold, then clear the queue, then lift to the top and stay over the spot', () => {
  const C = control();
  C.jobPauseLift();
  assert.deepEqual([...C.rt], [0x21], 'a feed hold first: slow to a stop');
  assert.ok(!C.rt.includes(0x84), 'not the firmware safety door');
  C.advance(100);                                         // still slowing
  assert.deepEqual([...C.rt], [0x21]);
  C.SERIAL.state = 'Hold'; C.SERIAL.subState = '0'; C.advance(100);
  assert.deepEqual([...C.rt], [0x21, 0x18], 'still: then a reset clears what’s queued');
  assert.equal(C.JOB.active, false);
  C.SERIAL.state = 'Idle'; C.advance(1300);
  assert.deepEqual([...C.lines], ['G90', 'G21', 'G53 G0 Z-2.0'], 'lifted to the top in millimetres, and no move off the spot');
  assert.equal(C.PAUSED.line, 117);
  assert.equal(C.PAUSED.lifting, true, 'lifting until Z is at the top (move-lock.js)');
  assert.match(C.said.at(-1), /paused and lifted at line 117/);
});

test('Resume after it: carries on from where it stopped, as a paused job (not a bare cycle start)', () => {
  const C = control();
  C.jobPauseLift(); C.SERIAL.state = 'Hold'; C.SERIAL.subState = '0'; C.advance(100); C.SERIAL.state = 'Idle'; C.advance(1300);
  C.rt.length = 0;
  C.jobResume();
  assert.deepEqual(JSON.parse(JSON.stringify(C.resumed)), { ln: 117, paused: true });
  assert.ok(!C.rt.includes(0x7e), 'no ~: there’s nothing queued to resume');
});

test('End job while paused: finishes off as a job does (back to XY zero, park)', () => {
  const C = control();
  C.jobPauseLift(); C.SERIAL.state = 'Hold'; C.SERIAL.subState = '0'; C.advance(100); C.SERIAL.state = 'Idle'; C.advance(1300);
  C.lines.length = 0;
  C.jobStop();
  assert.deepEqual([...C.lines], ['G90', 'G21', 'G90 G0 X0 Y0', 'G53 G0 X-419.000 Y-10.000']);
  assert.equal(C.PAUSED, null);
});

test('not at a tool change or while measuring: it says so and does nothing', () => {
  const C = control();
  C.JOB.toolWait = { tool: '2' };
  C.jobPauseLift();
  assert.deepEqual([...C.rt], []);
  assert.match(C.said[0], /^note: Not now/);
});

test('carrying on after a pause keeps the job’s feed, spindle and Z adjustments', () => {
  const C = control();
  C.ADJ.keep = false; C.ZN.val = -0.2;
  C.adjBegin(true);                                        // as Recover calls it for a paused job
  assert.ok(!C.rt.includes(0x90) && !C.rt.includes(0x99), 'feed and spindle not put back to 100%');
  assert.equal(C.ZN.val, -0.2, 'the Z nudge stays');
  assert.match(C.adjKeptText(true), /Z nudge -0\.20 mm/);
  C.adjBegin(false);
  assert.ok(C.rt.includes(0x90) && C.ZN.val === 0, 'a new job, nothing kept: back to normal');
});

test('Resume pressed while Z is still lifting: it waits until still, then carries on (it said "Machine isn’t ready")', () => {
  const C = control();
  C.jobPauseLift(); C.SERIAL.state = 'Hold'; C.SERIAL.subState = '0'; C.advance(100); C.SERIAL.state = 'Idle'; C.advance(1300);
  C.SERIAL.state = 'Run';                                  // the lift to the top, still going
  C.jobResume();
  assert.equal(C.resumed, null, 'not while it’s moving');
  C.jobResume();                                           // pressed again: still the one wait
  C.advance(150); assert.equal(C.resumed, null);
  C.SERIAL.state = 'Idle'; C.advance(150);
  assert.deepEqual(JSON.parse(JSON.stringify(C.resumed)), { ln: 117, paused: true }, 'at the top: carries on');
});
test('Resume with nothing paused or held: it says so (it sent ~ and nothing happened)', () => {
  const C = control();
  C.JOB.active = false; C.SERIAL.state = 'Idle';
  C.jobResume();
  assert.deepEqual([...C.rt], [], 'nothing sent');
  assert.match(C.said.at(-1), /^note: Nothing to resume/);
  C.SERIAL.state = 'Hold';                                 // a hold outside a job (a move typed in the console): ~ resumes it
  C.jobResume();
  assert.deepEqual([...C.rt], [0x7e]);
});
