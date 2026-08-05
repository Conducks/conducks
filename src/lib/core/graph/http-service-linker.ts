import { readFileSync } from 'node:fs';
import type { ConducksAdjacencyList, ConducksEdge } from './adjacency-list.js';

/**
 * Conducks — HTTP Service Linker
 *
 * Detects cross-service HTTP calls by scanning source files for URL literals
 * containing hostnames that match known service nodes in the graph.
 *
 * Emits CALLS edges from the file's unit node to the matched service node.
 */

const HTTP_URL_RE = /https?:\/\/([a-z][a-z0-9-]{2,})(:\d+)?(?:\/|$)/g;

/** Canonical kinds that represent a service boundary. */
const SERVICE_KINDS = new Set(['DIRECTORY', 'NAMESPACE', 'REPOSITORY', 'ECOSYSTEM']);

/**
 * A DOCUMENT THAT MENTIONS A URL IS NOT A CALLER.
 *
 * This linker reads RAW TEXT, so prose qualifies exactly like code — and on the frozen sofie
 * subject it minted `docs/memory.md::unit -CALLS-> src/plugins/providers/said-server` because the
 * memory doc names the server's URL while describing it. Both wrong CALLS edges the first
 * `verify-edges` run found on that subject were markdown sources (todo44#P5). Prose extensions are
 * skipped; code stays scanned.
 */
const PROSE_EXTENSIONS = /\.(md|mdx|markdown|rst|txt|adoc)$/i;

export class HttpServiceLinker {
  constructor(private readonly graph: ConducksAdjacencyList) {}

  /**
   * Scans the given file paths for HTTP URL literals and creates CALLS edges
   * from each file's unit node to the matched service node.
   *
   * @returns Array of edges created (also added to the graph in-memory).
   */
  public link(filePaths: string[]): ConducksEdge[] {
    const nodes = this.graph.getNodesMap();

    // Build hostname → node-id map keyed by node name (e.g. "go-llms").
    // When multiple nodes share the same name (e.g. nested "analytics" dirs),
    // prefer the shallowest one — shorter id is a reliable proxy for depth.
    const serviceMap = new Map<string, string>();
    for (const [id, node] of nodes) {
      const kind: string = node.properties.canonicalKind ?? '';
      if (!SERVICE_KINDS.has(kind)) continue;

      const name: string = (node.properties.name ?? '').toLowerCase();
      if (!name) continue;

      const existing = serviceMap.get(name);
      // Shorter id → shallower (closer to repo root) → preferred service node.
      if (!existing || id.length < existing.length) {
        serviceMap.set(name, id);
      }
    }

    const created: ConducksEdge[] = [];

    for (const filePath of filePaths) {
      if (PROSE_EXTENSIONS.test(filePath)) continue;
      // Unit node ID matches how the orchestrator creates them in Pass 1.
      const fileNodeId = `${filePath.toLowerCase()}::unit`;
      if (!this.graph.hasNode(fileNodeId)) continue;

      let source: string;
      try {
        source = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      // Collect all unique hostnames referenced via HTTP URLs in this file.
      const found = new Set<string>();
      HTTP_URL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HTTP_URL_RE.exec(source)) !== null) {
        found.add(m[1].toLowerCase());
      }

      for (const hostname of found) {
        const targetId = serviceMap.get(hostname);
        if (!targetId || targetId === fileNodeId) continue;

        const edge: ConducksEdge = {
          id: `${fileNodeId}::http::${hostname}`,
          sourceId: fileNodeId,
          targetId,
          type: 'CALLS',
          confidence: 0.8,
          properties: { method: 'HTTP', hostname, tier: 'service' },
        };

        this.graph.addEdge(edge);
        created.push(edge);
      }
    }

    return created;
  }
}
