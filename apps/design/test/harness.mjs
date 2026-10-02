// Loads 454 Design's real source files (apps/design/src/js, in the page's order) into Node, with Design's
// own markup as the page, so tests exercise exactly the code Design runs. The browser's pieces Design
// touches as it loads are stood in for: storage, timers, layout; linkedom supplies the DOM and DOMParser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML, DOMParser } from 'linkedom';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const repo = path.join(src, '..', '..', '..');

// cam: also load the CAM engine (geom.js and cam.js, at the top of the repository) first, as the page does
// start: run Design's own page startup (wire()), so its controls listen as in the page
export function loadDesign({ cam = false, start = true } = {}) {
  const page = fs.readFileSync(path.join(src, 'design.html'), 'utf8');
  const files = [...page.matchAll(/^@@include (\S+)$/gm)].map((m) => m[1])
    // Design's own code, and what it shares with 454 Control (apps/shared). The CAM engine loads separately.
    .filter((f) => f.endsWith('.js') && (f.startsWith('js/') || f.startsWith('../../shared/')) && f !== 'js/cam-loader.js');
  const markup = page.replace(/^@@include .*$/gm, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const { window, document } = parseHTML(markup);
  // as in a browser: a <select>'s value can be set (choosing the matching option) and read back
  const opts = (el) => Array.from(el.querySelectorAll('option'));
  const optVal = (o) => (o.hasAttribute('value') ? o.getAttribute('value') : o.textContent);
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true,
    get() { const o = opts(this); const s = o.find((x) => x.hasAttribute('selected')) || o[0]; return s ? optVal(s) : ''; },
    set(v) { opts(this).forEach((x) => { if (optVal(x) === String(v)) x.setAttribute('selected', ''); else x.removeAttribute('selected'); }); } });
  // as in a browser: clicking a checkbox or radio button ticks it, then says so
  const click0 = window.HTMLInputElement.prototype.click;
  window.HTMLInputElement.prototype.click = function () {
    const t = (this.getAttribute('type') || '').toLowerCase();
    if (t !== 'checkbox' && t !== 'radio') return click0 ? click0.call(this) : undefined;
    this.checked = t === 'radio' ? true : !this.checked;
    for (const ev of ['click', 'input', 'change']) this.dispatchEvent(new window.Event(ev, { bubbles: true }));
  };
  Object.defineProperty(window.HTMLSelectElement.prototype, 'selectedIndex', { configurable: true,
    get() { const o = opts(this); const i = o.findIndex((x) => x.hasAttribute('selected')); return o.length ? Math.max(0, i) : -1; },
    set(i) { opts(this).forEach((x, k) => { if (k === i) x.setAttribute('selected', ''); else x.removeAttribute('selected'); }); } });
  const store = new Map();
  const ctx = {
    document, DOMParser, console, performance, TextDecoder, TextEncoder, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { userAgent: 'node', platform: 'test' },
    location: { search: '', protocol: 'file:', hostname: '', href: 'file:///design.html' },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => '', fontFamily: 'sans-serif' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    ResizeObserver: class { observe() {} disconnect() {} },
    Blob: class { constructor(parts) { this.parts = parts; } },
  };
  ctx.window = ctx; ctx.self = ctx;
  for (const k of ['Event', 'CustomEvent', 'HTMLElement', 'HTMLSelectElement', 'HTMLInputElement', 'MutationObserver']) ctx[k] = window[k];
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  if (cam) for (const f of ['geom.js', 'cam.js']) vm.runInContext(fs.readFileSync(path.join(repo, f), 'utf8'), ctx, { filename: f });
  const code = files.map((f) => '// ---- ' + f + '\n' + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
  vm.runInContext(code, ctx, { filename: 'design (apps/design/src/js)' });
  // The one deliberate difference from the page: nothing is drawn (the canvas only exists once the page has
  // started, and tests check what's computed, not pictures).
  vm.runInContext('draw = function () {};', ctx);
  if (start) ctx.wire();
  return ctx;
}
