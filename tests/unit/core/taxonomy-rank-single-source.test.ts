import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { CanonicalKind, CanonicalRank, mapToCanonical } from '@/lib/core/parsing/taxonomy.js';

/**
 * ADR 0099 — a kind has ONE rank, and `CanonicalRank` is where it lives.
 *
 * Six producers used to write the number by hand, from a nine-rung ladder the taxonomy outgrew.
 * Measured on this repository's own vault before the fix: 215 files at rank 3 and 410 files at
 * rank 5 — same `canonicalKind`, same `semantic_kind`, two different rungs. Directories sat at 2
 * instead of 4, library namespaces at 1 instead of 7, routes at 6 instead of 8. Everything that
 * orders or filters by rank (`context` excludes by rank, ADR 0067; layer paths; hierarchy) saw two
 * classes of the same thing.
 *
 * Nothing failed. A rank is a plain integer, so a wrong one type-checks, persists, and reads back
 * exactly like a right one — which is why the guard has to be a test rather than a convention.
 */
describe('rank has a single source of truth', () => {
  const SRC = path.resolve(process.cwd(), 'src');

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });

  /**
   * The durable guard: no source file may write a rank as a literal. It must read `CanonicalRank`.
   *
   * A grep is the right shape here because the defect is not a wrong VALUE — it is a value written
   * in a second place, which is free to drift the next time a kind is added. The one exemption is
   * the taxonomy legend's own anchor, which describes the ladder and therefore cannot stand on it.
   */
  it('no producer writes a rank as a number', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const hit = /canonicalRank:\s*(-?\d+)/.exec(line);
        if (!hit) return;
        if (hit[1] === '-1') return;   // the legend anchor, deliberately off the ladder
        offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  /** `mapToCanonical` must agree with the table for every kind it can return. */
  it('mapToCanonical returns the table rank for each kind', () => {
    const samples: Array<[string, CanonicalKind]> = [
      ['external_dependency', CanonicalKind.ECOSYSTEM],
      ['repository', CanonicalKind.REPOSITORY],
      ['package', CanonicalKind.PACKAGE],
      ['namespace', CanonicalKind.NAMESPACE],
      ['directory', CanonicalKind.DIRECTORY],
      ['file', CanonicalKind.UNIT],
      ['route', CanonicalKind.INFRA],
      ['class', CanonicalKind.STRUCTURE],
      ['function', CanonicalKind.BEHAVIOR],
      ['variable', CanonicalKind.ATOM],
      ['parameter', CanonicalKind.DATA]
    ];
    for (const [semantic, expected] of samples) {
      const got = mapToCanonical(semantic);
      expect(got.kind).toBe(expected);
      expect(got.rank).toBe(CanonicalRank[expected]);
    }
  });

  /**
   * The ladder is strictly increasing and gapless. A new kind inserted with a duplicate or skipped
   * rank silently reshapes containment for every node of that kind — `taxonomy/MODULE.md` records
   * that rank drives hierarchy and layer paths, not display.
   */
  it('the ladder is dense and strictly ordered', () => {
    const ranks = (Object.values(CanonicalKind) as CanonicalKind[]).map(k => CanonicalRank[k]);
    expect(ranks).toEqual([...Array(ranks.length).keys()]);
  });
});
