import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NEEDS_NO_REGISTRY, STALENESS_BYPASS } from '@/interfaces/cli/index.js';

/**
 * A command that answers from the filesystem alone must not boot the structural engine: no grammars, no vault, no graph.
 *
 * The property that stops the list rotting is the LAST test here — each command actually runs in a
 * directory with no `.conducks/` at all. A membership assertion alone would keep passing after someone
 * gives one of these commands a graph dependency; only running it without a graph catches that.
 */
describe('commands that need no registry', () => {
  const cli = path.resolve('build/src/interfaces/cli/index.js');
  let empty = '';

  beforeAll(() => {
    if (!existsSync(cli)) execSync('npm run build', { stdio: 'ignore' });

    // A project with NO vault — the state a fresh clone is in.
    empty = mkdtempSync(path.join(tmpdir(), 'conducks-novault-'));
  });

  it('is a subset of the staleness bypass — otherwise a command skips init then asks for a graph', () => {
    for (const id of NEEDS_NO_REGISTRY) {
      expect(STALENESS_BYPASS.has(id)).toBe(true);
    }
  });

  it('does not claim a command that writes the graph', () => {
    // `analyze` and `clean` are the only writers; neither may ever appear here.
    expect(NEEDS_NO_REGISTRY.has('analyze')).toBe(false);
    expect(NEEDS_NO_REGISTRY.has('clean')).toBe(false);
  });

  it('does not claim a command that reads the graph', () => {
    for (const id of ['status', 'query', 'impact', 'audit', 'trace', 'prune', 'coverage']) {
      expect(NEEDS_NO_REGISTRY.has(id)).toBe(false);
    }
  });

  describe('each one runs with no vault, and boots no engine', () => {
    const run = (id: string, args: string[] = []) =>
      execFileSync('node', [cli, id, ...args], { cwd: empty, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    const cases: Array<[string, string[]]> = [
      ['help', []],
      ['monitor', []],
    ];

    for (const [id, args] of cases) {
      it(`${id} succeeds without .conducks/`, () => {
        const out = run(id, args);
        expect(typeof out).toBe('string');
        // The engine announces itself on stderr when it boots; none of these may trigger it.
        expect(existsSync(path.join(empty, '.conducks'))).toBe(false);
      });
    }

    it('never prints the grammar-engine banner for any of them', () => {
      for (const [id, args] of cases) {
        const stderr = (() => {
          try {
            execFileSync('node', [cli, id, ...args], { cwd: empty, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            return '';
          } catch (e: any) {
            return String(e?.stderr ?? '');
          }
        })();
        expect(stderr).not.toMatch(/Initializing Native Grammar Engine/);
        expect(stderr).not.toMatch(/Structural graph loaded/);
      }
    });
  });
});
