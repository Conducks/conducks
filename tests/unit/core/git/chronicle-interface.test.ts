/**
 * Ported out of tests/legacy/ on 2026-07-26 (todo18 Phase 3). The git chronicle interface had no other coverage.
 *
 * It was archived, excluded from tsc and jest, and still passing against current source — so
 * it described live behaviour nothing else covered. Kept as it was, apart from its location.
 */
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
      expect(mockExec).toHaveBeenCalledWith('git', expect.arrayContaining(['ls-files']), expect.anything());
    });

    it('should filter out node_modules and .git paths', async () => {
      mockExec.mockReturnValue('node_modules/pkg/index.js\nsrc/app.ts\n.git/config\n');

      const files = await chronicle.discoverFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toBe(path.resolve(mockProjectDir, 'src/app.ts'));
    });
  });

  describe('Git Intelligence (Conducks)', () => {
    describe('getFileHistory — one invocation for all three answers (ADR 0061)', () => {
      it('spawns git EXACTLY ONCE and derives count, author count and distribution from it', async () => {
        // The regression this exists for: the reflector called getCommitResonance and
        // getAuthorDistribution back to back, spawning three subprocesses per file — `rev-list
        // --count`, and the SAME `git log --format=%ae` twice. A CPU profile put 86% of parse time
        // in those spawns and under 1% in tree-sitter. The spawn count IS the assertion.
        mockExec.mockReturnValue('a@x.com\nb@x.com\na@x.com\na@x.com\n');

        const h = await chronicle.getFileHistory('src/main.ts');

        expect(mockExec).toHaveBeenCalledTimes(1);
        expect(mockExec).toHaveBeenCalledWith('git', expect.arrayContaining(['log', '--format=%ae']), expect.anything());
        expect(h).not.toBeNull();
        expect(h!.count).toBe(4);          // one line per commit
        expect(h!.authors).toBe(2);        // two distinct addresses
        expect(h!.distribution).toEqual({ 'a@x.com': 3, 'b@x.com': 1 });
      });

      it('derives the same distribution as the method that still exists, from one git output', async () => {
        // What this protects is the SUPERSESSION (ADR 0061): three subprocesses per file became one,
        // on the claim that `rev-list --count HEAD -- <path>` equals the line count of
        // `log -- <path>` — both walk HEAD with the same path filter and the same default history
        // simplification. Verified out-of-band across two repositories and 140 files, one carrying
        // merge commits, with zero disagreements.
        //
        // It used to compare against `getCommitResonance` as well. That method had no caller left
        // and was removed, so the comparison is now against `getAuthorDistribution`, which survives
        // and has real callers, plus the line count the claim rests on.
        const log = 'alice@dev.com\nbob@dev.com\nalice@dev.com\n';

        mockExec.mockReturnValue(log);
        const oldDist = await chronicle.getAuthorDistribution('src/utils.ts');

        mockExec.mockClear();
        mockExec.mockReturnValue(log);
        const h = await chronicle.getFileHistory('src/utils.ts');

        expect(h!.distribution).toEqual(oldDist);
        expect(h!.count).toBe(log.trim().split('\n').length);
        expect(mockExec).toHaveBeenCalledTimes(1);
      });

      it('returns null when git fails, so an unreadable file is not a file with no history', async () => {
        // ADR 0049. An empty distribution and an unreadable one produce identical entropy and
        // identical risk, so they must not produce identical returns.
        mockExec.mockImplementation(() => { throw new Error('not a git repository'); });

        await expect(chronicle.getFileHistory('src/main.ts')).resolves.toBeNull();
      });
    });

    it('should calculate author distribution for entropy analysis', async () => {
      mockExec.mockReturnValue('alice@dev.com\nalice@dev.com\nbob@dev.com\n');

      const dist = await chronicle.getAuthorDistribution('src/utils.ts');

      expect(dist).not.toBeNull();
      expect(dist!['alice@dev.com']).toBe(2);
      expect(dist!['bob@dev.com']).toBe(1);
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
      expect(mockExec).toHaveBeenCalledWith('git', expect.arrayContaining(['rev-list', 'oldhash..HEAD']), expect.anything());
    });
  });
});

describe('git failure is distinguishable from a genuine zero', () => {
  // Own setup: the block above scopes `mockExec` to its describe. Paths must sit INSIDE the mock
  // project, or `isInsideProject` short-circuits and these would pass without git ever failing.
  const projectDir = '/mock/project';
  const inProject = path.join(projectDir, 'src/utils.ts');
  let exec: jest.Mock;
  let git: ChronicleInterface;

  beforeEach(() => {
    exec = jest.fn(() => { throw new Error('not a git repository'); });
    git = new ChronicleInterface(projectDir, exec as any);
  });

  it('returns null commits-behind when git cannot be read, not 0', () => {
    // 0 is also the value for "you are current", and 0 is what silences the staleness banner — so
    // returning it here made the one case that needs reporting look like the healthy case.
    expect(git.getCommitsBehind('abc123')).toBeNull();
  });

  it('returns null author distribution when git cannot be read, not an empty map', async () => {
    // An empty map and a failure both produce entropy 0 and risk 0, so an unreadable file scored
    // as a perfectly-owned one — the safest-looking answer available.
    await expect(git.getAuthorDistribution(inProject)).resolves.toBeNull();
  });

  it('returns null file history when git cannot be read, not a file with no commits', async () => {
    // The same rule as the two above, on the method the pulse actually uses. `getCommitResonance`
    // carried it via an `unavailable` flag and was removed with no caller left; `getFileHistory`
    // says the same thing by returning null, which no caller can mistake for zero commits.
    await expect(git.getFileHistory(inProject)).resolves.toBeNull();
  });
});
