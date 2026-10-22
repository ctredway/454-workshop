// Makes icon.ico, the Windows app icon, from icon.svg (the whole 454 logo on its dark tile): seven sizes, 16 to
// 256 px, each a PNG inside the .ico. Every size is the whole logo; the small ones used to be a close-up of the 5
// (Clint, 2026-10-22: Windows showed only the 5, Linux the whole logo). Uses sharp, from the docs' packages:
//   cd docs-site && npm ci && cd .. && node apps/desktop/build/make-icon.cjs
const fs = require('fs'), path = require('path');
const sharp = require(path.join(__dirname, '..', '..', '..', 'docs-site', 'node_modules', 'sharp'));
const SIZES = [16, 24, 32, 48, 64, 128, 256];
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'));
  const pngs = [];
  for (const s of SIZES) pngs.push(await sharp(svg, { density: Math.max(72, 72 * s / 512 * 4) }).resize(s, s).png().toBuffer());
  const head = Buffer.alloc(6 + 16 * SIZES.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(SIZES.length, 4);   // an icon file, this many images
  let off = head.length;
  SIZES.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;                    // 0 means 256
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);                     // one plane, 32 bits a pixel
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += pngs[i].length;
  });
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...pngs]));
  console.log('icon.ico: ' + SIZES.join(', ') + ' px, all the whole logo');
})();
