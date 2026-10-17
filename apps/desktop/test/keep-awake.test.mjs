// Keeping the computer awake while the machine is busy (src/keep-awake.js), with a stand-in for Electron's
// power save blocker and for asking 454 Control whether the machine is busy.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createKeepAwake } = require('../src/keep-awake.js');

function fake() {
  const b = { started: [], stopped: [], next: 1, start(type) { this.started.push(type); return this.next++; }, stop(id) { this.stopped.push(id); } };
  const timers = { fn: null, cleared: false };
  return { b, timers, opts: { setInterval: (fn) => { timers.fn = fn; return 1; }, clearInterval: () => { timers.cleared = true; } } };
}

describe('Keep the computer awake', () => {
  it('blocks sleep while the machine is busy, and lets it sleep again when it isn’t', async () => {
    const { b, timers, opts } = fake(); let busy = false;
    const k = createKeepAwake(b, () => busy, opts);
    await k.check(); expect(k.awake).toBe(false); expect(b.started).toEqual([]);
    busy = true; await timers.fn(); await k.check();
    expect(k.awake).toBe(true); expect(b.started).toEqual(['prevent-app-suspension']);   // the computer, not the screen
    await k.check(); expect(b.started.length).toBe(1);                                   // once, not every check
    busy = false; await k.check();
    expect(k.awake).toBe(false); expect(b.stopped).toEqual([1]);
  });
  it('asks Control the way the updater does: an answer that comes back as a promise', async () => {
    const { b, opts } = fake();
    const k = createKeepAwake(b, () => Promise.resolve(true), opts);
    await k.check(); expect(k.awake).toBe(true);
  });
  it('keeps what it had when Control can’t be asked (a page too busy to answer, or reloading)', async () => {
    const { b, opts } = fake(); let mode = 'busy';
    const k = createKeepAwake(b, () => { if (mode === 'fail') throw new Error('no page'); return mode === 'busy'; }, opts);
    await k.check(); expect(k.awake).toBe(true);
    mode = 'fail'; await k.check(); expect(k.awake).toBe(true);          // still awake: never let it sleep on a guess
    mode = 'idle'; await k.check(); expect(k.awake).toBe(false);
    const k2 = createKeepAwake(fake().b, () => { throw new Error('no page'); }, opts);
    await k2.check(); expect(k2.awake).toBe(false);                      // and never starts on one either
  });
  it('a question still waiting isn’t asked again over the top of it', async () => {
    const { b, opts } = fake(); let asked = 0, release;
    const k = createKeepAwake(b, () => { asked++; return new Promise((r) => { release = r; }); }, opts);
    await k.check(); await k.check();                                     // the first question (asked on start) is still out
    expect(asked).toBe(1);
    release(true); await new Promise((r) => setTimeout(r, 0)); expect(k.awake).toBe(true);
  });
  it('stop lets the computer sleep and stops checking', async () => {
    const { b, timers, opts } = fake();
    const k = createKeepAwake(b, () => true, opts);
    await k.check(); k.stop();
    expect(k.awake).toBe(false); expect(b.stopped).toEqual([1]); expect(timers.cleared).toBe(true);
  });
});
