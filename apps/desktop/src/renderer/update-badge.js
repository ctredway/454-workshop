// The desktop app's update notice, in the header of 454 Control and 454 Design: both pages include this
// file (their builds put it inline). In a browser there's no window.desktop454.updates, and nothing shows.
//
// The app checks for updates quietly (src/updater.js). This shows what it found, and nothing happens until
// it's clicked: Update available, then Download, then Restart to update. Restarting is refused while
// 454 Control says the machine is busy; the app checks that, not this page, so Design's notice is as safe
// as Control's.
(function () {
  'use strict';
  var api = window.desktop454 && window.desktop454.updates;
  var slot = document.getElementById('updateBadge');
  if (!api || !slot) return;

  var style = document.createElement('style');
  style.textContent =
    '#updateBadge{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:13px;font-weight:600;padding:5px 10px;' +
      'border-radius:5px;border:1px solid var(--amber);background:var(--panel);color:var(--amber)}' +
    '#updateBadge[hidden]{display:none}' +
    '#updateBadge:hover{background:var(--accent-faint)}' +
    '#updateBadge .dot{width:7px;height:7px;border-radius:50%;background:var(--amber);flex:none}' +
    '#updateBadge.ready{background:var(--amber);color:var(--on-accent)}' +
    '#updateBadge.ready .dot{background:var(--on-accent)}' +
    '#updateBadge.ready.busy{background:var(--panel);color:var(--muted);border-color:var(--line)}' +
    '#updateBadge.ready.busy .dot{background:var(--muted)}' +
    '#updateBadge.failed{color:var(--err);border-color:var(--err)}' +
    '#updateBadge.failed .dot{background:var(--err)}' +
    '#updatePanel{position:fixed;z-index:9000;width:360px;max-width:calc(100vw - 32px);padding:14px 16px;border-radius:8px;' +
      'background:var(--panel);color:var(--ink);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:13px;line-height:1.45}' +
    '#updatePanel h3{font-size:14px;margin:0 0 6px}' +
    '#updatePanel p{margin:0 0 8px;color:var(--muted)}' +
    '#updatePanel p.warn{color:var(--ink)}' +
    '#updatePanel .notes{white-space:pre-wrap;max-height:200px;overflow:auto;margin:0 0 10px;padding:8px 10px;border-radius:5px;' +
      'background:var(--panel-deep);border:1px solid var(--line);color:var(--ink);font-size:12.5px}' +
    '#updatePanel .bar{height:6px;border-radius:3px;background:var(--panel-deep);border:1px solid var(--line);overflow:hidden;margin:4px 0 10px}' +
    '#updatePanel .bar i{display:block;height:100%;background:var(--amber)}' +
    '#updatePanel .buttons{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}' +
    '#updatePanel button:disabled{background:var(--panel-deep);border-color:var(--line);color:var(--muted);opacity:.7;cursor:not-allowed}';
  document.head.appendChild(style);

  var view = { phase: 'none' }, panel = null, said = '';

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, primary, onClick, disabled) {
    var b = el('button', primary ? { class: 'primary', type: 'button' } : { type: 'button' }, label);
    if (disabled) b.disabled = true;
    b.addEventListener('click', onClick);
    return b;
  }
  function pct(v) { return Math.floor((v.progress || 0) * 100) + '%'; }

  // ---- the notice in the header
  function showBadge() {
    var v = view, label = '', title = '';
    if (v.phase === 'available') { label = 'Update available'; title = '454 Workshop ' + v.version + ' is available. Click for what’s new.'; }
    else if (v.phase === 'downloading') { label = 'Downloading update ' + pct(v); title = 'Downloading 454 Workshop ' + v.version + '. Keep working: nothing interrupts a job.'; }
    else if (v.phase === 'failed') { label = 'Update didn’t download'; title = 'Click for why, and to try again.'; }
    else if (v.phase === 'ready') {
      label = 'Restart to update';
      title = v.busy ? 'The machine is busy. You can restart to update once it’s idle.' : '454 Workshop ' + v.version + ' is ready to install.';
    }
    else if (v.phase === 'restarting') { label = 'Restarting…'; title = 'Installing 454 Workshop ' + v.version + '.'; }
    slot.hidden = !label;
    slot.className = v.phase + (v.busy ? ' busy' : '');
    slot.title = title;
    slot.textContent = '';
    slot.appendChild(el('span', { class: 'dot', 'aria-hidden': 'true' }));
    slot.appendChild(document.createTextNode(label));
    if (!label) closePanel();
  }

  // ---- the panel it opens
  function fill() {
    var v = view;
    panel.textContent = '';
    if (v.phase === 'available') {
      panel.appendChild(el('h3', {}, '454 Workshop ' + v.version + ' is available'));
      panel.appendChild(el('p', {}, 'You have ' + v.current + '.'));
      if (v.notes) panel.appendChild(el('div', { class: 'notes' }, v.notes));
      panel.appendChild(el('p', {}, 'It downloads in the background while you work. Nothing interrupts a job.'));
      panel.appendChild(buttons(
        button('Skip this version', false, function () { api.do('skip'); closePanel(); }),
        button('Download', true, function () { api.do('download'); })));
    } else if (v.phase === 'downloading') {
      panel.appendChild(el('h3', {}, 'Downloading 454 Workshop ' + v.version));
      var bar = el('div', { class: 'bar' }), fillBar = el('i');
      fillBar.style.width = pct(v); bar.appendChild(fillBar); panel.appendChild(bar);
      panel.appendChild(el('p', {}, pct(v) + '. Keep working: when it’s done, this changes to Restart to update.'));
    } else if (v.phase === 'failed') {
      panel.appendChild(el('h3', {}, 'The update didn’t download'));
      panel.appendChild(el('p', {}, v.error || ''));
      panel.appendChild(buttons(button('Close', false, closePanel), button('Try again', true, function () { api.do('download'); })));
    } else if (v.phase === 'ready' || v.phase === 'restarting') {
      panel.appendChild(el('h3', {}, '454 Workshop ' + v.version + ' is ready to install'));
      panel.appendChild(el('p', {}, 'Restarting closes 454 Control and 454 Design, installs the update, and opens 454 Workshop again. ' +
        'The machine disconnects: reconnect it afterwards.'));
      if (v.busy) panel.appendChild(el('p', { class: 'warn' }, 'The machine is busy. You can restart once the job, probe or jog is done and the spindle is off.'));
      if (said) panel.appendChild(el('p', { class: 'warn' }, said));
      panel.appendChild(el('p', {}, 'Or leave it: it installs the next time you close 454 Workshop.'));
      panel.appendChild(buttons(
        button('Later', false, closePanel),
        button(v.phase === 'restarting' ? 'Restarting…' : 'Restart now', true, restart, v.busy || v.phase === 'restarting')));
    }
    place();
  }
  function buttons() {
    var row = el('div', { class: 'buttons' });
    for (var i = 0; i < arguments.length; i++) row.appendChild(arguments[i]);
    return row;
  }
  function restart() {
    said = '';
    api.do('restart').then(function (r) {
      if (r && r.busy) { said = 'The machine got busy, so 454 Workshop didn’t restart. You can restart once it’s idle.'; if (panel) fill(); }
    });
  }
  function place() {
    if (!panel || !slot.getBoundingClientRect) return;
    var r = slot.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 6) + 'px';
    panel.style.right = Math.max(16, Math.round(window.innerWidth - r.right)) + 'px';
  }
  function openPanel() {
    if (panel) { closePanel(); return; }
    said = '';
    panel = el('div', { id: 'updatePanel', role: 'dialog', 'aria-label': 'Update' });
    document.body.appendChild(panel);
    fill();
  }
  function closePanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function show(v) {
    view = v || { phase: 'none' };
    showBadge();
    if (panel) fill();
  }
  slot.addEventListener('click', openPanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel) closePanel(); });
  document.addEventListener('mousedown', function (e) {
    if (panel && !panel.contains(e.target) && !slot.contains(e.target)) closePanel();
  });
  window.addEventListener('resize', place);
  api.onChange(show);
  api.view().then(show);
})();
