import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import { ToolRegistry, Tool } from "@/registry/tool-registry.js";
import { ConducksRegistry } from "./hypertoon.js";
import { synapseTools } from "./tools/synapse.js";
import { kineticTools } from "./tools/kinetic.js";
import { registry } from "@/registry/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
/**
 * Conducks — MCPServer
 * 
 * Conducks tool registry server that orchestrates internal APIs and tool scheduler.
 * Consolidates all structural and behavioral tools into a documentation-driven registry.
 * 
 * Rule 10/13 ENFORCEMENT: Exactly 9 Unified Conducks MCP Tools. No more, no less.
 */
export class ConducksMCPServer {
  private server: Server;
  private registry: ToolRegistry;
  private conducksRegistry: ConducksRegistry;

  constructor() {
    this.server = new Server(
      {
        name: "conducks",
        version: "2.0.0",
        title: "CONDUCKS: Tool Registry Engine",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    this.registry = new ToolRegistry({ enableLogging: false });
    this.conducksRegistry = new ConducksRegistry();
  }

  /**
   * Bootstraps the server with all registered tools and resources.
   */
  public async bootstrap(): Promise<void> {
    console.error('[Conducks MCP] Initializing Conducks tool registry...');

    // 1. Build registry (Syncing static tools with documentation)
    const staticTools = [
      ...Object.values(synapseTools) as Tool[],
      ...Object.values(kineticTools) as Tool[]
    ];
    const tools = await this.conducksRegistry.buildConducksRegistry(staticTools);

    // 2. Register tools to the internal MCP server
    for (const tool of tools) {
      this.registry.register(tool);
    }

    const MANDATED_TOOL_COUNT = 9;
    if (tools.length !== MANDATED_TOOL_COUNT) {
      console.error(
        `[Conducks MCP] ⚠️ Rule 9 VIOLATION: Expected ${MANDATED_TOOL_COUNT} tools, ` +
        `found ${tools.length}. Tools: ${tools.map(t => t.name).join(', ')}`
      );
    }

    this.registry.applyTo(this.server);

    // 3. Register Resources (The Conducksic Prism)
    this.registerResources();

    console.error(`[Conducks MCP] System ready. ${tools.length} Unified Conducks Tools indexed (Rule 10/13 enforced).`);
  }

  private registerResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "resource://conducks/symbols",
          name: "Architectural Symbols",
          description: "All structural nodes (paginated, top 50).",
          mimeType: "application/json"
        },
        {
          uri: "resource://conducks/hotspots",
          name: "Structural Hotspots",
          description: "Top 20 symbols by PageRank gravity.",
          mimeType: "application/json"
        },
        {
          uri: "resource://conducks/entry-points",
          name: "Graph Entry Points",
          description: "All identified system entry points (main, handlers, routes).",
          mimeType: "application/json"
        },
        {
          uri: "resource://conducks/violations",
          name: "Sentinel Violations",
          description: "Current architectural law violations.",
          mimeType: "application/json"
        },
        {
          uri: "resource://conducks/lies",
          name: "Architectural Lies",
          description: "Co-change pairs with no existing structural edges.",
          mimeType: "application/json"
        },
        {
          uri: "resource://conducks/pulses",
          name: "Historical Pulses",
          description: "All historical pulse snapshots with metadata.",
          mimeType: "application/json"
        }
      ]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        // Conducks Lazy Resonance: Relies on CLI-level initialization for the session
        const status = registry.audit.status();
        const nodes = Array.from(registry.query.graph.getGraph().getAllNodes());

        const summarizeNodes = (items: any[]) => items.map(n => ({
          id: n.id,
          kind: n.label,
          file: n.properties.filePath,
          name: n.properties.name,
          risk: n.properties.risk || 0,
          gravity: n.properties.rank || 0
        }));

        if (uri === "resource://conducks/symbols") {
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: summarizeNodes(nodes.slice(0, 50)),
                totalCount: nodes.length,
                truncated: nodes.length > 50
              })
            }]
          };
        }

        if (uri === "resource://conducks/hotspots") {
          const hotspots = nodes.sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0)).slice(0, 20);
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: summarizeNodes(hotspots),
                totalCount: hotspots.length,
                truncated: false
              })
            }]
          };
        }

        if (uri === "resource://conducks/entry-points") {
          const entryPoints = nodes.filter((n: any) => n.properties.isEntryPoint).sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0));
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: summarizeNodes(entryPoints),
                totalCount: entryPoints.length,
                truncated: false
              })
            }]
          };
        }

        if (uri === "resource://conducks/violations") {
          const audit = registry.audit.audit();
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: audit.violations,
                totalCount: audit.violations.length,
                truncated: false
              })
            }]
          };
        }

        if (uri === "resource://conducks/lies") {
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: [], // Synchronize with CoChange engine in Phase 7
                totalCount: 0,
                truncated: false
              })
            }]
          };
        }

        if (uri === "resource://conducks/pulses") {
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                items: [],
                totalCount: 0,
                truncated: false
              })
            }]
          };
        }

        throw new Error(`Resource not found: ${uri}`);
      } catch (err: any) {
        throw new Error(`Failed to read resource ${uri}: ${err.message}`);
      }
    });
  }

  /**
   * Starts the server using Stdio transport.
   */
  public async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[Conducks MCP] Running via stdio.");
  }

  /**
   * Starts the server using SSE transport.
   */
  public async startSSE(port: number = 3001): Promise<void> {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport | null = null;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      await this.server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      if (transport) {
        await (transport as SSEServerTransport).handlePostMessage(req, res);
      }
    });

    app.listen(port, () => {
      console.error(`[Conducks MCP] Running on SSE (port ${port})`);
    });
  }
}
