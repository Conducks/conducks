import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registry } from '@/registry/index.js';
import { SynapsePersistence } from '@/lib/core/persistence/index.js';
import { enterToolCall, leaveToolCall, ensureAnchor, releaseAnchor } from '@/interfaces/tools/shared/anchor.js';

/**
 * A call whose `path` names a SUBDIRECTORY of the anchored project must not re-anchor outside the gate
 * (state-machine audit round 2, Q-10-3).
 *
 * The gate decides with `wouldReanchor`, which compares the DISCOVERED root (a subdirectory walks up
 * to its project). `ensureAnchor` re-decided with the RAW path against the chronicle — never equal for
 * a subdirectory — so every such call ran `registry.initialize` on its own, beside the other calls the
 * gate had let in, rebuilding the search and intelligence services under them.
 */
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-anchor-sub-')));
const savedRoot = process.env.CONDUCKS_WORKSPACE_ROOT;
afterAll(() => {
  if (savedRoot === undefined) delete process.env.CONDUCKS_WORKSPACE_ROOT; else process.env.CONDUCKS_WORKSPACE_ROOT = savedRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a tool call on a subdirectory of the anchored project', () => {
  it('is answered from the anchored root without a second initialize', async () => {
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, 'src'));
    const seed = new SynapsePersistence(root, false);
    await seed.run(`INSERT INTO pulses (id, timestamp, nodeCount, edgeCount) VALUES ('p1', 1, 0, 0)`);
    await seed.close();
    process.env.CONDUCKS_WORKSPACE_ROOT = root;

    await registry.initialize(true, root);
    const sub = path.join(root, 'src');
    expect(registry.infrastructure.wouldReanchor(true, sub)).toBe(false);   // the gate's view

    const original = registry.initialize;
    let inits = 0;
    (registry as any).initialize = async (...a: any[]) => { inits++; return (original as any)(...a); };
    try {
      await enterToolCall(sub);
      try { await ensureAnchor(sub, true, false); } finally { await releaseAnchor(); leaveToolCall(); }
    } finally {
      (registry as any).initialize = original;
    }
    expect(inits).toBe(0);
  }, 60000);
});
