import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';
import path from 'node:path';

describe('ChronicleInterface Unit Tests 📜', () => {
  let chronicle: ChronicleInterface;
  let mockExec: jest.Mock;
  const mockProjectDir = '/mock/project';

  beforeEach(() => {
    mockExec = jest.fn();
    chronicle = new ChronicleInterface(mockProjectDir, mockExec as any);
  });

  describe('File Discovery', () => {
    it('should discover versioned files via git ls-files', async () => {
      mockExec.mockReturnValueOnce('src/main.ts\nsrc/utils.ts\n');
      mockExec.mockReturnValueOnce('docs/README.md\n');

      const files = await chronicle.discoverFiles();

      expect(files).toContain(path.resolve(mockProjectDir, 'src/main.ts'));
      expect(files).toContain(path.resolve(mockProjectDir, 'docs/README.md'));
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git ls-files'), expect.anything());
    });

    it('should filter out node_modules and .git paths', async () => {
      mockExec.mockReturnValue('node_modules/pkg/index.js\nsrc/app.ts\n.git/config\n');

      const files = await chronicle.discoverFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toBe(path.resolve(mockProjectDir, 'src/app.ts'));
    });
  });

  describe('Git Intelligence (Conducks)', () => {
    it('should extract commit resonance (count and authors)', async () => {
      mockExec.mockReturnValueOnce('42\n'); // Count
      mockExec.mockReturnValueOnce('7\n');  // Authors

      const res = await chronicle.getCommitResonance('src/main.ts');

      expect(res.count).toBe(42);
      expect(res.authors).toBe(7);
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('rev-list --count'), expect.anything());
    });

    it('should calculate author distribution for entropy analysis', async () => {
      mockExec.mockReturnValue('alice@dev.com\nalice@dev.com\nbob@dev.com\n');

      const dist = await chronicle.getAuthorDistribution('src/utils.ts');

      expect(dist['alice@dev.com']).toBe(2);
      expect(dist['bob@dev.com']).toBe(1);
    });

    it('should parse porcelain blame data into symbol metadata', async () => {
      const mockPorcelain = [
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001 1 1 1',
        'author-mail <dev1@gospel.tech>',
        'author-time 1711737600',
        'summary Initial commit',
        'filename src/main.ts',
        '\timport os',
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001 2 2 1',
        '\tprint("Hello")'
      ].join('\n');

      mockExec.mockReturnValue(mockPorcelain);

      const blame = await chronicle.getBlameData('src/main.ts');

      expect(blame[1]).toBeDefined();
      expect(blame[1].author).toBe('dev1@gospel.tech');
      expect(blame[1].timestamp).toBe(1711737600);
      expect(blame[2].author).toBe('dev1@gospel.tech');
    });
  });

  describe('Sync Staleness (Conducks)', () => {
    it('should fetch the current HEAD hash', () => {
      mockExec.mockReturnValue('deadbeef\n');
      expect(chronicle.getHeadHash()).toBe('deadbeef');
    });

    it('should calculate commits behind a base hash', () => {
      mockExec.mockReturnValue('5\n');
      expect(chronicle.getCommitsBehind('oldhash')).toBe(5);
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('rev-list oldhash..HEAD'), expect.anything());
    });
  });
});
