import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ToolRegistry } from "../lib/core/registry/tool-registry.js";
import { DynamicToolLoader } from "../lib/core/registry/dynamic-loader.js";
import { conducks } from "./conducks-core.js";

// Core Layer Tools
import * as docTools from "../lib/product/tools/documentation-tools.js";
import * as synapseTools from "../lib/product/tools/coding-tools.js";
import * as kineticTools from "../lib/product/tools/kinetic-tools.js";
import { DAACClustering } from "../lib/core/algorithms/clustering/daac.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools-structure lives one level up from build/ (compiled) or in the root from src/
const TOOLS_DATA_DIR = path.resolve(__dirname, "../tools-structure");

/**
 * Main entry point for the CONDUCKS MCP server.
 * Bootstraps the server using configuration from the tools-structure directory.
 */
async function main() {
  // Apostolic Silence: Redirect all logs to stderr to keep stdout pure for MCP stdio
  console.log = console.error;

  const isSSE = process.argv.includes("--sse");
  const port = parseInt(process.env.PORT || "3001", 10);

  // Load config first
  const loader = new DynamicToolLoader(TOOLS_DATA_DIR);
  const config = await loader.loadConfig();

  // Conducks Intelligence Layer initialization
  console.error('[Conducks] Initializing Apostolic Intelligence...');
  const status = conducks.status();
  console.error(`[Conducks] Ready with ${status.stats.nodeCount} symbols mapped.`);

  const server = new Server(
    {
      name: config.server.name,
      version: config.server.version,
      title: config.server.title,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register all tools flatly as the "Apostolic Registry"
  const registry = new ToolRegistry({ enableLogging: true });
  
  // 1. Load Dynamic Tools from filesystem
  const dynamicTools = await loader.loadTools();
  for (const tool of dynamicTools) {
    registry.register(tool);
  }

  // 2. Register Foundation Layers (Expert Intelligence)
  const layers = [
    { name: 'Synapse (Coding)', mod: synapseTools },
    { name: 'Kinetic (Behavior)', mod: kineticTools }
  ];

  layers.forEach(layer => {
    let count = 0;
    Object.values(layer.mod).forEach(tool => {
      // Validate tool shape before registration
      if (typeof tool === 'object' && tool !== null && 'name' in tool && 'handler' in tool) {
        try {
          registry.register(tool as any);
          count++;
        } catch (err) {
          console.error(`[Conducks] Warning: Failed to register tool "${(tool as any).name}": ${err}`);
        }
      }
    });
    console.error(`[Conducks] Registered ${count} tools from ${layer.name} layer.`);
  });

  // Wire registry into the MCP server
  registry.applyTo(server);

  // ─── Resource Layer (conducks://) ──────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "conducks://graph/context",
        name: "Graph Global Health",
        description: "360-degree overview of the project's structural integrity and graph density.",
        mimeType: "text/markdown"
      },
      {
        uri: "conducks://graph/communities",
        name: "Functional Mapping (DAAC)",
        description: "List of all cohesive functional communities detected via graph-theoretic clustering.",
        mimeType: "text/markdown"
      },
      {
        uri: "conducks://graph/blueprint",
        name: "AI-Native Blueprint",
        description: "The authoritative structural manifest for AI agents. Read this to understand the codebase mission.",
        mimeType: "text/markdown"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
    const { uri } = request.params;
    const currentStatus = conducks.status();

    if (uri === "conducks://graph/context") {
      return {
        contents: [{
          uri,
          mimeType: "text/markdown",
          text: `## Graph Global Context\n- **Project**: ${currentStatus.projectName}\n- **Version**: ${currentStatus.version}\n- **Symbols**: ${currentStatus.stats.nodeCount}\n- **Relationships**: ${currentStatus.stats.edgeCount}\n- **Density**: ${currentStatus.stats.density.toFixed(6)}\n- **Status**: ${currentStatus.status}`
        }]
      };
    }

    if (uri === "conducks://graph/communities") {
      const daac = new DAACClustering();
      const clusters = daac.cluster(conducks.graph.getGraph());
      return {
        contents: [{
          uri,
          mimeType: "text/markdown",
          text: `## DAAC Community Mapping\nFound **${clusters.size}** cohesive communities.\n\n${Array.from(clusters.keys()).map(k => `- **${k}**`).join('\n')}`
        }]
      };
    }

    if (uri === "conducks://graph/blueprint") {
      return {
        contents: [{
          uri,
          mimeType: "text/markdown",
          text: `## Conducks Blueprint\nThis project follows the **Gospel of Technology** architecture.\n\n**Layers:**\n- Shell (src/)\n- Domain (lib/product/)\n- Core (lib/core/)\n\n**Mission:** ${config.server.title} is designed for autonomous structural intelligence.`
        }]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  // Start logic
  if (isSSE) {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport | null = null;

    app.get("/sse", async (req: any, res: any) => {
      transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    });

    app.post("/messages", async (req: any, res: any) => {
      if (transport) {
        await (transport as SSEServerTransport).handlePostMessage(req, res);
      }
    });

    app.listen(port, () => {
      console.error(
        `${config.server.title} v${config.server.version} running on SSE (port ${port}) — ${registry.getTools().length} tools / 3 resources loaded`
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
      `${config.server.title} v${config.server.version} running on stdio — ${registry.getTools().length} tools / 3 resources loaded`
    );
  }
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});