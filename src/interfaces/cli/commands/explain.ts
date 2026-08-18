import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";
import { tryResolveSymbol } from "@/interfaces/cli/shared/error.js";
import { displayPath } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Explain Command (Signal Decomposition)
 * 
 * Provides a premium, detailed breakdown of a symbol's structural risk score.
 */
export class ExplainCommand implements ConducksCommand {
  public id = "explain";
  public description = "Provide a detailed risk signal decomposition for a symbol";
  public usage = "conducks explain <symbol_id> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const symbolId = args.find(a => !a.startsWith('--'));
    if (!symbolId) {
      console.error("Usage: conducks explain <symbol_id>");
      process.exit(1);
    }

    // Materialise the deferred graph before touching it (ADR 0038). This command reads
    // `graphEngine` on the very next line, and the guard throws there rather than letting a
    // deferred graph read as an empty one — so the load has to be asked for, not assumed.
    await registry.infrastructure.ensureGraphLoaded();

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.infrastructure.graphEngine.getGraph());

    const graph = registry.infrastructure.graphEngine.getGraph();
    let node = graph.getNode(symbolId!);

    // Resolve through the SHARED helper, like every other command.
    //
    // This took the top fuzzy-search hit instead, which ranks by text score times gravity and knows
    // nothing about kinds — so a bare name whose barrel re-export outranked its declaration
    // described the export statement. `resolveSymbol` prefers a declaration and is the same rule
    // `context`, `impact` and `rename` already use (ADR 0112).
    //
    // `tryResolveSymbol` returns null instead of exiting, so this command keeps its own "not found
    // in the Synapse" wording (which its tests assert on) WITHOUT having to guard the call.
    //
    // The guard here used to be `findNodesByName(symbolId).length > 0`, and it silently excluded
    // every `path/file.ts::name` id: `findNodesByName` matches a NAME, an id is not a name, so the
    // resolver that handles `::` was never reached. MEASURED — `status` prints
    // `electron/main/index.ts::registeripchandlers`, `impact`/`trace`/`context` accept it, and this
    // command answered "not found" for a symbol plainly in the graph.
    if (!node) {
      const resolved = tryResolveSymbol(symbolId!, graph);
      if (resolved) node = graph.getNode(resolved);
    }

    if (!node) {
      console.error(`Error: Symbol "${symbolId}" not found in the Synapse.`);
      process.exit(1);
    }

    const entropyRes = await registry.explain.calculateEntropy(node.id);
    const riskData: any = await registry.explain.calculateCompositeRisk(node.id);

    if (!riskData) {
      console.error(`Error: Could not calculate risk for "${symbolId}".`);
      process.exit(1);
    }

    const { score, factors, breakdown } = riskData;

    /**
     * Read one signal off the breakdown, whatever shape it arrives in.
     *
     * There are TWO `calculateCompositeRisk` implementations. `metrics/index.ts` returns
     * `{ value, weight }` objects; `conducks-core.ts` returns PLAIN NUMBERS — and the registry
     * wires this command to the second while every line below was written for the first. So
     * `breakdown.gravity.value` was `undefined`, `undefined * 10` was `NaN`, and `NaN.toFixed(2)`
     * printed the string "NaN". Every one of the six signals did it, under a composite score that
     * was computed from the raw numbers and therefore looked perfectly correct (oracle E03,
     * ADR 0105).
     *
     * A missing signal now says so instead of printing NaN. A report that renders a number for a
     * value it does not have is worse than one that admits the gap — it reads as a measurement.
     */
    const sig = (raw: unknown): string => {
      const n = typeof raw === 'number' ? raw : (raw as { value?: unknown } | null)?.value;
      return typeof n === 'number' && Number.isFinite(n) ? (n * 10).toFixed(2) : 'n/a';
    };

    // `explain` is the one risk surface an agent reads, and it had no machine-readable form —
    // `query`, `status`, `context` and `impact` all do. Parsing box-drawing characters out of a
    // coloured table is not an interface (ADR 0112).
    //
    // `num()` returns null where `sig()` returns 'n/a': a consumer must be able to tell an absent
    // signal from a real zero, and a string in a number field forces a parse to decide.
    if (useJson) {
      const num = (raw: unknown): number | null => {
        const n = typeof raw === 'number' ? raw : (raw as { value?: unknown } | null)?.value;
        return typeof n === 'number' && Number.isFinite(n) ? n : null;
      };
      process.stdout.write(JSON.stringify({
        id: node.id,
        name: node.properties.name,
        kind: node.label,
        filePath: node.properties.filePath,
        line: (node.properties as any)?.range?.start?.line ?? (node.properties as any)?.lineStart ?? null,
        // WHAT IT DOES, in the author's own words (ADR 0133). Null when undocumented — never
        // inferred from the name, because a guess in the same font as evidence is the failure this
        // project keeps removing. "undocumented" is itself a fact worth reporting.
        doc: (node.properties as any)?.doc ?? null,
        // 0-10, the same scale the table prints, rather than the raw 0-1 the domain returns.
        riskRating: Number((score * 10).toFixed(2)),
        factors: factors ?? [],
        signals: {
          gravity: num(breakdown.gravity),
          complexity: num(breakdown.complexity),
          fanOut: num(breakdown.fanOut),
          churn: num(breakdown.churn),
          entropy: num(breakdown.entropy),
        },
        entropyDetail: { entropy: entropyRes.entropy, authorCount: entropyRes.authorCount },
      }, null, 2) + '\n');
      return;
    }

    console.log(`\n\x1b[1m--- 🛡️ Conducks Structural Explanation ---\x1b[0m`);
    console.log(`Symbol: \x1b[35m${node.properties.name}\x1b[0m (${node.label})`);
    // Relative + real case, like every other command since ADR 0132 — this line was the absolute
    // lowercased path, which is neither pasteable nor short.
    const explainRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
    console.log(`Path:   ${displayPath(String(node.properties.filePath ?? ''), explainRoot)}`);
    const doc = (node.properties as any)?.doc;
    if (doc) {
      console.log();
      for (const l of String(doc).split("\n")) console.log(`  ${l}`);
    } else {
      console.log(chalk.dim(`  (undocumented)`));
    }
    console.log(`${chalk.blue('Composite Risk Rating')}: ${(score * 10).toFixed(1)} / 10.0`);
    if (factors && factors.length > 0) {
      factors.forEach((f: string) => console.log(`  ${chalk.yellow('⚠')} ${f}`));
    }
    console.log();
    console.log(`\x1b[1mSignal Decomposition:\x1b[0m`);
    console.log(`  ├── \x1b[36mgravity:\x1b[0m     ${sig(breakdown.gravity)}  (centrality rank: ${node.properties.rank?.toFixed(4) || 0})`);
    console.log(`  ├── \x1b[36mcomplexity:\x1b[0m  ${sig(breakdown.complexity)}  (largest weight in the composite score)`);
    console.log(`  ├── \x1b[36mfan-out:\x1b[0m     ${sig(breakdown.fanOut)}  (outgoing structural dependencies)`);
    console.log(`  ├── \x1b[36mchurn:\x1b[0m       ${sig(breakdown.churn)}  (resonance / temporal frequency)`);
    console.log(`  └── \x1b[36mentropy:\x1b[0m     ${sig(breakdown.entropy)}  (authorship fragmentation: ${(entropyRes.entropy).toFixed(2)})`);

    console.log(`\n\x1b[2mStructural resonance detected in ${entropyRes.authorCount} authors.\x1b[0m`);

  }
}
