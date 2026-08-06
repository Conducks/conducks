import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { initGlobalMirror } from "@/interfaces/web/mirror-server.js";

/**
 * Conducks — Mirror Command
 */
export class MirrorCommand implements ConducksCommand {
  public id = "mirror";
  public description = "Start high-fidelity visual explorer";
  public usage = "conducks mirror [--live] [--watch] [--host <addr>] [--wave-cap <n>]";

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
    // `--wave-cap <n>` raises the node cap the dashboard draws (todo48#P1). An invalid value ERRORS
    // rather than silently defaulting: a caller who asked for 5000 and got 1500 without being told
    // would read the truncation notice as the graph's real size.
    const capIdx = args.findIndex((a: string) => a === '--wave-cap' || a.startsWith('--wave-cap='));
    if (capIdx !== -1) {
      const raw = args[capIdx].includes('=') ? args[capIdx].split('=')[1] : args[capIdx + 1];
      const cap = Number.parseInt(raw, 10);
      if (!Number.isFinite(cap) || cap <= 0) {
        console.error(`Error: --wave-cap needs a positive integer (got ${raw ?? 'nothing'}).`);
        process.exit(1);
      }
      gateway.setWaveCap(cap);
      console.log(`\x1b[90m  wave cap ${cap} (default 1500)\x1b[0m`);
    }

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
