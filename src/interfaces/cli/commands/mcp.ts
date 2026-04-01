import { ConducksCommand } from "../command.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { main as startMcpServer } from "../../tools/index.js";
import { registry } from "@/registry/index.js";

/**
 * Conducks — MCP Command
 * 
 * Subcommand to launch the unified Conducks Model Context Protocol server.
 * This bridges the CLI with the tool registration layer, ensuring CWD-aware context.
 */
export class McpCommand implements ConducksCommand {
  public id = "mcp";
  public description = "Launch the Conducks Model Context Protocol (MCP) server.";
  public usage = "mcp [--sse] [--root <path>]";
  
  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const rootIdx = args.indexOf("--root");
    let rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    
    if (rootIdx !== -1 && args[rootIdx + 1]) {
      rootPath = args[rootIdx + 1];
      process.env.CONDUCKS_WORKSPACE_ROOT = rootPath;
    }
    
    /**
     * GitNexus Pattern: Initialize the structural registry in the CLI.
     * This ensures the DB connection and grammar engine are hot before the server 
     * enters its high-integrity stream state.
     */
    console.error(`🛡️ [McpCommand] Warming up structural registry @ ${rootPath}...`);
    await registry.initialize(true, rootPath);
    console.error(`🛡️ [McpCommand] Structural registry synchronized.`);
    
    // Pass original process.argv flags or custom args if needed
    await startMcpServer();
  }
}
