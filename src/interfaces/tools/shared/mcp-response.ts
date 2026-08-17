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
