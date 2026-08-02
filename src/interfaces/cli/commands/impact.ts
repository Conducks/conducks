import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";

/**
 * Conducks — Impact Command
 */
export class ImpactCommand implements ConducksCommand {
  public id = "impact";
  public description = "Perform blast radius analysis on a symbol";
  public usage = "conducks impact <symbolId> [direction: upstream|downstream] [--json] [--tree]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const symbolId = args[0];
    const direction = (args[1] === "downstream" ? "downstream" : "upstream") as "upstream" | "downstream";
    const useJson = args.includes('--json');
    const useTree = args.includes('--tree');

    if (!symbolId) {
      console.error("Error: Please provide a symbol ID for impact analysis.");
      process.exit(1);
    }

    await syncGraph(registry);
    const g = registry.query.graph.getGraph();
    const resolvedId = resolveSymbol(symbolId, g);

    const fmt = (v: any) => {
      const val = typeof v === 'object' && v !== null ? v.value : v;
      const n = Number(val);
      return isNaN(n) ? "0.00" : (n * 100).toFixed(2);
    };

    try {
      const impact = registry.kinetic.getImpact(resolvedId, direction);
      if (!impact) {
        console.error(`No impact data for: "${resolvedId}". Run: conducks query "${symbolId}" to find valid symbol IDs.`);
        process.exit(1);
      }
      const composite: any = await registry.explain.calculateCompositeRisk(resolvedId);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          symbolId: resolvedId,
          direction,
          affectedCount: impact.affectedCount,
          impactScore: impact.impactScore,
          shortestPath: impact.affectedNodes[0]?.distance ?? null,
          composite: {
            score: composite.score,
            factors: composite.factors,
            breakdown: composite.breakdown,
          },
          affectedNodes: impact.affectedNodes,
        }, null, 2) + '\n');
        return;
      }

      console.log(`\n${chalk.bold.blue('Structural Diagnostic Summary:')}`);
      console.log(`${chalk.dim('Node ID:')} ${resolvedId}`);
      if (composite) {
        console.log(`${chalk.dim('Composite Risk Score:')} ${(composite.score * 10).toFixed(1)} / 10.0`);
        if (composite.factors && composite.factors.length > 0) {
          composite.factors.forEach((f: string) => console.log(`  ${chalk.yellow('⚠')} ${f}`));
        }
      }

      console.log(`\n\x1b[1m--- Conducks ${direction.toUpperCase()} Impact Report: ${resolvedId} ---\x1b[0m`);
      console.log(`\x1b[35mWeighted Impact Coverage:\x1b[0m ${impact.affectedCount} Symbols affected`);
      console.log(`\x1b[35mShortest Weighted Path:\x1b[0m ${impact.affectedNodes[0]?.distance.toFixed(2) || 0}`);
      console.log(`\x1b[35mImpact Score:\x1b[0m ${impact.impactScore}`);

      if (composite?.breakdown) {
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

      if (useTree && impact.affectedNodes.length > 0) {
        console.log(`\n\x1b[1mDependency Tree:\x1b[0m`);
        renderTree(resolvedId, impact.affectedNodes.slice(0, 20));
      } else if (impact.affectedNodes.length > 0) {
        console.log(`\n\x1b[1mAffected Symbols (Top 10):\x1b[0m`);
        impact.affectedNodes.slice(0, 10).forEach((node: any) => {
          const dist = node.distance.toFixed(2);
          // file:line, so the answer is directly openable. `line` is where this file references the
          // chain — the call site — falling back to where the symbol is declared (ADR 0108).
          const lines = node.lines?.length ? node.lines : (node.line ? [node.line] : node.declaredAt ? [node.declaredAt] : []);
          const at = lines.length > 1 ? `:${lines[0]} (+${lines.length - 1} more)` : lines.length ? `:${lines[0]}` : '';
          console.log(`- [d:${dist}] \x1b[36m${node.name}\x1b[0m (${node.filePath}${at})`);
        });
      }

    } catch (err) {
      console.error(`Impact Analysis Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

/**
 * Render affected nodes as an ASCII dependency tree.
 * Nodes are grouped by integer distance level and rendered depth-first.
 */
function renderTree(rootId: string, nodes: any[]): void {
  // Group nodes by their integer depth level
  const byLevel = new Map<number, any[]>();
  for (const n of nodes) {
    const level = Math.max(1, Math.round(n.distance));
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(n);
  }

  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  console.log(`\x1b[36m${rootId}\x1b[0m [root]`);

  function renderLevel(levelIdx: number, prefix: string): void {
    if (levelIdx >= sortedLevels.length) return;
    const level = sortedLevels[levelIdx];
    const children = byLevel.get(level) ?? [];
    children.forEach((node: any, i: number) => {
      const isLast = i === children.length - 1;
      const connector = isLast ? '└──' : '├──';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      const distStr = node.distance.toFixed(2);
      const kindStr = node.canonicalKind || node.kind || '?';
      console.log(
        `${prefix}${connector} \x1b[36m${node.name}\x1b[0m (${kindStr}) [${distStr}]`
      );
      renderLevel(levelIdx + 1, childPrefix);
    });
  }

  renderLevel(0, '');
}
