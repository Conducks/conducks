import { registry } from "@/registry/index.js";
import path from 'node:path';

// S1: Path traversal guard — rejects paths that escape the project root.
function validatePath(customPath: string, projectRoot: string): string {
  const resolved = path.resolve(customPath);
  const root = path.resolve(projectRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path traversal rejected: ${customPath} is outside project root`);
  }
  return resolved;
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
export async function ensureAnchor(customPath?: string, readOnly: boolean = true): Promise<void> {
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
}
