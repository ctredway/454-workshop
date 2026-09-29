// ---- a small right-click menu: items {label, fn, disabled, danger}, null for a divider ----
function ctxMenuClose(){
  var m = document.getElementById('ctxMenu');
  if (m && !m.hidden){ m.hidden = true; if (ctxMenuClose.back && ctxMenuClose.back.focus) ctxMenuClose.back.focus(); }
}
function ctxMenuOpen(x, y, items){
  var m = document.getElementById('ctxMenu');
  m.innerHTML = '';
  ctxMenuClose.back = document.activeElement;
  items.forEach(function (it) {
    if (!it){ var hr = document.createElement('div'); hr.className = 'ctxSep'; hr.setAttribute('role', 'separator'); m.appendChild(hr); return; }
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = it.label; b.setAttribute('role', 'menuitem');
    if (it.danger) b.classList.add('danger');
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', function (ev) { ev.stopPropagation(); m.hidden = true; it.fn(); });
    m.appendChild(b);
  });
  m.hidden = false;
  var w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  var first = m.querySelector('button:not([disabled])'); if (first) first.focus();
}
