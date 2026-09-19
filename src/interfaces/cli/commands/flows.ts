import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { displayId, nameLookupFrom } from "@/interfaces/cli/shared/display-path.js";
import { splitProjectSymbols } from "@/contracts/index.js";

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
    // COUNT THIS PROJECT'S SYMBOLS. A flow's member list includes the built-ins and unresolved
    // targets the walk reached (`global::set`, `react::usestate`, `external://unresolved/...`), and
    // both the displayed size and `--min-members` were computed from the inflated total — so a flow
    // of five built-ins passed a filter whose entire purpose is removing noise. MEASURED on sofie:
    // 2,071 of 23,042 members (8%) were synthesised.
    //
    // The full list is still carried and still shown; only the COUNT the caller filters and reads by
    // is now the project count, with the remainder stated rather than dropped.
    // KEYED BY THE ENTRY'S ID (ADR 0191). Keyed by NAME, two entries called `run` in different files
    // became one flow and the loser was never reported — 35% of scraper's entry points, 48% of
    // sofie's, 44% of orchestrator's.
    const sizes = new Map<string, { project: string[]; external: string[] }>();
    for (const p of processes) sizes.set(p.id, splitProjectSymbols(p.members));
    const projectSize = (id: string) => sizes.get(id)?.project.length ?? 0;

    const matching = processes.filter(p => projectSize(p.id) >= minMembers);
    const shown = limit === undefined ? matching : matching.slice(0, limit);
    const hidden = processes.length - matching.length;

    if (useJson) {
      // CARRY THE DENOMINATOR (ADR 0115/0145, see docs/visuals/modules/domain/governance.md). This emitted a bare array, so `[]` meant
      // both "this project has no flows" and "it has 4 and none of them matched" — the rendered path
      // three lines below has always said which, and the MCP tool returns `{total, matching, shown}`.
      // `--json` is the CLI's machine surface and should carry the same data the tool does
      // (ADR 0148); dropping the count there is losing it exactly where a machine reads it.
      // MEASURED on a 4-flow fixture: rendered said "4 single-symbol flow(s) were not shown", the
      // tool said `total: 4, matching: 0`, and `--json` said `[]`.
      process.stdout.write(JSON.stringify({
        // `symbols` keeps every member, so nothing a consumer already reads disappears; the two
        // counts beside it say how many of those are this project's code.
        flows: shown.map(p => ({
          // The entry's id, so a caller can address the flow it was actually given. Two flows may
          // share a `name`; they never share an `id`.
          id: p.id,
          name: p.name,
          symbols: p.members,
          project_members: projectSize(p.id),
          external_members: sizes.get(p.id)?.external.length ?? 0,
        })),
        total: processes.length,
        matching: matching.length,
        shown: shown.length,
      }, null, 2) + '\n');
      return;
    }

    // Ids are absolute and lowercased; a flow of 239 members printed 239 copies of the same ~90
    // character prefix in the wrong case. The id itself is untouched — only the display (ADR 0132).
    const projectRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
    console.log("\x1b[1m--- 🌊 Behavioral Processes ---\x1b[0m");
    if (shown.length === 0) {
      // NAME THE FLOOR THAT EMPTIED IT. This said "No multi-symbol flows. N single-symbol flow(s)
      // were not shown", which hardcodes the default floor of 2 into a sentence that has to describe
      // whatever floor was passed. MEASURED on sofie with `--min-members 9999`: it reported 4754
      // single-symbol flows while 1074 multi-symbol flows existed, one of them 227 members deep.
      // The count was right the whole time (`hidden = total - matching`); only the words were wrong.
      console.log(hidden > 0
        ? `No flow has ${minMembers} or more project symbols. ${hidden} flow(s) below that floor were not shown.`
        : "No behavioral flows detected.");
      return;
    }

    for (const p of shown) {
      const list = p.members;
      const ext = sizes.get(p.id)?.external.length ?? 0;
      console.log(`\x1b[35m- ${p.name} Flow (${projectSize(p.id)} symbols${ext > 0 ? ` · ${ext} external` : ''})\x1b[0m`);
      list.slice(0, 5).forEach((m: string) => console.log(`  └─ ${displayId(m, projectRoot, nameLookupFrom(registry.query.graph.getGraph()))}`));
      if (list.length > 5) console.log(`  ... and ${list.length - 5} more`);
    }
  }
}
