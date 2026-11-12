import { describe, it, expect } from '@jest/globals';
import { AnalyzeContext } from "@/lib/core/parsing/index.js";

/**
 * A local name bound twice keeps only the SECOND binding's original (state-machine audit P-03-4).
 * `from lib_a import run as go` then `from lib_b import go`: the second registration updated the
 * source and left the first's original (`run`) in place, so `go()` resolved to `lib_b::run`.
 */
describe('rebinding a local name', () => {
  it('drops the previous original when the new binding has none', () => {
    const ctx = new AnalyzeContext();
    ctx.registerLocalBinding('go', '/p/lib_a.py', 'run');
    ctx.registerLocalBinding('go', '/p/lib_b.py', 'go');
    expect(ctx.resolveBindingOriginal('go')).toBeUndefined();
  });

  it('still records an original for a renamed import', () => {
    const ctx = new AnalyzeContext();
    ctx.registerLocalBinding('go', '/p/lib_a.py', 'run');
    expect(ctx.resolveBindingOriginal('go')).toBe('run');
  });
});
