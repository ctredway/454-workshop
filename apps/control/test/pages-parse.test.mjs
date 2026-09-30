// Both apps' pages, as built: every script in them must be readable JavaScript. One that isn't stops the whole
// app from starting. (A line break inside a message in job-run.js did that to 454 Control from 0.31.19, in
// desktop beta.20 to beta.22; the unit tests load only some of Control's files, so none of them noticed.)
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const page of ['index.html', 'design.html']) {
  test(page + ': every script in it is readable JavaScript', () => {
    const html = fs.readFileSync(new URL('../../../' + page, import.meta.url), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 1, 'found its scripts');
    scripts.forEach((code, i) => {
      try { new Function(code); }
      catch (e) {
        const line = (e.stack.match(/<anonymous>:(\d+)/) || [])[1];
        assert.fail(page + ', script ' + (i + 1) + ': ' + e.message + (line ? ' (near its line ' + (line - 2) + ')' : ''));
      }
    });
  });
}
