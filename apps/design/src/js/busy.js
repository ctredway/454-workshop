// ---- "Working…": showing that the app is busy ----
// Working out toolpaths can take seconds, and while it runs the page can't draw: it looks frozen. So before the
// work starts, a panel says what's being done, with a spinner, and gives the page a moment to show it. The spinner
// turns by a CSS animation of transform alone, which the browser runs apart from the page, so it keeps turning
// while the work runs. Work done in steps (the Inlay wizard's four toolpaths, Recalculate all) shows "2 of 4"
// and a bar, with a pause between steps for the panel to update. Clicks and keys are held off meanwhile.
var BUSY = null;           // {title, steps, done, waiters}
var BUSY_PAUSE = 30;       // ms between steps: long enough for the page to draw a frame
function busyShow(title, total){
  var box = document.getElementById('busy');
  document.getElementById('busyTitle').textContent = title;
  document.getElementById('busyStep').textContent = '';
  document.getElementById('busyBarWrap').hidden = !(total > 1);
  document.getElementById('busyBar').style.width = '0%';
  box.hidden = false;
}
function busyStep(i, total, label){
  document.getElementById('busyStep').textContent = total > 1 ? (i + 1) + ' of ' + total + (label ? ': ' + label : '') : label || '';
  document.getElementById('busyBar').style.width = (total > 1 ? Math.round(i / total * 100) : 0) + '%';
}
function busyHide(){ document.getElementById('busy').hidden = true; }
function busyNow(){ return !!BUSY; }
// Run steps (functions, or {label, fn}) one after another with the panel up. Resolves with the last step's result,
// or rejects with its error (the panel goes either way). One run at a time: another while busy waits its turn.
function busyRun(title, steps){
  if (BUSY) return busyIdle().then(function () { return busyRun(title, steps); });
  steps = steps.map(function (s) { return typeof s === 'function' ? {fn: s} : s; });
  BUSY = {title: title, waiters: []};
  busyShow(title, steps.length);
  var i = 0, last;
  function finish(){
    var w = BUSY.waiters; BUSY = null; busyHide();
    w.forEach(function (f) { f(); });
  }
  return new Promise(function (resolve, reject) {
    function next(){
      if (i >= steps.length){ finish(); resolve(last); return; }
      busyStep(i, steps.length, steps[i].label);
      setTimeout(function () {
        try { last = steps[i].fn(last); }
        catch (e){ finish(); reject(e); return; }
        i++;
        if (steps.length > 1) document.getElementById('busyBar').style.width = Math.round(i / steps.length * 100) + '%';
        next();
      }, BUSY_PAUSE);
    }
    next();
  });
}
// Resolves once nothing is running.
function busyIdle(){
  return new Promise(function (resolve) { if (!BUSY) resolve(); else BUSY.waiters.push(resolve); });
}
// A button whose work takes a while: the panel shows while it runs. Errors are shown, not lost.
function busyButton(id, title, fn){
  var b = document.getElementById(id);
  if (!b) return;
  b.addEventListener('click', function () {
    busyRun(title, [fn]).catch(function (e) { toast('err', 'Something went wrong', String((e && e.message) || e)); });
  });
}
