// Keeps the computer from going to sleep while the machine is working: a job, a probe, a jog or a quick action
// running, the spindle on, or the machine moving (454 Control's machineBusy()). A PC that sleeps mid-job stops
// feeding the machine with the spindle running, and the job is lost. Uses Electron's power save blocker in its
// "prevent-app-suspension" mode: the computer stays awake, but the screen may still turn off. No Electron in here,
// so it can be tested: it's given the blocker and a way to ask whether the machine is busy.
'use strict';

/**
 * @param {{start: (type: string) => number, stop: (id: number) => void}} blocker  Electron's powerSaveBlocker
 * @param {() => Promise<boolean>|boolean} isBusy  whether the machine is busy now
 * @param {{everyMs?: number, log?: (m: string) => void, setInterval?: Function, clearInterval?: Function}} [o]
 */
function createKeepAwake(blocker, isBusy, o = {}) {
  const every = o.everyMs || 10000, log = o.log || (() => {});
  const si = o.setInterval || setInterval, ci = o.clearInterval || clearInterval;
  let id = null, checking = false;
  async function check() {
    if (checking) return;                              // a page too busy to answer: the last answer stands
    checking = true;
    let busy = false;
    try { busy = !!(await isBusy()); } catch (e) { busy = id !== null; }   // couldn't ask: keep what it was
    finally { checking = false; }
    if (busy && id === null) { id = blocker.start('prevent-app-suspension'); log('keeping the computer awake: the machine is busy'); }
    else if (!busy && id !== null) { blocker.stop(id); id = null; log('the computer may sleep again: the machine is idle'); }
  }
  const timer = si(check, every);
  check();
  return {
    check,
    get awake() { return id !== null; },
    stop() { ci(timer); if (id !== null) { blocker.stop(id); id = null; } },
  };
}

module.exports = { createKeepAwake };
