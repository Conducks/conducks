import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { tryResolveSymbol } from "@/interfaces/cli/shared/error.js";

/**
 * Conducks — Entropy Command
 *
 * Ownership fragmentation for one symbol, read from git history.
 *
 * Measured before the fix (ADR 0115): `entropy zzzNoSuchSymbol` printed `0.0000`, `0` authors and
 * `0.00%` risk, and exited 0. A symbol that does not exist got a confident measurement. `entropy
 * IntraLinker` — a real class — did the same, because the raw argument went straight to the domain
 * as a literal node id and nothing resolved a bare name.
 *
 * Zero is a legitimate entropy value. That is exactly why it must never be printed for a symbol the
 * graph does not hold: the reader cannot tell the two apart.
 */
export class EntropyCommand implements ConducksCommand {
  public id = "entropy";
  public description = "Measure ownership entropy (author fragmentation) for a symbol";
  public usage = "conducks entropy <symbolId> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const symbolId = args.find(a => !a.startsWith('--'));
    if (!symbolId) {
      console.error("Usage: conducks entropy <symbolId> [--json]");
      process.exit(1);
      return;
    }

    await syncGraph(registry);
    const graph = registry.query.graph.getGraph();

    // Resolve like every other symbol command, and REFUSE what the graph does not hold.
    //
    // The absence check used to be `findNodesByName(symbolId).length === 0`, which matches a NAME —
    // so every `path/file.ts::name` id failed it and was declared missing before the resolver that
    // handles `::` ever ran. That is the exact form `status` prints, and `impact`/`trace`/`context`
    // accept it. `tryResolveSymbol` answers null for a real miss, so this command keeps its own
    // wording without pre-judging what counts as findable.
    let resolvedId = symbolId;
    if (!graph.getNode(symbolId)) {
      const resolved = tryResolveSymbol(symbolId, graph);
      if (resolved === null) {
        console.error(`\x1b[31mError: Symbol "${symbolId}" not found in the Synapse.\x1b[0m`);
        console.error(`Run: conducks query "${symbolId}" to find valid symbol IDs.`);
        process.exit(1);
        return;
      }
      resolvedId = resolved;
    }

    const res = await registry.explain.calculateEntropy(resolvedId) as any;
    const entropy = Number(res?.entropy ?? 0);
    const risk = Number(res?.risk ?? 0);
    const authorCount = Number(res?.authorCount ?? 0);

    if (useJson) {
      process.stdout.write(JSON.stringify({
        id: resolvedId, entropy, authorCount, ownershipRisk: risk,
      }, null, 2) + '\n');
      return;
    }

    const node = graph.getNode(resolvedId);
    console.log(`\n\x1b[35mStructural Entropy:\x1b[0m ${entropy.toFixed(4)}`);
    console.log(`\x1b[2mSymbol:\x1b[0m ${node?.properties?.name ?? resolvedId} (${node?.properties?.filePath ?? '?'})`);
    console.log(`\x1b[36mUnique Authors Touch:\x1b[0m ${authorCount}`);
    console.log(`\x1b[33mOwnership Risk Factor:\x1b[0m ${(risk * 100).toFixed(2)}%`);
    if (authorCount === 0) {
      // Distinguish "one author, no fragmentation" from "git history says nothing here".
      console.log(`\x1b[2m- No authorship history for this symbol; entropy is 0 because nothing was measured.\x1b[0m`);
    }
    console.log(`\x1b[34m- Note: this measures social fragmentation and ownership drift.\x1b[0m`);
  }
}
