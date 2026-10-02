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

// The desktop app's File and Help menus act through here: a menu item does what its button does (the Open button
// refuses while a job is running), and nothing while the help or one of Control's own questions has the screen.
function menuDo(what){
  if (helpIsOpen()) return false;
  if (what === 'help'){ helpOpen(); return true; }
  var asking = ['dlgModal', 'toolModal', 'homeModal', 'connModal'].some(function (id){ var m = document.getElementById(id); return m && !m.hidden; });
  if (asking) return false;
  var id = what === 'open' ? 'openBtn' : what === 'settings' ? 'settingsBtn' : null, b = id ? document.getElementById(id) : null;
  if (!b || b.disabled) return false;
  b.click();
  return true;
}

// The info icons: where each goes (a place marked in the page: <span class="helpAt" data-k="...">), the part of
// the guides it opens, and the line or two it shows when the pointer rests on it. A tip is two sentences at most:
// it says what the thing is for, and the guide says the rest.
var HELP_ICONS = [
  ['.helpAt[data-k="serial"]', 'control-reference.html#connecting', 'Connects to the machine\u2019s controller over USB. After the first time the button says Reconnect and skips the list of ports.'],
  ['.helpAt[data-k="jogpanel"]', 'control-reference.html#jog-and-zero', 'Moves the machine by hand and sets your work zero: where the job\u2019s X0, Y0 and Z0 are on the material.'],
  ['.helpAt[data-k="probepanel"]', 'control-reference.html#probe', 'Sets Z zero at the top of the material with the BitZero touch plate. Check the result with a piece of paper before cutting.'],
  ['.helpAt[data-k="spindlepanel"]', 'control-reference.html#spindle', 'Starts and stops the spindle by hand. It doesn\u2019t wait for the spindle to reach speed, so give it a few seconds before cutting.'],
  ['.helpAt[data-k="quick"]', 'control-reference.html#quick-actions', 'Saved G-code for things you do often, such as raising Z or warming the spindle. The pencil edits one.'],
  ['.helpAt[data-k="runjob"]', 'control-reference.html#running-a-job', 'Sends the loaded file to the machine. Start shows exactly what will happen before anything moves.'],
  ['.helpAt[data-k="console"]', 'control-reference.html#console', 'Everything Control sends and everything the controller answers. Commands typed here are sent as they are, with no checks.'],
  ['.helpAt[data-k="jog"]', 'control-reference.html#jog-speeds', 'How fast the machine moves when you jog in Fast mode, for XY and for Z. Keep Z slower: it\u2019s the axis that finds clamps.'],
  ['.helpAt[data-k="workarea"]', 'control-reference.html#work-area', 'The size of the machine\u2019s cutting area, used to draw the table and to check that a job fits.'],
  ['.helpAt[data-k="jobzero"]', 'control-reference.html#job-zero', 'Where the drawing\u2019s 0,0 sits on the stock, for the preview and the fit check. It doesn\u2019t move your machine\u2019s work zero.'],
  ['.helpAt[data-k="stock"]', 'control-reference.html#stock-thickness', 'The material\u2019s thickness, used to flag cuts that go deeper than it. Leave it at 0 to turn the check off.'],
  ['.helpAt[data-k="rapid"]', 'control-reference.html#time-estimate', 'How long a job will take, worked out the way the controller moves the machine. The rapid rate here changes the estimate only.'],
  ['.helpAt[data-k="controllercfg"]', 'control-reference.html#controller-config', 'The controller\u2019s own settings, as read when you connect. Control only reads them, and can check them for trouble.'],
  ['.helpAt[data-k="bitsetter"]', 'control-reference.html#bitsetter', 'The button the tool touches so the machine can measure its length, which keeps Z zero right through tool changes.'],
  ['.helpAt[data-k="bitzero"]', 'control-reference.html#bitzero', 'The touch plate that sets Z zero. Measure its thickness yourself: every depth you cut is off by whatever this number is off.'],
  ['.helpAt[data-k="spindle"]', 'control-reference.html#spindle-type-and-spin-up', 'Router or VFD, and how long Control waits after the spindle starts before cutting. A VFD needs longer than a router.'],
  ['.helpAt[data-k="highstart"]', 'control-reference.html#start-and-stop-high', 'Keeps the bit above clamps and stock whenever it\u2019s travelling, and lifts it clear before the spindle stops. Leave it on.'],
  ['.helpAt[data-k="travelz"]', 'control-reference.html#traverse-height', 'How far below the top of its travel the machine sits while it moves between cuts. Make it more if you have tall clamps.'],
  ['.helpAt[data-k="park"]', 'control-reference.html#tool-change-and-end-of-job-positions', 'Where the machine goes for a tool change, and where it parks when a job ends. Both need a homed machine.']
];
