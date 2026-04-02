import { ConducksCommand } from "../command.js";
import { main as startMcpServer } from "../../tools/index.js";
import type { Registry } from "@/registry/index.js";

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
  
  public async execute(args: string[], registry: Registry): Promise<void> {
    const rootIdx = args.indexOf("--root");
    let rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    
    if (rootIdx !== -1 && args[rootIdx + 1]) {
      rootPath = args[rootIdx + 1];
      process.env.CONDUCKS_WORKSPACE_ROOT = rootPath;
      
      /**
       * If root is explicitly provided via CLI, re-initialize the 
       * structural synapse to the new anchor.
       */
      console.error(`🛡️ [McpCommand] Re-anchoring structural registry @ ${rootPath}...`);
      await registry.initialize(true, rootPath);
    }
    
    // Pass original process.argv flags or custom args if needed
    await startMcpServer();
  }
}
