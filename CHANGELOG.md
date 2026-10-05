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

### 0.6.2-beta.44 — the V-bit flattens the floor its clearing cutter can't reach; faster calculation
- Includes Design 0.130.0 **(cutting)**: a pocket with a stepover over half its cutter no longer leaves a thin
  strip standing down the middle of a channel.
- Includes Design 0.129.0 **(cutting)**: a V-carve with a clearing pocket, and an inlay, flatten the floor the
  clearing cutter can't get to, the way VCarve's V-bit does.
- Includes Design 0.128.0: a V-carve over many shapes, and a pocket with islands, calculate several times faster
  (the tutorial inlay's V-carve in 0.2 s, not 14 s). Not a move is different.

### 0.6.2-beta.43 — inlay plugs keep their start depth; clearing pockets say when they leave floor
- Includes Design 0.127.0 **(cutting)**: updating an inlay plug's V-carve in the editor no longer loses its start
  depth. And the clearing pocket of a V-carve or an inlay says when its cutter can't reach some of the floor,
  and how high that floor is left.

### 0.6.2-beta.42 — VCarve projects: lone lines and arcs, and open shapes
- Includes Design 0.125.0: a lone line or arc in a VCarve project comes across, and open shapes stay open.
- Includes Design 0.126.0 **(cutting)**: VCarve toolpaths made editable get their real depths in projects in
  inches and from newer VCarve, and the project's own cutter and feeds.

### 0.6.2-beta.41 — VCarve text and material
- Includes Design 0.124.0: text in a VCarve project opens where VCarve has it, and a project zeroed at the
  centre of its material opens at its real size.

### 0.6.2-beta.40 — recent files
- **File → Open recent**, in 454 Design: the last ten projects opened or saved, newest first, each with its
  folder. Click one to open it again; Save then goes straight back to it, as after Open. A project is a
  drawing, or a VCarve or Carbide Create file: what Open opens. Files brought in with Import aren't listed.
- A file gets on the list when it's opened (the Open window, or dropped on the window), saved, or saved as.
  Opening or saving one already there moves it to the top.
- **A file that's been moved, renamed or deleted** says so when clicked, and comes off the list. **Clear this
  list** empties it. With none yet, the menu says so.
- The list is kept in the app's data folder (`design-recent.json`), so it's there next time. The page can ask
  for a file to be opened this way only if it's on the list, so it can't name a file of its own choosing.
- Includes Design 0.123.0.
- Asked for by Clint.
- **Tested** (10 tests in `design-files.test.mjs`, 5 in `app-menu.test.mjs`, 5 in Design's `keys.test.mjs`;
  broken on purpose 26 ways: 23 caught, 1 more after fixing a test, and 2 that showed the same check written
  twice, one of which was taken out), and done in the app: opened, reopened from the menu, saved back, deleted.

### 0.6.2-beta.39 — watch the job cut
- Includes Design 0.122.0: Preview in wood plays the job, with Play, Pause and a slider.

### 0.6.2-beta.38 — checks for updates every 6 hours
- **The app checks for updates every 6 hours while it's open,** not every 30 minutes. The short gap was for
  testing betas with one person; with more people trying it, that's more asking of GitHub than is needed. It
  still checks 30 seconds after starting, and **Help → Check for updates…** checks straight away.
- **Tested** (the updater's test now expects 6 hours; with the old 30 minutes put back, it fails).

### 0.6.2-beta.37 — fixes from testing
- Includes Design 0.119.1: New starts with one sheet.
- Includes Design 0.120.0: Open and Import are separate, the File buttons have usual icons, and View & History's
  buttons are in File. The File menu has Import….
- Includes Design 0.121.0: the left panel folds away for more drawing room.
- Includes Design 0.120.2: a toolpath hidden and shown again shows its tabs.
- Includes Design 0.120.1: Trim works on rectangles, a group's shapes count as crossings, and trimming a closed
  shape no longer sometimes removes the wrong piece.

### 0.6.2-beta.36 — a File menu, and see every pass
- **The menu bar is the usual one: File, Edit, View, Window, Help.** There was no File menu: one "454
  Workshop" menu held the two apps, the docs, problem reports, About, updates, Close and Quit.
  - **File** follows the window in front. In 454 Design: New, Open…, Save, Save As…, Recover last drawing;
    Export DXF…, Export SVG…, Save G-code…; Job setup…, Settings…. In 454 Control: Open G-code file…,
    Settings…. Close window and Exit are at the bottom of both.
  - **Window** switches between 454 Design and 454 Control (still Ctrl+2 and Ctrl+1) and ticks the one in
    front.
  - **Help** has Help (F1), Docs, Report a problem…, Check for updates… and the Updates choices, and About
    454 Workshop.
  - **A menu item does what its button does.** The menu asks the page (`menuDo`, in each app), which presses
    the same button or calls the same function the keys do, and does nothing while a dialog or the help has
    the screen. The keys beside File's items are shown but left to the page, so Ctrl+S still follows the
    page's own rules and can't run twice.
  - The menu's layout is in `apps/desktop/src/app-menu.js`, with no Electron in it, so it's tested (10 tests);
    the pages' side is tested in each app (6 tests). Broken on purpose 32 ways, all caught, and tried in the
    real app: both File menus, a real Ctrl+N reaching the page once, and Help over an open dialog. A test
    caught the docs' front page being taken for 454 Control, which would have given the docs window
    Control's File menu.
- Includes Design 0.119.0: the toolpath editor lists every pass and its depth, and the number of passes can
  be typed; and the engine no longer cuts the final depth twice for some inch sizes.

### 0.6.2-beta.35 — a tidier Toolpaths panel
- Includes Design 0.118.0: the previews, the job sheet and the template buttons are a row of icons at the top
  of the Toolpaths panel.

### 0.6.2-beta.34 — an ⓘ beside each section, in both apps
- Includes Design 0.117.0: info icons on Design's section headings, with a tip on hover and the help window
  on click.
- Includes Control 0.31.23: Control's ⓘ buttons do the same, and what they used to say is now in the
  Control reference.

### 0.6.2-beta.33 — help inside the app; pictures in the toolpath editor's help
- Includes Design 0.116.1: the eye on a toolpath's card hides and shows it on the drawing; it didn't before.
- Includes Design 0.116.0 and Control 0.31.22: help inside the app. F1 opens the guides in a window over
  what you're doing, with search.
- Includes Design 0.115.1: small pictures in the toolpath editor's help, for every kind of cut and for
  Stepover, Ramp in, Lead in/out and Tabs.

### 0.6.2-beta.32 — name your toolpaths
- Includes Design 0.115.0: toolpaths can be named, their cards fold to the title, and the toolpath editor
  takes over the Toolpaths panel, with headings and help for every setting.

### 0.6.2-beta.31 — open Carbide Create projects
- Includes Design 0.114.0: `.c2d` files open, with their shapes, layers and material. The Open window lists
  `.c2d` files.
- Includes Control 0.31.21: a Z nudge ends with its job, quick presses leave the newest nudge on, and
  **Keep for the next job** carries the Adjust panel's settings over when you want that.

### 0.6.2-beta.30 — add sheets to a project
- Includes Design 0.113.0: sheets can be added, renamed and deleted, each with its own shapes, toolpaths and
  G-code; and only the shown sheet's toolpaths are drawn.

### 0.6.2-beta.29 — "Job setup", not "Settings"; a button that did nothing
- Includes Design 0.112.1: messages say the material's thickness is set in Job setup, where it is, and the
  "Set the material thickness first" window's button opens it (it did nothing before).
- **Releases now carry notes**, a few plain lines, so **Update available** has something to show when it's
  clicked. They were empty. The same lines are kept on the docs' new **What's new** page.

### 0.6.2-beta.28 — parameters; cutting past the material is always said
- Includes Design 0.111.0 and 0.112.0: parameters (the fx button) used in dimensions and in toolpath depths and
  tabs; arithmetic in every length box; and a warning, wherever it's seen and before saving, for any toolpath
  that goes past the bottom of the material.

### 0.6.2-beta.27 — a beta copy gets the next beta
- **A beta version starts on the Beta update channel.** Every copy used to start on Stable, and while every
  release is a pre-release, Stable offers nothing: someone who installed a beta would never have been offered
  the next one unless they found **Updates → Beta** in the menu. Now a copy whose version is a beta (like
  0.6.2-beta.27) starts on Beta, and a stable version on Stable. A channel chosen in the menu is kept.
  Copies that already saved a channel keep it: if you're a tester on Stable, switch to Beta once.
- Tested (the channel for beta and stable copies, a chosen channel kept, and kept after saving other
  settings); checked by breaking it on purpose (2 ways).

### 0.6.2-beta.26 — one file per bit, templates, start points
- Includes Design 0.108.0 to 0.110.0: Save G-code can save one file per bit; toolpath templates (Save template…,
  Apply template…, matched by layer name); Set start chooses where a profile's cut begins. Also fixes the toolpath
  editor showing Clean up after for every kind of toolpath.

### 0.6.2-beta.25 — tabs as long as you ask
- Includes Design 0.107.0: a tab's Length is the wood it leaves, whatever the bit (a 4 mm tab with a 1/4" bit
  used to leave two slivers); new toolpaths start with the tabs you used last, 1.5 mm thick the first time.
  And Design 0.106.1: tabs and nearly-cut-through wood show in amber in Preview in wood.

### 0.6.2-beta.24 — Preview in wood, in 3D
- Includes Design 0.106.0: Preview in wood is a 3D view you can turn, move and zoom, using the app's own copy of
  three.js, so it works offline. Problem reports from the menu arrive labelled `bug`.

### 0.6.2-beta.23 — Control starts again; report a problem
- **Control starts again** (Control 0.31.20): beta.20 to beta.22 shipped a Control that wouldn't open.
- **Report a problem…** in the 454 Workshop menu opens a form on GitHub (`.github/ISSUE_TEMPLATE/problem.yml`) with
  this build's version and the computer already filled in (`src/report.js`). The form asks, in plain words, which part,
  whether the machine moved or cut in a way it shouldn't (those come first), what happened, how to make it happen
  again, the machine, and files. There's a form for ideas too; blank issues are off, so every report has these.

### 0.6.2-beta.22 — the VCarve group: shapes, sizes, curved text, a wood preview, pocket clean-up
- Includes Design 0.100.0 to 0.105.0: Weld, Subtract and Intersect; the Ellipse, Polygon and Star tools; the
  Selection box (exact position, size and rotation); text on a curve; Preview in wood; and pockets that clean
  up after a larger bit.

### 0.6.2-beta.21 — Save back to the file; tools named at tool changes
- **Design's files are opened and saved by path** (src/design-files.js), so Save goes back to the file a
  drawing came from, even after a restart. Includes Design 0.99.3 (that, and Save as) and 0.99.2 (its G-code
  names each tool number, so Control's tool-change prompt says which bit to put in).

### 0.6.2-beta.20 — three fixes from testing
- Includes Control 0.31.19 (a job that starts with a tool change goes straight to it) and Design 0.99.1
  (ramped profiles without the back-and-forth; an opened drawing's toolpaths show straight away).

### 0.6.2-beta.19 — the usual keyboard shortcuts
- **Ctrl+W closes the window and Ctrl+Q quits**, through each window's own check (Control asks while the
  machine is busy; Design, about an unsaved drawing). Includes Control 0.31.18 and Design 0.99.0 (Ctrl+S,
  Ctrl+Shift+S, Ctrl+O, Ctrl+N, Ctrl+A, Ctrl+D, F1, and Ctrl+Shift+Z redoing). The docs have a new
  **Keyboard shortcuts** page listing every one.

### 0.6.2-beta.18 — Ramp in
- **Profiles and pockets: Ramp in, Ramp or Plunge, and how far** (see Design 0.98.0). Includes Design 0.98.0.

### 0.6.2-beta.17 — copy and paste
- **Copy, cut and paste shapes in Design, with their dimensions** (see Design 0.97.0). Includes Design 0.97.0.

### 0.6.2-beta.16 — the light theme, readable
- **The light theme's fixes, in the app:** the value box you type into in Design (it was black text in a
  black box), shapes drawn dark enough to see, and Control's Fit button, legend and run bar. Also the
  Settings panel that fits its text. Includes Control 0.31.17 and Design 0.96.2.

### 0.6.2-beta.15 — save the drawing before closing?
- **Closing 454 Design with a drawing that isn't saved to a file asks: Save…, Don't save, or Cancel.**
  Design keeps the drawing as you work, so it's there next time, but that isn't a file, and nothing said so.
  Now closing the window asks, and so do quitting 454 Workshop and **Restart to update**. **Save…** opens
  Design's Save As; cancelling that keeps the window open. **Don't save** puts the drawing aside (see Design
  0.96.0): Design opens empty next time, and File → Recover last drawing brings it back. **Cancel** keeps
  everything open, and stops a quit or a restart to update.
- Tested in the real app: Don't save, then reopening (empty, and Recover brought the drawing back), Cancel
  (the window stayed open), Save (saved, closed, and not asked again), and quitting with Don't save and with
  Cancel.
- Includes Design 0.96.0.

- **No changes to the app.** A release to see the new update notice working for real: copies on beta.13
  are offered it in the header. Also the first release whose tag is made after the fix below, so publishing
  it should build nothing.

### Publishing a release no longer rebuilds it
- **Fixed: publishing a draft started a second Windows build of the same version.** Publishing creates the
  release's tag, and the Windows build ran for every new tag: it rebuilt the version and went to draft a
  release over the one just published (caught and cancelled for beta.12). Now a tag whose release is
  already published builds nothing, and says so. A tag pushed by hand, with no release yet, builds as before.

### 0.6.2-beta.13 — updates show in the header
- **A new version shows as a notice in the header of 454 Control and 454 Design, not a window.** Before,
  a background check that found an update asked about it in a window, and asked again when the download
  finished. Both waited until the machine was idle, but a window still got in the way of whatever you were
  doing. Now a notice appears beside Docs, and nothing happens until you click it: **Update available**
  (what's new, **Download** or **Skip this version**), then **Downloading update** with how far it has
  got, then **Restart to update** (**Restart now**, or leave it and it installs when you next close the
  app). The same notice shows in both windows. It's shown only in the desktop app, never on the website.
- **(machine)** **Restart to update is refused while the machine is busy**, however it's reached: the
  notice turns grey and **Restart now** can't be pressed during a job, probe, jog or quick action, with the
  spindle on, or with the machine moving. The app checks again when it's pressed, so a job that starts
  just before is never cut off. Restarting disconnects the machine, and the notice says so.
- **A download that fails shows in the notice** (**Update didn't download**, with why and **Try again**)
  instead of a window, which could otherwise have popped up in the middle of a job.
- **The Windows notification when a download finished is gone**: the notice replaces it.
- **Check for updates…** in the menu still answers in a window, since you asked. What it finds shows in
  the notice as well.
- Changing channel clears an update found on the other one; a newer check that finds nothing clears the
  notice.
- Tested: the updater's decisions (28 tests), and the notice in each page's real header (22 tests,
  including release notes shown as text, never as page code). Each test was checked by breaking the code
  it covers. Also run in the real app against a local update server: the notice appeared in Design and
  Control, counted the download from 0 to 100%, became Restart to update, and with the machine reported
  busy, refused to restart and turned grey.
- Includes Control 0.31.16 and Design 0.95.1, which carry the notice.

### 0.6.2-beta.12 — tags wait for their releases
- **Fixed: installed copies couldn't see a new release while a newer draft was waiting.** The workflow
  created each version's tag when its build started, but its release stayed a draft until published.
  Installed copies find updates through GitHub's release feed, which lists every tag, so they took the
  newest tag (beta.11, a draft) as the newest release, found nothing in it, and stopped, never seeing the
  published beta.9. Now the workflow creates no tag: the draft records its commit, and GitHub makes the tag
  when the draft is published, so a tag never appears without its files. Pushing again while a draft
  waits builds nothing, and says so. Tested in each case against a scratch repository.

### 0.6.2-beta.11
- **Checks for updates every 30 minutes** while open (30 seconds after starting, then every half hour), for
  now, while beta releases come often. To change back to every 6 hours before the first public release:
  `CHECK_EVERY` in `apps/desktop/src/updater.js` (marked TODO), its test, and the docs' "The desktop app"
  page. DEVELOPING.md lists it under releasing.

### 0.6.2-beta.10
- **Check for updates… with nothing to install says "There are no new updates available."**, and nothing
  else. That now includes a newest release that can't be installed (published without its update files, as
  happens when a release is made by hand rather than by publishing the Windows build's draft) and no
  published release for the channel: before, both showed a "Couldn't check for updates" error. Real
  problems still show as errors: no connection, GitHub limiting requests, or a download that failed.

### 0.6.2-beta.5 to beta.9 — releases tag themselves
- **A new version in `apps/desktop/package.json`, pushed to main, is tagged, built and drafted as a
  release**: no separate tag step. A change that keeps the version builds nothing; pushing a tag by hand
  still works; a version with a suffix is a pre-release. (A workflow can't start another workflow with a tag
  it creates, so the Windows workflow does both: a first job decides the tag, and creates it.) Tested in
  each case against a scratch repository.
- beta.6 includes Control 0.31.15 and Design 0.93.0; beta.7, Design 0.94.0; beta.8, Design 0.94.1 (the tab fix); beta.9, Design 0.95.0 (3D tabs).

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

### Sheets (2026-10-01)
- **Design workspace** has a Sheets section, with a picture of the Sheet bar; the CAM reference's note on
  multi-sheet VCarve projects points to it. Every screenshot retaken, since the Toolpaths panel now always
  shows the Sheet bar (11 changed).

### What's new; pictures of the newest features (2026-10-01)
- **A What's new page**: each version's changes in a few plain lines, newest first, from beta.22, with changes
  that affect cutting marked. The change log here is long and detailed; this is the version for people cutting.
- **Four new screenshots**, made by the screenshot script like the rest: the Parameters list beside a
  dimensioned drawing, toolpath cards with a depth from a parameter and a depth warning, the "Cutting past the
  material" window, and a profile's chosen start point.
- **The Design quick start** has a short section on parameters. **Before you start** says to set the
  material's thickness from a measurement, and what the depth warning does and doesn't cover.

- **The desktop app page** points to the front page's Download button, names the installer file to pick from
  a release's Assets, and says a beta version starts on the Beta update channel.

### Every screenshot retaken (2026-09-29)
- **All 41 screenshots now match the current apps.** Several were out of date: Control's start dialog still
  said "a G4 P10 s dwell after each M3" (it's now a 7 s wait after every M3 or M4), the toolpath editor had no
  tab **Shape** row, Design's Settings had no Drawing section, and the File group had no Recover button. The
  text is in the apps' own typefaces now, where older shots showed a stand-in font.
- **Screenshots can be taken on Windows.** `npm run shots` set each window's size, and Windows shrinks a window
  to fit the screen: at twice the resolution most shots are taller than a 1080-pixel screen, so they came out
  cut short. The page is now laid out at the shot's size by Chromium's device emulation instead, whatever the
  screen (`docs-site/scripts/shots-electron.cjs`).

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
- **Easier for search engines to find and describe** (nothing changes in the apps):
  - The front page's title and description use the words people search with: free, CNC, CAD/CAM, G-code
    sender, Shapeoko, GRBL. Its text names them too: design (CAD), toolpath (CAM), a G-code sender for GRBL,
    Carbide Create projects, and Preview in wood.
  - The front page says it's software, free, for Windows and the browser, in the form search engines read
    (schema.org `SoftwareApplication`), and names its own address (a canonical link).
  - **454 Workshop** at the top is the page's one main heading again (`h1`), at the size it was set to.
  - A **sitemap** (`/sitemap.xml`) lists the front page, Design, Control and every docs page, and
    **`robots.txt`** points to it. The build checks every address in it is a page that's served.
  - Design's and Control's pages on the website have descriptions, and cards for when they're shared.
  - **Fixed: the docs named two addresses for each page.** Each page gave its own address with `.html`, which
    the website sends on to the one without. They now name the one that's served.
- **Download for Windows** on the front page: straight to the newest release's installer, with its version
  and size, found on GitHub when the page opens (GitHub's own "latest release" link skips betas, and every
  release is a beta for now). If GitHub can't be reached, it opens the Releases page. With it, what to do
  about Windows' unrecognised-publisher warning, and a link to installing and updating. The front page no
  longer says there's a Linux version: there isn't one yet.
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

### 0.31.24 — the desktop app's File and Help menus
- 454 Control answers the desktop app's new menus (`menuDo`): File → Open G-code file… and Settings… press
  their buttons (Open still refuses while a job runs), and Help opens the help. Nothing happens while Control
  is asking something (a dialog, the tool-change prompt, homing or connecting) or the help is open.

### 0.31.23 — the ⓘ icons show a tip and open the guides
- **Control's 19 ⓘ buttons now work the way Design's do.** Rest the pointer on one, or tab to it, for a tip
  of a sentence or two; click it and the help window opens at that section of the guides. Before, each
  opened a small box of text of its own.
- **Nothing that those boxes said is lost.** Seven were already covered by the guides. The twelve about
  Settings said more than the guides did, so each is now a section of the Control reference: Work area, Job
  zero, Stock thickness, Time estimate, Controller config, BitSetter, BitZero, Spindle type and spin-up,
  Start and stop high, Traverse height, Tool-change and end-of-job positions, Jog speeds. The app's own copy
  of the text (`HELP_TEXT`) is removed: the guides are the one set of words.
- **The BitZero section says to measure your own plate** (a v2 is about 15.5 mm), where the old box said only
  to measure it.
- **Fixed: the icons on the Machine tab couldn't be clicked before connecting.** That part of the screen is
  switched off until a machine is connected, and the icons were switched off with it, which is when help
  is wanted most. They work there now.
- The list is `HELP_ICONS` in `apps/control/src/js/help-where.js`; each place in the page is a
  `<span class="helpAt" data-k="...">`. The docs' build checks all 19 places exist in the guides.
- **Tested** (`apps/control/test/help.test.mjs`, 8 tests, Control's real page in a stand-in browser; broken
  on purpose 15 ways, all caught), and tried in the app with a real pointer on the Machine tab and on
  each tab of Settings.

### 0.31.22 — help inside the app
- **F1, or Help in the header, opens the guides in a window over 454 Control,** with a search box, instead of
  a separate window. It opens at what you're doing: connecting, loading a file, setting zero (with the jog
  panel or the BitZero window open), settings, or running a job. Control's own guides come first in a search.
- **(machine) While help is open, key presses don't reach Control,** so the jog keys can't move the machine
  from behind it. Key releases always do: a jog key held down when help opened still stops when it's let go.
- The Docs link is unchanged: it still opens the guides in their own window.

### 0.31.21 — a Z nudge ends with its job, unless you keep it
- **(machine) Fixed: a Z nudge from the Adjust panel stayed on after the job finished.** The nudge is held in
  the controller as part of the tool length offset, and nothing took it off at the end. The next job started
  with the Adjust panel reading Z +0.00 and the controller still shifted: nudge up 1 mm in one job, and the
  next cut 1 mm shallow; nudge down, and the next cut too deep. Setting Z zero again cleared it, which is why
  it could go unnoticed. Now the nudge comes off when the job finishes, and the log says so. If a job ends
  some other way (an alarm, a failed probe), it comes off before the next job or a resume is offered. The
  tool's own offset from the BitSetter is kept.
- **(machine) Fixed: nudge buttons pressed quickly could leave the wrong nudge in force.** On long cuts the
  controller's buffer is full, so a nudge waits its turn. Each new press was put in front of the ones already
  waiting, so they were sent newest first, and the oldest was the one left on, while the panel showed the
  newest total. Now a press replaces the nudge that is still waiting, so one line goes, with the newest total.
  Found on the machine: a square set 0.25 in deep came out 0.21 in, 1 mm shallow, after a nudge in the job
  before it.
- **(machine) Keep for the next job**, a tick box in the Adjust panel, off whenever Control opens. Off, every
  job starts with feed, spindle and rapid at 100% and no nudge, as before. On, the nudge stays when the job
  finishes, and the next job (or a resume) starts with the last job's feed, spindle, rapid and nudge. Because
  the Adjust panel can't be reached between jobs, starting a job with anything kept asks first, listing it:
  **Keep them**, **Back to normal** (which also takes the tick off) or Cancel. The Start window lists what
  was kept as well.
  - The percentages have to be put back, because a file's M2 or M30 sets them to 100% in the controller.
    Control remembers what the controller reported during the job and steps back to it, one step for each
    report: the controller notes that a step was asked for, not how many, so steps sent together count as one.
    It starts before the Start window, while the machine is idle. A press by hand stops it.
  - A kept nudge is sent again before the job, since a reset (End job, the red STOP) drops it.
- **The Adjust row keeps each label with its buttons** when it wraps onto more lines.
- **Tested** (`apps/control/test/z-nudge.test.mjs`, 28 tests): Control's own job code runs against a stand-in
  machine that records every line sent and steps its percentages the way GRBL does. Checked by breaking the
  code 45 ways; every one was caught. A job's start runs here as far as the question; past it, and for a
  resume, the test reads the source for the calls. Not yet run on a machine.

### 0.31.20 — Control starts again
- **Fixed: 454 Control didn't start at all in 0.31.19** (desktop beta.20 to beta.22). A message added in 0.31.19,
  for a job that starts with a tool change, had a line break in the middle of its text, which JavaScript can't
  read, so the whole page stopped before it began. It failed safe (nothing could move the machine), but nothing
  else worked either. The unit tests load only some of Control's files, so they didn't notice; it was found
  while retaking the docs' screenshots.
- **A new test reads every script in both pages as built** (`apps/control/test/pages-parse.test.mjs`), so a page
  that can't start can't pass the tests again. Checked: it fails on 0.31.19's page and passes now.

### 0.31.19 — straight to the tool change
- **(machine) Fixed: a job that starts with a tool change went to the first cut, then to the tool change.**
  "Start & stop high" travelled high to the file's first cut before anything else, even when the file's first
  line is a tool change (T1 M6), so the machine crossed the work and came straight back to the tool-change
  position. Now, when the file changes tools before it moves, the job goes to the tool change first: it
  lifts to the top and goes to the tool-change position, or, with none set, changes tools where the spindle
  is. After the change it travels high to the first cut, as it always has. Files that cut before their first
  tool change start as before (checked on 40 files side by side). The start dialog says which it will do.

### 0.31.18 — Ctrl+O and F1
- **Ctrl+O opens a G-code file** (refused while a job is running, as the Open button is), and **F1** opens the
  docs. Nothing on the keyboard outside the jog panel moves the machine. Checked in the desktop app.

### 0.31.17 — the light theme, readable
- **Fixed: on the light theme, parts of the 3D view were dark boxes.** The **Fit** button, the colour
  legend and the bar over the view while running (STOP, the state, X Y Z, Jog & zero) had dark backgrounds
  written in, so on the light theme their text (the position, in the run bar) was dark on dark. They now take
  the theme's panel colour. So do the Code tab's highlighted line and a chosen toolpath's card, which were a
  dark brown.

### 0.31.16 — the update notice
- In the desktop app, a notice in the header when there's a new version of 454 Workshop (see the desktop
  app's 0.6.2-beta.13). Nothing changes on the website.

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

### 0.130.0 — a pocket with a wide stepover no longer leaves a strip down the middle of a channel (cutting)
- **What was wrong:** a pocket is cleared in rings, each a stepover further in than the last, and each ring clears
  a cutter's radius either side of itself. With a stepover of more than half the cutter (over 50%), the rings
  from the two sides of a channel could fail to meet: the channel's middle was more than a radius past one ring,
  but not far enough in for the next ring to exist there. A strip was left standing down the middle, a fraction of
  a millimetre wide and the full depth of the pocket. A 6 mm cutter at 60% in a channel 12.6 mm wide left one
  0.6 mm wide. Found by cutting a VCarve tutorial's inlay in the simulation beside VCarve's own G-code: six such
  strips, 19 mm² in all.
- **454's own default, 40%, can't do this,** nor can any stepover of 50% or less: the next ring in is never more
  than a radius on. It took a stepover typed above 50%, or a VCarve project's (60% there).
- **Now the middle is cut** (`pocket()` in `cam.js`, MIDDLES). After the rings are worked out, wherever a ring has
  no next ring within half a radius to do the job, a stretch of ring 0.9 of a radius further in is added. It's
  cut first at each pass, ramped into like any other, nearest stretch next. Raster clearing and clean-ups after a
  larger bit don't need it and don't get it.
- **Pockets at 50% or less are, move for move, what they were:** proven old against new on 240 random jobs.
- **Tested** (5 tests in `pocket-middles.test.mjs`): cut in Preview in wood's simulation at 60% and 95%, for
  channels of eight widths, a wedge (every width from 8 to 26 mm) and a pocket with two islands, each must come
  out the same, cell for cell, as the same pocket at 40%: nothing left standing, nothing extra cut, no rapid move
  into wood; and in passes with a ramp, nothing goes below a pass's depth before that pass. Broken on purpose 8
  ways: all caught.
- **Against VCarve's G-code for that inlay:** the strips are gone, and the wood cut is 99.7% the same within
  0.1 mm.

### 0.129.0 — the V-bit flattens the floor its clearing cutter can't reach (cutting)
- **What was wrong:** a V-carve with a max depth, and both halves of an inlay, are cut by an end mill that clears
  the flat floor and a V-bit that cuts the walls. The end mill is round: it can't get into the floor's corners, or
  into any part of the floor narrower than itself. 454's V-bit only ran its point round the floor's edge, so that
  floor was left standing, up to full height, and an inlay sat on it instead of seating. 0.127.0 said so in a
  note. VCarve's V-bit goes back and flattens it.
- **Now 454's does too** (`vcarve({clear})` in `cam.js`). After the walls, the tip goes straight down to the
  floor's depth at each place the clearing cutter missed, and runs lines there that follow the walls, 0.127 mm
  (0.005 in) apart, or as far apart as a VCarve project's V-bit says (`tp.vcStep`). Nearest place next, so one
  is finished before it moves on. Clint chose VCarve's way of going to depth: in one go, not in passes.
- **What's left:** a pointed tip leaves ridges between its lines: 0.11 mm high with a 60° bit, 0.24 mm with a
  30° one, at 0.127 mm apart. Up to a fifth more on the line into a square corner, where the lines turn. Down the
  middle of a narrow part, where the lines from the two sides meet, an extra line is added so the ridge there is
  no higher.
- **Nothing but floor is cut.** Every one of these moves, lines and the links between them, keeps the tip at
  least as far from every wall as the floor's edge is, so the cone never touches a wall. The walls' own passes
  are not changed by a single move.
- **Who gets it:** a V-carve whose clearing pocket was added with it; an inlay made from this version on (its two
  toolpaths have been linked since 0.127.0); and inlay toolpaths made editable from a VCarve project. A V-carve
  with no clearing pocket is carved exactly as before. Inlays made earlier aren't linked: make them again.
- **It follows the clearing pocket:** choose another cutter for the pocket and the V-carve is worked out again
  (it's part of what makes a V-carve out of date). The V-carve's card says **Floor: also flattens what "…" can't
  reach**. The floor step is kept through the editor, which has no box for it.
- **The note from 0.127.0 is gone**, with the pocket's `floorCheck` behind it: there is nothing left high to
  report.
- **Against VCarve's own G-code** for a tutorial inlay (a panel of 24 shapes, 3/16 in clearing cutter, 30° bit),
  both cut in Preview in wood's simulation: 99.7% of the panel is the same within 0.1 mm (94.8% before), and
  Design is never deeper than the floor. Before, about 2,900 mm² of floor was left high; now none is, apart
  from 19 mm² in six thin strips that the clearing pocket leaves and VCarve's doesn't (see below).
- **Found, and fixed in 0.130.0:** a pocket with a stepover over half its cutter's diameter can leave a strip a
  fraction of a millimetre wide standing down the middle of a channel.
- **Tested** (14 tests in `vcarve-floor.test.mjs`, and more in `vcarve-pair.test.mjs` and
  `vcarve-convert.test.mjs`; broken on purpose 21 ways: 16 caught, 2 more after adding a test for each, and 3 that
  make no difference, because a V-carve that's out of date is worked out again when the list is shown): cut in the simulation after the clearing pocket, for a square, a narrow neck, a
  shape with a star-shaped island, and an inlay plug: no floor stands higher than a ridge, nothing is cut deeper
  than the floor or nearer a wall than the cone's slope, nothing outside the shape is touched, and no rapid move
  enters wood.

### 0.128.0 — V-carves and pockets with islands calculate much faster; the toolpaths are the same
- **What was slow:** a real inlay project (a panel with 24 shapes, from a VCarve tutorial) froze the app for
  about half a minute when its toolpaths were calculated: 14 s for the V-carve and 13 s for its clearing pockets.
- **Why:** the engine keeps asking one question: is any outline nearer to this spot than so far? It asks every
  outline, millions of times. For an outline that was further off than that, it had the answer after measuring
  to its segments, and then went on to work out exactly how much further, walking outwards cell by cell through
  that outline's lookup grid. Nothing that asks the question with a limit uses that number.
- **Now it stops as soon as it knows nothing is within the limit** (`pathIndex`'s `dist`, in `geom.js`: two
  early ways out). The tutorial's V-carve takes 0.2 s and its pockets 3 s.
- **Not a move is different.** Proven old against new: the tutorial's own 15 engine calls, 240 random jobs
  (pockets with islands, raster, clean-ups and allowances; V-carves with and without a max depth, a start depth
  and a flat tip; profiles with tabs; offsets), and 100 more on shapes of several hundred points each. Every
  result was the same, character for character. All of Design's tests pass.
- **A correction to what was said before:** the times first measured for that project (87 s and 61 s) were taken
  inside the test harness, which runs the engine about seven times slower than the app does. The app's real
  times were the 13 s and 14 s above.

### 0.127.0 — inlay plugs keep their start depth through the editor (cutting); clearing pockets say when they leave floor
- **Fixed (cutting): updating an inlay plug's V-carve lost its start depth.** A plug's walls begin at the start
  depth (2.5 mm, say), which is what makes it wedge into the pocket. The toolpath editor has no box for it, and
  on Update it handed the toolpath back without it: change the feed, press Update, and the walls began at the
  surface instead. With a 60° bit and a 2.5 mm start depth the plug came out 1.4 mm smaller all round, and loose.
  The same happened to a V-carve with a start depth from a VCarve project. Update now keeps it: not a move
  changes. **If you've edited an inlay plug's V-carve, open it and check, or make the inlay again.** Found while
  testing the note below.
- **Fixed: choosing a clearing pocket's cutter unlinked it from its V-carve.** A V-carve with a max depth gets a
  clearing pocket that follows it. Opening that pocket to choose its end mill, as the message says to, dropped
  the link: changing the V-carve's max depth afterwards left the old pocket as it was and added a second one.
  The link is kept now, and the one pocket follows, keeping its cutter.
- **An inlay's two toolpaths are linked the same way** (new inlays; ones made before aren't), so changing an
  inlay's V-carve keeps its clearing pocket in step. For a plug the pocket stands off the walls by what the V-bit
  cuts from the start depth down, (plug depth − start depth) × tan(half angle), as it did when made.

**The note:**
- **What was wrong:** a V-carve with a max depth, and both halves of an inlay, are cut by two toolpaths: an end
  mill clears the flat floor, and the V-bit cuts the sloping walls, running its point round the floor's edge. The
  end mill is round, so it can't get into the floor's corners, or into any part of the floor narrower than
  itself. The V-bit goes no further in than the floor's edge, so that floor is simply left: it slopes up from the
  edge at the V-bit's angle. Nothing said so. With a 6 mm cutter and a 60° bit, a square corner is left about
  1.5 mm high; a part too narrow for the cutter is left at full height. An inlay doesn't seat on that. (VCarve's
  V-bit goes back and flattens those places. 454's doesn't yet.)
- **Now the clearing pocket says so:** "this cutter can't get into some corners or narrow parts, and the floor
  there is left up to 1.47 mm high. The V-bit doesn't flatten it: use a smaller cutter here, or pare it flat by
  hand before fitting an inlay." It's on the toolpath's card (with its ⚠), in the editor's hint as you change
  the cutter, on the job sheet, and in the list when toolpaths are recalculated. It doesn't stop G-code being saved.
- **How it's measured:** the engine's pocket (`floorCheck`, in `cam.js`) already has a map of how far every spot
  is from the walls. The floor is everything at least the allowance in; the cutter clears everything within its
  radius of where its centre can go. What's neither is left, and the furthest of it in from the floor's edge,
  divided by the tangent of half the V-bit's angle, is how high it stands (never more than the pocket's depth).
  It's read a little low, never high: by under a tenth of a millimetre in from the edge. Under 0.1 mm high, or
  0.25 mm² in all, isn't mentioned.
- **Nothing about the cutting changed:** no toolpath moves differently. Only a V-carve's clearing pocket is
  measured; other pockets aren't, and take no longer.
- **Shown for** a V-carve's clearing pocket and a new inlay's, and for inlay toolpaths from a VCarve project.
- **Tested** (5 tests in `vcarve-pair.test.mjs` for the editor fixes, each failing before its fix; broken on
  purpose 6 ways, all caught. 8 tests in `floor-left.test.mjs`): what the engine says is held against Preview in wood's
  simulation of the pocket and the V-carve cut one after the other, for a square (four corners), a shape with a
  neck too narrow for the cutter, and a circle (nothing left, nothing said). Broken on purpose 10 ways: 9 caught;
  the tenth (measuring every pocket, not only clearing ones) changes nothing but the time taken.

### 0.126.0 — VCarve toolpaths made editable: real depths, and the project's own cutter and feeds (cutting)
- **Fixed: in a project in inches, toolpaths came across with their depths taken as millimetres.** A project
  keeps its toolpaths' lengths in its own units, and says which. The drawing was converted to millimetres;
  the toolpaths' numbers weren't. A 0.26 in through-cut became a cut 0.26 mm deep. Depth, allowance, pass
  depth, ramp length and a V-carve's flat depth are converted now (tabs already were).
- **Fixed: a pocket from newer VCarve came across 3 mm deep, whatever its depth.** Newer VCarve keeps a
  pocket's settings under another name, so its depth wasn't found, and 3 mm was used in its place without a
  word: pockets of 0.25 in and 0.125 in both came across at 3 mm, and a 0.01 in skim would have been cut
  twelve times too deep. Those settings are read now, with the pocket's ramp.
- **A depth is never made up.** If a toolpath's depth can't be read from the project, the toolpath isn't
  converted, and 454 says which, and to make it again here.
- **The cutter and feeds are the project's own.** Each toolpath in a project records its tool: diameter, pass
  depth, stepover, feed and plunge, in the tool's own units. They're read now, and used first: the diameter
  (it was guessed from the tool's name, and 1/8 in used when the name didn't say: a 3/16 in cutter named
  `UC2875 - Upcut - 3/16"x 3/4"` came across as 1/8 in), the feed and plunge (they came from the tool library,
  or 800 and 300 mm/min without one), and a pocket's stepover (it was 40%). If the diameter can't be told at
  all, 454 uses 1/8 in and says to check the cutter.
- **Checked against VCarve's own G-code** for a tutorial project's skim pocket: depth 0.254 mm, a 3/16 in
  cutter, 2032 and 1016 mm/min, passes up and down 2.858 mm apart, a 12.7 mm ramp, over the same size of
  area. 454's toolpath has each of those.
- **On five of Clint's projects,** old conversion against new: the two in inches get their real depths (6.35
  and 3.175 mm for 3 and 3; 6.604 mm for 0.26); in the three in mm, depths, passes and shapes are as they
  were, feeds are the project's, and a 1/4 in V-bit is 6.35 mm where it was 3.175.
- **A toolpath comes across once, under its own name.** A project's toolpath starts with its name, and its
  settings hold the name it had when it was last calculated, which a rename since leaves behind. Each
  differing name was taken for a toolpath: the tutorial's five came across as nine, one of them under
  another's old name.
- **A V-carve inlay comes across as one**: a V-carve cut with a second tool clearing its floor is two toolpaths
  in VCarve, and now two here, paired: the V-carve, starting below the surface if it does, with its floor at
  the start depth and the flat depth together; and a clearing pocket to that floor, standing off the outline
  by as far as the V-bit's cone reaches there. The pocket goes down in passes no deeper than its tool's own.
  (VCarve's own G-code for a carve starting 0.23 in down with a 0.1 in flat depth goes to 0.33 in; and the
  clearing's area in that G-code is 454's within 0.01 mm.)
- **The V-bit's angle is read from the project.** The tutorial's bit is named `30 Deg V-Groove`: no degree
  sign, so its angle came out as 60, which carves to the wrong depth. The project keeps the bit's radius and
  the height of its cone, and the angle is worked out from those. If it can't be told at all, 454 uses 60 and
  says to check the bit.
- **Toolpaths find their shapes in groups and text.** A toolpath names what it cuts by ID, and that can be a
  group's or a block of text's. Every shape, block of text and group in a project starts with a header
  carrying its ID (`crvObjects`); a group's children follow it. So a toolpath that names a group gets
  everything in it, and one that names a block of text gets its letters. (The tutorial has four groups: the
  outlines counted into each reach exactly as far as the box the group records.)
- **Making toolpaths editable no longer hangs on a big project.** With no shapes found by ID it compared
  every shape with every saved preview, several times over: on the tutorial (1,096 shapes, 899 previews) it
  never finished. Past a size that search isn't tried, and those toolpaths come across to have their shapes
  picked.
- **Cut in the simulator against VCarve's own G-code** (the tutorial's base, both tools): the wood is the same
  within 0.1 mm over 94.8% of it, and nowhere does 454 cut deeper by more than 0.17 mm. The rest is floor
  454 leaves higher: see the first of these.
- **Known, and not fixed here** (both are the toolpath engine, and so the same for an inlay made in 454):
  - A V-carve doesn't flatten floor its clearing tool can't fit into. VCarve's V-bit goes back and forth over
    those places (29 m of moves on the tutorial's base, to 454's 6 m); 454 leaves them. On that pattern it's
    about a tenth of the floor, in the narrow parts: an inlay cut that way wouldn't seat there.
  - That pattern takes the engine 87 s for its clearing pocket and 61 s for its V-carve, with the app waiting.
- The tutorial's two plug toolpaths name a shape that's no longer in its drawing (VCarve has only their saved
  result), so they come across without shapes, and say so.
- Found by Clint, checking the tutorial project's toolpaths.
- **Tested** (23 tests in a new `vcarve-convert.test.mjs`, with a project of Clint's as a fixture,
  `vcarve-pockets.crv`; broken on purpose 51 ways: 48 caught, and 3 more after adding checks), and on five of
  Clint's projects, old conversion against new: the same toolpaths, names and shapes.

### 0.125.0 — VCarve projects: lone lines and arcs come across, and open shapes stay open
- **Fixed: a shape that was a single line or a single arc didn't come across from a VCarve project.** The reader
  took a shape to be two spans or more, so a lone line or arc was skipped without a word: a project holding one
  line opened empty. Shapes of one span are read now, as a line or an arc.
- **Fixed: open shapes were closed, and lost their last point.** Each span in a project says where it ends as
  well as where it starts. Only the starts were read, so an open shape came across without its last point,
  closed by a straight line. Now a shape whose last span ends where its first starts is closed, as before, and
  any other is open, with its end as its last point.
- **A block of text's own baseline or curve isn't taken for a shape.** Each block of text carries one after its
  last line (very likely why shapes of one span were skipped). It's part of the text and is left out.
- The toolpath previews are read as they were.
- **Checked on real projects:** Clint's test project now gives all 75 shapes of the DXF VCarve exports from it,
  the arc as an open arc, each open or closed as the DXF has it. The tutorial project still gives its 1,096,
  with none of its text's baselines or curves beside them. Of eight more of Clint's projects, one that was a
  single line now opens with it, two gain lone lines they were missing (7 and 1), and five are unchanged.
- Found while testing the text fix: VCarve's DXF had one shape more than Design read.
- **Tested** (4 more tests in `crv-text.test.mjs`, on Clint's test project and on a project of his that is one
  line, `test/fixtures/vcarve-line.crv`; broken on purpose 11 ways, all caught).

### 0.124.0 — VCarve projects: text where VCarve has it, and the material's real size
- **Fixed: text in a VCarve project opened in a pile.** VCarve keeps text as text: each letter's outline is
  stored centred on zero, with numbers beside it that say where it goes. 454 read the outlines and not the
  numbers, so every letter of every block landed on one spot. It now reads them (`crv-text.js`) and puts each
  letter where VCarve does: straight text in lines, set left or centred, fitted to a box or not; and text on a
  curve, centred on it or starting where it starts; with the block's size, mirroring and place.
- **Only what's been checked is placed.** Text set to the right, or on a curve with settings not seen yet (off
  the curve, to one side of it, not filling it) is left out, and 454 says which and why: convert it to curves in VCarve to bring it in. Text
  it can't read at all is left as it was found, and it says the letters may be piled up.
- **Fixed: a project zeroed at the centre of its material opened at half its size, with no thickness.** The
  project holds the material's two corners, not its size, and the high corner was taken as the size: right
  only with zero at the low corner. A 12 × 9 × 1.25 in job opened as 6 × 4.5. The size is now the space between
  the corners, and XY zero opens where the project has it: a corner or the centre. A zero anywhere else is
  moved to the front-left corner, with the shapes kept where they sit on the material, and 454 says so.
- **How it was worked out:** from a tutorial project of Clint's with twelve blocks of text, and the DXF VCarve
  exports from it. With the fix, all 1,096 shapes Design makes from the project sit on their own shape in
  that DXF: the 1,002 letter outlines of straight text and the 86 other shapes exactly, the 8 letters on a
  curve within 0.003 in. Seven of Clint's own projects open as they did.
- **Checked on a second project,** made by Clint for the purpose, with its DXF: text fitted to a box (set left,
  and centred) and text set left on a curve that was turned round and sized to fit. The first version left all
  three out, as not seen before. The box-fitted text then proved to follow the same rule exactly, and the text
  on the curve to start where the curve starts (within 0.002 in). All 74 shapes sit on their own DXF shape.
- Not seen yet, so not handled: text set right; a curve that isn't one arc (it follows the same rule, but
  hasn't been checked against VCarve); a material with Z zero at the bottom (read by the same rule).
- The tutorial project is someone else's work, so it isn't in the repository: the tests use its numbers, and
  text data built the way VCarve writes it. Clint's own project is kept as a permanent test
  (`apps/design/test/fixtures/vcarve-text.crv`), with VCarve's DXF export of the whole drawing (`.dxf`): a
  test opens the project, checks its material and that all three blocks of text are placed, and holds every
  shape Design makes to that DXF, each to its own shape. (Design then read one shape fewer than VCarve
  exports, the arc the text sits on: fixed in 0.125.0.)
- Found by Clint.
- **Tested** (20 tests in a new `crv-text.test.mjs`; broken on purpose 53 ways: 52 caught, and 1 that changes
  nothing, as the reader finds an outline within a few bytes of where it's told), and opened in the app.

### 0.123.0 — recent files, in the desktop app
- The desktop app's **File → Open recent** opens a recent project as Open does (`openRecent`, `menuDo('recent', path)`),
  and projects dropped on the window go on its list. See the desktop app's 0.6.2-beta.40. In a browser there's
  no such list: a web page can't keep hold of where a file is.

### 0.122.0 — Preview in wood: watch the job cut
- **Play, Pause and a slider under Preview in wood.** It still opens on the finished piece. **Play** starts from
  uncut wood and cuts the toolpaths in order, in the 3D view, with the bit shown at its real size and shape (a
  flat end, a ball, or a V at its angle), lifting and plunging as it will. Drag the slider to any moment of the
  job, back or forward.
- **Watch from any side while it plays.** Turning, moving and zooming the block work as before, and there's a
  **view cube** in the corner, as in 454 Control: click a face (Top, Front, Right…), an edge or a corner to look
  from there. **Reset view** puts it back as it opened. The cube takes the place of the Angled, Top and Front
  buttons. The view never goes below the board, so Bottom gives the lowest side view.
- **What it's for:** seeing the order things are cut in and where the bit travels between cuts, which the
  finished picture can't show: a part cut free before its pockets, a move through the wood, a profile started
  in the wrong place.
- **The clock is the job sheet's time** (feeds as set, rapid moves at 5000 mm/min, no speeding up and slowing
  down), so a real job runs somewhat longer. **Speed** starts at whatever plays the whole job in about 45
  seconds or less, from real time to 1000×.
- **Where 3D can't be shown** it plays from above, with a ring for the cutter: blue while it's in the wood,
  white while it's above it.
- **It's the same simulation as the finished preview,** cut a step at a time: `woodSim` was split into a job and
  its steps (`woodJob`, `woodJobTo`, `woodStamp`), and the finished preview is those steps run to the end. The
  split was proven against the old code on 400 made-up jobs (23.7 million cells of wood and every pixel of the
  picture, the same bit for bit; a deliberate change to either was noticed).
- **The 3D block is moved a patch at a time** as the wood is cut (`woodMeshUpdate`, `woodMeshNormals`), not built
  again each frame, and only that patch is sent to the graphics card. `woodMesh` itself was proven unchanged
  (180 blocks, the same bit for bit).
- Going back can't un-cut wood, so four copies of the wood are kept as play passes each fifth of the job, and
  going back starts from the nearest.
- **Measured in the app:** on a 600 × 400 mm board (2.5 million cells) a frame in 3D took 5 ms on average and
  30 ms at worst, and going back 73 ms. Played to the end, the block had every point where the finished
  preview's has it.
- Not yet: saying which toolpath is cutting, and pausing where a rapid cuts wood.
- Asked for by Clint.
- **Tested** (13 tests in a new `wood-play.test.mjs`, and 6 more in `wood-3d.test.mjs`: played to the end in
  uneven frames, or dragged back and forth first, the wood is the finished preview's exactly; the block moved a
  patch at a time is always what a fresh one would be, lighting included; the cube's clicks. Broken on purpose
  42 ways: 36 caught, 2 more after adding tests, 3 that change nothing but speed or are the same code written
  differently, and 1 that showed a line that could never run, which was taken out), and looked at in the app.

### 0.121.0 — the left panel folds away
- **The left panel folds away, for more drawing room,** as the Toolpaths panel does on the right. **«** at the
  bottom of the Tools and Layers tabs folds it down to just the tabs; **»**, or either tab, opens it again. It
  stays as you left it next time.
- The tab last shown (Tools or Layers) is remembered between visits too, as was meant: it was saved but never
  read back.
- Asked for by Clint.
- **Tested** (6 tests in a new `side-fold.test.mjs`; broken on purpose 8 ways, all caught).

### 0.120.2 — a toolpath shown again shows its tabs
- **Fixed: a toolpath hidden with its eye and shown again had no tabs on the drawing** until it was edited and
  updated (Recalculate didn't bring them back either). The tabs were still there and still in the G-code: they
  were drawn only on the toolpath picked (the one just made, edited or clicked), and pressing an eye lets go of
  the pick. Now every toolpath on the drawing shows its tabs. With one picked, only that one shows, as before.
  A toolpath with no path drawn (its shapes deleted) shows no tabs, and nor does a shape that's gone.
- Found by Clint, testing.
- **Tested** (4 tests in a new `tp-tabs-shown.test.mjs`, which run Design's real drawing code and count the tab
  marks; broken on purpose 3 ways, the old code included, all caught).

### 0.120.1 — Trim works where shapes cross
- **Rectangles can be trimmed.** Before, clicking a rectangle with Trim did nothing and said nothing crossed it.
  What's left is an open outline, as with any closed shape.
- **Fixed: trimming a closed shape could remove the wrong piece.** When the piece clicked ran past the point where
  the outline starts (a polygon's first corner, say), Trim kept that piece and removed the rest.
- **A group's shapes count as crossings**, for Trim and Extend: an imported DXF or SVG, or a traced picture, now
  stops a trim where it crosses. Clicking a group itself with Trim says to ungroup it first.
- A closed shape that another only touches once is left alone (there's no piece to cut out).
- Found by Clint, testing.
- **Tested** (12 tests in a new `trim.test.mjs`; broken on purpose 6 ways, all caught).

### 0.120.0 — the File group: Open and Import apart, usual icons, and View & History moved in
- **Open and Import are two buttons.** **Open** (Ctrl+O) is for a drawing, or a VCarve or Carbide Create project:
  it takes the place of the drawing that's open, which Recover keeps if it wasn't saved. **Import** (Ctrl+I) brings
  DXF or SVG vectors into the drawing that's open, or a picture to trace. Each window offers only its own kind of
  file, and each remembers its own folder. Before, one Open button did all of it. Dropping a file on the window
  still works for every kind.
- **Usual icons:** a page with a plus for New, an open folder for Open, a floppy disk for Save, a floppy disk and a
  pencil for Save As. Import has the arrow into a tray that Save had.
- **View & History's four buttons are in File now:** Undo, Redo, Fit stock and Measure, and that group is gone. File
  is New, Open, Import, Recover, Save, Save As, Export DXF, Export SVG, Undo, Redo, Fit stock, Measure. A panel
  order saved before still works.
- The desktop app's File menu has **Import…** (Ctrl+I) under Open, and its Open and Import windows offer
  their own files.
- Requested by Clint while testing.
- **Tested** (5 more tests in `keys.test.mjs`, 2 in the desktop app's `design-files.test.mjs`, the menu's updated;
  broken on purpose 16 ways, all caught), and looked at in the app.

### 0.119.1 — New starts with one sheet
- **Fixed: New kept the old drawing's sheets.** Found by Clint: six sheets added, New, and the six were still
  there. Two faults. New only acts on a drawing that has something in it, and sheets didn't count, so a
  drawing with only sheets added looked empty and New did nothing at all. And when it did act, it cleared
  the shapes, layers and toolpaths but not the sheets. Now sheets added (more than one) and parameters count
  as something in the drawing, and New starts with one sheet.
- **New also clears the drawing's parameters and its name.** They belonged to the old drawing: its parameters
  would have been offered in the new one, and its name went on the new drawing's G-code files and job sheet.
  The material stays, as it always has.
- The same goes for closing without saving (Don't save): the next session starts with one sheet.
- An empty drawing that lists just one sheet is still empty, so New doesn't put it aside over a real drawing
  waiting in Recover.
- **Tested** (6 more tests in `unsaved.test.mjs`; broken on purpose 7 ways: 6 caught, and the other removes a
  line that `sheetsInit` already does), and tried in the app: six sheets, File → New, one sheet.

### 0.119.0 — see every pass in the toolpath editor
- **A Passes row in the toolpath editor,** under Per pass, for profiles and pockets. It shows how many passes
  the cut takes and the depth each one reaches ("1.50 · 3.00 · 4.50 · 6.00 · 6.35 mm"), and follows Cut
  depth, Through and Per pass as they change, so a change shows at once. With more than eight passes it shows
  the first three and the last two.
- **Type a number of passes** and the depth is divided into that many even passes: Per pass changes to match.
  The step is rounded up at the box's precision, never down, so the passes asked for are the passes cut.
- **A thin last pass is pointed out.** When the last pass would take less than half of Per pass (6.35 mm at
  1.5 leaves 0.35 for the fifth), the row says so and offers **Make them even: 5 of 1.27**. It keeps the
  number of passes, so no pass ever goes deeper than you set.
- **(machine) Fixed: the cutting engine could cut the final depth twice.** It worked out the number of passes
  by dividing the depth by the pass depth and rounding up, and for some everyday sizes the division comes
  out a hair over a whole number: 19.05 / 6.35 (3/4 in deep at 1/4 in a pass) is 3.0000000000000004, which
  rounded up to four. The fourth pass went round at the same depth as the third, taking nothing off: wasted
  time, and the cards said "4 passes". 3/8 in and 3/4 in deep at 1/16, 1/8 or 1/4 in a pass were all
  affected. A hair over no longer counts (`passCount` in `cam.js`). Nothing cut too deep or too shallow
  because of this.
  - Proven old against new on 2,610 profiles and pockets (plunged and ramped, with tabs, leads and finishing
    passes, rings and raster): 2,585 identical move for move, and 25 where the only change is that repeated
    last pass gone, with the same final depth. Depths a little over a whole number of passes (3.03 mm at
    1 mm) still get their small last pass. The comparison was itself checked by breaking the fix 6 ways.
- The cards, the hint and the "toolpath created" message count passes the same way, and say "1 pass".
- 454 Design answers the desktop app's new File and Help menus (`menuDo` in `shortcuts.js`): each item does
  what its button or keys do, and nothing while a dialog or the help has the screen. Save G-code from the menu
  says so when there's no toolpath to save.
- **Tested** (`apps/design/test/passes.test.mjs`, 14 tests, including that the depths listed are the depths
  the engine's moves go to; broken on purpose 30 ways, all caught), and tried in the app with real typing.

### 0.118.0 — a row of icons at the top of the Toolpaths panel
- **Preview in wood, Preview in 454 Control, Job sheet, Save template and Apply template are now icons in a
  row under the panel's name,** instead of five wide buttons under the list of toolpaths. They looked out of
  place there and took a lot of room. Rest the pointer on an icon and it says its name and what it does; the
  ⓘ at the end of the row explains the row and opens the guide. **Save G-code…** stays the wide button under
  the list: it's the one you came for.
- The three that look at the job (the previews and the job sheet) can't be pressed until a toolpath on the
  sheet being shown is ticked for the G-code, as before. Save template needs a toolpath; Apply template is
  always there.
- Nothing they do has changed. The row hides while the toolpath editor has the panel.
- **Tested** (`apps/design/test/toolpath-actions.test.mjs`, 7 tests; broken on purpose 20 ways, all caught),
  and tried in the app with real clicks.

### 0.117.0 — an ⓘ beside each section
- **27 section headings in 454 Design have a small ⓘ.** Rest the pointer on it, or tab to it, and a tip of a
  sentence or two says what the section is for. Click it and the help window opens at that section of the
  guides. They're on the six tool groups and Layers on the left, the Toolpaths panel and the sheet bar on the
  right, the toolpath editor's title and five headings, and the windows: Job setup (and its Machine part),
  Settings, the tool library, Parameters, Nest parts, Add text, Preview in wood, Trace image, Offset, Mirror
  and Import.
- **Icons are on sections, not on every setting,** so the screen doesn't fill with them. Single settings in the
  toolpath editor keep their click-for-help box.
- **Clicking an icon doesn't act on the heading it sits in:** a tool group doesn't fold or start to drag.
- The list is in one place (`HELP_ICONS` in `apps/design/src/js/help-where.js`: heading, place in the guides,
  tip), and the docs' build checks every place exists, as it does for F1. The code is shared with 454 Control
  (`helpIconsApply` in `apps/shared/help.js`), whose own icons move to it next.
- Headings whose words change (New toolpath / Edit toolpath, Tool library / Choose a tool, Add text / Edit
  text, the Import window's) are set through `helpHeading`, which puts the icon back.
- The tool groups' names stay on one line beside the icon (slightly tighter letter spacing).
- **Tested** (6 more tests in `help.test.mjs`; broken on purpose 26 ways: 25 caught, and the other is a call
  Design doesn't need because its tool panel puts the icons in), and tried in the app with a real pointer
  and keyboard.

### 0.116.1 — the eye on a toolpath card hides it
- **Fixed: the eye on a toolpath's card changed its icon and nothing on the drawing.** A toolpath that has just
  been made or edited is the one picked (its card is tinted), a picked toolpath was drawn even when hidden,
  and while one is picked the others aren't drawn at all. So hiding the one you had just made did nothing you
  could see, and neither did hiding or showing any other. Pressing an eye now lets go of the pick, so the
  drawing shows exactly what the eyes say. Clicking a hidden toolpath's card still shows it on its own.
  The right-click menu's Hide and Show do the same. Found by Clint, using it.
- The rule for which toolpaths are drawn is in one place (`tpDrawn`) instead of written twice in the drawing
  code. Tested (4 new tests in `toolpath-names.test.mjs`; broken on purpose 12 ways, all caught) and checked
  in the app by clicking the eye and counting the toolpath's pixels before and after.

### 0.116.0 — help inside the app
- **F1, or the ? in the header, opens the guides in a window over 454 Design,** instead of sending you to a
  separate window. It shows the docs' own pages, so there is one set of words, with a search box and a list of
  pages beside them.
- **It opens at what you're doing:** the kind of cut in the toolpath editor (a pocket opens at Pocket), Job
  setup, the tool library, nesting, settings; otherwise the toolpath basics or the quick start.
- **Search** finds sections, not just pages. A word in a heading counts for most, every word typed must be
  there, "probing" finds "probe", and Design's own guides come before Control's. Enter opens the first result.
- **Keys stay with the help while it's open:** typing in the search box, or pressing Delete over the guide,
  doesn't reach the drawing. Esc closes it.
- **The docs page is shown trimmed** inside the window (no header, menu or footer), in the app's light or dark
  theme. Links inside a guide work. **Open the docs** shows the same page in the docs' own window.
- **A copy with no guides beside it** (design.html opened on its own) says so and links to the website.
- **The search index is made when the docs are built** (`docs-site/scripts/help-index.mjs`: 182 sections of
  12 pages), and that build now fails if either app opens its help at a heading that no longer exists, naming
  it. The places are listed in each app's `help-where.js`.
- Shared with 454 Control (`apps/shared/help.js`, `help.css`: both builds include them).
- **Tested** (`apps/design/test/help.test.mjs`, 17 tests; broken on purpose 47 ways: 46 caught, the other
  makes no difference), and tried in the app with real key presses in both Design and Control.

### 0.115.1 — small pictures in the toolpath editor's help
- **Every kind of cut has a small picture beside its help,** shown when the editor opens and whenever the Cut
  row is chosen: outside, inside and on-the-line profiles and the pocket from above, showing which side of
  the drawn line the bit runs; drilling from above; chamfer, V-carve and inlay from the side.
- **Four settings have one too:** Stepover (two passes of the bit from above,
  and the distance between them), Ramp in (the bit sloping into the material, from the side, with the ramp
  length and one pass marked), Lead in/out (the cut round a part, with the arc coming on from the waste side),
  and Tabs (the cut stepping up over two tabs, with length and thickness marked). The others stay words only.
- The pictures are drawn in the page's own colours, so they follow the light and dark themes, and each says
  what it shows for a screen reader.
- Tested in `toolpath-editor-dock.test.mjs` (10 tests now; broken on purpose 8 more ways, all caught), and each
  picture was looked at enlarged in the app.

### 0.115.0 — name your toolpaths; fold their cards to the title; the editor takes over the panel and explains itself
- **The toolpath editor takes over the Toolpaths panel** while it's open, as VCarve's does, instead of floating
  over the corner of the drawing. It's wider (440 px, less on a narrow window), the drawing and its live
  preview stay in view, and the list of toolpaths comes back when you press Create, Update or Cancel. If the
  panel was folded away, the editor still opens, and the panel folds away again afterwards.
- **Its settings sit under headings:** Tool, Depth, Passes, Entry and exit, Tabs. A heading with nothing under
  it for the kind of cut isn't shown (a V-carve shows Tool and Depth only). Feed and Direction moved up beside
  the tool they belong to. Every control is the one it was; only the order and the grouping changed.
- **Help for every setting.** Click or tab into a setting and a box above the buttons says what it does, in a
  sentence or three, and its row is outlined. It starts on the kind of cut chosen ("Profile, outside: cuts
  round the outside of the line, so the part comes out at the size you drew") and follows it when that's
  changed. Written for all 26 rows and all 8 kinds of cut (`toolpath-help.js`).
- **The help, the summary and the buttons stay put** at the bottom while the settings scroll, so the warning
  that a cut goes past the material is always in view, and Create is never off the screen.
- **A unit sits beside its box** (mm, mm/min, % of the cutter) instead of at the far edge of the row.
- **Fixed: tab rows showed on a pocket** if tabs had been ticked while it was still a profile. Pockets have no
  tabs.
- **Fixed: on a narrow window the size bar over the drawing covered the top of the Toolpaths panel.**
- **Tested** (`apps/design/test/toolpath-editor-dock.test.mjs`, 8 tests; broken on purpose 31 ways, all
  caught), and looked at in the app for every kind of cut at two window sizes: nothing overflows.
- **A toolpath can be given a name.** The editor has a **Name** box, and on a card you can double-click the
  name (or right-click → Rename…), type, and press Enter; Escape leaves it alone. The name is on the card and
  the job sheet and in the G-code's `;Toolpath:` comment, which 454 Control shows. Left empty, a toolpath is
  named after its kind of cut, as before. Renaming changes nothing about the cut and can be undone.
- **Fixed: a toolpath kept its first name when its cut was changed.** An "Outside profile" edited into an
  inside cut still said "Outside profile". A name that is only the kind of cut now follows the kind; a name
  you gave stays.
- **Cards fold to their titles.** The arrow at the left of a card folds it to one line (order handle, tick
  box, number, name, eye); the new button in the panel's header folds or opens them all. What's folded is
  kept with the drawing. Editing a folded toolpath leaves it folded.
- **A folded card can't hide a warning.** It shows ⚠ beside the name when the toolpath goes past the material,
  has a parameter that can't be worked out, has no tool, is out of date or is in the wrong order, and hovering
  says which.
- **The title is left to the name.** The kind of cut ("pocket", "outside") used to share the title line and
  squeezed the name to a few letters. It now leads the line under the title, before the tool and feed; "no
  tool chosen" and "the drawing changed" show there too.
- **(machine) A name can't put a line into the G-code.** A name is written as a comment, where a line break
  would begin a new line of G-code. Names are kept to one line and 60 characters when typed or read from a
  Carbide Create project, and the G-code writer (`cam.js`) now strips line breaks from every name, tool name
  and note it writes, whatever is in the drawing.
- **Fixed: the toolpath editor scrolled sideways** once it was tall enough to scroll down: its Finishing row
  was a little too wide. That row now wraps.
- **Tested** (`apps/design/test/toolpath-names.test.mjs`, 14 tests), and tried in the app with a real
  double-click and typing: Delete and Backspace in the name box edit the name and don't delete shapes.

### 0.114.0 — open Carbide Create projects (.c2d); pockets with islands and big V-carves calculate much faster
- **Pockets with islands, and V-carves over many shapes, are calculated 5 to 20 times faster, and cut exactly
  as before.** Found by opening real Carbide Create projects: a pocket with eight letters in it took 17 seconds
  (now 1), a V-carve of 50 stars took 22 seconds (now a third of a second), and one of 333 shapes didn't finish
  in three minutes (now 23 seconds). During that time Design doesn't respond. Three causes, in `cam.js` and
  `geom.js`:
  - Measuring from a point to an outline it's outside of walked a grid of cells, ring after ring, to reach
    across the outline: thousands of measurements for a ten-point star. A short outline, or one the point is
    outside, is now measured segment by segment.
  - A pocket snapped every point of every ring to the nearest wall by measuring to every island, however far.
    It now looks only as far as the ring's own distance first.
  - A V-carve asked "what's the nearest outline?" of every outline, to learn only whether any was nearer than
    a given distance. It now stops at the first that is, trying the point's own outline first.
- **Proven identical.** The engine before and after was run side by side on 59 pockets and V-carves: every
  toolpath the real projects make (the two largest carvings in four parts each, since the old engine would take
  hours on the whole), and made-up ones covering islands of every kind, raster clearing, clean-up after a
  larger bit, a finishing allowance, conventional cutting, a depth limit, a flat tip and an inlay's start
  depth. Every result was the same, move for move. Where the old way's answer could depend on the order it
  looked in (two different points equally near), the old way is still used. The comparison was itself checked
  by breaking the new code on purpose (7 ways caught: up to 46 of the 59 results then differ; an eighth, the
  pocket's fall-back to the full look, is never needed by any of the 59, so removing it changes nothing there).
- New tests (10, `nearest-point.test.mjs`): the nearest point on outlines of 4 to 2000 segments, from inside,
  outside and far away, against a plain measure-everything reference, with and without a cap.
- **Open a `.c2d` file** and its shapes come across on their layers (hidden and locked ones too), with the
  material's size and thickness, in the units the project shows. Each shape keeps Carbide Create's ID, for
  its toolpaths.
- **Toolpaths come in as 454 toolpaths** (`c2d-toolpaths.js`): editable, recalculated from their shapes, checked
  like any other. Contours (outside and inside), pockets and V-carves, with depth, passes, stepover, feeds,
  speeds, ramp or plunge, and tabs' size and number. Their shapes are found by Carbide Create's own IDs, or by
  layer where the toolpath picks by layer, never by position. One switched off, or in a group that's switched
  off, comes in left out of the G-code.
- **Nothing about a cut is guessed.** A toolpath that can't be converted for certain is left out and named, with
  why: a contour from current Carbide Create (it stores the side as `path_type`, and two files Clint meant as
  outside cuts hold different values, so its meaning isn't known), a kind not converted yet (drilling,
  texture), shapes not found, no bit size, no depth. What's known comes from real projects: in older files
  `ofset_dir` 1 is outside ("Outside", "cutout", "SignCutOut"), -1 inside ("eyes", "nose"), 2 a pocket, 3 a
  V-carve, and a V bit's `angle` is half its included angle (#301, 90 degrees, is 45).
- **What differs from Carbide Create is said, by name,** in a window after opening: tabs spread evenly instead
  of where they were; a V-carve's flat areas cut by the V bit instead of a second bit; a clean-up pocket brought
  in whole; a start depth; a bit given by its tip. And always: bits are sizes, not library tools, so check each
  toolpath and air-cut.
- **The drawing shows first; toolpaths are calculated after, one at a time.** A V-carve over hundreds of
  shapes still takes half a minute, during which Design doesn't respond (see the speed-up below). Opening
  another drawing meanwhile drops the ones not yet calculated.
- **Both kinds of file.** Current Carbide Create (7, build 8xx) saves an SQLite database whose items are JSON
  text packed with zlib. Older versions (seen: builds 464, 648, 756) save one JSON text with the 3D model's
  bytes after it. The shapes are described the same way in both. Design reads the database and unpacks the text
  itself (`c2d-import.js`), read-only, with no library added, so it works offline and in a browser. Carbide
  Create's own G-code inside the file is encrypted and isn't read.
- **A shape is known by its outline, not its label.** Four curves round one centre are a circle and four
  square corners are a rectangle, whatever the file calls them (older files don't say). Anything else is an
  outline, its curves followed within 0.02 mm. A shape with several outlines is one group.
- **Text** comes in as its letters' outlines, through the text's own transform, as one group.
- **XY zero** at a corner or the centre is taken from the project, with the shapes measured from it, and the
  message says so. Anywhere else it's left at the lower-left corner, and the message says where the project had
  it. **Z zero** other than the top is said, not guessed.
- **What it can't read is said:** a kind of point it doesn't know, shapes with nothing to draw, lists it
  doesn't know, items it couldn't read. Stray points (shapes with no size: one real project has 491) are left
  out and counted. A file it can't open says so and suggests exporting SVG or DXF.
- **Opening one doesn't touch the last drawing's file.** The drawing before is kept for Recover, Save asks
  where to save, and it offers the project's own name.
- The Toolpaths panel's "No toolpaths yet" note says how to make one (it only mentioned VCarve projects).
- Toolpaths tested (10 tests): each kind, shapes by ID and by layer, depths and through cuts, feeds, tabs,
  switched off, start depths, everything left out, opening and the window, another drawing opened meanwhile.
  Checked by breaking it on purpose (45 ways). Three real projects' toolpaths converted in the desktop app.
- Reading tested (11 tests): unpacking against Node's zlib (every packing level, 70 KB of noise); the database reader
  against Node's SQLite (three page sizes, 700 rows, a 300 KB value); the two files Clint saved for this
  (`test/fixtures`); projects made in the test for lines, curves, open paths, several outlines, layers, turned
  and rounded rectangles, unlabelled circles, text, zero in six places, and the older kind of file; what can't
  be read; opening. Checked by breaking it on purpose (63 ways). Opened in the desktop app: the two fixtures,
  and three larger real projects (570 shapes; an older file with text; a sign with 24 shapes and 491 stray
  points), which aren't in the repository because they're other people's designs.
- Not yet confirmed: which way round text ends up. The one real file with text reads right to left here, and
  Clint is checking it against Carbide Create.

### 0.113.0 — add sheets to a project
- **A project can have several sheets**, one for each piece of material. Design could show the sheets of a
  multi-sheet VCarve project, but there was no way to add one. The **Sheet** bar at the top of the Toolpaths
  panel is now always there, with **+** (add), a pencil (rename) and a bin (delete). The first sheet added
  makes what's drawn so far Sheet 1. New shapes go on the sheet being shown; cut and paste in place moves
  shapes between sheets, with their dimensions. Every sheet uses the material in Job setup.
- **Sheets are their own thing now, not layers.** A sheet used to be a layer, so a sheet couldn't have layers
  of its own, and toolpath templates (matched by layer name) had nothing to match. Each shape now records its
  sheet, and every sheet has every layer. Drawings saved the old way are converted when opened.
- **Only the shown sheet's toolpaths are drawn.** The drawing showed every sheet's toolpath previews at once,
  on top of each other. (The G-code was always the chosen sheet's only.)
- **What's on another sheet is left alone**: Trim, Extend and Fillet don't cut against it; it can't be picked
  or snapped to; Nest doesn't treat it as an obstacle or nest it; Check doesn't report it; DXF and SVG export
  the shown sheet; a template applies to the shown sheet; moving a toolpath up or down moves it among its own
  sheet's; and a profile on one sheet no longer warns about a pocket on another.
- **Deleting a sheet** asks first if anything is on it, and removes its shapes, dimensions and toolpaths; Undo
  brings them back. The last sheet can't be deleted. Sheets wait while the toolpath editor is open.
- Adding a sheet doesn't mark toolpaths "the drawing changed": which sheet a shape is on doesn't change how
  it's cut.
- Tested (17 tests): adding, showing, renaming, deleting and undoing; toolpaths, Check and Save G-code per
  sheet; paste; trim, extend, fillet and picking; templates; exports and nesting; toolpath order; old drawings; VCarve
  projects. Each checked by breaking it on purpose (38 ways; one, a second safeguard for the same thing, can't
  be told apart). Tried in the desktop app.

### 0.112.1 — "Job setup", not "Settings"
- **Messages about the material's thickness, and Z zero, said to change them "in Settings".** They're in Job
  setup; Settings holds appearance (with a link to Job setup, which is how it went unnoticed). A dozen messages
  now say Job setup: toolpath cards, the editor's hints, the Parameters list, and the windows before Save G-code.
- **Fixed: "Open Settings" did nothing.** Saving G-code for a through cut with no thickness set shows "Set the
  material thickness first"; its button called a function that page couldn't reach, so nothing opened. It's now
  **Open Job setup**, and opens it.
- Tested (1 new test: the window, its button's name, and Job setup opening); checked by breaking it on purpose
  (2 ways).

### 0.112.0 — cutting past the material is always said; parameters in toolpaths
- **Every toolpath that goes past the bottom of the material says so**, from the deepest point it really cuts,
  whatever kind it is (pocket, profile, V-carve, drilling, chamfer, clean-up) and however its depth was set:
  ⚠ in the editor's hint and on its card, with how far into the spoilboard. **Save G-code** and **Preview in 454
  Control** stop and list them, with Cancel or Save anyway. A change that puts a toolpath through (a thinner
  material, a parameter) names it at once. A through cut's own overcut isn't flagged. With no material thickness
  set, Save G-code says depths can't be checked. Before this, only V-carves warned: a 15 mm pocket in 12 mm
  material said nothing.
- **Depth, tab length and tab thickness can be parameters** (`material / 2`, `tab_thk`), remembered by the
  toolpath and recalculated when the parameter or the material changes. A depth from a parameter needs the
  material's thickness, so it can always be checked. A toolpath whose parameters can't be worked out says so,
  and Save G-code refuses it, with no way past, until it's put right. A parameter a toolpath uses can't be
  deleted; renaming changes it in the toolpath too.
- **Every length box takes arithmetic and parameters**, worked out once: `600 - 2 * thickness` in the
  selection box, an offset, and so on. Measurements mean what they did (`12 1/2`, `3/4`).
- Fixed on the way: the check's answer was kept from when a toolpath was made, and a pocket with Z zero on top
  isn't recalculated when the thickness changes, so a thinner material wasn't noticed. It's now worked out
  fresh each time it's read.
- Tested (20 tests): the depth check for every kind, through cuts, Z zero on the spoilboard, Save and Preview,
  no thickness, a thinner material; parameters in depth and tabs, following the list and Settings, refusing
  mistakes and a missing thickness, Save refusing, rename and delete, one-off arithmetic. Each checked by
  breaking it on purpose (26 ways). Tried in the desktop app.

### 0.111.0 — parameters
- **Parameters**, as in Fusion: named sizes saved with the drawing (the **fx** button beside Dimension). A
  value is a number or arithmetic using other parameters (`dado = thickness + 0.2`,
  `gap = (height - 3 * thickness) / 2`). Type a name, or arithmetic with one, into a dimension, and it
  remembers it (shown as **18.50 = dado**): change the parameter and every dimension using it, and the shapes,
  follow, as one Undo. `material` is the material's thickness from Settings, and dimensions using it follow a
  change of thickness.
- Each parameter keeps the units it was typed in, and numbers can say theirs (`18mm`, `3/4in`), so switching
  between mm and inches changes no sizes. What could be typed before still means the same (`12 1/2`, `3/4`,
  `E` for edge to edge). Mistakes are said plainly and refused: an unknown name, an open bracket, dividing by
  zero, a parameter that depends on itself. Renaming changes every use; one in use can't be deleted.
- Dimensions that affect each other are applied until they all hold; any that can't, or that were moved by
  hand, are marked &#9888;.
- Tested (26 tests): the arithmetic and units; a cabinet layout following thickness and width changes; the
  list (add, change, rename, delete, refusing mistakes and loops, Undo); the material's thickness. Each
  checked by breaking it on purpose (32 ways). Tried in the desktop app.

### 0.110.0 — choose where a profile starts
- **Set start** in the toolpath editor, for profiles: click a shape's outline and its cut starts there, at the
  nearest point on the cutter's path, instead of at a corner. Put the mark where each pass begins somewhere
  harmless. One per shape (clicking again moves it); **Automatic** goes back. Shown on the drawing as a ring with
  a dot. Leads sweep in to it; ramps and tabs work from it.
- Otherwise the cut is the same: the same length of cutting at every depth, never closer than the cutter's
  radius. On a shape with several outlines (text), the start goes on the outline nearest the click.
- Templates don't keep start points (they belong to the shapes).
- **Fixed:** the toolpath editor showed **Clean up after** for every kind of toolpath (since 0.105.0), and **Ramp
  in** for drilling: those rows' hidden setting was overridden by their layout. Every row in the editor now hides
  properly (checked in the desktop app for all seven kinds).
- Tested (8 tests): where the cut starts, on a rectangle and a circle; the same cut otherwise; one per shape,
  moving, Automatic, Cancel; profiles only; never into a tab; with a lead-in. Each checked by breaking it on
  purpose (12 ways).

### 0.109.0 — toolpath templates
- **Save template…** and **Apply template…**, at the bottom of the Toolpaths panel. A template is a job's
  toolpaths without their shapes: bits, depths, passes, feeds, tabs, ramps, finishing, clean-ups and order,
  in a small file. Applied to another drawing, each toolpath cuts the shapes on the layer with the same name
  as when it was saved ("Carve", "Cut out"), so a job you make often is set up in one step.
- Applying lists what each toolpath found first, and makes nothing until you say so. A toolpath whose layer is
  missing or empty isn't made, and nor is a pocket clean-up whose pocket isn't. New toolpaths go after any
  already there, tabs spaced evenly; Undo takes them back.
- Tested (6 tests): applied back to the drawing it came from, it makes exactly the same toolpaths, move for
  move; in another drawing it takes only the shapes on the named layers; the skipping, the question, Cancel
  and Undo, and the buttons in a drawing with no toolpaths yet. Each checked by breaking it on purpose (10 ways).

### 0.108.0 — one G-code file per bit
- **Save G-code can save one file per bit.** For a job with more than one bit, it asks: **One file** (as
  before: Control stops at each bit change) or **One file per bit**, which saves a file for each stretch cut
  with one bit, into a folder you pick, named in cutting order ("Sign - 2 of 3 - T2 60° V-bit.nc"). For
  machines or senders that can't change bits mid-file, or to run the bits on different days.
- A bit used again later gets another file, so nothing is cut out of order. Each file starts with a note of
  which file it is, of how many, and to run them in order. It asks before replacing files in the folder. In a
  browser that can't pick a folder, each file is downloaded.
- Tested (7 tests): the files together cut exactly what the one file cuts, move for move, read back by 454
  Control's parser; one bit per file; names Windows accepts; the question, the folder, and replacing. Each
  checked by breaking it on purpose (7 ways).

### 0.107.0 — tabs as long as you ask, and remembered
- **A tab's Length is now the wood it leaves**, along the middle of the cut, whatever the bit. It used to be
  measured along the bit's path, so the bit's round ends cut into both ends of every tab: a 4 mm tab with a
  1/4" bit left two slivers and nothing in the middle. The bit now stays up over the length and its own width.
  3D tabs are a triangle of wood as long as the length, at full thickness in the middle. Existing toolpaths get
  longer, stronger tabs when they're next saved as G-code.
- **New toolpaths start with the tabs you used last** (number, length, thickness and shape), remembered between
  sessions, so they're set once rather than on every profile. Editing a toolpath still shows its own.
- **Tabs start 1.5 mm thick** the first time, instead of 0.5 mm: 0.5 mm of wood can let a part break free
  while the cutter is still going round it.
- Tested: the wood left, measured in Preview in wood's simulation, with 1/4" and 1/8" bits, 4 and 10 mm tabs,
  flat and 3D (6 tests); the starting tabs (5 tests). Each checked by breaking it on purpose (11 ways).

### 0.106.1 — tabs show in Preview in wood
- **Thin wood shows in amber** in Preview in wood (3D and flat): tabs, and anything nearly cut through. Tabs are a
  fraction of a millimetre to a few millimetres of wood at the bottom of a deep cut, and in wood colour they
  couldn't be seen from most angles. Thin means under 2 mm, or the thickest tab on the ticked toolpaths and a
  little more; there's none when the material's thickness isn't set. The window says what amber means.
- Tested (5 tests, reading the drawn picture's colours and the 3D block's) on flat and 3D tabs from the editor;
  each part checked by breaking it on purpose (4 ways). It showed that tabs come out much smaller than their
  Length setting with a bit wider than the tab: the Length is taken along the bit's centre, so the bit's own
  width cuts into both ends. That's for a separate change.

### 0.106.0 — Preview in wood, in 3D
- **Preview in wood is a 3D view now**: the material as a block of wood with every cut in it, its edges, and the
  spoilboard showing through through-cuts. Drag to turn it and look from any side, right-drag (or Shift+drag)
  to move it, scroll to zoom; Angled, Top and Front put it back square.
- Built from the same simulation as before (`wood-3d.js`). A big job is thinned to about half a million points
  for smooth turning, each taking the deepest cell in its patch, so thinning never hides a cut. three.js is
  loaded the first time the preview opens (the desktop app has its own copy, so it works offline); without it,
  or on a computer that can't show 3D, the flat picture from above is shown, and it says why.
- Tested (5 tests): the block matches the simulation point for point, the edges reach the board's bottom, a
  single deep cell among a million survives thinning, and the fallback works. Each checked by breaking it on
  purpose (4 ways). Tried in the desktop app on a sign, from four angles.

### 0.105.0 — clean up after a larger bit
- **Pockets can clean up after a larger bit.** Make the pocket with a large bit as usual, then a second pocket on
  the same shapes with a small bit, and under **Clean up after** choose the first. The small bit then cuts only
  where the large one couldn't reach: the corners it left round, and parts too narrow for it. That's typically
  a quarter of the cutting of a full pocket with the small bit, or less. As VCarve's larger clearance tool does.
- The clean-up goes as deep as the large bit's pocket, goes after it in the cutting order, and is rebuilt when
  that pocket changes. If that pocket is unticked, deleted or on other shapes, the clean-up says so; deleted,
  it clears the whole pocket, so nothing is left uncut.
- In the CAM engine (cam.js pocket's `rest` option): the large bit is taken to clear everything within its
  radius of where its centre could go; the small bit's usual rings are kept only where it would touch what's
  left, a point either side. geom.js now exports its distance transform (edt2), which this uses.
- Tested (9 tests) with Preview in wood's simulation, cell by cell, on a rectangle, an octagon, a slot too narrow for the
  large bit, a pocket with an island and a triangle: the large bit plus the clean-up clear everything a full
  pocket with the small bit would (to within 0.02 mm of the walls), cut nothing it wouldn't, with no rapid
  moves into wood, in 20 to 29% of the cutting. Each part checked by breaking it on purpose (14 ways).

### 0.104.0 — Preview in wood
- **Preview in wood**, in the Toolpaths panel: the material as it will look after the ticked toolpaths, shaded,
  lit from the top left. Pockets, V-carving, tabs and through-cuts (the spoilboard showing) look as they'll
  come off the machine.
- It's worked out from the toolpaths' own moves, in cutting order, each cut by the bit's real shape: flat end
  mill, ball-nose, or V-bit at its angle and tip, on a grid about 0.1 mm fine for a small job. It says the
  deepest cut, and warns in red if a rapid move (G0) would cut wood. A rapid down into wood already cleared,
  as between a pocket's passes, isn't counted.
- Tested (8 tests): each bit's shape against hand-worked numbers, a ramp, rapids, the picture, and a real
  pocket from the editor; each part checked by breaking it on purpose (12 ways). In the desktop app, on a
  sign with a pocket, V-carved numbers and a tabbed outline. While checking the picture, V-carving on a star
  and on "454" was measured cell by cell: nothing is cut outside the shapes.

### 0.103.0 — text on a curve
- **Text on curve**, in Edit Vectors: select a text and a line, arc, circle or outline, and the letters are laid
  along it, each turned to follow it. It sits on top, reading left to right, centred (on a circle, across the
  top). The text stays text: its words, font and height can still be changed.
- In the Text panel, for text on a curve: where it sits along the curve (start, centred, end), a gap, letters
  standing on the curve or hanging under it, **Reverse** (for a circle's bottom, still reading left to right),
  and **Straighten**. It says when the text is longer than the curve.
- The text keeps its own copy of the curve, so moving, turning, scaling or mirroring it takes the curve along;
  changing the letter height doesn't change the curve. It saves, cuts and exports like any other text.
- Tested with a real font (Roboto, as the app ships it; 8 tests), each part checked by breaking it on purpose
  (14 ways); tried in the desktop app on a round badge and an arch.

### 0.102.0 — exact position, size and rotation
- **The Selection box**: while shapes are selected, a box at the top of the drawing shows their position and
  size and takes exact values, like VCarve's Move, Set Size and Rotate. A 3×3 grid picks the reference point
  (a corner, a side's middle, or the centre); **X** and **Y** move the selection so that point lands there;
  **W** and **H** resize it about that point, in proportion with the padlock closed; **Rotate** turns it by a
  typed angle about that point. The reference point and the padlock are remembered.
- **A rectangle turned a quarter turn stays a rectangle** (by the box or the Rotate tool), so its dimensions
  and typed sizes keep working. Other angles still make it an outline, as before.
- **Stretching a circle one way makes a true ellipse** (arcs within 0.0005 mm, from the Ellipse tool), where it
  used to make 120 short straight lines.
- Tested (7 tests), each part checked by breaking it on purpose (12 ways); tried in the desktop app, dark and
  light.

### 0.101.0 — Ellipse, Polygon and Star
- **Three new drawing tools**, in Create Vectors after Circle, each started with a click on the centre:
  - **Ellipse**: then a corner of its box, or type its width and height (`120,60`). It's made of arcs within
    0.0005 mm of a true ellipse, so it offsets, cuts and exports like any other outline; a round one is simply
    a circle.
  - **Polygon**: then a corner, or type `R` (to the corners), `D` (across the corners) or `F` (across the flats,
    the size a spanner fits). A typed one stands on a flat.
  - **Star**: then the tip of a point (or `R`, one point straight up), then the inner corners, clicked or typed.
  - For Polygon and Star, type `S` and a number any time for the number of sides or points (3 to 100). It's
    remembered.
- Tested (8 tests), each checked by breaking it on purpose (11 ways); drawn in the desktop app.

### 0.100.0 — Weld, Subtract and Intersect
- **Weld, Subtract and Intersect**, in Edit Vectors (after Ungroup), the shape tools VCarve users reach for
  most. **Weld** joins closed shapes that overlap or touch into one outline; **Subtract** cuts the other
  selected shapes out of the biggest one (the first picked, if two are as big); **Intersect** keeps only the
  area they all share. Groups and text count as one piece with their holes, so a letter keeps its middle.
- **The results are exact.** Straight edges stay straight and arcs stay true arcs, rather than becoming many
  short lines; a whole circle comes back as a circle, and a square-on rectangle as a rectangle, so dimensions,
  drilling and offsets treat them as drawn.
- A toolpath that cut a welded shape now cuts the result (for Subtract, the shape that was kept), and
  dimensions on the shapes that went are removed, as Delete does. Ctrl+Z undoes it all.
- Tested (16 tests): shapes with known answers (areas worked out by hand), and 270 random pairs, including
  shapes sharing edges and corners, checked at over 50,000 points against the rule for each operation. Each
  of 11 parts of it was broken on purpose to check a test fails. Three shapes of 5,000 points each weld in
  about a third of a second. Tried in the desktop app with the buttons.

### 0.99.3 — Save goes back to the file; Save as
- **In the desktop app, Save (Ctrl+S) goes straight back to the file a drawing came from, and keeps doing so
  after Design is closed and opened again.** Files are now opened and saved by their path, by the app
  (apps/desktop/src/design-files.js), rather than through the browser's file access: that couldn't keep hold
  of a file between sessions, and could need Windows' permission to write back to a file it opened. It works
  for a drawing opened with Load or Ctrl+O, or dropped on the window. If the file has been moved or deleted,
  Save asks where instead. The app only writes to a .json file you picked in its Open or Save window, or to an
  existing 454 drawing, and writes a temporary file first and swaps it in, so a power cut part-way can't
  leave half a drawing.
- **Save as, as a button** in the File group (beside Save), as well as Ctrl+Shift+S. It starts at the
  drawing's own file.
- In a browser, Save still goes back to the file while the page stays open (Chrome, Edge), as before.
- Tested: the app's file rules on real files (8 tests), Design's side (5 tests), each checked by breaking what
  it covers; and in the desktop app, with real key presses, across restarts: Ctrl+O then Ctrl+S saved to the
  file with no question, again after restarting, and after Save as, to the copy and not the original.

### 0.99.2 — G-code that names its tools
- **Design's G-code lists which bit each tool number is**, at the top, as VCarve does (`;Tools used in this
  file:` then `;1 = 3.17 mm cutter`, and so on, from the tool library's names). 454 Control reads it, so the
  start dialog and each tool-change prompt name the bit ("Insert T2: 6.35 mm cutter"), as they already did
  for VCarve files. Before, Control knew each toolpath's name and tool but not what each tool number was.
  Written as semicolon comments, so a tool name with brackets in it can't break the line. Tested: read back
  by Control's own parser (the test fails without the list).

### 0.99.1 — ramps without the back-and-forth; opened toolpaths show
- **(machine) Fixed: a ramped profile went forward, back and forward again at the start of every pass.** After
  each pass it re-cut its ramped stretch at full depth, then drove back along it to the start before ramping
  into the next pass. Only the last pass needs that re-cut (the next pass's ramp cuts deeper through the
  stretch anyway), so now the passes run straight into each other: each lap ends at the start and the
  cutter carries on, ramping down as it goes, and only after the last pass does it go round past the start
  to cut the ramped stretch at full depth (so a through-cut still leaves no sloping web). On an 80 x 50 mm
  outline in three passes: no reversals instead of four, 102 mm less travel. Tested: the cutter never
  doubles back, every pass is a full lap at its depth, and the last pass cuts the whole outline at full
  depth; the old engine fails the first.
- **Fixed: opening a drawing didn't show its toolpaths** until the Toolpaths panel's refresh button was
  pressed. Opening now builds them and shows them, and the layers, straight away. Tested, and checked in
  the desktop app through Design's own file reading.

### 0.99.0 — the usual keyboard shortcuts
- **Ctrl+S saves** (new). The first time it asks where; after that it saves straight to the same file, for as
  long as Design stays open (a page can't keep hold of a file between sessions). **Ctrl+Shift+S** is Save as:
  it always asks. The Save button does the same as Ctrl+S. Before, Save always asked, and Ctrl+S did nothing
  (or, in a browser, saved the web page).
- **Ctrl+O opens**, through the browser's own Open window where there is one (Chrome, Edge, the desktop app),
  so a drawing opened that way saves back to its own file with Ctrl+S. If Design isn't allowed to write to
  it after all, Save asks where instead. Other browsers open files as before.
- **Ctrl+N** new drawing, **Ctrl+A** select all (not what's on hidden or locked layers), **Ctrl+D** duplicate
  (with its dimensions, 10 mm right and down, leaving what Ctrl+C copied alone), **F1** the docs.
- **Fixed: Ctrl+Shift+Z undid** instead of redoing, as it does in most programs. Now it redoes, like Ctrl+Y.
- In a text box, Ctrl+A and Ctrl+D are left to the box; Ctrl+S saves from anywhere. While a dialog is open,
  it keeps the keyboard. Tooltips name the shortcuts.
- Tested on Design's real code (11 tests, each checked by breaking what it covers), and in the desktop app
  with real key presses: each shortcut did its one thing once.

### 0.98.0 — Ramp in, for profiles and pockets
- **Ramp in: Ramp or Plunge, and how far (new).** Profiles and pockets always ramped into each pass, over 4
  times the cutter's diameter (at least 4 mm), but nothing showed it or let you change it; only a converted
  VCarve toolpath could set another length, and there was no way to plunge. The toolpath editor now has a
  **Ramp in** row: **Ramp** (the default, cutting exactly as before) with its length (empty for the
  automatic length, which follows the cutter; or type your own), or **Plunge**, straight down at the plunge
  rate. A profile that plunges uses its lead-in, if it has one; one that ramps uses only the lead-out, as
  before.
- The toolpath's card and the job sheet show it (**Entry**: "ramps in over 25.40 mm" or "straight plunge"),
  and the hint under the settings says what each pass will do.
- **(machine)** Unchanged for existing toolpaths: one saved before this ramps as it always did (checked
  move for move).
- Tested through Design's own editor with the CAM engine (9 tests: the default, a typed length, Plunge,
  inside, outside and on-the-line profiles, offset and raster pockets, never deeper than the depth), each
  checked by breaking what it covers.

### 0.97.0 — copy and paste, dimensions included
- **Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste shapes.** Ctrl+V puts the copy centred on the pointer
  (snapping as drawing does), or 10 mm right and down from the original if the pointer isn't over the
  drawing; **Ctrl+Shift+V** pastes it exactly where it was copied from. The pasted shapes come in selected.
  In the desktop app, Edit → Copy, Cut and Paste do the same. In a text box, the keys copy and paste text as
  always.
- **Dimensions come with the shapes.** Every dimension that measures only copied shapes (a rectangle's width,
  the distance between two parts copied together) is pasted measuring the copies, on the same edges, so a
  copy can be changed through its own dimensions without touching the original. A dimension to a shape that
  wasn't copied stays with the original. Toolpaths don't come: they belong to the original shapes.
- A copy goes on its own layer, or on the current one if its own is hidden or locked (where it couldn't be
  seen or edited). What's copied is kept, so it can be pasted after reopening Design or in another Design
  window.
- Delete now shares its code with Cut (the same behaviour: the shapes go, and the dimensions on them).
- Tested on Design's real code (11 tests, each checked by breaking what it covers), and in the desktop app
  with real key presses and the Edit menu: each paste adds one copy, never two.

### 0.96.2 — the light theme, readable
- **Fixed: on the light theme, what you typed into the value box couldn't be seen.** The box beside the
  pointer (a dimension's value, a line's length) had a dark background written in, while its text follows
  the theme, so on the light theme it was near-black text in a near-black box. The box, the prompt bar and
  the hint above it now take the theme's own panel colour.
- **Fixed: on the light theme, shapes were near-white on a near-white canvas.** The display colours
  (Settings) were made for the dark theme. On the light one, a colour still at its default is now drawn in
  a light-theme partner: shapes near-black, dimensions a deeper blue, construction lines and toolpath
  previews a little darker. A colour you picked yourself is used as it is, on either theme, and the Settings
  swatches show the colours as they're drawn.
- The dark theme looks as it did (checked against the docs' screenshots). Tested (4 tests, checked by
  breaking the rule they cover), and seen in both themes.

### 0.96.1 — Settings fits its text
- **The Settings panel no longer stretches to fit its longest sentence.** The note under "Snap lines to 45°
  and 90°" made it about half as wide again; it now wraps, as the panel's other notes do.

### 0.96.0 — save the drawing before closing?
- **Design knows whether the drawing is saved to a file.** Any change makes it unsaved; saving it, or
  opening a saved drawing, makes it saved. That's remembered, so a drawing that comes back next time
  unsaved is still unsaved. An empty drawing has nothing to save. Exports (DXF, SVG, G-code) don't count.
- **Closing with an unsaved drawing asks first.** In the desktop app: Save…, Don't save or Cancel. In a
  browser, the browser's own "Leave site?" warning, the only kind a page may show.
- **Save uses a real Save As window** where the browser has one (Chrome, Edge, the desktop app), suggesting
  the name the drawing was last saved or opened as, so a cancelled save is never taken for a saved one.
  Other browsers download the file, as before.
- **File → Recover last drawing (new).** A drawing put aside unsaved (Don't save on closing, New, or opening
  another drawing) is kept, the most recent one: Recover brings it back. If the drawing open then is unsaved
  too, the two swap places, so neither is lost. Ctrl+Z undoes it. If the browser's storage is too full to
  keep it, Don't save keeps the drawing as it is instead, so it's never lost.
- New and opening a drawing work as before (and can still be undone), besides putting an unsaved drawing
  aside.
- Tested on Design's real code (12 tests, each checked by breaking what it covers), and in the desktop app.

- In the desktop app, a notice in the header when there's a new version of 454 Workshop (see the desktop
  app's 0.6.2-beta.13). Nothing changes on the website.

### 0.95.0 — 3D tabs
- **3D (tapered) tabs, as an option**: the toolpath editor's new **Shape** choice, beside tab length and
  thickness, is **Flat** (the default, as before) or **3D (tapered)**. A 3D tab is a triangle: the cutter
  ramps from the cut's floor at one end of the tab up to its full thickness at the middle and back down,
  easier to cut through when freeing the part and leaving a smaller mark. Only the passes below a tab's top
  go over it. The path follows the tab exactly: stations at each tab's ends, its middle, and where each pass
  meets its slopes (without the middle station, a straight move under the peak would cut 0.14 mm into it).
  Shown on the toolpath's card ("4 3D tabs") and in the editor's hint.
- **Fixed: a pass that starts without a ramp (a finishing pass) plunged straight to depth at its start, even
  if a tab was there**, nicking it before rising over it. It now goes down only to the tab's top.
- Tests: a 3D tab's peak exactly at its middle, never cut into along any move (within a micron), no
  vertical steps, passes above the floor rising only where the tab comes through them, and a finishing pass
  starting at a tab, flat or 3D. Checked by breaking the engine four ways: each was caught.
- The CAM reference describes both tab shapes, and no longer says tabs are "full height along their length".

### 0.94.1 — tabs as thick as they say, and toolpaths tested
- **Fixed: tabs on a through cut were thinner than set.** Their height was measured from the bottom of the
  cut, which for a through cut is the overcut below the material, so a 0.5 mm tab with the usual 0.2 mm
  overcut left only 0.3 mm of material, 40% less than the editor said. A tab's thickness is now the
  material it leaves, measured from the bottom of the material, whenever a cut goes below it. Found by the
  new toolpath tests. The CAM reference now says what tab thickness means.
- **Toolpaths are tested**, made through Design's own toolpath editor with the CAM engine loaded, and
  checked against geometry worked out independently: profiles (the cutter's centre never closer than its
  radius, outside or inside, and at most 0.011 mm farther: the engine pads offsets by its 0.01 mm
  simplifying tolerance, on purpose), passes, through cuts with Z zero on top or on the spoilboard, tabs,
  a pocket with an island (never touching a wall or the island, and every point of the floor cleared),
  drilling, chamfers, a V-carve's depth and centre line, and the job's G-code read back by 454 Control's
  own parser. Checked by breaking the code eight ways (the tab bug among them): each was caught.
- The test harness starts Design's page as the browser does (its own startup code), so its controls
  listen as they do there, and its select lists and checkboxes behave as a browser's.

### Tests for its file formats (no change in behaviour)
- **Design's code now has tests**, run on its **real source files** in Node (`apps/design/test/harness.mjs`
  loads them in the page's order, with Design's own markup as the page; linkedom supplies the DOM and SVG
  parser, as a development-only dependency). No rewriting into modules first: the tests exercise exactly
  the code Design runs.
- **16 tests of its file formats**: reading DXF (lines, circles, arcs, polyline bulges, blocks placed
  scaled and rotated, splines, ellipses, layers off or locked, units, what isn't imported), writing DXF
  and reading it back (a clockwise arc returns as the same arc drawn anticlockwise, as DXF stores arcs; a
  rectangle as its outline), reading SVG (units, the Y flip, arc direction, Bézier accuracy, transforms,
  Inkscape layers, hidden and unsupported elements), Design's own SVG returning exactly where it was, and
  adding a file to a drawing. Checked by breaking the code seven ways: each break was caught.
- GitHub runs them on every push.

### Source split into files (no change in behaviour)
- **Design is now worked on as 67 source files** in `apps/design/src` (its styles, the CAM loader, and its
  code by subject: the model, fonts, text, dimensions, snapping, the tool manager, toolpaths and their
  editor, each import and export format, the tool library, drawing, the geometry operations, and the
  page's wiring), assembled into the same single `design.html` by `node apps/design/build.mjs`.
- **Proven unchanged:** the build reassembles the original byte for byte (678,709 bytes, identical
  SHA-256); `design.html` now differs only by a note at its top. The end-to-end tests, importing, angle
  snapping and the SVG round trip all pass on it.
- The split names each cut by what it's at (a function, a banner, a heading), and keeps every comment
  with its code, whole block comments included. GitHub checks `design.html` matches its sources on every
  push, and before every Windows build. See `apps/design/README.md`.

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
