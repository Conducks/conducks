import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";

import { ToolRegistry } from "./core/tool-registry.js";
import { DynamicToolLoader } from "./core/dynamic-loader.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools-structure lives one level up from build/ (compiled) or in the root from src/
const TOOLS_DATA_DIR = path.resolve(__dirname, "../tools-structure");

/**
 * Main entry point for the CONDUCKS MCP server.
 * Bootstraps the server using configuration from the tools-structure directory.
 */
async function main() {
  const isSSE = process.argv.includes("--sse");
  const port = parseInt(process.env.PORT || "3001", 10);

  // Load config first — server name, version, and title come from
  // tools-data/conducks.config.json, not from this file.
  const loader = new DynamicToolLoader(TOOLS_DATA_DIR);
  const config = await loader.loadConfig();

  const server = new Server(
    {
      name: config.server.name,
      version: config.server.version,
      title: config.server.title,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools discovered from the filesystem
  const registry = new ToolRegistry({ enableLogging: true });
  const tools = await loader.loadTools();

  for (const tool of tools) {
    registry.register(tool);
  }

  // Wire registry into the MCP server
  registry.applyTo(server);

  // Start
  if (isSSE) {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport | null = null;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      }
    });

    app.listen(port, () => {
      console.error(
        `${config.server.title} v${config.server.version} running on SSE (port ${port}) — ${tools.length} tools loaded`
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
      `${config.server.title} v${config.server.version} running on stdio — ${tools.length} tools loaded`
    );
  }
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});