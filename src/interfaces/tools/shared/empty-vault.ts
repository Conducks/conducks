import { registry } from "@/registry/index.js";
import { verdict, verdictToJson } from "@/contracts/verdict.js";

/**
 * Conducks — the answer a report tool owes when the vault holds nothing 🫙
 *
 * ADR 0124 in one helper. Driven against a genuinely empty vault (analyzed, then `conducks clean`),
 * four tools reported a clean result over nothing: `audit` answered `{success: true, violations: [],
 * totalViolations: 0}` — an architecture pass for a repo with no symbols — `prune` answered "no dead
 * code" for a repo with no code, and `query` and `flows` answered with empty lists that read as
 * misses rather than as "there was nothing to miss".
 *
 * The CLI has said this properly since todo49 (`Status: EMPTY`, `Staleness: n/a — nothing analyzed`).
 * These are the tools nobody had driven with an empty vault.
 *
 * The count comes from the VAULT, not the in-memory graph. `status()` reads `this.graph.stats`, and
 * `conducks_query`'s filter and template modes deliberately do NOT load the graph — they compile to
 * SQL and read through persistence, so the graph is legitimately empty there. A first version of this
 * helper used `status()` and reported "the vault holds no symbols" for a filter query against this
 * repo's own 6,144-node vault. The existing suite caught it, and the live probe confirmed it.
 *
 * Returns the `nothing-to-check` payload when the vault is empty, or `null` to carry on — so a caller
 * reads as `const empty = await emptyVaultAnswer(); if (empty) return mcpOk(empty);`.
 */
export async function emptyVaultAnswer(): Promise<Record<string, unknown> | null> {
  // This runs BEFORE `ensureAnchor`, deliberately — the whole point is to answer without doing the
  // work. But it queries the vault, so it must hold it: without the hold, a sibling call finishing
  // in the same moment closes the handle mid-query. Invisible while tool calls were serialised, a
  // live race the moment they overlap (todo52#P2).
  registry.infrastructure.acquireVault();
  let nodeCount = 0;
  try {
    nodeCount = (await registry.audit.statusFromVault())?.stats?.nodeCount ?? 0;
  } finally {
    await registry.infrastructure.releaseVault();
  }
  if (nodeCount > 0) return null;
  return verdictToJson(verdict(
    0,
    [],
    'the vault holds no symbols — nothing was examined, which is not the same as clean. Run `conducks analyze` first',
  ));
}
