import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Flows Command (Behavioral Processes)
 */
export class FlowsCommand implements ConducksCommand {
  public id = "flows";
  public description = "List behavioral processes across the Synapse";
  public usage = "conducks flows [--min-members <n>] [--limit <n>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');

    // MIRROR THE TOOL. `conducks_flows` takes min_members and limit; the CLI hard-coded a floor of 2
    // and no cap, so "flows with at least five members" was answerable from one surface only
    // (todo61). Both values are refused rather than defaulted when they do not parse — the rule
    // `impact --depth`, `trace --limit` and `prune --limit` already follow.
    const num = (flag: string, min: number): number | undefined => {
      const at = args.indexOf(flag);
      if (at === -1) return undefined;
      const v = Number(args[at + 1]);
      if (!Number.isInteger(v) || v < min) {
        console.error(`Error: ${flag} needs an integer ${min} or greater, got "${args[at + 1] ?? ''}".`);
        process.exit(1);
      }
      return v;
    };
    const minMembers = num('--min-members', 1) ?? 2;
    const limit = num('--limit', 1);

    await syncGraph(registry);

    const processes = registry.kinetic.getProcesses();
    // A flow of ONE symbol is not a flow, and hiding it silently meant a project whose flows were
    // all single-member printed a heading and nothing — indistinguishable from having none. The
    // count of what was hidden is stated instead (ADR 0115).
    const matching = Object.entries(processes).filter(([, m]) => (m as string[]).length >= minMembers);
    const shown = limit === undefined ? matching : matching.slice(0, limit);
    const hidden = Object.keys(processes).length - matching.length;

    if (useJson) {
      // CARRY THE DENOMINATOR (ADR 0115/0145, CONDUCKS-37). This emitted a bare array, so `[]` meant
      // both "this project has no flows" and "it has 4 and none of them matched" — the rendered path
      // three lines below has always said which, and the MCP tool returns `{total, matching, shown}`.
      // `--json` is the CLI's machine surface and should carry the same data the tool does
      // (ADR 0148); dropping the count there is losing it exactly where a machine reads it.
      // MEASURED on a 4-flow fixture: rendered said "4 single-symbol flow(s) were not shown", the
      // tool said `total: 4, matching: 0`, and `--json` said `[]`.
      process.stdout.write(JSON.stringify({
        flows: shown.map(([name, members]) => ({ name, symbols: members as string[] })),
        total: Object.keys(processes).length,
        matching: matching.length,
        shown: shown.length,
      }, null, 2) + '\n');
      return;
    }

    console.log("\x1b[1m--- 🌊 Behavioral Processes ---\x1b[0m");
    if (shown.length === 0) {
      console.log(hidden > 0
        ? `No multi-symbol flows. ${hidden} single-symbol flow(s) were not shown.`
        : "No behavioral flows detected.");
      return;
    }

    for (const [name, members] of shown) {
      const list = members as string[];
      console.log(`\x1b[35m- ${name} Flow (${list.length} symbols)\x1b[0m`);
      list.slice(0, 5).forEach((m: string) => console.log(`  └─ ${m}`));
      if (list.length > 5) console.log(`  ... and ${list.length - 5} more`);
    }
  }
}
