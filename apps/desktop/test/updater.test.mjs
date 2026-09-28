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
    autoUpdater: au, fs, timers, settingsFile: '/u.json', currentVersion: '0.6.0',
    installable: opts.installable || { ok: true },
    isBusy: async () => machine.busy,
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
  it('checks a little while after starting, offers the update with its notes, and downloads only when asked', async () => {
    const r = rig({ answers: [0] });
    r.u.start();
    expect(r.pending.length).toBe(1);                       // the first check is scheduled, not immediate
    await r.runTimers();
    expect(r.au.calls).toEqual(['check']);
    expect(r.au.autoDownload).toBe(false);
    r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(1);
    expect(r.asked[0].message).toBe('454 Workshop 0.6.1 is available.');
    expect(r.asked[0].buttons).toEqual(['Download', 'Later', 'Skip this version']);
    expect(r.asked[0].detail).toMatch(/You have 0\.6\.0/);
    expect(r.asked[0].detail).toMatch(/automatic updates/);    // release notes, without their HTML
    expect(r.asked[0].detail).not.toMatch(/<b>|<li>/);
    expect(r.au.calls).toEqual(['check', 'download']);
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
    expect(r.asked[0].message).toBe('You have the latest version.');
    await r.u.checkNow(); r.au.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED')); await settle();
    expect(r.asked[1].message).toBe('Couldn\u2019t check for updates.');
    expect(r.asked[1].detail).toMatch(/internet connection/);
  });
});

describe('downloads', () => {
  it('a download you asked for that fails is always reported, even from a background check, and only once', async () => {
    const r = rig({ answers: [0] });
    r.u.start(); await r.runTimers();                      // a background check...
    r.au.emit('update-available', release('0.6.1')); await settle();   // ...you choose Download...
    const err = new Error('sha512 checksum mismatch, expected abc, got def');
    r.au.emit('error', err); await settle();
    r.au.emit('error', err); await settle();               // the library reports it twice
    const reports = r.asked.filter((q) => q.message === 'The update didn\u2019t download.');
    expect(reports.length).toBe(1);
    expect(reports[0].detail).toMatch(/didn\u2019t match the release/);
    expect(r.au.calls).not.toContain('quitAndInstall');
  });
});

describe('never during a job', () => {
  it('an update found while the machine is busy waits, and is offered once it\u2019s idle', async () => {
    const r = rig({ busy: true, answers: [1] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(0);                         // nothing shown mid-job
    await r.runTimers(); expect(r.asked.length).toBe(0);    // still busy on the next look
    r.machine.busy = false;
    await r.runTimers();
    expect(r.asked.length).toBe(1);
    expect(r.asked[0].message).toMatch(/0\.6\.1 is available/);
  });
  it('the restart question waits for an idle machine too, and installs only if it\u2019s still idle', async () => {
    const r = rig({ answers: [0] });
    await r.u.checkNow(); r.au.emit('update-available', release('0.6.1')); await settle();
    r.machine.busy = true;
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.asked.length).toBe(1);                         // only the first question so far
    r.machine.busy = false; r.answers.push(0);
    await r.runTimers();
    expect(r.asked[1].message).toBe('454 Workshop 0.6.1 is ready to install.');
    expect(r.asked[1].buttons).toEqual(['Restart now', 'Later']);
    expect(r.au.calls).toContain('quitAndInstall');
  });
  it('if the machine gets busy while the restart question is open, it doesn\u2019t restart', async () => {
    const r = rig();
    r.u.checkNow(); await settle();
    r.answers.push(0);                                      // Restart now...
    const realAsk = r.asked.push.bind(r.asked);
    r.asked.push = (o) => { if (o.message && /ready to install/.test(o.message)) r.machine.busy = true; return realAsk(o); };   // ...as a job starts
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.asked[r.asked.length - 1].message).toBe('The machine is busy.');
  });
  it('Later on the restart question installs nothing now, and leaves it to install when the app closes', async () => {
    const r = rig({ answers: [1] });
    r.u.start();
    r.au.emit('update-downloaded', release('0.6.1')); await settle();
    expect(r.au.calls).not.toContain('quitAndInstall');
    expect(r.au.autoInstallOnAppQuit).toBe(true);
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
  it('the beta channel includes pre-releases, and is remembered', async () => {
    const r = rig();
    r.u.start(); expect(r.au.allowPrerelease).toBe(false);
    r.u.setChannel('beta'); expect(r.au.allowPrerelease).toBe(true);
    expect(JSON.parse(r.files['/u.json']).channel).toBe('beta');
    const again = rig({ saved: { channel: 'beta' } }); again.u.start();
    expect(again.au.allowPrerelease).toBe(true);
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
