import fs from "node:fs";

/**
 * Conducks — the on-disk spelling of a stored path. ONE rule, both surfaces. 🏺
 *
 * Node ids and the `file` column are lowercased on write (CONDUCKS-4, for APFS), so every path this
 * tool reports is a correct KEY and a broken PATH: `renderer/src/lib/useworkgraph.ts` for a file
 * called `useWorkGraph.ts`. It opens on a case-insensitive filesystem by luck and on Linux CI not at
 * all.
 *
 * This lives in `contracts` for the same reason `tryResolveSymbol` does (ADR 0005): it is needed by
 * `interfaces/cli` AND by `interfaces/tools`, and those two may not import each other — the
 * architecture test refuses `mcp -> cli`, which is how the right home was found. It was repaired on
 * the CLI side alone first, and that is exactly the drift the mirror rule forbids: MEASURED against
 * a live MCP server, `conducks_prune` returned
 * `renderer/src/components/sessionhistorypanel.tsx` while the CLI returned
 * `renderer/src/components/SessionHistoryPanel.tsx` for the same finding. Same input, two answers —
 * and the MCP surface is the one an agent reads.
 *
 * `realpathSync.native` is what recovers the spelling: on a case-insensitive filesystem the
 * lowercased path resolves and the OS answers with the true case. On a case-sensitive one it does
 * not resolve, and the input is returned unchanged — an unrepaired path is a smaller problem than a
 * command that throws while formatting its output.
 */

/** One syscall per distinct path per process. `prune` alone asks about the same files repeatedly. */
const cache = new Map<string, string>();

export function realCasePath(storedPath: string): string {
  if (!storedPath) return storedPath;
  // A SYNTHESISED LOCATION IS NOT A PATH. `external://global/fetch` names a boundary, and the path
  // APIs normalise its double slash away — which printed `external:/global/fetch`, an id nobody can
  // paste, from the helper whose purpose is pasteable ids.
  if (storedPath.includes('://')) return storedPath;

  const hit = cache.get(storedPath);
  if (hit !== undefined) return hit;

  let real = storedPath;
  try { real = fs.realpathSync.native(storedPath); } catch { /* gone, or a case-sensitive filesystem */ }
  cache.set(storedPath, real);
  return real;
}
