import { Tool, FilterValidationError, FILTER_DEFAULT_LIMIT, FILTER_MAX_LIMIT } from "@/contracts/types.js";
import { registry } from "@/registry/index.js";
import { ensureAnchor, releaseAnchor, resolveDocsRoot } from "../shared/anchor.js";
import { mcpOk, mcpErr } from "../../../types/mcp-response.js";

/**
 * Conducks — Structural Intelligence Tools (Unified Taxonomy)
 *
 * The tools exported below form the analytical core of the Conducks MCP suite.
 * They provide discovery, structural health, governance, and precision metrics.
 */

// S2: Whitelist of allowed Oracle query template names.
/**
 * Kinds `conducks_context` never returns: the containment tree above a symbol.
 *
 * A caller asking for context around `logAudit` wants the code related to it, not the folder it
 * lives in — they already have the path. These sit at the LOW end of `canonicalRank`, so the
 * relevance formula `1/(canonicalRank+1)` scored every one of them above every function (ADR 0103).
 *
 * NAMESPACE and PACKAGE are here for the same reason, though neither is emitted by a TypeScript
 * grammar — a polyglot repository produces both, and leaving them out would make this list correct
 * only for the language it was tested against.
 */
const CONTEXT_CONTAINERS = new Set(['ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT']);

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

/**
 * DuckDB functions that reach outside the vault (ADR 0047).
 *
 * A denylist is the wrong shape in general — this one is used because DuckDB's surface is large and
 * an allowlist of permitted SYNTAX would reject legitimate analytical SQL. It is paired with the
 * SELECT-prefix check rather than replacing it, and each entry is a function that performs I/O:
 * file reads, directory listings, network fetches, or attaching another database.
 */
const FORBIDDEN_SQL_FUNCTIONS = [
  'read_text', 'read_blob', 'read_csv', 'read_csv_auto', 'read_json', 'read_json_auto',
  'read_parquet', 'read_ndjson', 'read_ndjson_auto', 'parquet_scan', 'iceberg_scan',
  'glob', 'sniff_csv', 'attach', 'copy_from', 'install', 'load',
];

/** The modes `conducks_audit` actually implements, and the values its schema advertises. */
export const AUDIT_MODES = ['scan', 'advice', 'guard', 'archeology', 'fallback'] as const;
/** The finding types `conducks_prune` can filter to, plus the unfiltered `all`. */
export const PRUNE_TYPES = ['ORPHAN', 'UNUSED_EXPORT', 'STALE_IMPORT', 'all'] as const;

/**
 * Refuse an out-of-enum argument instead of answering something plausible.
 *
 * Two tools silently accepted anything. `conducks_audit` fell through every mode branch and ran
 * `scan`, so a caller asking for one analysis received a different one with no indication. Worse,
 * `conducks_prune` filtered its findings by an unvalidated string, so a TYPO produced
 * `{findings: [], summary: {ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0}, total: 0}` — a confident
 * clean bill of health for the entire codebase, indistinguishable from a genuinely clean project.
 *
 * `undefined` is allowed through: these parameters are optional and their handlers apply a documented
 * default. It is a WRONG value, not a missing one, that is refused — the same rule the CLI adopted
 * for `status --mode` ("an UNKNOWN mode is an error, not a default").
 *
 * Shared by both callers on purpose. Two copies of a validation rule is how the SQL guard's
 * multi-statement hole survived: the tool and its test each held one, and neither covered it.
 */
export function enumErr(value: unknown, allowed: readonly string[], paramName: string) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && allowed.includes(value)) return null;
  return mcpErr(
    'INVALID_PARAM',
    `${paramName} must be one of: ${allowed.join(', ')} — got ${JSON.stringify(value)}`,
    `Pass ${paramName}=${allowed[0]} (or omit it for the default).`,
    false,
  );
}

/**
 * The single source of truth for what `graph_query` accepts — a pure function so the tool and its
 * test check the SAME rule. The test used to REPLICATE the guard, which is how the multi-statement
 * hole (`SELECT 1; DROP TABLE nodes;` reaching the read-only DB) lived: the tool and the test drifted
 * and neither covered it. `null` = allowed; otherwise the refusal reason.
 */
export function sqlGuardReason(sql: string): { code: string; message: string; suggestion: string } | null {
  if (!sql || !sql.trim().toUpperCase().startsWith('SELECT')) {
    return { code: 'FORBIDDEN_QUERY', message: 'Only SELECT statements are allowed.', suggestion: 'Rewrite your query as a SELECT statement.' };
  }
  if (/;\s*\S/.test(sql.trim())) {
    return { code: 'FORBIDDEN_QUERY', message: 'Only a single SELECT statement is allowed — a second statement after `;` is refused.', suggestion: 'Send one SELECT at a time.' };
  }
  const forbidden = FORBIDDEN_SQL_FUNCTIONS.find(fn => new RegExp(`\\b${fn}\\s*\\(`, 'i').test(sql));
  if (forbidden) {
    return { code: 'FORBIDDEN_QUERY', message: `The function ${forbidden}() reads outside the vault and is not permitted.`, suggestion: 'Query the vault tables directly: nodes, edges, pulses, node_history, metadata, file_hashes.' };
  }
  return null;
}

export const synapseTools: Record<string, Tool> = {

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    layer: "code",
    type: "tool",
    version: "2.1.0",
    description: `Search the structural graph for symbols and concepts by name or pattern.
Foundational tool for codebase discovery. Supports Fuzzy search, Oracle templates, and Filters.

WHEN TO USE: Finding specific functions, classes, or modules; analyzing usage or dead code.
AFTER THIS: Use conducks_explain to analyze risk or conducks_trace to trace execution.

Modes:
- fuzzy (default): Natural language or partial name matching.
- template: Execute named Oracle Standard SQL templates (e.g., 'find_usages', 'hotspots', 'dead_code').
- filter: Typed filter object -> parameterised SQL, no raw SQL surface. Pass \`filter\`:
  { conditions: [{ field, operator, value }], limit? }. field must be one of the allowed
  node columns (e.g. canonicalKind, risk, file, name); operator is one of eq|neq|gt|gte|lt|lte|
  like|in; value is bound as a parameter, never interpolated. Unknown fields/operators are
  rejected, not passed through. Results capped at 20 rows to stay under the response budget.

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
        mode: { type: "string", enum: ["fuzzy", "template", "filter"], default: "fuzzy", description: "Query modality." },
        template: { type: "string", description: "The named Oracle template to execute (for template mode)." },
        params: { type: "object", description: "Parameters for the Oracle template (as a JSON object)." },
        filter: {
          type: "object",
          description: "Typed filter object for filter mode: { conditions: [{ field, operator, value }], limit? }.",
          properties: {
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string", description: "Node column to filter on (e.g. canonicalKind, risk, file, name)." },
                  operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"] },
                  value: { description: "Value to compare against. Array of strings/numbers for operator 'in'." }
                },
                required: ["field", "operator", "value"]
              }
            },
            limit: { type: "number", minimum: 1, maximum: 20, description: "Max results (default 10, max 20)." }
          }
        },
        // MCP1: numeric bounds
        limit: { type: "number", default: 10, minimum: 1, maximum: 500, description: "Max results to return." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ q, mode, template, params, filter, limit, path: customPath }: any) => {
      try {
        // Only FUZZY mode walks the graph — it resolves names against in-memory nodes. `template`
        // and `filter` compile to SQL and read through persistence, so they must not pay the
        // ~165 MB graph load. Derived from the mode rather than hardcoded, because getting it
        // wrong for fuzzy would return an empty result set with no error.
        await ensureAnchor(customPath, true, (mode ?? 'fuzzy') === 'fuzzy');

        // 0. [Mode: Filter] Typed filter object -> parameterised SQL. No raw SQL surface: field
        // names and operators are validated against fixed allowlists in filter-builder.ts, and
        // every value is bound as a `?` parameter — never interpolated into the query text.
        if (mode === 'filter') {
          let compiled: { sql: string; params: unknown[] };
          try {
            compiled = registry.query.buildFilter(filter as Parameters<typeof registry.query.buildFilter>[0]);
          } catch (validationErr: any) {
            if (validationErr instanceof FilterValidationError) {
              return mcpErr('INVALID_FILTER', validationErr.message, 'Check field names against the allowed list and operator against eq|neq|gt|gte|lt|lte|like|in.', false);
            }
            throw validationErr;
          }
          const rows = await (registry.infrastructure.persistence as any).query(compiled.sql, compiled.params);
          const appliedLimit = Math.min(Math.max(1, filter?.limit ?? FILTER_DEFAULT_LIMIT), FILTER_MAX_LIMIT);
          return mcpOk({ filter, symbols: rows }, { nodeCount: rows.length, truncated: rows.length >= appliedLimit });
        }

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
            // WHERE, not just which file. An agent that gets a path still has to open and scan it;
            // the vault has carried `lineStart`/`lineEnd` all along and this surface dropped both,
            // so `conducks_query` could never finish a "find X" task on its own (ADR 0109).
            line: n.lineStart ?? null,
            endLine: n.lineEnd ?? null,
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
        await releaseAnchor();
      }
    }
  },

  conducks_status: {
    id: "conducks-status",
    name: "conducks_status",
    layer: "code",
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
        // `pulse` re-parses a file and needs a graph to write into. `manifest` runs the same cycle
        // detection `conducks_audit` uses (registry.audit.audit() walks the in-memory graph), so it
        // needs the graph loaded too. `health` and `map` report counts, staleness and SQL-templated
        // hotspots — none of that touches the in-memory graph, so they must not pay the ~165 MB load.
        await ensureAnchor(customPath, true, mode === "pulse" || mode === "manifest");
        const status = mode === "pulse" ? registry.audit.status() : await registry.audit.statusFromVault();

        if (mode === "map") {
          const hotspots = await registry.analyze.query.execute('hotspots', [10]);
          return mcpOk(
            { status: status.status, stats: status.stats, staleness: status.staleness, hotspots },
            { nodeCount: status.stats?.nodeCount, truncated: false }
          );
        }

        // `manifest` was previously not branched on at all and fell through to the `health` return
        // below — the enum and the description promised "an LLM-optimized technical summary of the
        // codebase" while the handler silently answered "is my index stale" instead (todo28#P1).
        // This composes the onboarding digest from capabilities that already exist elsewhere in this
        // file (`map`'s hotspots template, `conducks_audit`'s scan) rather than duplicating them.
        if (mode === "manifest") {
          const hotspots = await registry.analyze.query.execute('hotspots', [5]);
          const entryPoints = await registry.analyze.query.execute('entry_points', [5]);
          const audit = registry.audit.audit();
          return mcpOk({
            status: status.status,
            stats: status.stats,
            staleness: status.staleness,
            hotspots,
            entryPoints,
            violations: { total: audit.violations.length, sample: audit.violations.slice(0, 5) },
            discoveriesSummary: `Identified ${audit.stats.ecosystem_dangling} external library symbols (Information only).`,
          }, { nodeCount: status.stats?.nodeCount, truncated: false });
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

        // `status` is CARRIED, on every mode above and here. The payload used to send `stats` and
        // `staleness` and drop the verdict entirely, so an agent asking about an empty vault received
        // `nodeCount: 0` next to `"stale": false` — a positive claim of "in sync" — with nothing
        // saying the graph held nothing. That is worse than the CLI's old READY, because a false
        // negative an agent acts on is silent. Same defect, second surface (todo49 Phase 2b).
        return mcpOk({
          status: status.status,
          stats: status.stats,
          staleness: status.staleness,
          anchor: (registry.infrastructure as any).chronicle.getProjectDir()
        }, { nodeCount: status.stats?.nodeCount, truncated: false });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('STATUS_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await releaseAnchor();
      }
    }
  },

  conducks_audit: {
    id: "conducks-audit",
    name: "conducks_audit",
    layer: "code",
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
      // An unknown mode fell through every branch below and ran `scan`, returning a full, plausible
      // payload for a request that was never honoured — the caller asked for one analysis and
      // silently received a different one. Same defect the CLI fixed for `status --mode map`
      // ("an UNKNOWN mode is an error, not a default"); the tool surface never got that fix.
      const badMode = enumErr(mode, AUDIT_MODES, 'mode');
      if (badMode) return badMode;

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
          const detector = registry.audit.createFallbackDetector();
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
        await releaseAnchor();
      }
    }
  },

  conducks_explain: {
    id: "conducks-explain",
    name: "conducks_explain",
    layer: "code",
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
        await releaseAnchor();
      }
    }
  },

  conducks_context: {
    id: "conducks-context",
    name: "conducks_context",
    layer: "code",
    type: "tool",
    version: "1.0.0",
    description: `Collect structural context around a symbol within a given graph radius.
Returns neighboring nodes ranked by relevance. Supports optional token budget to limit response size.

WHEN TO USE: Gathering focused context around a specific symbol for an AI agent prompt.
AFTER THIS: Use conducks_explain to deep-dive a high-relevance node.

Ranking: score = confidence × (1/(depth+1)) × (1/(canonicalRank+1)) — canonicalRank is the taxonomy
depth (STRUCTURE 7, BEHAVIOR 8, ATOM 9), so a local variable is worth less than the function or class
that holds it at the same graph depth and confidence.
Budget: nodes are scored and added highest-first until budget is exhausted or diminishing returns threshold hit.
ATOMs (local variables, fields) are excluded by default — pass include_atoms:true to get them back.
Each item carries "line" (jump target, when the node has one) and "short_id" (repo-relative, alongside
the full "id" — always feed "id" back into trace/impact/explain/context, short_id is display-only).`,
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
        path: { type: "string", description: "Optional: The absolute project root." },
        include_atoms: { type: "boolean", default: false, description: "Include ATOM nodes (local variables, fields) in the result. Off by default — they are rarely useful context and usually crowd out the symbols that are." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, radius, max_tokens, path: customPath, include_atoms }: any) => {
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
        const includeAtoms = include_atoms === true;

        // todo28#P4: repo-relative id, for display only — `id` (below) is still the full id and is
        // what must be fed back into trace/impact/explain/context.
        const projectRoot = String((registry.infrastructure as any).chronicle.getProjectDir() ?? '').toLowerCase().replace(/\/$/, '');
        // The absolute root can appear AFTER a kind prefix, not only at the start: a directory node
        // is `directory::/abs/path/src/lib`, so a `startsWith` test left it at full length and
        // `short_id` came back identical to `id` (ADR 0103). Replace the root wherever it occurs.
        const shortenId = (fullId: string): string =>
          projectRoot ? fullId.split(projectRoot + '/').join('') : fullId;

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
          // todo28#P4: exclude ATOMs (locals/fields) by default — 51% of the graph is ATOM and they
          // were crowding out the symbols a caller actually wants. include_atoms:true opts back in.
          if (!includeAtoms && node.properties?.canonicalKind === 'ATOM') continue;
          // CONTAINERS are excluded, and this is the larger half of the same problem ATOM exclusion
          // was built to solve (ADR 0103).
          //
          // `rankWeight = 1/(canonicalRank+1)` says "lower rank number is worth more", and the low
          // numbers on this ladder are the CONTAINERS: DIRECTORY 4, UNIT 5, against BEHAVIOR 8. So
          // the formula ranked a folder above every function in it. Measured on the oracle fixture,
          // `conducks_context logAudit` returned, in this order: audit.ts, caller1..6.ts, lib/,
          // domain/, and only THEN the six functions that actually call it. Nine of fifteen results
          // were files and folders, all of them above the answer.
          //
          // An agent asking for context around a symbol is already holding the file path. The same
          // reasoning is written down in `search-engine.ts`'s inventory — "an inventory answering
          // ECOSYSTEM, REPOSITORY and DIRECTORY before a single function would bury the answer under
          // the folder tree the user is already looking at" — and it was never applied here.
          if (CONTEXT_CONTAINERS.has(String(node.properties?.canonicalKind ?? ''))) continue;
          // todo28#P4: this used to read node.properties.rank — the live PageRank importance value,
          // not the taxonomy rank the "lower rank number => higher weight" comment describes. Every
          // node has some small PageRank float, so that term barely separated ATOM from BEHAVIOR from
          // STRUCTURE at all, and could even score a leaf variable above the function holding it.
          // canonicalRank (STRUCTURE 7, BEHAVIOR 8, ATOM 9 …) is the field the formula was meant to use.
          const rankWeight = 1 / ((node.properties?.canonicalRank ?? 4) + 1);
          const relevance_score = (entry.edgeWeight ?? 0.5) * (1 / (entry.depth + 1)) * rankWeight;
          const item = {
            id: node.id,
            short_id: shortenId(node.id),
            name: node.properties.name,
            kind: node.properties.canonicalKind,
            rank: node.properties.canonicalRank,
            file: node.properties.filePath,
            line: node.properties?.range?.start?.line ?? null,
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
        const items: Array<{ id: string; short_id: string; name: string; kind: string; rank: number; file: string; line: number | null; depth: number; relevance_score: number }> = [];
        let tokensUsed = 0;
        let truncated = false;

        for (const s of scored) {
          // Diminishing returns: skip if score is less than 10% of top score.
          //
          // NOT applied when the caller passed `include_atoms` — that flag exists to say "I know
          // these rank low, give them to me anyway", and this cutoff silently overrode it. With
          // `rankWeight = 1/(canonicalRank+1)` an ATOM scores 1/10 against a STRUCTURE's 1/8, which
          // puts it under 10% of the top score in any real neighbourhood, so `include_atoms: true`
          // admitted ATOMs to scoring (235 candidates -> 273) and then dropped every one of them:
          // identical output at a 20k budget and at the 100k maximum. A flag that cannot change
          // what comes back is the same absent-capability this tool file just fixed in `manifest`
          // (ADR 0063). The budget check below still bounds the response.
          if (!includeAtoms && s.relevance_score < topScore * 0.1) {
            truncated = items.length < scored.length;
            break;
          }
          if (tokensUsed + s.tokenEstimate > budget) {
            truncated = true;
            break;
          }
          items.push({
            id: s.node.id,
            short_id: shortenId(s.node.id),
            name: s.node.properties.name,
            kind: s.node.properties.canonicalKind,
            rank: s.node.properties.canonicalRank,
            file: s.node.properties.filePath,
            line: s.node.properties?.range?.start?.line ?? null,
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
        await releaseAnchor();
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
    layer: "code",
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
      // MCP4 + ADR 0047. The prefix check below is NECESSARY and was never SUFFICIENT: DuckDB's core
      // table functions read files and make network requests from inside a perfectly ordinary
      // SELECT, and this tool is driven by an LLM agent, which is steerable by content it reads.
      // Verified against this project's own vault before the guard was added:
      //
      //     SELECT * FROM read_text('/etc/hosts')     -> returned the file
      //
      // So the guard tests the CAPABILITY, not the shape of the string, and does it with an
      // allowlist: anything that is not a plain read of the vault's own tables is refused by name.
      const guardFail = sqlGuardReason(sql);
      if (guardFail) return mcpErr(guardFail.code, guardFail.message, guardFail.suggestion, false);

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
        await releaseAnchor();
      }
    }
  },

  conducks_flows: {
    id: "conducks-flows",
    name: "conducks_flows",
    layer: "code",
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
        await releaseAnchor();
      }
    }
  },

  conducks_prune: {
    id: "conducks-prune",
    name: "conducks_prune",
    layer: "code",
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
      // An unknown `type` used to reach the filter below and match nothing, so the answer was
      // `findings: []` with `summary: {ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0}, total: 0` — a
      // confident clean bill of health for the whole codebase, produced by a TYPO. The agent has no
      // way to tell that from a genuinely clean project.
      const badType = enumErr(filterType, PRUNE_TYPES, 'type');
      if (badType) return badType;

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
        await releaseAnchor();
      }
    }
  },

  // Parity: docs progress board (todo %, ADR states) parsed from the authored markdown grammar.
  conducks_docs: {
    id: "conducks-docs",
    name: "conducks_docs",
    layer: "docs",
    type: "tool",
    version: "1.0.0",
    description: `The open threads in the project's authored docs, rooted at the decisions that own
them: each ADR with unfinished work, the todo phases building it, and the next task in each — plus
what is blocked and by what. Finished work is omitted: this is the table, not the history.

A SUMMARY AND LINKS, NOT A REPLACEMENT: every entry is an address (todo09#P2, a file path) or a
state. Open the todo or the ADR before acting on it.

layer="all" (default) also returns the constraints to load once per session — conventions (rules)
and memory (gotchas), compacted to one line each. layer="board" omits them for repeat calls.

MONOREPO: a repo that keeps a docs/ per deployable unit returns {trees:{"(root)":…, "app":…}} —
one board per tree, kept SEPARATE because an address like todo01#P2 only resolves inside its own
tree and merging them would lose which unit each belongs to. A single-repo project returns the board
directly, unwrapped. scope="root" forces the single-tree shape and, like docs-lint --root-only, skips
cross-tree address checks since no other tree is loaded to check against. scope="<unit path>" reads
one unit but every tree is still built and cross-checked first, so a cross-tree address inside that
unit is still resolved correctly.

WHEN TO USE: at session start, and whenever you pick up work — "what is on the table, what is
waiting, which decisions still have unbuilt parts" without opening every doc.`,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional: the project root." },
        layer: { type: "string", enum: ["all", "board"], description: "all = threads + constraints (session start). board = open threads only." },
        recent: { type: "number", description: "How many recent decisions to list (default 4, 0 for none). Derived from ADR dates — there is no progress file." },
        raw: { type: "boolean", description: "Return the full unprojected board (every doc, every entry). Large." },
        scope: { type: "string", description: "Monorepo only. Omit for every tree (root + each unit). 'root' = the root tree alone. A unit path ('app', 'packages/core') = that unit alone." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ path: customPath, layer, recent, raw, scope }: any) => {
      try {
        // DOCS LAYER: markdown only. No anchor, no graph, no DuckDB — this answers on a folder that
        // was never analyzed, and takes no connection for another agent to queue behind.
        const root = resolveDocsRoot(customPath);
        const depth = typeof recent === "number" ? recent : 4;
        const project = (board: ReturnType<typeof registry.docs.trees>[number]["board"]) => raw
          ? board
          : registry.docs.viewOf(board, layer === "board" ? "board" : "all", depth);

        // Every docs tree, ALWAYS, WITH both docs checks already applied (the merged lint is what
        // makes `board.lint.length` — `agentView`'s `health.grammarViolations` — correct here too). A
        // monorepo hides most of its authored intent in unit folders, and a tool that silently reads
        // only the root reports a fraction of the open work as if it were all of it — the same failure
        // the CLI had.
        let trees = registry.docs.trees(root);

        // `scope` narrows only what is RETURNED, never what is built — and `"root"` is not special,
        // it is just one more tree label. Every tree is built and cross-checked first, so an address
        // that names another tree is still resolved against the full set. Building the scoped tree
        // alone would make a broken `admin:todo99` read as clean purely because `admin` was never
        // loaded — the "silently reports clean" failure this whole layer exists to avoid. That costs
        // one pass over the other trees; reporting a dangling address as fine costs more.
        if (typeof scope === "string" && scope.length > 0) {
          const label = scope === "root" ? "(root)" : scope;
          const hit = trees.find(t => t.label === label);
          if (!hit) {
            return mcpErr('UNKNOWN_SCOPE', `No docs tree "${scope}".`,
              `Available: ${trees.map(t => t.label).join(", ")}.`, false);
          }
          trees = [hit];
        }

        // Single tree — including every non-monorepo project — returns the board directly, so the
        // common shape never changes and no caller has to unwrap a one-entry map.
        if (trees.length === 1) {
          const one = project(trees[0].board);
          const count = raw
            ? (one as any).todos.length + (one as any).decisions.length
            : ((one as any).open as unknown[]).length + ((one as any).unlinkedWork as unknown[]).length;
          return mcpOk(one, { nodeCount: count });
        }

        const byTree: Record<string, unknown> = {};
        let nodeCount = 0;
        for (const { label, board } of trees) {
          const view = project(board);
          byTree[label] = view;
          nodeCount += raw
            ? (view as any).todos.length + (view as any).decisions.length
            : ((view as any).open as unknown[]).length + ((view as any).unlinkedWork as unknown[]).length;
        }
        return mcpOk({ monorepo: true, trees: byTree }, { nodeCount });
      } catch (err: any) {
        return mcpErr('DOCS_FAILED', err.message, 'Check the docs/ folder follows the conducks-docs grammar.', true);
      }
    }
  },

  // Parity: coverage overlay — range-join a coverage report onto function spans (drift detection).
  conducks_coverage: {
    id: "conducks-coverage",
    name: "conducks_coverage",
    layer: "code",
    type: "tool",
    version: "1.0.0",
    description: `Overlay an istanbul coverage-final.json onto the graph: per-function fill % and
branch coverage. A dark function (0%) with no callers is dead/forgotten code; one that was
covered and is now dark has broken.

WHEN TO USE: See which functions a test run exercised, and spot lost/untested capabilities.
Response is capped by \`limit\` (default 75) — the \`summary\` counts (total/full/dark) are always
computed over the FULL bound set, only the \`functions\` list is capped. Raise \`limit\` for more rows;
\`meta.truncated\` is honest about whether every bound function was returned.`,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        coverage: { type: "string", description: "Path to an istanbul coverage-final.json." },
        // MCP1: numeric bounds. 75 measured at ~23.3 KB on this repo's own 680-function baseline
        // (213 KB unbounded) — comfortably under the ~25 KB an MCP response can carry.
        limit: { type: "number", default: 75, minimum: 1, maximum: 500, description: "Max functions to return in the `functions` list." },
        path: { type: "string", description: "Optional: the project root." }
      },
      required: ["coverage"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ coverage, limit, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const results = await registry.coverage.bind(coverage);
        const bound = results.filter((r: any) => r.bound);
        const full = bound.filter((r: any) => r.pct >= 99).length;
        const dark = bound.filter((r: any) => r.pct === 0).length;
        const cap = Math.min(500, Math.max(1, limit ?? 75));
        const shown = bound.slice(0, cap);
        return mcpOk(
          { functions: shown, summary: { total: bound.length, full, dark } },
          { nodeCount: shown.length, truncated: shown.length < bound.length }
        );
      } catch (err: any) {
        return mcpErr('COVERAGE_FAILED', err.message, 'Run conducks analyze first, and pass a valid coverage-final.json.', true);
      } finally {
        await releaseAnchor();
      }
    }
  }
};
