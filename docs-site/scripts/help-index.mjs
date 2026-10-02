// The search index for the help window in 454 Design and 454 Control: every section of the docs, with its
// page, heading, address and words. Written to dist/help-index.json after the site is built (npm run build),
// so the apps search exactly the pages they show.
//   node scripts/help-index.mjs            build it from dist/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const entity = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', mdash: '—', ndash: '–', times: '×' };
// A piece of the page as plain words
export function words(html) {
  return html
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a class="sl-anchor-link"[\s\S]*?<\/a>/gi, ' ')           // the link beside each heading ("Section titled...")
    .replace(/<img\b[^>]*>/gi, ' ')                                     // a picture's description isn't the page's own words
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => entity[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ').trim();
}
// One built page as its sections: the top of the page, then one for each heading that has an address.
export function sections(html, page) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (!main) return [];
  const body = main[1], out = [], heads = [];
  const re = /<h([1-4])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (let m; (m = re.exec(body));) heads.push({ level: +m[1], id: m[2], title: words(m[3]), at: m.index, end: re.lastIndex });
  if (!heads.length) return [];
  const pageTitle = heads[0].title;
  heads.forEach((h, i) => {
    const text = words(body.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : body.length));
    const top = i === 0;
    if (!top && !text && !h.title) return;
    out.push({ page, pageTitle, id: top ? '' : h.id, title: top ? pageTitle : h.title, level: top ? 1 : h.level, text });
  });
  return out;
}
// Every page of the built site, in the order the docs' own menu lists them
export function build(dist) {
  const pages = fs.readdirSync(dist).filter((f) => f.endsWith('.html') && f !== '404.html');
  const menu = fs.existsSync(path.join(dist, 'index.html')) ? fs.readFileSync(path.join(dist, 'index.html'), 'utf8') : '';
  const order = (f) => { const i = f === 'index.html' ? 0 : menu.indexOf('href="/docs/' + f + '"'); return i < 0 ? 1e9 : i; };
  pages.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return pages.flatMap((f) => sections(fs.readFileSync(path.join(dist, f), 'utf8'), f));
}

// The places in the docs that the apps open their help at ('page.html#heading', written in their help-where.js
// files), and those of them that aren't in the docs any more: a heading reworded, a page renamed.
export function targets(source) {
  return [...source.matchAll(/'([a-z0-9-]+\.html)(?:#([a-z0-9-]+))?'/g)].map((m) => ({ page: m[1], id: m[2] || '' }));
}
export function missing(index, list) {
  return list.filter((t) => !index.some((s) => s.page === t.page && (t.id === '' || s.id === t.id)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.join(here, '..', 'dist');
  const index = build(dist);
  if (!index.length) { console.error('help index: no pages found in ' + dist + '. Build the site first.'); process.exit(1); }
  // every place the apps' help opens at must still be in the docs
  const lost = ['design', 'control'].flatMap((app) => {
    const f = path.join(here, '..', '..', 'apps', app, 'src', 'js', 'help-where.js');
    return fs.existsSync(f) ? missing(index, targets(fs.readFileSync(f, 'utf8'))).map((t) => 'apps/' + app + '/src/js/help-where.js: ' + t.page + (t.id ? '#' + t.id : '')) : [];
  });
  if (lost.length) {
    console.error('help index: the apps open their help at places that aren’t in the docs:\n  ' + lost.join('\n  ') +
      '\nA heading was probably reworded: put the new address in that file, or give the heading its old words back.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(dist, 'help-index.json'), JSON.stringify(index));
  console.log('help index: ' + index.length + ' sections of ' + new Set(index.map((s) => s.page)).size + ' pages (' + Math.round(JSON.stringify(index).length / 1024) + ' KB)');
}
