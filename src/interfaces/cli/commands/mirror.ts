import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { initGlobalMirror } from "@/interfaces/web/mirror-server.js";

/**
 * Conducks — Mirror Command
 */
export class MirrorCommand implements ConducksCommand {
  public id = "mirror";
  public description = "Start high-fidelity visual explorer";
  public usage = "conducks mirror [--live] [--host <addr>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks] Initializing Visual Dashboard...\x1b[0m");
    
    // 1. Initialize Gateway Service
    const projectRoot = registry.infrastructure.chronicle.getProjectDir();
    const gateway = registry.mirror.createGateway(projectRoot);

    // 2. Start Mirror Server
    const server = initGlobalMirror(gateway);
    // `--host <addr>` opts INTO network exposure; the default is loopback (ADR 0047). These API
    // routes are unauthenticated, so the previous default — bind every interface — meant any host
    // on the same network could read the analysed codebase's full structure.
    const hostFlag = args.find((a: string) => a.startsWith('--host'));
    const host = hostFlag
      ? (hostFlag.includes('=') ? hostFlag.split('=')[1] : args[args.indexOf(hostFlag) + 1]) || '127.0.0.1'
      : '127.0.0.1';
    const port = await server.start(3333, host);
    
    // 3. Start Watcher (Live Connection) - Optional (v1.12.6)
    if (registry.rename.watcher && (args.includes('--live') || args.includes('--watch'))) {
      registry.rename.watcher.start();
    }
    
    console.log("\n\x1b[32m✅ Conducks Mirror is LIVE.\x1b[0m");
    console.log(`\x1b[34m- Dashboard: http://localhost:${port}\x1b[0m`);
    console.log("\x1b[33m- Note: Keep this terminal open to maintain the live pulse.\x1b[0m");
  }
}
