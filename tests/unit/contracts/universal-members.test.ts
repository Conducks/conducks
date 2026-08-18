import { describe, it, expect } from '@jest/globals';
import { isUniversalMemberCall } from '@/contracts/index.js';

/**
 * The universal-member sweep decides which dangling call edges are built-ins and may be deleted.
 * That vocabulary is per-LANGUAGE, and treating it as global is how four live Python functions were
 * reported as dead code.
 *
 * `apply` is `Function.prototype.apply` in JavaScript — no project declares it. In Python it is an
 * ordinary module-level function name; the scraper subject declares four of them
 * (`stealth/{consistency,fingerprint,hardware_emulation,navigator_patch}.py`) and calls each twice
 * from `browser/engine.py`. Sweeping the JS list over those `.py` call sites deleted all eight edges,
 * and `prune` then issued a delete verdict on the working anti-detection layer.
 *
 * The argument is the file the CALL is written in, because the question is which language's built-in
 * vocabulary the expression belongs to.
 */
describe('isUniversalMemberCall is scoped to the call site language', () => {
  it('treats `.apply` as a built-in in JavaScript/TypeScript', () => {
    expect(isUniversalMemberCall('fn.apply', 'src/a.ts')).toBe(true);
    expect(isUniversalMemberCall('fn.apply', 'src/a.tsx')).toBe(true);
    expect(isUniversalMemberCall('fn.apply', 'src/a.js')).toBe(true);
  });

  it('does NOT treat `.apply` as a built-in in Python', () => {
    expect(isUniversalMemberCall('mod.apply', 'src/stealth/consistency.py')).toBe(false);
    expect(isUniversalMemberCall('mod.apply', 'src/stubs/consistency.pyi')).toBe(false);
  });

  it('still sweeps genuine Python built-in members', () => {
    // The counter-case. A fix that simply exempted every `.py` call would pass the test above and
    // leave `text.strip()` and `items.append(x)` in the graph as unresolved references forever.
    expect(isUniversalMemberCall('text.strip', 'src/a.py')).toBe(true);
    expect(isUniversalMemberCall('items.append', 'src/a.py')).toBe(true);
    expect(isUniversalMemberCall('cfg.items', 'src/a.py')).toBe(true);
    expect(isUniversalMemberCall('name.startswith', 'src/a.py')).toBe(true);
  });

  it('leaves names a Python project plausibly declares alone', () => {
    // Same conservatism the JavaScript list is documented to follow: a name a project might own is
    // left as a visible dangler rather than deleted on a guess.
    for (const member of ['get', 'add', 'update', 'remove', 'run', 'read', 'write', 'index', 'sort']) {
      expect(isUniversalMemberCall(`obj.${member}`, 'src/a.py')).toBe(false);
    }
  });

  it('keeps the historical ECMAScript behaviour when no file is given', () => {
    expect(isUniversalMemberCall('arr.map')).toBe(true);
    expect(isUniversalMemberCall('fn.apply')).toBe(true);
    expect(isUniversalMemberCall('repo.findUser')).toBe(false);
  });

  it('is not fooled by a receiver that itself contains dots', () => {
    expect(isUniversalMemberCall('a.b.c.trim', 'src/a.ts')).toBe(true);
    expect(isUniversalMemberCall('a.b.c.apply', 'src/a.py')).toBe(false);
    expect(isUniversalMemberCall('noDotHere', 'src/a.py')).toBe(false);
  });
});
