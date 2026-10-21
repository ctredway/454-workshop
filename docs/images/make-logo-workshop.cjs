// Makes logo-workshop.svg: the 454 logo (logo.svg) with WORKSHOP underneath, in the logo's blue with the same white
// edge. The lettering is Russo One (SIL Open Font License), turned into outlines, so the logo needs no font to show.
// Clint chose Russo One, 2026-10-20. Run from the repository (needs apps/desktop's packages: cd apps/desktop && npm ci):
//   node docs/images/make-logo-workshop.cjs
// It writes docs/images/logo-workshop.svg, site/images/logo-workshop.svg and docs-site/src/assets/logo-workshop.svg,
// and docs/images/logo-workshop-letters.json (each letter's outline, for the website's cutting animation).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const req = (m) => require(path.join(root, 'apps', 'desktop', 'node_modules', m));
const opentype = req('opentype.js');

const BLUE = '#0083ff', CAP = 74, TRACK = 0.12, EDGE = 15, WIDTH = 640, GAP = 8;   // in the logo's units (792 wide)
const logo = fs.readFileSync(path.join(root, 'docs', 'images', 'logo.svg'), 'utf8');
const logoPaths = [...logo.matchAll(/<path[^>]*\/>/g)].map((m) => m[0]);
const font = opentype.parse(fs.readFileSync(path.join(root, 'apps/desktop/node_modules/@fontsource/russo-one/files/russo-one-latin-400-normal.woff')).buffer);

const size = CAP / font.tables.os2.sCapHeight * font.unitsPerEm;           // the font size that gives CAP-high capitals
let x = 0; const glyphs = [];
for (const ch of 'WORKSHOP') { const g = font.charToGlyph(ch); glyphs.push({ ch, g, x }); x += g.advanceWidth / font.unitsPerEm * size + TRACK * size; }
const textW = x - TRACK * size, sx = WIDTH / textW;                       // stretched wide, as the logo is
const top = 250 + GAP + EDGE, base = top + CAP, left = 396 - WIDTH / 2;
const f = (v) => +v.toFixed(2);
const letters = glyphs.map(({ ch, g, x }) => {
  const T = (px, py) => f(left + (x + px) * sx) + ' ' + f(base + py);
  const contours = []; let cur = '';
  for (const c of g.getPath(0, 0, size).commands) {
    if (c.type === 'M') { if (cur) contours.push(cur.trim()); cur = 'M' + T(c.x, c.y); }
    else if (c.type === 'L') cur += ' L' + T(c.x, c.y);
    else if (c.type === 'Q') cur += ' Q' + T(c.x1, c.y1) + ' ' + T(c.x, c.y);
    else if (c.type === 'C') cur += ' C' + T(c.x1, c.y1) + ' ' + T(c.x2, c.y2) + ' ' + T(c.x, c.y);
    else if (c.type === 'Z') cur += ' Z';
  }
  if (cur) contours.push(cur.trim());
  return { ch, contours };
});
const d = letters.map((l) => l.contours.join(' ')).join(' ');
const H = Math.ceil(base + EDGE + 6);
// the white edge: each letter's outline drawn wide, with a band behind the middle of the word so the edge is one
// shape like the logo's (without it, small dark gaps show between some letters)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 792 ${H}" role="img" aria-label="454 Workshop">
  ${logoPaths.join('\n  ')}
  <rect fill="#fff" x="${f(left)}" y="${f(top + CAP * 0.2)}" width="${WIDTH}" height="${f(CAP * 0.6)}"/>
  <path fill="#fff" stroke="#fff" stroke-width="${EDGE * 2}" stroke-linejoin="round" d="${d}"/>
  <path fill="${BLUE}" stroke="${BLUE}" stroke-width="0.8" d="${d}"/>
</svg>
`;
for (const out of ['docs/images/logo-workshop.svg', 'site/images/logo-workshop.svg', 'docs-site/src/assets/logo-workshop.svg'])
  fs.writeFileSync(path.join(root, out), svg);
fs.writeFileSync(path.join(root, 'docs/images/logo-workshop-letters.json'),
  JSON.stringify({ viewBox: [0, 0, 792, H], band: { x: f(left), y: f(top + CAP * 0.2), w: WIDTH, h: f(CAP * 0.6) }, edge: EDGE, letters }, null, 1) + '\n');
console.log('logo-workshop.svg: 792 x ' + H + ', WORKSHOP ' + WIDTH + ' wide, capitals ' + CAP + ' high');
