// Where the help opens (F1, or Help in the header) when nothing more particular was asked for: the part of the
// guides about what's on screen. Each address is a page of the docs and a heading on it; the docs' build checks
// that every one named here exists (docs-site/scripts/help-index.mjs).
var HELP_FOR_WINDOW = [
  ['bzModal', 'control-quickstart.html#3-set-your-zero'],
  ['jogModal', 'control-quickstart.html#3-set-your-zero'],
  ['setModal', 'control-reference.html#settings'],
  ['toolModal', 'control-reference.html#the-machine-tab'],
  ['connModal', 'control-quickstart.html#1-open-and-connect'],
  ['homeModal', 'control-quickstart.html#1-open-and-connect']
];
function controlHelpWhere(){
  for (var i = 0; i < HELP_FOR_WINDOW.length; i++){
    var w = document.getElementById(HELP_FOR_WINDOW[i][0]);
    if (w && !w.hidden) return HELP_FOR_WINDOW[i][1];
  }
  if (JOB.active) return 'control-quickstart.html#5-run-it';
  if (!SERIAL.connected) return 'control-quickstart.html#1-open-and-connect';
  if (!MODEL || !MODEL.segs || !MODEL.segs.length) return 'control-quickstart.html#4-load-the-file';
  return 'control-quickstart.html';
}
