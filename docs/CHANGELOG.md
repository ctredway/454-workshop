# 454 changelog

What changed, and why. Newest first. Behaviour that affects the machine is marked **(machine)**.

Kept alongside the docs: every change to how either app behaves goes here in the same pass as
the code, so the reasoning isn't lost.

**Guiding principle:** follow Carbide Motion's process step for step (when you're prompted, what
you press, when the machine moves), so people's habits stay safe. 454's extra safety lives in
quiet guards that don't change that process; any unavoidable difference is flagged in the docs.

---

## 454 Control

### 0.26.2 — one measurement, when the first tool is loaded
- **(machine)** A file that loads its first tool (M6) before cutting now gets the tool prompt
  straight away and is measured there, once, as Carbide Motion does. Before, it was measured at
  Start and then again at the T1 prompt, with a trip to the tool-change position in between.
  A file with no M6 is still measured at Start.
- **(machine)** A tool can no longer be measured against a missing reference. With no reference,
  the arithmetic would have applied the tool's whole machine Z (around −60 mm) as its length offset;
  that measurement now becomes the reference instead. This couldn't happen before because Start
  always took a reference, but the change above made it possible, so it's guarded here.

### 0.26.1 — machines whose coordinates count up
- **(machine)** Control assumed every machine coordinate runs from −travel up to 0, as in standard
  GRBL. Firmware built to set the origin at home counts *up* from 0 on an axis that homes towards
  its minimum. On such a machine a correctly captured BitSetter position was reported as "outside
  travel", and worse: jog limits would have allowed running into the switches at one end,
  tool-change presets pointed off the machine, the fit check gave false overruns, and lifts
  assumed the top of Z was 0.
- Each axis's real range is now worked out in one place, from the controller's build options
  (the "origin at home" flag and homing directions) and confirmed by the positions the machine
  reports once homed. The BitSetter check, jog limits, tool-change positions, fit check and every
  lift use it.

### 0.26.0 — the BitSetter measures at every Start
- **(machine)** With the BitSetter set up, the tool is measured at the start of every job, as in
  Carbide Motion. Before, a file with no tool change (no M6) skipped the BitSetter entirely, so a
  bit swapped after zeroing went unnoticed.
- The BitSetter is never silently unavailable. If it's switched on but can't be used (position
  not captured, not homed, controller travel not read, position outside travel), zeroing says so,
  the start summary shows it in red, and the Probe section shows its status and the reason.

### 0.25.0 — tool changes without a BitSetter
- **(machine)** A job that changes tools after cutting starts, with no BitSetter set up, now asks
  at Start: set up the BitSetter, or re-zero Z at each change. Before, it warned and then let the
  new tool cut at the old tool's zero.
- **(machine)** At such a change the prompt offers Probe with BitZero and Jog & zero Z, and
  Continue stays disabled until Z has been zeroed. Jogging and probing are allowed only then,
  with the machine stopped and nothing queued. The first tool, before any cutting, is exempt.
- **(machine)** After a re-zero, continuing always lifts before moving back to the work, whatever
  the start-high setting: the tip is down on the stock, and moving at that height dragged the bit.

### 0.24.1
- The Machine tab's "Stop" is now "End job", matching the control bar. It was the controlled
  stop while the red STOP is the instant halt: same word, very different outcome.
- "Stop (M5)" is now "Spindle off"; the Reset tooltip explains itself in plain terms.

### 0.24.0 — BitSetter reference at Z zero
- **(machine)** Setting Z zero (Zero Z, Zero all or the BitZero) offers to measure that tool on
  the BitSetter straight away, as Carbide Motion does. Before, the reference was taken at job
  start, so a bit swapped after zeroing became the reference and shifted Z.
- **(machine)** At Start, the loaded tool is measured against that reference, so a swap after
  zeroing is compensated rather than silently wrong.

### 0.23.0 — End job is a controlled stop
- **(machine)** End job holds, waits until the controller reports the machine has stopped, clears
  the queued moves, then lifts, stops the spindle and parks like a finished job. Before, it reset
  after a fixed half-second (sometimes still moving, losing position) and left the bit in the cut.
- If the controller comes back in alarm, nothing is moved and the reason is shown.

### 0.22.1
- Tool changes written just before a toolpath's name are credited to that toolpath in the
  summary, not the previous one (Holes showed "19000, 22000 rpm").

### 0.21.x — themes and help
- Light and dark themes with a choice of accent, shared with 454 Design and kept out of the
  machine profile.
- Machine-tab explanations moved behind ⓘ help icons; only the safety line stays visible.
- Probe failures explain themselves and offer to unlock.

### Earlier (0.12–0.20), in brief
- **(machine)** Spin-up dwell detection fixed for "M3S20000" written without a space; default
  spin-up raised to 10 s.
- **(machine)** Lifts never move down, and are skipped when the tool is already clear.
- **(machine)** Every job ends the same way: lift, spindle off, park or return to XY zero.
- **(machine)** Homing required before a job.
- Tool-change position presets (front centre by default), controller settings check on connect,
  in-app dialogs instead of browser ones, Quick Actions in the control bar.

---

## 454 Design

### 0.73.1
- F is always Fillet (it meant Fit in the Select tool); Fit is now Home.
- The CAM engine is only looked for when asked (`design.html?cam`), so the public site doesn't
  request files that aren't there.
- Save's tooltip no longer says "goes in your repo".

### 0.73.0 — one file for public and preview
- The public Design is now the same file as the CAM preview; without the engine files, CAM stays
  hidden. Fixes can no longer be left out of one or the other.

### 0.70.0 — importer fixes
- VCarve's smooth (Bézier) curves now import. Before, any outline containing one was silently
  dropped: the wing button's outline, and 29 parts of the battery-strap file including all
  twelve straps.
- Material thickness and Z zero are read from VCarve projects.

### 0.60.0
- One way to mirror: the Mirror panel (button or Shift+M). Flip only turns the selection over
  in place; the typed H/V shortcut is gone.

### Earlier (0.51–0.59), in brief
- Delete dimensions; corner ✕ on every dialog; Mirror and Offset panels; trim and extend
  previews; icon-only header; themes; in-app dialogs; docs link.

---

## CAM preview (not yet public)

Profiles, pockets with islands, drilling with peck, chamfers (including VCarve's "vectors at
top"), tabs placed by hand, ramps, material and cut-through, vector checking, uncut-shape check,
reorderable and toggleable toolpaths, and VCarve toolpaths made editable. Verified against VCarve's
own output on the wing button to within 0.02 mm.

Notable fixes found by comparing with VCarve: the ramped stretch of each pass wasn't recut at full
depth, leaving a web on through-cuts; drill feeds were inherited from the profile feed box;
"through" with no thickness set cut only the overcut.
