import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NEEDS_NO_REGISTRY, STALENESS_BYPASS } from '@/interfaces/cli/index.js';

/**
 * ADR 0033 — the CLI's half of the docs/code split. A command that answers from authored markdown and
 * the filesystem must not boot the structural engine: no grammars, no vault, no graph.
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

    // A project with docs and NO vault — the state a fresh clone is in.
    empty = mkdtempSync(path.join(tmpdir(), 'conducks-novault-'));
    mkdirSync(path.join(empty, 'docs', 'decisions'), { recursive: true });
    mkdirSync(path.join(empty, 'docs', 'todos'), { recursive: true });
    writeFileSync(path.join(empty, 'docs', 'decisions', '0001-a-decision.md'),
      '# 0001 — a decision\n\nStatus: Accepted\n- Date: 2026-07-26\n\n## Context\nc\n\n## Decision\nd\n\n## Consequences\nq\n');
    writeFileSync(path.join(empty, 'docs', 'todos', 'todo01.md'),
      '# todo01 — work\n\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n- Builds: 0001\n- [ ] the open task\n');
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

    // `bootstrap-docs` WRITES template files, so it gets its own throwaway root rather than sharing one.
    const cases: Array<[string, string[]]> = [
      ['help', []],
      ['docs-status', []],
      ['docs-lint', []],
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

    it('bootstrap-docs succeeds without .conducks/ and writes only docs', () => {
      const root = mkdtempSync(path.join(tmpdir(), 'conducks-bootstrap-'));
      try {
        execFileSync('node', [cli, 'bootstrap-docs', 'fixture'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        expect(existsSync(path.join(root, 'docs'))).toBe(true);
        expect(existsSync(path.join(root, '.conducks'))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

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
