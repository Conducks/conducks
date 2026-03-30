import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import { ToolRegistry, Tool } from "../../core/registry/tool-registry.js";
import { HyperToonRegistry } from "./hypertoon.js";
import { synapseTools } from "./tools/synapse.js";
import { kineticTools } from "./tools/kinetic.js";
import { conducks } from "../../../src/conducks-core.js";
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DAACClustering } from "../../core/algorithms/clustering/daac.js";

/**
 * Conducks — MCPServer
 * 
 * High-fidelity 'HyperToon' server that orchestrates the Apostle v6 interface.
 * Consolidates all structural and behavioral tools into a documentation-driven registry.
 */
export class ConducksMCPServer {
  private server: Server;
  private registry: ToolRegistry;
  private hypertoon: HyperToonRegistry;

  constructor() {
    this.server = new Server(
      {
        name: "conducks",
        version: "2.0.0",
        title: "CONDUCKS: Apostle v6 HyperToon Engine",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    this.registry = new ToolRegistry({ enableLogging: true });
    this.hypertoon = new HyperToonRegistry();
  }

  /**
   * Bootstraps the server with all registered tools and resources.
   */
  public async bootstrap(): Promise<void> {
    console.error('[Conducks MCP] Bootstrapping Apostle v6 HyperToon Registry...');
    
    // 1. Build hypertoon registry (Syncing static tools with documentation)
    const staticTools = [
      ...Object.values(synapseTools) as Tool[], 
      ...Object.values(kineticTools) as Tool[]
    ];
    const tools = await this.hypertoon.buildApostolicRegistry(staticTools);
    
    // 2. Register tools to the internal MCP server
    for (const tool of tools) {
      this.registry.register(tool);
    }
    this.registry.applyTo(this.server);

    // 3. Register Resources (The Apostolic Prism)
    this.registerResources();

    console.error(`[Conducks MCP] System ready. ${tools.length} HyperToon tools indexed.`);
  }

  private registerResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "conducks://graph/context",
          name: "Graph Global Health",
          description: "Structural integrity and graph density overview.",
          mimeType: "text/markdown"
        },
        {
          uri: "conducks://graph/blueprint",
          name: "AI-Native Blueprint",
          description: "The authoritative structural manifest.",
          mimeType: "text/markdown"
        }
      ]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      const status = conducks.status();

      if (uri === "conducks://graph/context") {
        return {
          contents: [{
            uri,
            mimeType: "text/markdown",
            text: `## Graph Health Context\n- **Project**: ${status.projectName}\n- **Version**: ${status.version}\n- **Nodes**: ${status.stats.nodeCount}\n- **Edges**: ${status.stats.edgeCount}`
          }]
        };
      }

      if (uri === "conducks://graph/blueprint") {
          return {
            contents: [{
              uri,
              mimeType: "text/markdown",
              text: `## Conducks Blueprint\nThis project follows the Gospel of Technology (Apostle v6).\nNodes: ${status.stats.nodeCount}\nDensity: ${status.stats.density}`
            }]
          };
      }

      throw new Error(`Resource not found: ${uri}`);
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
