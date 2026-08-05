import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Arch Command (todo41#P3)
 *
 * "What IS this codebase" — the question grep cannot ask at all. Everything printed is a
 * MEASUREMENT (ADR 0134) run through a decision table whose every verdict carries its evidence.
 * A repository matching no pattern gets the shape, not the nearest label.
 */
export class ArchCommand implements ConducksCommand {
  public id = "arch";
  public description = "Name the architecture from measurements — adapters, convergence, layer direction";
  public usage = "conducks arch [--json] [--fragments <a,b,...>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const fragIdx = args.indexOf('--fragments');
    const fragments = fragIdx !== -1 && args[fragIdx + 1]
      ? args[fragIdx + 1].split(',').map(f => f.trim()).filter(Boolean)
      : undefined;

    await syncGraph(registry);
    const { measurements, report, services } = registry.audit.arch(fragments);

    if (useJson) {
      process.stdout.write(JSON.stringify({ measurements, report, services }, null, 2) + '\n');
      return;
    }

    console.log(`\n${chalk.bold('--- 🏛️  Architecture ---')}`);

    // A MONOREPO REPORTS PER SERVICE (todo41#P4). One verdict over seven applications is wrong by
    // construction — each service gets its own measurements and its own row in the table, and the
    // whole-tree shape prints below as context rather than as a verdict.
    if (services.length > 0) {
      console.log(chalk.dim(`\n${services.length} services detected — verdicts are per service; the whole-tree shape follows.`));
      for (const s of services) {
        const name = s.root.split('/').slice(-2).join('/');
        const label = s.report.verdicts.length
          ? s.report.verdicts.map(v => `${v.pattern} [${v.confidence}]`).join(' + ')
          : 'no pattern — shape only';
        console.log(`\n  ${chalk.bold(name)}  ${label}`);
        for (const line of s.report.shape.slice(0, 3)) console.log(`    ${chalk.dim('·')} ${line}`);
      }
    }

    if (report.verdicts.length === 0) {
      // The honest miss. Naming the nearest label here is the confident-wrong answer the decision
      // table exists to refuse — an Electron main/preload/renderer split is a real shape with no
      // entry in the table, and saying so beats calling it a hexagon.
      console.log(chalk.yellow('\nNo pattern detected. The shape, so the answer is still usable:'));
    }

    for (const v of report.verdicts) {
      const conf = v.confidence === 'HIGH' ? chalk.green(v.confidence)
        : v.confidence === 'MEDIUM' ? chalk.yellow(v.confidence) : chalk.red(v.confidence);
      console.log(`\n${chalk.bold(v.pattern)}  [confidence: ${conf}]`);
      for (const e of v.evidence) console.log(`  ${chalk.dim('·')} ${e}`);
      for (const c of v.caveats) console.log(`  ${chalk.yellow('⚠')} ${c}`);
    }
    if (report.verdicts.length > 1) {
      console.log(chalk.yellow('\n⚠ Two patterns match — a codebase mid-migration is a real state, and picking one would hide the other.'));
    }

    console.log(`\n${chalk.bold('Shape')}`);
    for (const s of report.shape) console.log(`  ${chalk.dim('·')} ${s}`);

    // The strongest directory-level flows, so "layered" is checkable rather than asserted.
    const top = measurements.layerEdges.slice(0, 6);
    if (top.length > 0) {
      console.log(`\n${chalk.bold('Heaviest directory flows')}`);
      for (const e of top) console.log(`  ${chalk.dim('·')} ${e.from} ${chalk.dim('->')} ${e.to}  ${chalk.dim(`(${e.count})`)}`);
    }
  }
}
