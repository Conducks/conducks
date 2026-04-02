import { fileURLToPath } from "node:url";
import path from "node:path";
import { registry } from "@/registry/index.js";
import { Logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Synapse Tools Entry (MCP Server)
 * 
 * Standard entry point for the Conducks Model Context Protocol server.
 */
export async function main() {
  // Safeguard: Redirect all standard console methods to stderr to prevent stdout corruption
  const silence = (...args: any[]) => console.error(...args);
  console.log = silence;
  console.info = silence;
  console.warn = silence;
  console.debug = silence;

  const logger = new Logger("Synapse Tools");
  logger.info(`Starting MCP Server (CWD: ${process.cwd()})`);

  // Conducks: Late-Binding Registry Initialization
  // Ensures the structural synapse is anchored before tools are registered.
  try {
    await registry.initialize(true);
    logger.success(`Structural Synapse Anchored @ ${registry.infrastructure.chronicle.getProjectDir()}`);
  } catch (err: any) {
    logger.error(`Failed to anchor Synapse: ${err.message}`);
  }

  // Dynamic import ensures that the ConducksMCPServer (and its dependencies)
  // are only loaded AFTER console.log has been silenced.
  const { ConducksMCPServer } = await import("./server.js");

  const server = new ConducksMCPServer();
  await server.bootstrap();

  if (process.argv.includes("--sse")) {
    await server.startSSE();
  } else {
    // Default: Stdio Transport
    await server.startStdio();
    logger.success("Intelligence Layer Synchronized (MCP Ready)");
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard isMain detection for ESM
const isMain = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1] === path.resolve(__dirname, "../../interfaces/tools/index.js") ||
  process.argv[1].endsWith('conducks/src/interfaces/tools/index.ts')
);

if (isMain) {
  main().catch(err => {
    process.stderr.write(`[Conducks Tools] Fatal Synapse Error: ${err.stack}\n`);
    process.exit(1);
  });
}