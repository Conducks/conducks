import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — Unit Docs Discovery
 *
 * A monorepo keeps a `docs/` inside each deployable unit, and the docs tools resolve exactly ONE
 * `docs/` — the one under the path they were given. Nothing walks below it.
 *
 * So `conducks docs-lint` at a monorepo root reports "clean" while every unit's docs go unopened.
 * Measured on a real repo: 43 governed docs clean at root, 45 files across four unit folders never
 * read. "Clean" meant "clean at root".
 *
 * This finds those folders so a command can SAY they exist. It deliberately does not lint them —
 * scanning them silently would change what a root run means, and a root run that quietly linted four
 * other trees is its own surprise. Name them, give the exact command, let the caller choose.
 */

/** Directories that never hold a project's own docs. */
const SKIP = new Set([
  "node_modules", ".git", "build", "dist", ".next", "out", "target", "vendor",
  ".venv", "venv", "__pycache__", ".conducks", "coverage", ".turbo", ".cache",
]);

export interface UnitDocs {
  /** Path to the unit itself, relative to the scanned root — what you pass to the command. */
  unit: string;
  /** Markdown files directly discoverable under that unit's `docs/`. */
  files: number;
}

/**
 * Every `<unit>/docs/` below `root`, excluding `root/docs` itself.
 *
 * Depth-limited: a `docs/` folder more than a few levels down is documentation belonging to something
 * else (a vendored dependency, a fixture), not a deployable unit of this repo.
 */
export function findUnitDocs(root: string, maxDepth = 3): UnitDocs[] {
  const found: UnitDocs[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);

      if (entry.name === "docs") {
        // The root's own docs/ is what the caller already scanned.
        if (path.resolve(full) === path.resolve(root, "docs")) continue;
        const count = countMarkdown(full);
        if (count > 0) found.push({ unit: path.relative(root, dir) || ".", files: count });
        continue;                       // never descend into a docs tree
      }
      walk(full, depth + 1);
    }
  };

  walk(root, 0);
  return found.sort((a, b) => a.unit.localeCompare(b.unit));
}

function countMarkdown(dir: string, depth = 0): number {
  if (depth > 4) return 0;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  let n = 0;
  for (const entry of entries) {
    // Archived material is not governed, so it should not inflate the "unscanned" figure.
    if (entry.isDirectory()) {
      if (/^(completed|legacy|archive|agent-runs)$/.test(entry.name)) continue;
      n += countMarkdown(path.join(dir, entry.name), depth + 1);
    } else if (entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
      n++;
    }
  }
  return n;
}

/** One docs tree to read: the repository root, or a unit inside it. */
export interface DocsTree {
  /** `(root)` for the top tree, otherwise the unit path relative to the root — `app`, `packages/core`. */
  label: string;
  /** Absolute path to pass to `buildBoard` — the folder CONTAINING `docs/`, not `docs/` itself. */
  path: string;
  /** True for the repository root. */
  isRoot: boolean;
}

/**
 * Every docs tree under `root`, root first.
 *
 * The ONE resolver behind the CLI and the MCP tool, so all three surfaces agree on what "this
 * project's docs" means. A single-repo project returns exactly one tree and behaves as it always did;
 * a monorepo returns the root plus each unit, and nothing has to know which case it is in.
 */
export function resolveDocsTrees(root: string): DocsTree[] {
  const abs = path.resolve(root);
  return [
    { label: "(root)", path: abs, isRoot: true },
    ...findUnitDocs(abs).map(u => ({ label: u.unit, path: path.join(abs, u.unit), isRoot: false })),
  ];
}

/** The reminder line(s) a docs command prints when unit docs exist beside the tree it scanned. */
export function unitDocsNotice(root: string): string[] {
  const units = findUnitDocs(root);
  if (units.length === 0) return [];

  const total = units.reduce((n, u) => n + u.files, 0);
  const lines = [
    `${units.length} unit docs/ folder(s) hold ${total} more governed file(s) — NOT scanned by this run:`,
  ];
  for (const u of units.slice(0, 6)) lines.push(`    conducks docs-lint ${u.unit}${" ".repeat(Math.max(1, 24 - u.unit.length))}(${u.files} files)`);
  if (units.length > 6) lines.push(`    … and ${units.length - 6} more`);
  return lines;
}
