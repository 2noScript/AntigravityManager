import { describe, it, expect, vi } from 'vitest';
import {
  compareVersion,
  isCredentialStoreVersion,
  isNewVersion,
} from '@/modules/antigravity-runtime/utils/antigravityVersion';

describe('antigravityVersion', () => {
  it('should compare versions correctly', () => {
    expect(compareVersion('1.16.5', '1.16.4')).toBe(1);
    expect(compareVersion('1.16.5', '1.16.5')).toBe(0);
    expect(compareVersion('1.16.4', '1.16.5')).toBe(-1);
    expect(compareVersion('1.17.0', '1.16.5')).toBe(1);
    expect(compareVersion('2.0.0', '1.16.5')).toBe(1);
  });

  it('should detect new version >= 1.16.5', () => {
    expect(isNewVersion({ shortVersion: '1.16.4', bundleVersion: '1.16.4' })).toBe(false);
    expect(isNewVersion({ shortVersion: '1.16.5', bundleVersion: '1.16.5' })).toBe(true);
    expect(isNewVersion({ shortVersion: '1.17.0', bundleVersion: '1.17.0' })).toBe(true);
  });

  it('should identify credential-store Antigravity versions', () => {
    expect(isCredentialStoreVersion({ shortVersion: '1.99.9', bundleVersion: '1.99.9' })).toBe(
      false,
    );
    expect(isCredentialStoreVersion({ shortVersion: '2.0.0', bundleVersion: '2.0.0' })).toBe(
      true,
    );
    expect(isCredentialStoreVersion({ shortVersion: '4.2.0', bundleVersion: '4.2.0' })).toBe(
      true,
    );
  });

  it('should fallback to package.json on windows when version detection fails', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    vi.resetModules();
    const execSync = vi.fn(() => {
      throw new Error('ps fail');
    });
    const existsSync = vi.fn(() => true);
    const readFileSync = vi.fn(() => JSON.stringify({ version: '1.16.6' }));

    vi.doMock('child_process', () => ({
      execSync,
      default: {
        execSync,
      },
    }));
    vi.doMock('fs', () => ({
      existsSync,
      readFileSync,
      default: {
        existsSync,
        readFileSync,
      },
    }));
    vi.doMock('../../shared/platform/paths', () => ({
      getAntigravityExecutablePath: () => 'C:\\Program Files\\Antigravity\\Antigravity.exe',
    }));

    const { getAntigravityVersion } = await import(
      '@/modules/antigravity-runtime/utils/antigravityVersion'
    );
    const version = getAntigravityVersion();
    const cached = getAntigravityVersion();

    expect(version.shortVersion).toBe('1.16.6');
    expect(cached.shortVersion).toBe('1.16.6');
    expect(execSync).toHaveBeenCalledTimes(1);
  });
});
