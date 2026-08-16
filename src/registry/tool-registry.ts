import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ConducksComponent } from "@/contracts/index.js";
import { ConducksRegistry } from "./base.js";
import { registry } from "./index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tool<T = unknown> extends ConducksComponent {
  readonly type: 'tool';
  readonly name: string;
  handler: (args: T) => Promise<unknown>;
  formatter: (result: unknown) => string;
  readonly inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required?: string[];
  };
}

type CacheEntry = {
  response: ToolResponse;
  expiresAt: number;
};

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type RegistryOptions = {
  enableLogging?: boolean;
  cacheTtlMs?: number;
};

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * The ToolRegistry manages a collection of MCP-compatible tools.
 * It handles tool registration, request dispatching, and optional result caching.
 */
export class ToolRegistry extends ConducksRegistry<Tool> {
  private cache = new Map<string, CacheEntry>();
  private options: RegistryOptions;

  constructor(options: RegistryOptions = {}) {
    super();
    this.options = options;
  }

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Manually registers a single tool instance.
   */
  override register(tool: Tool): void {
    // Safety Fallback: Ensure a formatter exists to prevent MCP runtime crashes
    if (typeof tool.formatter !== 'function') {
      this.warn(`Tool "${tool.name}" is missing a formatter. Injecting default JSON formatter.`);
      (tool as any).formatter = (res: any) => JSON.stringify(res, null, 2);
    }

    // id is used for the registry, name is used for MCP
    super.register(tool);
    this.log(`registered: ${tool.name}`);
  }

  /**
   * Auto-registers all Tool-shaped exports from a module path.
   */
  async autoRegister(modulePath: string): Promise<void> {
    try {
      const mod = await import(modulePath);
      for (const key of Object.keys(mod)) {
        const candidate = mod[key];
        if (isTool(candidate)) {
          try {
            this.register(candidate);
          } catch (err) {
            this.warn(`skipped "${candidate.name}": ${errorMessage(err)}`);
          }
        }
      }
    } catch (err) {
      this.warn(`autoRegister failed for ${modulePath}: ${errorMessage(err)}`);
    }
  }

  // ── Querying ─────────────────────────────────────────────────────────────────

  /**
   * MCP has no namespaces, so the docs/code split is surfaced as a description prefix rather than a
   * tool-name change — renaming would break every skill and saved client config to say something a
   * prefix already says. `[docs]` reads markdown and needs no analysis; `[code]` answers from the
   * graph and needs a pulse first (ADR 0023).
   *
   * The code tag also states the concurrency limit, MEASURED rather than assumed (todo17 Phase 4):
   * N agents can read one vault at the same time, but a running `analyze` locks them ALL out — the
   * call fails, it does not queue. An agent that knows this waits; an agent that does not reads the
   * failure as "conducks is broken".
   */
  getTools(): MCPTool[] {
    return this.getAll().map((tool) => {
      const layer = (tool as { layer?: string }).layer ?? 'code';
      const tag = layer === 'docs'
        ? '[docs layer — authored markdown; works with no analysis, opens no database, safe for any number of concurrent agents]'
        : '[code layer — the structural graph; run `conducks analyze` first. Concurrent reads by many agents are safe, but while a pulse is WRITING the vault every read FAILS rather than queues — retry once it finishes, or use conducks_docs meanwhile]';
      return {
        name: tool.name,
        description: `${tag}\n${tool.description || ''}`,
        inputSchema: tool.inputSchema,
      };
    });
  }

  // ── Request handling ─────────────────────────────────────────────────────────

  async handleRequest(name: string, args: unknown): Promise<ToolResponse> {
    const tool = this.getAll().find(t => t.name === name);
    if (!tool) {
      return errorResponse(`Unknown tool: "${name}".`);
    }

    const cacheKey = `${name}:${JSON.stringify(args ?? {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.log(`cache hit: ${name}`);
      return cached.response;
    }

    // Take a REF-COUNTED hold, rather than closing unconditionally below.
    //
    // This `finally` used to call `persistence.close()` outright, ignoring the ref-count that
    // `anchor.ts` maintains — so with two calls in flight, whichever finished first hung up the shared
    // handle and the other returned `Database was already closed`. It is the third closer in a single
    // tool call (this one, `hypertoon`'s wrapper, and the handler's own `ensureAnchor` pair), and the
    // only one that was not counted (todo52#P2).
    registry.infrastructure.acquireVault();
    try {
      // Conducks Lazy Resonance: Initialize only for the duration of the request
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);
      
      const result = await tool.handler(args);
      const response: ToolResponse = {
        content: [{ type: "text", text: tool.formatter(result) }],
      };

      const ttl = this.options.cacheTtlMs ?? 0;
      if (ttl > 0) {
        this.cache.set(cacheKey, { response, expiresAt: Date.now() + ttl });
      }

      this.log(`executed: ${name}`);
      return response;
    } catch (err) {
      return errorResponse(errorMessage(err));
    } finally {
      // Closes only when nothing else is reading — same policy every other tool-path closer follows.
      await registry.infrastructure.releaseVault();
    }
  }

  // ── MCP wiring ───────────────────────────────────────────────────────────────

  applyTo(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleRequest(name, (args as any));
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private log(msg: string): void {
    if (this.options.enableLogging) console.info(`[ToolRegistry] ${msg}`);
  }

  private warn(msg: string): void {
    if (this.options.enableLogging) console.error(`[ToolRegistry] ${msg}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTool(candidate: unknown): candidate is Tool {
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof (candidate as any).name === "string" &&
    typeof (candidate as any).handler === "function"
    // formatter is now mandatory in type, but we allow its absence here to repair it in register()
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: `❌ ${message}` }],
    isError: true,
  };
}