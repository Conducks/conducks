import { Tool } from "@/contracts/types.js";
import { registry } from "@/registry/index.js";
import { FallbackDetector } from "@/lib/domain/analysis/fallback-detector.js";
import { ensureAnchor } from "../shared/anchor.js";
import { mcpOk, mcpErr } from "../../../types/mcp-response.js";

/**
 * Conducks — Structural Intelligence Tools (Unified Taxonomy)
 *
 * The tools exported below form the analytical core of the Conducks MCP suite.
 * They provide discovery, structural health, governance, and precision metrics.
 */

// S2: Whitelist of allowed Oracle query template names.
const ALLOWED_TEMPLATES = new Set([
  'find_usages', 'find_imports', 'unused_exports', 'dead_code', 'high_risk_dead_code',
  'blast_radius', 'deep_impact', 'structural_siblings', 'symbols_in_structure', 'symbols_in_namespace',
  'hotspots', 'entry_points', 'cross_namespace_coupling', 'cycles', 'layer_distribution',
  'kinetic_hotspots', 'suspicious_fallbacks', 'class_health_rollup', 'high_risk_symbols',
  'find_by_name', 'full_ancestry'
]);

// MCP6: validate symbol/nodeId param
function validateSymbol(value: string, paramName: string = 'symbol') {
  if (!value || value.trim() === '') {
    return mcpErr('INVALID_SYMBOL', `${paramName} must not be empty`, 'Pass a valid symbol name like "UserService" or "parseConfig"');
  }
  if (value.includes('..')) {
    return mcpErr('INVALID_SYMBOL', 'Symbol ID must not contain ".."', 'Pass a valid symbol name like "UserService" or "parseConfig"');
  }
  return null;
}

// Resolve short name to full node ID; returns resolved ID string or null on failure
function resolveSymbolId(symbol: string): string | null {
  const graph = registry.infrastructure.graphEngine.getGraph();
  if (symbol.includes('::')) return symbol.toLowerCase();
  const matches = graph.findNodesByName(symbol);
  if (matches.length === 0) return null;
  const best = matches.reduce((a: any, b: any) =>
    ((b.properties?.gravity ?? 0) > (a.properties?.gravity ?? 0) ? b : a)
  );
  return best.id as string;
}

export const synapseTools: Record<string, Tool> = {

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    type: "tool",
    version: "2.1.0",
    description: `Search the structural graph for symbols and concepts by name or pattern.
Foundational tool for codebase discovery. Supports Fuzzy search, Oracle templates, and Filters.

WHEN TO USE: Finding specific functions, classes, or modules; analyzing usage or dead code.
AFTER THIS: Use conducks_explain to analyze risk or conducks_trace to trace execution.

Modes:
- fuzzy (default): Natural language or partial name matching.
- template: Execute named Oracle Standard SQL templates (e.g., 'find_usages', 'hotspots', 'dead_code').

Returns:
- symbols: matching nodes ranked by gravity with entry points prioritized
- total: total number of matches found`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name, pattern, or search concept (for fuzzy mode)." },
        mode: { type: "string", enum: ["fuzzy", "template"], default: "fuzzy", description: "Query modality." },
        template: { type: "string", description: "The named Oracle template to execute (for template mode)." },
        params: { type: "object", description: "Parameters for the Oracle template (as a JSON object)." },
        // MCP1: numeric bounds
        limit: { type: "number", default: 10, minimum: 1, maximum: 500, description: "Max results to return." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ q, mode, template, params, limit, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);

        // 1. [Mode: Templates] Discovery - Lists available Oracle queries
        if (mode === 'template' && !template) {
          const templates = (registry.analyze.query as any).listTemplates();
          // MCP8: clean envelope
          return mcpOk({
            message: "Conducks Oracle Standard Library Active.",
            available_templates: templates
          });
        }

        // 2. [Mode: Template] Structural Analysis - Executes a named query
        if (mode === 'template' && template) {
          // S2: Whitelist check — reject unknown template names before SQL execution.
          if (!ALLOWED_TEMPLATES.has(template)) {
            return mcpErr('UNKNOWN_TEMPLATE', `Unknown query template: ${template}`, 'Use conducks_query with mode="template" and no template param to list available templates.', false);
          }
          const rawParams = Array.isArray(params) ? params : (params ? Object.values(params) : []);
          const results = await registry.analyze.query.execute(template as any, rawParams);
          // MCP7: pagination meta
          return mcpOk({ template, symbols: results }, { nodeCount: results.length, truncated: false });
        }

        // 3. [Mode: Fuzzy] Discovery - Default name/pattern search
        const results = await registry.analyze.query.execute('find_by_name', [q || '', '', ''], limit || 10);

        const standardize = (n: any) => ({
          id: n.id,
          name: n.name,
          kind: n.canonicalKind,
          rank: n.canonicalRank,
          location: {
            file: n.file,
            namespace: n.namespaceName,
            parent: n.parentName
          },
          risk: n.risk || 0,
          gravity: n.gravity || 0
        });

        const symbols = results.map(standardize);
        // MCP8: clean envelope, MCP7: meta
        return mcpOk(
          { q, symbols, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: symbols.length, truncated: false }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('QUERY_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_status: {
    id: "conducks-status",
    name: "conducks_status",
    type: "tool",
    version: "2.1.0",
    description: `Structural health and system manifest generation. Maps hotspots and entry points.

WHEN TO USE: First contact with a codebase or checking graph health and node counts.
AFTER THIS: Use conducks_query to find specific symbols.

Modes:
- health (default): Summary of symbols, edges, and index staleness.
- map: Lists the primary entry points and structural hotspots.
- manifest: Generates an LLM-optimized technical summary of the codebase.
- pulse: Triggers a micro-pulse for a specific file to update the live map.`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["health", "map", "manifest", "pulse"], default: "health" },
        file: { type: "string", description: "The relative or absolute path of the file to pulse (for 'pulse' mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ mode, file, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const status = registry.audit.status();

        if (mode === "map") {
          const hotspots = await registry.analyze.query.execute('hotspots', [10]);
          return mcpOk(
            { stats: status.stats, staleness: status.staleness, hotspots },
            { nodeCount: status.stats?.nodeCount, truncated: false }
          );
        }

        if (mode === "pulse") {
          if (!file) return mcpErr('MISSING_PARAM', "Mode 'pulse' requires a 'file' parameter.", 'Provide the file param with the relative path to the file to pulse.', false);
          const result = await (registry.analyze as any).resonate(file);
          return mcpOk({
            ...result,
            analysis: "Shallow Resurrection (Read-Only)",
            persistence: "Database write skipped as per Conducks MCPServer policy."
          });
        }

        return mcpOk({
          stats: status.stats,
          staleness: status.staleness,
          anchor: (registry.infrastructure as any).chronicle.getProjectDir()
        }, { nodeCount: status.stats?.nodeCount, truncated: false });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('STATUS_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_audit: {
    id: "conducks-audit",
    name: "conducks_audit",
    type: "tool",
    version: "2.1.0",
    description: `Audit architectural integrity. Detects circular dependencies, god objects, and violations.

WHEN TO USE: Before committing changes or during code review to check structural health.
AFTER THIS: Use conducks_explain to analyze why a symbol is flagged.

Modes:
- scan (default): Full integrity audit for circularities and god objects.
- advice: Professional structural improvement recommendations.
- guard: Defensive regression check. Blocks if risk exceeds threshold.
- archeology: Longitudinal historical analysis of structural decay over time (Window: 5 pulses).
- fallback: Analyze fallback patterns and identify legacy fallbacks vs legitimate ones.`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["scan", "advice", "guard", "archeology", "fallback"], default: "scan" },
        threshold: { type: "number", default: 0.1, description: "Max allowed decay (for guard mode)." },
        // MCP1: numeric bounds on window
        window: { type: "number", default: 5, minimum: 1, maximum: 10, description: "Historical window size (for archeology mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ mode, threshold, window, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);

        if (mode === "guard") {
          const result = await registry.audit.guard(threshold || 0.1);
          return mcpOk({ block: result.block, risk: result.risk, factors: result.factors, hotspots: result.hotspots, indexStaleness: registry.audit.status().staleness.stale });
        }

        if (mode === "archeology") {
          const result = await registry.evolution.audit(window || 5);
          return mcpOk({ ...result, indexStaleness: registry.audit.status().staleness.stale });
        }

        if (mode === "advice") {
          const advice = await registry.audit.advise();
          return mcpOk({ advice, indexStaleness: registry.audit.status().staleness.stale });
        }

        if (mode === "fallback") {
          const detector = new FallbackDetector();
          const graph = registry.infrastructure.graphEngine.getGraph();
          const allNodes = Array.from(graph.getAllNodes());

          // Find all functions that appear to be fallbacks
          const fallbackCandidates = allNodes
            .filter((node: any) => node.properties.canonicalKind === 'BEHAVIOR')
            .map((node: any) => {
              const analysis = detector.detectFallbackPatterns(node, graph);
              return {
                id: node.id,
                name: node.properties.name,
                file: node.properties.filePath,
                isFallback: analysis.isFallback,
                confidence: analysis.confidence,
                patterns: analysis.patterns
              };
            })
            .filter((candidate: any) => candidate.isFallback)
            .sort((a: any, b: any) => b.confidence - a.confidence)
            .slice(0, 20); // Top 20 most suspicious

          return mcpOk({
            fallbackCandidates,
            totalCandidates: fallbackCandidates.length,
            recommendations: fallbackCandidates.map((candidate: any) => ({
              symbol: candidate.name,
              file: candidate.file,
              confidence: candidate.confidence,
              recommendation: candidate.confidence > 0.8 ? 'HIGH PRIORITY: Remove legacy fallback' :
                            candidate.confidence > 0.6 ? 'MEDIUM PRIORITY: Review fallback necessity' :
                            'LOW PRIORITY: Monitor fallback usage'
            })),
            indexStaleness: registry.audit.status().staleness.stale
          }, { nodeCount: fallbackCandidates.length, truncated: false });
        }

        const audit = registry.audit.audit();
        return mcpOk({
          success: audit.success,
          violations: audit.violations,
          totalViolations: audit.violations.length,
          discoveriesSummary: `Identified ${audit.stats.ecosystem_dangling} external library symbols (Information only).`,
          discoveries: audit.discoveries,
          stats: audit.stats,
          indexStaleness: registry.audit.status().staleness.stale
        }, { nodeCount: audit.violations?.length, truncated: false });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('AUDIT_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_explain: {
    id: "conducks-explain",
    name: "conducks_explain",
    type: "tool",
    version: "2.1.0",
    description: `Deep dive into technical risk and behavior for a specific symbol.
Quantifies gravity, entropy, churn, and complexity.

WHEN TO USE: Understanding why a symbol is high risk or structuraly complex.
AFTER THIS: Use conducks_trace to see how data flows through this symbol.`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to explain." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      try {
        await ensureAnchor(customPath, true);
        const resolvedId = resolveSymbolId(symbol);
        if (!resolvedId) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, 'Use conducks_query to find valid symbol IDs', false);
        const risk: any = await registry.explain.calculateCompositeRisk(resolvedId);
        const ancestry = await registry.analyze.query.execute('full_ancestry', [resolvedId]);
        const node = ancestry.length > 0 ? ancestry[0] : null;

        return mcpOk({
          ...risk,
          context: node ? {
            name: node.name,
            file: node.file,
            parent: node.parentName,
            container: node.className || node.namespaceName,
            kind: node.canonicalKind,
            rank: node.canonicalRank
          } : undefined,
          indexStaleness: registry.audit.status().staleness.stale
        });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('EXPLAIN_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_context: {
    id: "conducks-context",
    name: "conducks_context",
    type: "tool",
    version: "1.0.0",
    description: `Collect structural context around a symbol within a given graph radius.
Returns neighboring nodes ranked by relevance. Supports optional token budget to limit response size.

WHEN TO USE: Gathering focused context around a specific symbol for an AI agent prompt.
AFTER THIS: Use conducks_explain to deep-dive a high-relevance node.

Ranking: score = confidence × (1/(depth+1)) × (1/(rank+1))
Budget: nodes are scored and added highest-first until budget is exhausted or diminishing returns threshold hit.`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to center the context on." },
        // MCP1: numeric bounds
        radius: { type: "number", default: 2, minimum: 1, maximum: 10, description: "BFS depth radius." },
        max_tokens: { type: "number", minimum: 100, maximum: 100000, description: "Optional: max estimated token budget. If omitted, uses default 8000." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, radius, max_tokens, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      try {
        await ensureAnchor(customPath, true);
        const graph = registry.infrastructure.graphEngine.getGraph();

        const maxDepth = Math.min(radius ?? 2, 10);

        // Resolve short name to full node ID if needed
        let startId = symbol.toLowerCase();
        if (!startId.includes('::')) {
          const matches = graph.findNodesByName(symbol);
          if (matches.length === 0) {
            return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, `Use conducks_query to find valid symbol IDs`, false);
          }
          const best = matches.reduce((a: any, b: any) =>
            ((b.properties?.gravity ?? 0) > (a.properties?.gravity ?? 0) ? b : a)
          );
          startId = best.id;
        }

        // MCP9: smart token ceiling
        const MAX_TOKENS_DEFAULT = 8000;
        const budget = max_tokens ?? MAX_TOKENS_DEFAULT;

        // BFS: collect all nodes within radius, tracking depth and best edge weight
        type NodeEntry = { nodeId: string; depth: number; edgeWeight: number };
        const visited = new Map<string, NodeEntry>(); // nodeId -> best entry
        const queue: NodeEntry[] = [{ nodeId: startId, depth: 0, edgeWeight: 1.0 }];
        visited.set(startId, { nodeId: startId, depth: 0, edgeWeight: 1.0 });

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (current.depth >= maxDepth) continue;

          // Traverse both directions to capture full local neighborhood
          for (const dir of ['downstream', 'upstream'] as const) {
            for (const edge of graph.getNeighbors(current.nodeId, dir)) {
              const neighborId = dir === 'downstream' ? edge.targetId : edge.sourceId;
              if (!visited.has(neighborId)) {
                const entry: NodeEntry = {
                  nodeId: neighborId,
                  depth: current.depth + 1,
                  edgeWeight: edge.confidence ?? 1.0
                };
                visited.set(neighborId, entry);
                queue.push(entry);
              }
            }
          }
        }

        // Remove the anchor node itself from results
        visited.delete(startId);

        // MCP9: Score using confidence × (1/(depth+1)) × (1/(rank+1))
        type ScoredNode = NodeEntry & { node: any; relevance_score: number; tokenEstimate: number };
        const scored: ScoredNode[] = [];

        for (const entry of visited.values()) {
          const node = graph.getNode(entry.nodeId);
          if (!node) continue;
          // MCP9: rankWeight = 1/(rank+1); lower rank number => higher weight
          const rankWeight = 1 / ((node.properties?.rank ?? 4) + 1);
          const relevance_score = (entry.edgeWeight ?? 0.5) * (1 / (entry.depth + 1)) * rankWeight;
          const item = {
            id: node.id,
            name: node.properties.name,
            kind: node.properties.canonicalKind,
            rank: node.properties.canonicalRank,
            file: node.properties.filePath,
            depth: entry.depth,
            relevance_score: parseFloat(relevance_score.toFixed(4))
          };
          const tokenEstimate = Math.ceil(JSON.stringify(item).length / 4);
          scored.push({ ...entry, node, relevance_score, tokenEstimate });
        }

        // Sort highest score first
        scored.sort((a, b) => b.relevance_score - a.relevance_score);

        // MCP9: smart budget application — never cut mid-item, stop on diminishing returns
        const topScore = scored.length > 0 ? scored[0].relevance_score : 0;
        const items: Array<{ id: string; name: string; kind: string; rank: number; file: string; depth: number; relevance_score: number }> = [];
        let tokensUsed = 0;
        let truncated = false;

        for (const s of scored) {
          // Diminishing returns: skip if score is less than 10% of top score
          if (s.relevance_score < topScore * 0.1) {
            truncated = items.length < scored.length;
            break;
          }
          if (tokensUsed + s.tokenEstimate > budget) {
            truncated = true;
            break;
          }
          items.push({
            id: s.node.id,
            name: s.node.properties.name,
            kind: s.node.properties.canonicalKind,
            rank: s.node.properties.canonicalRank,
            file: s.node.properties.filePath,
            depth: s.depth,
            relevance_score: parseFloat(s.relevance_score.toFixed(4))
          });
          tokensUsed += s.tokenEstimate;
        }

        return mcpOk(
          { symbol, radius: maxDepth, total_in_radius: scored.length, nodes: items, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: items.length, truncated, tokensUsed }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('CONTEXT_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  // conducks_guide REMOVED — it was a static file-reader (redundant with the installed Claude
  // skills). Conducks-usage guidance now ships as native skills via `conducks setup`, from
  // resources/skills/. See ADR 0006.

  // MCP4: Direct graph query tool (SELECT-only DuckDB access)
  conducks_graph_query: {
    id: "conducks-graph-query",
    name: "conducks_graph_query",
    type: "tool",
    version: "1.0.0",
    description: `Execute a raw SELECT query against the Conducks DuckDB graph store.
Only SELECT statements are permitted. Useful for custom structural analysis.

WHEN TO USE: Advanced queries not covered by conducks_query templates.
AFTER THIS: Use conducks_explain for deeper analysis of returned symbols.`,
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A SELECT statement to run against the graph store." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["sql"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ sql, path: customPath }: any) => {
      // MCP4: Only allow SELECT statements
      if (!sql || !sql.trim().toUpperCase().startsWith('SELECT')) {
        return mcpErr('FORBIDDEN_QUERY', 'Only SELECT statements are allowed.', 'Rewrite your query as a SELECT statement.', false);
      }

      try {
        await ensureAnchor(customPath, true);
        const raw = await (registry.infrastructure.persistence as any).query(sql);
        // Convert BigInt values (e.g. COUNT(*)) to Number for JSON serialization
        const rows = raw.map((r: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))
        );
        return mcpOk({ rows }, { nodeCount: rows.length, truncated: false });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('QUERY_FAILED', err.message, 'Check your SQL syntax and that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_flows: {
    id: "conducks-flows",
    name: "conducks_flows",
    type: "tool",
    version: "2.0.0",
    description: `List all logical execution flows in the codebase. Each flow is a named entry point and the symbols it calls.

WHEN TO USE: Getting a bird's-eye view of what the system does. Finding which functions are called by a specific process or API handler.
AFTER THIS: Use conducks_trace on a specific flow's entry symbol to see its full execution path.

Returns: list of flows, each with a name, entry symbol, and member count.`,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        min_members: { type: "number", default: 2, minimum: 1, description: "Only return flows with at least this many symbols. Default 2 (filters noise)." },
        limit: { type: "number", default: 20, minimum: 1, maximum: 100, description: "Max flows to return." },
        path: { type: "string", description: "Optional: absolute project root path." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ min_members, limit, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const processes = registry.kinetic.getProcesses();
        const minSize = Math.max(1, min_members ?? 2);
        const cap = Math.min(100, limit ?? 20);

        const graph = registry.infrastructure.graphEngine.getGraph();
        const flows = Object.entries(processes)
          .filter(([, members]) => (members as string[]).length >= minSize)
          .sort((a, b) => (b[1] as string[]).length - (a[1] as string[]).length)
          .slice(0, cap)
          .map(([name, members]) => {
            const node = graph.findNodesByName(name)[0];
            return {
              name,
              file: node?.properties?.filePath ?? null,
              member_count: (members as string[]).length,
              top_members: (members as string[]).slice(0, 5)
            };
          });

        return mcpOk(
          { flows, total: Object.keys(processes).length, shown: flows.length },
          { nodeCount: flows.length, truncated: flows.length < Object.keys(processes).filter(k => (processes[k] as string[]).length >= minSize).length }
        );
      } catch (err: any) {
        return mcpErr('FLOWS_FAILED', err.message, 'Run conducks analyze on the project first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_prune: {
    id: "conducks-prune",
    name: "conducks_prune",
    type: "tool",
    version: "1.0.0",
    description: `Find dead code: orphaned symbols, unused exports, and stale imports.

WHEN TO USE: Before a refactor to find safe-to-delete code. When cleaning up a module. When reducing bundle size.
AFTER THIS: Use conducks_impact on a flagged symbol to confirm nothing calls it before deleting.

Finding types:
- ORPHAN: defined but never called or imported by anything
- UNUSED_EXPORT: exported but never consumed outside its own file
- STALE_IMPORT: imported but never used in the file

Returns: list of findings with type, symbol name, file path, and reason.`,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["ORPHAN", "UNUSED_EXPORT", "STALE_IMPORT", "all"],
          default: "all",
          description: "Filter by finding type. Default returns all types."
        },
        limit: { type: "number", default: 50, minimum: 1, maximum: 200, description: "Max findings to return." },
        path: { type: "string", description: "Optional: absolute project root path." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ type: filterType, limit, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        let findings: any[] = registry.explain.prune();

        if (filterType && filterType !== 'all') {
          findings = findings.filter((f: any) => f.type === filterType);
        }

        const cap = Math.min(200, limit ?? 50);
        const shown = findings.slice(0, cap);

        const summary = {
          ORPHAN: findings.filter((f: any) => f.type === 'ORPHAN').length,
          UNUSED_EXPORT: findings.filter((f: any) => f.type === 'UNUSED_EXPORT').length,
          STALE_IMPORT: findings.filter((f: any) => f.type === 'STALE_IMPORT').length,
        };

        return mcpOk(
          { findings: shown, summary, total: findings.length, shown: shown.length },
          { nodeCount: shown.length, truncated: shown.length < findings.length }
        );
      } catch (err: any) {
        return mcpErr('PRUNE_FAILED', err.message, 'Run conducks analyze on the project first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  // Parity: docs progress board (todo %, ADR states) parsed from the authored markdown grammar.
  conducks_docs: {
    id: "conducks-docs",
    name: "conducks_docs",
    type: "tool",
    version: "1.0.0",
    description: `Progress board parsed straight from the project's authored docs (conducks-docs grammar):
todo phases/%, ADR states, feature/memory/convention counts, and any grammar violations.

WHEN TO USE: Check what work is in flight and its status without reading every doc.`,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional: the project root." } }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const board = registry.docs.board(customPath);
        return mcpOk(board, { nodeCount: board.todos.length + board.decisions.length });
      } catch (err: any) {
        return mcpErr('DOCS_FAILED', err.message, 'Check the docs/ folder follows the conducks-docs grammar.', true);
      }
    }
  },

  // Parity: coverage overlay — range-join a coverage report onto function spans (drift detection).
  conducks_coverage: {
    id: "conducks-coverage",
    name: "conducks_coverage",
    type: "tool",
    version: "1.0.0",
    description: `Overlay an istanbul coverage-final.json onto the graph: per-function fill % and
branch coverage. A dark function (0%) with no callers is dead/forgotten code; one that was
covered and is now dark has broken.

WHEN TO USE: See which functions a test run exercised, and spot lost/untested capabilities.`,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        coverage: { type: "string", description: "Path to an istanbul coverage-final.json." },
        path: { type: "string", description: "Optional: the project root." }
      },
      required: ["coverage"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ coverage, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const results = await registry.coverage.bind(coverage);
        const bound = results.filter((r: any) => r.bound);
        const full = bound.filter((r: any) => r.pct >= 99).length;
        const dark = bound.filter((r: any) => r.pct === 0).length;
        return mcpOk({ functions: bound, summary: { total: bound.length, full, dark } }, { nodeCount: bound.length });
      } catch (err: any) {
        return mcpErr('COVERAGE_FAILED', err.message, 'Run conducks analyze first, and pass a valid coverage-final.json.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  }
};
