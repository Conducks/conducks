import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Docs Status Command 📄🟩
 *
 * The open threads in the docs, rooted at the decisions that own them: ADR → the todo phases that
 * build it → the next task in each. Finished work is absent by design — the board is the table, not
 * the history — and `--all` brings back the closed records for a review pass.
 *
 * A summary and a set of links, never a copy: every line is an address (`todo09#P2`) or a state, so
 * it can point at a doc without becoming a second, drifting version of it.
 */
export class DocsStatusCommand implements ConducksCommand {
  public id = "docs-status";
  public description = "Open work in the docs, rooted at the ADRs that own it";
  public usage = "conducks docs-status [--json] [--all] [--root-only] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes("--json");
    const showAll = args.includes("--all");
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    // Recursive by default: a monorepo keeps a docs/ per unit, and reading only the root shows a
    // fraction of the open work. Trees are kept SEPARATE, not merged — a merged board loses which unit
    // each todo belongs to, and `todo01#P1` is only an address within its own tree. Both `treeShapeLint`
    // and `crossTreeLint` are already applied by `buildTrees`, so a misplaced file or a dangling
    // `app:todo42` shows up here exactly as it does from `docs-lint`.
    const rootOnly = args.includes("--root-only");
    const trees = registry.docs.trees(root, { rootOnly });

    if (useJson) {
      const payload = trees.length === 1
        ? trees[0].board
        : Object.fromEntries(trees.map(t => [t.label, t.board]));
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    for (const { label, board } of trees) this.renderTree(label, trees.length > 1, board, showAll, registry.docs.governedCount(board));
  }

  /** Renders ONE docs tree. `labelled` is false for a single-repo project, where a header is noise. */
  // `governed` is passed in rather than computed here: the count lives in the domain and
  // `cli -> domain` is a forbidden static import, enforced by the boundary test.
  private renderTree(label: string, labelled: boolean, board: ReturnType<Registry["docs"]["board"]>, showAll: boolean, governed: number): void {
    console.log(chalk.bold(labelled ? `\n--- 📄 Conducks Docs Status — ${label} ---\n` : "\n--- 📄 Conducks Docs Status ---\n"));

    // `3/4 · 1 deferred` (ADR 0034) — deferred already left the `p.done/p.total` denominator, so
    // without this suffix a parked task would be invisible here even though it is still real work
    // someone owes, just not this phase.
    const countOf = (p: { done: number; total: number; deferred: number }) =>
      `${p.done}/${p.total}` + (p.deferred ? ` · ${p.deferred} deferred` : "");

    const phaseLine = (p: PhaseRow, indent = "    ") => {
      const count = chalk.dim(countOf(p).padEnd(6));
      if (p.state === "blocked") {
        // Two causes now (ADR 0034): an unmet `- Depends:` names phase addresses, a phase-level
        // `- Blocked by:` names a reason instead — blockedBy alone would print "waits " with nothing
        // after it for the second cause.
        const cause = p.blockedBy.length ? p.blockedBy.join(", ") : (p.blockedReason ?? "");
        return `${indent}${p.addr.padEnd(14)} ${count} ${chalk.red("⛔ waits " + cause)}`;
      }
      const next = p.next ? chalk.dim("→ ") + String(p.next).slice(0, 68) : chalk.dim("→ (no open task)");
      return `${indent}${p.addr.padEnd(14)} ${count} ${next}`;
    };

    // DECISIONS THAT STILL OWE WORK — the question that otherwise costs a walk through every record.
    const owing = board.decisions.filter(d => d.buildState === "partial" || d.buildState === "unbuilt");
    if (owing.length) {
      console.log(chalk.bold("  Decisions with open work"));
      for (const d of owing) {
        const dead = /^superseded$/i.test(d.state || "");
        const tag = dead ? chalk.red(`superseded by ${d.statusRefs.join(", ")} · ${d.buildState}`)
          : chalk.yellow(d.buildState);
        console.log(`  ${chalk.bold(d.id)}  ${String(d.title).replace(/^\d+\s*—\s*/, "").slice(0, 46).padEnd(47)} ${tag}`);
        for (const p of d.builtBy as PhaseRow[]) if (p.state !== "done") console.log(phaseLine(p));
        if (d.enforcedBy) console.log(chalk.dim(`    enforced by: ${d.enforcedBy}`));
      }
      console.log();
    }

    // OPEN WORK NOBODY LINKED TO A DECISION — valid, but it should be a deliberate choice.
    const unlinked = board.todos
      .filter(t => !/^done$/i.test(t.state || ""))
      .map(t => ({ t, phases: (t.phases as PhaseRow[]).filter(p => p.state !== "done" && !p.builds.length) }))
      .filter(x => x.phases.length);
    if (unlinked.length) {
      console.log(chalk.bold("  Open work, no decision linked"));
      for (const { t, phases } of unlinked) {
        console.log(`  ${chalk.bold(t.id)}  ${String(t.title).replace(/^\S+\s*—\s*/, "").slice(0, 46).padEnd(47)} ${chalk.dim(t.done + "/" + t.total)}`);
        for (const p of phases) console.log(phaseLine(p));
      }
      console.log();
    }

    if (!owing.length && !unlinked.length) console.log(chalk.green("  Nothing open. Every phase is finished.\n"));

    // PARKED records, stated even when nothing is open. A todo deferred with reopen-triggers has no
    // open phase, so the loop above skips it and "Nothing open" printed over the top of it — which is
    // how `todo31` stayed invisible for weeks while claiming `Status: todo` (todo31, 2026-08-09).
    const parked = board.todos
      .filter(t => !/^done$/i.test(String(t.state || "")))
      .filter(t => !t.phases.some((p: { state: string; builds: unknown[] }) => p.state !== "done" && !p.builds.length))
      .filter(t => t.deferred);
    if (parked.length) {
      // The STATUS is printed, not assumed: `todo16` is `blocked` (waiting on a command only Said can
      // run) and `todo31` is `todo` (deferred with triggers). Both were equally invisible; calling
      // them both "parked" would trade one wrong impression for another.
      console.log(chalk.dim(`  Not open, not finished — no phase left to do, and not in completed/`));
      for (const t of parked) {
        const state = String(t.state || "todo").toLowerCase();
        console.log(`  ${chalk.bold(t.id)}  ${String(t.title).replace(/^\S+\s*—\s*/, "").slice(0, 40).padEnd(41)} ${chalk.dim(state.padEnd(8))} ${chalk.dim(t.deferred + " deferred")}`);
      }
      console.log();
    }

    if (showAll) {
      console.log(chalk.bold("  All decisions"));
      for (const d of [...board.decisions].sort((a, b) => (a.id > b.id ? 1 : -1))) {
        const refs = [...(d.amendedBy ?? []), ...(d.statusRefs ?? [])];
        const colour = /^superseded$/i.test(d.state || "") ? chalk.gray : /^amended$/i.test(d.state || "") ? chalk.yellow : chalk.green;
        console.log(`  ${d.id}  ${String(d.title).replace(/^\d+\s*—\s*/, "").slice(0, 44).padEnd(45)} ${colour(d.state || "—")}` +
          (refs.length ? chalk.dim(" → " + refs.join(", ")) : "") + chalk.dim(`  [${d.buildState}]`));
      }
      console.log(chalk.bold("\n  All todos"));
      for (const t of board.todos) {
        console.log(`  ${t.id.padEnd(8)} ${String(t.overallPct).padStart(3)}%  ${chalk.dim(countOf(t))}  ${t.state || "—"}`);
      }
      console.log();
    }

    // Freshness beats counts: the one living line that says whether the last session left a map.
    const handover = board.other.find(o => o.type === "handover");
    if (handover) {
      const stale = /stale/i.test(handover.status || "");
      console.log((stale ? chalk.yellow("  handover: stale") : chalk.dim("  handover: current")) +
        chalk.dim(` — ${handover.title}`));
    }

    if (board.unlinked.length) {
      console.log(chalk.dim(`\n  ${board.unlinked.length} ADR(s) with no build link or enforcing test: `) + chalk.dim(board.unlinked.join(" ")));
    }
    if (board.reviews?.length) {
      // A note that WAS checked against its module and no longer matches it. On the board rather than
      // in a separate report, because a stale architecture note is a docs fact (todo17 Phase 3).
      console.log(chalk.yellow(`\n  ⚠ ${board.reviews.length} architecture note(s) describe code that has changed since:`));
      for (const r of board.reviews) {
        const why = r.intent ? chalk.dim(` (intent: ${r.intent})`) : "";
        console.log(chalk.dim(`      ${r.moduleDoc}`) + chalk.dim(` ← ${r.module}`) + why);
      }
      console.log(chalk.dim(`      still accurate? conducks monitor --dismiss <module>`));
    }
    if (board.warns.length) {
      const n = board.warns.reduce((a, w) => a + w.errs.length, 0);
      console.log(chalk.yellow(`\n  ⚠ ${n} hygiene warning(s):`));
      for (const w of board.warns) for (const e of w.errs) console.log(chalk.dim(`      ${w.file}: `) + e);
    }
    if (board.lint.length) {
      console.log(chalk.red(`\n  ✖ ${board.lint.length} file(s) break the grammar — run \`conducks docs-lint\`.`));
    } else {
      // "clean ✓" over an empty tree said a project with no docs at all had healthy ones. The
      // denominator is what separates the two, and this line had none (ADR 0124).
      console.log(governed === 0
        ? chalk.yellow("\n  grammar: nothing to check — this tree holds no governed docs.")
        : chalk.dim(`\n  grammar: clean ✓ (${governed} governed docs)`));
    }
    console.log();
  }
}

interface PhaseRow {
  addr: string; done: number; total: number; deferred: number; next: string | null;
  state: string; blockedBy: string[]; blockedReason: string | null; builds: string[];
}
