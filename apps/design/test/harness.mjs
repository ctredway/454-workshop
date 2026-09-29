// Loads 454 Design's real source files (apps/design/src/js, in the page's order) into Node, with Design's
// own markup as the page, so tests exercise exactly the code Design runs. The browser's pieces Design
// touches as it loads are stood in for: storage, timers, layout; linkedom supplies the DOM and DOMParser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML, DOMParser } from 'linkedom';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

export function loadDesign() {
  const page = fs.readFileSync(path.join(src, 'design.html'), 'utf8');
  const files = [...page.matchAll(/^@@include (\S+)$/gm)].map((m) => m[1])
    .filter((f) => f.startsWith('js/') && f !== 'js/cam-loader.js');           // the CAM engine loads separately
  const markup = page.replace(/^@@include .*$/gm, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const { window, document } = parseHTML(markup);
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
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  const code = files.map((f) => '// ---- ' + f + '\n' + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
  vm.runInContext(code, ctx, { filename: 'design (apps/design/src/js)' });
  return ctx;
}
