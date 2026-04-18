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
      return;
    }

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
      return;
    }

    const entropyRes = await registry.explain.calculateEntropy(node.id);
    const riskData: any = await registry.explain.calculateCompositeRisk(node.id);
    const fallbackAnalysis = riskData?.fallbackAnalysis;

    if (!riskData) {
      console.error(`Error: Could not calculate risk for "${symbolId}".`);
      return;
    }

    const { score, factors, breakdown } = riskData;
    const hasFallback = breakdown.fallback > 0;

    console.log(`\n\x1b[1m--- 🛡️ Conducks Structural Explanation ---\x1b[0m`);
    console.log(`Symbol: \x1b[35m${node.properties.name}\x1b[0m (${node.label})`);
    console.log(`Path:   ${node.properties.filePath}`);
    console.log(`${chalk.blue('Composite Risk Rating')}: ${(score * 10).toFixed(1)} / 10.0`);
    if (factors && factors.length > 0) {
      factors.forEach((f: string) => console.log(`  ${chalk.yellow('⚠')} ${f}`));
    }
    console.log();
    console.log(`\x1b[1mSignal Decomposition:\x1b[0m`);
    console.log(`  ├── \x1b[36mgravity:\x1b[0m     ${(breakdown.gravity.value * 10).toFixed(2)}  (centrality rank: ${node.properties.rank?.toFixed(4) || 0})`);
    console.log(`  ├── \x1b[36mfan-out:\x1b[0m     ${(breakdown.fanOut.value * 10).toFixed(2)}  (outgoing structural dependencies)`);
    console.log(`  ├── \x1b[36mchurn:\x1b[0m       ${(breakdown.churn.value * 10).toFixed(2)}  (resonance / temporal frequency)`);
    console.log(`  ├── \x1b[36mentropy:\x1b[0m     ${(breakdown.entropy.value * 10).toFixed(2)}  (authorship fragmentation: ${(entropyRes.entropy).toFixed(2)})`);
    if (hasFallback) {
      console.log(`  └── \x1b[36mfallback:\x1b[0m    ${(breakdown.fallback.value * 10).toFixed(2)}  (${fallbackAnalysis.isFallback ? 'detected' : 'not detected'})`);
    } else {
      console.log(`  └── \x1b[36mfallback:\x1b[0m     ${(breakdown.fallback.value * 10).toFixed(2)}  (no fallback patterns detected)`);
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
