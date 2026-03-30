import { fileURLToPath } from "node:url";
import path from "node:path";
import { registry } from "@/registry/index.js";

/**
 * Conducks — Synapse Structural Mirror (Entry Point)
 * 
 * Secondary entry point for structural entry point detection.
 */
export async function main() {
  const { ConducksMCPServer } = await import("./server.js");
  const server = new ConducksMCPServer();
  await server.bootstrap();

  // High-performance structural resonance initialization
  await registry.initialize();

  // Conducks v6 — Stdio Transport is default for entry module
  await server.startStdio();
  process.stderr.write("[Conducks] Conducks v6 Entry Module Synchronized\n");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard isMain detection for ESM
const isMain = process.argv[1] && (
  process.argv[1] === __filename || 
  process.argv[1] === path.resolve(__dirname, "../../interfaces/tools/entry.js") ||
  process.argv[1].endsWith('conducks/src/interfaces/tools/entry.ts')
);

if (isMain) {
  main().catch(err => {
    process.stderr.write(`[Conducks Entry] Fatal Synapse Error: ${err.message}\n`);
    process.exit(1);
  });
}