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
  public usage = "conducks docs-status [--json] [--all] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes("--json");
    const showAll = args.includes("--all");
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const board = registry.docs.board(root);

    if (useJson) { console.log(JSON.stringify(board, null, 2)); return; }

    console.log(chalk.bold("\n--- 📄 Conducks Docs Status ---\n"));

    const phaseLine = (p: PhaseRow, indent = "    ") => {
      const count = chalk.dim(`${p.done}/${p.total}`.padEnd(6));
      if (p.state === "blocked")
        return `${indent}${p.addr.padEnd(14)} ${count} ${chalk.red("⛔ waits " + p.blockedBy.join(", "))}`;
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
        console.log(`  ${t.id.padEnd(8)} ${String(t.overallPct).padStart(3)}%  ${chalk.dim(t.done + "/" + t.total)}  ${t.state || "—"}`);
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
    if (board.warns.length) {
      const n = board.warns.reduce((a, w) => a + w.errs.length, 0);
      console.log(chalk.yellow(`\n  ⚠ ${n} hygiene warning(s):`));
      for (const w of board.warns) for (const e of w.errs) console.log(chalk.dim(`      ${w.file}: `) + e);
    }
    if (board.lint.length) {
      console.log(chalk.red(`\n  ✖ ${board.lint.length} file(s) break the grammar — run \`conducks docs-lint\`.`));
    } else {
      console.log(chalk.dim("\n  grammar: clean ✓"));
    }
    console.log();
  }
}

interface PhaseRow {
  addr: string; done: number; total: number; next: string | null;
  state: string; blockedBy: string[]; builds: string[];
}
