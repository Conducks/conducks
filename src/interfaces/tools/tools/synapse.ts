import { Tool, FilterValidationError, FILTER_DEFAULT_LIMIT, FILTER_MAX_LIMIT } from "@/contracts/index.js";
import { registry } from "@/registry/index.js";
import { ensureAnchor, releaseAnchor, resolveDocsRoot } from "../shared/anchor.js";
import { resolveSymbolId } from "../shared/resolve-symbol.js";
import { emptyVaultAnswer } from "../shared/empty-vault.js";
import { mcpOk, mcpErr } from "@/interfaces/tools/shared/mcp-response.js";
import { verdict, verdictToJson } from "@/contracts/index.js";
import { DEAD_CODE_TYPES, DEAD_CODE_QUESTION_TYPES } from "@/contracts/index.js";

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

// `conducks_context`'s declared numeric bounds. The inputSchema and the runtime guard both read
// these, so the published contract and the enforced one cannot drift.
const CONTEXT_RADIUS_BOUNDS = { min: 1, max: 10 };
const CONTEXT_TOKEN_BOUNDS = { min: 100, max: 100000 };

// `conducks_flows`. `min_members` publishes a floor and no ceiling, so it has none here either.
const FLOWS_MIN_MEMBERS_BOUNDS = { min: 1 };
const FLOWS_LIMIT_BOUNDS = { min: 1, max: 100 };

// `conducks_coverage`. 75 rows measured at ~23.3 KB on this repo's 680-function baseline; 500 is the
// published ceiling.
const COVERAGE_LIMIT_BOUNDS = { min: 1, max: 500 };

// `conducks_prune`, as published in its inputSchema.
const PRUNE_LIMIT_BOUNDS = { min: 1, max: 200 };

// `conducks_query`, as published in its inputSchema.
const QUERY_LIMIT_BOUNDS = { min: 1, max: 500 };

// `conducks_docs raw:true`. The unbounded raw board measured 279,483 bytes on this repo — roughly 11x
// what an MCP response carries — with `truncated: false` and no cap of any kind (todo54#P2). 50 entries
// per list is the default; the ceiling is generous because `raw` exists for callers who want the lot.
const DOCS_RAW_LIMIT_BOUNDS = { min: 1, max: 500 };
const DOCS_RAW_DEFAULT_LIMIT = 50;
// An ENTRY COUNT is a poor proxy for response size here, and the measurement says so: on this repo
// `limit: 3` is 9,770 bytes and `limit: 5` is 47,608 — a docs entry is not a fixed-size row the way a
// coverage row is. So the real bound is bytes, the same technique `conducks_context` uses for its
// token budget.
//
// The budget counts COMPACT entry JSON while the response is pretty-printed, so the rendered payload
// runs about 1.5x the budget. Calibrated against the real thing rather than assumed — measured on this
// repo: budget 10,000 -> 15,135 bytes rendered, 15,000 -> 22,693, 20,000 -> 30,264. 15,000 is the
// largest that stays under the ~25 KB an MCP response carries.
const DOCS_RAW_BYTE_BOUNDS = { min: 1000, max: 200000 };
const DOCS_RAW_DEFAULT_BYTES = 15000;

/**
 * The templates the Oracle library actually holds — ASKED, never retyped.
 *
 * This was a hand-maintained Set of 21 names beside a library that had grown to 22. The extra one,
 * `type_coupling`, was listed by `mode:"template"` discovery WITH a description and parameters, and
 * then refused by this guard when called — and the refusal's suggestion said "list available
 * templates", which is the list that had just advertised it (todo53#P1).
 *
 * Still a whitelist, and still checked before execution (S2): the set of templates that EXIST is a
 * tighter bound than a copy of that set which is free to go stale in either direction.
 */
const allowedTemplates = (): Set<string> =>
  new Set(((registry.analyze.query as any).listTemplates() as Array<{ id: string }>).map(t => t.id));

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

/**
 * The modes `conducks_status` implements.
 *
 * The last unguarded enum on the surface: `mode:"JUNK"` returned the HEALTH payload byte for byte,
 * so a caller asking for `map` or `manifest` and mistyping it received a different analysis with no
 * indication — the same defect as `audit`'s unknown mode, on the tool whose own history already
 * includes `manifest` silently returning health's payload (todo28#P1, todo53#P2).
 */
const STATUS_MODES = ['health', 'map', 'manifest', 'pulse'] as const;
/** The modes `conducks_audit` actually implements, and the values its schema advertises. */
export const AUDIT_MODES = ['scan', 'advice', 'guard', 'archeology', 'fallback'] as const;
/** The modes `conducks_query` implements. */
const QUERY_MODES = ['fuzzy', 'template', 'filter'] as const;
/** The layers `conducks_docs` publishes: threads + constraints, or threads alone. */
const DOCS_LAYERS = ['all', 'board'] as const;
/**
 * The finding types `conducks_prune` can filter to, plus the unfiltered `all`.
 *
 * Derived from the domain's list rather than retyped. It used to name three of five, so
 * `UNREACHABLE_LOGIC` and `UNIMPORTED_MODULE` findings were returned but could not be filtered to
 * and were counted in no summary bucket (todo53).
 */
export const PRUNE_TYPES = [...DEAD_CODE_TYPES, 'all'] as const;

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
 * The same rule as `enumErr`, for the two domains it cannot cover: a number with declared bounds and
 * a boolean.
 *
 * A bound written only in `inputSchema` is a comment. Nothing validates it at runtime, and measured
 * on `conducks_context` (todo53#P1) the gap produced three different wrong answers from one tool:
 * `radius: 0` (schema minimum 1) returned an empty neighbourhood as a clean result, `radius: "two"`
 * made `Math.min("two", 10)` NaN — and since every comparison against NaN is false, the depth guard
 * vanished and a junk value produced the WIDEST possible walk — and `include_atoms: "yes"` failed a
 * `=== true` test, so a caller asking to include them got them excluded without a word.
 *
 * A coercion is not available here on purpose: guessing what `"two"` meant is how the silent
 * substitution starts.
 */
export function numErr(value: unknown, bounds: { min: number; max?: number }, paramName: string) {
  if (value === undefined || value === null) return null;
  const inRange = typeof value === 'number' && Number.isFinite(value)
    && value >= bounds.min && (bounds.max === undefined || value <= bounds.max);
  if (inRange) return null;
  // `max` is optional because not every bounded parameter declares one — `flows.min_members` publishes
  // a minimum and no ceiling, and inventing one here would enforce a contract the tool never made.
  const range = bounds.max === undefined ? `${bounds.min} or greater` : `between ${bounds.min} and ${bounds.max}`;
  return mcpErr(
    'INVALID_PARAM',
    `${paramName} must be a number ${range} — got ${JSON.stringify(value)}`,
    `Pass ${paramName} ${range} (or omit it for the default).`,
    false,
  );
}

export function boolErr(value: unknown, paramName: string) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return null;
  return mcpErr(
    'INVALID_PARAM',
    `${paramName} must be true or false — got ${JSON.stringify(value)}`,
    `Pass ${paramName}=true or ${paramName}=false (or omit it for the default).`,
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
        mode: { type: "string", enum: [...QUERY_MODES], default: "fuzzy", description: "Query modality." },
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
        limit: { type: "number", default: 10, minimum: QUERY_LIMIT_BOUNDS.min, maximum: QUERY_LIMIT_BOUNDS.max, description: "Max results to return." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ q, mode, template, params, filter, limit, path: customPath }: any) => {
      // `mode:"banana"` used to fall through to fuzzy, and `limit:"x"` reached DuckDB and came back
      // as `Conversion Error: Could not convert string 'x' to INT64` under a QUERY_FAILED code
      // (todo53#P1).
      const emptyQuery = await emptyVaultAnswer();
      if (emptyQuery) return mcpOk(emptyQuery, { nodeCount: 0 });

      const badParam =
        enumErr(mode, QUERY_MODES, 'mode') ??
        numErr(limit, { min: QUERY_LIMIT_BOUNDS.min, max: QUERY_LIMIT_BOUNDS.max }, 'limit');
      if (badParam) return badParam;

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
          if (!allowedTemplates().has(template)) {
            return mcpErr('UNKNOWN_TEMPLATE', `Unknown query template: ${template}`, 'Use conducks_query with mode="template" and no template param to list available templates.', false);
          }
          const rawParams = Array.isArray(params) ? params : (params ? Object.values(params) : []);
          // `limit` was never forwarded, so `execute` applied its own default of 10 and EVERY template
          // answer was capped at ten rows no matter what the caller asked for — while `truncated` was
          // the literal `false`, calling those ten the whole answer. Measured: `limit: 50` and
          // `params: {limit: 50}` both returned 10 (todo53#P2). One more than the cap, as in fuzzy, so
          // truncation is measured rather than asserted.
          const templateCap = limit ?? 10;
          const probedRows = await registry.analyze.query.execute(template as any, rawParams, templateCap + 1);
          const results = probedRows.slice(0, templateCap);
          // MCP7: pagination meta
          return mcpOk({ template, symbols: results }, { nodeCount: results.length, truncated: probedRows.length > templateCap });
        }

        // 3. [Mode: Fuzzy] Discovery - Default name/pattern search
        //
        // One MORE than the cap, so truncation is MEASURED. `truncated: false` was hard-coded here,
        // which meant a capped result set claimed to be the whole answer — the defect todo53#P2 sets
        // out to find everywhere, sitting in the most-used tool on the surface.
        const cap = limit ?? 10;
        const probed = await registry.analyze.query.execute('find_by_name', [q || '', '', ''], cap + 1);
        const results = probed.slice(0, cap);

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
          { nodeCount: symbols.length, truncated: probed.length > cap }
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
        mode: { type: "string", enum: [...STATUS_MODES], default: "health" },
        file: { type: "string", description: "The relative or absolute path of the file to pulse (for 'pulse' mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ mode, file, path: customPath }: any) => {
      // The last unguarded enum on the surface (todo53#P2): `mode:"JUNK"` returned health's payload
      // byte for byte, so a mistyped `manifest` silently became a different analysis.
      const badMode = enumErr(mode, STATUS_MODES, 'mode');
      if (badMode) return badMode;
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
        mode: { type: "string", enum: ["scan", "advice", "guard", "archeology"], default: "scan" },
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
      // ADR 0124: an empty vault is not a passing audit (todo53#P2).
      const emptyAudit = await emptyVaultAnswer();
      if (emptyAudit) return mcpOk(emptyAudit, { nodeCount: 0 });

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
        radius: { type: "number", default: 2, minimum: CONTEXT_RADIUS_BOUNDS.min, maximum: CONTEXT_RADIUS_BOUNDS.max, description: "BFS depth radius." },
        max_tokens: { type: "number", minimum: CONTEXT_TOKEN_BOUNDS.min, maximum: CONTEXT_TOKEN_BOUNDS.max, description: "Optional: max estimated token budget. If omitted, uses default 8000." },
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

      // The bounds below are the ones this tool's own inputSchema publishes. They were declared and
      // never enforced, which is how `radius: "two"` walked the whole graph (todo53#P1).
      const badParam =
        numErr(radius, { min: CONTEXT_RADIUS_BOUNDS.min, max: CONTEXT_RADIUS_BOUNDS.max }, 'radius') ??
        numErr(max_tokens, { min: CONTEXT_TOKEN_BOUNDS.min, max: CONTEXT_TOKEN_BOUNDS.max }, 'max_tokens') ??
        boolErr(include_atoms, 'include_atoms');
      if (badParam) return badParam;

      try {
        await ensureAnchor(customPath, true);
        const graph = registry.infrastructure.graphEngine.getGraph();

        const maxDepth = radius ?? 2;

        // Resolve short name to full node ID — the shared rule, which VERIFIES the id exists. This
        // used to be a fourth private copy that trusted any `::` string, so an invented id reported
        // `total_in_radius: 0` instead of refusing (todo53#P1).
        const startId = resolveSymbolId(symbol);
        if (!startId) {
          return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, `Use conducks_query to find valid symbol IDs`, false);
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

        // THE ANSWER comes from the domain now (todo57) — one scored BFS, reached through the
        // registry by both surfaces. What stays here is this tool's own bound: a byte budget, which
        // ADR 0148 names as rendering ("a token budget on the tool"). The CLI takes the same list and
        // spends a line count on it instead.
        const scoredNodes = registry.kinetic.context(startId, { radius: maxDepth, includeAtoms });
        const scored = scoredNodes.map(n => ({
          ...n,
          tokenEstimate: Math.ceil(JSON.stringify({ ...n, short_id: shortenId(n.id) }).length / 4),
        }));


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
            id: s.id,
            // `short_id` is display-only and stays HERE: it strips this project's root, which is an
            // interface concern the domain has no business knowing. `id` is the full id and is what
            // must be fed back into trace/impact/explain/context.
            short_id: shortenId(s.id),
            name: s.name,
            kind: s.kind,
            rank: s.rank,
            file: s.file,
            line: s.line,
            depth: s.depth,
            relevance_score: s.relevance_score,
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

Returns: list of flows, each with a name, entry symbol, and member count — alongside three counts that
answer different questions: "total" is every flow in the graph, "matching" is how many passed
min_members (the set the page was drawn from), and "shown" is how many came back.`,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        min_members: { type: "number", default: 2, minimum: FLOWS_MIN_MEMBERS_BOUNDS.min, description: "Only return flows with at least this many symbols. Default 2 (filters noise)." },
        limit: { type: "number", default: 20, minimum: FLOWS_LIMIT_BOUNDS.min, maximum: FLOWS_LIMIT_BOUNDS.max, description: "Max flows to return." },
        path: { type: "string", description: "Optional: absolute project root path." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ min_members, limit, path: customPath }: any) => {
      // Both bounds are published in the inputSchema above and neither was checked, so
      // `min_members: "two"` reported `shown: 0, truncated: false` against 2,878 flows (todo53#P1).
      const emptyFlows = await emptyVaultAnswer();
      if (emptyFlows) return mcpOk(emptyFlows, { nodeCount: 0 });

      const badParam =
        numErr(min_members, { min: FLOWS_MIN_MEMBERS_BOUNDS.min }, 'min_members') ??
        numErr(limit, { min: FLOWS_LIMIT_BOUNDS.min, max: FLOWS_LIMIT_BOUNDS.max }, 'limit');
      if (badParam) return badParam;

      try {
        await ensureAnchor(customPath, true);
        const processes = registry.kinetic.getProcesses();
        const minSize = min_members ?? 2;
        const cap = limit ?? 20;

        const graph = registry.infrastructure.graphEngine.getGraph();
        // The set `shown` is drawn from — reported as `matching` below. `total` counts every flow in
        // the graph and so answers a different question; publishing only `total` left a caller unable
        // to tell "20 of 2,878 flows" from "20 of the 24 that matched" (ADR 0145).
        const matched = Object.entries(processes)
          .filter(([, members]) => (members as string[]).length >= minSize);

        const flows = matched
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
          { flows, total: Object.keys(processes).length, matching: matched.length, shown: flows.length },
          { nodeCount: flows.length, truncated: flows.length < matched.length }
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
          enum: [...PRUNE_TYPES],
          default: "all",
          description: "Filter by finding type. Default returns all types."
        },
        limit: { type: "number", default: 50, minimum: PRUNE_LIMIT_BOUNDS.min, maximum: PRUNE_LIMIT_BOUNDS.max, description: "Max findings to return." },
        path: { type: "string", description: "Optional: absolute project root path." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ type: filterType, limit, path: customPath }: any) => {
      // An unknown `type` used to reach the filter below and match nothing, so the answer was
      // `findings: []` with `summary: {ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0}, total: 0` — a
      // confident clean bill of health for the whole codebase, produced by a TYPO. The agent has no
      // way to tell that from a genuinely clean project.
      const emptyPrune = await emptyVaultAnswer();
      if (emptyPrune) return mcpOk(emptyPrune, { nodeCount: 0 });

      const badType = enumErr(filterType, PRUNE_TYPES, 'type');
      if (badType) return badType;
      const badLimit = numErr(limit, { min: PRUNE_LIMIT_BOUNDS.min, max: PRUNE_LIMIT_BOUNDS.max }, 'limit');
      if (badLimit) return badLimit;

      try {
        await ensureAnchor(customPath, true);
        let findings: any[] = registry.explain.prune();

        if (filterType && filterType !== 'all') {
          findings = findings.filter((f: any) => f.type === filterType);
        }

        const cap = limit ?? 50;
        const shown = findings.slice(0, cap);

        // Every type, built FROM the list. Three were hard-coded here, so a summary of 95 sat beside
        // a total of 99 and the missing four were invisible rather than wrong-looking (todo53).
        const summary = Object.fromEntries(
          DEAD_CODE_TYPES.map(t => [t, findings.filter((f: any) => f.type === t).length]),
        ) as Record<string, number>;

        // Questions are not verdicts. `UNIMPORTED_MODULE` means "nothing imports this FILE", which is
        // as consistent with "not wired yet" as with "dead" — the CLI has always kept them apart and
        // this surface listed them beside real findings, which is the reading that gets code deleted.
        const questions = findings.filter((f: any) => DEAD_CODE_QUESTION_TYPES.includes(f.type)).length;

        return mcpOk(
          {
            findings: shown,
            summary,
            total: findings.length,
            verdicts: findings.length - questions,
            questions,
            shown: shown.length,
          },
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
        layer: { type: "string", enum: [...DOCS_LAYERS], description: "all = threads + constraints (session start). board = open threads only." },
        recent: { type: "number", description: "How many recent decisions to list (default 4, 0 for none). Derived from ADR dates — there is no progress file." },
        raw: { type: "boolean", description: "Return the full unprojected board (every doc, every entry). Large." },
        max_bytes: { type: "number", default: DOCS_RAW_DEFAULT_BYTES, minimum: DOCS_RAW_BYTE_BOUNDS.min, maximum: DOCS_RAW_BYTE_BOUNDS.max, description: "raw mode only: response byte budget. Entry counts are a poor proxy for size here — a docs entry is not a fixed-size row." },
        limit: { type: "number", default: DOCS_RAW_DEFAULT_LIMIT, minimum: DOCS_RAW_LIMIT_BOUNDS.min, maximum: DOCS_RAW_LIMIT_BOUNDS.max, description: "raw mode only: max entries per list. The raw board is otherwise unbounded and overruns the response budget." },
        scope: { type: "string", description: "Monorepo only. Omit for every tree (root + each unit). 'root' = the root tree alone. A unit path ('app', 'packages/core') = that unit alone." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ path: customPath, layer, recent, raw, scope, limit, max_bytes }: any) => {
      // Every one of these was read with a silent fallback: `layer: "banana"` returned "all" because
      // the branch was `layer === "board" ? … : "all"`, `raw: "yes"` switched the FULL board on
      // because a non-empty string is truthy, and `recent: "four"` fell back to 4 via a `typeof`
      // check. Confirmed by diffing whole payloads, not by reading the code (todo53#P1).
      const badParam =
        enumErr(layer, DOCS_LAYERS, 'layer') ??
        boolErr(raw, 'raw') ??
        numErr(recent, { min: 0 }, 'recent') ??
        numErr(limit, { min: DOCS_RAW_LIMIT_BOUNDS.min, max: DOCS_RAW_LIMIT_BOUNDS.max }, 'limit') ??
        numErr(max_bytes, { min: DOCS_RAW_BYTE_BOUNDS.min, max: DOCS_RAW_BYTE_BOUNDS.max }, 'max_bytes');
      if (badParam) return badParam;

      try {
        // DOCS LAYER: markdown only. No anchor, no graph, no DuckDB — this answers on a folder that
        // was never analyzed, and takes no connection for another agent to queue behind.
        const root = resolveDocsRoot(customPath);
        const depth = typeof recent === "number" ? recent : 4;
        // `raw` returns every entry of every doc and was UNBOUNDED — 279,483 bytes on this repo, with
        // `truncated: false` (todo54#P2). Capped per list, and `rawTruncated` records whether anything
        // was held back so `meta.truncated` is measured rather than asserted. The projected board is
        // left alone: it is already compact by construction.
        const rawCap = limit ?? DOCS_RAW_DEFAULT_LIMIT;
        let byteBudget = max_bytes ?? DOCS_RAW_DEFAULT_BYTES;
        let rawTruncated = false;
        const capRaw = (board: any) => {
          const capped: any = { ...board };
          for (const key of ['todos', 'decisions', 'other', 'lint', 'warns', 'unlinked', 'crossRefs']) {
            const list = board[key];
            if (!Array.isArray(list)) continue;
            const kept: unknown[] = [];
            for (const entry of list.slice(0, rawCap)) {
              const size = JSON.stringify(entry)?.length ?? 0;
              // Never cut mid-entry: an entry either fits whole or is held back and reported.
              if (kept.length > 0 && size > byteBudget) { rawTruncated = true; break; }
              kept.push(entry);
              byteBudget -= size;
            }
            if (kept.length < list.length) rawTruncated = true;
            capped[key] = kept;
          }
          return capped;
        };

        const project = (board: ReturnType<typeof registry.docs.trees>[number]["board"]) => raw
          ? capRaw(board)
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
          return mcpOk(one, { nodeCount: count, truncated: rawTruncated });
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
        return mcpOk({ monorepo: true, trees: byTree }, { nodeCount, truncated: rawTruncated });
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
        limit: { type: "number", default: 75, minimum: COVERAGE_LIMIT_BOUNDS.min, maximum: COVERAGE_LIMIT_BOUNDS.max, description: "Max functions to return in the `functions` list." },
        path: { type: "string", description: "Optional: the project root." }
      },
      required: ["coverage"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ coverage, limit, path: customPath }: any) => {
      // Declared 1..500 and never enforced: `limit: "x"` made `Math.max(1, "x")` NaN, and
      // `slice(0, NaN)` is empty — an empty page against 752 bound functions (todo53#P1).
      const badLimit = numErr(limit, { min: COVERAGE_LIMIT_BOUNDS.min, max: COVERAGE_LIMIT_BOUNDS.max }, 'limit');
      if (badLimit) return badLimit;

      try {
        await ensureAnchor(customPath, true);
        const results = await registry.coverage.bind(coverage);
        const bound = results.filter((r: any) => r.bound);
        const full = bound.filter((r: any) => r.pct >= 99).length;
        const darkFunctions = bound.filter((r: any) => r.pct === 0);
        const cap = limit ?? 75;
        const shown = bound.slice(0, cap);

        // ADR 0145, applied to the surface this walk caught it on. A coverage report naming only
        // symbols the graph has never seen used to answer `{total: 0, dark: 0}` — the same payload a
        // perfectly covered codebase produces. The denominator is the BOUND functions: dark ones are
        // the findings, and zero bound is `nothing-to-check`, never a pass.
        const v = verdict(
          bound.length,
          darkFunctions,
          `${results.length} function(s) in the graph were checked against the coverage report and NONE matched a file in it — the report was most likely produced from a different tree, or the graph needs \`conducks analyze\``,
        );

        return mcpOk(
          {
            ...verdictToJson(v),
            functions: shown,
            // Two different counts. `bindCoverage` walks the GRAPH's functions and marks each one
            // bound or not, so `considered` is how many were offered to the report and `total` is how
            // many the report actually covered. They differ exactly when the report and the graph
            // disagree — the case that used to be invisible behind `{total: 0, dark: 0}`.
            summary: { considered: results.length, total: bound.length, full, dark: darkFunctions.length },
          },
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
