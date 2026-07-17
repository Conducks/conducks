export interface McpMeta {
  nodeCount?: number;
  edgeCount?: number;
  truncated: boolean;
  tokensUsed?: number;
  confidence?: number;
}

export interface McpError {
  code: string;
  message: string;
  retryable: boolean;
  suggestion?: string;
}

export type McpResponse<T> =
  | { data: T; meta: McpMeta }
  | { error: McpError };

export interface McpPagination {
  offset: number;
  limit: number;
  total?: number;
}

export function mcpOk<T>(data: T, meta?: Partial<McpMeta>): McpResponse<T> {
  return { data, meta: { truncated: false, ...meta } };
}

export function mcpErr(code: string, message: string, suggestion?: string, retryable = false): McpResponse<never> {
  return { error: { code, message, retryable, suggestion } };
}
