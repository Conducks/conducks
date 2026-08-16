import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chronicle, anchorChronicle, ChronicleInterface } from '@/lib/core/git/index.js';

/**
 * The shared `chronicle` cannot be re-anchored through the reference (ADR 0150 rule 4, todo70).
 *
 * `chronicle` is one instance held by two dozen files. While `setProjectDir` was reachable on it,
 * any of them could point the whole process at another directory mid-run, and nothing would say so
 * — every later answer would just be about a different tree. Moving the anchor is now the named
 * `anchorChronicle(root)`, used at boot and at a CLI target and nowhere else.
 *
 * The guarantee is a TYPE (`ReadOnlyChronicle` = the class minus its one mutator), so the real gate
 * is `tsc`: the `@ts-expect-error` below fails the build if the mutator ever comes back onto the
 * shared reference. The runtime cases pin what the type is protecting — that the anchor is one
 * process-wide value, and that a caller wanting its own can construct one.
 */
const mkDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-anchor-'));

describe('the process anchor', () => {
  it('does not expose setProjectDir on the shared reference — to the COMPILER', () => {
    // @ts-expect-error — `ReadOnlyChronicle` omits it. Deleting this line must break the typecheck.
    const reachable = chronicle.setProjectDir;

    // And at runtime it is still there, because the instance is a plain `ChronicleInterface`. Said
    // out loud rather than hidden: this stops a caller from WRITING the re-anchor, not from doing
    // it through a cast. That is the whole claim, and it is the case that actually happened.
    expect(typeof reachable).toBe('function');
  });

  it('moves for everyone when anchorChronicle is called, which is why it is named', () => {
    const before = chronicle.getProjectDir();
    const dir = fs.realpathSync(mkDir());
    try {
      anchorChronicle(dir);
      expect(chronicle.getProjectDir()).toBe(dir);
    } finally {
      anchorChronicle(before);                     // a shared anchor left moved breaks later suites
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the anchor alone when a caller constructs its own', () => {
    // The escape hatch that makes the restriction affordable: anything needing a different root
    // asks for an instance instead of moving everyone else's.
    const before = chronicle.getProjectDir();
    const dir = fs.realpathSync(mkDir());
    try {
      const own = new ChronicleInterface(dir);
      expect(own.getProjectDir()).toBe(dir);
      expect(chronicle.getProjectDir()).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
