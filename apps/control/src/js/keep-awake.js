/* ----- keep the computer awake during a job (in a browser) ----- */
// A computer that goes to sleep partway through a job stops feeding the machine with the spindle running. In a
// browser, Control holds a screen wake lock while a job runs, which keeps the screen on and so the computer awake.
// The browser drops it whenever the tab is hidden, so it's asked for again once the tab is back in front.
// The desktop app keeps the computer awake itself, whatever the machine is doing (apps/desktop/src/keep-awake.js).
var WAKE = {lock: null, asking: false, failedAt: -1e9, said: false};
function keepAwakeCheck(now){
  if (typeof window !== 'undefined' && window.desktop454) return;
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
  now = now === undefined ? Date.now() : now;
  var want = !!JOB.active;
  if (want && !WAKE.lock && !WAKE.asking && document.visibilityState === 'visible' && now - WAKE.failedAt > 30000){
    WAKE.asking = true;
    navigator.wakeLock.request('screen').then(function (l) {
      WAKE.asking = false;
      if (!JOB.active){ l.release(); return; }             // the job ended while it was being asked for
      WAKE.lock = l;
      l.addEventListener('release', function () { if (WAKE.lock === l) WAKE.lock = null; });
      if (!WAKE.said){ WAKE.said = true; logC('sys', 'keeping the screen on (and the computer awake) while the job runs'); }
    }, function (e) {
      WAKE.asking = false; WAKE.failedAt = Date.now();
      if (!WAKE.said){ WAKE.said = true; logC('sys', 'couldn’t keep the screen on (' + (e && e.message || e) + '): set the computer not to sleep during long jobs'); }
    });
  } else if (!want){
    if (WAKE.lock){ WAKE.lock.release(); WAKE.lock = null; }
    WAKE.said = false;                                    // say it again next job
  }
}
