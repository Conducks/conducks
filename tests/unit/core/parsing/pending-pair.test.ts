import { describe, it, expect } from '@jest/globals';
import { PendingPair } from '@/lib/core/parsing/reflector.js';

/**
 * The pair-holder behind four semantic captures — and it is here because BOTH halves of its stated
 * invariant survived mutation against the whole suite.
 *
 * `iface_name`/`iface_body`, `object_name`/`object_value`, `instance_name`/`instance_type` and
 * `instance_call_name`/`instance_call_target` all arrive as a name then a value, and each used to
 * carry its own `let pending… = null` and its own `if (pending) { record; pending = null; }` — one
 * rule written four times (ADR 0150 rule 9). Folding them into one holder put the invariant in one
 * place, and then 2,296 tests failed to score either half of it: making `fire` skip the clear, and
 * making `arm` refuse to replace, both left the suite entirely green.
 *
 * That is the failure worth naming. Every case below is a MISATTRIBUTION — a value recorded against
 * the wrong name — not a missing record. A missing instance type leaves an edge dangling and is
 * visible; a value bound to the previous name produces a confident, wrong edge that reads exactly
 * like a right one in `impact`, `trace` and `prune`. Nothing downstream can tell them apart, which
 * is why the holder is tested from inside rather than only through the packs.
 */
describe('PendingPair — a name held until its value arrives', () => {
  it('records the value against the name that was armed', () => {
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.arm('account');
    pair.fire(key => seen.push(key));

    expect(seen).toEqual(['account']);
  });

  it('CLEARS on fire, so a second value is not attributed to the first name', () => {
    // The mutation that survived the whole suite: `if (this.key) { record(this.key); }` with no
    // clear. The first value is recorded correctly, so every existing case still passes — and the
    // NEXT value in the file is silently recorded against the previous name too.
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.arm('account');
    pair.fire(key => seen.push(key));
    pair.fire(key => seen.push(key));      // a value with no name of its own

    expect(seen).toEqual(['account']);
  });

  it('clears even when the value records NOTHING', () => {
    // `fire` clears unconditionally, not only when the callback did something. Three of the four
    // call sites record only when the extracted object is non-empty — an interface with no typed
    // members, an object literal with no aliased paths. Clearing on success alone would leave that
    // name armed, and the next body in the file would be recorded under it.
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.arm('emptyiface');
    pair.fire(() => { /* the members turned out to be empty — nothing recorded */ });
    pair.fire(key => seen.push(key));

    expect(seen).toEqual([]);
  });

  it('REPLACES on arm, so the newer name wins when a value never came', () => {
    // The second surviving mutation: `if (!this.key) this.key = key`. A name whose value capture
    // never matched stays armed, and the next name is dropped in favour of the stale one — so the
    // next value is recorded against a variable declared earlier in the file.
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.arm('first');
    pair.arm('second');                     // `first` never got a value
    pair.fire(key => seen.push(key));

    expect(seen).toEqual(['second']);
  });

  it('records nothing when a value arrives with no name armed', () => {
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.fire(key => seen.push(key));

    expect(seen).toEqual([]);
  });

  it('accepts null as "nothing armed", which is what an unresolvable scope key produces', () => {
    // Three of the four call sites arm with `scopedVarKey(...)`, which can answer null. Treating
    // null as an armed name would record the next value under a key of `"null"`.
    const pair = new PendingPair();
    const seen: string[] = [];

    pair.arm(null);
    pair.fire(key => seen.push(key));

    expect(seen).toEqual([]);
  });
});
