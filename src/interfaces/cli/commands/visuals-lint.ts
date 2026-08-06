import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Visuals Lint Command 🖼️🛡️
 *
 * Checks every anchor a diagram makes against the working tree. The conducks-docs standard names this
 * gap in its own words (§5.4): `visuals/` is parsed but not grammar-checked, and "nothing catches a
 * `visuals/` file going stale but a reader". This is that check.
 *
 * It only ever judges the DERIVED half (ADR 0001, ADR 0142). Whether a symbol still exists and whether
 * a constant still holds its value are computable, so they are enforced. Why the drawing was made, and
 * what it means, are authored — no linter has an opinion on those.
 *
 * Exits non-zero on any error, so it works as a CI gate exactly like `docs-lint`. A warning does not
 * fail the run: a symbol heuristic that cannot parse should not be able to block a commit, or the gate
 * gets disabled and the errors go with it.
 */
export class VisualsLintCommand implements ConducksCommand {
  public id = "visuals-lint";
  public description = "Check every anchor in docs/visuals against the code it claims to describe";
  public usage = "conducks visuals-lint [path] [--stamp [page]]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const stampIdx = args.indexOf("--stamp");
    // The token after --stamp is a PAGE only when it looks like one; `visuals-lint --stamp .` still
    // means "stamp everything under .".
    const isPage = (a: string | undefined): a is string => a !== undefined && /\.(md|html|svg)$/i.test(a);
    const stampPage = stampIdx !== -1 && isPage(args[stampIdx + 1]) ? args[stampIdx + 1] : undefined;
    const posArg = args.find((a, i) => !a.startsWith("--") && a !== stampPage);
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    // `--stamp [page]` records resolving anchors' span hashes as reviewed-now (ADR 0141). It is the
    // act of saying "I re-read these claims against the code" — so it runs INSTEAD of judging, and
    // the next plain run compares against what was stamped. With a page path it stamps that one
    // page; without, it re-stamps EVERYTHING, which is an assertion the caller has to mean
    // (ADR 0142) — so the all-form says what it is doing, loudly.
    if (stampIdx !== -1) {
      const only = stampPage;
      const n = await registry.visuals.stamp(root, only);
      if (only) {
        console.log(chalk.green(`\n  ✓ stamped ${n} anchor(s) in ${only} as reviewed.\n`));
      } else {
        console.log(chalk.green(`\n  ✓ stamped ${n} anchor(s) as reviewed — ACROSS ALL PAGES.`));
        console.log(chalk.yellow(`    A stamp asserts "I re-read this claim against the code." If that is only true for`));
        console.log(chalk.yellow(`    one page, stamp that page: visuals-lint --stamp <page-path>\n`));
      }
      return;
    }

    const report = await registry.visuals.lint(root);

    // NOTHING TO LINT IS NOT A PASS — the same rule docs-lint learned the hard way (ADR 0124). But it
    // is also not a failure here, and that difference is deliberate: every repo is expected to have
    // docs, while §6.13 says a picture is drawn only when someone asks for one. So: say so, exit 0.
    if (report.pages === 0) {
      console.log(chalk.dim(`\n  ·  No docs/visuals/ under ${root} — nothing was checked.\n`));
      return;
    }

    const errors = report.violations.filter(v => v.severity === "error");
    const warns = report.violations.filter(v => v.severity === "warn");

    if (report.violations.length === 0) {
      console.log(chalk.green(
        `\n  ✓ visuals-lint clean — ${report.checked} anchors across ${report.pages} page(s) still match the code.\n`));
      await this.driftGate(root, registry);
      return;
    }

    console.log(chalk.bold("\n--- 🖼️🛡️  Conducks Visuals Lint ---\n"));

    // Grouped by page: a reader fixes one page at a time, and an interleaved list makes them hunt.
    const pages = [...new Set(report.violations.map(v => v.page))].sort();
    for (const p of pages) {
      const mine = report.violations.filter(v => v.page === p);
      console.log(chalk.bold(`  ${p}`) + chalk.dim(`  (${mine.length})`));
      for (const v of mine) {
        const tag = v.severity === "error" ? chalk.red("  ✗") : chalk.yellow("  ⚠");
        console.log(`${tag} ${chalk.cyan(v.anchor)}`);
        console.log(`      ${chalk.dim(v.reason)}`);
      }
      console.log("");
    }

    const parts: string[] = [];
    if (errors.length) parts.push(chalk.red(`${errors.length} broken anchor(s)`));
    if (warns.length) parts.push(chalk.yellow(`${warns.length} warning(s)`));
    console.log(`  ${parts.join(", ")} — ${chalk.green(`${report.checked} still true`)}.\n`);

    if (errors.length > 0) process.exitCode = 1;
    await this.driftGate(root, registry);
  }

  /**
   * The second half of the gate (ADR 0139): anchors prove what a page CLAIMS still resolves; this
   * proves the page was RE-DRAWN after its data changed — a staleness anchors cannot see. Runs only
   * when the repo declares its generator (`conducks.json` → `visuals.generate`); the skip is printed,
   * never silent, because a gate that checks less than it appears to is worse than no gate (ADR 0124).
   */
  private async driftGate(root: string, registry: Registry): Promise<void> {
    // Review stamps first (ADR 0141): a resolving anchor whose cited span changed since the last
    // `--stamp` is flagged for a re-read. Warn, never fail — only a reader can judge the claim.
    const review = await registry.visuals.review(root);
    if (review.flags.length > 0) {
      console.log(chalk.yellow(`  ⚠ ${review.flags.length} reviewed claim(s) cite code that changed since the last stamp:`));
      for (const f of review.flags) console.log(chalk.yellow(`      - ${f.page} → ${f.anchor}`));
      console.log(chalk.dim(`      Re-read each claim, then \`conducks visuals-lint --stamp <page>\`.\n`));
    } else if (review.stamped > 0) {
      console.log(chalk.green(`  ✓ review stamps clean — ${review.stamped} reviewed claim(s) cite unchanged code.\n`));
    }
    // A stamp whose claim vanished from the page is SEEN vanishing (ADR 0142) — silence here would
    // make editing the note the way around the gate.
    if (review.orphans.length > 0) {
      console.log(chalk.dim(`  ·  ${review.orphans.length} stamp(s) cite claims no longer in their page (deleted or re-pointed) — pruned by the next --stamp of that page:`));
      for (const o of review.orphans) console.log(chalk.dim(`      - ${o.page} → ${o.key}`));
      console.log("");
    }

    const drift = await registry.visuals.drift(root);
    if (drift.derivedHeaderMissing && drift.derivedHeaderMissing.length > 0) {
      console.log(chalk.yellow(`  ⚠ ${drift.derivedHeaderMissing.length} generated page(s) carry no DERIVED header — an edit made there is discarded by the next render:`));
      for (const p of drift.derivedHeaderMissing) console.log(chalk.yellow(`      - ${p}`));
      console.log("");
    }
    if (drift.status === "skipped") {
      if (drift.command !== null) return; // declared but nothing to diff — the lint already said the folder is empty
      console.log(chalk.dim(`  ·  drift not checked — no visuals.generate declared in conducks.json\n`));
      return;
    }
    if (drift.status === "crashed") {
      console.log(chalk.red(`  ✗ the declared generator itself refused to run (${drift.command}):`));
      console.log(chalk.dim(drift.output.trim().split("\n").map(l => `      ${l}`).join("\n")) + "\n");
      process.exitCode = 1;
      return;
    }
    if (drift.status === "drift") {
      console.log(chalk.red(`  ✗ drift — ${drift.files.length} page(s) are stale against the data they are generated from:`));
      for (const f of drift.files) console.log(chalk.red(`      - ${f}`));
      console.log(chalk.dim(`      Run \`${drift.command}\` and commit the result.\n`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`  ✓ drift clean — ${drift.files} file(s) match a fresh render (${drift.command}).\n`));
  }
}
