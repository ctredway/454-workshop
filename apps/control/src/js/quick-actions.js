function qaLines(code){
  return String(code).split(/\r?\n/).map(function(l){ return cleanForSend(l); })
                     .filter(function(l){ return l && l !== '%'; });
}
function qaBusy(what){
  if (!QA.active) return false;
  logC('err', 'Can\u2019t ' + what + ' while the quick action "' + QA.name + '" is running. Wait for it, or press Cancel.');
  return true;
}
function qaRun(k){
  var qa = PROFILE.quick[k];
  if (!qa) return;
  if (!SERIAL.connected){ logC('err', 'Quick action "' + qa.name + '": connect to the machine first.'); return; }
  if (QA.active){ logC('err', 'The quick action "' + QA.name + '" is still running.'); return; }
  if (JOB.active || PROBE.active || JOGC.active){ logC('err', 'Quick action "' + qa.name + '": the machine is busy with a job, probe or jog.'); return; }
  if (SERIAL.state === 'Alarm'){ logC('err', 'Quick action "' + qa.name + '": the machine is locked. Home ($H) or unlock first.'); return; }
  if (SERIAL.state !== 'Idle'){ logC('err', 'Quick action "' + qa.name + '": wait until the machine is Idle (it is ' + SERIAL.state + ').'); return; }
  var lines = qaLines(qa.code);
  if (!lines.length){ logC('err', 'Quick action "' + qa.name + '" has no commands in it.'); return; }
  var startIt = function(){
    QA.active = true; QA.name = qa.name; QA.lines = lines; QA.i = 0;
    logC('sys', 'quick action "' + qa.name + '": ' + lines.length + (lines.length === 1 ? ' line' : ' lines'));
    qaRender();
    qaNext();
  };
  if (!SERIAL.homedSeen && lines.some(function(l){ return /G0*53(?![.\d])|G0*28(?![.\d])|G0*30(?![.\d])/i.test(l); })){
    uiDialog({title:'Run “' + qa.name + '” without homing?',
              body:'It uses machine coordinates (G53/G28/G30), but the machine hasn’t been homed this session, so those positions may be somewhere unexpected.',
              ok:'Run anyway', danger:true}).then(function(go){ if (go) startIt(); });
    return;
  }
  startIt();
  return;
}
function qaNext(){
  if (!QA.active) return;
  if (QA.i >= QA.lines.length){ qaFinish(true); return; }
  sendLine(QA.lines[QA.i++]);
  var st = document.getElementById('qaStatus');
  if (st) st.textContent = 'Running \u201c' + QA.name + '\u201d \u2014 line ' + QA.i + ' of ' + QA.lines.length;
}
function qaFinish(ok, why){
  if (!QA.active) return;
  var n = QA.name;
  QA.active = false; QA.lines = []; QA.i = 0;
  if (ok) logC('sys', 'quick action "' + n + '" sent (moves may still be finishing)');
  else logC('err', 'quick action "' + n + '" stopped: ' + why + '. Nothing further was sent.');
  qaRender();
}
function rbMenuRender(){
  var wrap = document.getElementById('rbActionsWrap'), menu = document.getElementById('rbMenu');
  if (!wrap || !menu) return;
  var acts = PROFILE.quick || [];
  wrap.hidden = !acts.length;
  menu.innerHTML = '';
  var busy = QA.active || JOB.active || PROBE.active || JOGC.active || (SERIAL.state && SERIAL.state !== 'Idle');
  acts.forEach(function(qa, k){
    var b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.textContent = qa.name;
    b.title = qaLines(qa.code).join(' \u00b7 ');
    b.disabled = !SERIAL.connected || busy;
    b.addEventListener('click', function(){ rbMenuOpen(false); qaRun(k); });
    menu.appendChild(b);
  });
  if (!SERIAL.connected || busy){
    var note = document.createElement('div');
    note.className = 'rbMenuNote';
    note.textContent = !SERIAL.connected ? 'Connect to the machine to run these.'
                     : QA.active ? 'A quick action is running.'
                     : JOB.active ? 'Not while a job is running.'
                     : 'The machine is busy (' + (SERIAL.state || '\u2014') + ').';
    menu.appendChild(note);
  }
}
function rbMenuOpen(open){
  var menu = document.getElementById('rbMenu');
  if (!menu) return;
  if (open) rbMenuRender();
  menu.hidden = !open;
  document.getElementById('rbActions').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function qaRender(){
  rbMenuRender();
  var list = document.getElementById('qaList');
  if (!list) return;
  list.innerHTML = '';
  (PROFILE.quick || []).forEach(function(qa, k){
    var row = document.createElement('div'); row.className = 'qaItem';
    var run = document.createElement('button'); run.className = 'qaRunBtn'; run.textContent = qa.name;
    run.title = 'Run: ' + qaLines(qa.code).join(' \u00b7 ');
    run.disabled = QA.active;
    run.addEventListener('click', function(){ qaRun(k); });
    var ed = document.createElement('button'); ed.className = 'qaEditBtn'; ed.textContent = '\u270e';
    ed.title = 'Edit \u201c' + qa.name + '\u201d'; ed.setAttribute('aria-label', 'Edit ' + qa.name);
    ed.disabled = QA.active;
    ed.addEventListener('click', function(){ qaEditOpen(k); });
    row.appendChild(run); row.appendChild(ed); list.appendChild(row);
  });
  if (!(PROFILE.quick || []).length){
    var em = document.createElement('p'); em.className = 'note'; em.textContent = 'No quick actions yet. Add one for anything you type often.';
    list.appendChild(em);
  }
  var rr = document.getElementById('qaRunRow');
  if (rr) rr.style.display = QA.active ? '' : 'none';
  var add = document.getElementById('qaAdd'); if (add) add.disabled = QA.active;
}
// ---- editor ----
var QAEDIT = null;   // index being edited, or -1 for a new one
function qaEditOpen(k){
  QAEDIT = (k === undefined || k === null) ? -1 : k;
  var qa = QAEDIT >= 0 ? PROFILE.quick[QAEDIT] : {name:'', code:''};
  document.getElementById('qaTitle').textContent = QAEDIT >= 0 ? 'Edit quick action' : 'New quick action';
  document.getElementById('qaName').value = qa.name;
  document.getElementById('qaCode').value = qa.code;
  document.getElementById('qaDelete').style.display = QAEDIT >= 0 ? '' : 'none';
  qaCheck();
  document.getElementById('qaModal').hidden = false;
  document.getElementById(QAEDIT >= 0 ? 'qaCode' : 'qaName').focus();
}
function qaEditClose(){ document.getElementById('qaModal').hidden = true; QAEDIT = null; }
// run the file checker over the snippet, so a typo is caught before it reaches the machine
function qaCheck(){
  var out = document.getElementById('qaIssues'), code = document.getElementById('qaCode').value;
  out.innerHTML = '';
  if (!code.trim()){ return; }
  var res = parseGcode(code, {rapidRate: 5000});
  var shown = res.issues.filter(function(it){
    return (it.sev === 'err' || it.sev === 'warn') && !/^No G20\/G21/.test(it.msg) && !/before the spindle is started/.test(it.msg);
  });
  var n = qaLines(code).length;
  var head = document.createElement('div'); head.className = 'qaIssueHead';
  head.textContent = n + (n === 1 ? ' line will be sent' : ' lines will be sent') + (shown.length ? '' : ' \u2014 no problems found');
  out.appendChild(head);
  shown.forEach(function(it){
    var d = document.createElement('div'); d.className = 'qaIssue ' + it.sev;
    d.textContent = 'Line ' + it.line + ': ' + it.msg;
    out.appendChild(d);
  });
}
function qaSave(){
  var name = document.getElementById('qaName').value.trim(), code = document.getElementById('qaCode').value;
  if (!name){ document.getElementById('qaName').focus(); logC('err', 'Give the quick action a name.'); return; }
  if (!qaLines(code).length){ document.getElementById('qaCode').focus(); logC('err', 'The quick action needs at least one G-code line.'); return; }
  if (!PROFILE.quick) PROFILE.quick = [];
  if (QAEDIT >= 0) PROFILE.quick[QAEDIT] = {name:name, code:code};
  else PROFILE.quick.push({name:name, code:code});
  profileSave(); qaEditClose(); qaRender();
}
function qaDelete(){
  if (QAEDIT === null || QAEDIT < 0) return;
  var at = QAEDIT, nm = PROFILE.quick[at].name;
  uiDialog({title:'Delete this quick action?', body:'“' + nm + '” will be removed from this browser.',
            ok:'Delete', danger:true}).then(function(go){
    if (!go) return;
    PROFILE.quick.splice(at, 1);
    profileSave(); qaEditClose(); qaRender();
  });
}

