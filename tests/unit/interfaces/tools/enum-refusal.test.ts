import { describe, it, expect } from '@jest/globals';
import { enumErr, AUDIT_MODES, PRUNE_TYPES } from '@/interfaces/tools/tools/synapse.js';

/**
 * An out-of-enum argument must be REFUSED, not answered plausibly.
 *
 * FOUND by driving the MCP surface with deliberate junk:
 *
 *   conducks_audit {mode: "nonsense"}  → the full `scan` payload, byte-identical to mode:"scan".
 *                                        The caller asked for one analysis and silently got another.
 *   conducks_prune {type: "BOGUS"}     → {findings: [], summary: {ORPHAN: 0, UNUSED_EXPORT: 0,
 *                                        STALE_IMPORT: 0}, total: 0} — a confident clean bill of
 *                                        health for the whole codebase, produced by a TYPO, and
 *                                        indistinguishable from a genuinely clean project.
 *
 * The second is the nastier one: it is the empty-reads-as-clean class (ADR 0124/0145) reached through
 * unvalidated input rather than through an empty vault.
 *
 * The CLI already fixed exactly this for `status --mode map` — "an UNKNOWN mode is an error, not a
 * default" — and the tool surface never received that fix, which is the recurring shape: a defect
 * corrected on one surface while its twin survives on the other, like `density`.
 *
 * This imports the REAL `enumErr`. A local re-implementation would be the same mistake that let the
 * SQL guard's multi-statement hole survive in both the guard and its copy.
 */
describe('enumErr — a wrong value is refused, a missing one defaults', () => {
  it('accepts every value the audit schema advertises', () => {
    for (const mode of AUDIT_MODES) expect(enumErr(mode, AUDIT_MODES, 'mode')).toBeNull();
  });

  it('accepts every value the prune schema advertises', () => {
    for (const t of PRUNE_TYPES) expect(enumErr(t, PRUNE_TYPES, 'type')).toBeNull();
  });

  it('lets an OMITTED parameter through so the documented default still applies', () => {
    // A missing value is not a wrong value: both parameters are optional.
    expect(enumErr(undefined, AUDIT_MODES, 'mode')).toBeNull();
    expect(enumErr(null, PRUNE_TYPES, 'type')).toBeNull();
  });

  it('refuses an unknown mode and NAMES the valid ones', () => {
    const err: any = enumErr('nonsense', AUDIT_MODES, 'mode');
    expect(err).not.toBeNull();
    expect(err.error.code).toBe('INVALID_PARAM');
    // An agent that cannot see the valid values just guesses again.
    expect(err.error.message).toMatch(/scan, advice, guard, archeology, fallback/);
    expect(err.error.message).toMatch(/nonsense/);
  });

  it('refuses an unknown prune type rather than reporting zero dead code', () => {
    const err: any = enumErr('BOGUS', PRUNE_TYPES, 'type');
    expect(err).not.toBeNull();
    expect(err.error.message).toMatch(/ORPHAN, UNUSED_EXPORT, STALE_IMPORT, all/);
  });

  it('is not retryable — guessing again will not help', () => {
    const err: any = enumErr('nope', AUDIT_MODES, 'mode');
    expect(err.error.retryable).toBe(false);
  });

  it('refuses a non-string too, rather than coercing it', () => {
    // `{mode: 5}` and `{mode: ["scan"]}` both used to sail past into the fall-through.
    expect(enumErr(5, AUDIT_MODES, 'mode')).not.toBeNull();
    expect(enumErr(['scan'], AUDIT_MODES, 'mode')).not.toBeNull();
    expect(enumErr({}, PRUNE_TYPES, 'type')).not.toBeNull();
  });

  it('case matters — "SCAN" is not "scan"', () => {
    // Stated deliberately: silently upper/lower-casing would be another quiet reinterpretation of a
    // request the caller did not make.
    expect(enumErr('SCAN', AUDIT_MODES, 'mode')).not.toBeNull();
    expect(enumErr('orphan', PRUNE_TYPES, 'type')).not.toBeNull();
  });
});
