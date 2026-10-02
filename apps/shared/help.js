/* ---------------- help, inside the app ----------------
   A window over 454 Design or 454 Control that shows the guides themselves (the docs' own pages, in a frame)
   with a search box and a list of pages beside them, so a question is answered without leaving the app.
   Shared by both apps: each build includes this file and help.css (apps/shared).

   The pages and their search index (help-index.json, made by docs-site/scripts/help-index.mjs) sit where
   the app's Docs link points. A copy with no guides beside it says so and offers the website's. */
var HELP = {index: null, loading: null, failed: false, page: 'index.html', sec: '', opts: {}, was: null};
var HELP_WEB = 'https://454workshop.com/docs/';

// Where the guides are: the folder the app's own Docs link points into (the website's build moves it).
function helpBase(){
  var a = document.getElementById('openDocs'), href = a ? a.getAttribute('href') || '' : '';
  return href.replace(/[^\/]*$/, '');
}
// A word as typed, cut back so "probing" and "probe" find each other, and "tabs" finds "tab"
function helpStem(w){
  var s = w.replace(/(ing|ed|es|e|s)$/, '');
  return s.length >= 3 ? s : w;
}
function helpTerms(q){
  return String(q || '').toLowerCase().split(/[^a-z0-9$.]+/).filter(function (w) { return w && w !== '.'; }).map(helpStem);
}
// The sections that have every word asked for, best first: a word in the heading counts for most, then the
// page's name, then how often it's in the text. `own` (a pattern for page names) puts the app's own guides first:
// "tabs" in 454 Design means the tabs that hold a part, not 454 Control's Machine tab.
function helpSearch(index, q, own){
  var terms = helpTerms(q), out = [];
  if (!terms.length || !index) return out;
  index.forEach(function (s, at) {
    var title = s.title.toLowerCase(), page = s.pageTitle.toLowerCase(), text = s.text.toLowerCase(), score = 0, first = -1;
    for (var i = 0; i < terms.length; i++){
      var t = terms[i], got = 0, ti = title.indexOf(t);
      if (ti >= 0) got += (title === t || helpStem(title) === t) ? 40 : (ti === 0 || /[^a-z0-9]/.test(title.charAt(ti - 1))) ? 20 : 12;
      if (page.indexOf(t) >= 0) got += 5;
      var n = 0, from = text.indexOf(t);
      if (from >= 0 && (first < 0 || from < first)) first = from;
      while (from >= 0 && n < 5){ n++; from = text.indexOf(t, from + t.length); }
      got += n * 2;
      if (!got) return;                                   // every word must be there
      score += got;
    }
    if (s.level === 1) score += 2;                        // the top of a page, when it's about the thing
    if (own && own.test(s.page)) score += 8;              // this app's own guides before the other app's
    out.push({s: s, score: score, at: at, first: first});
  });
  out.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
  return out.slice(0, 40);
}
// A few words of the section round the first word found
function helpSnippet(hit){
  var text = hit.s.text, a = Math.max(0, hit.first - 50);
  if (hit.first < 0) a = 0;
  if (a > 0){ var sp = text.indexOf(' ', a); if (sp >= 0 && sp < a + 20) a = sp + 1; }
  var b = Math.min(text.length, a + 150);
  return (a > 0 ? '…' : '') + text.slice(a, b).trim() + (b < text.length ? '…' : '');
}
function helpIsOpen(){ var m = document.getElementById('helpModal'); return !!(m && !m.hidden); }

function helpBuild(){
  var m = document.getElementById('helpModal');
  if (m) return m;
  m = document.createElement('div'); m.id = 'helpModal'; m.hidden = true;
  m.innerHTML =
    '<div class="helpBox" role="dialog" aria-modal="true" aria-label="Help">' +
      '<div class="helpHead"><b>Help</b>' +
        '<input id="helpQ" type="search" autocomplete="off" spellcheck="false" placeholder="Search the guides: tabs, zero, probe…" aria-label="Search the guides">' +
        '<a id="helpFull" target="_blank" rel="noopener" title="The same guides, in a window of their own">Open the docs ↗</a>' +
        '<button id="helpX" title="Close (Esc)" aria-label="Close help">✕</button></div>' +
      '<div class="helpBody"><nav id="helpNav" aria-label="Pages and search results"></nav>' +
        '<iframe id="helpFrame" title="The guide"></iframe><div id="helpNone" hidden></div></div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener('mousedown', function (e) { if (e.target === m) helpClose(); });
  document.getElementById('helpX').addEventListener('click', helpClose);
  document.getElementById('helpQ').addEventListener('input', helpRenderNav);
  var navEl = document.getElementById('helpNav');
  navEl.addEventListener('click', function (e) {
    var b = e.target; while (b && b !== navEl && !(b.getAttribute && b.getAttribute('data-go'))) b = b.parentNode;
    if (b && b !== navEl) helpGo(b.getAttribute('data-go'));
  });
  document.getElementById('helpFrame').addEventListener('load', helpFrameLoaded);
  return m;
}
// The frame shows a page: it takes the app's light or dark theme, and the list marks where it is (the page
// may have been reached by a link inside the guide).
function helpFrameLoaded(){
  var f = document.getElementById('helpFrame');
  try {
    var loc = f.contentWindow.location, name = (loc.pathname.split('/').pop() || 'index.html');
    if (!/\.html$/.test(name)) name = name ? name + '.html' : 'index.html';
    f.contentDocument.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    if (name !== HELP.page){ HELP.page = name; HELP.sec = (loc.hash || '').slice(1); helpRenderNav(); }
  } catch (e) {}                                          // a page from somewhere else: nothing to read
}
// "page.html#section": show it
function helpGo(where){
  var parts = String(where || 'index.html').split('#');
  HELP.page = parts[0] || 'index.html'; HELP.sec = parts[1] || '';
  var f = document.getElementById('helpFrame'), url = helpBase() + HELP.page + (HELP.sec ? '#' + HELP.sec : '');
  if (!HELP.failed && f.getAttribute('src') !== url) f.setAttribute('src', url);
  document.getElementById('helpFull').setAttribute('href', HELP.failed ? HELP_WEB : url);
  helpRenderNav();
}
function helpRenderNav(){
  var nav = document.getElementById('helpNav'), none = document.getElementById('helpNone'), frame = document.getElementById('helpFrame');
  if (!nav) return;
  nav.innerHTML = '';
  none.hidden = !HELP.failed; frame.hidden = HELP.failed;
  if (HELP.failed){
    none.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = 'The guides aren’t beside this copy of the app, so help can’t be shown here. They’re on the website:';
    var a = document.createElement('a'); a.href = HELP_WEB; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '454workshop.com/docs';
    none.appendChild(p); none.appendChild(a);
    return;
  }
  if (!HELP.index){ var w = document.createElement('p'); w.className = 'helpMsg'; w.textContent = 'Loading the guides…'; nav.appendChild(w); return; }
  var q = document.getElementById('helpQ').value, terms = helpTerms(q);
  function button(cls, go, title){
    var b = document.createElement('button'); b.className = cls; b.setAttribute('data-go', go);
    var t = document.createElement('b'); t.textContent = title; b.appendChild(t);
    return b;
  }
  if (terms.length){
    var hits = helpSearch(HELP.index, q, HELP.opts.own);
    var say = document.createElement('p'); say.className = 'helpMsg';
    say.textContent = hits.length ? hits.length + (hits.length === 1 ? ' place' : ' places') + ' in the guides' + (hits.length === 40 ? ' (the best 40)' : '')
                                  : 'Nothing in the guides has “' + q.trim() + '”. Try another word, or pick a page:';
    nav.appendChild(say);
    hits.forEach(function (h) {
      var b = button('helpHit', h.s.page + (h.s.id ? '#' + h.s.id : ''), h.s.title);
      if (h.s.title !== h.s.pageTitle){ var inP = document.createElement('span'); inP.className = 'helpIn'; inP.textContent = h.s.pageTitle; b.appendChild(inP); }
      var sn = document.createElement('span'); sn.className = 'helpSnip'; sn.textContent = helpSnippet(h); b.appendChild(sn);
      if (h.s.page === HELP.page && (h.s.id || '') === HELP.sec) b.classList.add('on');
      nav.appendChild(b);
    });
    if (hits.length) return;
  }
  // the pages, and under the one being read, its sections
  var seen = {};
  HELP.index.forEach(function (s) {
    if (!seen[s.page]){
      seen[s.page] = true;
      var b = button('helpPg', s.page, s.pageTitle);
      if (s.page === HELP.page){ b.classList.add('on'); b.setAttribute('aria-current', 'page'); }
      nav.appendChild(b);
    } else if (s.page === HELP.page && s.level === 2){
      var c = button('helpSec', s.page + '#' + s.id, s.title);
      if (s.id === HELP.sec) c.classList.add('on');
      nav.appendChild(c);
    }
  });
}
function helpLoad(){
  if (HELP.index || HELP.loading) return;
  var fail = function () { HELP.loading = null; HELP.failed = true; helpGo(HELP.page + (HELP.sec ? '#' + HELP.sec : '')); };
  if (typeof fetch !== 'function' || !helpBase()){ fail(); return; }
  HELP.loading = fetch(helpBase() + 'help-index.json')
    .then(function (r) { if (!r.ok) throw new Error('no index'); return r.json(); })
    .then(function (ix) { if (!ix || !ix.length) throw new Error('empty index'); HELP.index = ix; HELP.loading = null; HELP.failed = false; helpRenderNav(); })
    .catch(fail);
}
// Open the help: at "page.html#section", or where the app says is fitting for what's on screen.
function helpOpen(where){
  var m = helpBuild();
  if (!where && HELP.opts.context) where = HELP.opts.context();
  if (m.hidden) HELP.was = document.activeElement;
  m.hidden = false;
  document.getElementById('helpQ').value = '';
  helpLoad();
  helpGo(where || 'index.html');
  var q = document.getElementById('helpQ'); if (q.focus) q.focus();
}
function helpClose(){
  var m = document.getElementById('helpModal');
  if (!m || m.hidden) return;
  m.hidden = true;
  if (HELP.was && HELP.was.focus && document.body.contains(HELP.was)) HELP.was.focus();
  HELP.was = null;
}
// F1 and the ? button open it. While it's open, key presses stay with it: the app's own shortcuts (and, in
// 454 Control, the jog keys) must not act on a key typed into the search box or pressed over the guide.
// Only key presses are held back, never releases: a jog key held down when help opened still stops on release.
function helpKey(e){
  if (e.key === 'F1'){ e.preventDefault(); e.stopPropagation(); if (!helpIsOpen()) helpOpen(); return; }
  if (!helpIsOpen()) return;
  e.stopPropagation();
  if (e.key === 'Escape'){ e.preventDefault(); helpClose(); }
  else if (e.key === 'Enter' && e.target && e.target.id === 'helpQ'){
    var first = document.querySelector('#helpNav .helpHit');
    if (first){ e.preventDefault(); helpGo(first.getAttribute('data-go')); }
  }
}
function helpWire(opts){
  HELP.opts = opts || {};
  var btn = document.getElementById('helpBtn');
  if (btn) btn.addEventListener('click', function () { helpOpen(); });
  window.addEventListener('keydown', helpKey, true);     // at the window, on the way down: before anything in the app hears it
}
