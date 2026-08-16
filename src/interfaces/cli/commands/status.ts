import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";
import { isTestNode } from "@/contracts/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import { displayPath } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Status Command 🏺 🟦
 *
 * Provides structural health metrics and triggers micro-pulses.
 */
export class StatusCommand implements ConducksCommand {
  public id = "status";
  public description = "Show health and symbol counts or pulse a file";
  public usage = "conducks status [--mode pulse|blueprint] [--pulse] [--blueprint] [--file <path>] [--json] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    // An UNKNOWN mode is an error, not a default. `--mode map` ran the health report and looked like
    // it had worked — and `conducks-docs` shipped that exact spelling in its "entry points,
    // hotspots" row, so the standard documented a mode nothing implemented and nothing said so.
    // Same shape as the `*` inventory query that answered "no symbols found" for a documented
    // feature, and as `--depth` silently defaulting on `impact`.
    const MODES = new Set(['pulse', 'blueprint']);
    const modeIdx = args.indexOf('--mode');
    if (modeIdx !== -1) {
      const mode = args[modeIdx + 1];
      if (!mode || !MODES.has(mode)) {
        console.error(`Error: unknown --mode "${mode ?? ''}". Valid modes: ${[...MODES].join(', ')}.`);
        console.error(`       For entry points use 'conducks entry'; hotspots are in the default report.`);
        process.exit(1);
      }
    }

    const isPulse = args.includes('--pulse') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'pulse');
    const fileArgIdx = args.indexOf('--file');
    const fileArg = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;
    const useJson = args.includes('--json');

    try {
      // 5. Conducks Purge & Resurrection 🛡️(Lazy Incremental Induction)
      if (isPulse && fileArg) {
        console.log(`🛡️  [Conducks Pulse] Resonating structural unit: ${chalk.cyan(fileArg)}`);
        const result = await (registry.analyze as any).resonate(fileArg);
        if (result.success && result.persisted) {
          console.log(chalk.green(`Success: ${fileArg} resurrected into the synapse (${result.nodes} nodes).`));
        } else if (result.success) {
          // `status` is not on the CLI's write allowlist (cli/index.ts), so its vault handle is
          // read-only and the micro-pulse skips its own write. Saying "resurrected into the
          // synapse" here claimed a write that the layer below had already declined to make.
          console.log(chalk.yellow(`Parsed ${fileArg} (${result.nodes} nodes) — NOT written: 'status' holds a read-only vault handle. Run 'conducks analyze' to persist.`));
        } else {
          console.error(chalk.red(`Failed to pulse ${fileArg}: ${result.error}`));
        }
        return;
      }

      // Every mode below WALKS the graph — blueprint audits it, health resonates it and ranks its
      // nodes — so the deferred load (ADR 0038) has to be materialised first. Without this the
      // command threw `The structural graph is not materialised` on every invocation, which is the
      // guard doing its job: it is designed to fail loudly at the call site rather than let a
      // deferred graph read as an empty one and report zero nodes.
      await registry.infrastructure.ensureGraphLoaded();

      // 2.6 Mode: Blueprint (Structural Integrity)
      if (args.includes('--blueprint') || (args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'blueprint')) {
        console.log(`🛡️  [Conducks Blueprint] Mapping structural integrity...`);
        const audit = await registry.audit.audit();
        console.log(chalk.bold("\n--- 🏺 Conducks Integrity Blueprint ---"));
        console.log(`- Cycles:   ${chalk.red(audit.stats.cycles)}`);
        console.log(`- Orphans:  ${chalk.red(audit.stats.orphans)}`);
        console.log(`- Resonance: ${chalk.green(audit.success ? "100%" : "ST structural drift detected")}`);
        if (audit.violations.length > 0) {
          console.log(chalk.bold("\nViolations:"));
          // A violation is an OBJECT — `{ id, type, message }` — and interpolating it printed
          // `[object Object]` for every row, so the one part of `--blueprint` that names an actual
          // problem said nothing at all (oracle S04, ADR 0105). Read the fields; fall back to JSON
          // rather than to the default stringification, so a future shape change is legible instead
          // of blank.
          audit.violations.slice(0, 10).forEach((v: unknown) => {
            const row = v as { type?: string; message?: string; id?: string };
            const text = row?.message ?? (typeof v === 'string' ? v : JSON.stringify(v));
            console.log(`  - ${row?.type ? `[${row.type}] ` : ''}${text}`);
          });
          if (audit.violations.length > 10) {
            console.log(chalk.dim(`  …and ${audit.violations.length - 10} more.`));
          }
        }
        return;
      }

      // 3. Mode: Health (Default)
      //
      // NO `resonate()` HERE. It is the write-side rebuild — it runs every binder — and calling it
      // on a read path meant `status` reported a graph it had just mutated. Measured on conducks it
      // reported 19,528 edges against 19,523 rows in the vault, because `bindPulseCircuits` added
      // five handover edges that the vault refuses (they were dangling — ADR 0118 fixes that half).
      //
      // Nothing here needs it: the ranks `topGravity` sorts by are recomputed by StructuralRanker
      // when the graph LOADS, and every count comes from the loaded graph. A read command reports
      // what it loaded (ADR 0118).
      const status = registry.audit.status();
      // `status()` reports the in-memory graph, which does not know which pulse produced it or
      // whether persistence answered from the live vault or the previous pulse's snapshot (ADR
      // 0040). `statusFromVault()` carries both — pulled here purely for those two fields so a
      // reader mid-pulse sees "answering from the previous pulse" instead of silently stale data.
      const vaultStatus = await registry.audit.statusFromVault();
      const pulseId = (vaultStatus.staleness as any).pulseId;
      const servedFrom = (vaultStatus.staleness as any).servedFrom;
      const graph = registry.query.graph.getGraph();

      const topGravity = Array.from(graph.getAllNodes())
        .filter(n => !isTestNode(n))   // path-derived: the parse-time flag does not survive the vault
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 5);

      // What is on DISK, as opposed to what is COMMITTED — see `checkWorkingTree`. Both lines are
      // printed: "colleague's commits are not analyzed" and "your own edits are not in the graph"
      // are different problems with different fixes.
      const freshness = await registry.audit.checkWorkingTree();

      // Health: a real codebase graph is never near-disconnected. A density below ~0.5 on a
      // non-trivial node set means an analyze was interrupted and persisted a PARTIAL graph
      // (nodes written, edges lost) — it loads and looks fine but is silently broken. Flag it.
      const s = status.stats;
      const incomplete = s.nodeCount > 50 && s.density < 0.5;
      // The EMPTY case was invisible to the check above: `nodeCount > 50` excludes it by
      // construction, so a vault with nothing in it — after `conducks clean`, or before the first
      // analyze — reported READY and SYNCHRONIZED with an empty hotspot list. Nothing-checked must
      // not read as clean (ADR 0124), and an empty graph is the strongest form of nothing-checked.
      const empty = s.nodeCount === 0;
      const health = {
        empty,
        incomplete,
        reason: empty
          ? 'the vault holds no symbols — nothing has been analyzed yet; run `conducks analyze`'
          : incomplete ? `density ${s.density.toFixed(2)} with ${s.nodeCount} nodes — likely an interrupted analyze; re-run \`conducks analyze\`` : null,
      };

      if (useJson) {
        process.stdout.write(JSON.stringify({
          stats: status.stats,
          status: status.status,
          staleness: { ...status.staleness, pulseId, servedFrom },
          freshness,
          health,
          topHotspots: topGravity.map(n => ({
            id: n.id,
            name: n.properties.name,
            rank: n.properties.rank,
          })),
        }, null, 2) + '\n');
        return;
      }

      console.log(chalk.bold("\n--- 🏺 Structural Synapse Status ---"));
      console.log(`- Nodes:   ${chalk.yellow(status.stats.nodeCount)}`);
      console.log(`- Edges:   ${chalk.yellow(status.stats.edgeCount)}`);
      console.log(`- Density: ${status.stats.density.toFixed(4)} relationships/symbol`);
      console.log(`- Status:  ${status.status.toUpperCase()}`);

      if (empty) {
        console.log(`- ${chalk.yellow('Health')}:  ${chalk.red('⚠ EMPTY VAULT')} — ${health.reason}`);
      } else if (incomplete) {
        console.log(`- ${chalk.yellow('Health')}:  ${chalk.red('⚠ INCOMPLETE PULSE')} — ${health.reason}`);
      }

      if (empty) {
        // SYNCHRONIZED here would be a claim about nothing: with no symbols stored there is no
        // analysis for HEAD to be ahead of, so "in sync" and "stale" are both meaningless rather
        // than one of them being true.
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.gray('n/a — nothing analyzed')}`);
      } else if (status.staleness.stale) {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.red('STALE')} (${status.staleness.commitsBehind} commits behind)`);
      } else {
        console.log(`- ${chalk.yellow('Staleness')}: ${chalk.green('SYNCHRONIZED')}`);
      }
      // Printed BESIDE the commit line, never instead of it — see the note where it is computed.
      if (!empty) {
        console.log(`- ${chalk.yellow('Working tree')}: ` + (freshness.stale
          ? chalk.red(`BEHIND — ${freshness.changed} file(s) changed, ${freshness.removed} gone since the last pulse`)
          : chalk.green('matches the last pulse')));
      }
      console.log(`- ${chalk.yellow('Pulse')}:   ${chalk.cyan(pulseId)}${servedFrom === 'previous-pulse-snapshot' ? chalk.yellow(' (served from the previous pulse\'s snapshot — a write is in flight)') : ''}`);

      // RELATIVE, like `impact` and `context` (ADR 0132): the absolute prefix was ~90 identical
      // characters on every row, which is the part a reader has to skip to reach the answer.
      const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
      // The id is lowercased (CONDUCKS-4), so slicing the root off gives a path that opens nothing.
      // `displayPath` recovers the on-disk spelling; the id itself is untouched.
      const rel = (id: string) => {
        const sep = id.lastIndexOf('::');
        return sep === -1 ? id : `${displayPath(id.slice(0, sep), projectRoot)}${id.slice(sep)}`;
      };
      console.log(chalk.bold(`\n--- 🚀 Top Structural Hotspots ---`));
      if (topGravity.length === 0) {
        // A bare header over no rows reads as "no hotspots" — a finding — when the truth is that
        // nothing was ranked. Same denominator honesty the rest of this command now carries.
        console.log(chalk.gray(empty ? '(none — the vault is empty)' : '(none ranked)'));
      }
      topGravity.forEach((n, i) => {
        console.log(`${i + 1}. ${chalk.magenta(rel(n.id))} [Gravity: ${chalk.cyan((n.properties.rank || 0).toFixed(4))}]`);
      });
      console.log();
    } finally {
      await closePersistence(registry);
    }
  }
}
