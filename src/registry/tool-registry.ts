import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ConducksComponent } from "./types.js";
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

  getTools(): MCPTool[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema,
    }));
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
      // Release the structural lock to allow parallel analysis
      await registry.infrastructure.persistence.close();
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
    typeof (candidate as Tool).name === "string" &&
    typeof (candidate as Tool).handler === "function" &&
    typeof (candidate as Tool).formatter === "function"
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