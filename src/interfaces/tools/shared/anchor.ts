import { registry } from "@/registry/index.js";
import path from 'node:path';
import fs from 'node:fs';
import { VAULT_DIR, VAULT_DB_FILENAME } from "@/contracts/index.js";

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
 * The root a tool call is answered from: its `path` once the guard above has accepted it, otherwise
 * the server's launch root. Throws for a refused path — and every caller asks this BEFORE anchoring,
 * so a refused path never becomes the anchor other calls then see (state-machine audit P-10-10).
 */
export function resolveRequestRoot(customPath?: string): string {
  const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  return customPath ? validatePath(customPath, projectRoot) : projectRoot;
}

/**
 * THE ANCHOR GATE — what lets tool calls overlap without one taking the vault away from another.
 *
 * Everything under a handler is a module-level singleton: one registry, one graph, one vault handle.
 * Calls for the anchored project run concurrently, as before (todo52). A call for ANOTHER project
 * used to re-anchor on the spot, which closes the handle and clears the graph under every call still
 * running; measured, a SQL query naming project B answered from project A's vault, every time,
 * when calls for both were pipelined (state-machine audit P-10-1).
 *
 * The smallest design that makes that safe: a re-anchor is EXCLUSIVE. It waits until no call is
 * running, runs alone, and calls that arrive while one is waiting queue behind it so it cannot be
 * starved. The graph-staleness check (P-10-3) is exclusive for the same reason — a reload clears the
 * graph — and runs only when the gate is idle, so steady concurrent traffic pays nothing for it.
 */
let activeCalls = 0;
let exclusive: Promise<void> | null = null;
let waiting: Array<() => void> = [];

function wakeWaiters(): void {
  const ready = waiting;
  waiting = [];
  for (const wake of ready) wake();
}

/** Enter the gate for one tool call. Throws (having changed nothing) when `customPath` is refused. */
export async function enterToolCall(customPath?: string): Promise<void> {
  const root = resolveRequestRoot(customPath);
  for (;;) {
    if (exclusive) { await exclusive.catch(() => { /* the owner reports it */ }); continue; }
    const reanchor = registry.infrastructure.wouldReanchor(true, root);
    if (activeCalls === 0) {
      activeCalls++;
      exclusive = (async () => {
        if (reanchor) await registry.initialize(true, root);
        else if (await registry.infrastructure.graphIsStale()) registry.infrastructure.reloadGraph();
      })();
      try {
        await exclusive;
      } catch (err) {
        activeCalls--;
        throw err;
      } finally {
        exclusive = null;
        if (activeCalls === 0) wakeWaiters();
      }
      return;
    }
    if (!reanchor && waiting.length === 0) { activeCalls++; return; }
    await new Promise<void>(resolve => waiting.push(resolve));
  }
}

/** Leave the gate; the last call out lets a queued re-anchor run. */
export function leaveToolCall(): void {
  activeCalls = Math.max(0, activeCalls - 1);
  if (activeCalls === 0) wakeWaiters();
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
  // The hold is taken FIRST, before anything below can throw. Every handler releases in its
  // `finally` whether or not this returned, so a hold taken at the END was released without ever
  // being taken whenever the path guard or the sibling diagnostic refused the call: the count drifted
  // down by one per refusal and reached zero — closing the vault — while other calls were still
  // reading it (state-machine audit P-10-2).
  registry.infrastructure.acquireVault();

  const root = resolveRequestRoot(customPath);

  // An MCP server is often launched at a directory that HOLDS projects rather than being one — a
  // workspace root with several repos beneath it. Every call then failed with DuckDB's raw
  // `IO Error: Cannot open database ... does not exist`, which tells an agent nothing it can act on
  // and reads like the tool is broken rather than like the root is wrong.
  //
  // Name the analyzed projects that ARE there. This is a diagnostic only — it fires when the
  // anchored root has no graph of its own, and never changes which root is used (ADR 0109).
  if (!customPath && !fs.existsSync(path.join(root, VAULT_DIR, VAULT_DB_FILENAME))) {
    let siblings: string[] = [];
    try {
      siblings = fs.readdirSync(root, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .filter(e => fs.existsSync(path.join(root, e.name, VAULT_DIR, VAULT_DB_FILENAME)))
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

  // The SAME question the gate asks (`wouldReanchor`, on the discovered root). This compared the raw
  // path to the chronicle, which is never equal for a subdirectory of the anchored project, so every
  // such call re-initialized on its own, beside the calls the gate had let in (state-machine audit
  // round 2, Q-10-3). Disconnection is NOT a re-init trigger — the lazy connection reopens on next query.
  if (root && root !== '/' && registry.infrastructure.wouldReanchor(readOnly, root)) {
    await registry.initialize(readOnly, root);
  }

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
