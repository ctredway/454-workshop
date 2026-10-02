// ---- passes: how many, and how deep each goes ----
// A profile or a pocket goes down in steps of "Per pass", the last step taking whatever is left. These are the
// same sums the CAM engine does (Cam.passCount and Cam.passDepths in cam.js; a test holds the two together),
// written here too so the editor and the cards can show them whether or not the engine is loaded.
function tpPassCount(depth, step){
  return depth > 0 && step > 0 ? Math.max(1, Math.ceil(depth / step - 1e-9)) : 0;
}
function tpPassDepths(depth, step){
  var out = [];
  for (var p = 1, n = tpPassCount(depth, step); p <= n; p++) out.push(Math.min(depth, step * p));
  return out;
}
// The kinds of cut that go down this way. (A V-carve's depth follows the shape, a chamfer's the bevel, and a drill
// pecks: they have their own rows.)
function tpHasPasses(tp){
  return !!tp && (tp.side === 'outside' || tp.side === 'inside' || tp.side === 'on' || tp.side === 'pocket');
}
// What to put in the Per pass box so that a depth is cut in n passes, as near even as the box's precision allows.
// Rounded up at that precision, never down: n passes of a rounded-down step would stop short of the depth, and
// the engine would add one more.
function tpStepText(depth, n){
  var dp = dispIn() ? 3 : 2, k = Math.pow(10, dp);
  return (Math.ceil(toDisp(depth) / n * k - 1e-6) / k).toFixed(dp);
}
// The depths as a line of text: every one when there are few, the first three and the last two when there are many
function tpPassSay(depths){
  var f = function (d) { return fmtDisp(d); };
  if (!depths.length) return '';
  var shown = depths.length <= 8 ? depths.map(f).join(' · ')
            : depths.slice(0, 3).map(f).join(' · ') + ' … ' + depths.slice(-2).map(f).join(' · ');
  return shown + ' ' + unitTag();
}
// The editor's Passes row: the count (which can be typed), the depth of each pass, and, when the last pass would
// take much less than the others, an offer to make them even.
function cutPassesRender(){
  var row = document.getElementById('cutPassRow');
  if (!row || !CUT) return;
  row.hidden = !tpHasPasses(CUT);
  if (row.hidden) return;
  var depth = tpDepth(CUT), step = CUT.step, n = tpPassCount(depth, step), depths = tpPassDepths(depth, step);
  var box = document.getElementById('cutPasses');
  if (document.activeElement !== box) box.value = n ? String(n) : '';
  box.disabled = !(depth > 0);
  document.getElementById('cutPassList').textContent = n ? tpPassSay(depths) : (depth > 0 ? '' : 'set the depth first');
  var last = n > 1 ? depth - step * (n - 1) : step, even = document.getElementById('cutPassEven'), note = document.getElementById('cutPassNote');
  var thin = n > 1 && last < step * 0.5 - 1e-9;
  even.hidden = !thin; note.hidden = !thin;
  if (thin){
    note.textContent = 'The last pass takes only ' + fmtDisp(last) + ' ' + unitTag() + '.';
    even.textContent = 'Make them even: ' + n + ' of ' + tpStepText(depth, n);
  }
}
// A number typed in the Passes box, or Make them even: Per pass becomes the depth divided by that many
function cutPassesSet(n){
  if (!CUT || !tpHasPasses(CUT)) return;
  var depth = tpDepth(CUT);
  n = Math.round(n);
  if (!(depth > 0) || !(n >= 1) || n > 500) return;
  document.getElementById('cutStep').value = tpStepText(depth, n);
  cutFromForm(); cutRender();
}
function cutPassesWire(){
  var box = document.getElementById('cutPasses');
  box.addEventListener('input', function () { cutPassesSet(parseFloat(box.value)); });
  // the count shown is always the one the cut will really take (a very fine division can't be reached at the
  // box's precision): put it right when the box is left
  box.addEventListener('change', function () { if (CUT) box.value = String(tpPassCount(tpDepth(CUT), CUT.step) || ''); });
  document.getElementById('cutPassEven').addEventListener('click', function () { if (CUT) cutPassesSet(tpPassCount(tpDepth(CUT), CUT.step)); });
}
