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
