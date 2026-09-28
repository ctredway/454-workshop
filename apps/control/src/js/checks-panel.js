/* ============================================================
   Checks panel / stats
   ============================================================ */
function renderChecks(){
  var list = document.getElementById('checksList');
  var badge = document.getElementById('checksBadge');
  if (!MODEL){ list.innerHTML=''; badge.textContent='0'; badge.className='badge'; return; }
  var all = MODEL.issues.concat(dynamicChecks(MODEL, cfg()));
  var errs = 0, warns = 0;
  for (var i=0;i<all.length;i++){ if (all[i].sev==='err') errs++; else if (all[i].sev==='warn') warns++; }
  badge.textContent = String(all.length);
  badge.className = 'badge' + (errs ? ' err' : (warns ? ' warn' : ''));
  if (!all.length){
    list.innerHTML = '<div id="checksEmpty"><div class="okmark">✓</div><div style="margin-top:8px">No issues found. Every command is in the GRBL / Carbide Motion dialect.</div></div>';
    return;
  }
  var order = {err:0, warn:1, info:2};
  all.sort(function(a,b){ return (order[a.sev]-order[b.sev]) || (a.line-b.line); });
  var html = '';
  for (var j=0;j<all.length;j++){
    var it = all[j];
    html += '<div class="issue ' + it.sev + '" data-ln="' + it.line + '" tabindex="0">' +
            '<div class="dot"></div><div><div class="msg">' + escapeHtml(it.msg) + '</div>' +
            '<div class="lnref">line ' + it.line + '</div></div></div>';
  }
  list.innerHTML = html;
}

