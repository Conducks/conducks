import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VOLATILE_NODE_COLUMNS, CONTENT_NODE_COLUMNS, ALL_LAYERED_NODE_COLUMNS, isContentColumn,
} from '@/lib/core/persistence/content-key.js';

/**
 * ADR 0081 — a content hash covers only what does not move.
 *
 * Content-addressed layers are 0.564x the size of flat ones ONLY when the volatile columns are
 * outside the hash. Include them and dedup falls from 48.4% to 3.5%, and the same design measures
 * as a 2.14x LOSS — which is exactly what happened, twice, before the cause was found.
 *
 * The failure is SILENT: a column added to the content row makes the vault grow and nothing
 * reports it. So these tests exist to make a misclassified column fail loudly at the gate.
 */
describe('the content key covers only stable columns', () => {
  it('excludes every column measured volatile', () => {
    for (const c of VOLATILE_NODE_COLUMNS) expect(isContentColumn(c)).toBe(false);
  });

  it('includes the columns identical on every shared id', () => {
    for (const c of ['fingerprint', 'file', 'dna', 'signature', 'unitId', 'semantic_kind']) {
      expect(isContentColumn(c)).toBe(true);
    }
  });

  /**
   * The four are not interchangeable trivia — they are the measurement. `gravity` was the only one
   * todo20#P0 named; `metadata`, `rootId` and `layer_path` each move on ~90% of rows against
   * `gravity`'s 26%, so dropping any of them from this list is what re-creates the strawman.
   */
  it('names exactly the four measured volatile columns', () => {
    for (const c of ['gravity', 'layer_path', 'metadata', 'rootId']) {
      expect(VOLATILE_NODE_COLUMNS).toContain(c);
    }
  });

  /**
   * The columns the MEASUREMENT could not see. Both layers were analyzed minutes apart, so anything
   * derived from wall-clock time was identical by construction and scored 0% volatile — while
   * `reflector.ts` computes `tenureDays = (now - earliestTime) / 86400`, which differs on every file
   * once two layers are built on different days. `kinetic` carries that value, so it is volatile
   * despite measuring perfectly stable. This is the case where trusting the number would have been
   * wrong, and it is pinned so nobody "corrects" it back using the same blind measurement.
   */
  it('treats time-derived columns as volatile even though they measured 0%', () => {
    for (const c of ['kinetic', 'blame_age_days', 'churn_count_90d', 'entropy_score']) {
      expect(isContentColumn(c)).toBe(false);
    }
  });

  it('never lists a column on both sides', () => {
    const overlap = CONTENT_NODE_COLUMNS.filter(c => (VOLATILE_NODE_COLUMNS as readonly string[]).includes(c));
    expect(overlap).toEqual([]);
  });

  /**
   * `id` keys the SLOT, not the content — a slot finds its content through it, so hashing it would
   * defeat the sharing the design is bought for.
   */
  it('keeps `id` out of the content columns', () => {
    expect(isContentColumn('id')).toBe(false);
    expect(ALL_LAYERED_NODE_COLUMNS).toContain('id');
  });

  /**
   * The guard that actually bites later. A column added to the `nodes` schema and to neither list is
   * unclassified, and the default — silently ending up in the content hash — is the expensive one.
   */
  it('accounts for every column the nodes schema persists', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.resolve(here, '../../../../src/lib/core/persistence/persistence.ts'), 'utf8');
    const decl = /const columns = \[([^\]]*)\]/.exec(src);
    expect(decl).not.toBeNull();

    const persisted = [...decl![1].matchAll(/'([^']+)'/g)].map(m => m[1])
      // `pulseId` is the row's own bookkeeping and predates layers; it is not node content.
      .filter(c => c !== 'pulseId');

    const accounted = new Set<string>(ALL_LAYERED_NODE_COLUMNS);
    const unclassified = persisted.filter(c => !accounted.has(c));
    expect(unclassified).toEqual([]);
  });
});
