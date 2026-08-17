/**
 * todo52 Phase 1 + 2 — how often does `registry.initialize` actually SWAP the persistence object?
 *
 * The answer measured here is: on EVERY tool call, and we cause it ourselves.
 *
 * `releaseAnchor()` closes the vault when the last in-flight call finishes, deliberately, so a user
 * can run CLI commands against the same DuckDB file. The bootstrapper's guard is
 *
 *     if (isCurrentlyConnected && !rootChanged && !modeChanged) return;
 *
 * so the NEXT call finds `isCurrentlyConnected === false`, falls through, and constructs a fresh
 * `SynapsePersistence` — `updatePersistence(newPersistence)`. Nothing about the root or the mode
 * changed. The close we performed is the entire reason for the swap.
 *
 * That matters because the swap is exactly the hazard ADR 0146 serialised every tool call to avoid:
 * "no ref-count makes an object swap atomic". So the queue was paying ~8x (274 ms concurrent against
 * 2,135 ms serialised, ADR 0128's own probe) to defend against a race that our own close was creating
 * on every single call, in the steady state, with a stable anchor.
 *
 * `anchor.ts` already states the correct policy in a comment — "Disconnection is NOT a re-init
 * trigger — the lazy connection reopens on next query" — and `ensureAnchor` follows it. The
 * bootstrapper did not, and the two disagreed. `SynapsePersistence.query()` calls `ensureVaultOpen()`,
 * so a closed-but-same-root handle genuinely does reopen itself; the object never needed replacing.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RegistryBootstrapper } from "@/lib/core/bootstrap/index.js";

const ROOT = process.cwd();

/** The graph surface the bootstrapper touches — deferred-load markers included (todo21#P5). */
const fakeGraph = () => {
  const inner = {
    clear: jest.fn(),
    markDeferred: jest.fn(),
    markMaterialised: jest.fn(),
    stats: { nodeCount: 0 },
  };
  return { getGraph: () => inner, stats: { nodeCount: 0 } };
};

/** A persistence stand-in that records close/open the way the real one behaves. */
const fakePersistence = (readOnly: boolean) => {
  let connected = true;
  return {
    readOnly,
    // The real handle exposes where it points; the bootstrapper asks IT, not the chronicle.
    anchoredAt: ROOT,
    isConnected: () => connected,
    close: jest.fn(async () => { connected = false; }),
    // The real object reopens lazily inside `query()` via `ensureVaultOpen()`.
    query: jest.fn(async () => { connected = true; return []; }),
    load: jest.fn(async () => {}),
    setReadOnly: jest.fn(),
  };
};

const runInitialize = async (bootstrapper: RegistryBootstrapper, persistence: any, updatePersistence: jest.Mock) => {
  await bootstrapper.initialize(
    { readOnly: true, root: ROOT, lazy: true },
    {
      graph: fakeGraph() as any,
      persistence: persistence as any,
      ignoreManager: { load: jest.fn() } as any,
      federation: {} as any,
      updatePersistence: updatePersistence as any,
      updateIgnoreManager: jest.fn() as any,
    },
  );
};

describe('the persistence handle is not swapped just because it was closed — todo52', () => {
  let bootstrapper: RegistryBootstrapper;
  let updatePersistence: jest.Mock;

  beforeEach(() => {
    bootstrapper = new RegistryBootstrapper();
    updatePersistence = jest.fn();
  });

  it('does not construct a new handle on a second call with the same root and mode', async () => {
    const persistence = fakePersistence(true);

    await runInitialize(bootstrapper, persistence, updatePersistence);
    const swapsAfterFirst = updatePersistence.mock.calls.length;

    // What `releaseAnchor()` does at the end of every tool call.
    await persistence.close();

    await runInitialize(bootstrapper, persistence, updatePersistence);

    // The second call must reuse the handle. Before the fix this was `swapsAfterFirst + 1` — a swap
    // per tool call, in the steady state, with nothing changed but our own close.
    expect(updatePersistence.mock.calls.length).toBe(swapsAfterFirst);
  });

  it('still swaps when the MODE changes, which a ref-count cannot make atomic', async () => {
    const persistence = fakePersistence(true);
    await runInitialize(bootstrapper, persistence, updatePersistence);
    const before = updatePersistence.mock.calls.length;

    // A read-write anchor over a read-only handle is a genuine reason to replace it.
    await bootstrapper.initialize(
      { readOnly: false, root: ROOT, lazy: true },
      {
        graph: fakeGraph() as any,
        persistence: persistence as any,
        ignoreManager: { load: jest.fn() } as any,
        federation: {} as any,
        updatePersistence: updatePersistence as any,
        updateIgnoreManager: jest.fn() as any,
      },
    );

    expect(updatePersistence.mock.calls.length).toBeGreaterThan(before);
  });
});
