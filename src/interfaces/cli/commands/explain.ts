import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";

/**
 * Conducks — Explain Command (Signal Decomposition)
 * 
 * Provides a premium, detailed breakdown of a symbol's structural risk score.
 */
export class ExplainCommand implements ConducksCommand {
  public id = "explain";
  public description = "Provide a detailed risk signal decomposition for a symbol";
  public usage = "conducks explain <symbol_id>";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const symbolId = args[0];
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

    let node = registry.infrastructure.graphEngine.getGraph().getNode(symbolId);
    
    // Conducks: Intelligent Fallback Resolve
    if (!node) {
      const results = await registry.query.query(symbolId, 1);
      if (results.length > 0) {
        node = registry.infrastructure.graphEngine.getGraph().getNode(results[0].id);
      }
    }

    if (!node) {
      console.error(`Error: Symbol "${symbolId}" not found in the Synapse.`);
      process.exit(1);
    }

    const entropyRes = await registry.explain.calculateEntropy(node.id);
    const riskData: any = await registry.explain.calculateCompositeRisk(node.id);
    const fallbackAnalysis = riskData?.fallbackAnalysis;

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

    const fallbackValue = typeof breakdown.fallback === 'number'
      ? breakdown.fallback
      : (breakdown.fallback?.value ?? 0);
    const hasFallback = fallbackValue > 0;

    console.log(`\n\x1b[1m--- 🛡️ Conducks Structural Explanation ---\x1b[0m`);
    console.log(`Symbol: \x1b[35m${node.properties.name}\x1b[0m (${node.label})`);
    console.log(`Path:   ${node.properties.filePath}`);
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
    console.log(`  ├── \x1b[36mentropy:\x1b[0m     ${sig(breakdown.entropy)}  (authorship fragmentation: ${(entropyRes.entropy).toFixed(2)})`);
    if (hasFallback) {
      console.log(`  └── \x1b[36mfallback:\x1b[0m    ${sig(breakdown.fallback)}  (${fallbackAnalysis.isFallback ? 'detected' : 'not detected'})`);
    } else {
      console.log(`  └── \x1b[36mfallback:\x1b[0m     ${sig(breakdown.fallback)}  (no fallback patterns detected)`);
    }

    console.log(`\n\x1b[2mStructural resonance detected in ${entropyRes.authorCount} authors.\x1b[0m`);

    // Fallback Analysis Details
    if (fallbackAnalysis?.isFallback) {
      console.log(`\n\x1b[1mFallback Pattern Analysis:\x1b[0m`);
      console.log(`  📊 Confidence: ${(fallbackAnalysis.confidence * 100).toFixed(0)}%`);

      const patterns = fallbackAnalysis.patterns;
      console.log(`  🔄 Pipeline Position: ${patterns.pipelinePosition.position} (${(patterns.pipelinePosition.score * 100).toFixed(0)}% confidence)`);
      console.log(`  ❓ Conditional Usage: ${patterns.conditionalUsage.isConditional ? 'Yes' : 'No'} (${(patterns.conditionalUsage.conditionalRatio * 100).toFixed(0)}% of calls)`);
      console.log(`  🚨 Error Handling: ${patterns.errorHandling.isInErrorHandling ? 'Yes' : 'No'} (${(patterns.errorHandling.errorCallerRatio * 100).toFixed(0)}% in error contexts)`);
      console.log(`  🏷️  Naming Patterns: ${(patterns.namingPatterns.score * 100).toFixed(0)}% match fallback keywords`);

      const usage = patterns.usageRatio;
      console.log(`  📈 Usage Distribution: ${usage.fallbackCalls}/${usage.totalCalls} calls are fallback (${(usage.ratio * 100).toFixed(0)}%)`);

      if (usage.ratio > 0.7) {
        console.log(`  ⚠️  \x1b[31mHIGH RISK: Primarily used as fallback - consider removal if obsolete\x1b[0m`);
      } else if (usage.ratio > 0.3) {
        console.log(`  ⚠️  \x1b[33mMEDIUM RISK: Mixed usage - review fallback necessity\x1b[0m`);
      } else {
        console.log(`  ✅ \x1b[32mLOW RISK: Minimal fallback usage - likely legitimate\x1b[0m`);
      }
    }
  }
}
