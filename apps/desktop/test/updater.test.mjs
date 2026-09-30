// The updater's decisions (src/updater.js), with a fake electron-updater, a fake machine, fake timers and
// an in-memory settings file: no network, no real update.
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createUpdater, installability } = require('../src/updater.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 12; i++) await flush(); }

function rig(opts = {}) {
  const au = new EventEmitter();
  au.calls = [];
  au.checkForUpdates = async () => { au.calls.push('check'); };
  au.downloadUpdate = async () => { au.calls.push('download'); };
  au.quitAndInstall = (silent, run) => { au.calls.push('quitAndInstall'); };
  const files = { '/u.json': opts.saved ? JSON.stringify(opts.saved) : undefined };
  const fs = { readFileSync: (f) => { if (files[f] === undefined) throw new Error('none'); return files[f]; }, writeFileSync: (f, t) => { files[f] = t; } };
  const machine = { busy: !!opts.busy };
  const asked = [], answers = [...(opts.answers || [])];
  const pending = [];                                       // fake timers: run by hand
  const timers = { setTimeout: (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; }, clearTimeout: (t) => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); } };
  const u = createUpdater({
    autoUpdater: au, fs, timers, settingsFile: '/u.json', currentVersion: opts.version || '0.6.0',
    installable: opts.installable || { ok: true },
    isBusy: async () => machine.busy,
    beforeRestart: opts.beforeRestart,
    ask: async (o) => { asked.push(o); return answers.length ? answers.shift() : (o.cancelId !== undefined ? o.cancelId : 0); },
  });
  const runTimers = async () => { const now = pending.splice(0); for (const t of now) t.fn(); await settle(); };
  return { u, au, fs, files, machine, asked, answers, pending, runTimers };
}
const release = (v, notes) => ({ version: v, releaseNotes: notes || '<p>New: <b>automatic updates</b>.</p><ul><li>Faster</li></ul>' });

describe('which copies can update themselves', () => {
  const fsWith = (files) => ({ existsSync: (f) => files.includes(f) });
  const base = { path: path.win32, productName: '454 Workshop', env: {} };
  it('an installed Windows copy can', () => {
    const exe = 'C:\\Users\\c\\AppData\\Local\\Programs\\454 Workshop\\454 Workshop.exe';
    const un = 'C:\\Users\\c\\AppData\\Local\\Programs\\454 Workshop\\Uninstall 454 Workshop.exe';
    expect(installability({ ...base, platform: 'win32', isPackaged: true, execPath: exe, fs: fsWith([un]) }).ok).toBe(true);
  });
  it('a copy run from a zip can\u2019t, and says how to get updates', () => {
    const r = installability({ ...base, platform: 'win32', isPackaged: true, execPath: 'D:\\Downloads\\454\\454 Workshop.exe', fs: fsWith([]) });
    expect(r.ok).toBe(false); expect(r.why).toMatch(/zip/); expect(r.why).toMatch(/installer/);
  });
  it('a development build can\u2019t', () => {
    expect(installability({ ...base, platform: 'win32', isPackaged: false, execPath: 'x', fs: fsWith([]) }).ok).toBe(false);
  });
  it('on Linux, only the AppImage can', () => {
    const p = { ...base, path: path.posix, platform: 'linux', isPackaged: true, execPath: '/tmp/x', fs: fsWith([]) };
    expect(installability({ ...p, env: { APPIMAGE: '/home/c/454.AppImage' } }).ok).toBe(true);
    expect(installability(p).ok).toBe(false);
  });
});

describe('checking and offering', () => {
  it('checks 30 seconds after starting, then every 30 minutes', async () => {
    // (30 minutes while betas come often; change to 6 hours with CHECK_EVERY in src/updater.js, and here)
    const r = rig();
    r.u.start();
    expect(r.pending.map((t) => t.ms)).toEqual([30e3]);
    await r.runTimers();
    expect(r.au.calls).toEqual(['check']);
    expect(r.pending.map((t) => t.ms)).toEqual([30 * 60e3]);
  });
  it('an update found in the background shows in the header, asks nothing, and downloads only when clicked', async () => {
    const r = rig();
    r.u.start();
    expect(r.pending.length).toBe(1);                       // the first check is scheduled, not immediate
    await r.runTimers();
    expect(r.au.calls).toEqual(['check']);
    expect(r.au.autoDownload).toBe(false);
    r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(0);                         // no window
    const v = r.u.view;
    expect(v.phase).toBe('available');
    expect(v.version).toBe('0.6.1');
    expect(v.current).toBe('0.6.0');
    expect(v.notes).toMatch(/automatic updates/);           // release notes, without their HTML
    expect(v.notes).not.toMatch(/<b>|<li>/);
    expect(r.au.calls).toEqual(['check']);                  // nothing downloaded unasked
    r.u.download(); await settle();
    expect(r.au.calls).toEqual(['check', 'download']);
    expect(r.u.view.phase).toBe('downloading');
  });
  it('the header shows the download’s progress, then Restart to update, and no window appears', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.download(); await settle();
    r.au.emit('download-progress', { percent: 42.7 }); await settle();
    expect(r.u.view.progress).toBeCloseTo(0.427);
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.u.view).toMatchObject({ phase: 'ready', version: '0.6.1', busy: false });
    expect(r.asked.length).toBe(0);
    expect(r.au.calls).not.toContain('quitAndInstall');
  });
  it('checking by hand still asks, and Download there shows its progress in the header', async () => {
    const r = rig({ answers: [0] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(1);
    expect(r.asked[0].message).toBe('454 Workshop 0.6.1 is available.');
    expect(r.asked[0].buttons).toEqual(['Download', 'Later', 'Skip this version']);
    expect(r.asked[0].detail).toMatch(/You have 0\.6\.0/);
    expect(r.asked[0].detail).toMatch(/automatic updates/);
    expect(r.au.calls).toEqual(['check', 'download']);
    expect(r.u.view.phase).toBe('downloading');
  });
  it('Later downloads nothing', async () => {
    const r = rig({ answers: [1] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.au.calls).toEqual(['check']);
  });
  it('a background check with nothing new, or failing, stays quiet', async () => {
    const r = rig(); r.u.start(); await r.runTimers();
    r.au.emit('update-not-available', { version: '0.6.0' }); await settle();
    await r.runTimers();                                    // the next scheduled check
    r.au.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED')); await settle();
    expect(r.asked.length).toBe(0);
  });
  it('checking by hand says so either way', async () => {
    const r = rig();
    await r.u.checkNow(); r.au.emit('update-not-available', { version: '0.6.0' }); await settle();
    expect(r.asked[0].message).toBe('There are no new updates available.');
    expect(r.asked[0].detail).toBeUndefined();
    await r.u.checkNow(); r.au.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED')); await settle();
    expect(r.asked[1].message).toBe('Couldn\u2019t check for updates.');
    expect(r.asked[1].detail).toMatch(/internet connection/);
  });
  it('a release that can\u2019t be installed is simply no new updates, not an error', async () => {
    for (const msg of [
      'Cannot find latest.yml in the latest release artifacts (https://github.com/ctredway/454-workshop/releases/download/v0.6.2-beta.9/latest.yml): HttpError: 404',
      'Unable to find latest version on GitHub (https://github.com/ctredway/454-workshop/releases/latest), please ensure a production release exists: HttpError: 404',
      'No published versions on GitHub',
    ]) {
      const r = rig();
      await r.u.checkNow(); r.au.emit('error', new Error(msg)); await settle();
      expect(r.asked.length, msg).toBe(1);
      expect(r.asked[0].message, msg).toBe('There are no new updates available.');
      expect(r.asked[0].type, msg).toBe('info');
    }
  });
  it('real problems still say what went wrong, and only blame the connection when it is the connection', async () => {
    const cases = [
      ['HttpError: 403 Forbidden "API rate limit exceeded"', /limiting requests/],
      ['net::ERR_NAME_NOT_RESOLVED', /couldn\u2019t be reached\. Check your internet connection/],
      ['something unexpected', /Something went wrong/],
    ];
    for (const [msg, expected] of cases) {
      const r = rig();
      await r.u.checkNow(); r.au.emit('error', new Error(msg)); await settle();
      expect(r.asked[0].message, msg).toBe('Couldn\u2019t check for updates.');
      expect(r.asked[0].detail, msg).toMatch(expected);
      if (!/ERR_NAME/.test(msg)) expect(r.asked[0].detail, msg).not.toMatch(/internet connection/);
    }
  });
});

describe('downloads', () => {
  it('a download that fails is reported in the header, not in a window, once, with the reason; Try again downloads again', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();                      // a background check...
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.download(); await settle();                        // ...you click Download...
    const err = new Error('sha512 checksum mismatch, expected abc, got def');
    r.au.emit('error', err); await settle();
    r.au.emit('error', err); await settle();               // the library reports it twice
    expect(r.asked.length).toBe(0);                        // no window: one could pop up in the middle of a job
    const v = r.u.view;
    expect(v.phase).toBe('failed');
    expect(v.error).toMatch(/didn’t match the release/);
    expect(r.au.calls).not.toContain('quitAndInstall');
    r.u.download(); await settle();                        // Try again
    expect(r.au.calls.filter((c) => c === 'download').length).toBe(2);
    expect(r.u.view.phase).toBe('downloading');
  });
  it('a newer check with nothing to offer clears the notice', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    await r.runTimers();
    r.au.emit('update-not-available', { version: '0.6.0' }); await settle();
    expect(r.u.view.phase).toBe('none');
  });
});

describe('never during a job', () => {
  it('Restart to update is refused while the machine is busy, and works once it’s idle', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.download(); await settle();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    r.machine.busy = true;
    expect(await r.u.restart()).toEqual({ ok: false, busy: true });
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.u.view.busy).toBe(true);
    r.machine.busy = false;
    expect(await r.u.restart()).toEqual({ ok: true });
    expect(r.au.calls).toContain('quitAndInstall');
    expect(r.u.view.phase).toBe('restarting');
  });
  it('while an update waits, the header is kept told whether the machine is busy', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.download(); await settle();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.u.view.busy).toBe(false);
    r.machine.busy = true; await r.runTimers();
    expect(r.u.view.busy).toBe(true);
    r.machine.busy = false; await r.runTimers();
    expect(r.u.view.busy).toBe(false);
  });
  it('Restart only works for a downloaded update', async () => {
    const r = rig();
    expect(await r.u.restart()).toEqual({ ok: false });
    expect(r.au.calls).not.toContain('quitAndInstall');
  });
  it('an update Check for updates finds while the machine is busy waits, and is offered once it’s idle', async () => {
    const r = rig({ busy: true, answers: [1] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(0);                         // nothing shown mid-job
    await r.runTimers(); expect(r.asked.length).toBe(0);    // still busy on the next look
    r.machine.busy = false;
    await r.runTimers();
    expect(r.asked.length).toBe(1);
    expect(r.asked[0].message).toMatch(/0\.6\.1 is available/);
  });
  it('Restart to update… in the menu asks, waits for an idle machine, and installs only if it’s still idle', async () => {
    const r = rig();
    r.u.start();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    r.machine.busy = true;
    r.u.checkNow(); await settle();
    expect(r.asked.length).toBe(0);                         // waiting for the machine
    r.machine.busy = false; r.answers.push(0);
    await r.runTimers();
    expect(r.asked[0].message).toBe('454 Workshop 0.6.1 is ready to install.');
    expect(r.asked[0].buttons).toEqual(['Restart now', 'Later']);
    expect(r.au.calls).toContain('quitAndInstall');
  });
  it('if the machine gets busy while the menu’s restart question is open, it doesn’t restart', async () => {
    const r = rig();
    r.u.start();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    r.answers.push(0);                                      // Restart now...
    const realAsk = r.asked.push.bind(r.asked);
    r.asked.push = (o) => { if (o.message && /ready to install/.test(o.message)) r.machine.busy = true; return realAsk(o); };   // ...as a job starts
    r.u.checkNow(); await settle();
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.asked[r.asked.length - 1].message).toBe('The machine is busy.');
  });
  it('an update that isn’t restarted for installs when the app closes', async () => {
    const r = rig();
    r.u.start();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.au.autoInstallOnAppQuit).toBe(true);
  });
});

describe('an unsaved drawing in 454 Design', () => {
  async function downloaded(r) {
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.download(); await settle();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
  }
  it('Restart to update asks Design first, and Cancel there stops the restart', async () => {
    const asked = [];
    const r = rig({ beforeRestart: async () => { asked.push('design'); return false; } });
    await downloaded(r);
    expect(await r.u.restart()).toEqual({ ok: false, cancelled: true });
    expect(asked).toEqual(['design']);
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.u.view.phase).toBe('ready');                   // still offered
  });
  it('once Design is settled (saved, or put aside), it restarts', async () => {
    const r = rig({ beforeRestart: async () => true });
    await downloaded(r);
    expect(await r.u.restart()).toEqual({ ok: true });
    expect(r.au.calls).toContain('quitAndInstall');
  });
  it('the menu’s Restart now asks Design too', async () => {
    const r = rig({ beforeRestart: async () => false, answers: [0] });
    r.u.start();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    r.u.checkNow(); await settle();
    expect(r.asked[0].message).toBe('454 Workshop 0.6.1 is ready to install.');
    expect(r.au.calls).not.toContain('quitAndInstall');
  });
  it('the machine is checked first: a busy machine refuses before Design is asked', async () => {
    const asked = [];
    const r = rig({ beforeRestart: async () => { asked.push('design'); return true; } });
    await downloaded(r);
    r.machine.busy = true;
    expect(await r.u.restart()).toEqual({ ok: false, busy: true });
    expect(asked).toEqual([]);
  });
});

describe('skipping, channels and settings', () => {
  it('a skipped version isn\u2019t offered again by background checks, but is when you check by hand', async () => {
    const r = rig({ answers: [2] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(JSON.parse(r.files['/u.json']).skipped).toBe('0.6.1');
    r.u.start(); await r.runTimers(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(1);
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(2);
    r.au.emit('update-available', release('0.6.2')); await settle();   // a newer one is offered again
    expect(r.asked.length).toBe(3);
  });
  it('Skip this version in the header hides it, and remembers', async () => {
    const r = rig();
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1')); await settle();
    r.u.skip();
    expect(r.u.view.phase).toBe('none');
    expect(JSON.parse(r.files['/u.json']).skipped).toBe('0.6.1');
    await r.runTimers(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.u.view.phase).toBe('none');
    await r.runTimers(); r.au.emit('update-available', release('0.6.2')); await settle();
    expect(r.u.view.phase).toBe('available');               // a newer one shows again
    expect(r.asked.length).toBe(0);
  });
  it('changing channel clears what the other channel found', async () => {
    const r = rig({ saved: { channel: 'beta' } });
    r.u.start(); await r.runTimers();
    r.au.emit('update-available', release('0.6.1-beta.3')); await settle();
    r.u.setChannel('stable');
    expect(r.u.view.phase).toBe('none');
  });
  it('the beta channel includes pre-releases, and is remembered', async () => {
    const r = rig();
    r.u.start(); expect(r.au.allowPrerelease).toBe(false);
    r.u.setChannel('beta'); expect(r.au.allowPrerelease).toBe(true);
    expect(JSON.parse(r.files['/u.json']).channel).toBe('beta');
    const again = rig({ saved: { channel: 'beta' } }); again.u.start();
    expect(again.au.allowPrerelease).toBe(true);
  });
  it('a beta copy starts on the Beta channel, a stable copy on Stable, until one is chosen', async () => {
    const beta = rig({ version: '0.6.2-beta.26' }); beta.u.start();
    expect(beta.au.allowPrerelease).toBe(true);
    expect(beta.u.settings.channel).toBe('beta');           // what the menu shows ticked
    const stable = rig({ version: '1.0.0' }); stable.u.start();
    expect(stable.au.allowPrerelease).toBe(false);
    expect(stable.u.settings.channel).toBe('stable');
    // chosen in the menu: kept, whatever the copy is
    const chose = rig({ version: '0.6.2-beta.27', saved: { channel: 'stable' } }); chose.u.start();
    expect(chose.au.allowPrerelease).toBe(false);
    const chose2 = rig({ version: '1.0.0', saved: { channel: 'beta' } }); chose2.u.start();
    expect(chose2.au.allowPrerelease).toBe(true);
    // settings saved for something else (skipping a version) don't lose a beta copy its channel
    const skip = rig({ version: '0.6.2-beta.26', answers: [2] });
    await skip.u.checkNow(); skip.au.emit('update-available', release('0.6.2-beta.27')); await settle();
    expect(JSON.parse(skip.files['/u.json']).channel).toBe('beta');
  });
  it('turning automatic checks off stops them', async () => {
    const r = rig(); r.u.start(); r.u.setAuto(false);
    expect(r.pending.length).toBe(0);
    expect(JSON.parse(r.files['/u.json']).auto).toBe(false);
  });
  it('a copy that can\u2019t update never checks, and explains when asked', async () => {
    const r = rig({ installable: { ok: false, why: 'It was run from a zip rather than installed.' } });
    r.u.start(); expect(r.pending.length).toBe(0);
    await r.u.checkNow();
    expect(r.au.calls).toEqual([]);
    expect(r.asked[0].message).toBe('This copy of 454 Workshop can\u2019t update itself.');
    expect(r.asked[0].detail).toMatch(/zip/);
  });
});
