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

    // Edges pointing at a node that is not in the graph: the share of this codebase the analysis
    // could not place. It is the tool's own honesty signal and belongs in a grade about how well the
    // codebase is UNDERSTOOD, not only how it is shaped.
    const [{ dangling }] = await q<{ dangling: number }>(
      `SELECT COUNT(*) AS dangling FROM edges e LEFT JOIN nodes n ON e.targetId = n.id WHERE n.id IS NULL`
    );
    // Import cycles, counted from the same rule `audit` uses so the two commands cannot disagree.
    let cycles = 0;
    try { cycles = Number((await (registry.audit as any).audit())?.stats?.cycles ?? 0); } catch { cycles = 0; }

    // --- Grade: start at 100, deduct for each health signal, floor at 0. ---
    //
    // THE GRADE HAS TO DISCRIMINATE. It had two inputs — density, and a raw orphan count whose
    // deduction saturated at 20 points from ten orphans — so every project with ten or more orphans
    // and ordinary density scored exactly 80. MEASURED: sofie (11,267 symbols, 11 orphans),
    // scraper (5,153 / 11) and orchestrator (7,558 / 77) all graded "B (80/100)". Three codebases of
    // different sizes, languages and health, one number. A grade that cannot tell them apart is
    // decoration, and the deduction list underneath was reporting a single line every time.
    //
    // Orphans are now counted per thousand symbols, because 11 dead symbols in 11,267 and 11 in 300
    // are not the same fact; and two signals the vault already holds were added.
    const deductions: Array<{ why: string; pts: number }> = [];
    if (density < 1) deductions.push({ why: `low connectivity (density ${density.toFixed(2)} < 1)`, pts: 25 });
    else if (density < 2) deductions.push({ why: `thin connectivity (density ${density.toFixed(2)} < 2)`, pts: 10 });

    if (orphans > 0) {
      const per1000 = (orphans / Number(nodes)) * 1000;
      const pts = Math.min(Math.round(per1000), 20);
      deductions.push({
        why: `${orphans} orphaned symbol(s) — ${per1000.toFixed(1)} per 1,000 symbols`,
        pts,
      });
    }

    const danglingRate = Number(edges) > 0 ? Number(dangling) / Number(edges) : 0;
    if (danglingRate > 0.01) {
      deductions.push({
        why: `${Number(dangling).toLocaleString()} unresolved reference(s) — ${(danglingRate * 100).toFixed(1)}% of edges point at nothing this analysis could place`,
        pts: Math.min(Math.round(danglingRate * 100), 15),
      });
    }

    if (cycles > 0) {
      deductions.push({ why: `${cycles} circular dependency/dependencies`, pts: Math.min(cycles * 5, 15) });
    }

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
