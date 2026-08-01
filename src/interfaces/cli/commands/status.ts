import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Status Command 🏺 🟦
 *
 * Provides structural health metrics and triggers micro-pulses.
 */
export class StatusCommand implements ConducksCommand {
  public id = "status";
  public description = "Show health and symbol counts or pulse a file";
  public usage = "conducks status [--mode pulse] [--file <path>] [--json] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isPulse = args.includes('--pulse') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'pulse');
    const fileArgIdx = args.indexOf('--file');
    const fileArg = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;
    const useJson = args.includes('--json');

    try {
      // 5. Conducks Purge & Resurrection 🛡️(Lazy Incremental Induction)
      if (isPulse && fileArg) {
        console.log(`🛡️  [Conducks Pulse] Resonating structural unit: ${chalk.cyan(fileArg)}`);
        const result = await (registry.analyze as any).resonate(fileArg);
        if (result.success && result.persisted) {
          console.log(chalk.green(`Success: ${fileArg} resurrected into the synapse (${result.nodes} nodes).`));
        } else if (result.success) {
          // `status` is not on the CLI's write allowlist (cli/index.ts), so its vault handle is
          // read-only and the micro-pulse skips its own write. Saying "resurrected into the
          // synapse" here claimed a write that the layer below had already declined to make.
          console.log(chalk.yellow(`Parsed ${fileArg} (${result.nodes} nodes) — NOT written: 'status' holds a read-only vault handle. Run 'conducks analyze' to persist.`));
        } else {
          console.error(chalk.red(`Failed to pulse ${fileArg}: ${result.error}`));
        }
        return;
      }

      // Every mode below WALKS the graph — blueprint audits it, health resonates it and ranks its
      // nodes — so the deferred load (ADR 0038) has to be materialised first. Without this the
      // command threw `The structural graph is not materialised` on every invocation, which is the
      // guard doing its job: it is designed to fail loudly at the call site rather than let a
      // deferred graph read as an empty one and report zero nodes.
      await registry.infrastructure.ensureGraphLoaded();

      // 2.6 Mode: Blueprint (Structural Integrity)
      if (args.includes('--blueprint') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'blueprint')) {
        console.log(`🛡️  [Conducks Blueprint] Mapping structural integrity...`);
        const audit = await registry.audit.audit();
        console.log(chalk.bold("\n--- 🏺 Conducks Integrity Blueprint ---"));
        console.log(`- Cycles:   ${chalk.red(audit.stats.cycles)}`);
        console.log(`- Orphans:  ${chalk.red(audit.stats.orphans)}`);
        console.log(`- Resonance: ${chalk.green(audit.success ? "100%" : "ST structural drift detected")}`);
        if (audit.violations.length > 0) {
          console.log(chalk.bold("\nViolations:"));
          audit.violations.slice(0, 10).forEach(v => console.log(`  - ${v}`));
        }
        return;
      }

      // 3. Mode: Health (Default)
      (registry.infrastructure.graphEngine as any).resonate();
      const status = registry.audit.status();
      // `status()` reports the in-memory graph, which does not know which pulse produced it or
      // whether persistence answered from the live vault or the previous pulse's snapshot (ADR
      // 0040). `statusFromVault()` carries both — pulled here purely for those two fields so a
      // reader mid-pulse sees "answering from the previous pulse" instead of silently stale data.
      const vaultStatus = await registry.audit.statusFromVault();
      const pulseId = (vaultStatus.staleness as any).pulseId;
      const servedFrom = (vaultStatus.staleness as any).servedFrom;
      const graph = registry.query.graph.getGraph();

      const topGravity = Array.from(graph.getAllNodes())
        .filter(n => !n.properties.isTest)
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 5);

      // Health: a real codebase graph is never near-disconnected. A density below ~0.5 on a
      // non-trivial node set means an analyze was interrupted and persisted a PARTIAL graph
      // (nodes written, edges lost) — it loads and looks fine but is silently broken. Flag it.
      const s = status.stats;
      const incomplete = s.nodeCount > 50 && s.density < 0.5;
      const health = { incomplete, reason: incomplete ? `density ${s.density.toFixed(2)} with ${s.nodeCount} nodes — likely an interrupted analyze; re-run \`conducks analyze\`` : null };

      if (useJson) {
        process.stdout.write(JSON.stringify({
          stats: status.stats,
          status: status.status,
          staleness: { ...status.staleness, pulseId, servedFrom },
          health,
          topHotspots: topGravity.map(n => ({
            id: n.id,
            name: n.properties.name,
            rank: n.properties.rank,
          })),
        }, null, 2) + '\n');
        return;
      }

      console.log(chalk.bold("\n--- 🏺 Structural Synapse Status ---"));
      console.log(`- Nodes:   ${chalk.yellow(status.stats.nodeCount)}`);
      console.log(`- Edges:   ${chalk.yellow(status.stats.edgeCount)}`);
      console.log(`- Density: ${status.stats.density.toFixed(4)} relationships/symbol`);
      console.log(`- Status:  ${status.status.toUpperCase()}`);

      if (incomplete) {
        console.log(`- ${chalk.yellow('Health')}:  ${chalk.red('⚠ INCOMPLETE PULSE')} — ${health.reason}`);
      }

      if (status.staleness.stale) {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.red('STALE')} (${status.staleness.commitsBehind} commits behind)`);
      } else {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.green('SYNCHRONIZED')}`);
      }
      console.log(`- ${chalk.yellow('Pulse')}:   ${chalk.cyan(pulseId)}${servedFrom === 'previous-pulse-snapshot' ? chalk.yellow(' (served from the previous pulse\'s snapshot — a write is in flight)') : ''}`);

      console.log(chalk.bold(`\n--- 🚀 Top Structural Hotspots ---`));
      topGravity.forEach((n, i) => {
        console.log(`${i + 1}. ${chalk.magenta(n.id)} [Gravity: ${chalk.cyan((n.properties.rank || 0).toFixed(4))}]`);
      });
      console.log();
    } finally {
      await closePersistence(registry);
    }
  }
}
