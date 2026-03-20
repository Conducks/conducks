import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tool<T = any> {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required?: string[];
  };
  handler: (args: T) => Promise<unknown>;
  formatter: (result: unknown) => string;
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

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private cache = new Map<string, CacheEntry>();
  private options: RegistryOptions;

  constructor(options: RegistryOptions = {}) {
    this.options = options;
  }

  // ── Registration ────────────────────────────────────────────────────────────

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
    this.log(`registered tool: ${tool.name}`);
  }

  // Auto-register all Tool-shaped exports from a module path.
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
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  // ── Request handling ─────────────────────────────────────────────────────────

  async handleRequest(name: string, args: unknown): Promise<ToolResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResponse(`Unknown tool: "${name}"`);
    }

    const cacheKey = `${name}:${JSON.stringify(args ?? {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.log(`cache hit: ${name}`);
      return cached.response;
    }

    try {
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
    }
  }

  // ── MCP wiring ───────────────────────────────────────────────────────────────

  applyTo(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleRequest(name, args);
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private log(msg: string): void {
    if (this.options.enableLogging) console.info(`[ToolRegistry] ${msg}`);
  }

  private warn(msg: string): void {
    if (this.options.enableLogging) console.warn(`[ToolRegistry] ${msg}`);
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
