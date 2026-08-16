import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/** How often the watcher re-reads HEAD's branch. Cheap: one `symbolic-ref` against the local repo. */
export const BRANCH_POLL_MS = 2_000;

/**
 * Watches for the branch moving under a running watcher, and calls back once per switch.
 *
 * A file watcher cannot see this. `git checkout` rewrites the working tree, so SOME saves fire —
 * but only for files that actually differ between the two branches, and the watcher treats each as
 * an ordinary edit and micro-pulses it into a graph still describing the branch that was left.
 * Files identical on both branches never fire at all, so the graph ends up a blend of two trees
 * with no event marking where one stopped (ADR 0035).
 *
 * Polling rather than watching `.git/HEAD`: `git checkout` replaces that file rather than editing
 * it, which drops an inode-bound watch, and worktrees put HEAD somewhere else entirely. Reading the
 * branch through git answers correctly for every layout.
 *
 * Returns the stop function. Exported so the invalidation can be asserted against a real repo
 * without starting a full watcher.
 */
export function watchBranchSwitch(
  readBranch: () => string | null,
  onSwitch: (from: string | null, to: string | null) => void,
  intervalMs: number = BRANCH_POLL_MS,
): () => void {
  let current = readBranch();
  const timer = setInterval(() => {
    const next = readBranch();
    // Both sides must be a real branch name. A momentary null is a detached HEAD mid-rebase or a
    // git call that failed, and treating that as a switch would invalidate the graph twice for one
    // checkout — once into the null and once back out of it.
    if (next === current || next === null || current === null) { current = next ?? current; return; }
    const from = current;
    current = next;
    onSwitch(from, next);
  }, intervalMs);
  // Never hold the process open on its own account; the watcher's own lifetime decides that.
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/**
 * Conducks — Watch Command
 *
 * FIX 5: Robust process-lifetime management.
 */
export class WatchCommand implements ConducksCommand {
  public id = "watch";
  public description = "Start real-time monitoring of structural shifts";
  public usage = "conducks watch [--pulse]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isPulse = args.includes('--pulse');
    const rootPath = process.cwd();

    // READ-ONLY, AND `--pulse` DOES NOT CHANGE THAT YET — see todo67, which now carries two
    // measurements rather than one. `replaceFile` fixed the in-memory half (a re-pulse no longer
    // keeps a deleted call's edge). The vault half is unsolved: `save` never deletes, so the stale
    // row survives, and purging the unit first loses cross-file edges that neither the intra-linker
    // nor a later incremental `analyze` restores — `impact shared` went from one caller to zero and
    // stayed there. Refused out loud rather than silently obeyed.
    await (registry as any).initialize(true, rootPath, true);
    await syncGraph(registry);

    console.log('[Watch] Step 2: getting watcher instance...');
    const watcher = (registry.evolution as any).watcher;

    console.log('[Watch] Step 3: watcher =', watcher ? 'OK' : 'NULL');
    if (!watcher) {
      console.error("[Conducks Watch] Could not initialize watcher — invalid project root: " + rootPath);
      process.exit(1);
    }

    if (isPulse) {
      console.error("[Conducks Watch] --pulse is not available yet: the vault half of replace-on-repulse " +
        "is unsolved (todo67) and enabling it loses cross-file edges. Watching read-only; " +
        "run 'conducks analyze' to persist.");
    }

    console.log('[Watch] Step 4: calling watcher.init()...');
    await watcher.init();

    console.log('[Watch] Step 5: calling watcher.start()...');
    watcher.start();

    // WAIT for the watcher to actually be watching before doing anything else.
    //
    // `start()` returns as soon as chokidar is constructed; with polling the baseline snapshot lands
    // later. Without this await, the reconcile below ran and the banner printed while the poller was
    // still blind, so a file created in that gap was reported by NOTHING — not as an event
    // (`ignoreInitial: true` folded it into the initial state) and not by the sweep (which had already
    // finished). Measured at ~1 miss in 3 in `blocking-commands.test.ts`, which writes the instant the
    // banner appears (todo55).
    await watcher.whenReady();

    // Catch up on everything edited while nothing was watching (ADR 0036, todo21#P3).
    //
    // chokidar starts with `ignoreInitial: true`, so before this the watcher saw events from the
    // moment it started and NOTHING before — a session begun after an editing spree was silently
    // behind until the next full `analyze`. AFTER start() AND after ready, deliberately: reconciling
    // first would leave the same window from the other side, where a file edited during the catch-up
    // produced no event at all.
    const discovered = await registry.infrastructure.chronicle.discoverFiles();
    const caught = await watcher.reconcileOnStart(discovered);
    if (caught.changed + caught.added > 0) {
      console.log(`[Watch] Caught up on ${caught.changed} changed and ${caught.added} new file(s) from while the watcher was off.`);
    }

    // The docs half of the same heartbeat: a governed doc changing re-lints the tree. Reports only —
    // the exit-code surface stays on `conducks docs-lint` for CI (ADR 0020, todo15).
    const docsWatcher = registry.docs.watcher;
    docsWatcher.start();

    // The banner names the mode, because they differ in the only way a reader cares about: whether
    // anything outside this process will see the update.
    console.log("\n\x1b[32m🔭 Conducks Watcher — Live Mirror Mode (Read-Only) active.\x1b[0m");
    console.log("\x1b[34m- Changes update the in-memory Visual Mirror instantly.\x1b[0m");
    console.log("\x1b[34m- docs/ is watched too: grammar + link violations report on write.\x1b[0m");
    console.log("\x1b[33m- Note: Run 'conducks analyze' to persist new symbols to disk.\x1b[0m");

    // A branch switch invalidates the graph, and a FILE watcher cannot see one (ADR 0035,
    // todo20#P1). Auto-pulse is switched OFF at the switch rather than left running: every pulse
    // after it would write symbols from the new branch into a graph describing the old one, mixing
    // two trees in the vault with nothing recording where the boundary is. Stopping is recoverable;
    // a blended vault is not.
    const chronicle = registry.infrastructure.chronicle;
    const stopBranchWatch = watchBranchSwitch(
      () => chronicle.getCurrentBranch(),
      (from, to) => {
        console.log(`\n\x1b[31m[Conducks Watch] Branch switched: '${from}' → '${to}'.\x1b[0m`);
        console.log(`\x1b[31m  The live graph describes '${from}' and is now invalid.\x1b[0m`);
        if (isPulse) {
          (watcher as any).enableAutoPulse(false);
          console.log(`\x1b[33m  Auto-pulse stopped so nothing from '${to}' is written into it.\x1b[0m`);
        }
        // `--force`: the switch changed no mtime for any file identical on both branches, so a
        // plain `analyze` finds nothing dirty and writes no pulse at all.
        console.log(`\x1b[33m  Run 'conducks analyze --force' to rebuild for '${to}', then restart the watcher.\x1b[0m`);
      },
    );

    // FIX 5: Keep the process alive until a termination signal is received.
    // Use process.once() so each handler fires exactly once and is then
    // removed — prevents listener accumulation across multiple invocations.
    await new Promise<void>((resolve) => {
      const shutdown = async (signal: string) => {
        console.log(`\n\x1b[33m[Conducks Watch] Received ${signal}. Shutting down watcher...\x1b[0m`);
        try {
          stopBranchWatch();
          await docsWatcher.stop();
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