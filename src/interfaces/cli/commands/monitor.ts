import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";

/**
 * Conducks — Cross-Project Monitor Command
 *
 * One table for every project that has run `conducks setup`: is its graph behind its code, and is anything
 * watching it.
 *
 * REPORT ONLY, by decision. It analyzes nothing, writes to no vault, and exits 0 even when everything is
 * stale — a monitor that fails a build or edits files gets switched off, and a switched-off monitor
 * reports nothing.
 */
export class MonitorCommand implements ConducksCommand {
  public id = "monitor";
  public description = "Report graph freshness across every registered project";
  public usage = "conducks monitor [--json] [--stale]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes("--json");
    const onlyStale = args.includes("--stale");

    const projects = registry.federation.createProjectRegistry();
    const monitor = registry.federation.createProjectMonitor(projects);

    const reports = await monitor.reportAll();

    if (useJson) {
      console.log(JSON.stringify({ registry: projects.path, projects: reports }, null, 2));
      return;
    }

    if (reports.length === 0) {
      console.log(chalk.bold("\n--- 🛰️  Conducks Monitor ---\n"));
      console.log("  No projects registered yet.");
      console.log(chalk.dim(`  Run 'conducks setup' inside a project — it records the root in ${projects.path}\n`));
      return;
    }

    console.log(chalk.bold("\n--- 🛰️  Conducks Monitor ---\n"));

    // A branch mismatch belongs in `--stale`. It is the case where every hash matches, so without
    // it the one project answering from the wrong tree is the one `--stale` hides.
    const shown = onlyStale
      ? reports.filter(r => r.unavailable || !r.graph.analyzed || r.graph.stale || r.branch.mismatch)
      : reports;

    for (const r of shown) {
      const label = chalk.bold(r.name.padEnd(22));

      if (r.unavailable) {
        console.log(`${label} ${chalk.yellow("unavailable")} ${chalk.dim(r.unavailable)}`);
        console.log(chalk.dim(`  ${r.root}\n`));
        continue;
      }

      // `added` is coverage, not staleness — see ProjectMonitor. Saying "behind" for a file `analyze`
      // would not have picked up either reports a problem the reader cannot act on.
      const graph = !r.graph.analyzed
        ? chalk.yellow("never analyzed")
        : r.graph.stale
          ? chalk.yellow(`graph behind: ${r.graph.changed} changed, ${r.graph.removed} gone`)
          : chalk.green(`graph current (${r.graph.tracked} files)`);

      console.log(`${label} ${graph}`);
      console.log(chalk.dim(`  ${r.root}`));

      // ITS OWN LINE, above the watcher and never folded into the graph column (ADR 0035,
      // todo20#P1). The graph column can read "graph current" here and be perfectly correct about
      // hashes while every answer from that vault is about a branch that is not checked out. Two
      // different failures, so two different lines.
      //
      // REPORTED AND LEFT. Monitor does not pulse to fix it — ADR 0031 rejected letting an
      // unattended process start a two-minute analysis, because that process gets killed, and a
      // killed monitor reports nothing at all. That rejection is unchanged by branch identity.
      if (r.branch.mismatch) {
        console.log(chalk.red(`  branch MISMATCH — vault pulsed on '${r.branch.vault}', checkout is on '${r.branch.checkout}'`));
        // `--force`: a branch switch changes no file mtime, so a plain `analyze` finds nothing
        // dirty and writes no pulse, leaving this line here after the reader has acted on it.
        console.log(chalk.dim(`  the hashes above are about the wrong tree. 'conducks analyze --force' in that project.`));
      }

      // A DEAD watcher is louder than a stale graph, because staleness is the SYMPTOM and this is
      // the cause. Nothing is printed for `none`: most projects are not watched, and a line saying
      // so on every one of them is the noise that gets a report ignored (todo21#P3).
      if (r.watcher.state === 'dead') {
        console.log(chalk.red(`  watcher DEAD — pid ${r.watcher.pid} (${r.watcher.reason}), last beat ${r.watcher.heartbeatAt}`));
        console.log(chalk.dim(`  this is why the graph is behind. 'conducks watch' to restart it.`));
      } else if (r.watcher.state === 'live') {
        console.log(chalk.dim(`  watcher live — pid ${r.watcher.pid} since ${r.watcher.startedAt}`));
      }
      if (r.graph.analyzed && r.graph.added > 0) {
        console.log(chalk.dim(`  ${r.graph.added} file(s) the graph has never analyzed — 'analyze' is incremental by mtime, so`));
        console.log(chalk.dim(`  a file untouched since the last pulse never enters a wave. 'conducks analyze --force' if it matters.`));
      }

      console.log("");
    }

    if (onlyStale && shown.length === 0) console.log(chalk.green("  Every registered project is current.\n"));

    const missing = projects.missingRoots();
    if (missing.length > 0) {
      console.log(chalk.dim(`  ${missing.length} registered root(s) no longer exist on disk — reported, not removed.`));
      console.log(chalk.dim(`  Edit or delete ${projects.path} to forget them.\n`));
    }
  }
}
