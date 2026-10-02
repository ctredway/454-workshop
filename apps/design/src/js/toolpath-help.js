// ---- the toolpath editor's help ----
// Click or tab into a setting and the box above the buttons says what it does, in a sentence or three. Each row
// of the editor names its entry with data-help. "type" depends on the cut chosen.
var CUT_HELP = {
  name: ['Name', 'What this toolpath is called on its card, on the job sheet and in the G-code. Leave it empty and it’s named after the kind of cut.'],
  shapes: ['Shapes', 'The shapes this toolpath cuts. While this is lit, click a shape on the drawing to add it, or one that’s already in to take it out.'],
  tool: ['Tool', 'Pick the bit from your tool library. Its diameter, feed and speed are filled in below, and you can still change them for this toolpath alone.'],
  dia: ['Diameter', 'The cutter’s diameter. Every position in the cut is worked out from it, so measure the bit if you aren’t sure: a 6.35 mm bit entered as 6 cuts an outside profile 0.35 mm too small.'],
  feed: ['Feed', 'How fast the bit moves through the material while it cuts, in mm a minute. Too fast can break the bit; too slow rubs and burns the wood.'],
  dir: ['Direction', 'Climb: the bit turns with the direction it travels, which usually leaves the cleaner wall on a rigid machine. Conventional: against it, which can suit a machine that flexes, or brittle material.'],
  depth: ['Cut depth', 'How deep the cut goes, measured down from the top of the material. Tick through to go all the way: the material’s thickness from Job setup, plus the overcut. A parameter works here too, such as material / 2.'],
  over: ['Overcut', 'How far past the bottom of the material a through cut goes, so the part comes free cleanly. The bit goes this far into the spoilboard.'],
  step: ['Per pass', 'How much deeper each pass goes. Less is gentler on the bit and the machine, and takes longer. Half the bit’s diameter is a common start in wood.'],
  peck: ['Peck', 'How far the drill goes before it lifts to clear the chips. 0 drills each hole in one plunge.'],
  cham: ['Bevel', 'Bevel width: how wide the bevel is across the top face. Bit: the V-bit’s included angle, the angle between its two cutting edges (a “90° V-bit” is 90).'],
  chamMode: ['The line is', 'Where the drawn line sits on the finished bevel: at the part’s edge, with the bit’s tip on it, or at the top of the bevel, with the bevel going inside or outside the line.'],
  vc: ['V-carve', 'Bit: the V-bit’s included angle. Max depth, if you set one: the carving goes no deeper, and wider areas get a flat floor that a clearing toolpath can clean out. Tip: the width of the bit’s flat tip, if it has one.'],
  inlay: ['Inlay', 'Pocket depth: how deep the pocket’s flat floor is. Start depth: how deep the plug’s walls begin; the plug seats this deep, and the gap left under it holds the glue. Plug depth: how deep the plug is carved, more than the start depth so it stands proud to be planed off.'],
  stepover: ['Stepover', 'How far each clearing pass moves over from the last, as a share of the bit’s diameter. 40% is a good start. Smaller leaves a smoother floor and takes longer.'],
  clear: ['Clearing', 'Offset rings work outwards from the middle, following the pocket’s shape. Raster runs back and forth in straight lines at the angle you give, then goes round the walls.'],
  rest: ['Clean up after', 'Choose a pocket on the same shapes that’s cut with a larger bit. This bit then cuts only what that one couldn’t reach: the corners and the narrow parts.'],
  fin: ['Finishing', 'Leaves this much on the walls while roughing. Tick “then finish it” to take it off in one last pass at full depth, which leaves a cleaner wall.'],
  ramp: ['Ramp in', 'Ramp: each pass slopes down into the material along the cut, which is gentler on the bit than going straight down. The length is how far along the cut it slopes; empty means 4 times the bit’s diameter. Plunge goes straight down.'],
  lead: ['Lead in and out', 'The bit comes onto the line from the waste side and leaves the same way, so no pass starts or stops on the finished wall. Arc sweeps on in a curve; Line comes straight in. The size is the arc’s radius or the line’s length. A cut that ramps in uses only the lead out.'],
  start: ['Start', 'Where on each outline the cut begins. Press Set start, then click the outline. Automatic lets 454 Design choose.'],
  tabs: ['Tabs', 'Small bridges of wood left across the cut, so the part can’t come loose and be thrown. Press Edit tabs, then click the outline to add one, or click a tab to remove it.'],
  tabTools: ['Add evenly', 'Adds this many tabs to every shape, spaced evenly round it. Clear removes every tab.'],
  tabSize: ['Tab size', 'Length: the wood each tab leaves along the cut, whatever the bit’s size. Thickness: the wood it leaves, measured up from the bottom of the material. Longer and thicker holds better, and takes more cleaning up.'],
  tabShape: ['Tab shape', 'Flat tabs step straight up and down. 3D tabs taper up to their full thickness in the middle: easier to cut free, and a smaller mark.']
};
var CUT_HELP_TYPE = {
  outside: ['Profile, outside', 'Cuts round the outside of the line, so the part comes out at the size you drew. Use it to cut a part out.'],
  inside: ['Profile, inside', 'Cuts along the inside of the line, so the opening comes out at the size you drew. Use it for cut-outs, and for holes bigger than the bit.'],
  on: ['Profile, on the line', 'The middle of the bit follows the line, so the cut is half the bit wide on each side of it. Use it for grooves and scoring, not for parts that must be to size.'],
  pocket: ['Pocket', 'Clears everything inside the shape down to the depth, leaving a flat floor. A shape inside the shape is left standing, as an island.'],
  drill: ['Drill at centres', 'Goes straight down at the centre of each circle. The hole is the size of the bit, whatever size the circle is drawn.'],
  chamfer: ['Chamfer edges', 'Runs a V-bit along the line to cut a bevel on the edge.'],
  vcarve: ['V-carve', 'A V-bit follows the middle of each shape, going deeper where the shape is wider, so corners come out sharp. For lettering and signs.'],
  inlay: ['Inlay', 'Cuts the two halves of a V-bit inlay: a pocket in the base, and a mirrored plug in the inlay piece, which is flipped over and glued in.']
};
var CUT_HELP_ON = null;                                  // the row whose help is showing; null shows the kind of cut's
function cutHelpFor(key){
  if (key && key !== 'type' && CUT_HELP[key]) return CUT_HELP[key];
  return CUT_HELP_TYPE[CUT && CUT.side] || CUT_HELP_TYPE.outside;
}
function cutHelpShow(key){
  var pan = document.getElementById('cutPanel');
  if (!pan) return;
  // a row that has since been hidden (the cut was changed) has nothing to say
  var row = key ? pan.querySelector('.mirSlot[data-help="' + key + '"]') : null;
  if (row && (row.hidden || (row.parentNode && row.parentNode.hidden))) { row = null; key = null; }
  CUT_HELP_ON = row ? key : null;
  var h = cutHelpFor(CUT_HELP_ON);
  document.getElementById('cutHelpT').textContent = h[0];
  document.getElementById('cutHelpB').textContent = h[1];
  Array.prototype.forEach.call(pan.querySelectorAll('.mirSlot.helpOn'), function (r) { r.classList.remove('helpOn'); });
  if (row) row.classList.add('helpOn');
}
// Which row a click or a focus landed in
function cutHelpRowOf(el){
  while (el && el.id !== 'cutPanel'){
    if (el.getAttribute && el.getAttribute('data-help')) return el.getAttribute('data-help');
    el = el.parentNode;
  }
  return null;
}
// A heading with nothing under it for this kind of cut isn't shown.
function cutGroupsTidy(){
  var pan = document.getElementById('cutPanel');
  if (!pan) return;
  // the tab Shape row follows the size row a moment later (cutTabShapeFollows): here it must be right now
  var size = document.getElementById('cutTabSize'), shape = document.getElementById('cutTabShape');
  if (size && shape) shape.hidden = size.hidden;
  Array.prototype.forEach.call(pan.querySelectorAll('.cutGroup'), function (g) {
    var rows = g.querySelectorAll('.mirSlot'), any = false;
    Array.prototype.forEach.call(rows, function (r) { if (!r.hidden) any = true; });
    g.hidden = !any;
  });
}
function cutHelpWire(){
  var pan = document.getElementById('cutPanel');
  var on = function (e) { var k = cutHelpRowOf(e.target); if (k) cutHelpShow(k); };
  pan.addEventListener('focusin', on);
  pan.addEventListener('click', on);
}
