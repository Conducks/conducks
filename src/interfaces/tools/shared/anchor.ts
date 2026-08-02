import { registry } from "@/registry/index.js";
import path from 'node:path';
import fs from 'node:fs';

/**
 * S1: path guard — what a caller may anchor a tool to.
 *
 * Two things must both hold, and the original rule delivered only the first:
 *
 *   - a tool must not be able to read arbitrary places on the filesystem
 *   - an agent must be able to work on the project it is actually working on
 *
 * The rule was "inside `process.cwd()` or reject", and an MCP server's cwd is wherever the client
 * happened to launch it. Measured: with the server rooted at `.../CONDUCKS`, every tool call naming
 * a real analyzed project one directory away answered `Path traversal rejected`, and every call
 * omitting `path` answered `database does not exist` — because the launch directory has no vault.
 * So the whole MCP surface was unusable for any project but one, and `ensureAnchor`'s own docstring
 * says it exists "to prevent Detached Root errors when the MCP server is launched from an arbitrary
 * directory" (ADR 0109).
 *
 * The constraint that keeps the security property while restoring the capability is not "inside the
 * launch directory" but **"is itself a conducks project"** — a directory holding `.conducks/` or
 * `conducks.json`. That cannot be used to read `/etc`, and it is exactly the set of places a
 * structural tool has any business answering about.
 */
function validatePath(customPath: string, projectRoot: string): string {
  const resolved = path.resolve(customPath);
  const root = path.resolve(projectRoot);

  // Inside the launch root — always allowed, unchanged.
  if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;

  // Outside it, but a real analyzed project of its own.
  const isProject = ['.conducks', 'conducks.json']
    .some(marker => { try { return fs.existsSync(path.join(resolved, marker)); } catch { return false; } });
  if (isProject) return resolved;

  throw new Error(
    `Refusing to anchor to ${customPath}: it is outside the server's root (${root}) and is not a ` +
    `conducks project — no .conducks/ or conducks.json found. Run \`conducks analyze\` there first.`
  );
}

/**
 * Resolve a caller-supplied path against the workspace root WITHOUT touching the graph.
 *
 * The docs layer reads markdown and nothing else: it must answer on a folder that was never
 * analyzed, must not open DuckDB, and must not hold a connection other agents queue behind.
 * `ensureAnchor` cannot give it that — it boots the whole registry. So the path check, which is the
 * only part the docs layer needs, lives on its own.
 */
export function resolveDocsRoot(customPath?: string): string {
  const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  return customPath ? validatePath(customPath, projectRoot) : projectRoot;
}

/**
 * [Conducks Anchor Check] 🏺
 * Ensures the structural registry is aligned to the correct workspace root
 * before executing any tool. This prevents "Detached Root" errors when
 * the MCP server is launched from an arbitrary directory.
 */
export async function ensureAnchor(
  customPath?: string,
  readOnly: boolean = true,
  needsGraph: boolean = true,
): Promise<void> {
  const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  const root = customPath ? validatePath(customPath, projectRoot) : projectRoot;
  const currentAnchor = (registry.infrastructure as any).chronicle?.getProjectDir();
  const currentPersistence = (registry.infrastructure as any).persistence;

  const rootChanged = root && root !== currentAnchor && root !== '/';
  const modeChanged = currentPersistence && currentPersistence.readOnly !== readOnly;
  // Disconnection is NOT a re-init trigger — the lazy connection reopens on next query.
  // Re-initializing the registry just because the connection was closed between tool calls
  // is expensive and unnecessary; the existing persistence object handles reconnection.
  if (rootChanged || modeChanged) {
    await registry.initialize(readOnly, root);
  }

  // Opt-OUT, deliberately. Forgetting to materialise a graph a tool walks is SILENT: the domain
  // services hold their own reference from construction, so they see an empty graph and report zero
  // nodes with no error. A tool must be PROVEN to touch no graph before it passes false.
  if (needsGraph) await registry.infrastructure.ensureGraphLoaded();
}
