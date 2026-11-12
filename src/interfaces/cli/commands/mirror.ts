import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { initGlobalMirror } from "@/interfaces/web/mirror/server.js";

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
    // `mirror` is a read command, so its graph is DEFERRED. The watcher walks the graph on every save,
    // so it is loaded first — otherwise each save failed with "read a graph that is not materialised"
    // until a dashboard request happened to load it (state-machine audit P-07-3). And the watcher is
    // announced only once it is really watching, as `watch` does (P-08-10, todo55).
    const watcher = registry.evolution.watcher;
    const live = !!watcher && (args.includes('--live') || args.includes('--watch'));
    // This command runs until it is killed, and until now it handled no signal — so `stop()`
    // never ran, and the docs watcher's readiness probe was left behind in `docs/` every time.
    // The file watcher is stopped too: exiting without `stop()` left its liveness marker behind, and
    // `monitor` then read a deliberate Ctrl-C as a DEAD watcher (P-07-2).
    //
    // Armed BEFORE the watcher starts, not after it is ready: `start()` writes the marker, and a
    // Ctrl-C in between took the default action and left it (round 2, Q-08-4). And ONE shutdown:
    // there is one `once` listener per signal, so a SIGTERM arriving during a SIGINT shutdown ran it
    // again and exited while the first was still stopping the watcher — the fault P-08-9 fixed for
    // `watch` (round 2, Q-08-7). A second signal of the SAME kind still kills the process.
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      console.log("\n\x1b[90m[Conducks] Stopping mirror…\x1b[0m");
      try { await server.stop(); } catch { /* shutting down anyway */ }
      if (live) { try { await registry.evolution.stopWatchers(); } catch { /* shutting down anyway */ } }
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    if (live) {
      // Loaded INSIDE the gateway's turn, which closes the handle when it ends, and the watcher's own
      // reads borrow the same turn: a handle held between turns locks the vault against `analyze` in
      // another terminal for the whole session.
      await gateway.exclusive(() => registry.infrastructure.ensureGraphLoaded());
      if (stopping) return;   // stopped while loading: starting now would write a marker nothing removes
      // Every turn first loads the graph if a failed live reload left it deferred (round 2, Q-10-1
      // follow-up). The routes load it on their own turn; the watcher pulses into it directly, and
      // its first vault read — the hash check — comes before the parse, so loading here is in time.
      watcher.setVaultTurn(task => gateway.exclusive(async () => {
        await registry.infrastructure.ensureGraphLoaded();
        return task();
      }));
      watcher.start();
      await watcher.whenReady();
    }

    console.log("\n\x1b[32m✅ Conducks Mirror is LIVE.\x1b[0m");
    console.log(`\x1b[34m- Dashboard: http://localhost:${port}\x1b[0m`);
    console.log("\x1b[33m- Note: Keep this terminal open to maintain the live pulse.\x1b[0m");
  }
}
