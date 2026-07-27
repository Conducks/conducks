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
// ADR 0003 — the taxonomy reconcile is ADDITIVE. Kinds may be added; an existing
// kind's string value may never be renamed, because ~24 downstream comparisons
// match on the string. A rename type-checks and silently matches nothing.
// ---------------------------------------------------------------------------
describe('ADR 0003 — taxonomy grows, it never renames', () => {
  const ESTABLISHED = [
    'ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT',
    'INFRA', 'STRUCTURE', 'BEHAVIOR', 'STATEMENT', 'BRANCH', 'ATOM', 'DATA',
  ] as const;

  it.each(ESTABLISHED)('still carries %s, with its name as its value', kind => {
    expect(CanonicalKind[kind as keyof typeof CanonicalKind]).toBe(kind);
  });

  it('adding a kind is allowed — this asserts a floor, not an exact set', () => {
    expect(Object.keys(CanonicalKind).length).toBeGreaterThanOrEqual(ESTABLISHED.length);
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
