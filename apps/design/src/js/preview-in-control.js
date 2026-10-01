// ---- Preview in 454 Control ----
// Hands the job's G-code (exactly what Save G-code writes) to 454 Control, for its preview: the 3D view
// and playback, the time estimate with the machine's acceleration, and the checks. Nothing is sent to the
// machine. Control and Design are the same site (or the same desktop app), so they share a
// BroadcastChannel and localStorage. An open Control is never reloaded (that would drop its machine
// connection): if one answers, it has the job; if none does, the job is stored and a new Control opens,
// which picks it up as it starts.
var HANDOFF_KEY = '454.handoff';
function tpPreview(checked){
  if (checked !== true){ tpDepthGate('Preview anyway', function () { tpPreview(true); }); return; }
  var j = tpJob();
  if (!j) return;
  var job = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: j.base + '.nc', text: j.gc, at: Date.now()};
  var stored = false;
  try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(job)); stored = true; } catch (e) { /* too big for storage: an open Control can still take it */ }
  var bc = null, answered = null;
  try { bc = new BroadcastChannel('454-workshop'); } catch (e) {}
  if (bc){
    bc.onmessage = function (ev){ var m = ev.data || {}; if (m.type === 'got' && m.id === job.id && !answered) answered = m; };
    bc.postMessage({type: 'job', job: job});
  }
  setTimeout(function (){
    if (bc) bc.close();
    if (answered){
      // The desktop app brings its Control window forward. A website can't bring another tab forward, and
      // opening one would make a second Control: say where the job is instead.
      if (window.desktop454) openControl();
      if (answered.loaded) toast('ok', 'Previewing in 454 Control', j.said + ', in ' + job.name + (window.desktop454 ? '.' : ': it\u2019s in your 454 Control tab.'));
      else toast('warn', '454 Control didn\u2019t load it', answered.why || 'It\u2019s busy with the machine.');
      return;
    }
    if (!stored){ toast('warn', 'Too big to hand over', 'Open 454 Control first, then preview again, or use Save G-code and open the file in Control.'); return; }
    openControl();                                     // a new Control, which takes the job as it starts
    toast('ok', 'Opening 454 Control', 'Its preview shows ' + j.said + '.');
  }, 500);
}
function openControl(){
  if (window.desktop454){ window.open('index.html'); return; }          // the desktop app: shows its Control window
  var w = window.open('index.html', '_blank');                          // the website: a new tab, never an existing one
  if (w) try { w.focus(); } catch (e) {}
}

