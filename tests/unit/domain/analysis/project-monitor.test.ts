import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { ProjectRegistry } from '@/lib/domain/federation/index.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { FileHashGate } from "@/lib/core/persistence/index.js";

/** The monitor reports; it never fixes. A project with no vault must not read as "current". */
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
});
