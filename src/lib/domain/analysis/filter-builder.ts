/**
 * Conducks — Filter Builder
 *
 * Typed filter object -> parameterised SQL, for `conducks_query` mode `'filter'`. This is the
 * ONLY way an agent shapes a WHERE clause without a raw SQL surface: field names and operators
 * are checked against fixed allowlists (never interpolated from caller input), and every value
 * is always bound through a `?` placeholder.
 *
 * Why this exists: the MCP query tool (this same `synapse.ts`) previously took a template name
 * and interpolated it — fixed by a strict whitelist + parameterisation (S2, docs/todos/completed/
 * todo03.md). `purgeUnits` had the same class of bug on a DELETE (S3). Filter mode gives agents
 * expressive ad-hoc queries (arbitrary field/operator/value combinations) while keeping the exact
 * guarantee those fixes established: caller input never becomes SQL text, only ever a bound value.
 *
 * Layer: domain/analysis, alongside query-service.ts (the other module that turns structural
 * questions into SQL against `nodes`). Sibling to query-service's fixed templates, not a
 * replacement for them — this module only ever composes a single, bounded `WHERE ... LIMIT ?`
 * shape; it is not a general query language (docs/modules/domain/analysis/MODULE.md explicitly
 * defers that). `synapse.ts` (interfaces/tools) already imports domain/analysis modules directly
 * for computation that doesn't need the registry's composed services (see docs-board.js in the
 * same file); this follows that established precedent rather than routing through the registry
 * for what is a pure, stateless compile step.
 */

// Explicit allowlist of `nodes` columns safe to filter on (see the CREATE TABLE in
// src/lib/core/persistence/persistence.ts). JSON blobs (dna, signature, kinetic, metadata) and
// internal bookkeeping columns (pulseId, fingerprint, rootId, layer_path) are deliberately
// excluded — they either need json_extract (a different shape) or leak internal state.
export const FILTERABLE_FIELDS = new Set([
  'id', 'name', 'file', 'canonicalKind', 'canonicalRank', 'namespaceId', 'unitId',
  'structureId', 'parentId', 'depth', 'risk', 'gravity', 'complexity', 'isEntryPoint',
  'visibility', 'lineStart', 'lineEnd',
  // `doc` is the author's own description, harvested from the comment above a symbol (ADR 0133).
  // It was missing from this list, which meant conducks could not be asked which of ITS OWN nodes
  // carry no documentation — every doc-gap measurement in the ADR 0150 campaign had to be a direct
  // vault read instead, and the tool could not produce its own cleanup list. One line, and the
  // reason it is worth a line: a code-intelligence tool that cannot answer a question about itself
  // is one nobody can check.
  'doc',
]);

// Fixed operator token -> SQL text. The caller's operator is looked up here, never concatenated
// directly — so an operator string can never itself carry SQL through untouched (e.g. an
// operator of "; DELETE" simply fails the `in` check below rather than reaching a query string).
const OPERATOR_SQL: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  in: 'IN',
};

export type FilterOperator = keyof typeof OPERATOR_SQL;

export interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | boolean | Array<string | number>;
}

export interface QueryFilter {
  conditions: FilterCondition[];
  limit?: number;
}

// The error and the budget are shared vocabulary and live in `contracts` — both domain (which
// throws and enforces) and the interfaces (which catch and clamp) must be able to name them.
// Re-exported here so the compiler and its vocabulary still arrive together for domain callers.
export { FilterValidationError, FILTER_MAX_LIMIT, FILTER_DEFAULT_LIMIT } from "@/contracts/index.js";
import { FilterValidationError, FILTER_MAX_LIMIT, FILTER_DEFAULT_LIMIT } from "@/contracts/index.js";

/**
 * Validate a typed filter and compile it to parameterised SQL. Throws FilterValidationError on
 * any unknown field, unknown operator, or malformed value — it never falls back to passing
 * caller input through unchecked.
 */
export function buildFilterQuery(filter: QueryFilter): { sql: string; params: unknown[] } {
  if (!filter || typeof filter !== 'object') {
    throw new FilterValidationError('filter must be an object with a "conditions" array');
  }
  if (!Array.isArray(filter.conditions) || filter.conditions.length === 0) {
    throw new FilterValidationError('filter.conditions must be a non-empty array');
  }
  if (filter.conditions.length > 10) {
    throw new FilterValidationError('filter.conditions accepts at most 10 conditions');
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const cond of filter.conditions) {
    if (!cond || typeof cond.field !== 'string' || !FILTERABLE_FIELDS.has(cond.field)) {
      throw new FilterValidationError(`Unknown filter field: ${JSON.stringify(cond?.field)}`);
    }
    if (typeof cond.operator !== 'string' || !Object.prototype.hasOwnProperty.call(OPERATOR_SQL, cond.operator)) {
      throw new FilterValidationError(`Unknown filter operator: ${JSON.stringify(cond?.operator)}`);
    }

    const field = cond.field; // safe: validated against FILTERABLE_FIELDS above
    const sqlOp = OPERATOR_SQL[cond.operator]; // safe: looked up from the fixed map above

    if (cond.operator === 'in') {
      if (!Array.isArray(cond.value) || cond.value.length === 0) {
        throw new FilterValidationError(`Operator "in" requires a non-empty array value for field "${field}"`);
      }
      if (cond.value.length > 50) {
        throw new FilterValidationError(`Operator "in" accepts at most 50 values for field "${field}"`);
      }
      for (const v of cond.value) {
        if (typeof v !== 'string' && typeof v !== 'number') {
          throw new FilterValidationError(`Operator "in" values must be string or number for field "${field}"`);
        }
      }
      const placeholders = cond.value.map(() => '?').join(', ');
      clauses.push(`${field} IN (${placeholders})`);
      params.push(...cond.value);
    } else {
      if (Array.isArray(cond.value)) {
        throw new FilterValidationError(`Operator "${cond.operator}" does not accept an array value for field "${field}"`);
      }
      if (typeof cond.value !== 'string' && typeof cond.value !== 'number' && typeof cond.value !== 'boolean') {
        throw new FilterValidationError(`Unsupported value type for field "${field}"`);
      }
      clauses.push(`${field} ${sqlOp} ?`);
      params.push(cond.value);
    }
  }

  const limit = Math.min(Math.max(1, filter.limit ?? FILTER_DEFAULT_LIMIT), FILTER_MAX_LIMIT);

  // Fixed column list, fixed table, fixed clause shape — the only variable parts are the
  // validated field/operator tokens spliced in above and the `?`-bound values/limit.
  const sql = `
    SELECT id, name, file, canonicalKind, canonicalRank, risk, gravity
    FROM nodes
    WHERE ${clauses.join(' AND ')}
    ORDER BY risk DESC
    LIMIT ?
  `;
  params.push(limit);

  return { sql, params };
}
