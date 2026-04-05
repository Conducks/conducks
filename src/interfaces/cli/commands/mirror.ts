import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { initGlobalMirror } from "@/interfaces/web/mirror-server.js";
import { GatewayService } from "@/lib/domain/analysis/gateway-service.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";

/**
 * Conducks — Mirror Command
 */
export class MirrorCommand implements ConducksCommand {
  public id = "mirror";
  public description = "Start high-fidelity visual explorer";
  public usage = "registry mirror";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks] Initializing Visual Dashboard...\x1b[0m");
    
    // 1. Initialize Gateway Service
    const projectRoot = chronicle.getProjectDir();
    const gateway = new GatewayService(
      registry.infrastructure.graphEngine,
      registry.infrastructure.persistence,
      projectRoot
    );

    // 2. Start Mirror Server
    const server = initGlobalMirror(gateway);
    const port = await server.start(3333);
    
    // 3. Start Watcher (Live Connection) - Optional (v1.12.6)
    if (registry.rename.watcher && (_args.includes('--live') || _args.includes('--watch'))) {
      registry.rename.watcher.start();
    }
    
    console.log("\n\x1b[32m✅ Conducks Mirror is LIVE.\x1b[0m");
    console.log(`\x1b[34m- Dashboard: http://localhost:${port}\x1b[0m`);
    console.log("\x1b[33m- Note: Keep this terminal open to maintain the live pulse.\x1b[0m");
  }
}
