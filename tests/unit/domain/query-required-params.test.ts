/**
 * todo54 Phase 1 — a template identifier with no value became `''` and the query answered zero rows.
 *
 * Measured over stdio JSON-RPC during todo53's walk: `blast_radius` and `deep_impact` called with no
 * `symbolId` returned `nodeCount: 0` — "nothing breaks if you change this", for a question that named
 * no symbol. ADR 0145's shape, at the parameter level.
 *
 * `execute()` resolves a missing param to `PARAM_DEFAULTS[p] ?? ''`, and most param names carry no
 * default. `minImporters` was the same bug in its numeric form and got fixed first only because it
 * CRASHED (`CAST('' AS INTEGER)`) instead of answering quietly — the loud instance is always the one
 * that gets noticed.
 *
 * WHICH params are required was read out of the SQL, not guessed, because the blanket rule "no default
 * means required" is wrong here. The library uses two distinct shapes:
 *
 *   optional — `AND (CAST(? AS TEXT) = '' OR e.type = CAST(? AS TEXT))`   ← empty means "any"
 *   required — `WHERE e.targetId = ?`                                      ← empty matches nothing
 *
 * So `edgeType`, `canonicalKind` and `namespaceId` are legitimately optional-empty, and `query` is too
 * (an empty `LIKE '%%'` matches everything, which is what unscoped fuzzy search relies on). The five
 * identifiers below are compared directly and have no meaningful empty value.
 */
import { describe, it, expect } from '@jest/globals';
import { REQUIRED_PARAMS } from '@/lib/domain/analysis/query-service.js';

describe('REQUIRED_PARAMS — read from the SQL, not inferred from the defaults table', () => {
  it('names every identifier that is compared directly', () => {
    expect([...REQUIRED_PARAMS].sort()).toEqual(
      ['namespaceIdPattern', 'structureId', 'symbolId', 'targetId', 'unitId'],
    );
  });

  it('does not include the params guarded by an "empty means any" clause', () => {
    for (const optional of ['edgeType', 'canonicalKind', 'namespaceId']) {
      expect(REQUIRED_PARAMS.has(optional)).toBe(false);
    }
  });

  it('does not include `query` — unscoped fuzzy search passes it empty on purpose', () => {
    expect(REQUIRED_PARAMS.has('query')).toBe(false);
  });

  it('does not include a param that has a default, since a default IS its value when omitted', () => {
    for (const defaulted of ['minRisk', 'minComplexity', 'minTenureDays', 'maxDepth', 'minImporters']) {
      expect(REQUIRED_PARAMS.has(defaulted)).toBe(false);
    }
  });
});
