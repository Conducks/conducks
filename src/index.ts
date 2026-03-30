/**
 * CONDUCKS — Apostle v6 HyperToon Entry Point
 * 
 * Apostolic Silence: All logs are redirected to stderr to protect 
 * the MCP JSON stream on stdout.
 */
async function main() {
  // Silence all logs first
  console.log = console.error;

  // Dynamic import ensures that the ConducksMCPServer (and its dependencies)
  // are only loaded AFTER console.log has been silenced.
  const { ConducksMCPServer } = await import("../lib/product/mcp/server.js");

  const server = new ConducksMCPServer();
  await server.bootstrap();
  
  if (process.argv.includes("--sse")) {
    await server.startSSE();
  } else {
    await server.startStdio();
  }
}

main().catch((error) => {
  console.error("Fatal: Conducks MCP Server failed to start:", error);
  process.exit(1);
});