import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Watch Command
 *
 * FIX 5: Robust process-lifetime management.
 *
 * The original implementation registered SIGINT/SIGTERM listeners inside the
 * Promise executor. Two problems with that approach:
 *
 *   1. process.on() listeners accumulate if the command is somehow invoked
 *      multiple times in the same process (e.g. tests). Node emits a warning
 *      after 10 listeners are attached to the same event.
 *
 *   2. If the watcher fails to start (e.g. invalid rootDir), the Promise
 *      never resolves and the process hangs forever, requiring a force-kill.
 *
 * The fix uses process.once() (auto-removes after first fire) and adds an
 * explicit early-return guard so a failed watcher start still resolves the
 * lifetime Promise cleanly.
 */
export class WatchCommand implements ConducksCommand {
  public id = "watch";
  public description = "Start real-time monitoring of structural shifts";
  public usage = "conducks watch";

  public async execute(args: string[], persistence: DuckDbPersistence): Promise<void> {
    console.log('[Watch] Step 1: loading graph...');
    await persistence.load(registry.query.graph.getGraph());

    console.log('[Watch] Step 2: getting watcher instance...');
    const watcher = registry.rename.watcher;

    console.log('[Watch] Step 3: watcher =', watcher ? 'OK' : 'NULL');
    if (!watcher) {
      console.error("[Conducks Watch] Could not initialize watcher — invalid project root: " + process.cwd());
      return; // FIX 5: Early return — don't hang the process if watcher is unavailable
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