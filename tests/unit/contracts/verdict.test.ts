import { describe, it, expect } from '@jest/globals';
import { verdict, renderVerdict, verdictToJson, findingsOf, examinedOf, type Verdict } from '@/contracts/verdict.js';

/**
 * The type that makes "nothing checked reads as clean" un-writable (ADR 0124, made enforceable).
 *
 * The behaviour under test is a DISCRIMINATION, not a formatting choice: zero findings against zero
 * things examined and zero findings against ten thousand things examined are different claims, and
 * every instance of this bug collapsed them into one.
 */
describe('Verdict — a pass must carry its denominator', () => {
  it('nothing examined is NOT clean, however empty the findings are', () => {
    const v = verdict(0, [], 'no docs/ directory');
    expect(v.kind).toBe('nothing-to-check');
    // The distinction the whole class of bug turns on.
    expect(v.kind).not.toBe('clean');
  });

  it('things examined with no findings IS clean, and says how many', () => {
    const v = verdict(1200, [], 'unused');
    expect(v).toEqual({ kind: 'clean', examined: 1200 });
  });

  it('findings carry both the list and what it was drawn from', () => {
    const v = verdict(50, ['a', 'b'], 'unused');
    expect(v).toEqual({ kind: 'findings', examined: 50, found: ['a', 'b'] });
  });

  it('emptiness of the DENOMINATOR is decided before emptiness of the findings', () => {
    // The inversion every instance of this bug made: asking "were there findings?" first makes an
    // empty list look identical whether ten thousand things were examined or none.
    expect(verdict(0, [], 'nothing indexed').kind).toBe('nothing-to-check');
    expect(verdict(1, [], 'nothing indexed').kind).toBe('clean');
  });

  it('a negative denominator is treated as nothing, not as a pass', () => {
    // Defensive: a count derived from a bad query or a failed read can arrive as -1, and that must
    // never be the branch that prints a tick.
    expect(verdict(-1, [], 'count unavailable').kind).toBe('nothing-to-check');
  });

  describe('renderVerdict', () => {
    const describeIt = {
      nothing: (why: string) => `nothing was checked — ${why}`,
      clean: (n: number) => `clean — ${n} checked`,
      findings: (f: readonly string[], n: number) => `${f.length} of ${n} flagged`,
    };

    it('an empty tree never renders as a tick', () => {
      const line = renderVerdict(verdict(0, [] as string[], 'no docs/ directory'), describeIt);
      expect(line).toBe('nothing was checked — no docs/ directory');
      expect(line).not.toMatch(/clean/);
    });

    it('a real pass renders WITH its count, so the reader can see the denominator', () => {
      expect(renderVerdict(verdict(177, [] as string[], 'x'), describeIt)).toBe('clean — 177 checked');
    });

    it('findings render against the denominator', () => {
      expect(renderVerdict(verdict(20, ['a'], 'x'), describeIt)).toBe('1 of 20 flagged');
    });
  });

  describe('the JSON shape a machine reads', () => {
    it('carries checked: 0 rather than omitting the denominator', () => {
      // An agent reading `{clean: true}` with no denominator cannot tell a real pass from an absent
      // one, and acts on it silently. `conducks_status` shipped exactly that shape.
      expect(verdictToJson(verdict(0, [] as string[], 'no vault'))).toEqual({
        status: 'nothing-to-check', checked: 0, found: [], why: 'no vault',
      });
    });

    it('a clean answer states what it examined', () => {
      expect(verdictToJson(verdict(900, [] as string[], 'x'))).toEqual({
        status: 'clean', checked: 900, found: [],
      });
    });
  });

  describe('accessors', () => {
    it('examinedOf is zero EXACTLY when nothing was checked', () => {
      expect(examinedOf(verdict(0, [] as string[], 'x'))).toBe(0);
      expect(examinedOf(verdict(7, [] as string[], 'x'))).toBe(7);
      expect(examinedOf(verdict(7, ['a'], 'x'))).toBe(7);
    });

    it('findingsOf reads the list without the caller re-switching', () => {
      expect(findingsOf(verdict(0, [] as string[], 'x'))).toEqual([]);
      expect(findingsOf(verdict(7, ['a', 'b'], 'x'))).toEqual(['a', 'b']);
    });
  });

  it('every variant is REACHABLE — a switch with no default cannot silently skip one', () => {
    // The guarantee this type exists to provide: a renderer must handle all three. If a fourth
    // variant is added, `renderVerdict`'s switch stops compiling rather than falling through to
    // whichever branch was written last — which is how the MCP status payload came to drop the
    // verdict entirely while the value below it was computed correctly.
    const seen = new Set<string>();
    const cases: Array<Verdict<string>> = [
      verdict(0, [], 'nothing'),
      verdict(5, [], "unused"),
      verdict(5, ["x"], "unused"),
    ].map(v => v as Verdict<string>);
    for (const v of cases) seen.add(renderVerdict(v, { nothing: () => 'N', clean: () => 'C', findings: () => 'F' }));
    expect(seen).toEqual(new Set(['N', 'C', 'F']));
  });
});
