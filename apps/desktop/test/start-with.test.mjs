// Which app opens when 454 Workshop starts (src/start-with.js), kept per computer in the app's data folder. Clint,
// 2026-10-23: Design on the laptop, Control in the garage.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createStartWith } = require('../src/start-with.js');

describe('the app that opens at start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-start-')), file = path.join(dir, 'start-with.json');
  it('is Design until one is chosen, as before', () => {
    expect(createStartWith({ file, fs }).app).toBe('design');
  });
  it('is remembered on this computer: chosen, then read when the app starts again', () => {
    expect(createStartWith({ file, fs }).set('control')).toBe(true);
    expect(createStartWith({ file, fs }).app).toBe('control');
    createStartWith({ file, fs }).set('design');
    expect(createStartWith({ file, fs }).app).toBe('design');
  });
  it('ignores anything else, and a damaged file', () => {
    const s = createStartWith({ file, fs });
    expect(s.set('docs')).toBe(false);
    expect(s.app).toBe('design');
    fs.writeFileSync(file, '{not json');
    expect(createStartWith({ file, fs }).app).toBe('design');
    fs.writeFileSync(file, JSON.stringify({ app: 'somewhere' }));
    expect(createStartWith({ file, fs }).app).toBe('design');
  });
});
