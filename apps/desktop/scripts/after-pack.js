// electron-builder's afterPack step (package.json, build.afterPack). On Linux, the program is renamed <name>-bin
// and scripts/linux-launcher.sh put in its place, so the app starts without Chromium's sandbox where the sandbox
// can't work (see the launcher). Windows is left as it is.
'use strict';
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const name = context.packager.executableName;
  const exe = path.join(context.appOutDir, name);
  if (!fs.existsSync(exe)) throw new Error('after-pack: ' + exe + ' not found');
  fs.renameSync(exe, exe + '-bin');
  const launcher = fs.readFileSync(path.join(__dirname, 'linux-launcher.sh'), 'utf8').replace(/@NAME@/g, name);
  fs.writeFileSync(exe, launcher, { mode: 0o755 });
  console.log('  • after-pack: ' + name + ' starts through scripts/linux-launcher.sh');
};
