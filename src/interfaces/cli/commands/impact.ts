import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Impact Command
 */
export class ImpactCommand implements ConducksCommand {
  public id = "impact";
  public description = "Perform blast radius analysis on a symbol";
  public usage = "conducks impact <symbolId> [direction: upstream|downstream]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    const direction = (args[1] === "downstream" ? "downstream" : "upstream") as "upstream" | "downstream";
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID for impact analysis.");
      return;
    }

    await persistence.load(registry.intelligence.graph.getGraph());

    const fmt = (v: any) => {
      const val = typeof v === 'object' && v !== null ? v.value : v;
      const n = Number(val);
      return isNaN(n) ? "0.00" : (n * 100).toFixed(2);
    };

    try {
      // Registry Alignment: kinetic.getImpact + metrics.calculateCompositeRisk
      const impact = registry.kinetic.getImpact(symbolId, direction);
      const composite = await registry.metrics.calculateCompositeRisk(symbolId);

      console.log(`\n\x1b[1m--- Conducks ${direction.toUpperCase()} Impact Report: ${symbolId} ---\x1b[0m`);
      console.log(`\x1b[35mWeighted Impact Coverage:\x1b[0m ${impact.affectedCount} Symbols affected`);
      console.log(`\x1b[35mShortest Weighted Path:\x1b[0m ${impact.affectedNodes[0]?.distance.toFixed(2) || 0}`);
      console.log(`\x1b[35mImpact Score:\x1b[0m ${impact.impactScore}`);

      if (composite) {
        console.log(`\n\x1b[1mComposite Risk Breakdown:\x1b[0m`);
        const riskScore = Number(composite.score) * 10;
        const riskColor = riskScore > 7 ? "\x1b[31m" : riskScore > 4 ? "\x1b[33m" : "\x1b[32m";
        console.log(`${riskColor}Overall Risk: ${riskScore.toFixed(2)} / 10.0\x1b[0m`);

        const b = composite.breakdown;
        console.log(`- \x1b[33mStructural Gravity (PageRank):\x1b[0m ${fmt(b.gravity)}%`);
        console.log(`- \x1b[33mOwnership Entropy (Shannon):\x1b[0m ${fmt(b.entropy)}%`);
        console.log(`- \x1b[33mCode Churn (Commit Density):\x1b[0m ${fmt(b.churn)}%`);
        console.log(`- \x1b[33mStructural Fan-out (Coupling):\x1b[0m ${fmt(b.fanOut)}%`);
      }

      if (impact.affectedNodes.length > 0) {
        console.log(`\n\x1b[1mAffected Symbols (Top 10):\x1b[0m`);
        impact.affectedNodes.slice(0, 10).forEach((node: any) => {
          const dist = node.distance.toFixed(2);
          console.log(`- [d:${dist}] \x1b[36m${node.name}\x1b[0m (${node.filePath})`);
        });
      }

    } catch (err) {
      console.error(`Impact Analysis Error: ${(err as Error).message}`);
    }
  }
}
