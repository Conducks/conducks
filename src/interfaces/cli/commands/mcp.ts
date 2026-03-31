import { ConducksCommand } from "../command.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { main as startMcpServer } from "../../tools/index.js";

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
    // Note: persistence is ignored here as the MCP server manages its own 
    // registry and persistence lifecycle to ensure correct tool registration.
    
    const rootIdx = args.indexOf("--root");
    if (rootIdx !== -1 && args[rootIdx + 1]) {
      const rootPath = args[rootIdx + 1];
      process.env.CONDUCKS_WORKSPACE_ROOT = rootPath;
    }
    
    // Pass original process.argv flags or custom args if needed
    await startMcpServer();
  }
}
