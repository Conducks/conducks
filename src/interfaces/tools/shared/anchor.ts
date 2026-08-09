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

  // An MCP server is often launched at a directory that HOLDS projects rather than being one — a
  // workspace root with several repos beneath it. Every call then failed with DuckDB's raw
  // `IO Error: Cannot open database ... does not exist`, which tells an agent nothing it can act on
  // and reads like the tool is broken rather than like the root is wrong.
  //
  // Name the analyzed projects that ARE there. This is a diagnostic only — it fires when the
  // anchored root has no graph of its own, and never changes which root is used (ADR 0109).
  if (!customPath && !fs.existsSync(path.join(root, '.conducks', 'conducks-synapse.db'))) {
    let siblings: string[] = [];
    try {
      siblings = fs.readdirSync(root, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .filter(e => fs.existsSync(path.join(root, e.name, '.conducks', 'conducks-synapse.db')))
        .map(e => e.name);
    } catch { /* unreadable root: fall through to the normal failure */ }
    if (siblings.length > 0) {
      throw new Error(
        `${root} has no structural graph of its own, but ${siblings.length} analyzed project(s) sit ` +
        `beneath it: ${siblings.join(', ')}. Pass \`path\` to pick one — e.g. ` +
        `${path.join(root, siblings[0])} — or run \`conducks analyze\` at ${root} to index the whole workspace.`
      );
    }
  }

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

  registry.infrastructure.acquireVault();

  // Opt-OUT, deliberately. Forgetting to materialise a graph a tool walks is SILENT: the domain
  // services hold their own reference from construction, so they see an empty graph and report zero
  // nodes with no error. A tool must be PROVEN to touch no graph before it passes false.
  if (needsGraph) await registry.infrastructure.ensureGraphLoaded();
}

/**
 * Take a hold on the shared vault WITHOUT anchoring — for callers that release but never
 * `ensureAnchor`, so acquire and release stay balanced.
 *
 * `hypertoon` wraps every tool handler and closes in its own `finally`, while the handler inside it
 * also anchors and releases. Without this the pair is asymmetric — one increment, two decrements —
 * and the count reaches zero while a sibling call is still reading, which is the exact bug the
 * ref-count exists to prevent. It would have looked fixed and raced anyway.
 */
export function acquireAnchor(): void {
  registry.infrastructure.acquireVault();
}

/**
 * Release this tool call's hold on the shared vault, closing it only when nothing else is using it.
 *
 * Every handler used to end with `persistence.close()` in its own `finally`. The registry — and so
 * the connection — is a module-level SINGLETON shared by every concurrent call, so whichever call
 * finished first closed the vault out from under the ones still querying it. Measured over real
 * stdio JSON-RPC with eight pipelined calls: `conducks_query` and `conducks_explain` both returned
 * `Connection Error: Connection was never established or has been closed already`, and the attached
 * suggestion ("Check that the project has been analyzed first") pointed at the wrong cause entirely
 * — the project was analyzed, another tool call had simply hung up the shared handle.
 *
 * JSON-RPC permits concurrent requests and agents batch tool calls, so this is the normal case
 * rather than an exotic one.
 */
export async function releaseAnchor(): Promise<void> {
  await registry.infrastructure.releaseVault();
}
