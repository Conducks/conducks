import { ConducksCommand } from "../command.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
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
  public usage = "mcp [--sse]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    // Note: persistence is ignored here as the MCP server manages its own 
    // registry and persistence lifecycle to ensure correct tool registration.
    
    // Pass original process.argv flags or custom args if needed
    await startMcpServer();
  }
}
