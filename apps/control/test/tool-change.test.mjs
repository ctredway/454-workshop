// Change tool, from the jog panel: lift right up, stop the spindle, go to the tool-change position, wait for the
// bit to be changed, then measure it on the BitSetter (or say to set Z zero again). Control's real files run here
// with the machine, the dialogs and the probe replaced by stand-ins that record what happens.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const LIFT = 'G53 G0 Z-2.0';
const FC = { x: -650, y: -1200, auto: true, name: 'front centre' };
const base = { homed: true, liftCmd: LIFT, spot: FC, bsOn: true, bsWhy: null, refZ: -61.2 };

function control(over = {}) {
  const C = vm.createContext({});
  vm.runInContext(read('../src/js/tool-change.js'), C, { filename: 'tool-change.js' });
  vm.runInContext(read('../src/js/bitsetter.js'), C, { filename: 'bitsetter.js' });
  const log = [];
  Object.assign(C, {
    log, sent: [], answers: [],
    SERIAL: { connected: true, homedSeen: true, state: 'Idle', settings: {} },
    JOB: { active: false }, PROFILE: { bitSetter: { enabled: true } }, PROBE: { active: false, refZ: -61.2, tlo: 0 },
    ZN: { val: 0 },
    logC: (c, t) => log.push(['log', c, t]),
    updateJobUI: (t) => log.push(['status', t]),
    requireIdle: () => C.SERIAL.state === 'Idle',
    qaBusy: () => false,
    zHighCmd: () => LIFT, topZ: () => 2,
    toolChangeSpot: () => FC,
    bitSetterReady: () => null,
    sendLine: (s) => C.sent.push(s),
    jogModalClose: () => log.push(['jog', 'close']),
    jogModalOpen: () => log.push(['jog', 'open']),
    uiNote: (title) => { log.push(['note', title]); return Promise.resolve(true); },
    uiDialog: (o) => { log.push(['ask', o.title, o.ok]); return Promise.resolve(C.answers.shift()); },
    probeRun: (name, steps, done) => { log.push(['moves', name, steps]); done({}); },
    probeStart: (kind, done) => { log.push(['measure', kind]); done(); },
  }, over);
  return C;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the plan: lift first, then stop the spindle, then go to the tool-change position', () => {
  const C = control();
  const p = plain(C.toolChangePlan(base));
  assert.deepEqual(p.steps, [LIFT, 'M5', 'G53 G0 X-650.000 Y-1200.000'], 'never stops the spindle before lifting');
  assert.equal(p.measure, true);
  assert.match(p.intro, /front centre, X-650\.0 Y-1200\.0/);
  assert.match(p.intro, /measured on the BitSetter/);
  assert.match(p.swap, /Measure the new bit/);
});

test('the plan: no tool-change position set, so it lifts, stops the spindle and stays', () => {
  const p = plain(control().toolChangePlan({ ...base, spot: null }));
  assert.deepEqual(p.steps, [LIFT, 'M5']);
  assert.match(p.intro, /stay where it is/);
});

test('the plan: nothing moves on a machine that hasn’t homed', () => {
  const p = plain(control().toolChangePlan({ ...base, homed: false, liftCmd: null }));
  assert.ok(p.why && /Home it first/.test(p.why));
  assert.equal(p.steps, undefined);
});

test('the plan: the bit is measured only with a BitSetter that works and a reference to compare with', () => {
  const C = control();
  const noRef = plain(C.toolChangePlan({ ...base, refZ: null }));
  assert.equal(noRef.measure, false, 'measuring with no reference would make the new bit the reference, at the old bit’s zero');
  assert.match(noRef.intro, /no reference yet/);
  const broken = plain(C.toolChangePlan({ ...base, bsWhy: 'machine has not homed this session' }));
  assert.equal(broken.measure, false);
  assert.match(broken.intro, /switched on but can’t be used: machine has not homed this session/);
  const none = plain(C.toolChangePlan({ ...base, bsOn: false, bsWhy: 'disabled in Machine profile' }));
  assert.equal(none.measure, false);
  assert.match(none.intro, /set Z zero again with the new one/);
  for (const p of [noRef, broken, none]) assert.match(p.swap, /set Z zero for the new bit/);
});

test('with the BitSetter: moves, waits for the change, measures the new bit against the reference', async () => {
  const C = control();
  C.answers = [true, true];
  C.toolChangeStart(); await settle(); await settle();
  assert.deepEqual(plain(C.log.filter((e) => e[0] !== 'status')), [
    ['ask', 'Change the tool?', 'Go'],
    ['jog', 'close'],
    ['moves', 'Tool change', [LIFT, 'M5', 'G53 G0 X-650.000 Y-1200.000']],
    ['ask', 'Change the bit now', 'Measure the new bit'],
    ['measure', 'tool'],
    ['jog', 'open'],
  ]);
  assert.equal(C.PROBE.toolSwapped, false);
});

test('not measured: Start is warned until Z zero is set again, by any route', async () => {
  const C = control();
  C.answers = [true, false];                                         // Go, then Don't measure
  C.toolChangeStart(); await settle(); await settle();
  assert.ok(!C.log.some((e) => e[0] === 'measure'));
  assert.equal(C.PROBE.toolSwapped, true);
  C.clearToolOffset();                                               // what Zero Z, Zero all and the BitZero do first
  assert.equal(C.PROBE.toolSwapped, false);
  const warn = read('../src/js/job-run.js');
  assert.match(warn, /if \(PROBE\.toolSwapped\)\s*\n\s*msg \+= '\*\*\* The bit was changed/, 'Start says so');
});

test('cancelled at the first question: nothing moves', async () => {
  const C = control();
  C.answers = [false];
  C.toolChangeStart(); await settle();
  assert.ok(!C.log.some((e) => e[0] === 'moves' || e[0] === 'jog'));
});

test('refused while a job runs, while probing, when not idle, and before homing', async () => {
  for (const [what, set] of [['job', (C) => { C.JOB.active = true; }], ['probe', (C) => { C.PROBE.active = true; }],
    ['busy', (C) => { C.SERIAL.state = 'Run'; }], ['offline', (C) => { C.SERIAL.connected = false; }],
    ['unhomed', (C) => { C.SERIAL.homedSeen = false; }]]) {
    const C = control();
    set(C); C.answers = [true, true];
    C.toolChangeStart(); await settle(); await settle();
    assert.ok(!C.log.some((e) => e[0] === 'moves' || e[0] === 'ask'), what + ': nothing moves and nothing is asked');
  }
});
