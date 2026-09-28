// Offer homing once per connection: nothing that uses machine coordinates is trustworthy until
// it has run, and the machine sits in Alarm after power-up anyway.
// In-app dialogs. Browser alert/confirm boxes can't be styled or read easily, and they look
// alien next to a machine control; these do the same job in the app's own language.
var DLG_RESOLVE = null;
function uiDialog(o){
  return new Promise(function(res){
    if (DLG_RESOLVE){ DLG_RESOLVE(false); }          // only one at a time
    DLG_RESOLVE = res;
    document.getElementById('dlgTitle').textContent = o.title || 'Confirm';
    var body = document.getElementById('dlgBody');
    body.innerHTML = '';
    String(o.body || '').split('\n').forEach(function(line){
      var d = document.createElement('div');
      if (/^\*\*\*/.test(line.trim())) d.className = 'badLine';
      else if (/^\u26a0|^\u26a0\u26a0/.test(line.trim())) d.className = 'warnLine';
      d.textContent = line === '' ? '\u00a0' : line;
      body.appendChild(d);
    });
    var ok = document.getElementById('dlgOk'), cancel = document.getElementById('dlgCancel');
    ok.textContent = o.ok || 'OK';
    ok.classList.toggle('danger', !!o.danger);
    ok.classList.toggle('primary', !o.danger);
    cancel.style.display = o.note ? 'none' : '';
    var alt = document.getElementById('dlgAlt');
    alt.hidden = !o.alt; alt.textContent = o.alt || '';
    cancel.textContent = o.cancel || 'Cancel';
    document.getElementById('dlgModal').hidden = false;
    ok.focus();
  });
}
function uiNote(title, body){ return uiDialog({title:title, body:body, ok:'OK', note:true}); }
function dlgEnd(v){
  document.getElementById('dlgModal').hidden = true;
  var r = DLG_RESOLVE; DLG_RESOLVE = null;
  if (r) r(v);
}
var HELP_TEXT = {
  'serial': {t:'Connecting to the machine', b:"454 Control talks to GRBL 1.1 over USB at 115200 baud, which covers the Shapeoko and Nomad controllers.\n\nIt needs Chrome or Edge on a desktop, because Web Serial isn't available in other browsers. Everything else in the app, including opening and checking G-code, works anywhere.\n\nAfter the first connection the button becomes Reconnect and skips the port picker; Choose port lets you pick a different device."},
  'controllercfg': {t:'Controller config', b:"The controller's own $ settings, read back when you connect: travel limits, homing, speeds, spindle maximum.\n\n454 Control only reads them. They're changed in the controller itself, and Carbide Motion's setup wizard writes them for Shapeoko machines.\n\nCheck controller settings compares the ones this app depends on against what it needs, and reports anything that looks wrong."},
  'jogpanel': {t:'Jog & zero', b:"Moving the machine by hand, and setting your work zero.\n\nArrow keys jog X and Y, Page Up and Page Down jog Z, while the jog window is open. Step mode moves a fixed distance per press; continuous mode moves while a key is held.\n\nZeroing sets where the job's 0,0,0 is on the material. It's stored in the controller, so it survives homing and a restart of this app."},
  'probepanel': {t:'Probe', b:'Setting Z zero with the BitZero touch plate.\n\nMeasure the plate with calipers and enter that thickness, verify the circuit by touching the pin to the plate, then probe. The tool tip should start 2 to 10 mm above the plate.\n\nZ0 ends up at the top of your stock. Always paper-test the result before cutting.'},
  'spindlepanel': {t:'Spindle', b:"The speed shown is the value commanded to the controller. With a VFD that's the target, not a reading from a tachometer.\n\nStarting the spindle by hand from here doesn't wait for it to reach speed: give it a few seconds before cutting anything.\n\nJobs are different: 454 Control inserts a spin-up dwell after every M3 automatically, using the time set in Settings."},
  'quick': {t:'Quick actions', b:"Saved G-code for things you do often: raising Z, warming the spindle, moving somewhere to change a bit.\n\nLines are sent one at a time, each waiting for the controller to confirm the one before, so an action can't overflow the controller's buffer. Any error, alarm or reset stops it at once.\n\nUse the pencil to edit an action; they're stored with your machine profile."},
  'runjob': {t:'Run job', b:'Streams the loaded file to the machine, with everything Settings adds: spin-up dwells, start and stop high, tool-change handling and the ending.\n\nStart shows a summary of exactly what will happen before anything moves. Hold pauses, Resume continues, End job stops the job.\n\nRecover restarts a stopped job from a line: it rebuilds the modal state, moves to the spot carefully, and lets you bail out at any point.'},
  'console': {t:'Console', b:"The raw conversation with the controller: everything 454 Control sends, and everything the controller says back.\n\nYou can type commands here for anything the app doesn't cover. Commands typed here are sent as-is, with no checks and no lift or spindle handling, so treat them as if you were typing at the controller directly."},
  'workarea': {t:'Work area', b:'The size of the machine\u2019s cutting area, used to draw the table in the 3D view and to check a job fits.\n\n\u201cFrom the controller\u201d fills it in from the controller\u2019s own travel ($130 and $131) each time you connect.\n\nPick a machine from the list or type a size, and 454 Control keeps that instead, even if the controller reports something different; the console notes the difference when you connect. Choose \u201cFrom the controller\u201d again to go back.'},
  'jobzero': {t:'Job zero', b:"Where the drawing's 0,0 sits on the stock: the front-left corner, or the middle.\n\nThis only affects the preview and the outside-work-area check. It does not move your machine's work zero, which you set with the BitZero or by zeroing the axes."},
  'stock': {t:'Stock thickness', b:'The thickness of the material, used to flag cuts that go deeper than it, which usually means into the spoilboard.\n\nSet it when Z zero is the top of your material. Leave it at 0 to turn the check off.'},
  'rapid': {t:'Time estimate', b:"How long a job will take, worked out the way GRBL moves the machine.\n\nOnce the controller\u2019s settings are read, the estimate uses its own limits: maximum speed and acceleration for each axis ($110\u2013$112, $120\u2013$122), and junction deviation ($11), which sets how fast corners can be taken. Short moves and sharp corners take longer than their feed rate suggests, and the estimate allows for that.\n\nBefore the settings are read, it assumes every move runs at its feed rate and rapids at the rapid rate below, which underestimates jobs with lots of short moves.\n\nThe rapid rate here changes the estimate only; the machine\u2019s real rapid speed comes from the controller."},
  'bitsetter': {t:'BitSetter', b:'The fixed button the tool touches so the machine can measure tool length.\n\nJog the tool over the button and press Capture position; the machine coordinates are stored.\n\nWhen you set Z zero, 454 Control offers to measure that tool straight away. That makes it the reference: at Start the loaded tool is measured against it, and every new tool at each change, so the zero holds through tool changes, and swapping bits before pressing Start is caught rather than silently shifting Z.\n\nIt needs a homed machine, because the position is in machine coordinates.'},
  'bitzero': {t:'BitZero', b:"The touch plate used to set your work zero. 454 Control uses it for Z.\n\nSet the plate thickness by measuring it with calipers; the probe sets Z0 at the top of the stock, which is the plate's trigger height minus the thickness. Verify the circuit (touch the pin to the plate) before probing, and paper-test the zero before cutting."},
  'spindle': {t:'Spindle type and spin-up', b:"Trim router or VFD spindle, and how long to wait after the spindle starts (M3 or M4) before any cutting move.\n\nMost CAM files don't include that wait, so 454 Control inserts a dwell after each spindle start. Carbide Motion does the same thing, at about 2.5 s, which suits a router. A VFD spindle takes longer to reach speed: 7 s is the default here.\n\nToo short means the bit enters the material before it is up to speed."},
  'highstart': {t:'Start & stop high', b:'Keeps the tool high whenever it is travelling rather than cutting.\n\nAt the start and after every tool change, the machine traverses to the next XY at the top of travel before plunging. Before every spindle stop, and at the end of the job, it lifts clear first.\n\nThis is what stops a bit dragging across clamps and stock. A lift is skipped when the tool is already higher than traverse height, so it never moves down.'},
  'travelz': {t:'Traverse height', b:'How far below the top of Z travel the machine sits when it is moving rather than cutting, in machine coordinates.\n\nUsed by start/stop-high, go-to-zero, the BitSetter moves and the end of the job. 5 mm below the top is a good default; increase it if you have tall workholding.'},
  'park': {t:'Tool-change and end-of-job positions', b:'Two separate places the machine goes when you need to reach it.\n\nTool change: it lifts to near the top of Z travel and moves here before asking for the new tool. With nothing captured it uses the front centre of the machine, worked out from the controller\u2019s travel, which is the easiest place to reach. Pick another preset or capture a position to override that.\n\nEnd of a job: as in Carbide Motion, it lifts, stops the spindle, returns to the job\u2019s XY zero, then parks. With nothing captured it parks at the back centre of the machine, out of your way; capture a position to park somewhere else.\n\nBoth use machine coordinates, so they need a homed machine.'},
  'jog': {t:'Jog speeds', b:'The feed rates used by the jog buttons and arrow keys, for XY and for Z separately.\n\nThese apply to jogging only; they have no effect on a running job. Keep Z slower than XY: it is the axis that finds clamps.'}
};
function showHelp(key){
  var h = HELP_TEXT[key];
  if (h) uiNote(h.t, h.b);
}
