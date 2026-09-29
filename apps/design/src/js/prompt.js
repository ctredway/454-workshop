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
}
function hidePrompt(){
  document.getElementById('promptBar').classList.remove('on');
  document.getElementById('promptHint').classList.remove('on');
  document.getElementById('promptIn').blur();
  document.getElementById('floatIn').hidden = true;
  FLOAT_AT = null;
}
function showHint(t){
  var h = document.getElementById('promptHint');
  h.textContent = t; h.classList.add('on');
}

