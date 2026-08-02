import { describe, it, expect } from '@jest/globals';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanonicalKind } from '@/lib/core/parsing/taxonomy.js';

/**
 * Decisions whose enforcement is an ABSENCE, or a shape nothing else asserts.
 *
 * An ADR carries `- Enforced by:` naming the thing that proves it is built. For most decisions that
 * is an ordinary test of the feature. For three of them it is not: what was decided was that
 * something stays deleted, or that a set stops changing. Those have no feature to test, so they sat
 * with either no enforcer at all or a symbol reference — and a symbol reference cannot fail. Pointing
 * `- Enforced by:` at an enum that would simply change with the rename it is supposed to prevent is
 * bookkeeping that reads as a gate.
 *
 * Deletions come back. `daac.ts` was deleted once and its archived test was GREEN while testing
 * nothing (CONDUCKS-28). Nothing would notice it returning.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Every file under src/, so an absence assertion cannot be dodged by moving the file. */
function allFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) allFiles(fp, acc);
    else acc.push(fp);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// ADR 0003, as amended by ADR 0100 — a kind's string value may never be RENAMED,
// because ~24 downstream comparisons match on the string and a rename
// type-checks while silently matching nothing. That half stands unchanged.
//
// What ADR 0100 removed is the "additive only, never prune" half. Additive-only
// was written to protect those string comparisons, and it was read as a ban on
// removal — so four kinds nothing could emit stayed declared for weeks, each one
// a claim the graph could not honour. The rule is now: every declared kind has a
// producer, and removing one that has none is correct.
// ---------------------------------------------------------------------------
describe('ADR 0003 + 0100 — a kind never renames, and never outlives its producer', () => {
  const ESTABLISHED = [
    'ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT',
    'INFRA', 'STRUCTURE', 'BEHAVIOR', 'ATOM',
  ] as const;

  it.each(ESTABLISHED)('still carries %s, with its name as its value', kind => {
    expect(CanonicalKind[kind as keyof typeof CanonicalKind]).toBe(kind);
  });

  /**
   * An EXACT set, not a floor. The old floor assertion could not have caught the defect ADR 0100
   * fixed — thirteen kinds passed a `>= 13` check exactly as well as ten do, so a kind with no
   * producer was invisible to it. `taxonomy-reachability.test.ts` is what proves each of these ten
   * is emitted; this pins that the list has not quietly grown a name that skipped that check.
   */
  it('declares exactly these ten kinds', () => {
    expect(Object.keys(CanonicalKind).sort()).toEqual([...ESTABLISHED].sort());
  });

  /** The three the cut removed must not come back without a producer and a decision. */
  it.each(['STATEMENT', 'BRANCH', 'DATA'])('does not declare %s', name => {
    expect(Object.keys(CanonicalKind)).not.toContain(name);
  });
});

// ---------------------------------------------------------------------------
// ADR 0011 — derived-doc GENERATION was killed. Structure is queried live
// (audit / impact / trace), never written to a file that is stale by the next
// commit. The commands and their generators were deleted; nothing stopped a
// later change from reintroducing one.
// ---------------------------------------------------------------------------
describe('ADR 0011 — no static doc generator comes back', () => {
  const GONE = ['context-gen', 'blueprint', 'visualize'];

  it.each(GONE)('has no `%s` CLI command', name => {
    expect(existsSync(path.join(SRC, 'interfaces/cli/commands', `${name}.ts`))).toBe(false);
  });

  it('has no generator module under src/, wherever it might be moved to', () => {
    const offenders = allFiles(SRC)
      .map(f => path.relative(SRC, f))
      .filter(f => /(context-gen|blueprint|visualize)/i.test(path.basename(f)));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ADR 0028 — DAAC deleted. Not unwired code: code that never worked. It looked
// up edges by file path in a graph keyed by node id, so it returned 501
// clusters for 501 files, and its test passed because the fixture set `id`
// equal to `filePath`. `mirror.engine.detectCluster()` is the replacement.
// ---------------------------------------------------------------------------
describe('ADR 0028 — DAAC stays deleted', () => {
  it('has no daac module anywhere under src/', () => {
    const offenders = allFiles(SRC)
      .map(f => path.relative(SRC, f))
      .filter(f => /daac/i.test(f));
    expect(offenders).toEqual([]);
  });

  it('keeps the replacement it was deleted in favour of', () => {
    expect(existsSync(path.join(SRC, 'lib/domain/visual/mirror.engine.ts'))).toBe(true);
  });
});
