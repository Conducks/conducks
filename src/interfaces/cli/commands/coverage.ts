import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import chalk from "chalk";
import { saveBaseline, loadBaseline, diffAgainstBaseline, defaultBaselinePath } from "@/lib/domain/analysis/coverage-baseline.js";

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
    const covPath = args.find(a => a.endsWith(".json") && !a.startsWith("--"));
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

      if (saveBaselineFlag) {
        const baselinePath = defaultBaselinePath();
        saveBaseline(bound, baselinePath);
        console.log(chalk.green(`\n✓ Saved coverage baseline for ${bound.length} functions → ${baselinePath}\n`));
        if (!vsBaseline) return;
      }

      if (vsBaseline) {
        const baselinePath = defaultBaselinePath();
        const baseline = loadBaseline(baselinePath);
        if (!baseline) {
          console.error(chalk.red(`No baseline found at ${baselinePath}. Run with --save-baseline first.`));
          process.exitCode = 1;
          return;
        }
        const drift = diffAgainstBaseline(bound, baseline);
        const regressed = drift.filter(d => d.status === "REGRESSED");
        const improved = drift.filter(d => d.status === "IMPROVED");
        const created = drift.filter(d => d.status === "NEW");
        const same = drift.filter(d => d.status === "SAME");

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
      if (rows.length === 0) {
        console.log(chalk.yellow("  No BEHAVIOR nodes matched the coverage file. (Ran `analyze` on this repo first?)"));
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
