import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Workspace Ledger (System 1, ADR 0012)
 *
 * A workspace-level survey + grade: the "state of the codebase" at a glance, assembled from the
 * structural graph the pulse already produced — size, connectivity, dead weight, and the
 * supply-chain surface — reduced to a single letter grade with the deductions shown.
 */
export class LedgerCommand implements ConducksCommand {
  public id = "ledger";
  public description = "Workspace survey + grade (size, connectivity, dead weight, supply chain)";
  public usage = "conducks ledger";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    await syncGraph(registry);
    const q = <T = any>(sql: string) => registry.infrastructure.persistence.query<T>(sql);

    const [{ nodes }] = await q<{ nodes: number }>(`SELECT COUNT(*) AS nodes FROM nodes`);
    const [{ edges }] = await q<{ edges: number }>(`SELECT COUNT(*) AS edges FROM edges`);
    if (Number(nodes) === 0) {
      console.log(`\x1b[33m⚠️  Empty graph. Run 'conducks analyze' first.\x1b[0m`);
      return;
    }
    const density = Number(edges) / Number(nodes);

    const kinds = await q<{ canonicalKind: string; n: number }>(
      `SELECT canonicalKind, COUNT(*) AS n FROM nodes GROUP BY 1 ORDER BY 2 DESC`
    );
    const [{ deps }] = await q<{ deps: number }>(
      `SELECT COUNT(DISTINCT targetId) AS deps FROM edges
       WHERE type='DEPENDS_ON' AND json_extract_string(properties,'$.origin')='dependency'`
    );

    const orphans = (registry.explain.prune() as any[]).filter(f => f.type === "ORPHAN").length;

    // --- Grade: start at 100, deduct for each health signal, floor at 0. ---
    const deductions: Array<{ why: string; pts: number }> = [];
    if (density < 1) deductions.push({ why: `low connectivity (density ${density.toFixed(2)} < 1)`, pts: 25 });
    else if (density < 2) deductions.push({ why: `thin connectivity (density ${density.toFixed(2)} < 2)`, pts: 10 });
    if (orphans > 0) deductions.push({ why: `${orphans} orphaned symbol(s)`, pts: Math.min(orphans * 2, 20) });

    const score = Math.max(0, 100 - deductions.reduce((s, d) => s + d.pts, 0));
    const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
    const gcolor = score >= 80 ? "\x1b[32m" : score >= 60 ? "\x1b[33m" : "\x1b[31m";

    console.log(`\n\x1b[1m--- 🏺 Workspace Ledger ---\x1b[0m`);
    console.log(`  Grade:       ${gcolor}${grade}\x1b[0m  (${score}/100)`);
    console.log(`  Nodes:       ${Number(nodes)}   Edges: ${Number(edges)}   Density: ${density.toFixed(2)}`);
    console.log(`  Structure:   ${kinds.map(k => `${k.canonicalKind} ${Number(k.n)}`).join(" · ")}`);
    console.log(`  Supply-chain: ${Number(deps)} third-party package(s)  \x1b[2m(conducks supply-chain)\x1b[0m`);
    console.log(`  Dead weight: ${orphans} orphan(s)  \x1b[2m(conducks prune)\x1b[0m`);
    if (deductions.length > 0) {
      console.log(`\n\x1b[1m  Deductions:\x1b[0m`);
      for (const d of deductions) console.log(`    \x1b[31m-${d.pts}\x1b[0m  ${d.why}`);
    } else {
      console.log(`\n  \x1b[32m✅ No health deductions.\x1b[0m`);
    }
  }
}
