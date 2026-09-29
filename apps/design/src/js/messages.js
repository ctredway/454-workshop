/* ---------------- toast notifications ----------------
   Status and error messages. Dismissed only by the user (no auto-hide) so a
   failure can't scroll past unnoticed. */
function toast(kind, title, detail){
  if (typeof DRY !== 'undefined' && DRY) return null;          // previews never talk
  var wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  var msg = document.createElement('div');
  msg.className = 'tmsg';
  var b = document.createElement('b');
  b.textContent = title;
  msg.appendChild(b);
  if (detail){
    var d = document.createElement('span');
    d.textContent = detail;
    msg.appendChild(d);
  }
  var x = document.createElement('button');
  x.className = 'tx';
  x.title = 'Dismiss';
  x.textContent = '\u00d7';
  x.addEventListener('click', function(){ el.remove(); });
  el.appendChild(msg);
  el.appendChild(x);
  wrap.appendChild(el);
  // cap the stack so a repeated failure can't fill the screen
  while (wrap.children.length > 6) wrap.removeChild(wrap.firstChild);
  // fade out after 10 s; hovering holds it, and it fades 3 s after the pointer leaves
  var timer = null;
  function fade(){ el.classList.add('fade'); setTimeout(function(){ el.remove(); }, 460); }
  function arm(ms){ clearTimeout(timer); timer = setTimeout(fade, ms); }
  el.addEventListener('mouseenter', function(){ clearTimeout(timer); el.classList.remove('fade'); });
  el.addEventListener('mouseleave', function(){ arm(3000); });
  arm(10000);
  // keep the last 5 in the status-bar history
  MSG_LOG.unshift({kind:kind || 'info', title:title, detail:detail || '', at:Date.now()});
  if (MSG_LOG.length > 5) MSG_LOG.length = 5;
  refreshMsgBulb();
  return el;
}
var MSG_LOG = [];
function msgAgo(t){
  var sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.round(sec / 60) + ' min ago';
  var d = new Date(t);
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}
function renderMsgList(){
  var list = document.getElementById('msgList');
  if (!list) return;
  list.innerHTML = '';
  MSG_LOG.forEach(function(m){
    var it = document.createElement('div');
    it.className = 'mItem ' + m.kind;
    var b = document.createElement('b'); b.textContent = m.title; it.appendChild(b);
    if (m.detail){ var d = document.createElement('span'); d.className = 'mDetail'; d.textContent = m.detail; it.appendChild(d); }
    var tm = document.createElement('span'); tm.className = 'mTime'; tm.textContent = msgAgo(m.at); it.appendChild(tm);
    list.appendChild(it);
  });
}
function refreshMsgBulb(){
  var bulb = document.getElementById('msgBulb');
  if (!bulb) return;
  bulb.hidden = !MSG_LOG.length;
  document.getElementById('msgCount').textContent = MSG_LOG.length;
  bulb.title = MSG_LOG.length ? 'Recent messages (' + MSG_LOG.length + ')' : 'Recent messages';
  var panel = document.getElementById('msgPanel');
  if (!MSG_LOG.length) setMsgPanel(false);
  else if (panel && !panel.hidden) renderMsgList();
}
function setMsgPanel(open){
  var panel = document.getElementById('msgPanel'), bulb = document.getElementById('msgBulb');
  if (!panel) return;
  if (open) renderMsgList();
  panel.hidden = !open;
  if (bulb) bulb.setAttribute('aria-expanded', open ? 'true' : 'false');
}

