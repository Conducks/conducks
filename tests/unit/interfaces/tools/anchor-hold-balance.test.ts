import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registry } from '@/registry/index.js';
import { ensureAnchor, releaseAnchor } from '@/interfaces/tools/shared/anchor.js';

/**
 * A refused call must give back exactly the hold it took (state-machine audit P-10-2).
 *
 * `ensureAnchor` took its vault hold at the END, after the path guard — but every handler releases in
 * `finally` whether `ensureAnchor` returned or threw. A refused `path` therefore released a hold it
 * never took: the count drifted down by one per refusal, and once it reached zero the vault was
 * closed under calls still reading it ("Database was already closed").
 */
describe('vault holds stay balanced when a call is refused', () => {
  it("a refused path leaves another call's hold in place", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-not-a-project-'));
    try {
      registry.infrastructure.acquireVault();          // another call, still reading
      const before = registry.infrastructure.vaultHolders;

      try { await ensureAnchor(outside); } catch { /* refused, as it should be */ } finally { await releaseAnchor(); }

      expect(registry.infrastructure.vaultHolders).toBe(before);
      await registry.infrastructure.releaseVault();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
