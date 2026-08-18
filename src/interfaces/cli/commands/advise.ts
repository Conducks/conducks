import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import type { Advice } from "@/contracts/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import { verdict, renderVerdict, verdictToJson } from "@/contracts/index.js";
import { displayId } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Advise Command
 *
 * FIRST surface migrated to `Verdict` (ADR 0124 made enforceable). It printed
 * `✅ Structural Integrity is Pristine. No sins detected.` whenever the advice list came back empty,
 * with no denominator anywhere — so "we examined 5,294 symbols and found nothing" and "we examined
 * nothing" rendered as the same tick, which is the defect this repository has now hit nine times.
 *
 * On a vault with 0 symbols it did not even reach that line: it walked an unmaterialised graph and
 * died on the `getAllNodes` guard, so the nothing-to-check case surfaced as an internal error. The
 * denominator is now read FIRST, and zero short-circuits to a stated answer instead of a walk.
 */
export class AdviseCommand implements ConducksCommand {
  public id = "advise";
  public description = "Get architectural recommendations";
  public usage = "conducks advise [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    try {
      // The DENOMINATOR, read before any advice is computed. The advisor walks the graph, so the
      // symbols it walked are what "no sins detected" is a statement about — and with none, there is
      // nothing to be pristine about.
      await registry.infrastructure.ensureGraphLoaded();
      const examined = registry.query.graph.getGraph().stats.nodeCount;

      // Short-circuit on an empty vault rather than walking it: this used to reach the advisor and
      // die on the unmaterialised-graph guard, reporting the absence of a graph as a crash.
      const advice: Advice[] = examined > 0 ? await registry.audit.advise() : [];
      const v = verdict(examined, advice, 'the vault holds no symbols — run `conducks analyze` first');

      if (useJson) {
        // `{status, checked, found}`, not a bare array. An empty array cannot distinguish "examined
        // thousands, found nothing" from "examined nothing", and a machine reader acts on that
        // silently.
        process.stdout.write(JSON.stringify(verdictToJson(v), null, 2) + '\n');
        return;
      }

      // Relative, real-case ids: this command prints three per finding and there were 104 findings
      // on the orchestrator subject (ADR 0132).
      const adviseRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
      console.log(`\n\x1b[1m--- 💎 Conducks Architecture Advisor ---\x1b[0m`);
      console.log(renderVerdict(v, {
        nothing: why => `\x1b[33m⚠ nothing was checked\x1b[0m — ${why}`,
        clean: n => `✅ No architectural advice — \x1b[1m${n}\x1b[0m symbol(s) examined.`,
        findings: (found, n) => `${found.length} finding(s) across \x1b[1m${n}\x1b[0m symbol(s) examined:`,
      }));

      advice.forEach((a: Advice) => {
        const color = a.level === 'ERROR' ? '\x1b[31m' : a.level === 'WARNING' ? '\x1b[33m' : '\x1b[34m';
        console.log(`${color}- [${a.type}] ${a.message}\x1b[0m`);
        a.nodes.slice(0, 3).forEach((n: string) => console.log(`  └─ ${displayId(n, adviseRoot)}`));
        if (a.nodes.length > 3) console.log(`  ... and ${a.nodes.length - 3} more`);
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await closePersistence(registry);
    }
  }
}
