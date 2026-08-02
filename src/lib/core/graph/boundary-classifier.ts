/**
 * Conducks — Boundary Origin Classifier (System 2, ADR 0012) 🏺
 *
 * Every reference that leaves the repo lands on a BOUNDARY: an import/call whose target is not an
 * in-graph node. System 2's premise is that "edge classification, not node count, tells architecture
 * health" — so a boundary reference is only useful once we know its ORIGIN:
 *
 *   - internal    — resolves inside the repo (relative/aliased path). Not a boundary at all.
 *   - stdlib      — the language/runtime standard library (Node core, `node:` prefix). Trusted,
 *                   unversioned, not a supply-chain surface.
 *   - dependency  — a third-party package (npm/pip/…). Versioned, IS the supply-chain surface.
 *
 * This module is a pure function over the raw specifier string — no graph, no IO — so it is trivially
 * testable and reusable by any pass that wants to tag an edge or a boundary node.
 */

export type BoundaryOrigin = 'internal' | 'stdlib' | 'dependency';

export interface BoundaryClassification {
  origin: BoundaryOrigin;
  /** For a dependency, the package name (`@scope/name` or `name`); null otherwise. */
  package: string | null;
}

// Node.js core modules (the ones a repo actually imports). `node:`-prefixed forms are stdlib by rule.
const NODE_STDLIB = new Set<string>([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

/**
 * Classify a raw import/require specifier by origin.
 *
 * @param specifier  the raw module string, e.g. `path`, `node:fs`, `@scope/pkg/sub`, `./util`, `@/lib/x`
 * @param internalAliases  alias prefixes the repo maps to itself (e.g. `@/`, `~/`). Treated as internal.
 */
export function classifyOrigin(
  specifier: string,
  internalAliases: string[] = ['@/', '~/'],
  workspacePackages?: ReadonlySet<string>,
): BoundaryClassification {
  const spec = (specifier || '').trim().replace(/^['"]|['"]$/g, '');

  // Relative or absolute path, or a repo alias → internal (not a boundary).
  if (spec.startsWith('.') || spec.startsWith('/') || internalAliases.some(a => spec.startsWith(a))) {
    return { origin: 'internal', package: null };
  }

  // A WORKSPACE package is a bare specifier with source in this tree — `@repo/adapters` resolving
  // to `packages/adapters`. It is not a supply-chain surface and must not be tagged as one, or the
  // dependency report counts a project's own modules as third-party risk (ADR 0108).
  if (workspacePackages?.size) {
    const seg = spec.split('/');
    const name = (spec.startsWith('@') && seg.length >= 2 ? `${seg[0]}/${seg[1]}` : seg[0]).toLowerCase();
    if (workspacePackages.has(name)) return { origin: 'internal', package: null };
  }

  // `node:`-prefixed, or a bare Node core module → stdlib.
  if (spec.startsWith('node:')) return { origin: 'stdlib', package: null };
  const head = spec.split('/')[0];
  if (NODE_STDLIB.has(head)) return { origin: 'stdlib', package: null };

  // Everything else is a third-party dependency. Package = `@scope/name` or the first path segment.
  const pkg = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : head;
  return { origin: 'dependency', package: pkg || spec };
}
