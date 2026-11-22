// Where the help opens (F1, or the ? in the header) when nothing more particular was asked for: the part of the
// guides about what's on screen. Each address is a page of the docs and a heading on it; the docs' build checks
// that every one named here exists (docs-site/scripts/help-index.mjs).
var HELP_FOR_CUT = {outside: 'cam-reference.html#profile', inside: 'cam-reference.html#profile', on: 'cam-reference.html#profile',
                    pocket: 'cam-reference.html#pocket', drill: 'cam-reference.html#drill', chamfer: 'cam-reference.html#chamfer',
                    vcarve: 'cam-reference.html#v-carve', inlay: 'cam-reference.html#inlay'};
var HELP_FOR_WINDOW = [
  ['jobModal', 'design-workspace.html#job-setup'],
  ['libModal', 'design-workspace.html#the-tool-library'],
  ['toolModal', 'design-workspace.html#the-tool-library'],
  ['settingsModal', 'design-workspace.html#settings'],
  ['nestModal', 'design-quickstart.html#5-nest-parts-on-the-material'],
  ['textModal', 'design-tools.html#text'],
  ['woodModal', 'cam-reference.html#order-checking-and-saving'],
  ['jsModal', 'cam-reference.html#order-checking-and-saving']
];
function designHelpWhere(){
  for (var i = 0; i < HELP_FOR_WINDOW.length; i++){
    var w = document.getElementById(HELP_FOR_WINDOW[i][0]);
    if (w && !w.hidden) return HELP_FOR_WINDOW[i][1];
  }
  if (CUT) return HELP_FOR_CUT[CUT.side] || 'cam-reference.html#the-basics';
  if (tpList().length) return 'cam-reference.html#the-basics';
  return 'design-quickstart.html';
}

// The info icons: where each goes (a heading), the part of the guides it opens, and the line or two it shows when
// the pointer rests on it. Keep a tip to two sentences: it says what the section is for, the guide says the rest.
var HELP_ICONS = [
  // the tools, in the ribbon across the top: one for each section (RIBBON_TABS, move.js)
  ['.rbSec[data-sec="home-file"] > .rbCap', 'design-tools.html#home', 'Start a new drawing, open one or a VCarve or Carbide Create project, import DXF, SVG or a picture, and save.'],
  ['.rbSec[data-sec="home-export"] > .rbCap', 'design-tools.html#export-dxf', 'Save the drawing as DXF or SVG, for other programs, lasers and vinyl cutters.'],
  ['.rbSec[data-sec="home-history"] > .rbCap', 'design-tools.html#undo', 'Step back through what you’ve done, and forward again.'],
  ['.rbSec[data-sec="home-view"] > .rbCap', 'design-tools.html#fit', 'Fit the drawing to the window, and measure distances and gaps.'],
  ['.rbSec[data-sec="draw-pick"] > .rbCap', 'design-tools.html#select--move', 'Pick shapes to move, copy or change them. Drag to move; click a picked shape again to rotate it.'],
  ['.rbSec[data-sec="draw-shapes"] > .rbCap', 'design-tools.html#draw', 'Lines, rectangles, circles, curves and more. Type a size while you draw, or set one in the tool’s panel, to make it exact.'],
  ['.rbSec[data-sec="draw-text"] > .rbCap', 'design-tools.html#text', 'Words, in the font you choose, ready to V-carve or cut out.'],
  ['.rbSec[data-sec="draw-dims"] > .rbCap', 'design-tools.html#dimension', 'Dimensions set sizes: type a new number and the shape follows. Name your sizes in Parameters to change many at once.'],
  ['.rbSec[data-sec="modify-corners"] > .rbCap', 'design-tools.html#fillet', 'Round off corners, one at a time or every corner of a shape at once.'],
  ['.rbSec[data-sec="modify-trim"] > .rbCap', 'design-tools.html#trim', 'Cut a shape back to where another crosses it, or run a line out until it meets one.'],
  ['.rbSec[data-sec="modify-shape"] > .rbCap', 'design-tools.html#offset', 'Make a copy of an outline a set distance inside or outside it, or move its points one by one.'],
  ['.rbSec[data-sec="modify-copy"] > .rbCap', 'design-tools.html#copy', 'Copy, mirror, flip, rotate and array shapes, each set up in its own panel with a preview.'],
  ['.rbSec[data-sec="modify-combine"] > .rbCap', 'design-tools.html#weld', 'Join shapes into one outline, cut one out of another, or keep only where they overlap.'],
  ['.rbSec[data-sec="modify-group"] > .rbCap', 'design-tools.html#group', 'Bundle shapes so they pick and move as one, and break them apart again.'],
  ['.rbSec[data-sec="modify-mtext"] > .rbCap', 'design-tools.html#convert-to-curves', 'Turn text into ordinary shapes, or lay it along a curve.'],
  ['.rbSec[data-sec="arrange-nest"] > .rbCap', 'design-tools.html#nest-parts', 'Pack parts onto the material to waste less wood.'],
  ['.rbSec[data-sec="arrange-mat"] > .rbCap', 'design-tools.html#center-in-material', 'Move shapes to the middle of the material, across, up and down, or both.'],
  ['.rbSec[data-sec="arrange-lineup"] > .rbCap', 'design-tools.html#center-on-last-picked', 'Line shapes up with the last one you picked: by their centers or their edges.'],
  ['.rbSec[data-sec="arrange-same"] > .rbCap', 'design-tools.html#same-width-same-height-same-size', 'Make shapes as wide, as tall or as big as the last one you picked.'],
  ['.rbSec[data-sec="arrange-space"] > .rbCap', 'design-tools.html#space-evenly-left-to-right-or-top-to-bottom', 'Space shapes evenly between the first and the last.'],
  ['.rbSec[data-sec="arrange-keep"] > .rbCap', 'design-tools.html#keep-lined-up', 'With this on, shapes you line up stay lined up when you change the one they follow.'],
  ['.rbSec[data-sec="guides-guides"] > .rbCap', 'design-tools.html#guides', 'Guide lines to draw against: they snap, and they never cut.'],
  ['.rbSec[data-sec="guides-machine"] > .rbCap', 'design-tools.html#machine-area', 'Show your machine’s cutting area, to lay out the material and parts.'],
  ['#rpPaneLayers > .tpHead > b', 'design-workspace.html#layers', 'Layers keep groups of shapes apart, so you can hide or lock some while you work on others. New shapes go on the active layer.'],
  // the toolpaths, on the right
  ['#rpPaneTp > .tpHead > b', 'design-workspace.html#the-toolpaths-panel', 'Each toolpath is one cut: a tool, a depth and the shapes it follows. They are cut in order, from the top of this list down.'],
  ['#tpActs', 'cam-reference.html#order-checking-and-saving', 'Preview the job in wood or in 454 Control, print a job sheet, and save these toolpaths\u2019 settings as a template for another drawing.'],
  ['#tpSheetBar > label', 'design-workspace.html#sheets', 'Each sheet is its own piece of material, with its own shapes, toolpaths and G-code. One sheet is shown at a time.'],
  // the toolpath editor
  ['#cutTitle', 'cam-reference.html#the-basics', 'A toolpath tells the machine what to cut: with which bit, how deep, and along which shapes. Click any setting below and the box at the bottom explains it.'],
  ['.cutGroup[data-grp="tool"] > h4', 'cam-reference.html#tools-and-materials', 'The bit this toolpath cuts with, and how fast it moves. Everything else is worked out from the bit\u2019s diameter.'],
  ['.cutGroup[data-grp="depth"] > h4', 'cam-reference.html#the-basics', 'How deep the cut goes, and how much of that each pass takes.'],
  ['.cutGroup[data-grp="passes"] > h4', 'cam-reference.html#finishing', 'How the bit works across the material: how far apart its passes are, and what it leaves for a last finishing pass.'],
  ['.cutGroup[data-grp="entry"] > h4', 'cam-reference.html#ramps', 'How the bit gets down into the material and onto the line, and where on the outline it starts.'],
  ['.cutGroup[data-grp="tabs"] > h4', 'cam-reference.html#tabs', 'Small bridges of wood left across the cut, which hold the part in place until the job is finished.'],
  // the windows
  ['#jobTitle', 'design-workspace.html#job-setup', 'The material\u2019s size and thickness, and where X, Y and Z zero are. Everything is measured from these, so they must match how you set the machine up.'],
  ['#jobModal h4', 'design-quickstart.html#seeing-the-machines-cutting-area', 'Your machine\u2019s cutting area, drawn on the screen so you can see whether the job fits.'],
  ['#settingsModal .modalHead > h3', 'design-workspace.html#settings', 'How 454 Design looks: light or dark, the accent colour, and the colours of the drawing.'],
  ['#libTitle', 'design-workspace.html#the-tool-library', 'Your bits, with their tool numbers, feeds and speeds. A toolpath takes its settings from the tool you pick here.'],
  ['#paramTitle', 'design-tools.html#parameters', 'Named sizes, such as the material\u2019s thickness, that dimensions and toolpath depths can use. Change one and everything that uses it follows.'],
  ['#nestTitle', 'design-tools.html#nest-parts', 'Arranges the selected parts on the material to waste as little as possible, keeping a gap between them for the cutter.'],
  ['#textTitle', 'design-tools.html#text', 'Adds lettering to the drawing. It stays editable as text, and a toolpath can cut it like any other shape.'],
  ['#woodTitle', 'cam-reference.html#preview-in-wood', 'The material as it will look after these toolpaths, cut with each bit\u2019s real shape, tabs in amber. Play shows it being cut, in order.'],
  ['#traceTitle', 'design-quickstart.html#trace-an-image', 'Turns a picture into outlines you can cut. Move Threshold until the shape you want is solid.'],
  ['#inwTitle', 'cam-reference.html#inlay', 'Makes both halves of a V-carve inlay at once: choose the bit and the end mill, then the depths.'],
  ['#offPanel .modalHead > h3', 'design-tools.html#offset', 'Makes a copy of a shape a set distance inside or outside it.'],
  ['#shpPanel .modalHead > h3', 'design-tools.html#polygon', 'The number of sides or points, and a size: with one, each click places a shape of that size, centred where you click.'],
  ['#cpyPanel .modalHead > h3', 'design-tools.html#copy', 'Makes copies of the shapes you pick, a distance across and up from them: typed, or measured from one point to another on the drawing.'],
  ['#rotPanel .modalHead > h3', 'design-tools.html#rotate', 'Turns the shapes you pick by an angle, about their own centre or a point you pick.'],
  ['#arrPanel .modalHead > h3', 'design-tools.html#array', 'Makes evenly spaced copies of the shapes you pick, in a row or around a centre.'],
  ['#fallPanel .modalHead > h3', 'design-tools.html#fillet-corners', 'Rounds every corner of the chosen shapes at once, or only those pointing out or in. Corners it can\u2019t do are ringed in red.'],
  ['#mirPanel .modalHead > h3', 'design-tools.html#mirror', 'Makes a mirror image of the selected shapes across a line you pick.'],
  ['#impTitle', 'design-tools.html#import', 'Brings a file into the drawing: its shapes, and its layers and material where the file has them. Choose whether it joins this drawing or replaces it.']
];
