// Runs inside Control in the desktop app: already open, with a marker a reload would wipe, waiting for
// the job Design previews.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__marker = 'still the same page';
  const skip = document.getElementById('connSkip'); if (skip && skip.offsetParent) skip.click();
  const t0 = Date.now();
  while (!/preview-test/.test(document.getElementById('fileName').textContent) && Date.now() - t0 < 60000) await wait(100);
  return { ok: /preview-test/.test(document.getElementById('fileName').textContent), file: document.getElementById('fileName').textContent,
           lines: MODEL ? MODEL.lines.length : 0, marker: window.__marker || null };
})()
