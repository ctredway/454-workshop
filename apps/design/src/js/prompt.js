/* ---------------- prompt / hint ---------------- */
// Where the floating value box should sit, in canvas pixels. Callers set FLOAT_AT for a
// specific spot (the dimension just placed, the corner just clicked); otherwise it follows
// the cursor, so what you type appears where you are looking.
var FLOAT_AT = null;
function floatAtWorld(x, y){ var p = w2s(x, y); FLOAT_AT = {x:p.x, y:p.y}; }
function placeFloatIn(){
  var box = document.getElementById('floatIn'), cvEl = document.getElementById('cv');
  if (!box || box.hidden) return;
  var at = FLOAT_AT || {x: MOUSE.mx, y: MOUSE.my};
  var w = box.offsetWidth || 150, h = box.offsetHeight || 28;
  var maxX = (cvEl.clientWidth || 800) - w - 8, maxY = (cvEl.clientHeight || 600) - h - 8;
  box.style.left = Math.max(8, Math.min(at.x + 16, maxX)) + 'px';
  box.style.top  = Math.max(8, Math.min(at.y - h - 10, maxY)) + 'px';
}
function showPrompt(label, val, selectAll, tag){
  var delB = document.getElementById('floatDel');
  if (delB) delB.hidden = !(DRAW && DRAW.stage === 'dimValue');
  document.getElementById('promptLbl').textContent = label;
  var i = document.getElementById('promptIn');
  i.value = val || '';
  document.getElementById('promptBar').classList.add('on');
  document.getElementById('floatTag').textContent = tag || '';
  var box = document.getElementById('floatIn');
  box.hidden = !selectAll;            // click-only prompts don't need a box hovering over the drawing
  placeFloatIn();
  // Do NOT auto-focus: focusing here steals the first canvas click from click-based tools
  // (trim, extend, fillet corners). The field receives focus when the user starts typing.
  if (selectAll){ i.focus(); i.select(); }
  paramPickRender();
}
function hidePrompt(){
  document.getElementById('promptBar').classList.remove('on');
  document.getElementById('promptHint').classList.remove('on');
  document.getElementById('promptIn').blur();
  document.getElementById('floatIn').hidden = true;
  paramPickHide();
  FLOAT_AT = null;
}
function showHint(t){
  var h = document.getElementById('promptHint');
  h.textContent = t; h.classList.add('on');
}


// ---- the parameter list under the value box ----
// While a value is typed (a dimension, a size mid-drawing), the drawing's parameters are listed under the box with
// what each comes to, narrowed to those starting with the name being typed. A click, or Tab (or ↓ ↑ then Enter),
// puts the name in. Not where a typed letter picks a tool instead (nothing being drawn, or the Select tool).
var PPICK = {items: [], on: -1, word: null};
function paramPickWanted(){
  var box = document.getElementById('floatIn');
  return !!(box && !box.hidden && DRAW && TOOL !== 'select' && document.activeElement === document.getElementById('promptIn'));
}
function paramPickCaret(input){ return typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length; }
// The name being typed, just before the cursor: {start, text}, or null (a unit after a number, as in 18mm, isn't one)
function paramPickWord(input){
  var upto = input.value.slice(0, paramPickCaret(input));
  var m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(upto);
  if (!m) return null;
  if (m.index > 0 && /[0-9.]/.test(upto.charAt(m.index - 1))) return null;
  return {start: m.index, text: m[0]};
}
function paramPickAll(){
  var out = paramsArr().map(function (p) { return p.name; });
  if (DOC.stock && DOC.stock.t > 0) out.push(PARAM_BUILTIN);
  return out;
}
function paramPickRender(){
  var list = document.getElementById('paramPick'), input = document.getElementById('promptIn');
  if (!list) return;
  var names = paramPickWanted() ? paramPickAll() : [];
  var w = names.length ? paramPickWord(input) : null, lw = w ? w.text.toLowerCase() : '';
  var items = names.filter(function (n) { return !lw || n.toLowerCase().indexOf(lw) === 0; });
  if (!items.length || (items.length === 1 && w && items[0].toLowerCase() === lw)){ paramPickHide(); return; }   // nothing to offer, or already typed
  if (PPICK.items.join() !== items.join()) PPICK.on = -1;
  PPICK.items = items; PPICK.word = w;
  list.innerHTML = '';
  var head = document.createElement('div'); head.className = 'ppHead'; head.textContent = 'Parameters: click or Tab to use';
  list.appendChild(head);
  items.forEach(function (n, k) {
    var row = document.createElement('div'), r;
    row.className = 'pp' + (k === PPICK.on ? ' on' : ''); row.setAttribute('role', 'option');
    try { r = fmtDisp(paramValue(n, [])) + ' ' + unitTag(); } catch (e) { r = '?'; }
    var b = document.createElement('b'); b.textContent = n;
    var s = document.createElement('span'); s.textContent = n === PARAM_BUILTIN ? r + ' (thickness)' : r;
    row.appendChild(b); row.appendChild(s);
    row.addEventListener('mousedown', function (e) { e.preventDefault(); paramPickUse(n); });   // keep the typing in the box
    list.appendChild(row);
  });
  var box = document.getElementById('floatIn'), cvEl = document.getElementById('cv');
  list.classList.toggle('up', !!(cvEl && box.offsetTop > (cvEl.clientHeight || 600) / 2));      // low down: above the box
  list.hidden = false;
}
function paramPickHide(){
  var list = document.getElementById('paramPick');
  if (list) list.hidden = true;
  PPICK.items = []; PPICK.on = -1; PPICK.word = null;
}
// Put a name in place of the one being typed (or at the cursor)
function paramPickUse(name){
  var input = document.getElementById('promptIn'), w = paramPickWord(input);
  var at = paramPickCaret(input), from = w ? w.start : at;
  input.value = input.value.slice(0, from) + name + input.value.slice(at);
  if (input.setSelectionRange) input.setSelectionRange(from + name.length, from + name.length);
  input.focus();
  paramPickHide();
}
// Keys for the list, before the box's own: true if the list took the key
function paramPickKey(e){
  var list = document.getElementById('paramPick');
  if (!list || list.hidden || !PPICK.items.length) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    var n = PPICK.items.length;
    PPICK.on = e.key === 'ArrowDown' ? (PPICK.on + 1) % n : (PPICK.on <= 0 ? n - 1 : PPICK.on - 1);
    paramPickRender(); return true;
  }
  if (e.key === 'Tab'){ paramPickUse(PPICK.items[PPICK.on >= 0 ? PPICK.on : 0]); return true; }
  if (e.key === 'Enter' && PPICK.on >= 0){ paramPickUse(PPICK.items[PPICK.on]); return true; }   // chosen with the arrows
  if (e.key === 'Escape'){ paramPickHide(); return true; }
  return false;
}
