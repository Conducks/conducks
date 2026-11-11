/**
 * Conducks — the shape every MCP tool answers in.
 *
 * ONE envelope, so a caller can tell an empty result from a failed one without reading each tool's
 * prose. `mcpErr` carries a `retryable` flag because an agent's next move differs: retry a lock, do
 * not retry a symbol that does not exist.
 *
 * Lives with the MCP surface rather than in `contracts/`, because only the MCP surface uses it — a
 * type used by one feature belongs to that feature (ADR 0150 rule 5, read the other way).
 */
/** What the answer was computed FROM — the denominator ADR 0124 requires beside any count. */
export interface McpMeta {
  nodeCount?: number;
  edgeCount?: number;
  truncated: boolean;
  tokensUsed?: number;
  confidence?: number;
}

/** A failure a caller can act on: `retryable` says whether trying again could possibly help. */
export interface McpError {
  code: string;
  message: string;
  retryable: boolean;
  suggestion?: string;
}

/**
 * DATA OR ERROR, never both and never neither. A union rather than an optional-error object, so a
 * caller cannot read `data` from a failed call and get `undefined` that reads as an empty result.
 */
export type McpResponse<T> =
  | { data: T; meta: McpMeta }
  | { error: McpError };

/** A success. `truncated: false` is the default so a tool must OPT IN to claiming it cut the answer. */
export function mcpOk<T>(data: T, meta?: Partial<McpMeta>): McpResponse<T> {
  return { data, meta: { truncated: false, ...meta } };
}

/**
 * A failure. `retryable` defaults to FALSE, deliberately: an agent that retries a permanent error
 * loops, and the cost of not retrying a transient one is a single extra call the user can make.
 */
export function mcpErr(code: string, message: string, suggestion?: string, retryable = false): McpResponse<never> {
  return { error: { code, message, retryable, suggestion } };
}

/**
 * Every tool's answer as an agent reads it: compact JSON, paths relative to the project root.
 *
 * Each node used to carry its path three times (absolute `id`, `short_id`, absolute `file`) in
 * indented JSON; `context` on one class came to about 7,500 tokens (todo82). The root is cut from
 * every string and stated once as `meta.root`, so nothing is lost: every tool accepts a relative id
 * (`tryResolveSymbol` matches it as a path suffix). `short_id` is dropped when it equals the
 * shortened `id`. A path outside the root stays absolute.
 */
export function formatAnswer(res: unknown, root: string | null | undefined): string {
  const base = (root ?? '').replace(/[\\/]+$/, '');
  if (!base) return JSON.stringify(res);
  const prefix = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/', 'gi');
  let cut = false;
  const json = JSON.stringify(res, function (key, value) {
    if (typeof value === 'string') {
      const short = value.replace(prefix, '');
      if (short !== value) cut = true;
      return short;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)
        && typeof value.id === 'string' && typeof value.short_id === 'string'
        && value.id.replace(prefix, '') === value.short_id) {
      const { short_id: _drop, ...rest } = value;
      return rest;
    }
    return value;
  });
  const out = tabulate(JSON.parse(json)) as any;
  if (!cut) return JSON.stringify(out);
  if (out && typeof out === 'object' && out.meta && typeof out.meta === 'object') out.meta.root = base;
  else if (out && typeof out === 'object' && !Array.isArray(out)) out.root = base;
  else return JSON.stringify({ root: base, answer: out });
  return JSON.stringify(out);
}

/**
 * A list of 3+ objects that share one key set, holding only primitives or arrays of them, becomes
 * `{ cols, rows }`: the keys once, then one array per item in column order. Node lists repeat about
 * nine keys per item; written once they cost about a third less (todo82; the TOON format makes the
 * same trade). A value of `undefined` cannot occur here, because the input came out of JSON.parse.
 */
function tabulate(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(tabulate);
    if (items.length >= 3 && items.every(isFlatRecord)) {
      const cols = Object.keys(items[0] as object);
      const same = items.every(o => { const k = Object.keys(o as object); return k.length === cols.length && k.every((x, i) => x === cols[i]); });
      if (same) return { cols, rows: items.map(o => cols.map(c => (o as Record<string, unknown>)[c])) };
    }
    return items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tabulate(v)]));
  }
  return value;
}

function isFlatRecord(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v as object).every(x => x === null || typeof x !== 'object'
      || (Array.isArray(x) && x.every(y => y === null || typeof y !== 'object')));
}
