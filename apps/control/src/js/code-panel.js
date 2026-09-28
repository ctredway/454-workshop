/* ============================================================
   Code panel (virtualized)
   ============================================================ */
var LINE_H = 20, curHiLine = -1, issueSelLine = -1;
function renderCode(){
  var scroller = document.getElementById('codeScroller');
  var spacer = document.getElementById('codeSpacer');
  if (!MODEL){ spacer.innerHTML=''; spacer.style.height='0px'; return; }
  var n = MODEL.lines.length;
  spacer.style.height = (n * LINE_H) + 'px';
  var top = scroller.scrollTop;
  var first = Math.max(0, Math.floor(top / LINE_H) - 6);
  var last = Math.min(n, first + Math.ceil(scroller.clientHeight / LINE_H) + 12);
  var html = '';
  for (var i = first; i < last; i++){
    var ln = i + 1;
    var cls = 'cl' + (ln === curHiLine ? ' cur' : '') + (ln === issueSelLine ? ' issueSel' : '');
    html += '<div class="' + cls + '" style="top:' + (i*LINE_H) + 'px" data-ln="' + ln + '">' +
            '<span class="ln">' + ln + '</span><span class="tx">' + escapeHtml(MODEL.lines[i]) + '</span></div>';
  }
  spacer.innerHTML = html;
}
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function highlightLine(ln){
  if (ln === curHiLine) return;
  curHiLine = ln;
  var scroller = document.getElementById('codeScroller');
  if (document.getElementById('followChk').checked){
    var want = (ln-1)*LINE_H - scroller.clientHeight/2 + LINE_H;
    scroller.scrollTop = Math.max(0, want);
  }
  renderCode();
}

function jumpToLine(ln){
  if (!MODEL) return;
  playing = false; updatePlayBtn();
  var si = MODEL.lineFirstSeg[ln];
  if (si !== undefined){
    // end of that line's motion
    var j = si; while (j+1 < MODEL.segs.length && MODEL.segs[j+1].line === ln) j++;
    setTime(MODEL.segs[j].t1);
  } else {
    issueSelLine = ln;
    var scroller = document.getElementById('codeScroller');
    scroller.scrollTop = Math.max(0, (ln-1)*LINE_H - scroller.clientHeight/2);
    renderCode();
  }
}

