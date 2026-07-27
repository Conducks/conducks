import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — Service Docs Discovery
 *
 * A monorepo keeps a `docs/` inside each service, and the docs tools resolve exactly ONE `docs/` —
 * the one under the path they were given. Nothing walks below it.
 *
 * So `conducks docs-lint` at a monorepo root reported "clean" while every service's docs went
 * unopened. Measured on a real repo: 43 governed docs clean at root, 45 files across four service
 * folders never read. "Clean" meant "clean at root".
 *
 * A SERVICE is a part with its own owner — `app`, `admin`, `database`, `packages/core`. The test is
 * ownership, not whether it boots: `database` never runs, but when a schema fact is wrong, `database`
 * is what changes. Ownership is a human judgement, so it is declared in `conducks.json` where the
 * repo has an opinion, and only guessed at when it does not.
 */

/** Directories that never hold a project's own docs. */
const SKIP = new Set([
  "node_modules", ".git", "build", "dist", ".next", "out", "target", "vendor",
  ".venv", "venv", "__pycache__", ".conducks", "coverage", ".turbo", ".cache",
]);

export interface ServiceDocs {
  /** Path to the service itself, relative to the scanned root — what you pass to the command. */
  service: string;
  /** Markdown files directly discoverable under that service's `docs/`. */
  files: number;
}

/**
 * Services declared in `conducks.json` at the repo root: `{ "services": ["app", "packages/core"] }`.
 *
 * Discovery can only ask "does this folder contain a `docs/`?", which cannot tell a real service from
 * a folder that happens to hold documentation — and it silently misses a service whose docs have not
 * been written yet, which is exactly when the reminder to write them matters most. A declaration
 * settles both. Returns null when the repo declares nothing, so discovery stays the default.
 */
function declaredServices(root: string): string[] | null {
  let raw: string;
  try { raw = fs.readFileSync(path.join(root, "conducks.json"), "utf8"); } catch { return null; }
  try {
    const parsed = JSON.parse(raw);
    const list = parsed?.services;
    if (!Array.isArray(list) || !list.every((s: unknown) => typeof s === "string")) return null;
    // A declared service that is not on disk is a stale config, not a tree — skip it rather than
    // failing every docs command with an error about a folder the user already deleted.
    return list.filter((s: string) => fs.existsSync(path.join(root, s)));
  } catch {
    // A malformed conducks.json must not take the docs tooling down with it.
    return null;
  }
}

/**
 * Every `<service>/docs/` below `root`, excluding `root/docs` itself.
 *
 * Uses the declaration in `conducks.json` when there is one. Otherwise falls back to discovery:
 * depth-limited, because a `docs/` folder more than a few levels down is documentation belonging to
 * something else (a vendored dependency, a fixture), not a service of this repo.
 */
export function findServiceDocs(root: string, maxDepth = 3): ServiceDocs[] {
  const declared = declaredServices(root);
  if (declared) {
    return declared
      .map(service => ({ service, files: countMarkdown(path.join(root, service, "docs")) }))
      .sort((a, b) => a.service.localeCompare(b.service));
  }

  const found: ServiceDocs[] = [];

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
        if (count > 0) found.push({ service: path.relative(root, dir) || ".", files: count });
        continue;                       // never descend into a docs tree
      }
      walk(full, depth + 1);
    }
  };

  walk(root, 0);
  return found.sort((a, b) => a.service.localeCompare(b.service));
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

/** One docs tree to read: the repository root, or a service inside it. */
export interface DocsTree {
  /** `(root)` for the top tree, otherwise the service path relative to the root — `app`, `packages/core`. */
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
 * a monorepo returns the root plus each service, and nothing has to know which case it is in.
 */
export function resolveDocsTrees(root: string): DocsTree[] {
  const abs = path.resolve(root);
  return [
    { label: "(root)", path: abs, isRoot: true },
    ...findServiceDocs(abs).map(s => ({ label: s.service, path: path.join(abs, s.service), isRoot: false })),
  ];
}

/** The reminder line(s) a docs command prints when service docs exist beside the tree it scanned. */
export function serviceDocsNotice(root: string): string[] {
  const services = findServiceDocs(root);
  if (services.length === 0) return [];

  const total = services.reduce((n, s) => n + s.files, 0);
  const lines = [
    `${services.length} service docs/ folder(s) hold ${total} more governed file(s) — NOT scanned by this run:`,
  ];
  for (const s of services.slice(0, 6)) lines.push(`    conducks docs-lint ${s.service}${" ".repeat(Math.max(1, 24 - s.service.length))}(${s.files} files)`);
  if (services.length > 6) lines.push(`    … and ${services.length - 6} more`);
  return lines;
}
