// Offer homing once per connection: nothing that uses machine coordinates is trustworthy until
// it has run, and the machine sits in Alarm after power-up anyway.
// In-app dialogs. Browser alert/confirm boxes can't be styled or read easily, and they look
// alien next to a machine control; these do the same job in the app's own language.
var DLG_RESOLVE = null;
function uiDialog(o){
  return new Promise(function(res){
    if (DLG_RESOLVE){ DLG_RESOLVE(false); }          // only one at a time
    DLG_RESOLVE = res;
    document.getElementById('dlgTitle').textContent = o.title || 'Confirm';
    var body = document.getElementById('dlgBody');
    body.innerHTML = '';
    String(o.body || '').split('\n').forEach(function(line){
      var d = document.createElement('div');
      if (/^\*\*\*/.test(line.trim())) d.className = 'badLine';
      else if (/^\u26a0|^\u26a0\u26a0/.test(line.trim())) d.className = 'warnLine';
      d.textContent = line === '' ? '\u00a0' : line;
      body.appendChild(d);
    });
    var ok = document.getElementById('dlgOk'), cancel = document.getElementById('dlgCancel');
    ok.textContent = o.ok || 'OK';
    ok.classList.toggle('danger', !!o.danger);
    ok.classList.toggle('primary', !o.danger);
    cancel.style.display = o.note ? 'none' : '';
    var alt = document.getElementById('dlgAlt');
    alt.hidden = !o.alt; alt.textContent = o.alt || '';
    cancel.textContent = o.cancel || 'Cancel';
    document.getElementById('dlgModal').hidden = false;
    ok.focus();
  });
}
function uiNote(title, body){ return uiDialog({title:title, body:body, ok:'OK', note:true}); }
function dlgEnd(v){
  document.getElementById('dlgModal').hidden = true;
  var r = DLG_RESOLVE; DLG_RESOLVE = null;
  if (r) r(v);
}
