// Automatic updates for 454 Workshop, from GitHub Releases (electron-updater).
//
// What it promises:
//   - never in the way: a check in the background shows what it found in the header of 454 Control and
//     454 Design (src/renderer/update-badge.js), and nothing more; nothing happens until you click it
//   - never during a job: Restart to update is refused while 454 Control says the machine is busy (its own
//     machineBusy(): a job, probe, quick action or jog running, the spindle on, or the machine moving), and
//     the questions Check for updates asks wait until the machine is idle
//   - never forced: an update is offered (Download, or Skip this version), downloads in the background, and
//     installs when you choose to restart, or next time the app closes
//   - stable or beta: the beta channel also offers GitHub pre-releases
//   - honest about copies that can't update: one run from a zip, or a development build, says so
//
// Everything outside (the updater, the busy check, the dialogs, timers, the settings file) is passed in,
// so the decisions here can be tested without a network or a real update (test/updater.test.mjs).
'use strict';

const HOUR = 3600e3, MINUTE = 60e3;
// How often an installed copy checks for updates while it's open.
// TODO: change back to 6 * HOUR before the first public release. It's every 30 minutes for now, while beta
// releases come often and need testing. (The docs' "The desktop app" page says so too: change it there.)
const CHECK_EVERY = 30 * MINUTE;

// What a check with nothing to install says: also when the newest release can't be offered (published without
// its update files, or none published for this channel). To the person checking, that's no new updates.
const NO_UPDATES = { type: 'info', title: 'Updates', message: 'There are no new updates available.', buttons: ['OK'] };

function createUpdater(deps) {
  const { autoUpdater, isBusy, ask, setProgress = () => {}, currentVersion, installable,
          settingsFile, fs, timers = { setTimeout, clearTimeout }, log = () => {},
          firstCheckAfter = 30e3, checkEvery = CHECK_EVERY, idlePoll = MINUTE, busyPoll = 3e3, onChange = () => {} } = deps;

  // ---- settings: automatic checks, the channel, a skipped version
  let settings = { auto: true, channel: 'stable', skipped: null };
  try { settings = Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile, 'utf8'))); } catch (e) { /* first run: defaults */ }
  function save() { try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); } catch (e) { log('could not save update settings: ' + e.message); } }

  // failed: why the last download didn't finish (shown in the header); busy: the machine, as last seen
  // while an update waits to be installed
  const state = { phase: 'idle', available: null, downloaded: null, manual: false, timer: null, waiting: null,
                  progress: 0, failed: null, busy: false, busyTimer: null };

  function configure() {
    autoUpdater.autoDownload = false;              // offered first, never downloaded unasked
    autoUpdater.autoInstallOnAppQuit = true;       // "Later" installs when the app next closes
    autoUpdater.allowPrerelease = settings.channel === 'beta';
    autoUpdater.allowDowngrade = false;
  }

  // ---- waiting for the machine: run fn once 454 Control says it's idle
  async function busy() { try { return !!(await isBusy()); } catch (e) { return false; } }
  function whenIdle(fn) {
    if (state.waiting) timers.clearTimeout(state.waiting);
    const tryNow = async () => {
      state.waiting = null;
      if (await busy()) { state.waiting = timers.setTimeout(tryNow, idlePoll); return; }
      fn();
    };
    tryNow();
  }

  // ---- checking
  function schedule(ms) {
    if (state.timer) timers.clearTimeout(state.timer);
    state.timer = settings.auto && installable.ok ? timers.setTimeout(() => { check(false); schedule(checkEvery); }, ms) : null;
  }
  async function check(manual) {
    if (!installable.ok){
      if (manual) await ask({ type: 'info', title: 'Updates', message: 'This copy of 454 Workshop can\u2019t update itself.', detail: installable.why, buttons: ['OK'] });
      return;
    }
    if (state.phase === 'checking' || state.phase === 'downloading') {
      if (manual) await ask({ type: 'info', title: 'Updates', message: state.phase === 'checking' ? 'Already checking for updates.' : 'An update is already downloading.', buttons: ['OK'] });
      return;
    }
    if (state.downloaded) { if (manual) offerRestart(); return; }
    state.manual = manual; state.phase = 'checking'; onChange();
    configure();
    try { await autoUpdater.checkForUpdates(); }
    catch (e) { onError(e); }
  }

  function notesOf(info) {
    let n = info && info.releaseNotes;
    if (Array.isArray(n)) n = n.map((x) => x.note || '').join('\n');
    n = String(n || '').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<li>/gi, '\u2022 ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\u2019').replace(/\n{3,}/g, '\n\n').trim();
    return n.length > 600 ? n.slice(0, 600).replace(/\s+\S*$/, '') + '\u2026' : n;
  }

  async function onAvailable(info) {
    const manual = state.manual;
    state.phase = 'idle'; state.available = info; state.failed = null; onChange();
    // found in the background: the header shows it (unless it was skipped), and nothing else
    if (!manual) { log('update ' + info.version + (settings.skipped === info.version ? ' skipped earlier' : ' available: shown in the header')); return; }
    whenIdle(async () => {
      const notes = notesOf(info);
      const choice = await ask({ type: 'info', title: 'Update available',
        message: '454 Workshop ' + info.version + ' is available.',
        detail: 'You have ' + currentVersion + '.' + (notes ? '\n\nWhat\u2019s new:\n' + notes : '') +
                '\n\nIt downloads in the background, and installs when you restart 454 Workshop, whenever suits you. Nothing interrupts a job.',
        buttons: ['Download', 'Later', 'Skip this version'], defaultId: 0, cancelId: 1 });
      if (choice === 0) download();
      else if (choice === 2) skip();
    });
  }
  async function onNotAvailable(info) {
    const manual = state.manual;
    state.phase = 'idle'; state.available = null; state.failed = null; onChange();
    if (manual) await ask(NO_UPDATES);
  }
  function onProgress(p) {
    const f = Math.max(0, Math.min(1, (p && p.percent || 0) / 100));
    setProgress(f);
    const whole = Math.floor(f * 100) !== Math.floor(state.progress * 100);   // the header shows whole percents
    state.progress = f;
    if (whole) onChange();
  }
  // Downloaded: the header's notice becomes Restart to update, and nothing else appears.
  function onDownloaded(info) {
    setProgress(-1);
    state.phase = 'ready'; state.downloaded = info; state.progress = 1; state.failed = null; onChange();
    log('update ' + info.version + ' downloaded: Restart to update in the header');
    watchBusy();
  }
  // While an update waits, keep the header told whether the machine is busy, so Restart to update is
  // plainly unavailable during a job (restart() checks again when it's clicked).
  function watchBusy() {
    if (state.busyTimer) timers.clearTimeout(state.busyTimer);
    const look = async () => {
      state.busyTimer = null;
      if (!state.downloaded || state.phase === 'restarting') return;
      const b = await busy();
      if (b !== state.busy) { state.busy = b; onChange(); }
      state.busyTimer = timers.setTimeout(look, busyPoll);
    };
    look();
  }

  // ---- what the header's notice does, each only when it's clicked
  async function download() {
    if (!state.available || state.downloaded || state.phase === 'downloading' || state.phase === 'checking') return;
    state.phase = 'downloading'; state.progress = 0; state.failed = null; onChange();
    try { await autoUpdater.downloadUpdate(); } catch (e) { onError(e); }
  }
  function skip() {
    if (!state.available || state.downloaded) return;
    settings.skipped = state.available.version; save(); onChange();
  }
  async function restart() {
    if (!state.downloaded || state.phase === 'restarting') return { ok: false };
    if (await busy()) { state.busy = true; onChange(); return { ok: false, busy: true }; }
    state.phase = 'restarting'; onChange();
    autoUpdater.quitAndInstall(false, true);       // install, then start the new version
    return { ok: true };
  }
  function offerRestart() {
    whenIdle(async () => {
      const info = state.downloaded;
      const choice = await ask({ type: 'info', title: 'Update ready',
        message: '454 Workshop ' + info.version + ' is ready to install.',
        detail: 'Restart now to install it, or later: it installs when you next close 454 Workshop. Restarting disconnects the machine.',
        buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1 });
      if (choice !== 0) return;
      if (await busy()) {                          // the machine got busy while the question was open
        await ask({ type: 'warning', title: 'Update ready', message: 'The machine is busy.',
          detail: 'The update will install when you close 454 Workshop, or offer again when the machine is idle.', buttons: ['OK'] });
        return;
      }
      state.phase = 'restarting'; onChange();
      autoUpdater.quitAndInstall(false, true);     // install, then start the new version
    });
  }
  async function onError(e) {
    const msg = String(e && e.message || e);
    // electron-updater both emits 'error' and rejects the call that failed: handle each failure once
    if (state.lastError && state.lastError.msg === msg && Date.now() - state.lastError.at < 5000) return;
    state.lastError = { msg, at: Date.now() };
    const manual = state.manual, downloading = state.phase === 'downloading';
    setProgress(-1);
    const why = ' (' + msg.split('\n')[0].slice(0, 200) + ')';
    // you asked for it, so a failed download is always reported: in the header, with Try again, where
    // it can't get in the way of a job as a window could
    if (downloading) state.failed = (/checksum|sha512/i.test(msg) ? 'The downloaded file didn\u2019t match the release, so it wasn\u2019t installed.' : explain(msg)) + why;
    state.phase = 'idle'; onChange();
    log('update error: ' + msg);
    if (downloading) return;
    if (manual){
      if (nothingToOffer(msg)) await ask(NO_UPDATES);    // a release that can't be installed isn't an update
      else await ask({ type: 'warning', title: 'Updates', message: 'Couldn\u2019t check for updates.', detail: explain(msg) + why, buttons: ['OK'] });
    }
  }
  // The newest release has nothing the app can install: published without its update files (the release was
  // made by hand rather than by publishing the Windows build's draft), or no release for this channel yet.
  function nothingToOffer(msg) {
    return (/cannot find (\S+\.yml)|\b(latest|beta|alpha)\.yml\b.*404/i.test(msg) && /cannot find|404/i.test(msg)) ||
           /Unable to find latest version|No published versions|production release exists/i.test(msg);
  }
  // What went wrong, in words: most failures aren't the connection, so don't blame it unless it is
  function explain(msg) {
    if (/Cannot find (\S+\.yml)|latest\.yml|beta\.yml|alpha\.yml/i.test(msg) && /cannot find|404/i.test(msg))
      return 'The newest release on GitHub is missing its update file (' + ((/(\w+\.yml)/.exec(msg) || [])[1] || 'latest.yml') +
             '), so it can\u2019t be offered as an update. The release needs the files the Windows build attaches to its draft.';
    if (/Unable to find latest version|No published versions|production release exists/i.test(msg))
      return settings.channel === 'beta' ? 'There\u2019s no published release on GitHub yet.'
        : 'There\u2019s no published stable release on GitHub yet. Pre-releases are only offered on the Beta channel (454 Workshop \u2192 Updates).';
    if (/rate limit|\b403\b|\b429\b/i.test(msg)) return 'GitHub is limiting requests for now. Try again in a while.';
    if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|ERR_PROXY/i.test(msg))
      return 'GitHub couldn\u2019t be reached. Check your internet connection and try again.';
    return 'Something went wrong asking GitHub for updates.';
  }

  autoUpdater.on('update-available', onAvailable);
  autoUpdater.on('update-not-available', onNotAvailable);
  autoUpdater.on('download-progress', onProgress);
  autoUpdater.on('update-downloaded', onDownloaded);
  autoUpdater.on('error', onError);

  return {
    start() { configure(); schedule(firstCheckAfter); },
    checkNow() { return check(true); },
    download, skip, restart,
    setAuto(on) { settings.auto = !!on; save(); schedule(on ? firstCheckAfter : 0); onChange(); },
    setChannel(ch) {
      settings.channel = ch === 'beta' ? 'beta' : 'stable'; settings.skipped = null; save(); configure();
      if (!state.downloaded && state.phase !== 'downloading') { state.available = null; state.failed = null; }   // found on the other channel
      onChange();
    },
    get settings() { return Object.assign({}, settings); },
    get state() { return { phase: state.phase, available: state.available && state.available.version, downloaded: state.downloaded && state.downloaded.version }; },
    // What the header's notice shows (src/renderer/update-badge.js). phase: none, available, downloading,
    // failed, ready or restarting.
    get view() {
      const base = { current: currentVersion, busy: state.busy };
      const version = state.downloaded ? state.downloaded.version : state.available && state.available.version;
      if (state.phase === 'restarting') return { ...base, phase: 'restarting', version };
      if (state.downloaded) return { ...base, phase: 'ready', version };
      if (state.phase === 'downloading') return { ...base, phase: 'downloading', version, progress: state.progress };
      if (state.failed && state.available) return { ...base, phase: 'failed', version, error: state.failed };
      if (state.available && state.available.version !== settings.skipped) return { ...base, phase: 'available', version, notes: notesOf(state.available) };
      return { ...base, phase: 'none' };
    },
    installable,
  };
}

// Can this copy update itself? Only an installed copy: on Windows, one the installer put there (it leaves
// an uninstaller beside the program); on Linux, an AppImage. A copy run from a zip, or a development
// build, can't.
function installability({ platform, isPackaged, execPath, env, fs, path, productName }) {
  if (!isPackaged) return { ok: false, why: 'This is a development build. Updates work in the installed app.' };
  if (platform === 'win32') {
    const uninstaller = path.join(path.dirname(execPath), 'Uninstall ' + productName + '.exe');
    return fs.existsSync(uninstaller) ? { ok: true } :
      { ok: false, why: 'It was run from a zip rather than installed. To get updates, install 454 Workshop with the installer from GitHub Releases; your settings, tools and drawings carry over.' };
  }
  if (platform === 'linux') return env.APPIMAGE ? { ok: true } : { ok: false, why: 'Updates work in the AppImage version.' };
  return { ok: false, why: 'Updates aren\u2019t available on this system yet.' };
}

module.exports = { createUpdater, installability };
