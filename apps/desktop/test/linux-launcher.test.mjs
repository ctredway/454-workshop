// The Linux launcher (scripts/linux-launcher.sh, put in place by scripts/after-pack.js): starts the app without
// Chromium's sandbox only where the sandbox can't work, and passes everything else through unchanged.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const afterPack = require('../scripts/after-pack.js').default;
const isWin = process.platform === 'win32';

// a packed Linux app: the program (a stand-in that prints its arguments), then after-pack run over it
async function packed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-launch-'));
  fs.writeFileSync(path.join(dir, '454-desktop'), '#!/bin/sh\necho "ARGS:$*"\n', { mode: 0o755 });
  await afterPack({ electronPlatformName: 'linux', appOutDir: dir, packager: { executableName: '454-desktop' } });
  return dir;
}
function proc(flags) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-proc-'));
  fs.mkdirSync(path.join(p, 'sys', 'kernel'), { recursive: true });
  for (const [k, v] of Object.entries(flags)) fs.writeFileSync(path.join(p, 'sys', 'kernel', k), v + '\n');
  return p;
}
const run = (dir, env, args = ['--some', 'file.c2d']) =>
  execFileSync(path.join(dir, '454-desktop'), args, { env: { PATH: process.env.PATH, ...env } }).toString().trim();

describe.skipIf(isWin)('Starting on Linux', () => {
  it('after-pack moves the program aside and puts the launcher in its place', async () => {
    const dir = await packed();
    expect(fs.existsSync(path.join(dir, '454-desktop-bin'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, '454-desktop'), 'utf8')).toMatch(/exec "\$HERE\/454-desktop-bin" \$NS "\$@"/);
    expect(fs.statSync(path.join(dir, '454-desktop')).mode & 0o111).not.toBe(0);
  });
  it('keeps the sandbox where it works, and passes the arguments through', async () => {
    const dir = await packed();
    expect(run(dir, { P454_PROC: proc({ apparmor_restrict_unprivileged_userns: 0 }), P454_UID: '1000' })).toBe('ARGS:--some file.c2d');
  });
  it('goes without it on Ubuntu 24.04 and later, where user namespaces are off, and as root', async () => {
    const dir = await packed();
    expect(run(dir, { P454_PROC: proc({ apparmor_restrict_unprivileged_userns: 1 }), P454_UID: '1000' })).toBe('ARGS:--no-sandbox --some file.c2d');
    expect(run(dir, { P454_PROC: proc({ unprivileged_userns_clone: 0 }), P454_UID: '1000' })).toBe('ARGS:--no-sandbox --some file.c2d');
    expect(run(dir, { P454_PROC: proc({}), P454_UID: '0' })).toBe('ARGS:--no-sandbox --some file.c2d');
  });
  it('only in the AppImage', async () => {
    const dir = await packed();
    expect(run(dir, { P454_UID: '0' })).toBe('ARGS:--some file.c2d');              // no APPIMAGE: not the AppImage
    expect(run(dir, { APPIMAGE: '/x/454.AppImage', P454_UID: '0' })).toBe('ARGS:--no-sandbox --some file.c2d');
  });
  it('leaves Windows as it is', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-win-'));
    fs.writeFileSync(path.join(dir, '454-desktop'), 'x');
    await afterPack({ electronPlatformName: 'win32', appOutDir: dir, packager: { executableName: '454-desktop' } });
    expect(fs.readdirSync(dir)).toEqual(['454-desktop']);
  });
});
