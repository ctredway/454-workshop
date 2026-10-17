// In a browser, Control keeps the screen on (and so the computer awake) while a job runs: a screen wake lock,
// asked for again when the tab comes back to the front, and let go when the job ends or the machine disconnects.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));
function control({ desktop = false, supported = true, refuse = false } = {}) {
  const lw = { requests: 0, live: [] };
  const C = vm.createContext({
    JOB: { active: false }, log: [], lw,
    document: { visibilityState: 'visible' },
    window: desktop ? { desktop454: {} } : {},
    navigator: supported ? { wakeLock: { request(kind) {
      lw.requests++; if (refuse) return Promise.reject(new Error('not allowed'));
      const l = { kind, released: false, fns: [], addEventListener(_t, f) { this.fns.push(f); }, release() { this.released = true; this.fns.forEach((f) => f()); return Promise.resolve(); } };
      lw.live.push(l); return Promise.resolve(l);
    } } } : {},
    Date,
  });
  C.logC = (c, t) => C.log.push([c, t]);
  vm.runInContext(read('../src/js/keep-awake.js'), C, { filename: 'keep-awake.js' });
  return C;
}

test('holds a screen wake lock while a job runs, and lets it go when the job ends', async () => {
  const C = control();
  C.keepAwakeCheck(); await settle();
  assert.equal(C.lw.requests, 0, 'nothing asked for with no job');
  C.JOB.active = true;
  C.keepAwakeCheck(); C.keepAwakeCheck(); await settle(); C.keepAwakeCheck(); await settle();
  assert.equal(C.lw.requests, 1, 'asked for once, not with every status report');
  assert.equal(C.lw.live[0].kind, 'screen');
  assert.ok(C.log.some((e) => /keeping the screen on/.test(e[1])));
  C.JOB.active = false; C.keepAwakeCheck();
  assert.equal(C.lw.live[0].released, true);
});

test('the browser drops it when the tab is hidden: asked for again once the tab is back', async () => {
  const C = control();
  C.JOB.active = true; C.keepAwakeCheck(); await settle();
  C.document.visibilityState = 'hidden'; C.lw.live[0].release();      // what the browser does
  C.keepAwakeCheck(); await settle();
  assert.equal(C.lw.requests, 1, 'not while hidden (the browser would refuse)');
  C.document.visibilityState = 'visible'; C.keepAwakeCheck(); await settle();
  assert.equal(C.lw.requests, 2);
  assert.equal(C.log.filter((e) => /keeping the screen on/.test(e[1])).length, 1, 'said once a job');
});

test('a job that ended while the lock was being asked for lets it go straight away', async () => {
  const C = control();
  C.JOB.active = true; C.keepAwakeCheck(); C.JOB.active = false; await settle();
  assert.equal(C.lw.live[0].released, true);
});

test('refused: says what to do once, and doesn’t ask again for 30 seconds', async () => {
  const C = control({ refuse: true });
  C.JOB.active = true; C.keepAwakeCheck(); await settle();
  for (let i = 0; i < 5; i++) { C.keepAwakeCheck(); await settle(); }
  assert.equal(C.lw.requests, 1);
  assert.equal(C.log.length, 1); assert.match(C.log[0][1], /set the computer not to sleep/);
  C.keepAwakeCheck(Date.now() + 31000); await settle();
  assert.equal(C.lw.requests, 2);
});

test('nothing in the desktop app (it keeps the computer awake itself) or a browser without wake locks', async () => {
  for (const o of [{ desktop: true }, { supported: false }]) {
    const C = control(o);
    C.JOB.active = true; C.keepAwakeCheck(); await settle();
    assert.equal(C.lw.requests, 0);
  }
});
