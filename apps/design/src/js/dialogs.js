var DLG_RESOLVE = null;
function uiDialog(o){
  return new Promise(function(res){
    if (DLG_RESOLVE) DLG_RESOLVE(false);
    DLG_RESOLVE = res;
    document.getElementById('dlgTitle').textContent = o.title || 'Confirm';
    document.getElementById('dlgBody').textContent = o.body || '';
    var ok = document.getElementById('dlgOk'), cancel = document.getElementById('dlgCancel');
    ok.textContent = o.ok || 'OK';
    ok.classList.toggle('danger', !!o.danger);
    ok.classList.toggle('primary', !o.danger);
    cancel.style.display = o.note ? 'none' : '';
    document.getElementById('dlgModal').hidden = false;
    ok.focus();
  });
}
function dlgEnd(v){
  document.getElementById('dlgModal').hidden = true;
  var r = DLG_RESOLVE; DLG_RESOLVE = null;
  if (r) r(v);
}
