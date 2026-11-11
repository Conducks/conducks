import fs from "node:fs";

/**
 * Conducks — the on-disk spelling of a stored path. ONE rule, both surfaces. 🏺
 *
 * Node ids and the `file` column are lowercased on write (see docs/visuals/modules/contracts.md, for APFS), so every path this
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
  try { real = fs.realpathSync.native(storedPath); }
  catch { real = walkCaseInsensitive(storedPath) ?? storedPath; /* gone, or a case-sensitive filesystem */ }
  cache.set(storedPath, real);
  return real;
}

/** Directory listings, read once per process: one `prune` asks about the same folders thousands of times. */
const listings = new Map<string, string[] | null>();

/**
 * The CASE-SENSITIVE half, which the native call cannot do: there the lower-cased path names nothing,
 * so each segment is matched against its directory's entries instead. An exact match is kept; a
 * lower-cased segment takes the ONE entry equal to it ignoring case. Two entries differing only in
 * case, or none, mean the path cannot be recovered, and the caller keeps the stored spelling.
 * MEASURED: on Linux, `prune` printed `src/useworkgraph.ts` for `src/useWorkGraph.ts`, and `impact`
 * printed "file unreadable" in place of every call-site line — three suites red that macOS passes.
 */
function walkCaseInsensitive(storedPath: string): string | null {
  if (!storedPath.startsWith('/')) return null;
  let current = '/';
  for (const segment of storedPath.split('/').filter(Boolean)) {
    let entries = listings.get(current);
    if (entries === undefined) {
      try { entries = fs.readdirSync(current); } catch { entries = null; }
      listings.set(current, entries);
    }
    if (!entries) return null;
    let next = entries.includes(segment) ? segment : null;
    if (!next) {
      const lower = segment.toLowerCase();
      const matches = entries.filter(e => e.toLowerCase() === lower);
      if (matches.length !== 1) return null;
      next = matches[0];
    }
    current = current === '/' ? `/${next}` : `${current}/${next}`;
  }
  return current;
}
