// Report a problem (src/report.js): the GitHub form's address, with the version and computer filled in, and
// the form itself having the fields those fill.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reportUrl, osName } = require('../src/report.js');

describe('Report a problem', () => {
  it('opens the problem form with the version and computer filled in', () => {
    const u = new URL(reportUrl({ version: '0.6.2-beta.22', os: 'Windows 11 (10.0.26300)' }));
    expect(u.origin + u.pathname).toBe('https://github.com/ctredway/454-workshop/issues/new');
    expect(u.searchParams.get('template')).toBe('problem.yml');
    expect(u.searchParams.get('version')).toBe('0.6.2-beta.22');
    expect(u.searchParams.get('os')).toBe('Windows 11 (10.0.26300)');
  });
  it('leaves out what it doesn’t know', () => {
    const u = new URL(reportUrl({}));
    expect(u.searchParams.has('version')).toBe(false);
    expect(u.searchParams.has('os')).toBe(false);
  });
  it('the form has fields with the names the address fills, and the template it names exists', () => {
    const form = fs.readFileSync(new URL('../../../.github/ISSUE_TEMPLATE/problem.yml', import.meta.url), 'utf8');
    expect(form).toMatch(/^\s+id: version$/m);
    expect(form).toMatch(/^\s+id: os$/m);
    expect(form).toMatch(/Did the machine move or cut in a way it shouldn't\?/);
  });
  it('names Windows 11 by its build number (it still says 10.0), and Windows 10 before that', () => {
    expect(osName('win32', '10.0.26300')).toBe('Windows 11 (10.0.26300)');
    expect(osName('win32', '10.0.22000')).toBe('Windows 11 (10.0.22000)');
    expect(osName('win32', '10.0.19045')).toBe('Windows 10 (10.0.19045)');
    expect(osName('linux', '6.1.0')).toBe('linux 6.1.0');
  });
});
