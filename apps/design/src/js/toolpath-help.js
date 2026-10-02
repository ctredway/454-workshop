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
// A small picture beside the words, for the settings that are easier seen than said. Drawn in the page's own
// colours (design.css, #cutHelpPic): hw wood, hc where the bit goes, hb the bit or the drawn line, hd a measure.
var CUT_PIC_TABS =
  '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from the side: the cut goes through the material, and steps up over two tabs. A tab’s length is measured along the cut, its thickness up from the bottom.">' +
  '<rect class="hd" x="6" y="20" width="108" height="36" stroke-dasharray="3 3"/>' +
  '<rect class="hw" x="18" y="44" width="22" height="12"/><rect class="hw" x="84" y="44" width="22" height="12"/>' +
  '<path class="hc" d="M6 56H16V44H42V56H82V44H108V56H114"/>' +
  '<path class="hd" d="M18 37H40M18 34V40M40 34V40"/><text x="29" y="31" text-anchor="middle">length</text>' +
  '<path class="hd" d="M62 44V56M59 44H65M59 56H65"/><text x="62" y="39" text-anchor="middle">thickness</text>' +
  '<text x="60" y="68" text-anchor="middle">side view</text></svg>';
var CUT_HELP_PIC = {
  stepover:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the bit on one clearing pass, and on the next, overlapping it. The stepover is the distance between the two passes.">' +
    '<path class="hc" d="M10 22H110M10 42H110"/>' +
    '<circle class="hk" cx="42" cy="22" r="14"/><circle class="hk" cx="42" cy="42" r="14" stroke-dasharray="3 3"/>' +
    '<path class="hd" d="M70 22V42M67 22H73M67 42H73"/><text x="76" y="35">stepover</text>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  ramp:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from the side: the bit slopes down into the material over the ramp length, then cuts level at the depth of the pass.">' +
    '<rect class="hw" x="6" y="26" width="108" height="32"/>' +
    '<path class="hc" d="M10 26L58 44H108"/><path class="ha" d="M112 44l-7 -3.5v7z"/>' +
    '<path class="hd" d="M10 17H58M10 14V20M58 14V20"/><text x="34" y="11" text-anchor="middle">ramp length</text>' +
    '<path class="hd" d="M70 26V44M67 26H73M67 44H73"/><text x="76" y="38">one pass</text>' +
    '<text x="60" y="68" text-anchor="middle">side view</text></svg>',
  lead:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the cut runs round the outside of the part, and the bit sweeps onto it in an arc from the waste side.">' +
    '<rect class="hb" x="46" y="14" width="58" height="36"/><text x="75" y="35" text-anchor="middle">part</text>' +
    '<rect class="hc" x="39" y="7" width="72" height="50" rx="7"/>' +
    '<path class="hc" d="M19 46A20 20 0 0 0 39 26" stroke-dasharray="4 3"/><path class="ha" d="M39 21l-3.5 7h7z"/>' +
    '<text x="4" y="58">lead in</text>' +
    '<text x="75" y="68" text-anchor="middle">top view</text></svg>',
  tabs: CUT_PIC_TABS,
  tabSize: CUT_PIC_TABS
};
// And one for each kind of cut: which side of the drawn line the bit runs, or what it leaves. hk is the bit.
var CUT_TYPE_PIC = {
  outside:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the bit runs round the outside of the drawn line, touching it, so the part inside keeps its drawn size.">' +
    '<rect class="hb" x="40" y="15" width="56" height="34"/><text x="68" y="35" text-anchor="middle">part</text><rect class="hc" x="33" y="8" width="70" height="48" rx="7"/><circle class="hk" cx="33" cy="32" r="7"/>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  inside:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the bit runs round the inside of the drawn line, touching it, so the opening keeps its drawn size.">' +
    '<rect class="hb" x="26" y="8" width="72" height="48"/><text x="68" y="35" text-anchor="middle">opening</text><rect class="hc" x="33" y="15" width="58" height="34"/><circle class="hk" cx="33" cy="32" r="7"/>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  on:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the middle of the bit follows the drawn line, so the cut is half the bit wide on each side of it.">' +
    '<rect class="hb" x="30" y="11" width="64" height="42"/><rect class="hc" x="30" y="11" width="64" height="42" stroke-dasharray="5 4"/><circle class="hk" cx="30" cy="32" r="7"/>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  pocket:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: the bit clears the whole area inside the drawn line, in rings working outwards from the middle.">' +
    '<rect class="hb" x="24" y="7" width="76" height="50"/><rect class="hc" x="31" y="14" width="62" height="36"/><rect class="hc" x="40" y="23" width="44" height="18"/><path class="hc" d="M49 32H75"/><circle class="hk" cx="31" cy="32" r="7"/>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  drill:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from above: three drawn circles of different sizes, each drilled at its centre with a hole the size of the bit.">' +
    '<circle class="hb" cx="26" cy="32" r="9"/><circle class="hb" cx="60" cy="32" r="14"/><circle class="hb" cx="96" cy="32" r="6"/><circle class="hk" cx="26" cy="32" r="5"/><circle class="hk" cx="60" cy="32" r="5"/><circle class="hk" cx="96" cy="32" r="5"/>' +
    '<text x="60" y="68" text-anchor="middle">top view</text></svg>',
  chamfer:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from the side: a V-bit runs along the top corner of the part and cuts it to a bevel.">' +
    '<path class="hw" d="M6 30H84L98 44V58H6Z"/><path class="hk" d="M70 16L102 48L118 32V16Z"/><path class="hc" d="M84 30L98 44"/><text x="34" y="47" text-anchor="middle">part</text>' +
    '<text x="60" y="68" text-anchor="middle">side view</text></svg>',
  vcarve:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from the side: a V-bit cuts a shallow groove where the shape is narrow and a deep one where it is wide.">' +
    '<path class="hw" d="M6 26H22L30 34L38 26H58L78 46L98 26H114V58H6Z"/><path class="hc" d="M22 26L30 34L38 26M58 26L78 46L98 26"/><text x="30" y="20" text-anchor="middle">narrow</text><text x="78" y="20" text-anchor="middle">wide</text>' +
    '<text x="60" y="68" text-anchor="middle">side view</text></svg>',
  inlay:
    '<svg viewBox="0 0 120 72" role="img" aria-label="Seen from the side: a pocket with sloping walls in the base, and above it the plug, cut to the same slope, ready to be glued in.">' +
    '<path class="hw" d="M6 42H34L42 54H78L86 42H114V60H6Z"/><path class="hc" d="M34 42L42 54H78L86 42"/><path class="hk" d="M26 10H94V20H84L77 31H43L36 20H26Z"/><text x="60" y="23" text-anchor="middle">plug</text><path class="hd" d="M60 34V40M57 37L60 41L63 37"/>' +
    '<text x="60" y="68" text-anchor="middle">side view</text></svg>'
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
  var pic = document.getElementById('cutHelpPic'), onKind = !CUT_HELP_ON || CUT_HELP_ON === 'type';
  var svg = (onKind ? CUT_TYPE_PIC[CUT && CUT.side] : CUT_HELP_PIC[CUT_HELP_ON]) || '';
  pic.innerHTML = svg; pic.hidden = !svg;
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
