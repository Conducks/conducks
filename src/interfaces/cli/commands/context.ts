import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph, closePersistence } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";
import { displayPath, displayId, nameLookupFrom } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Context Command
 *
 * ONE answer, two renderings (todo57, ADR 0148). This command used to walk its own directional flow
 * trace while `conducks_context` ran a scored BFS — same question, two implementations, one name.
 * MEASURED on `resolveSymbolId` before the change: **2,407 entries against the tool's 83, sharing 44
 * names.** Of the CLI's 2,407, 247 were unresolved `node` placeholders and 196 were whole files, so
 * it was not a richer answer, it was a dump of everything reachable.
 *
 * Both now call `registry.kinetic.context`. What is kept from the old command is the part ADR 0148
 * calls rendering and names explicitly — SOURCE LINES, which the tool does not return and which are
 * the reason to read this in a terminal at all.
 */
export class ContextCommand implements ConducksCommand {
  public id = "context";
  public description = "View the scored neighbourhood around a symbol";
  public usage = "conducks context <symbolId> [--radius <n>] [--include-atoms] [--limit <n>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const includeAtoms = args.includes('--include-atoms');

    const numeric = (flag: string, fallback: number): number | null => {
      const at = args.indexOf(flag);
      if (at === -1) return fallback;
      const raw = args[at + 1];
      const n = Number(raw);
      // An unparseable bound is an ERROR, not a silent fallback to the default: `impact` read an
      // unknown direction as upstream and answered a question nobody asked (todo53).
      if (!raw || raw.startsWith('-') || !Number.isFinite(n) || n <= 0) {
        console.error(`Error: ${flag} needs a positive number — got "${raw ?? ''}".`);
        return null;
      }
      return n;
    };

    const radius = numeric('--radius', 2);
    if (radius === null) { process.exitCode = 1; return; }
    const limit = numeric('--limit', 30);
    if (limit === null) { process.exitCode = 1; return; }

    // `indexOf` returns -1 when the flag is ABSENT, and -1 + 1 is 0 — which marked argument zero,
    // the symbol itself, as a flag's value and made every invocation without flags report "provide a
    // symbol ID". Guard each index rather than adding one to it blind (the shape `trace.ts` uses).
    const radiusAt = args.indexOf('--radius');
    const limitAt = args.indexOf('--limit');
    const flagValues = new Set([
      radiusAt > -1 ? radiusAt + 1 : -1,
      limitAt > -1 ? limitAt + 1 : -1,
    ]);
    const symbolId = args.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name).");
      process.exitCode = 1;
      return;
    }

    try {
      await syncGraph(registry);
      const g = registry.query.graph.getGraph();
      const resolvedId = resolveSymbol(symbolId, g);

      const scored = registry.kinetic.context(resolvedId, { radius, includeAtoms });
      const shown = scored.slice(0, limit);

      if (useJson) {
        // The tool's fields, so `--json` and the tool carry the same data (ADR 0148). The BOUND is
        // stated rather than implied: `total_in_radius` against what was shown is the denominator
        // that makes a short list readable as short rather than as empty (ADR 0091/0145).
        process.stdout.write(JSON.stringify({
          symbol: resolvedId,
          radius,
          total_in_radius: scored.length,
          nodes: shown,
          truncated: scored.length > shown.length,
        }, null, 2) + '\n');
        return;
      }

      if (scored.length === 0) {
        console.log(`No neighbourhood found for ${resolvedId} within radius ${radius}.`);
        return;
      }

      const reader = registry.source.lineReader();
      const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
      // Was a bare prefix strip: it shortened the path but repaired NOTHING, so both halves came
      // out as the lowercased id stores them. `displayPath` recovers the on-disk spelling for the
      // file rows below, and the header — which prints an ID, not a path — goes through `displayId`
      // so its SYMBOL half is real too. The header used to read `::registeripchandlers` while this
      // very command printed `onToken` correctly two lines further down, off the name column.
      const rel = (p: string) => displayPath(p, projectRoot);

      console.log(`--- Context: ${displayId(resolvedId, projectRoot, nameLookupFrom(g))} (radius ${radius}) ---`);

      // CALLERS, NAMED AS SUCH — kept from the pre-todo57 command because todo38#P2 put it there for
      // a reason: `context fetchUser` once answered with six steps of containment and never named
      // `main`, its only caller. The scored neighbourhood CONTAINS callers (the BFS walks upstream
      // too) but does not label them, and "who calls this" is the first question a reader has.
      //
      // This is rendering, not a second answer: it re-labels part of the same neighbourhood using
      // `getImpact`, which is why it does not belong in the shared domain function.
      // A CLASS IS NOT CALLED, IT IS CONSTRUCTED — and this accepted `CALLS` alone, so for every
      // class the section vanished silently.
      //
      // MEASURED on the scraper subject: `Hands` is the project's top symbol, `impact Hands upstream`
      // reports 153 affected symbols including `Hands._annotate_groups(root)` at hands.py:1053 and
      // `hands.ingest_blueprint(...)` at mapper_runner.py:693 — and `context Hands` printed no caller
      // section at all. Two commands, one graph, opposite answers to "who uses this".
      //
      // The heading keeps the word "Called" because that is the common case and the wording is
      // pinned by tests/integration/features/traversal-truth.test.ts; each row now names its own
      // relation, so a construction is not reported as a call.
      const USE_EDGES = new Set(['CALLS', 'CONSTRUCTS', 'ACCESSES', 'EXTENDS', 'IMPLEMENTS', 'TYPE_REFERENCE']);
      // Asked at depth 2 and filtered to ONE EDGE, because the depth argument is a WEIGHTED distance:
      // a `CONSTRUCTS` edge weighs 1.2, so `depth: 1` excluded the only user of every class even
      // after the edge set above was widened. Path LENGTH is the honest expression of "direct user".
      const callers = registry.kinetic.getImpact(resolvedId, 'upstream', 2).affectedNodes
        .filter((n: any) => n.path.length === 1 && USE_EDGES.has(n.path[0]));
      if (callers.length > 0) {
        console.log(`  Called by / used by:`);
        for (const c of callers) {
          const at = c.filePath !== 'unknown' ? `${rel(c.filePath)}${c.line ? `:${c.line}` : ''}` : 'unknown';
          const relation = String(c.path[c.path.length - 1]).toLowerCase();
          console.log(`    ← ${c.name} (${at})  \x1b[2m[${relation}]\x1b[0m`);
        }
        console.log(`  In radius:`);
      }
      for (const n of shown) {
        const file = String(n.file || '');
        const at = file ? `${rel(file)}${n.line ? `:${n.line}` : ''}` : 'unknown';
        console.log(`  ${n.relevance_score.toFixed(4)}  ${String(n.kind).padEnd(10)} ${n.name}  (${at})`);
        // THE reason to read this in a terminal: the declaration itself, under its row.
        if (file && n.line) {
          const src = reader.read(file, n.line);
          if (src.text) console.log(`        ${src.text.trim()}`);
        }
      }
      if (scored.length > shown.length) {
        console.log(`  … ${scored.length - shown.length} more of ${scored.length} in radius (raise --limit).`);
      }
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await closePersistence(registry);
    }
  }
}
