// ---- jobs handed over from 454 Design ("Preview in 454 Control") ----
// Design sends a job's G-code, exactly what its Save G-code writes, for Control's preview. Control and
// Design are the same site (or the same desktop app), so they share a BroadcastChannel and localStorage.
// An open Control answers on the channel, so Design never reloads it (that would drop the machine
// connection); a Control that's just opening finds the job in storage. Loading a file never runs it.
var HANDOFF_KEY = '454.handoff';
function handoffTake(job){
  if (!job || typeof job.text !== 'string') return {loaded: false, why: 'Nothing arrived.'};
  if (typeof JOB !== 'undefined' && JOB.active)            // loadText says so on screen, too
    return {loaded: false, why: 'A job is running on the machine, so the loaded file wasn\u2019t replaced. Preview again once it has finished.'};
  loadText(job.text, job.name || 'from 454 Design.nc');
  logC('sys', 'loaded ' + (job.name || 'a job') + ' from 454 Design, for preview');
  return {loaded: true};
}
function handoffStart(){
  var bc = null;
  try { bc = new BroadcastChannel('454-workshop'); } catch (e) {}
  if (bc) bc.onmessage = function (ev){
    var m = ev.data || {};
    if (m.type !== 'job' || !m.job) return;
    try { localStorage.removeItem(HANDOFF_KEY); } catch (e) {}   // this window has it: no other should take it
    var r = handoffTake(m.job);
    bc.postMessage({type: 'got', id: m.job.id, loaded: r.loaded, why: r.why});
  };
  // opened to preview a job: it's waiting in storage (for up to a minute; older ones are left over)
  try {
    var j = JSON.parse(localStorage.getItem(HANDOFF_KEY) || 'null');
    if (j){ localStorage.removeItem(HANDOFF_KEY); if (Date.now() - j.at < 60000) handoffTake(j); }
  } catch (e) {}
}
