import { ConducksCommand } from "../command.js";
import { main as startMcpServer } from "../../tools/index.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    let rootPath = (rootIdx !== -1 && args[rootIdx + 1]) || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    // 🛡️ [Root Detachment Check]
    if (rootPath === '/' || rootPath === '/root' || rootPath === '/Users') {
      console.error("⚠️  [McpCommand] Detached root detected. Attempting to anchor to executable directory...");
      rootPath = path.dirname(fileURLToPath(import.meta.url));
    }
    
    process.env.CONDUCKS_WORKSPACE_ROOT = rootPath;
    // Registry is already initialized by main orchestrator.
    
    
    // Pass original process.argv flags or custom args if needed
    await startMcpServer();
  }
}
