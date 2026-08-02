import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import chalk from "chalk";

/**
 * Conducks — Coverage Command 🏺 🟩
 *
 * Overlays a runtime coverage report (istanbul `coverage-final.json`, as emitted by
 * jest/c8/nyc) onto the structural graph. For every BEHAVIOR node with a real line span,
 * range-joins the covered lines into its `[lineStart, lineEnd]` and reports a fill %:
 *
 *   covered line N  →  the node whose span contains N  →  that function lights up.
 *
 * FULL = fully exercised, PART = partially, DARK = never ran (untested, or — with no
 * inbound edges — dead/forgotten code). This is the "watch it light as you test" overlay.
 */
export class CoverageCommand implements ConducksCommand {
  public id = "coverage";
  public description = "Overlay istanbul/c8 coverage onto the graph — see which functions light up";
  public usage = "conducks coverage <coverage-final.json> [--json] [--all] [--save-baseline] [--vs-baseline] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    // The coverage report is the FIRST positional, whatever it is named. Selecting it by
    // `.endsWith(".json")` meant a report saved as `cov-report` or `coverage.info` was not seen at
    // all, and the command answered "Missing coverage file" about a file the user had just typed —
    // the wrong complaint entirely (ADR 0116). The second positional is the project path, which the
    // dispatcher reads; it is skipped here.
    const covPath = args.filter(a => !a.startsWith("-"))[0];
    const useJson = args.includes("--json");
    const showAll = args.includes("--all"); // include DARK nodes (default: hide pure-dark noise)
    const saveBaselineFlag = args.includes("--save-baseline");
    const vsBaseline = args.includes("--vs-baseline");

    if (!covPath) {
      console.error(chalk.red("Missing coverage file. Usage: ") + this.usage);
      process.exitCode = 1;
      return;
    }

    try {
      // Range-join coverage onto BEHAVIOR node spans — shared domain logic (coverage-bind.ts),
      // reached through the composition root so the same code backs `conducks_coverage` (MCP).
      let results: Awaited<ReturnType<typeof registry.coverage.bind>>;
      try {
        results = await registry.coverage.bind(covPath);
      } catch (e) {
        console.error(chalk.red(`Cannot read/bind coverage file ${covPath}: ${(e as Error).message}`));
        process.exitCode = 1;
        return;
      }
      const nodes = results; // total functions with spans (for the summary line)

      const bound = results.filter(r => r.bound);

      // Anchored on the PROJECT, not on `process.cwd()`. A baseline saved from a subdirectory used
      // to land in a `.conducks/` beside wherever the user happened to stand, so the next
      // `--vs-baseline` from the root found nothing and reported every function as NEW (ADR 0116).
      const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();

      if (saveBaselineFlag) {
        const baselinePath = registry.coverage.defaultBaselinePath(projectRoot);
        registry.coverage.saveBaseline(bound, baselinePath);
        console.log(chalk.green(`\n✓ Saved coverage baseline for ${bound.length} functions → ${baselinePath}\n`));
        if (!vsBaseline) return;
      }

      if (vsBaseline) {
        const baselinePath = registry.coverage.defaultBaselinePath(projectRoot);
        const baseline = registry.coverage.loadBaseline(baselinePath);
        if (!baseline) {
          console.error(chalk.red(`No baseline found at ${baselinePath}. Run with --save-baseline first.`));
          process.exitCode = 1;
          return;
        }
        const drift = registry.coverage.diffAgainstBaseline(bound, baseline);
        const regressed = drift.filter(d => d.status === "REGRESSED");
        const improved = drift.filter(d => d.status === "IMPROVED");
        const created = drift.filter(d => d.status === "NEW");
        const same = drift.filter(d => d.status === "SAME");

        // `--json` was read AFTER this block returned, so it was accepted and silently dropped for
        // the one mode a script is most likely to want machine-readable (ADR 0116).
        if (useJson) {
          console.log(JSON.stringify(drift, null, 2));
          if (regressed.length > 0) process.exitCode = 1;
          return;
        }

        console.log(chalk.bold("\n--- 🟩 Conducks Coverage Drift vs Baseline ---\n"));
        if (regressed.length === 0) {
          console.log(chalk.green("  No regressions. ✓"));
        } else {
          for (const d of regressed) {
            console.log(chalk.red(
              `  ⚠ ${d.name}: was ${d.baselinePct}% → now ${d.currentPct}%` +
              `${d.currentPct === 0 ? " (BROKE)" : ""}`
            ) + chalk.dim(`  ${d.file}`));
          }
        }
        if (created.length > 0) {
          console.log(chalk.cyan(`\n  NEW (${created.length}): `) + created.map(d => d.name).join(", "));
        }
        if (improved.length > 0) {
          console.log(chalk.green(`  IMPROVED (${improved.length}): `) + improved.map(d => `${d.name} (${d.baselinePct}%→${d.currentPct}%)`).join(", "));
        }
        console.log(
          `\n  ${chalk.red(regressed.length + " regressed")} · ${chalk.green(improved.length + " improved")} · ` +
          `${chalk.cyan(created.length + " new")} · ${chalk.gray(same.length + " same")}\n`
        );
        // A regression gate that always exits 0 gates nothing. The whole question this mode answers
        // is "did anything that used to work stop working" — measured on conducks it printed three
        // functions as "(BROKE)" in red and exited 0, so no CI step could act on it (ADR 0116).
        if (regressed.length > 0) process.exitCode = 1;
        return;
      }

      if (useJson) {
        console.log(JSON.stringify(bound, null, 2));
        return;
      }

      // 4. Report.
      const rows = (showAll ? bound : bound.filter(r => r.pct > 0)).sort((a, b) => b.pct - a.pct);
      const full = bound.filter(r => r.pct >= 99).length;
      const part = bound.filter(r => r.pct > 0 && r.pct < 99).length;
      const dark = bound.filter(r => r.pct === 0).length;

      console.log(chalk.bold("\n--- 🟩 Conducks Coverage Overlay ---\n"));
      // A real istanbul report whose paths belong to a DIFFERENT checkout binds nothing, and the old
      // message blamed a missing `analyze`. Showing one path from each side is the only thing that
      // tells the reader which of the two is wrong (ADR 0116).
      if (bound.length === 0) {
        console.log(chalk.yellow(
          `  The coverage report bound to none of this project's ${nodes.length} functions.\n` +
          `    report names:  ${[...registry.coverage.parse(covPath).ranByFile.keys()][0] ?? "(the report is empty — nothing was instrumented)"}\n` +
          `    graph holds:   ${nodes[0]?.file ?? "(the graph holds no function with a line span)"}\n` +
          `  Those are different trees. The report is from another checkout, or this vault is.`
        ));
      } else if (rows.length === 0) {
        console.log(chalk.yellow(`  Every bound function is dark — pass --all to list them.`));
      }
      for (const r of rows) {
        const filled = Math.round(r.pct / 10);
        const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(10 - filled));
        const label = r.pct >= 99 ? chalk.green("FULL") : r.pct === 0 ? chalk.gray("DARK") : chalk.yellow("PART");
        const short = r.file.split("/").slice(-1)[0];
        const br = r.branchTotal > 0
          ? "  " + (r.branchTaken < r.branchTotal ? chalk.magenta : chalk.dim)(`${r.branchTaken}/${r.branchTotal} br`)
          : "";
        console.log(`  [${bar}] ${String(r.pct).padStart(3)}%  ${label}  ${r.name.padEnd(22)} ${chalk.dim(short + ":" + r.start + "-" + r.end)}${br}`);
      }
      console.log(
        `\n  ${chalk.green(full + " full")} · ${chalk.yellow(part + " partial")} · ${chalk.gray(dark + " dark")}` +
        `   (${bound.length} functions bound of ${nodes.length} with spans)`
      );
      if (!showAll && dark > 0) console.log(chalk.dim(`  (${dark} dark hidden — pass --all to show untested/dead functions)`));
      console.log();
    } finally {
      await closePersistence(registry);
    }
  }
}
