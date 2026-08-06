import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Combined hash of the source files DIRECTLY in a directory — the identity a module note is
 * reviewed against (doc-reviews.json).
 *
 * ONE implementation, by acceptance (todo21): this used to exist twice — here-ish in `docs-board`
 * and again in `ProjectMonitor` — coupled only by a "must match" comment, which is a drift waiting
 * for its moment: the two disagreeing would mark every reviewed note drifted (or none), silently.
 * Both callers import THIS.
 *
 * Non-recursive on purpose: a note covers its module directory, and hashing subtrees would fire a
 * review flag for a change in a submodule that has its own note.
 */
export const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
  ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".php", ".rb", ".swift",
]);

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

export function moduleHashOf(dir: string): string {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter(f => SOURCE_EXTENSIONS.has(path.extname(f))).sort();
  } catch { return ""; }
  const parts = entries.map(f => {
    try { return sha(readFileSync(path.join(dir, f), "utf8")); } catch { return ""; }
  });
  return sha(parts.join("|"));
}
