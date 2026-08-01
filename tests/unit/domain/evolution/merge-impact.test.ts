import { describe, it, expect } from '@jest/globals';
import { mergeImpact, type CallerLookup } from '@/lib/domain/evolution/merge-impact.js';
import type { LayerNode } from '@/lib/domain/evolution/layer-diff.js';

/**
 * Three-way semantic merge impact (ADR 0035, todo20#P4) — the question git cannot answer.
 *
 * Git merges TEXT, and it is right about the text every time. What it cannot see is that one branch
 * changed a function's shape while the other changed something that CALLS it: both hunks are in
 * different files, both apply, the merge is clean, and the result is broken. That collision is a
 * graph fact, and it is the reason a structural graph is worth keeping per ref.
 */
const n = (id: string, fingerprint: string | null): LayerNode =>
  ({ id, fingerprint, name: id.split('::').pop(), file: id.split('::')[0] });

/** `calls[caller] = [callee]` inverted into "who calls this". */
const callersFrom = (calls: Record<string, string[]>): CallerLookup => {
  const inverted = new Map<string, string[]>();
  for (const [caller, callees] of Object.entries(calls))
    for (const callee of callees) inverted.set(callee, [...(inverted.get(callee) ?? []), caller]);
  return (id: string) => inverted.get(id) ?? [];
};

const noCallers: CallerLookup = () => [];

describe('three-way merge impact', () => {
  const base = [n('api.ts::send', 'v1'), n('ui.ts::button', 'b1'), n('util.ts::fmt', 'f1')];

  it('reports nothing when neither side changed anything', () => {
    const r = mergeImpact(base, base, base, noCallers);
    expect(r.collisions).toEqual([]);
    expect(r.cleanChanges).toBe(0);
  });

  it('counts a one-sided change with no dependants as clean', () => {
    const mine = [n('api.ts::send', 'v2'), n('ui.ts::button', 'b1'), n('util.ts::fmt', 'f1')];
    const r = mergeImpact(base, mine, base, noCallers);
    expect(r.collisions).toEqual([]);
    expect(r.cleanChanges).toBe(1);
  });

  it('reports both sides changing the same symbol', () => {
    const mine = [n('api.ts::send', 'v2'), ...base.slice(1)];
    const theirs = [n('api.ts::send', 'v3'), ...base.slice(1)];
    const r = mergeImpact(base, mine, theirs, noCallers);
    expect(r.collisions).toEqual([{ id: 'api.ts::send', kind: 'both-changed', side: 'both' }]);
  });

  /**
   * THE FINDING THIS EXISTS FOR. I change `send`'s shape; they change `button`, which calls it.
   * Different files, no textual overlap — git merges this cleanly and says nothing.
   */
  it('catches a change under a caller the OTHER side edited — the collision git cannot see', () => {
    const mine = [n('api.ts::send', 'v2'), n('ui.ts::button', 'b1'), n('util.ts::fmt', 'f1')];
    const theirs = [n('api.ts::send', 'v1'), n('ui.ts::button', 'b2'), n('util.ts::fmt', 'f1')];
    const calls = callersFrom({ 'ui.ts::button': ['api.ts::send'] });

    const r = mergeImpact(base, mine, theirs, calls);
    expect(r.collisions).toEqual([{
      id: 'api.ts::send', kind: 'changed-under-caller', side: 'mine', callers: ['ui.ts::button'],
    }]);
  });

  /** Symmetric: the same collision when the sides are swapped, reported against the other side. */
  it('is symmetric — the side reported is whoever changed the SYMBOL', () => {
    const mine = [n('api.ts::send', 'v1'), n('ui.ts::button', 'b2'), n('util.ts::fmt', 'f1')];
    const theirs = [n('api.ts::send', 'v2'), n('ui.ts::button', 'b1'), n('util.ts::fmt', 'f1')];
    const r = mergeImpact(base, mine, theirs, callersFrom({ 'ui.ts::button': ['api.ts::send'] }));
    expect(r.collisions).toMatchObject([{ id: 'api.ts::send', side: 'theirs' }]);
  });

  /** A caller the other side did NOT touch is not a collision — only both-moving is. */
  it('does not flag a change whose caller nobody else edited', () => {
    const mine = [n('api.ts::send', 'v2'), ...base.slice(1)];
    const r = mergeImpact(base, mine, base, callersFrom({ 'ui.ts::button': ['api.ts::send'] }));
    expect(r.collisions).toEqual([]);
    expect(r.cleanChanges).toBe(1);
  });

  it('catches a removal under a caller the other side edited', () => {
    const mine = [n('ui.ts::button', 'b1'), n('util.ts::fmt', 'f1')];            // send deleted
    const theirs = [n('api.ts::send', 'v1'), n('ui.ts::button', 'b2'), n('util.ts::fmt', 'f1')];
    const r = mergeImpact(base, mine, theirs, callersFrom({ 'ui.ts::button': ['api.ts::send'] }));
    expect(r.collisions).toEqual([{
      id: 'api.ts::send', kind: 'removed-under-caller', side: 'mine', callers: ['ui.ts::button'],
    }]);
  });

  /** A symbol reported as both-changed must not be reported a second time as a caller collision. */
  it('reports each symbol once, with the strongest classification', () => {
    const mine = [n('api.ts::send', 'v2'), n('ui.ts::button', 'b2'), n('util.ts::fmt', 'f1')];
    const theirs = [n('api.ts::send', 'v3'), n('ui.ts::button', 'b3'), n('util.ts::fmt', 'f1')];
    const r = mergeImpact(base, mine, theirs, callersFrom({ 'ui.ts::button': ['api.ts::send'] }));
    expect(r.collisions.filter(c => c.id === 'api.ts::send')).toHaveLength(1);
    expect(r.collisions.find(c => c.id === 'api.ts::send')!.kind).toBe('both-changed');
  });

  /**
   * Three-way, not two-way. Both branches making the SAME edit is a clean merge — comparing mine to
   * theirs directly cannot tell that from a disagreement, which is why both are compared to base.
   */
  it('does not flag an identical edit made on both sides', () => {
    const same = [n('api.ts::send', 'v2'), ...base.slice(1)];
    const r = mergeImpact(base, same, same, noCallers);
    expect(r.collisions).toEqual([]);
  });

  /**
   * A merge report that quietly counts unproven symbols as safe is the ADR 0044 failure in the most
   * expensive possible place.
   */
  it('surfaces uncomparable symbols instead of counting them as clean', () => {
    const withNull = [n('api.ts::send', null), ...base.slice(1)];
    const r = mergeImpact(withNull, withNull, withNull, noCallers);
    expect(r.incomparable).toBeGreaterThan(0);
    expect(r.collisions).toEqual([]);
  });

  it('handles a caller lookup that knows nothing', () => {
    const mine = [n('api.ts::send', 'v2'), ...base.slice(1)];
    const theirs = [n('api.ts::send', 'v1'), n('ui.ts::button', 'b2'), n('util.ts::fmt', 'f1')];
    expect(() => mergeImpact(base, mine, theirs, noCallers)).not.toThrow();
    expect(mergeImpact(base, mine, theirs, noCallers).collisions).toEqual([]);
  });
});
