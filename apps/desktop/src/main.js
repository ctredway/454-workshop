// 454 desktop: 454 Control and 454 Design in their own windows, and the machine process that owns the
// serial port. Pages are served from the app's own files through a private app:// scheme: it lets them
// fetch their bundled files (fonts, the tool-database reader) and gives both one shared home for saved
// data, so Design sees Control's work area and both share the tool library.
'use strict';
const { app, BrowserWindow, utilityProcess, MessageChannelMain, dialog, Menu, shell, protocol, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, '..', 'app');
const ORIGIN = 'app://454';
// "454" looks like a number, and the page side reads a numeric host as an IP address: pages actually
// live at app://0.0.1.198/ (454 = 0.0.1.198). Node's URL doesn't do that for app:, and gives every app:
// address the origin "null", so origins can't be compared here: check the scheme and both forms of the
// host instead. (Changing the host would move where both apps keep their saved data.)
const PAGE_HOSTS = ['454', '0.0.1.198'];
// what this build contains (written by scripts/build-app.js)
const BUILD = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'build-info.json'), 'utf8')); } catch (e) { return { cam: false }; } })();
function isAppPage(u) { return u.protocol === 'app:' && PAGE_HOSTS.indexOf(u.host) >= 0; }
// The app is "454 Workshop", but its saved data (tool library, settings, drawings) has always been in a
// folder named "454", and Electron names that folder after the app. Keep using it, so renaming the app
// doesn't make everything seem to vanish.
app.setPath('userData', path.join(app.getPath('appData'), '454'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let control = null, design = null, machine = null;
const docsWindows = new Set();

// ---- the machine process
function startMachine() {
  machine = utilityProcess.fork(path.join(__dirname, 'machine', 'machine.js'), [], { serviceName: '454 machine' });
  machine.on('exit', (code) => {
    machine = null;
    if (app.isQuitting) return;
    // It should never stop on its own. If it does, say so plainly and start a new one: the connection
    // is gone, so Control will show the machine as disconnected.
    dialog.showErrorBox('The machine connection stopped', `454 Workshop's connection process exited (code ${code}). It will restart; reconnect to the machine before carrying on.`);
    startMachine(); linkControl();
  });
}
// A fresh direct channel between Control's page and the machine process, each time the page loads.
function linkControl() {
  if (!control || control.isDestroyed() || !machine) return;
  const { port1, port2 } = new MessageChannelMain();
  machine.postMessage({ type: 'window' }, [port1]);
  control.webContents.postMessage('machine-port', null, [port2]);
}

// ---- windows
function guardClose(win) {
  // A page blocks closing while something is in progress (Control: the machine is busy). In a browser
  // that shows the browser's own prompt; here it needs a real one.
  win.webContents.on('will-prevent-unload', (e) => {
    const isControl = win === control;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Keep it open', 'Close anyway'], defaultId: 0, cancelId: 0,
      title: isControl ? 'The machine is busy' : 'Close this window?',
      message: isControl ? 'The machine is busy.' : 'This window has something in progress.',
      detail: isControl ? 'A job, probe or jog is in progress, or the spindle is on. Closing now stops sending partway through. Stop it in 454 first if you can.'
                        : 'Closing it now may lose what you were doing.',
    });
    if (choice === 1) e.preventDefault();
  });
}
function route(url) {
  if (process.env.P454_E2E_OUT) fs.appendFileSync(process.env.P454_E2E_OUT + '.routes', url + '\n');
  // Links between the apps open the right window; the docs get their own; the web goes to the browser.
  if (/^https?:/i.test(url)) { shell.openExternal(url); return; }
  let u; try { u = new URL(url); } catch (e) { return; }
  if (!isAppPage(u)) return;                                  // anything else (mailto:, other schemes): ignored
  const p = u.pathname;
  if (['/design.html', '/design', '/design/'].includes(p)) showDesign();
  else if (['/', '/index.html', '/control', '/control/'].includes(p)) showControl();     // the website's /control/ is Control here
  else openDocs(url);
}
function wire(win) {
  guardClose(win);
  win.webContents.setWindowOpenHandler(({ url }) => { route(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    const here = win.webContents.getURL().split('?')[0], there = url.split('?')[0].split('#')[0];
    if (docsWindows.has(win) && isDocsPage(there)) return;            // browsing the docs: stay in this window
    if (there !== here.split('#')[0]) { e.preventDefault(); route(url); }
  });
}
function makeWindow(url, title) {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 960, minHeight: 640, backgroundColor: '#14181d', title,
    icon: path.join(__dirname, 'assets', 'icon.png'),       // the window and taskbar on Linux (Windows takes it from the .exe)
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  wire(win);
  win.loadURL(url);
  return win;
}
function showControl() {
  if (control && !control.isDestroyed()) { control.show(); control.focus(); return control; }
  control = makeWindow(ORIGIN + '/index.html', '454 Control');
  control.webContents.on('did-finish-load', linkControl);
  control.on('closed', () => { control = null; });
  return control;
}
function showDesign() {
  if (design && !design.isDestroyed()) { design.show(); design.focus(); return design; }
  // with CAM if this build has it; otherwise firmly off (?cam=off also clears a "CAM on" choice an
  // earlier build left in storage, which would otherwise ask for files this build doesn't have)
  design = makeWindow(ORIGIN + '/design.html?' + (BUILD.cam ? 'cam' : 'cam=off'), '454 Design');
  design.on('closed', () => { design = null; });
  return design;
}
let aboutWin = null;
function openAbout() {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.focus(); return aboutWin; }
  const about = aboutWin = new BrowserWindow({ width: 440, height: 470, resizable: false, minimizable: false, maximizable: false, backgroundColor: '#14181d',
    title: 'About 454 Workshop', icon: path.join(__dirname, 'assets', 'icon.png'), autoHideMenuBar: true,
    parent: BrowserWindow.getFocusedWindow() || undefined,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  about.setMenu(null);
  wire(about); about.loadURL(ORIGIN + '/about.html');
  about.on('closed', () => { aboutWin = null; });
  return about;
}
function isDocsPage(url) { try { const u = new URL(url); return isAppPage(u) && /^\/docs(\/|$)/.test(u.pathname); } catch (e) { return false; } }
function openDocs(url) {
  const open = [...docsWindows].find((d) => !d.isDestroyed());           // one docs window: reuse it
  if (open) { open.loadURL(url); if (open.isMinimized()) open.restore(); open.focus(); return open; }
  const w = new BrowserWindow({ width: 1000, height: 820, backgroundColor: '#14181d', title: '454 Workshop docs', icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  wire(w); w.loadURL(url); docsWindows.add(w); w.on('closed', () => docsWindows.delete(w));
  return w;
}

// ---- automatic updates (src/updater.js): from GitHub Releases, never during a job, never forced
const { createUpdater, installability } = require('./updater');
let updater = null;
function askUser(opts) {
  // tests only: answers given in advance, and every question written down
  if (process.env.P454_UPDATE_ANSWERS !== undefined) {
    askUser.q = askUser.q || process.env.P454_UPDATE_ANSWERS.split(',').filter((x) => x !== '').map(Number);
    if (process.env.P454_UPDATE_LOG) fs.appendFileSync(process.env.P454_UPDATE_LOG, JSON.stringify({ t: Date.now(), message: opts.message, buttons: opts.buttons }) + '\n');
    return Promise.resolve(askUser.q.length ? askUser.q.shift() : (opts.cancelId !== undefined ? opts.cancelId : 0));
  }
  const parent = BrowserWindow.getFocusedWindow() || (design && !design.isDestroyed() ? design : null) || (control && !control.isDestroyed() ? control : null);
  return (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts)).then((r) => r.response);
}
function setupUpdates() {
  const feed = process.env.P454_UPDATE_FEED;          // tests only: a local update server
  const { autoUpdater } = require('electron-updater');
  if (feed) {                                     // tests only: an unpackaged build, told where the test server is
    const cfg = path.join(require('os').tmpdir(), 'p454-update-test.yml');
    fs.writeFileSync(cfg, 'provider: generic\nurl: ' + feed + '\nupdaterCacheDirName: p454-update-test\n');
    autoUpdater.forceDevUpdateConfig = true; autoUpdater.updateConfigPath = cfg;
  }
  updater = createUpdater({
    autoUpdater, fs, currentVersion: app.getVersion(),
    installable: feed ? { ok: true } : installability({ platform: process.platform, isPackaged: app.isPackaged, execPath: process.execPath,
                                                        env: process.env, fs, path, productName: '454 Workshop' }),
    // 454 Control's own judgement: a job, probe, quick action or jog running, the spindle on, the machine moving
    isBusy: () => control && !control.isDestroyed()
      ? control.webContents.executeJavaScript('typeof machineBusy === "function" ? machineBusy() : false', true) : Promise.resolve(false),
    ask: askUser,
    notify: (title, body) => { if (Notification.isSupported()) new Notification({ title, body }).show(); },
    setProgress: (p) => BrowserWindow.getAllWindows().forEach((w) => { if (!w.isDestroyed()) w.setProgressBar(p); }),
    settingsFile: path.join(app.getPath('userData'), 'updates.json'),
    log: (m) => { console.log('[updates] ' + m); if (process.env.P454_UPDATE_LOG) fs.appendFileSync(process.env.P454_UPDATE_LOG, JSON.stringify({ log: m }) + '\n'); },
    onChange: () => Menu.setApplicationMenu(menu()),
    firstCheckAfter: feed ? (+process.env.P454_UPDATE_FIRST || 500) : 30e3,
    idlePoll: feed ? 2000 : 60e3,                  // how often to look for an idle machine (quicker in tests)
  });
  updater.start();
}
function updateMenu() {
  if (!updater) return [];
  const s = updater.settings, st = updater.state, ok = updater.installable.ok;
  return [
    { label: st.downloaded ? 'Restart to update to ' + st.downloaded + '\u2026' : 'Check for updates\u2026', click: () => updater.checkNow() },
    { label: 'Updates', submenu: [
      { label: 'Check automatically', type: 'checkbox', checked: s.auto && ok, enabled: ok, click: (i) => updater.setAuto(i.checked) },
      { type: 'separator' },
      { label: 'Stable releases', type: 'radio', checked: s.channel !== 'beta', enabled: ok, click: () => updater.setChannel('stable') },
      { label: 'Beta: pre-releases too', type: 'radio', checked: s.channel === 'beta', enabled: ok, click: () => updater.setChannel('beta') },
    ] },
  ];
}
function menu() {
  const focused = () => BrowserWindow.getFocusedWindow();
  return Menu.buildFromTemplate([
    { label: '454 Workshop', submenu: [
      { label: '454 Control', accelerator: 'CmdOrCtrl+1', click: showControl },
      { label: '454 Design', accelerator: 'CmdOrCtrl+2', click: showDesign },
      { label: 'Docs', click: () => openDocs(ORIGIN + '/docs/index.html') },
      { type: 'separator' },
      { label: 'About 454 Workshop', click: openAbout },
      ...updateMenu(),
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { label: 'Toggle developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => { const w = focused(); if (w) w.webContents.toggleDevTools(); } },
    ] },
  ]);
}

// ---- tests only (never set in normal use): run a script in a page once it's up, save the result, quit
function testHook() {
  if (process.env.P454_SHOT_ABOUT) {
    const w = openAbout();
    w.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 800));
      fs.writeFileSync(process.env.P454_SHOT_ABOUT, (await w.webContents.capturePage()).toPNG());
      app.isQuitting = true; app.exit(0);
    });
    return true;
  }
  const jobs = [];
  if (process.env.P454_E2E) jobs.push({ win: () => showControl(), script: process.env.P454_E2E, out: process.env.P454_E2E_OUT, shot: process.env.P454_E2E_SHOT });
  if (process.env.P454_E2E_DOCS) jobs.push({ win: () => openDocs(ORIGIN + (process.env.P454_E2E_DOCS_PAGE || '/docs/index.html')), script: process.env.P454_E2E_DOCS, out: process.env.P454_E2E_DOCS_OUT, shot: process.env.P454_E2E_DOCS_SHOT });
  if (process.env.P454_E2E_DESIGN) jobs.push({ win: () => showDesign(), script: process.env.P454_E2E_DESIGN, out: process.env.P454_E2E_DESIGN_OUT, shot: process.env.P454_E2E_DESIGN_SHOT });
  if (process.env.P454_E2E_ABOUT) jobs.push({ win: () => openAbout(), script: process.env.P454_E2E_ABOUT, out: process.env.P454_E2E_ABOUT_OUT, shot: true });
  if (!jobs.length) return false;
  let left = jobs.length;
  jobs.forEach((j) => {
    const w = j.win();
    w.webContents.on('console-message', (_e, level, message, line, source) => fs.appendFileSync(j.out + '.console', `[${level}] ${message} (${path.basename(source || '')}:${line})\n`));
    w.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1200));
      let result;
      try { result = await w.webContents.executeJavaScript(fs.readFileSync(j.script, 'utf8')); }
      catch (e) { result = { error: String((e && e.message) || e) }; }
      await new Promise((r) => setTimeout(r, 1500));          // let any window the page opened appear
      if (j.shot) fs.writeFileSync(j.shot, (await w.webContents.capturePage()).toPNG());   // a picture of the window, for docs
      result = Object.assign({}, result, { windows: BrowserWindow.getAllWindows().map((x) => ({ title: x.getTitle(), url: x.webContents.getURL() })) });
      if (j.shot) fs.writeFileSync(j.out + '.png', (await w.webContents.capturePage()).toPNG());
      fs.writeFileSync(j.out, JSON.stringify(result, null, 1));
      if (--left === 0) { app.isQuitting = true; app.exit(0); }
    });
  });
  return true;
}

app.whenReady().then(() => {
  // app:// serves only files inside the app's own folder
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let file = path.normalize(path.join(APP_DIR, decodeURIComponent(u.pathname)));
    if (!file.startsWith(APP_DIR + path.sep) && file !== APP_DIR) return new Response('Not found', { status: 404 });
    // the docs link to /docs/page (served from page.html) and to /docs (its index.html)
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(menu());
  startMachine();
  const testing = testHook();                      // starts any test jobs: call it once
  if (!testing || process.env.P454_UPDATE_FEED) setupUpdates();
  if (!testing) showDesign();                  // Design first; Control opens from the menu (Ctrl+1) or its header button
  if (process.env.P454_LIST_WINDOWS) setTimeout(() => {          // tests only: which windows opened at launch
    fs.writeFileSync(process.env.P454_LIST_WINDOWS, JSON.stringify(BrowserWindow.getAllWindows().map((w) => w.getTitle())));
    app.isQuitting = true; app.exit(0);
  }, 4000);
});
app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => { if (machine) machine.kill(); app.quit(); });
