import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Status Command 🏺 🟦
 * 
 * Provides structural health metrics and triggers micro-pulses.
 */
export class StatusCommand implements ConducksCommand {
  public id = "status";
  public description = "Show health and symbol counts or pulse a file";
  public usage = "conducks status [--mode pulse] [--file <path>] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isPulse = args.includes('--pulse') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'pulse');
    const fileArgIdx = args.indexOf('--file');
    const fileArg = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;
    
    const pathArg = args.find(a => !a.startsWith('--') && a !== fileArg && a !== 'pulse');
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    // 1. Initial Structural Anchor & Resonance 🏺
    if (pathArg || process.env.CONDUCKS_WORKSPACE_ROOT !== targetPath || isPulse) {
      await registry.initialize(!isPulse, targetPath);
    }
    chronicle.setProjectDir(targetPath);

    try {
      // 2. Mode: Pulse (Lazy Incremental Induction)
      if (isPulse && fileArg) {
        console.log(`🛡️  [Apostolic Pulse] Resonating structural unit: ${chalk.cyan(fileArg)}`);
        const result = await (registry.analyze as any).resonate(fileArg);
        if (result.success) {
          console.log(chalk.green(`Success: ${fileArg} resurrected into the synapse (${result.nodes} nodes).`));
        } else {
          console.error(chalk.red(`Failed to pulse ${fileArg}: ${result.error}`));
        }
        return;
      }

      // 2.5 Mode: Manifest (Apostolic Context) 🏺
      if (args.includes('--manifest') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'manifest')) {
        console.log(`🛡️  [Apostolic Manifest] Generating architectural context...`);
        const manifest = await registry.audit.contextFile();
        console.log("\n" + manifest);
        return;
      }

      // 2.6 Mode: Blueprint (Structural Integrity)
      if (args.includes('--blueprint') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'blueprint')) {
          console.log(`🛡️  [Apostolic Blueprint] Mapping structural integrity...`);
          const audit = await registry.audit.audit();
          console.log(chalk.bold("\n--- 🏺 Structural Integrity Blueprint ---"));
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
      const graph = registry.query.graph.getGraph();

      console.log(chalk.bold("\n--- 🏺 Structural Synapse Status ---"));
      console.log(`- Nodes:   ${chalk.yellow(status.stats.nodeCount)}`);
      console.log(`- Edges:   ${chalk.yellow(status.stats.edgeCount)}`);
      console.log(`- Density: ${status.stats.density.toFixed(4)} relationships/symbol`);
      console.log(`- Status:  ${status.status.toUpperCase()}`);

      if (status.staleness.stale) {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.red('STALE')} (${status.staleness.commitsBehind} commits behind)`);
      } else {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.green('SYNCHRONIZED')}`);
      }

      const topGravity = Array.from(graph.getAllNodes())
        .filter(n => !n.properties.isTest)
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 5);

      console.log(chalk.bold(`\n--- 🚀 Top Structural Hotspots ---`));
      topGravity.forEach((n, i) => {
        console.log(`${i + 1}. ${chalk.magenta(n.id)} [Gravity: ${chalk.cyan((n.properties.rank || 0).toFixed(4))}]`);
      });
      console.log();
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
