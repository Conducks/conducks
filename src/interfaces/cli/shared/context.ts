import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Shared CLI Context Helpers
 *
 * Extracts the two boilerplate patterns repeated across command files:
 * 1. Structural sync: load persisted graph into in-memory graph engine
 * 2. Close: release the DuckDB persistence connection
 *
 * Commands remain responsible for try/finally and process.exit() calls.
 */

/**
 * Synchronize the in-memory graph from the persistence layer.
 * Call at the start of any command that reads the structural graph.
 */
export async function syncGraph(registry: Registry): Promise<void> {
  await registry.infrastructure.persistence.load(registry.query.graph.getGraph());
}

/**
 * Close the persistence connection.
 * Call in the finally block of commands that open the persistence layer.
 */
export async function closePersistence(registry: Registry): Promise<void> {
  await registry.infrastructure.persistence.close();
}
