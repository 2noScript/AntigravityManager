import { describe, it, expect, vi, beforeEach } from 'vitest';

const childProcessMock = vi.hoisted(() => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}));

vi.mock('child_process', () => ({
  default: childProcessMock,
  exec: childProcessMock.exec,
  execSync: childProcessMock.execSync,
  spawn: childProcessMock.spawn,
}));

// Mock find-process module
vi.mock('find-process', () => ({
  default: vi.fn(),
}));

// Mock logger to avoid console output during tests
vi.mock('@/shared/logging/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock paths module to avoid child_process issues
vi.mock('@/shared/platform/paths', () => ({
  getAntigravityExecutablePath: vi.fn(() => '/path/to/antigravity'),
  getConfiguredAntigravityArgs: vi.fn(() => []),
  isConfiguredTargetExecutableProcessCandidate: vi.fn((processItem, target) => {
    const normalizedTarget = target === 'ide' ? 'ide' : 'classic';
    return (
      normalizedTarget === 'classic' &&
      processItem.executablePath === 'C:\\Program Files\\Antigravity\\Antigravity.exe'
    );
  }),
  isTargetAntigravityProcessCandidate: vi.fn((processItem, target) => {
    const normalizedTarget = target === 'ide' ? 'ide' : 'classic';
    const name = processItem.name.toLowerCase();
    const commandLine = processItem.commandLine.toLowerCase();
    const isIde =
      name.includes('antigravity ide') ||
      name.includes('antigravity-ide') ||
      commandLine.includes('antigravity ide') ||
      commandLine.includes('antigravity-ide');

    if (commandLine.includes('--type=')) {
      return false;
    }
    if (
      name.includes('helper') ||
      name.includes('renderer') ||
      name.includes('gpu') ||
      name.includes('utility')
    ) {
      return false;
    }

    if (normalizedTarget === 'ide') {
      return isIde;
    }

    return (
      (name.includes('antigravity') || commandLine.includes('antigravity')) &&
      !isIde &&
      !name.includes('manager') &&
      !commandLine.includes('manager')
    );
  }),
  isWsl: vi.fn(() => false),
}));

// Import after mocks are set up
import {
  isProcessRunning,
  closeAntigravity,
  startAntigravity,
} from '@/modules/antigravity-runtime/ipc/handler';
import findProcess from 'find-process';
import {
  getAntigravityExecutablePath,
  isTargetAntigravityProcessCandidate,
} from '@/shared/platform/paths';

describe('Process Handler', () => {
  const mockFindProcess = findProcess as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    childProcessMock.spawn.mockReturnValue({
      unref: vi.fn(),
    });
  });

  describe('isProcessRunning', () => {
    it('should return true when Antigravity main process is found on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity',
          cmd: '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(true);
      expect(mockFindProcess).toHaveBeenCalledWith('name', 'Antigravity', false);
    });

    it('should return false when only helper processes are found', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12346,
          name: 'Antigravity Helper (Renderer)',
          cmd: '/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper (Renderer).app --type=renderer',
        },
        {
          pid: 12347,
          name: 'Antigravity Helper (GPU)',
          cmd: '/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper (GPU).app --type=gpu-process',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });

    it('should return false when only manager process is found', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12348,
          name: 'Antigravity Manager',
          cmd: '/Applications/Antigravity Manager.app/Contents/MacOS/Antigravity Manager',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });

    it('should return false when no processes are found', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([]);

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });

    it('should skip self process', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 12345, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345, // Same as current PID
          name: 'Antigravity',
          cmd: '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });

    it('should return true when Antigravity.exe is found on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity.exe',
          cmd: 'C:\\Program Files\\Antigravity\\Antigravity.exe',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(true);
    });

    it('should pass the quoted executable path from command line to target classifier', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity.exe',
          cmd: '"C:\\Program Files\\Antigravity\\Antigravity.exe" --user-data-dir "D:\\AG Profile"',
        },
      ]);

      await isProcessRunning();

      expect(isTargetAntigravityProcessCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: 'C:\\Program Files\\Antigravity\\Antigravity.exe',
        }),
        undefined,
      );
    });

    it('should not treat Antigravity IDE as Classic target', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity IDE.exe',
          cmd: 'C:\\Program Files\\Antigravity IDE\\Antigravity IDE.exe',
        },
      ]);

      await expect(isProcessRunning()).resolves.toBe(false);
      await expect(isProcessRunning('ide')).resolves.toBe(true);
    });

    it('should return true when antigravity is found on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'antigravity',
          cmd: '/usr/bin/antigravity',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(true);
    });

    it('should handle find-process errors gracefully', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockRejectedValue(new Error('Process enumeration failed'));

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });

    it('should exclude processes with --type= argument', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity',
          cmd: '/Applications/Antigravity.app/Contents/MacOS/Antigravity --type=utility',
        },
      ]);

      const result = await isProcessRunning();
      expect(result).toBe(false);
    });
  });

  describe('closeAntigravity', () => {
    it('should include helper process when it exactly matches configured Classic executable path', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity Helper.exe',
          bin: 'C:\\Program Files\\Antigravity\\Antigravity.exe',
          cmd: '"C:\\Program Files\\Antigravity\\Antigravity.exe" --type=renderer',
        },
      ]);

      await closeAntigravity('classic');

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL');
    });

    it('should protect IDE process when closing Classic target', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      mockFindProcess.mockResolvedValue([
        {
          pid: 12345,
          name: 'Antigravity IDE.exe',
          cmd: 'C:\\Program Files\\Antigravity IDE\\Antigravity IDE.exe',
        },
      ]);

      await closeAntigravity('classic');

      expect(killSpy).not.toHaveBeenCalled();
    });

    it('should scan all processes so configured custom executable names can be closed', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      Object.defineProperty(process, 'pid', { value: 1000, configurable: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      mockFindProcess.mockImplementation(async (_type, searchName) => {
        if (searchName === '') {
          return [
            {
              pid: 12345,
              name: 'CustomEditor.exe',
              bin: 'C:\\Program Files\\Antigravity\\Antigravity.exe',
              cmd: '"C:\\Program Files\\Antigravity\\Antigravity.exe"',
            },
          ];
        }

        return [];
      });

      await closeAntigravity('classic');

      expect(mockFindProcess).toHaveBeenCalledWith('name', '', false);
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL');
    });
  });

  describe('startAntigravity', () => {
    it('should open the configured macOS app path instead of only using the app name', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      mockFindProcess.mockResolvedValue([]);
      vi.mocked(getAntigravityExecutablePath).mockReturnValue(
        '/Custom/Antigravity IDE.app/Contents/MacOS/Antigravity IDE',
      );

      await startAntigravity('ide', false);

      expect(childProcessMock.spawn).toHaveBeenCalledWith('open', ['/Custom/Antigravity IDE.app'], {
        detached: true,
        stdio: 'ignore',
      });
    });
  });

  describe('Module exports', () => {
    it('should export all required functions', () => {
      expect(isProcessRunning).toBeDefined();
      expect(closeAntigravity).toBeDefined();
      expect(startAntigravity).toBeDefined();
    });
  });
});
