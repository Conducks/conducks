import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { FileHashGate } from "@/lib/core/persistence/index.js";

/**
 * The monitor reports; it never fixes (todo17 Phases 2-3, ADR 0030). These cover the parts that decide
 * whether a human is told the truth:
 *
 *  - a project with no vault must still get a docs answer, and must not read as "current"
 *  - a "still accurate" dismissal is bound to the CODE it was checked against, so it cannot silence a
 *    note forever — that is the whole difference between an escape hatch and a mute button
 *  - an enhancement's intent must name a doc that exists, or it is refused
 */
describe('ProjectMonitor', () => {
  let home = '';
  let project = '';
  let monitor: ProjectMonitor;
  let registry: ProjectRegistry;

  const write = (rel: string, body: string) => {
    const full = path.join(project, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    return full;
  };

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'conducks-home-'));
    project = mkdtempSync(path.join(tmpdir(), 'conducks-proj-'));
    registry = new ProjectRegistry(home);
    monitor = new ProjectMonitor(registry);
    registry.register(project, 'fixture');
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });

  it('reports a project that has never been analyzed as such, not as current', async () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');

    const [report] = await monitor.reportAll();

    expect(report.graph.analyzed).toBe(false);
    expect(report.graph.stale).toBe(false);      // unknown is not "behind"
    expect(report.name).toBe('fixture');
  });

  it('still answers on docs when there is no vault at all', async () => {
    write('docs/todos/todo01.md', '# todo01 — a thing\n\nStatus: nonsense\n');

    const [report] = await monitor.reportAll();

    expect(report.docs.violations).toBeGreaterThan(0);
  });

  it('marks a root that has vanished as unavailable rather than throwing', async () => {
    registry.register('/definitely/not/a/real/path', 'ghost');

    const reports = await monitor.reportAll();
    const ghost = reports.find(r => r.name === 'ghost')!;

    expect(ghost.unavailable).toMatch(/does not exist/);
  });

  /**
   * These two run against a REAL vault, because the distinction they check lives in the comparison
   * between stored hashes and disk — a hand-built report object would only restate the expectation.
   */
  describe('against a real vault', () => {
    const seed = async (hashed: Array<[string, string]>) => {
      const persistence = new SynapsePersistence(project);
      for (const [rel, body] of hashed) {
        write(rel, body);
        await persistence.setFileHash(path.join(project, rel), FileHashGate.hash(body), Buffer.byteLength(body));
      }
      await persistence.close();
    };

    it('does NOT call a project stale for files the graph has never analyzed', async () => {
      await seed([['src/a.ts', 'export const a = 1;']]);
      // Never hashed: `analyze` is incremental by mtime, so a file untouched since the last pulse never
      // enters a wave. Counting these as staleness reported "graph behind" right after a full pulse.
      write('scripts/tool.ts', 'export const t = 1;');
      write('scripts/other.ts', 'export const o = 1;');

      const [report] = await monitor.reportAll();

      expect(report.graph.analyzed).toBe(true);
      expect(report.graph.added).toBe(2);        // the coverage gap IS reported
      expect(report.graph.changed).toBe(0);
      expect(report.graph.stale).toBe(false);    // …but it is not staleness
    });

    it('does call it stale when analyzed content actually changed', async () => {
      await seed([['src/a.ts', 'export const a = 1;']]);
      write('src/a.ts', 'export const a = 2;');

      const [report] = await monitor.reportAll();

      expect(report.graph.changed).toBe(1);
      expect(report.graph.stale).toBe(true);
    });
  });

  it('hashes a module from the files directly in it, and changes when one of them changes', () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');
    const before = monitor.moduleHash(project, 'src/lib/core/parsing');

    write('src/lib/core/parsing/a.ts', 'export const a = 2;');

    expect(monitor.moduleHash(project, 'src/lib/core/parsing')).not.toBe(before);
    expect(before).toHaveLength(64);
  });

  it('ignores non-source files when hashing a module', () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');
    const before = monitor.moduleHash(project, 'src/lib/core/parsing');

    write('src/lib/core/parsing/NOTES.md', 'a note nobody compiles');

    expect(monitor.moduleHash(project, 'src/lib/core/parsing')).toBe(before);
  });

  it('returns an empty hash for a module that does not exist, instead of throwing', () => {
    expect(monitor.moduleHash(project, 'src/nope')).toBe('');
  });

  it('records a dismissal bound to the code, so the flag returns when the code moves', () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');

    const { hash } = monitor.dismissReview(project, 'src/lib/core/parsing');
    expect(hash).toBe(monitor.moduleHash(project, 'src/lib/core/parsing'));

    write('src/lib/core/parsing/a.ts', 'export const a = 2;');
    const stored = JSON.parse(readFileSync(path.join(project, '.conducks', 'doc-reviews.json'), 'utf8'));

    // The stored hash is now stale against the module — which is exactly how the flag comes back.
    expect(stored['src/lib/core/parsing']).not.toBe(monitor.moduleHash(project, 'src/lib/core/parsing'));
  });

  it('stores an enhancement dismissal with its intent address alongside the hash', () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');
    write('docs/todos/todo42.md', '# todo42\n');

    monitor.dismissReview(project, 'src/lib/core/parsing', 'todo42');
    const stored = JSON.parse(readFileSync(path.join(project, '.conducks', 'doc-reviews.json'), 'utf8'));

    expect(stored['src/lib/core/parsing']).toMatch(/\|todo42$/);
  });

  describe('intent addresses', () => {
    it('resolves an ADR number to its file', () => {
      write('docs/decisions/0031-a-real-decision.md', '# 0031 — a real decision\n');
      expect(monitor.resolveIntent(project, '0031')).toBe(path.join('docs', 'decisions', '0031-a-real-decision.md'));
    });

    it('resolves a todo, with or without a phase suffix', () => {
      write('docs/todos/todo42.md', '# todo42\n');
      expect(monitor.resolveIntent(project, 'todo42')).toBe(path.join('docs', 'todos', 'todo42.md'));
      expect(monitor.resolveIntent(project, 'todo42#P3')).toBe(path.join('docs', 'todos', 'todo42.md'));
    });

    it('resolves a direct path to an architecture note', () => {
      write('docs/architecture/modules/core/parsing/MODULE.md', '# parsing\n');
      const rel = 'docs/architecture/modules/core/parsing/MODULE.md';
      expect(monitor.resolveIntent(project, rel)).toBe(rel);
    });

    it('refuses an address that names nothing — the point of requiring one is that it can be opened', () => {
      expect(monitor.resolveIntent(project, '9999')).toBeUndefined();
      expect(monitor.resolveIntent(project, 'todo99')).toBeUndefined();
      expect(monitor.resolveIntent(project, 'docs/nope.md')).toBeUndefined();
    });
  });

  it('writes dismissals into the project, not the machine home — they describe this code', () => {
    write('src/lib/core/parsing/a.ts', 'export const a = 1;');
    monitor.dismissReview(project, 'src/lib/core/parsing');

    expect(existsSync(path.join(project, '.conducks', 'doc-reviews.json'))).toBe(true);
    expect(existsSync(path.join(home, '.conducks', 'doc-reviews.json'))).toBe(false);
  });
});
