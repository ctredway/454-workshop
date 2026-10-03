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
  ['textModal', 'design-tools.html#create-vectors'],
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
  // the tools, on the left
  ['.tGroup[data-group="file"] > h4', 'design-tools.html#file', 'Start, open, import and save drawings, export them for other programs, undo and redo, fit the view and measure.'],
  ['.tGroup[data-group="create"] > h4', 'design-tools.html#create-vectors', 'The drawing tools: lines, rectangles, circles, curves and text. Type a size while you draw to make it exact.'],
  ['.tGroup[data-group="edit"] > h4', 'design-tools.html#edit-vectors', 'Change shapes you\u2019ve drawn: round corners, trim, offset, mirror and join them, and add dimensions that set their sizes.'],
  ['.tGroup[data-group="align"] > h4', 'design-tools.html#align-and-nest', 'Line shapes up with each other or with the material, space them evenly, and nest parts to waste less wood.'],
  ['.tGroup[data-group="guides"] > h4', 'design-tools.html#guides', 'Guide lines to draw against, and the outline of your machine\u2019s cutting area.'],
  ['#paneLayers > .paneHead', 'design-workspace.html#layers', 'Layers keep groups of shapes apart, so you can hide or lock some while you work on others. New shapes go on the active layer.'],
  // the toolpaths, on the right
  ['#tpPanel .tpHead > b', 'design-workspace.html#the-toolpaths-panel', 'Each toolpath is one cut: a tool, a depth and the shapes it follows. They are cut in order, from the top of this list down.'],
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
  ['#woodTitle', 'cam-reference.html#preview-in-wood', 'The material as it will look after these toolpaths, cut with each bit\u2019s real shape. Tabs show in amber.'],
  ['#traceTitle', 'design-quickstart.html#trace-an-image', 'Turns a picture into outlines you can cut. Move Threshold until the shape you want is solid.'],
  ['#offPanel .modalHead > h3', 'design-tools.html#offset', 'Makes a copy of a shape a set distance inside or outside it.'],
  ['#mirPanel .modalHead > h3', 'design-tools.html#mirror', 'Makes a mirror image of the selected shapes across a line you pick.'],
  ['#impTitle', 'design-tools.html#import', 'Brings a file into the drawing: its shapes, and its layers and material where the file has them. Choose whether it joins this drawing or replaces it.']
];
