/**
 * Filter builder (todo02 Phase 3) — typed filter object -> parameterised SQL for
 * `conducks_query` mode 'filter'. This is the security-critical surface: field names and
 * operators must come from fixed allowlists, values must always be bound with `?`, and an
 * unknown field/operator must be REJECTED, never passed through. See S2/S3
 * (docs/todos/completed/todo03.md) for the two SQL injection bugs this pattern already fixed
 * once (MCP query template interpolation, unparameterised purgeUnits DELETE).
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildFilterQuery,
  FilterValidationError,
  FILTERABLE_FIELDS,
  FILTER_MAX_LIMIT,
  FILTER_DEFAULT_LIMIT,
  type QueryFilter,
} from '@/lib/domain/analysis/filter-builder.js';

describe('buildFilterQuery — happy path', () => {
  it('compiles a single eq condition to a parameterised query', () => {
    const { sql, params } = buildFilterQuery({
      conditions: [{ field: 'canonicalKind', operator: 'eq', value: 'BEHAVIOR' }],
    });
    expect(sql).toContain('canonicalKind = ?');
    expect(sql).toContain('FROM nodes');
    expect(sql).toMatch(/LIMIT \?/);
    expect(params).toEqual(['BEHAVIOR', FILTER_DEFAULT_LIMIT]);
  });

  it('compiles multiple AND-ed conditions in order', () => {
    const { sql, params } = buildFilterQuery({
      conditions: [
        { field: 'risk', operator: 'gte', value: 0.5 },
        { field: 'canonicalKind', operator: 'eq', value: 'BEHAVIOR' },
      ],
    });
    expect(sql).toContain('risk >= ? AND canonicalKind = ?');
    expect(params.slice(0, 2)).toEqual([0.5, 'BEHAVIOR']);
  });

  it('compiles operator "in" to an IN (...) clause with one placeholder per value', () => {
    const { sql, params } = buildFilterQuery({
      conditions: [{ field: 'canonicalKind', operator: 'in', value: ['BEHAVIOR', 'STRUCTURE'] }],
    });
    expect(sql).toContain('canonicalKind IN (?, ?)');
    expect(params).toEqual(['BEHAVIOR', 'STRUCTURE', FILTER_DEFAULT_LIMIT]);
  });

  it('clamps limit to FILTER_MAX_LIMIT', () => {
    const { params } = buildFilterQuery({
      conditions: [{ field: 'name', operator: 'like', value: '%foo%' }],
      limit: 999,
    });
    expect(params[params.length - 1]).toBe(FILTER_MAX_LIMIT);
  });

  it('floors limit to 1', () => {
    const { params } = buildFilterQuery({
      conditions: [{ field: 'name', operator: 'like', value: '%foo%' }],
      limit: -5,
    });
    expect(params[params.length - 1]).toBe(1);
  });

  it('every filterable field maps to a real column name (no SQL punctuation)', () => {
    for (const field of FILTERABLE_FIELDS) {
      expect(field).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });
});

describe('buildFilterQuery — rejects malformed input', () => {
  it('rejects a missing/empty conditions array', () => {
    expect(() => buildFilterQuery({ conditions: [] })).toThrow(FilterValidationError);
    expect(() => buildFilterQuery({} as QueryFilter)).toThrow(FilterValidationError);
    expect(() => buildFilterQuery(null as unknown as QueryFilter)).toThrow(FilterValidationError);
  });

  it('rejects more than 10 conditions', () => {
    const conditions = Array.from({ length: 11 }, () => ({ field: 'risk', operator: 'gt', value: 0 }));
    expect(() => buildFilterQuery({ conditions })).toThrow(FilterValidationError);
  });

  it('rejects "in" with a non-array value', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'canonicalKind', operator: 'in', value: 'BEHAVIOR' as any }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects "in" with more than 50 values', () => {
    const value = Array.from({ length: 51 }, (_, i) => `k${i}`);
    expect(() => buildFilterQuery({ conditions: [{ field: 'canonicalKind', operator: 'in', value } as any] })).toThrow(
      FilterValidationError
    );
  });

  it('rejects a non-"in" operator given an array value', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk', operator: 'gt', value: [1, 2] as any }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects an unsupported value type (object)', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk', operator: 'gt', value: { nope: true } as any }] })
    ).toThrow(FilterValidationError);
  });
});

// ---------------------------------------------------------------------------
// Injection attempts — the whole point of this module. Each of these must be REFUSED before
// any SQL is built, or, where a value is genuinely just data (never SQL text), safely bound as
// a `?` parameter instead of being concatenated into the query.
// ---------------------------------------------------------------------------
describe('buildFilterQuery — injection attempts are refused or safely parameterised', () => {
  it('rejects a field name that is not in the allowlist, e.g. "1=1 OR"', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: '1=1 OR', operator: 'eq', value: 'x' }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects a field name that tries to inject via a real column plus SQL, e.g. "risk; DROP TABLE nodes; --"', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk; DROP TABLE nodes; --', operator: 'eq', value: 1 }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects an operator that is not in the fixed set, e.g. "; DELETE"', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk', operator: '; DELETE', value: 1 }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects an operator that smuggles raw SQL as an "operator", e.g. "= 1 OR 1=1 --"', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk', operator: '= 1 OR 1=1 --', value: 1 }] })
    ).toThrow(FilterValidationError);
  });

  it('binds a classic injection payload as a VALUE parameter, never as SQL text', () => {
    const payload = '"; DROP TABLE nodes; --';
    const { sql, params } = buildFilterQuery({
      conditions: [{ field: 'name', operator: 'eq', value: payload }],
    });
    // The payload must appear only as a bound parameter — never spliced into the SQL string.
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('name = ?');
    expect(params[0]).toBe(payload);
  });

  it('binds an injection payload passed through operator "in" as parameters, one per value', () => {
    const payload = "x'); DROP TABLE nodes; --";
    const { sql, params } = buildFilterQuery({
      conditions: [{ field: 'name', operator: 'in', value: [payload, 'ok'] }],
    });
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('name IN (?, ?)');
    expect(params[0]).toBe(payload);
  });

  it('rejects a whitespace/case variant used to sneak past the field allowlist, e.g. " risk"', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: ' risk', operator: 'eq', value: 1 }] })
    ).toThrow(FilterValidationError);
  });

  it('rejects a field name matching a real column but with SQL comment syntax appended', () => {
    expect(() =>
      buildFilterQuery({ conditions: [{ field: 'risk/**/', operator: 'eq', value: 1 }] })
    ).toThrow(FilterValidationError);
  });
});

// ---------------------------------------------------------------------------
// Proof the guard is real, not decorative: with the allowlist check removed (simulated here by
// calling the internal validation logic directly against a field NOT in FILTERABLE_FIELDS but
// asserting the set itself), a regression that widens the set would be caught by this test.
// ---------------------------------------------------------------------------
describe('buildFilterQuery — guard is load-bearing', () => {
  it('FILTERABLE_FIELDS excludes JSON blob and internal bookkeeping columns', () => {
    for (const forbidden of ['dna', 'signature', 'kinetic', 'metadata', 'pulseId', 'fingerprint']) {
      expect(FILTERABLE_FIELDS.has(forbidden)).toBe(false);
    }
  });

  it('a field not present in FILTERABLE_FIELDS is always rejected, proving the check is a real gate', () => {
    expect(FILTERABLE_FIELDS.has('__proto__')).toBe(false);
    expect(() =>
      buildFilterQuery({ conditions: [{ field: '__proto__', operator: 'eq', value: 1 }] })
    ).toThrow(FilterValidationError);
  });
});

/**
 * `doc` is filterable, so conducks can be asked which of its own symbols are undocumented.
 *
 * It was missing from the allowlist, and the cost was concrete: every doc-gap measurement in the
 * ADR 0150 campaign had to be a direct vault read, because the tool could not produce its own
 * cleanup list. A code-intelligence tool that cannot answer a question about itself is one nobody
 * can check.
 *
 * Kept as a separate block from the security cases above, because the allowlist is the security
 * boundary: this asserts a field was ADDED to it deliberately, which is exactly the kind of change
 * that should never happen by accident.
 */
describe('doc is filterable', () => {
  it('accepts a condition on doc and binds the value', () => {
    const { sql, params } = buildFilterQuery({
      conditions: [{ field: 'doc', operator: 'like', value: '%Shannon%' }],
    } as QueryFilter);

    expect(sql).toContain('doc');
    expect(params).toContain('%Shannon%');
  });

  it('is in the allowlist beside the fields that were always there', () => {
    expect(FILTERABLE_FIELDS.has('doc')).toBe(true);
    expect(FILTERABLE_FIELDS.has('name')).toBe(true);
  });

  it('still refuses a field that is NOT on the list', () => {
    // The counter-test, and the one that matters: adding `doc` must not have widened the gate.
    expect(() => buildFilterQuery({
      conditions: [{ field: 'docs', operator: 'like', value: '%x%' }],
    } as QueryFilter)).toThrow(FilterValidationError);
  });
});
