import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import chalk from "chalk";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";
import { displayPath } from "@/interfaces/cli/shared/display-path.js";
import { warnIfStale } from "@/interfaces/cli/shared/stale-warning.js";

/**
 * Conducks — Impact Command
 */
export class ImpactCommand implements ConducksCommand {
  public id = "impact";
  public description = "Perform blast radius analysis on a symbol";
  public usage = "conducks impact <symbolId> [direction: upstream|downstream] [--json] [--tree] [--depth <n>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const symbolId = args[0];

    // An unknown direction is an ERROR, not a silent default — the same rule `--depth` below already
    // follows, and for the same reason. This read `args[1] === "downstream" ? "downstream" : "upstream"`,
    // so `sideways`, a typo, or anything else answered UPSTREAM while looking obeyed. The MCP side
    // refuses it (todo53); the CLI answering a different question for the same input is exactly what
    // the mirror rule forbids (todo61).
    //
    // A flag is not a direction: `conducks impact sym --json` must keep working, so only a
    // non-flag second argument is validated.
    const DIRECTIONS = ["upstream", "downstream"] as const;
    const given = args[1];
    if (given !== undefined && !given.startsWith('-') && !DIRECTIONS.includes(given as never)) {
      console.error(`Error: direction must be one of: ${DIRECTIONS.join(', ')} — got "${given}".`);
      process.exit(1);
    }
    const direction = (given === "downstream" ? "downstream" : "upstream") as "upstream" | "downstream";
    const useJson = args.includes('--json');
    const useTree = args.includes('--tree');
    // The engine has taken a depth all along (default 5); the CLI never passed it, and the vs-grep
    // benchmark pre-registered `--depth 2` in good faith and hit "Unknown flag" (todo44#P6).
    // A depth that does not parse as a positive integer is an error, not a silent default —
    // `--depth abc` falling back to 5 would be a flag that reads as obeyed and is not.
    const depthIdx = args.indexOf('--depth');
    let depth = 5;
    if (depthIdx !== -1) {
      depth = Number(args[depthIdx + 1]);
      if (!Number.isInteger(depth) || depth < 1) {
        console.error(`Error: --depth needs a positive integer, got "${args[depthIdx + 1] ?? ''}".`);
        process.exit(1);
      }
    }

    if (!symbolId) {
      console.error("Error: Please provide a symbol ID for impact analysis.");
      process.exit(1);
    }

    await syncGraph(registry);
    // The answer below describes what was ANALYZED. Say so when that differs from what is on disk.
    await warnIfStale(registry as any);
    const g = registry.query.graph.getGraph();
    const resolvedId = resolveSymbol(symbolId, g);

    const fmt = (v: any) => {
      const val = typeof v === 'object' && v !== null ? v.value : v;
      const n = Number(val);
      return isNaN(n) ? "0.00" : (n * 100).toFixed(2);
    };

    try {
      const impact = registry.kinetic.getImpact(resolvedId, direction, depth);
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
      // SAY WHICH QUESTION THE NUMBER ANSWERS. The default depth is 5, so this is a TRANSITIVE blast
      // radius, and it was printed as a bare count — `createLogger` reads "409 Symbols affected"
      // where 71 of them are direct. A reader asking "who calls this" takes the headline as the
      // answer to that, and it is the answer to a different, larger question. The depth was already
      // a flag; only the label was missing (todo44#P6 fixed the flag, CONDUCKS-37 the empty case).
      console.log(`\x1b[35mWeighted Impact Coverage:\x1b[0m ${impact.affectedCount} Symbols affected `
        + chalk.dim(depth === 1 ? '(direct only)' : `(up to ${depth} hops — '--depth 1' for direct callers only)`));

      // A TRUE ZERO AND A BROKEN ZERO MUST NOT PRINT THE SAME OUTPUT (todo44#P6, CONDUCKS-37).
      //
      // Measured on the frozen scraper subject: `impact classify` said 0 and was right — nobody
      // calls it. `impact resolve_project_path` said 0 and was wrong — ten callers existed, every
      // one sitting in the unresolved bucket as `paths.resolve_project_path`. The reader could not
      // tell the honest empty from the resolution failure. So an empty answer states its basis:
      // how many edges were examined, how many references this graph could not place, and — the
      // number that decides whether the zero is trustworthy — how many of those share this
      // symbol's name.
      if (impact.affectedCount === 0) {
        const wanted = resolvedId.split('::').pop()!.split('.').pop()!.toLowerCase();
        let edgeCount = 0, unresolvedTotal = 0, sameName = 0;
        for (const e of g.getAllEdges()) {
          edgeCount++;
          if (g.getNode(e.targetId)) continue;
          unresolvedTotal++;
          const leaf = String(e.targetId).toLowerCase().split('::').pop()!.split('.').pop()!;
          if (leaf === wanted) sameName++;
        }
        console.log(chalk.dim(`  (examined ${edgeCount.toLocaleString()} edges; ` +
          `${unresolvedTotal.toLocaleString()} unresolved reference(s) in this graph, ` +
          (sameName > 0
            ? `and ${sameName} of them end in "${wanted}" — the zero above may be a resolution gap, not an absence)`
            : `none of them share this name — no caller exists in what was analyzed)`)));
        if (sameName > 0) {
          console.log(chalk.yellow(`  ⚠ ${sameName} unresolved reference(s) match this symbol's name. ` +
            `Run \`conducks audit --json\` to list them.`));
        }
      }
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
        // FILE -> ENCLOSING FUNCTION -> THE SOURCE LINE (ADR 0132).
        //
        // The old shape printed one flat row per symbol: `execute (…/cohesion.ts:38)`. This
        // repository holds seven different `execute`s, so the name identified nothing and the reader
        // opened the file — and once they are opening files, grep got them there in 17 ms. The line
        // numbers were already here; nothing read the source back.
        //
        // Grouping by file also collapses the repetition: seven callers in seven files printed the
        // absolute path seven times, which is most of the width and none of the information.
        const shown = impact.affectedNodes.slice(0, 10);
        const reader = registry.source.lineReader();
        const root = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
        // `displayPath` rather than a slice: the id is lowercased (CONDUCKS-4), so slicing gives a
        // path that matches no file in the reader's editor. Ids are untouched; only this line is.
        const rel = (p: string) => displayPath(p, root);

        const byFile = new Map<string, any[]>();
        for (const n of shown) {
          const f = n.filePath || '(no file)';
          if (!byFile.has(f)) byFile.set(f, []);
          byFile.get(f)!.push(n);
        }

        const kept = impact.affectedNodes.length - shown.length;
        console.log(`\n\x1b[1mUsed in ${byFile.size} file(s)\x1b[0m` +
          (kept > 0 ? chalk.dim(`  (top ${shown.length} of ${impact.affectedNodes.length})`) : ''));

        for (const [file, nodes] of byFile) {
          console.log(`\n  \x1b[4m${rel(file)}\x1b[0m`);
          for (const node of nodes) {
            // DIRECT means this symbol names the target itself; anything further is reached through
            // something else, and merging the two would overstate what a change touches. Grep cannot
            // see the indirect caller at all, which is the half of the answer it can never give.
            const direct = node.distance <= 1;
            const tag = direct ? chalk.green('direct') : chalk.yellow('indirect');
            const lines: number[] = node.lines?.length ? node.lines
              : node.line ? [node.line]
              : node.declaredAt ? [node.declaredAt] : [];

            console.log(`    ${chalk.cyan(node.name)}  ${tag}${chalk.dim(`  d:${node.distance.toFixed(2)}`)}`);
            for (const l of lines.slice(0, 3)) {
              const src = reader.read(file, l);
              // A line the working tree no longer holds says so rather than printing whatever now
              // sits at that number — the vault can be older than the file (CONDUCKS-37).
              const text = src.text === null
                ? chalk.dim(src.reason === 'past-end' ? '(line no longer in this file — re-run analyze)' : '(file unreadable)')
                : src.text;
              console.log(`      ${chalk.dim(String(l).padStart(5) + ':')}  ${text}`);
            }
            if (lines.length > 3) console.log(chalk.dim(`      … and ${lines.length - 3} more call site(s)`));
          }
        }
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
