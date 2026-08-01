import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Cross-Project Monitor Command
 *
 * One table for every project that has run `conducks setup`: is its graph behind its code, do its docs
 * violate the grammar, and which modules changed under an architecture note nobody has re-read
 * (todo17 Phases 2 and 3).
 *
 * REPORT ONLY, by decision. It analyzes nothing, writes to no vault, and exits 0 even when everything is
 * stale — a monitor that fails a build or edits files gets switched off, and a switched-off monitor
 * reports nothing. `--dismiss` is the single write, and it is explicit and per-module.
 */
export class MonitorCommand implements ConducksCommand {
  public id = "monitor";
  public description = "Report graph, docs and module freshness across every registered project";
  public usage = "conducks monitor [--json] [--stale] [--dismiss <module> [--intent <adr|todo|path>] [path]]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes("--json");
    const onlyStale = args.includes("--stale");
    const dismissIdx = args.indexOf("--dismiss");

    const projects = registry.federation.createProjectRegistry();
    const monitor = registry.federation.createProjectMonitor(projects);

    if (dismissIdx !== -1) {
      const moduleDir = args[dismissIdx + 1];
      if (!moduleDir || moduleDir.startsWith("--")) {
        console.log(chalk.red("--dismiss needs a module path, e.g. --dismiss src/lib/core/parsing"));
        return;
      }
      const intentIdx = args.indexOf("--intent");
      const intent = intentIdx !== -1 ? args[intentIdx + 1] : undefined;
      const positional = args.slice(dismissIdx + 2).find(a => !a.startsWith("--") && a !== intent);
      const root = positional ? path.resolve(positional) : process.cwd();

      if (intent) {
        // An enhancement's intent has to land somewhere a reader can open, so the address is checked
        // before it is stored — a record pointing at a doc nobody wrote is worse than no record.
        const resolved = monitor.resolveIntent(root, intent);
        if (!resolved) {
          console.log(chalk.red(`✗ --intent ${intent} does not name an existing decision, todo or note.`));
          console.log(chalk.dim("  Expected an ADR number (0027), a todo (todo17 / todo17#P3), or a path to a doc."));
          console.log(chalk.dim("  Write the intent down first, then dismiss — that is the point of requiring it."));
          return;
        }
        const { hash } = monitor.dismissReview(root, moduleDir, intent);
        console.log(chalk.green(`✓ ${moduleDir} reviewed — intent recorded at ${resolved}`));
        console.log(chalk.dim(`  ${hash.slice(0, 12)} — the flag returns when this module changes again`));
        return;
      }

      const { hash } = monitor.dismissReview(root, moduleDir);
      console.log(chalk.green(`✓ ${moduleDir} marked as checked, still accurate`));
      console.log(chalk.dim(`  ${hash.slice(0, 12)} — the flag returns when this module changes again`));
      console.log(chalk.dim("  Added a capability rather than fixed something? Use --intent <adr|todo|path> instead."));
      return;
    }

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
      ? reports.filter(r => r.unavailable || !r.graph.analyzed || r.graph.stale || r.branch.mismatch || r.docs.violations > 0)
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

      const docs = r.docs.violations > 0
        ? chalk.red(`docs ${r.docs.violations} violation(s)`)
        : r.docs.warnings > 0
          ? chalk.yellow(`docs ${r.docs.warnings} warning(s)`)
          : chalk.green("docs clean");

      console.log(`${label} ${graph}  ${chalk.dim("·")}  ${docs}`);
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

      const needing = r.drift.filter(d => d.needsDocReview);
      if (needing.length > 0) {
        console.log(chalk.dim("  modules changed under an architecture note:"));
        for (const d of needing.slice(0, 6)) {
          console.log(`    ${chalk.yellow("review")} ${d.module.padEnd(34)} ${chalk.dim(`${d.changedFiles} file(s) → ${d.moduleDoc}`)}`);
        }
        if (needing.length > 6) console.log(chalk.dim(`    … and ${needing.length - 6} more`));
        console.log(chalk.dim(`  still accurate? conducks monitor --dismiss <module> ${r.root}`));
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
