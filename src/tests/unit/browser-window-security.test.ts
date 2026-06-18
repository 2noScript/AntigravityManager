import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('BrowserWindow security settings', () => {
  it('keeps renderer Node integration disabled', () => {
    const mainSource = readFileSync(path.join(process.cwd(), 'src/main.ts'), 'utf-8');

    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
  });
});
