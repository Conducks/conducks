import { describe, it, expect } from '@jest/globals';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CanonicalKind } from "@/contracts/index.js";

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
 * nothing (the producer's-id-shape fixture agreement failure, see docs/visuals/modules/core/graph.md).
 * Nothing would notice it returning.
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
// equal to `filePath`.
//
// The replacement it names moved twice. ADR 0079 lifted the rule out of
// `mirror.engine.detectCluster()` into `core/graph/cluster-rule.ts`, leaving the
// engine delegating to it; ADR 0190 then deleted the engine, which had been dead
// on the live path since ADR 0054 put the wave in SQL. So the file this asserted
// is gone and the RULE it was kept for is what is pinned here — the half of 0028
// that still binds. The anti-resurrection half is unchanged.
// ---------------------------------------------------------------------------
describe('ADR 0028 — DAAC stays deleted', () => {
  it('has no daac module anywhere under src/', () => {
    const offenders = allFiles(SRC)
      .map(f => path.relative(SRC, f))
      .filter(f => /daac/i.test(f));
    expect(offenders).toEqual([]);
  });

  it('keeps the clustering rule it was deleted in favour of (ADR 0079, ADR 0190)', () => {
    expect(existsSync(path.join(SRC, 'lib/core/graph/cluster-rule.ts'))).toBe(true);
  });

  it('and the engine that rule outlived does not come back (ADR 0190)', () => {
    expect(existsSync(path.join(SRC, 'lib/domain/visual'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ADR 0156 — conducks writes to its own vault and to nothing else.
//
// `rename` was measured wrong three separate ways in two benchmark rounds, each under a success
// message, and each fix was local to the form that round happened to try. What the ADR removes is
// not a bug but a capability: nothing here edits a user's source any more.
//
// Two cases, because the command coming back and a NEW writer appearing are different regressions
// and only the second is likely. The first is ADR 0028's lesson — a deletion nobody pins returns.
// ---------------------------------------------------------------------------
describe('ADR 0156 — the rename writer stays deleted', () => {
  it('has no rename or gvr module anywhere under src/', () => {
    const offenders = allFiles(SRC)
      .map(f => path.relative(SRC, f))
      .filter(f => /(^|\/)(rename|gvr)[^/]*\.ts$/i.test(f));
    expect(offenders).toEqual([]);
  });

  it('registers no MCP tool that declares itself destructive', () => {
    // The surface promise, stated where an agent can read it. `conducks_rename` was the only tool
    // carrying `destructiveHint: true`, and it carried it honestly — it modified source. With it
    // gone, every tool conducks exposes is a reader, and a new writer cannot be added without
    // either lying in its annotations or failing here.
    //
    // Scoped to the annotation rather than to `writeFileSync`, because conducks DOES write files a
    // user asks it to create — `.conducksignore`, git hooks, the MCP config, coverage HTML, the
    // docs scaffold. What ADR 0156 ends is editing code somebody else wrote.
    const offenders: string[] = [];
    for (const file of allFiles(path.join(SRC, 'interfaces/tools'))) {
      const src = readFileSync(file, 'utf8');
      if (/destructiveHint:\s*true/.test(src)) offenders.push(path.relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });
});
