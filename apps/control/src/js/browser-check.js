// The browser check has a script of its own, ahead of everything else, so nothing that goes wrong in the
// main script (such as the 3D view's library failing to load) can stop it from telling people why.
// 454 Control talks to the machine over Web Serial, which only Chromium-based browsers on a computer
// have. Checked by the feature itself (SERIAL.supported), not the browser's name: Brave is Chromium but
// turns Web Serial off, and no phone or tablet browser has it. The name only words the explanation.
function browserWhy(){
  var ua = navigator.userAgent || '';
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!window.isSecureContext) return 'This page was opened without a secure (https) connection, and browsers only allow talking to USB devices on secure pages.';
  if (mobile) return 'It talks to your machine over USB using a browser feature called Web Serial, which phone and tablet browsers don\u2019t have.';
  if (navigator.brave) return 'It talks to your machine over USB using a browser feature called Web Serial. Brave is built on Chromium, but turns Web Serial off.';
  if (/Firefox\//.test(ua)) return 'It talks to your machine over USB using a browser feature called Web Serial, which Firefox doesn\u2019t have.';
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'It talks to your machine over USB using a browser feature called Web Serial, which Safari doesn\u2019t have.';
  return 'It talks to your machine over USB using a browser feature called Web Serial, which this browser doesn\u2019t have.';
}
function browserCheck(){
  if ('serial' in navigator) return false;
  try { if (sessionStorage.getItem('454-browser-ok')) return true; } catch (e) {}   // already continued, this visit
  document.getElementById('browserWhy').textContent = browserWhy();
  document.getElementById('browserModal').hidden = false;
  document.getElementById('browserContinue').focus();
  return true;
}
document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('browserContinue').addEventListener('click', function(){
    document.getElementById('browserModal').hidden = true;
    try { sessionStorage.setItem('454-browser-ok', '1'); } catch (e) {}      // not again this visit
  });
  document.getElementById('browserModal').addEventListener('keydown', function(e){
    if (e.key === 'Tab'){                                                    // keep the keyboard inside the dialog
      var f = Array.prototype.slice.call(this.querySelectorAll('a[href], button'));
      var i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  setTimeout(browserCheck, 400);   // on its own: nothing else failing at startup can stop it
});
