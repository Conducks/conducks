import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Watch Command
 *
 * FIX 5: Robust process-lifetime management.
 */
export class WatchCommand implements ConducksCommand {
  public id = "watch";
  public description = "Start real-time monitoring of structural shifts";
  public usage = "conducks watch";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isPulse = args.includes('--pulse');
    const rootPath = process.cwd();

    // Read-Only: watcher observes structural shifts, only analyze writes
    await (registry as any).initialize(true, rootPath, true);
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    console.log('[Watch] Step 2: getting watcher instance...');
    const watcher = (registry.evolution as any).watcher;

    console.log('[Watch] Step 3: watcher =', watcher ? 'OK' : 'NULL');
    if (!watcher) {
      console.error("[Conducks Watch] Could not initialize watcher — invalid project root: " + rootPath);
      return; 
    }

    if (isPulse && watcher) {
        (watcher as any).enableAutoPulse(true);
    }

    console.log('[Watch] Step 4: calling watcher.init()...');
    await watcher.init();

    console.log('[Watch] Step 5: calling watcher.start()...');
    watcher.start();

    console.log("\n\x1b[32m🔭 Conducks Watcher — Live Mirror Mode (Read-Only) active.\x1b[0m");
    console.log("\x1b[34m- Changes update the in-memory Visual Mirror instantly.\x1b[0m");
    console.log("\x1b[33m- Note: Run 'conducks analyze' to persist new symbols to disk.\x1b[0m");

    // FIX 5: Keep the process alive until a termination signal is received.
    // Use process.once() so each handler fires exactly once and is then
    // removed — prevents listener accumulation across multiple invocations.
    await new Promise<void>((resolve) => {
      const shutdown = async (signal: string) => {
        console.log(`\n\x1b[33m[Conducks Watch] Received ${signal}. Shutting down watcher...\x1b[0m`);
        try {
          await watcher.stop();
        } catch (err: any) {
          console.error(`[Conducks Watch] Error during watcher shutdown: ${err?.message || err}`);
        }
        resolve();
      };

      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    });
  }
}