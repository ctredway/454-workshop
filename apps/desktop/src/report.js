// Report a problem: the address of the GitHub form (.github/ISSUE_TEMPLATE/problem.yml), with the app's version
// and the computer already filled in, so a report says which build it's about.
const REPO = 'https://github.com/ctredway/454-workshop';

function reportUrl({ version, os } = {}) {
  const q = new URLSearchParams({ template: 'problem.yml' });
  if (version) q.set('version', String(version));
  if (os) q.set('os', String(os));
  return REPO + '/issues/new?' + q.toString();
}
// "Windows 11" or "Windows 10" from the Windows build number (Windows 11 still reports itself as 10.0);
// other systems by name and version.
function osName(platform, release) {
  if (platform === 'win32') {
    const build = +String(release || '').split('.')[2];
    return (build >= 22000 ? 'Windows 11' : 'Windows 10') + (release ? ' (' + release + ')' : '');
  }
  if (platform === 'darwin') return 'macOS (Darwin ' + (release || '?') + ')';
  return (platform || 'unknown') + (release ? ' ' + release : '');
}
module.exports = { reportUrl, osName, REPO };
