// The update notice in the headers of 454 Control and 454 Design (src/renderer/update-badge.js), run in
// each page's real header (from the built index.html and design.html) with linkedom, and a stand-in for
// the app's side (preload.js): what the notice shows, and what each click asks the app to do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..', '..');
const badgeJs = fs.readFileSync(path.join(here, '..', 'src', 'renderer', 'update-badge.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

// a page with the real header of Control (index.html) or Design (design.html), and the notice running in it
async function page(file, { first = { phase: 'none' }, desktop = true, restartSays = { ok: true } } = {}) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  const header = /<header>[\s\S]*?<\/header>/.exec(html)[0];
  const { window, document } = parseHTML('<!DOCTYPE html><html><head></head><body>' + header + '</body></html>');
  const did = [];
  let tell = null;
  // (set every time: linkedom's window keeps properties from one page to the next)
  window.desktop454 = desktop ? { updates: {
    view: () => Promise.resolve(first),
    do: (a) => { did.push(a); return Promise.resolve(a === 'restart' ? restartSays : { ok: true }); },
    onChange: (f) => { tell = f; },
  } } : undefined;
  window.innerWidth = 1400;
  vm.runInNewContext(badgeJs, { window, document, console });
  await flush();
  const badge = document.getElementById('updateBadge');
  const panel = () => document.getElementById('updatePanel');
  const buttonsIn = (el) => [...el.querySelectorAll('button')];
  const press = async (label) => {
    const b = buttonsIn(panel()).find((x) => x.textContent === label);
    if (!b) throw new Error('no ' + label + ' button; there are: ' + buttonsIn(panel()).map((x) => x.textContent).join(', '));
    b.dispatchEvent(new window.Event('click')); await flush();
  };
  const show = async (v) => { tell(v); await flush(); };
  return { window, document, badge, panel, press, show, did, buttonsIn, click: async () => { badge.dispatchEvent(new window.Event('click')); await flush(); } };
}

const available = { phase: 'available', version: '0.6.2-beta.13', current: '0.6.2-beta.12', busy: false,
                    notes: 'New: the update notice lives in the header.\n• Nothing pops up' };

for (const file of ['index.html', 'design.html']) {
  describe('the update notice in ' + (file === 'index.html' ? '454 Control' : '454 Design'), () => {
    it('the built page has the notice’s place in its header, and its code', () => {
      const html = fs.readFileSync(path.join(repo, file), 'utf8');
      expect(/<header>[\s\S]*id="updateBadge"[\s\S]*<\/header>/.test(html)).toBe(true);
      expect(html).toContain(badgeJs.trim().split('\n').slice(-3).join('\n'));    // included whole, from the app's file
    });
    it('in a browser (not the desktop app) it shows nothing', async () => {
      const p = await page(file, { desktop: false });
      expect(p.badge.hasAttribute('hidden')).toBe(true);
      expect(p.document.querySelector('style')).toBe(null);                    // and adds nothing to the page
    });
    it('shows nothing until the app has found an update', async () => {
      const p = await page(file);
      expect(p.badge.hidden).toBe(true);
    });
    it('Update available: click for what’s new, then Download or Skip; nothing happens without a click', async () => {
      const p = await page(file, { first: available });
      expect(p.badge.hidden).toBe(false);
      expect(p.badge.textContent).toBe('Update available');
      expect(p.badge.title).toContain('0.6.2-beta.13');
      expect(p.panel()).toBe(null);                                            // nothing opens by itself
      expect(p.did).toEqual([]);
      await p.click();
      const text = p.panel().textContent;
      expect(text).toContain('454 Workshop 0.6.2-beta.13 is available');
      expect(text).toContain('You have 0.6.2-beta.12.');
      expect(text).toContain('the update notice lives in the header');
      expect(p.buttonsIn(p.panel()).map((b) => b.textContent)).toEqual(['Skip this version', 'Download']);
      await p.press('Download');
      expect(p.did).toEqual(['download']);
    });
    it('Skip this version asks the app to skip it, and closes', async () => {
      const p = await page(file, { first: available });
      await p.click(); await p.press('Skip this version');
      expect(p.did).toEqual(['skip']);
      expect(p.panel()).toBe(null);
    });
    it('release notes are shown as text, never as page code', async () => {
      const p = await page(file, { first: { ...available, notes: '<img src=x onerror="alert(1)"> and <b>bold</b>' } });
      await p.click();
      expect(p.panel().querySelector('img')).toBe(null);
      expect(p.panel().querySelector('.notes').textContent).toContain('<img src=x');
    });
    it('shows the download’s progress, then Restart to update', async () => {
      const p = await page(file, { first: available });
      await p.show({ ...available, phase: 'downloading', progress: 0.427 });
      expect(p.badge.textContent).toBe('Downloading update 42%');
      await p.show({ ...available, phase: 'ready' });
      expect(p.badge.textContent).toBe('Restart to update');
      expect(p.badge.className).toBe('ready');
      await p.click();
      expect(p.panel().textContent).toContain('The machine disconnects');
      expect(p.panel().textContent).toContain('installs the next time you close 454 Workshop');
      await p.press('Restart now');
      expect(p.did).toEqual(['restart']);
    });
    it('Restart now can’t be pressed while the machine is busy, and says why', async () => {
      const p = await page(file, { first: { ...available, phase: 'ready', busy: true } });
      expect(p.badge.className).toBe('ready busy');
      expect(p.badge.title).toMatch(/machine is busy/);
      await p.click();
      expect(p.panel().textContent).toMatch(/The machine is busy/);
      const restart = p.buttonsIn(p.panel()).find((b) => b.textContent === 'Restart now');
      expect(restart.disabled).toBe(true);
      await p.show({ ...available, phase: 'ready', busy: false });            // the job finished
      expect(p.buttonsIn(p.panel()).find((b) => b.textContent === 'Restart now').disabled).toBe(false);
    });
    it('if the app refuses to restart because the machine got busy, the panel says so', async () => {
      const p = await page(file, { first: { ...available, phase: 'ready' }, restartSays: { ok: false, busy: true } });
      await p.click(); await p.press('Restart now');
      expect(p.panel().textContent).toMatch(/machine got busy, so 454 Workshop didn’t restart/);
    });
    it('a failed download says why, with Try again', async () => {
      const p = await page(file, { first: { ...available, phase: 'failed', error: 'The downloaded file didn’t match the release, so it wasn’t installed.' } });
      expect(p.badge.textContent).toBe('Update didn’t download');
      await p.click();
      expect(p.panel().textContent).toContain('didn’t match the release');
      await p.press('Try again');
      expect(p.did).toEqual(['download']);
    });
    it('Escape, or clicking elsewhere, closes the panel; the notice goes when there’s nothing to show', async () => {
      const p = await page(file, { first: available });
      await p.click(); expect(p.panel()).not.toBe(null);
      p.document.dispatchEvent(Object.assign(new p.window.Event('keydown'), { key: 'Escape' })); await p.show(available);
      expect(p.panel()).toBe(null);
      await p.click(); expect(p.panel()).not.toBe(null);
      p.document.body.dispatchEvent(new p.window.Event('mousedown', { bubbles: true })); await p.show(available);
      expect(p.panel()).toBe(null);
      await p.click();
      await p.show({ phase: 'none' });
      expect(p.badge.hidden).toBe(true);
      expect(p.panel()).toBe(null);
    });
  });
}
