# 454 changelog

What changed, and why. Newest first. Behaviour that affects the machine is marked **(machine)**.

Kept alongside the docs: every change to how either app behaves goes here in the same pass as
the code, so the reasoning isn't lost.

**Guiding principle:** follow Carbide Motion's process step for step (when you're prompted, what
you press, when the machine moves), so people's habits stay safe. 454's extra safety lives in
quiet guards that don't change that process; any unavoidable difference is flagged in the docs.

---

## The 454 logo

- **Your logo throughout**, traced from the PNG into a crisp SVG (checked against the original: the only
  differences are the PNG's soft edges). Two colours: the logo blue #0083ff and its white outline.
- **The website:** in the header beside "Workshop"; the hero now cuts **your logo** on a wide gridded plate
  (dashed outlines, then each piece traced by the cutter, then the finished logo fills in; still for
  reduced motion); beside the "Why 454?" story; the browser-tab and home-screen icons; and a new
  link-preview picture for sharing. The site's blue is now the logo's: #0083ff for the logo, the main
  button, the Beta badge and the hero, and a lighter #52abff for links and small text (7.3:1 on the page).
- **The app:** the program, taskbar and window icons; the About window (whose accent is now blue); and the
  headers of Control, Design and the docs, with the app's name in white beside the logo.
- **Icons per size:** the full logo from 48 px up; at 16 to 32 px, where a wide logo becomes a sliver,
  the 5 with its ring, which stays recognisable.

## 454 Workshop (the desktop app, in testing)

### 0.6.2-beta.5 to beta.7 — releases tag themselves
- **A new version in `apps/desktop/package.json`, pushed to main, is tagged, built and drafted as a
  release**: no separate tag step. A change that keeps the version builds nothing; pushing a tag by hand
  still works; a version with a suffix is a pre-release. (A workflow can't start another workflow with a tag
  it creates, so the Windows workflow does both: a first job decides the tag, and creates it.) Tested in
  each case against a scratch repository.
- beta.6 includes Control 0.31.15 and Design 0.93.0; beta.7, Design 0.94.0.

### 0.6.2-beta.4 — built only from the right files
- **Fixed: the new source check failed on GitHub's Windows machine**, on a correct repository. Git there
  checks files out with Windows line endings (\r\n), and Control's build matched its include lines by
  \n alone, so it found none of them. The build now reads either, and a `.gitattributes` keeps the
  repository's text files with \n endings on every computer. Tested with both kinds of line ending.
- **The desktop build refuses a repository whose `index.html` isn't 454 Control**, and the Windows workflow
  checks the apps' sources before building. The website zip had been unzipped into the repository: its
  landing page replaced Control's `index.html`, and the build fell back to the website's copies in
  `control/` and `design/`, shipping Design 0.90.1 (without the dimension fix) and an older Control without
  a word. That fallback is gone; the build now stops with a message saying what's wrong and how to put it
  right.
- Includes Control 0.31.11 and Design 0.91.0.

### Updates: saying what went wrong
- **A failed update check blamed the internet connection whatever the cause.** It now says what actually
  happened: the newest release is missing its update file (naming it), there's no published release for
  this channel (with a pointer to the Beta channel when only pre-releases exist), GitHub is limiting
  requests, or GitHub genuinely couldn't be reached. Found when v0.6.1-beta.1 was published with no files
  attached, and the app said to check a connection that was fine. A test covers each case.
- **The Windows workflow checks for, and attaches, whichever update file the build makes**: `latest.yml`,
  or for a pre-release `beta.yml` or `alpha.yml`. The app asks for the channel's file first, then
  `latest.yml`, so either works.

### 0.6.0 — automatic updates
- **The installed app updates itself from GitHub Releases** (electron-updater). It checks a little while
  after starting and every few hours, and offers a new version with what's new: Download, Later, or Skip
  this version. It downloads in the background (progress on the taskbar button), checks the download
  against the release, and asks to restart: Restart now, or Later, which installs when the app next closes.
- **Never during a job:** update questions, and restarting, wait while 454 Control is busy (its own
  `machineBusy()`: a job, probe, quick action or jog running, the spindle on, or the machine moving). If
  the machine gets busy while the restart question is open, it doesn't restart.
- **The 454 Workshop menu:** Check for updates… (tells you either way; becomes "Restart to update to…" once
  one is downloaded), Updates → Check automatically, and Updates → Stable releases or Beta: pre-releases
  too. Settings are kept in `updates.json` in the app's data folder.
- **Copies that can't update say so:** one run from a zip, or a development build, explains why and how to
  get one that can (the installer; settings, tools and drawings carry over).
- **A download you asked for that fails is always reported**, including one that doesn't match its
  checksum, which is thrown away rather than installed.
- **Tested:** 17 unit tests of every decision (with a fake updater, machine and timers), and the real app
  against a local update server offering a new version: found, offered, downloaded and checksum-checked,
  then offered for restart without restarting; a corrupted download refused and reported once; and, with
  a job running in the real 454 Control, the question held until the job ended (0.4 s after). The
  end-to-end job test passes, with the updater silent.
- **Releases:** the Windows workflow checks the tag matches the app's version, checks the update files
  (`latest.yml` and the blockmap) were made, attaches them to the draft release, and marks a tag with a
  suffix (`v0.6.1-beta.1`) as a pre-release, for the beta channel. See DEVELOPING.md, "Releasing".
- A docs page, "The desktop app": installing, updates, and the beta channel.

### Node 22 for the builds
- **The Windows build failed on GitHub with "Node.js v20 is not supported by Astro"**: the docs site needs
  Node 22.12 or newer, and the workflows used Node 20. Both workflows now use Node 22; the docs site
  declares it; and both builds check the Node version first, stopping with a plain message instead of
  failing inside the docs build.

### Repository tidy-up
- **The Windows build failed on GitHub**: the website's built files had been committed at the top of the
  repository, so the landing page replaced Control's source (`index.html`) and the build couldn't find
  Control. The build now recognises each app by its contents (`index.html` or `control/index.html`,
  `design.html` or `design/index.html`), and reports which it used.
- **The repository goes back to sources only** (`repo-sync.zip` with `tidy-repo.ps1`): Control restored as
  `index.html` (0.31.6; the only copy left was an old 0.31.3), the rest of the docs site, the website's
  built copies, stray images, old docs pages and the old site zip removed, and `.gitignore` fixed (it
  was saved without its dot). The website is still built from the sources and uploaded as a zip; nothing
  built needs committing. Checked on a copy of the repository: both builds succeed, with Control 0.31.6,
  Design 0.90.0 and the new docs.

### 0.5.4
- Design 0.90.0 (the job sheet, below), and the docs' CAM reference section about it.

### 0.5.3
- The new docs site, bundled (see Docs, above), and its docs window.
- Building from the repository needs the docs site installed (`npm ci --prefix docs-site`); the Windows
  workflow does it.

### 0.5.2
- The 454 logo (above). Control 0.31.6 and Design 0.89.1: the logo in their headers.

### 0.5.1
- 454 Control 0.31.5 (the browser check, below; the app always has Web Serial, so it never shows).

### 0.5.0
- Design 0.89.0 (CAM released as a beta, below). Builds from the repository now include CAM, since
  cam.js and geom.js are public.

## Docs

### Toolpath screenshots in the CAM reference
- **Each toolpath type pictured on a real drawing**, made through the editor as a user makes it: a profile
  with tabs, a pocket with an island in both clearing styles (offset rings and raster), drilling, a
  chamfer, a V-carve, and an inlay's pocket and plug; plus a profile's editor with tabs and leads.
- The pipeline can frame a shot on everything drawn, not just the material (the inlay's plug is made on a
  mirrored copy beside the design), and select a toolpath so its tabs show.

### Design workspace
- **A new page: everything in Design around the drawing tools**, with 9 screenshots: the screen, Job
  setup, layers, the tool library (with a neutral sample library), the Toolpaths panel and its editor,
  checking the drawing (with a drawing that has deliberate problems), Settings, and the status bar.
- The screenshot pipeline has 33 shots now; all were retaken to confirm them.

### Control reference
- **A new page: every part of 454 Control's screen**, with 10 screenshots: the whole window connected with a
  job loaded, the Machine tab section by section (connecting, homing, jogging and zeroing, the BitZero,
  the spindle, quick actions, running a job, the console), the Code, Toolpaths and Checks tabs, the
  position and playback bar, Settings, and the keyboard shortcuts. Written from Control's own help text
  and interface.
- **Screenshots of a connected machine without one:** the pipeline feeds Control the lines a GRBL 1.1
  controller sends (greeting, settings, work offset, status), so Control draws everything itself as it
  would with a Shapeoko attached. It reacted for real: with a factory Shapeoko's settings it warned that
  soft limits were off, and with no BitSetter, pressing Run asked how to handle the tool changes (now a
  screenshot of its own).
- The screenshot pipeline now reports the actual error when a shot's setup fails.

### The new docs site
- **The docs are now an Astro Starlight site**, in `docs-site/`, at 454workshop.com/docs and inside the
  desktop app: a sidebar of every section, an "On this page" outline, search (Ctrl+K; it works offline in
  the app too), dark and light modes, an "Edit this page on GitHub" link on every page, and the logo and
  its blue throughout. Headings use Archivo's wide cut, as on the main site; the fonts are bundled.
- **Every address is unchanged**: pages still build as `.html` files, so links from the apps, the desktop
  app and anything shared keep working.
- **All six pages moved across** by a converter, word for word: numbered steps became Starlight's Steps,
  warnings and tips became callouts (tips in green), the docs home page uses link cards, and the labelled
  "same as / different from" callouts kept their own labels (Carbide Motion, VCarve or Fusion).
- **Screenshots by code**: `npm run shots` drives the real apps through a list of shots and captures each
  at twice screen resolution; the docs show them true to the app's size and sharp on high-resolution
  screens. The Design tools page has 13: each tool group, typing values, Select's handles, Fillet's
  preview and radius box, Offset's preview, and the Text and Nest panels.
- **Links to Control and Design** are in the docs header, opening in a new tab.

### Desktop app: the docs window
- **Moving between docs pages stays in the docs window.** Every link in the docs opened another window;
  with the new sidebar, that would have meant a window per click. Opening the docs from elsewhere reuses
  an open docs window.
- **The website's addresses work in the app**: `/control/` and `/design/` open those apps, and
  `/docs/page` without `.html` finds `page.html`.
- **Fixed:** any address ending in "/" was sent to Control, so a link to `/docs/` would have opened Control.
- **Design tools**, a new page: every tool in Design's left panel, group by group (File, Create vectors,
  Edit vectors, Align and nest, Guides, View and history), with what each does, how to use it and its
  shortcut, and a guide to typing exact values. Written from Design's own tool definitions and prompts.
  Linked from the docs home page and the Design quick start.
- The docs' footer said "454 Werks", an old name; it now says 454 Workshop.

## 454workshop.com
- **The links to Design, Control and GitHub open in a new tab** on every page: the front page and all
  the docs (Control's and Design's own headers already did). Screen readers are told so; nothing changes
  on screen.
- **CAM on the website, clearly labelled beta:** a Beta label on the tagline, a notice under the
  buttons, toolpaths in the description and Design's features, and a "This is beta software" section
  with the four things to do before cutting and how to report a problem. The CAM engine is published
  beside Design, and the CAM reference in the docs.

### Building on GitHub
- **A "windows build" workflow** builds the installer and zip on GitHub's Windows machines: by hand from
  the Actions tab, or on a version tag, which also drafts a release with the files attached.
- **The app is built from the repository's own index.html, design.html and docs/** when it sits in the
  454-workshop repository (apps/desktop), so there's one copy of each app; outside it, from the pinned
  copies as before.
- **CAM goes in only if cam.js and geom.js are present.** Builds from the public repository have no CAM
  and open Design with it firmly off, which also clears a "CAM on" choice an earlier build left behind.
  The build records what went in (app/build-info.json).
- **Fixed: the tests workflow would have failed on GitHub**: the top-level lock file predated two of the
  packages, and a clean install refuses a mismatched lock file. Regenerated; 98 of 98 tests pass from a
  clean install.

### 0.4.9
- Design 0.88.6 (recalculate without editing, below).

### 0.4.8
- Design 0.88.5 (repeated points, below).
- Tests: the end-to-end job test failed now and then with "Machine isn't ready". It waited only for
  Idle after a long move, and the last status report before the move still said Idle, so it pressed Run
  while the machine was travelling, and Control rightly refused. It now waits for the machine to arrive
  and the work zero to register. Passed three runs in a row.

### 0.4.7
- Design 0.88.4 (corners from VCarve and DXF, below).

### 0.4.6
- Design 0.88.3 (remove a fillet, below).

### 0.4.5
- Design 0.88.2 (the fillet radius, below).

### 0.4.4
- **Opens on 454 Design.** The machine connection still starts at launch, so Control connects straight
  away when opened (454 Workshop menu, Ctrl+1, or its button in Design's header).
- 454 Control 0.31.4 (below).

### 0.4.3
- Design 0.88.1 (display fixes, below).

### 0.4.2
- The About window's versions (the app, Design, Control and Electron) are filled in when the app is
  built, and the build stops if one can't be found. The dedication's lines are balanced.
- `LICENSING.md` uses the new names throughout (454 Control, 454 Design, 454 Design Pro); the one
  remaining "Kerf" notes the rename. It also cautions against GM's trademarks in names.
- The project README describes 454 Workshop: all four packages, the desktop app, how it's tested.

### 0.4.1 — About 454 Workshop
- **454 Workshop → About 454 Workshop** shows the app's version, the versions of 454 Design and 454
  Control inside it (read from the apps when the app is built, so never out of date), the dedication,
  and links to the docs and the project. Follows the system's light or dark theme.
- Releases are published to the renamed repo, `ctredway/454-workshop`.

### 0.4.0 — named 454 Workshop
- The desktop app is **454 Workshop**: 454 Design and 454 Control, which keep their names, in one app.
  The program is `454 Workshop.exe` (Task Manager shows "454 Workshop"), the menu is "454 Workshop", and
  downloads are named `454-Workshop-<version>-<os>-<arch>`. The docs are "454 Workshop docs".
- **Saved data stays put**: Electron names its data folder after the app, so renaming would have
  switched to a new, empty "454 Workshop" folder and made the tool library, settings and drawings seem
  to vanish. The app keeps using the existing "454" folder (checked: a run of the renamed app wrote
  its data there, and no new folder appeared).

### 0.3.1 — the header buttons work
- **454 Design** in Control's header and **454 Control** in Design's now open (or bring forward) the
  other app's window; links to the docs open the docs window. They did nothing: the app's pages are at
  `app://454/`, but "454" looks like a number and the page side reads a numeric host as an IP address
  (`0.0.1.198`), so links didn't match the router's `app://454` and were ignored. The router now checks
  the scheme and both forms of the host. The address itself is unchanged, so saved data (tool library,
  settings, drawings) stays where it is.
- The CAM reference in the app now covers multi-sheet projects.

### 0.3.0
- Design 0.88.0: multi-sheet VCarve projects (below).

### 0.2.2
- The CAM engine fixes below (profiles: notches, links between passes, tabs on ramps).

### 0.2.1
- Design 0.87.2: converted VCarve profiles cut on the right side (below).

### 0.2.0 — 454 Design joins
- **Design in its own window**, from the 454 menu (Ctrl+2) or any link to it, with its CAM engine;
  Control opens first (Ctrl+1). Docs open in their own window, web links in the browser. View has the
  developer tools, for seeing the console when something goes wrong.
- **Works offline**: everything Design would fetch from the internet is bundled: opentype.js, the
  tool-database reader (sql.js, with its WebAssembly) and the Text tool's 20 fonts.
- **Shared data**: both apps share saved settings and the tool library, so Design's Machine area reads
  Control's work area.
- Pages are served through the app's own private scheme, so they can load their bundled files.
- Tested end to end, both apps at once, from source and as the packaged Linux AppImage: Control ran a
  real job over a virtual serial port; Design loaded CAM, a font and the tool-database reader, made a
  toolpath and saved its G-code, and read what Control had saved.
- Windows: a ready-to-run zip, built on Linux (not yet run on Windows).

### 0.1.0 — the shell
- 454 Control as a desktop app, running unchanged, with the machine connection in its own process;
  the icon; three.js bundled so it works offline; a Content Security Policy.

## 454 Control

### 0.31.15 — the Shapeoko 5 Pro and 5.1 Pro
- **The Shapeoko 5 Pro and 5.1 Pro**, in all three sizes, in the work area presets (2×2, 623 × 623 mm;
  4×2, 1237 × 623 mm; 4×4, 1237 × 1237 mm), and recognised from the controller's travel settings when
  connecting, with its ballscrew Z (166.67 steps/mm). The 5.1 Pro is the 5 Pro with a stiffer base
  frame, with the same travel, so one entry covers both.

### 0.31.14 — jobs from 454 Design
- **Takes jobs from Design's new "Preview in 454 Control"** (`apps/control/src/js/handoff.js`): an open
  Control loads the job without reloading, so a machine connection is never dropped; a Control that's just
  opening picks it up from storage. While a job is running, the loaded file isn't replaced, and Design is
  told why. Loading a file never runs it.

### 0.31.13 — a tool offset left from an earlier job no longer shifts the next one
- **Fixed: a job could cut far deeper than its file.** A BitSetter tool change sets a tool length offset in
  the controller (G43.1), and nothing ever cancelled it. Setting Z zero with that old offset still active
  built it into the new zero; the next tool change replaced the offset, and the whole job shifted by the
  old amount. A chamfer that started with a tool change cut far deeper than the 2.4 mm in its G-code this
  way. Now every way of setting Z zero (Zero Z, Zero all, the BitZero) cancels the old offset first (G49),
  and resets the Z nudge, so each zero and its BitSetter reference start clean. Reproduced on the simulated
  machine first (a 1 mm plunge landed 21 mm deep with a 20 mm leftover offset), then fixed (exactly 1 mm).
- **An offset found on connecting is reported**: if the controller already has a tool length offset
  Control didn't set this session, it says so, and to set Z zero again before cutting.
- **Fixed: answers to earlier commands could move a probe on early.** Control moved a probe sequence on at
  every ok, including oks still owed to commands sent just before it started (Zero all's two lines, for
  one), which put it a step out of step with the controller. It now counts the lines awaiting an answer,
  and sets aside those owed to earlier commands. Found by the test above.

### 0.31.12 — a faster BitSetter
- **The BitSetter searches down much faster**: the fastest speed that coasts at most 0.5 mm past the switch
  while the machine stops, worked out from the Z axis's acceleration ($122), no faster than 1000 mm/min or
  Z's own maximum ($112), and never slower than the old 200. A typical Shapeoko (400 mm/s²) searches at
  1000 mm/min, five times faster. The measurement itself is unchanged: the slow second touch at 40 mm/min.
  Rounded down, so the limit always holds (a test caught it rounding up). Before the controller's settings
  are read, 500 mm/min.
- **A probe move that reports no result stops the sequence** instead of carrying on to the next step. GRBL
  always reports a probe's result before its ok, so this should never happen; if it does, stopping is right.
- **When the BitSetter finds nothing**, the advice is about the BitSetter (its captured position and its
  cable), not the BitZero's "jog closer to the plate".
- Tested end to end: Control's own BitSetter test against the simulated machine, with a switch (found at
  the new speed, measured, reported) and without one (stopped, with the right advice). This needed the
  simulator fixed: it answered a probe move's ok before its result, unlike GRBL, which let the next command
  run while the probe was still moving. It now answers as GRBL does, and `npm run build` compiles it.

### 0.31.11 — one G-code parser, tested
- **The G-code parser is one file, shared by Control and the `@454/gcode` package**
  (`packages/gcode/src/parser.cjs`). The package had kept a copy of Control's parser, and its golden tests
  checked the copy, not the parser Control runs; the two hadn't drifted yet, which made now the time. The
  four real job files the golden tests pin were also parsed inside Control's built page, and matched
  every one of 28,696 moves, the times, distances, tools, issues and toolpath names.
- **The parser has tests of its own** (18, in `apps/control/test/parser.test.mjs`): inches, relative moves,
  line numbers, arcs (on their circle, each direction, full circles, and the arc problems GRBL rejects),
  missing feed, spindle or motion mode, missing units, commands GRBL or Carbide Motion can't run or ignore,
  G28 and G53, unknown words, repeated problems, VCarve's tool and toolpath comments, nested comments, and
  the time estimate. Each was checked by breaking the parser on purpose.
- **Fixed:** messages about ignored commands named the code twice ("M7: M7 mist coolant", likewise G40,
  G43 and G49). They now read "M7: mist coolant".
- Control's version is now in `apps/control/src/js/version.js`.

### 0.31.10 — spin-up: M4 too, and 7 seconds
- **A reverse spindle start (M4) gets the spin-up wait too**, as M3 always has. Before, a file starting the
  spindle with M4 could reach the material before the spindle was up to speed. The start summary now says
  "after each spindle start", and the setting "s dwell after M3 or M4". A new test covers it, checked to
  fail with the old M3-only rule.
- **The spin-up default is 7 seconds**, down from 10: the default, the minimum when you choose a VFD or
  Control detects one, and the floor for old profiles. A profile already saved with a longer wait keeps
  it; change it in Settings → Accessories → Spindle. The help text and the docs say 7.

### 0.31.9 — the job builder, tested (no change in behaviour)
- **The job builder has unit tests of its own**: what a job sends to the machine beyond the file itself,
  and the most safety-critical code in Control. 19 tests, one per rule: spin-up waits (and when a file's
  own wait counts), lifting before a spindle stop and never downwards, relative lifts when machine heights
  aren't known, never stopping the spindle in the material, tool changes (lift, stop, restart the spindle
  if the file assumes it's still running), the ending (lift, stop, back to XY zero, park, the file's M2 or
  M30 last), and the file's own lines. Run with `node --test 'apps/control/test/*.test.mjs'`; GitHub runs
  them on every push.
- **The tests were checked by breaking each rule on purpose.** One test passed for the wrong reason (its
  file hit a different rule first, so the guard against lifting downwards never ran); it now uses a case
  that reaches the guard (thick stock, work zero near the top of travel), and fails without it.
- **To make it testable, the job builder became a pure function**, `JobBuilder.build(lines, machine)`,
  with its logic unchanged line for line; `buildJobList()` gathers Control's state and calls it. The old
  and new builders were run side by side in the real Control page on 488 cases (15 files, including real
  VCarve output, each with every combination of homed, work offset, Start & stop high, spin-up and
  parking): identical in every case. The end-to-end job test passes.

### 0.31.8 — a loaded job, from the top
- **Loading a job animates the 3D view to the top view**, framing the whole job: the camera turns, moves
  and zooms together, easing to a stop in about 0.7 s, from wherever the view was. It ends looking
  straight down, X to the right and Y away from you, as the view cube's Top. With reduced motion turned on,
  it goes straight there.
- The view cube and the Fit button behave as before (Fit frames the job without changing the angle), and
  scrolling to zoom now cancels an animation in progress, as dragging already did.
- The first change made in Control's source files (`viewer.js`, `playback.js`, `wiring.js`).

### Source split into files (no change in behaviour)
- **Control is now worked on as 35 source files** in `apps/control/src` (its styles, and its code by
  subject: the parser, the 3D view, playback, each panel, the machine layer, jogging, probing, the
  BitSetter and BitZero, the connection, status, quick actions, the profile, and the job: building,
  running and recovery), assembled into the same single `index.html` by `node apps/control/build.mjs`.
  The website, the desktop app and the release workflow use `index.html` exactly as before.
- **Proven unchanged:** the split was cut at whole lines, and the build reassembles the original byte for
  byte (289,384 bytes, identical SHA-256). `index.html` now differs from before only by a note at its top
  saying it's generated. The end-to-end job test passes on it.
- **GitHub checks on every push** that `index.html` matches its source files, so a direct edit, or a
  source change without a rebuild, can't slip through. See `apps/control/README.md`.

### 0.31.7 — the work position, right away
- **The work position is right from the first status report after the work offset changes**, such as on
  connecting or straight after zeroing. GRBL lists the machine position before the work offset in a
  report, and Control worked out the work position as it read the machine position, with the previous
  offset: the position readouts (the bottom bar and the jog panel) lagged one report, about a quarter of a
  second, behind. Found while making the docs' screenshots; checked with reports as GRBL sends them, and
  the end-to-end job test passes.

### 0.31.5 — tells you when your browser can't connect
- **A browser that can't talk to the machine gets a clear message when Control opens**, in place of the
  connect prompt: 454 Control needs Chrome, Edge or another Chromium-based browser on a computer (or the
  desktop app), with links to Chrome and Edge. It says why in terms of the browser in use: Firefox and
  Safari lack Web Serial, Brave is Chromium but turns it off, and no phone or tablet browser has it.
  **Continue without a machine** still lets you open and check G-code; it isn't asked again that visit.
- Decided by whether the browser has Web Serial, not by its name, so Brave and phones are right too.
- The check has a script of its own, ahead of the rest, so it still appears if the rest of Control fails
  to start (for instance if the 3D view's library can't load).

### 0.31.4
- **The Machine tab comes first and is open when Control starts**: Machine, Code, Toolpaths, Checks.
  Connecting, homing, jogging and running a job are what you need first, so they're no longer a click
  away. Clicking a problem in Checks still jumps to its line in Code.

### 0.31.3
- The GitHub and Sponsor links point to the renamed repo, `ctredway/454-workshop`; the docs' links too.
- The sample file is `454-sample.nc` (was `kerf-sample.nc`). Settings saved under the old Kerf names are
  still read.

### 0.31.2 — the spindle never stops in the material
- **(machine)** With **Start & stop high** switched off, the lift before the spindle stops was skipped
  even when the tool was in the material, so a file's mid-cut M5 stopped the spindle with the bit
  buried (it can snap or burn as it spins down, and would restart buried). The setting now only skips
  the lift when the tool is already clear of the material. Well-behaved posts never trigger this.
  Found by the new safety suite. (Recorded late: this entry was missed when the fix was made.)

### 0.31.1 — the spindle restarts after a tool change
- **(machine)** When a file changes tools with the spindle running (no M5 before M6) and doesn't
  restart it afterwards, 454 stopped the spindle for the change, but nothing restarted it: the rest of
  the job would have plunged a stationary bit into the material. 454 now restarts it at the file's
  speed, with the spin-up wait, while the tool is still at the top, unless the file restarts or stops
  it itself before its next move. Well-behaved posts, which send M3 after M6, are unaffected. Found by
  the new safety suite. (Recorded late, as above.)

### 0.31.0 — Test the BitSetter
- A **Test** button beside Capture position touches off once with the tool in the spindle, using
  the same moves as a real measurement, and reports where it triggered, plus how much longer or
  shorter the tool is than the reference if one has been taken. It changes nothing: no reference,
  no offset. It refuses (with the reason) if the BitSetter isn't ready or the machine isn't idle.
- The idle check's message now says what the machine is doing ("moving", "on hold", "homing")
  instead of GRBL's state name ("the machine is Run").

### 0.30.1 — actual time against the estimate
- When a job finishes, Control reports how long it took and how that compares with the estimate:
  "Job finished in 11:28: machine time 10:00 against an estimate of 9:30 (+5%); also 0:20 spin-up
  waits, 0:45 at tool changes, 0:15 measuring tools, 0:08 held."
- Only machine time is compared, since the estimate knows nothing of tool changes, holds,
  BitSetter measuring or the spin-up waits Control inserts; those are listed separately. Time is
  sorted with every status report, and gaps in reports (a sleeping tab, a reconnect) aren't counted.
- The last 50 results are kept, and after three or more jobs the console says how estimates have
  been running on this machine overall.

### 0.30.0 — time estimates that allow for acceleration
- Once the controller's settings are read, job times are estimated the way GRBL's planner runs
  the machine: per-axis maximum rates ($110–112) and accelerations ($120–122), with corners limited
  by junction deviation ($11), a backward and forward pass to set the speed at each junction, and
  each move accelerating, cruising and decelerating within its length. The machine comes to rest
  where GRBL's does: at the start, at dwells, and at spindle, tool-change and program stops.
- Before, every move was assumed to run at its full feed rate from start to finish, which
  underestimates jobs with many short moves and corners. On real jobs: arm inserts 30:42 → 37:16,
  wing button 0:41 → 0:50, desktop pockets 0:32 → 0:55.
- Checked against exact physics: a 100 mm move at 50 mm/s with 400 mm/s² acceleration gives 2.13 s
  (exact 2.125; the old estimate said 2.00), and a 2 mm move that never reaches full speed 0.14 s
  (exact 0.141; old 0.04).
- Only the timing changes, never the moves. Without the controller's settings the estimate works
  as before. A file already loaded is re-timed when the settings arrive.

### 0.29.0 — more settings from the controller
The controller is the authority on the machine, so anything it reports is used rather than typed.
- **(machine)** Reporting units ($13): a controller set to report in inches had every position read
  25.4 times too small, which would have misled lifts, jog limits and the BitSetter. Positions and
  stored offsets are now converted.
- Spindle type from $30, unless you've chosen it: Carbide boards use 1000 for a trim router (speed
  set on its dial) and the real maximum, usually 24000, for a VFD. Choosing a type yourself keeps it.
- For a VFD, the spindle speed box is limited to $31–$30, and the start summary also warns when a
  file asks for less than the minimum ($31). For a router, the S-value warnings no longer appear:
  a file asking for S18000 on a router board ($30 = 1000) showed a red "RPM will be capped" every
  job, though the router ignores it.
- A work area you've chosen that differs from the controller's travel is reported as information
  by the controller check, not as "one of them is wrong".
- Fixed: the stock-thickness help claimed it was filled in from $130/$131; choosing VFD logged
  "raised to 6 s" while setting 10.

### 0.28.2 — the work area you choose stays chosen
- Picking a machine from the Work area list, or typing a size, now sticks. Before, every connect
  replaced it with the controller's own travel whenever they differed by more than 1 mm, and the
  list always showed "Custom…" after a reload. Saving also rebuilt the work-area record from the
  form, which would have discarded any setting not on it.
- The list gains **From the controller (automatic)**, the default and the way back to it. When a
  chosen size differs from the controller's travel, connecting notes it in the console instead.

### 0.28.1 — the light theme's 3D view
- The grid stayed near-black in the light theme. It's built from several line sets, and the code
  recolouring it for the theme looked for a single one, so it silently missed. The grid is now
  built in the theme's colours and rebuilt when the theme changes.
- Toolpath colours have a light-theme palette. On dark, cut paths turn brighter as they're done;
  on light they now turn darker and stronger instead. The old pale-yellow "done" colour was barely
  distinguishable from the light background (luminance gap 0.14; now 0.59).

### 0.28.0 — Z +6 mm, and two fixes found adding it
- **Z +6 mm** in the jog window's Work zero section, as in Carbide Motion: lifts Z 6 mm from where
  it is. It's sent as a jog, so it can be cancelled, and it stops short at the top of travel.
- **(machine)** The rapid-position grid (corners, edges, centre) still assumed coordinates count
  down from 0, which 0.26.1 fixed everywhere else. On a machine that counts up, all nine buttons
  targeted points off the machine. They now use the machine's real range.
- **(machine)** The idle check only refused commands in alarm, despite its name, so zeroing, rapid
  positions, Go to XY zero and spindle start could be sent while the machine was moving. These now
  need the machine stopped (jogs may also follow a jog under way), and during a job only the pause
  at a tool change counts as stopped.

### 0.27.2
- Controller config (Re-read, Check controller settings, and the settings table) moved from the
  main Machine tab into Settings → Machine, alongside the rest of the machine's setup.

### 0.27.1 — captured BitSetter positions are honoured
- A BitSetter position captured from the machine is used as captured. 0.26.1 fixed how each
  axis's range is worked out, but still second-guessed a captured position against that range,
  so a machine whose range was misjudged kept rejecting a position it had physically been to.
  Now a position is only refused if it can't be on the machine in either direction (beyond its
  full travel both ways), which means a typing slip or another machine's profile.
- When a captured position falls outside the range Control worked out, it's noted in the console,
  since that range also sets jog limits.
- Check controller settings now always reports each axis's range and how it was worked out.

### 0.27.0 — jobs end the Carbide Motion way
- **(machine)** Every job, finished or ended early, now lifts, stops the spindle, returns to the
  job's XY zero, then parks at the back centre of the machine, which is Carbide Motion's order.
  Before, it parked at a captured position *or* returned to XY zero, never both, with no default
  park. A captured end position still overrides the back centre.

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

### 0.94.0 — lines snap to 45° and 90°
- **Lines and polylines snap to 0°, 45°, 90°, 135° and so on** from their start as you draw them, vectors
  and construction lines alike (they're drawn with the same tools). Within 10 screen pixels of one of those
  angles, the end snaps onto it, at a whole grid step along it; holding Shift locks to the nearest angle
  wherever the pointer is. A dashed line along the angle, and the angle beside the pointer, show when it's
  snapped. A shape's point (an end, middle, corner or centre) still wins over the angle, and a guide along
  the way gives the exact crossing. On unless turned off: Settings → Drawing.
- Tested case by case in the real page (each angle, free angles, Shift, an endpoint winning, a polyline,
  a guide crossing, switched off), and with a line drawn by pointer events: clicked 2.3 mm off level, it
  came out exactly level, and X made it a construction line.

### 0.93.0 — adding DXF and SVG files to a drawing
- **Importing a DXF no longer replaces the drawing.** It did: shapes, toolpaths, dimensions and guides
  were all discarded (only Undo brought them back). The import panel now offers **Add to this drawing**
  (the default when something's drawn), which keeps everything, or **Replace the drawing**.
- **Where the new shapes go:** beside what's drawn (10 mm to its right, bottoms aligned), at X0 Y0, or where
  the file has them. They come in selected, ready to drag into place.
- **Layers merge by name**: a file's layer joins the drawing's layer of the same name; new names become new
  layers (keeping whether they were hidden). DXF's default layer "0" goes on the active layer.
- **SVG import, new**: sizes from the file's own units (mm, cm, in, pt, pc; px at 96 per inch) and viewBox,
  group transforms, every path command, rectangles, circles, ellipses, lines, polylines and polygons.
  Circular arcs stay arcs, circles stay circles and axis-aligned rectangles stay rectangles; Bezier curves
  and elliptical arcs follow the true curve within 0.02 mm. Inkscape layers become layers (hidden ones
  hidden); hidden elements are skipped; text, images and <use> copies are counted and reported, not
  silently dropped. Design's own SVG export now records where its page sat, so an SVG saved by Design comes
  back exactly where it was.
- **Several files at once**, picked or dropped together: one panel, placed side by side.
- Tested on SVGs with known answers (units, the Y flip, arcs, a Bezier within 0.007 mm, transforms,
  Inkscape layers), an exact round trip through Design's own export, and the whole flow through the file
  picker: adding beside a drawing with a toolpath, an SVG after it, a DXF and an SVG together, a layer
  reused by name, replacing, and an empty drawing.

### 0.92.1
- **The Shapeoko 5 / 5.1 Pro**, in all three sizes, in Job setup's cutting areas.

### 0.92.0 — Preview in 454 Control
- **A "Preview in 454 Control" button** in the Toolpaths panel loads exactly the G-code Save G-code writes
  (the same checks first) into 454 Control, for its 3D preview and playback, time estimate and checks,
  with no file to save or open. In the desktop app, Control's window comes forward; on the website, an open
  Control tab gets the job (a site can't bring another tab forward, so Design says where it is) and a new
  tab opens only when there isn't one. Tested in both, with Control open (no reload, no second Control) and
  closed (one Control opens, with the job).

### 0.91.0 — dimensions: both sides, and edges that stay put
- **A distance on each side of a shape now sizes it.** When a shape is already held by a distance on its
  opposite side, a new distance moves just the clicked edge, stretching it, instead of moving the whole
  shape and breaking the first. Placing a rectangle 10 mm inside another on both sides: set one side (it
  moves into place), then the other (it stretches to fit); changing either later keeps the other.
  Rectangles and straight-edged outlines; a shape that would turn inside out is refused, with the reason.
- **Dimensions remember which edges they measure, not points on the drawing.** They stored the click
  point, which stays put when the shape moves, so after a move a dimension could quietly measure a
  different edge (setting one side, then the other, changed the first). Now a rectangle's side, or an
  outline's segment, and how far along it; dimensions follow their edges through moves and stretches.
  Dimensions in drawings saved before keep measuring the edges they measure now.
- **A rectangle's width or height can be dimensioned**: click one of its sides twice. It keeps any side a
  distance holds; if both are held, it says so. (The docs said this worked before; for rectangles it
  didn't.)
- **The D key with two shapes selected** now uses the edges clicked when they were selected: before, it
  picked the edges nearest the other shape's centre (arbitrary, for one rectangle inside another, and it
  could even refuse them as not parallel), saved no edges, and never saved a second distance between the
  same two shapes. It now saves each distance unless it measures the same edges as an existing one.
- When a value can't be applied, the message says why, and no empty step is left to undo.
- Tested in the real Design page on the case reported (both routes, each step), dragging a dimensioned
  shape, and a dimension saved the old way.

### 0.90.1 — Job setup, and the accent colour
- **Job setup was drawing unstyled**: its labels and fields ran together and the XY zero picker overlapped
  the text above it. Its styles were written for the Settings panel it used to live in, and didn't follow
  when it became a panel of its own. It now shares them, and the picker has room for its corner buttons.
  Found while making the docs' screenshots.
- **Three highlights never showed**, because they asked for an accent colour variable Design doesn't
  have (`--accent`; Design's is `--amber`, set by the theme's accent): the chosen XY zero corner in Job
  setup, the selected Tools or Layers tab, and the active layer's border. Checked both apps: no other
  colour variable is used without being defined.

### 0.90.0 — the job sheet
- **Job sheet…**, under Save G-code in the Toolpaths panel: everything about the job on one printable page
  (or a PDF), to keep at the machine.
  - **The top:** the logo, the job name (click to rename), the date and version, and key facts: material
    size and thickness, toolpaths, tools and tool changes, estimated time.
  - **The job, to scale:** the material, the shapes, each toolpath's cuts in its own colour with a numbered
    marker where it starts, drilled holes as rings, and where X0 Y0 is.
  - **Setup checklist:** the material, how far the cutting reaches (so clamps stay clear), where to zero X
    and Y, where Z zero goes and the deepest cut, the first tool, and the air cut.
  - **Tools:** T number, name, diameter, type, flutes, spindle speed, and which toolpaths use each.
  - **Toolpaths in cutting order:** tool, feed, plunge and spindle, the same description as the cards, and
    an estimated time each.
  - **Anything that needs attention** (notes on toolpaths, order warnings, no thickness set, toolpaths left
    out), and a Notes area to type in before printing.
- **It matches the G-code:** the same tool numbers (checked against a saved file: T1, T2, T3, T2 in both),
  the same toolpaths (those left out of the G-code are left out), and out-of-date toolpaths recalculated
  first, as Save G-code does. In a multi-sheet project, it covers the chosen sheet.
- Prints as clean pages: only the sheet prints, sections never split from their headings, and every page
  prints (the app's full-window layout had clipped printing to the first page).
- The toolpath cards and the job sheet share one description of each toolpath, and the G-code export and
  the job sheet share one tool numbering, so they can't disagree.

### 0.89.0 — CAM released, as a beta
- **CAM loads by default**, on the website as in the desktop app; `?cam=off` still turns it off in that
  browser. It was only loaded when asked for with `?cam`, or when Design was opened from a computer.
- **Beta, said where it matters:** a note at the top of the Toolpaths panel (with a link to what to
  check), and a first line in every saved G-code file saying the job was made with beta toolpaths and
  to preview it in 454 Control and run it in the air before cutting material.
- The CAM reference is published, with a beta note at its top, and linked from the docs home page.

### 0.88.6 — recalculate without editing
- **A Recalculate button (&#8635;) on every toolpath card**, always there, highlighted when the toolpath
  is out of date. Before, the only way was a Regenerate button that appeared only when Design judged
  the toolpath out of date, or opening the editor and saving. It rebuilds from the shapes and the
  material as they are now, keeping the toolpath's own settings, and says so when done (or shows the
  toolpath's note, if it has one).
- **Right-click a toolpath card** for a menu: Recalculate, Edit, show or hide on the drawing, include
  in or leave out of the G-code, run earlier or later, and Delete. Arrow keys move through it; Escape
  or a click elsewhere closes it.
- **Recalculate all** in the Toolpaths panel's header (on the chosen sheet in multi-sheet projects),
  for after a change that affects every toolpath, such as the material thickness.

### 0.88.5 — repeated points
- **Fillets beside a repeated point can be removed, and such corners filleted.** An outline can hold
  the same point twice in a row, a zero-length edge between them; a corner beside one had no direction
  to fillet or restore, so removing a fillet there did nothing and filleting said "didn't fit". The
  Fillet tool now merges repeated points first; the outline looks and cuts the same. Found in a real
  project, where the two left corners' fillets wouldn't come off.
- **The polyline tool no longer repeats a point** when a corner is double-clicked or the same point is
  typed twice, a way these outlines were being made.
- **Filleting keeps a shape on its layer** (and sheet). The filleted shape kept its ID but not its
  layer, so a shape on another layer moved to the active one.

### 0.88.4 — corners from VCarve and DXF
- **Removing fillets now works on imported shapes' corners too**, not only ones Design made:
  - fillets **stored in pieces** (VCarve sometimes splits a corner's arc in two) are removed as one;
  - fillets where a **curved edge** meets a straight one, or two curved edges meet: the curved edge is
    extended along its own circle to the corner. Only true fillets qualify (touching both edges
    smoothly, at a real corner), so smooth curves such as an S-bend aren't mistaken for fillets;
  - fillets between **separate lines and an arc** (as many CAD programs export DXF) are found when
    the ends meet within 0.005 mm, since exported coordinates are rounded.
- **Fixed: filleting a corner where two arcs meet put the fillet outside the shape**, overshooting the
  corner. The solver accepted a touch point on a curve's extension beyond the corner; it now must be
  on the edge's own side. Straight-edged corners were unaffected.
- Checked on real projects: the rear-arm project's removable fillets went from 108 to 126 of its 180
  arcs; the rest are slot ends and smooth curves, correctly left alone. Every fillet round trip
  (fillet a corner, remove it) restores the original exactly, including inner corners and corners
  between arcs.
- Still to do: VCarve's Bézier curves import as many short straight pieces, so a corner next to one
  can't take a fillet.

### 0.88.3 — remove a fillet
- With the Fillet tool, **click a rounded corner to make it sharp again**. Hovering one shows the corner
  that will come back, dashed in amber, with a restore mark at the cursor (a green check still means
  "will fillet", a red X "can't"). Works for round fillets, dog-bones and T-bones on outlines and
  rectangles, and for fillets between two separate lines (both lines are extended back to their
  corner and the arc is removed). Undo puts the fillet back.
- The straight edges on each side are extended until they meet, which restores the original corner
  exactly: checked for every corner type, including the corner where an outline starts. Rounded ends
  between parallel sides, like a slot's, aren't corners and are left alone. When a sharp corner is
  nearer the cursor than a fillet, a click still fillets it.
- Designed on 22 September alongside the fillet hover preview, but only the preview was built then.

### 0.88.2 — the fillet radius
- **A Radius box** in the prompt bar while the Fillet tool is active, beside Round / Dog-bone / T-bone,
  showing the current radius in the drawing's units. Type a new one there (units like "4mm" work) and
  it takes effect as you type; Enter hands the keys back to the drawing. It doesn't take focus, so
  clicking corners works as before. Before, the radius could only be set by typing blind: the box
  appeared only once you started.
- **The first digit typed now counts.** Typing a radius without clicking the box put the first
  keystroke into the field without it taking effect, so typing "6" and clicking a corner filleted it
  at the old radius.
- The prompt bar sizes itself to its contents, so its buttons can't be pushed past its edge.

### 0.88.1 — three display fixes (found taking the README's screenshots)
- **The Sheet selector showed on every project**, empty on single-sheet ones: its layout was an inline
  style, which overrides "hidden". It now shows only for multi-sheet projects.
- **The Sheet selector could go stale** after opening another project; it's refreshed on every
  update of the Toolpaths panel.
- **A selected toolpath wasn't drawn**: with a toolpath selected (as the newest is after Create), the
  canvas showed only its tabs. It now draws the selected toolpath, highlighted, with its tabs, as
  intended.

### 0.88.0 — multi-sheet VCarve projects (CAM preview)
- VCarve lays every sheet out in the same space, so a multi-sheet project loaded with all its sheets'
  parts piled on top of each other. Each vector's record ends with its sheet's ID, and the sheets
  (name and ID) are listed after the vectors; found by reading the multi-sheet Letters.crv, where the
  IDs split the 31 outlines 21 / 10 and every overlapping pair is one from each sheet.
- **Each sheet is now its own layer**, named as in VCarve, with one shown at a time, and a **Sheet**
  selector at the top of the Toolpaths panel (only in multi-sheet projects): choosing a sheet shows it,
  lists its toolpaths, and makes it the layer new shapes go on.
- **Every toolpath belongs to one sheet.** Converted toolpaths whose shapes are on several sheets are
  split, one per sheet. A new toolpath whose shapes are on different sheets is refused, since each
  sheet is cut from its own material.
- **Save G-code saves the chosen sheet only**, named for it ("… - Sheet 1.nc"), so a file can never put
  two sheets' parts on one piece of material. A sheet with no toolpaths says so.
- Single-sheet projects are unaffected.

### 0.87.2 — converted VCarve profiles on the wrong side (CAM preview)
- **(machine)** A VCarve profile could convert as inside when VCarve cuts it outside, or the reverse.
  VCarve stores the side twice: `ProfileType` (0 outside, 1 inside, 2 on the line) and a label such as
  "Profile Inside". The label is set when the toolpath is made and isn't updated when it's switched
  later, so it can say the opposite; conversion trusted the label. VCarve's own calculated paths
  follow `ProfileType` (checked by comparing their areas with their shapes': 18 of 18 inside for the
  rear-arm project's "Profile 2", whose label says Outside), so `ProfileType` now decides, with the
  label only a fallback. Reported on a new project; the battery-strap and rear-arm projects had the
  same mismatch. The wing button, where both agree, converts exactly as before.
- **Re-convert** any VCarve project converted before this, and check each profile's side.

### 0.87.1 — smoother tracing
- **Fit curves** (Trace image panel, on by default): true arcs and straight lines are fitted to the
  traced outlines, longest first, each within the smoothing tolerance, and stored as curved
  outlines. On test artwork (a circle, a ring with a hole, a rounded rectangle, a triangle), about
  2,000 traced points became 25 pieces, 16 of them arcs, where plain tracing needs 109 points. Every
  traced point stays within the tolerance of the fitted curve at every smoothing level, corners stay
  sharp, holes stay holes, and accuracy against the exact shapes is unchanged. The hint compares the
  two counts; untick it for straight segments as before.

### 0.87.0 — VCarve conversion by VCarve's own record (CAM preview)
- Each toolpath in a VCarve project lists the IDs of the vectors it uses, and each vector in the
  drawing carries its ID. Found by reading the project format: the IDs follow each vector, and each
  toolpath's record lists them after its name. Conversion now reads that record, so it no longer
  depends on the saved previews lining up. On the battery-strap project, whose parts were moved after
  VCarve last calculated, every toolpath previously found no shapes; now all seven find the right
  ones (6 plate holes, 27 holes and slots, 2 cut-outs, 3 chamfered edges, the lettering, 5 part
  outlines). On the wing button, the two methods agree exactly: the same shapes and the same moves.
- Projects without the record fall back to preview matching as before, which now runs only if
  needed. It compares every shape with every preview, which took minutes on the strap project and
  was previously done for every project; conversion there now takes under two seconds.

### 0.86.1 — CAM reference
- A **CAM reference** (docs/cam-reference.html), linked from the foot of the Toolpaths panel: every
  toolpath type and setting by its on-screen name, finishing, direction, leads, tabs and ramps, the
  tool library and per-material feeds, cutting order, Check and saving, converting VCarve projects,
  and how the toolpaths are checked. Linked only from the CAM build while CAM is in preview.

### 0.86.0 — DXF blocks
- Blocks placed in a DXF (INSERT) are imported instead of skipped: each placement's position,
  rotation and scale applied, mirroring (negative scale) reversing arcs and curved segments as it
  should, nested blocks expanded (to eight levels), array placements expanded, and circles under
  unequal X and Y scaling brought in as the ellipse outlines they become. Shapes on layer 0 inside a
  block take their placement's layer; others keep their own.
- Checked against ezdxf's own expansion of a test file with every kind of placement: all 33 shapes
  match within 0.007 mm both ways. The first version missed nested blocks (the definitions were
  looked for inside the block instead of at the file's top level); caught by the same check.

### 0.85.3 — SVG export
- **Export SVG** (File group), for laser software, vinyl cutters and Inkscape: millimetres at true
  size; circles, arcs and curved outline segments as real SVG arcs; layers as Inkscape layers
  (hidden ones hidden); construction lines on a dashed "Construction" layer; groups flattened, text
  as outlines.
- SVG's Y axis points down, so arcs change direction when flipped. The first version had every arc
  bending the wrong way; an independent library (svgpathtools) reading the file caught it. Now every
  shape type matches within the check's own sampling precision.

### 0.85.2 — clearing for capped V-carves
- A V-carve with a max depth that leaves flat areas now brings a **clearing pocket** with it, like
  inlays: stopping exactly where the V-bit's floor ends, running first, created with no tool chosen,
  and following the V-carve when its max depth is changed.

### 0.85.1 — recently used tools
- The tool library opens with a **Recently used** folder: the last six tools chosen for toolpaths,
  newest first.

### 0.85.0 — edit the tool library
- Tools can be edited, like VCarve's tool database: **Edit** on a tool turns its details into a
  form: name, type, units (switching converts the sizes), diameter, angle and flat tip for V-bits,
  flutes, notes, and its tool number on the chosen machine.
- **Feeds and speeds per material**: choose a material in the bar and edit that tool's feed, plunge
  (mm/min or in/min), spindle speed, pass depth and stepover for it. A material with none yet gets
  **Add feeds**, started from another material's so you're adjusting rather than starting from
  nothing, with a note saying where they came from and in which units.
- **+ Tool**, **Duplicate**, **Delete**, and **+ Material**; **Start an empty library** for anyone
  without a VCarve database to import.
- Checks on save: a diameter above zero, an angle for V-bits, positive feeds and pass depths.
- Saved in this browser and shared with 454 Control. Toolpaths already made keep their own feeds
  and speeds until the tool is chosen for them again; new ones use the edited values.

### 0.84.1 — new toolpaths take their place in the cutting order
- A new toolpath slots into the usual sequence instead of going last: holes, chamfers, pockets,
  V-carves, inside profiles, on-the-line, outside profiles. It lands after the last toolpath of the
  same or an earlier kind, so an order arranged by hand is kept; editing never moves a toolpath,
  and converted VCarve projects keep VCarve's order. An inlay's clearing pass goes before its
  V-carve, as VCarve does.

### 0.80.2 — toolpaths can use groups and text
- Every toolpath type now works on groups and text. Before, a traced logo (a group) or text gave
  a toolpath nothing to cut, whatever the type; a pocket on a traced logo now keeps its holes as
  islands. (The V-carve toolpath itself is part of the CAM preview; see below.)

### 0.79.1 — a DXF import bug
- Curved segments of modern polylines (LWPOLYLINE bulges) were matched up in a second pass over the
  whole file, including polylines inside block definitions such as arrowheads. Many CAD exports
  have those, so a drawing's polylines could get another polyline's curves: curves lost, or arcs
  appearing where the drawing has straight edges. Each polyline's curves are now read from its own
  data. Found by importing a CAD-style file with blocks while testing DXF export.

### 0.79.0 — DXF export, and DXF layers on import
- **Export DXF** (File group): an R12 DXF in millimetres, which VCarve, Fusion, LibreCAD and laser
  software read. Circles and arcs stay true circles and arcs (clockwise ones written as DXF's
  anticlockwise arcs); curved outline segments keep their curves as polyline bulges. Layers become
  DXF layers, hidden ones off and locked ones locked. Construction lines go on a "Construction"
  layer; groups are flattened and text converted to outlines; dimensions, guides and toolpaths
  stay out.
- Opening a DXF now brings its layers in as Design layers, keeping which were off or locked. A
  "Construction" layer's shapes come back as construction lines.
- Checked by round trip (every point of every shape type back within 0.0001 mm, layers and their
  states intact) and with ezdxf, an independent DXF library, whose auditor found no errors.

### 0.78.0 — the machine's cutting area as a guide
- Guides gains **Machine area**, toggling a dashed outline of the machine's cutting area, drawn like
  a guide but not selectable or movable, and labelled with its size. It turns orange when shapes
  fall outside it and red when the material doesn't fit.
- Job setup gains a Machine section: the cutting area (from 454 Control's saved work area when both
  apps run from the same place, a preset, or a custom size) and where the material sits on the bed:
  any corner, optionally a distance in from it, or the centre. The machine size is remembered per
  browser; the material's position is saved with the drawing.

### 0.77.1
- The left panel has vertical tabs down its edge: Tools (the tool groups, as before) and Layers,
  which now gets the panel's full height instead of sitting below the tool groups. The chosen tab
  is remembered, and the arrow keys move between tabs.

### 0.77.0 — layers
- Every shape belongs to a layer, listed in a new Layers section of the left panel. Each row has
  show/hide, lock, the name (double-click to rename), a shape count, move-selection-here, and
  delete. Clicking a row makes it the active layer, where new shapes go; + Layer adds one.
- Hidden layers aren't drawn, picked or snapped to; locked layers are drawn but can't be picked or
  changed. As in VCarve, hiding doesn't change what toolpaths cut.
- A traced image goes on its own "Reference: name" layer at the bottom, so it can be hidden or
  deleted like anything else (the old corner button is gone). Its outlines go on the active layer.
- Deleting a layer with anything on it asks first; all layer changes are undoable. A saved file
  keeps only the pictures still in use, and undo snapshots hold no image data, so they stay small.
- Older drawings open with everything on "Layer 1"; a 0.76 reference image becomes a layer.
- Changing XY zero in Job setup now moves reference images with the shapes, so a picture stays
  under its traced outlines.

### 0.76.0 — trace an image
- Drop a PNG, JPG or other image on the drawing (or open it) and trace it into closed outlines.
  The Trace image panel previews live: threshold (with Auto), invert, smoothing, ignore specks,
  and the real width. The outlines are added as one group, centred on the material, with holes
  kept as holes, so a pocket treats the inside of an "O" as an island.
- The image can stay faintly behind the drawing for tracing by hand; a button removes it.
- Written from scratch rather than using Potrace, which is GPL. Outlines are found where the image
  crosses the threshold, interpolated between pixels, so edges are smooth rather than stepped.
  On test artwork the traced sizes were within 0.01 mm of exact (60.00, 40.00 and a 35.00 hole
  came out 59.99, 40.01 and 34.99). Auto sets the threshold halfway between the dark and light
  parts of the image, which is where an anti-aliased edge truly lies.
- Works in the public Design too; it doesn't need the CAM engine.

### 0.75.3
- The grid, origin axes and material outline follow the theme. They were fixed dark colours, so
  the grid drew in near-black on the light theme.

### 0.75.2
- Toolpaths panel buttons are icons, each with a tooltip and a spoken label: Check and New in the
  header; move earlier and later, Regenerate, Edit and Delete on each card (Delete turns red on
  hover). Save G-code keeps its words, since it's the main action and says how many it saves.
- The toolpath count sits on its own line under the header.

### 0.75.1
- A toolpath whose tool was picked from the library counts as having a chosen tool, however old.
  0.74.1 treated every toolpath made before it as unchosen, so a pocket with the 1/4" end mill
  picked in 0.74.0 showed that tool yet disabled Update. Only toolpaths with no library tool (the
  old silent 1/8" default) still need one chosen.
- Disabled buttons now look disabled. Before, they looked the same as enabled ones, so a disabled
  Update or Create seemed to do nothing when clicked.

### 0.75.0 — Job setup, and depth is never guessed
- **Job setup**, a window of its own (header button, and it opens by itself for a new drawing):
  units, material width and height, thickness, Z zero, and XY zero. These left Settings, which now
  links to it, so there's one place for them.
- **XY zero at any corner or the centre**, picked on a small diagram of the material. Before,
  only front-left or centre. Changing it keeps the parts where they are on the material (VCarve's
  behaviour): the drawing, guides and hand-placed tabs move with the material, toolpaths are
  rebuilt, and undo restores the zero and the parts together. The G-code header names the choice.
- **(machine)** A new toolpath no longer ticks "through" just because the material has a thickness,
  and has no depth until one is typed or "through" is ticked; Create stays disabled until then.
  Found when a pocket's depth silently came from the material thickness.

### 0.74.1 — every toolpath's tool is chosen for it
- **(machine)** No carrying a tool over from the previous toolpath (0.74.0 did): each toolpath
  starts with no tool, and Create stays disabled until one is picked from the library or its
  diameter typed.
- **(machine)** Save G-code refuses while any included toolpath has no chosen tool, and names them.
  Toolpaths made by earlier versions can't show their tool was chosen (the old silent 1/8"
  default looked the same as a choice), so they count as unchosen until opened and given a tool.
  Their cards say "no tool chosen". Toolpaths converted from VCarve keep the project's tool.
- The toolpath editor opens older toolpaths cleanly even when they lack newer settings.

### 0.74.0 — a toolpath never gets a tool by default
- **(machine)** A new toolpath silently started with a 1/8" (3.175 mm) cutter unless one was
  chosen. Found on a real job: after drilling with a 1/4" bit, a new pocket for 9 mm holes was
  built for 1/8", and with the 1/4" bit in the spindle the holes came out oversize (the G-code
  was exactly right for 9 mm with 1/8").
- A new toolpath now starts with the tool the previous one used (kept with the drawing, so it
  survives deleting every toolpath). With no previous tool, there is no tool: the button reads
  "Choose a tool", the diameter box is empty, and Create stays disabled until a tool is picked
  from the library or its diameter typed.

### 0.73.2
- A copy opened from your own computer (from disk or a local server) loads the CAM engine
  automatically. 0.73.1 only loaded it after opening `design.html?cam`, which hid the + New
  toolpath button for anyone who didn't know that. The public website still loads it only when
  asked, and `?cam=off` turns it off.
- If the engine is expected but `geom.js` and `cam.js` aren't beside `design.html`, the Toolpaths
  panel says so instead of the button silently missing.

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

### Three profile fixes, found from Letters.crv (with desktop 0.2.2)
- **(machine) Outside profiles bridged deep V-notches.** Offsetting an outline kept or dropped each
  corner on its own, and a V-notch has corners only at its mouth and its point: dropping the point
  (too narrow for the cutter) took both sides with it, and the path cut straight across the mouth.
  The N in Letters.crv was profiled as a box, leaving its notches uncut. The same corner-only check
  could also keep a straight stretch that passed through the part between two acceptable corners (a
  test comb of V slots: 0.001 mm from the part, a cut 1.6 mm into it). Offsets are now judged along
  their whole length in short pieces; where a notch narrows below the cutter, the two sides are
  joined where they cross, which is where the cutter turns round.
- **(machine) Moving between depth passes cut a chord into the part.** After each pass the ramped
  stretch is recut at full depth, ending past the start, and the next pass went straight back to the
  start: a chord at depth, into the part on a curved outline. Measured in real projects: 1.1 mm into
  some letters in Letters.crv, 0.17 mm on the wing button, 0.05 mm on the rear arm. The recut is now
  retraced back along the kerf instead. Present since ramps were added.
- **(machine) Ramps cut into tabs.** A ramp descended through a tab on the ramp stretch (0.45 mm into
  a tab in a test). Ramps now stay at tab height over tabs, like the rest of the path.
- **Checked** with a new test that measures every point along every cutting move (not only move ends,
  which is how these were missed): in all three real projects, every point of every converted profile
  is now between the cutter's radius and 0.02 mm beyond it; tabs stay full height; V-carve, pocket,
  lead and inlay checks unchanged.
- **Regenerate** any profile toolpaths made before this, and re-save their G-code.

### Inlays, a first version (with Design 0.84.0)
- **Inlay (V-bit pocket or plug)** in the toolpath editor creates each half as ordinary toolpaths:
  - **Pocket** (in the base): a V-carve to a flat depth D, and a pocket clearing its floor.
  - **Plug** (in the inlay piece): a mirrored copy of the shapes and a boundary drawn on an "Inlay
    plug" layer beside the design, a V-carve starting S below the surface down to M, and a pocket
    clearing the flats around it.
  - Clearing pockets start with no tool chosen, so G-code can't be saved until an end mill is
    picked. Each clearing stops exactly where the V-bit's cone meets the floor.
- Defaults are the usual starting point: D = 5 mm, S = 2.5 mm, M = 5 mm. The plug seats S deep,
  leaving D − S for glue under it, and stands M − S proud to plane off; the hint says all three.
- V-carving gained a **start depth** (the walls meet the outline that far below the surface).
- **Proved by simulation**: both halves cut as surfaces (the V-bit's cone and the end mill's flat
  bottom stamped along every move), the plug flipped and pushed in until it touches. With a star
  and a ring-with-hole, from Design's own toolpaths: seats 2.449 mm deep (exact 2.5, within the
  0.1 mm grid), walls touching over 12,700 points, glue gap under the face as expected.
- The inlay piece must be **trimmed to its boundary** before gluing, or the uncarved stock around
  it stops the plug seating; the hint says so.
- Work in progress: expect refinement once real inlays are cut.

### Lead-in and lead-out (with Design 0.83.0)
- Inside and outside profiles can **lead** onto and off the line, by an arc (a quarter circle
  tangent to the path) or a line at 45°, from the waste side, so no pass starts or stops on the
  finished wall. With leads on, the path starts mid-way along the longest straight edge, where
  the direction of travel is clear, rather than at a corner.
- Passes that ramp in don't need a lead-in, so roughing passes get the lead-out only; a finishing
  pass, which drops straight in, gets both. Size defaults to the cutter's diameter.
- **Safe in tight spaces**: every point of a lead keeps the cutter its full radius from the part.
  In a hole too small for the full lead it shrinks; where even a small one won't fit (a 6.4 mm hole
  with a 6 mm cutter), it's dropped rather than touching the wall.

### Tabs were wedges (fixed with Design 0.82.0)
- **(machine)** Since tabs were first built, each tab's height was attached to the END of the move
  crossing into it, so the cutter climbed gradually across the tab from full depth: a wedge, full
  thickness at one end and cut right through at the other. Tabbed parts had weaker tabs than set,
  and could break free before the job ended. The cutter now steps straight up at a tab's leading
  edge, crosses at tab height, and steps straight down at the trailing edge. Checked with and
  without ramps, with finishing passes, and in both directions: full tab height across its whole
  length, full depth right up to its edges. Found while testing finishing passes with tabs.
- **Regenerate any tabbed toolpaths** made before this, and re-save their G-code.

### Finishing passes and cutting direction (with Design 0.82.0)
- Profiles (inside and outside) and pockets can **leave** material on the walls during roughing,
  and optionally **finish it** with one pass at full depth, where the cutter is barely loaded and
  the wall comes out cleaner and truer. Without the finishing pass, the allowance is left for
  another toolpath, as VCarve does. Tabs are respected on the finishing pass.
- **Climb or conventional**, chosen in the editor for profiles, pockets and chamfers (climb stays
  the default).
- Checked: roughing passes 3.30 mm from the outline with a 0.3 mm allowance and a 6 mm cutter, the
  finishing pass 3.00 mm; pockets finish with every wall and island at the full cutter radius and
  nothing uncut, for offset rings and raster alike.

### Raster pocket clearing (with Design 0.81.0)
- Pockets can clear by **raster**: parallel back-and-forth lines at a chosen angle, clipped to the
  same exact boundary as the wall pass (so islands and narrow necks behave the same), then a
  climb-milled pass round the walls. Lines link with a short feed move where it stays inside the
  pocket; otherwise the cutter lifts, moves, and ramps back in along the line, never plunging.
  Chosen in the pocket options (Clearing: Offset rings / Raster, with the angle). Converted VCarve
  pockets bring their raster setting across.
- **(machine)** Found while testing it: the check deciding whether a linking move stays inside the
  pocket sampled only 10 points and allowed a sixth of the stepover (0.4 mm here), so a link could
  skim an island by up to 0.1 mm. It now samples every 0.2 mm to the distance map's accuracy.
  This applied to offset-ring pockets too, though their short links hadn't shown it.
- Tested at 0°, 30°, 45° and 90°, with and without islands, on squares, circles and an L: every
  point along every move keeps the full cutter radius from every wall and island, and no
  reachable material is left.

### V-carving (with Design 0.80.2)
- A V-carve toolpath: the V-bit's tip follows each shape's centre-line, deeper where it's wide and
  rising to the surface at sharp points, so the cone's sides just touch the outline. Found as
  F-Engrave does: walking each outline, the largest circle fitting inside the shape at each step
  gives the tip's position and depth. Holes in letters work; corners come out sharp.
- Flat-tipped engraving bits are allowed for; features narrower than the tip stay at the surface.
  An optional max depth gives a flat floor, with a note that the middle needs a clearing pocket.
  Depth passes are supported.
- Warnings: not a V-bit; carving wider than the bit; deeper than the material.
- Tested on shapes with exact answers (a 10 mm bar 8.662 deep against 8.660; a ring with a hole
  5.200 against 5.196; a flat tip exact to 0.004 mm), with no gouging beyond the search's own
  0.01 mm tolerance and nothing left uncovered.
- VCarve's V-carve toolpaths convert: bit angle, tip width and flat depth, reading them from the
  tool's name when it isn't in the library (fixed on the way: a name like "30° SC Engraving 0.005"
  Tip" first read as 60° with a 25 mm tip). Shapes are matched by which one contains the preview.

Profiles, pockets with islands, drilling with peck, chamfers (including VCarve's "vectors at
top"), tabs placed by hand, ramps, material and cut-through, vector checking, uncut-shape check,
reorderable and toggleable toolpaths, and VCarve toolpaths made editable. Verified against VCarve's
own output on the wing button to within 0.02 mm.

Notable fixes found by comparing with VCarve: the ramped stretch of each pass wasn't recut at full
depth, leaving a web on through-cuts; drill feeds were inherited from the profile feed box;
"through" with no thickness set cut only the overcut.
