import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";

/**
 * Conducks — Cohesion Command
 *
 * Jaccard similarity between two symbols' downstream neighbourhoods.
 *
 * Measured before the fix (ADR 0115): `cohesion zzzNoSuchA zzzNoSuchB` reported `0.00%` and exited
 * 0. `getCohesionVector` returns 0 when a neighbour set is empty, and a symbol that does not exist
 * has no neighbours — so "these two share nothing" and "neither of these is real" printed the same
 * number. Both arguments must exist before a similarity means anything.
 */
export class CohesionCommand implements ConducksCommand {
  public id = "cohesion";
  public description = "Calculate structural similarity between two symbols";
  public usage = "conducks cohesion <id1> <id2> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const positional = args.filter(a => !a.startsWith('--'));
    const [s1, s2] = positional;

    if (!s1 || !s2) {
      console.error("Usage: conducks cohesion <id1> <id2> [--json]");
      process.exit(1);
      return;
    }

    await syncGraph(registry);
    const graph = registry.query.graph.getGraph();

    const resolve = (input: string): string | null => {
      if (graph.getNode(input)) return input;
      if (graph.findNodesByName(input).length === 0) return null;
      return resolveSymbol(input, graph);
    };

    const a = resolve(s1);
    const b = resolve(s2);
    const missing = [!a ? s1 : null, !b ? s2 : null].filter(Boolean);
    if (missing.length > 0) {
      console.error(`\x1b[31mError: not found in the Synapse: ${missing.join(', ')}\x1b[0m`);
      console.error(`A similarity against a symbol that does not exist is not 0% — it is undefined.`);
      process.exit(1);
      return;
    }

    try {
      const vector = registry.explain.getCohesionVector(a!, b!);
      if (useJson) {
        process.stdout.write(JSON.stringify({ a, b, similarity: vector }, null, 2) + '\n');
        return;
      }
      console.log(`\n\x1b[1m--- Structural Cohesion Report ---\x1b[0m`);
      console.log(`\x1b[2mA:\x1b[0m ${a}`);
      console.log(`\x1b[2mB:\x1b[0m ${b}`);
      console.log(`\x1b[35mVector Similarity:\x1b[0m ${(vector * 100).toFixed(2)}%`);
      if (vector === 0) {
        console.log(`\x1b[2m- Both symbols exist and share no downstream neighbours.\x1b[0m`);
      }
    } catch (err) {
      console.error(`Cohesion Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
