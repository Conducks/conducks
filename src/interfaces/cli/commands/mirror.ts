import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { initGlobalMirror } from "@/interfaces/web/mirror-server.js";

/**
 * Conducks — Mirror Command
 */
export class MirrorCommand implements ConducksCommand {
  public id = "mirror";
  public description = "Start high-fidelity visual explorer";
  public usage = "registry mirror";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks] Initializing Visual Dashboard...\x1b[0m");
    
    // 1. Load Graph
    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());
    
    // 2. Start Mirror Server
    const server = initGlobalMirror(registry.query.graph, registry.infrastructure.persistence);
    server.start(3333);
    
    // 3. Start Watcher (Live Connection) - Optional (v1.12.6)
    if (registry.rename.watcher && (_args.includes('--live') || _args.includes('--watch'))) {
      registry.rename.watcher.start();
    }
    
    console.log("\n\x1b[32m✅ Conducks Mirror is LIVE.\x1b[0m");
    console.log("\x1b[34m- Dashboard: http://localhost:3333\x1b[0m");
    console.log("\x1b[33m- Note: Keep this terminal open to maintain the live pulse.\x1b[0m");
  }
}
