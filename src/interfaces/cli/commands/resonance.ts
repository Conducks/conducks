import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import path from "node:path";
import fs from "node:fs";

/**
 * Conducks — Resonance (Compare) Command
 *
 * Measured before the fix (ADR 0115): `conducks resonance /tmp` printed a raw DuckDB object —
 * `code: 'DUCKDB_NODEJS_ERROR', errorType: 'Binder'` — and **exited 0**. A database internal reached
 * the user as the answer, and the shell was told it succeeded.
 *
 * The target is checked before any query runs: comparing against a directory that holds no synapse
 * is a mistake worth naming, not an exception worth leaking.
 */
export class ResonanceCommand implements ConducksCommand {
  public id = "resonance";
  public description = "Compare structure to another analyzed project";
  public usage = "conducks resonance <path> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const otherPath = args.find(a => !a.startsWith('--'));
    if (!otherPath) {
      console.error("Usage: conducks resonance <path> [--json]");
      process.exit(1);
      return;
    }

    // Validate BEFORE touching the vault — the same test `link` applies to a federation target.
    const abs = path.resolve(otherPath);
    if (!fs.existsSync(abs)) {
      console.error(`\x1b[31mError: ${abs} does not exist.\x1b[0m`);
      process.exit(1);
      return;
    }
    if (!fs.existsSync(path.join(abs, '.conducks', 'conducks-synapse.db'))) {
      console.error(`\x1b[31mError: ${abs} is not an analyzed conducks project (no .conducks/conducks-synapse.db).\x1b[0m`);
      console.error(`Run: conducks analyze ${abs}`);
      process.exit(1);
      return;
    }

    await syncGraph(registry);

    try {
      const diff = await registry.explain.compare(abs);
      const pct = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.round(n * 100) : null;
      };

      if (useJson) {
        process.stdout.write(JSON.stringify({
          target: abs,
          similarity: diff.similarity ?? null,
          summary: diff.summary ?? null,
          metrics: {
            density: pct(diff.metrics?.density),
            kinetic: pct(diff.metrics?.kinetic),
            typology: pct(diff.metrics?.typology),
            // What the two projects are BUILT FROM, kept apart from the shape score — see
            // `ResonanceAnalyzer.summarize` for why the two were conflated and what that claimed.
            ecosystem: pct((diff as any).metrics?.ecosystem),
          },
          sharedLanguages: (diff as any).sharedLanguages ?? [],
          sharedPackages: (diff as any).sharedPackages ?? [],
        }, null, 2) + '\n');
        return;
      }

      console.log(`\n\x1b[1m--- 📡 Project Resonance: Comparison ---\x1b[0m`);
      console.log(`\x1b[2mAgainst:\x1b[0m ${abs}`);
      console.log(`- Resonance Score: ${diff.similarity ?? 0}%`);
      console.log(`- Summary: ${diff.summary ?? '(none)'}`);
      const fmt = (v: unknown) => { const p = pct(v); return p === null ? 'n/a' : `${p}%`; };
      console.log(`\x1b[33m- Shape metrics: Density (${fmt(diff.metrics?.density)}), Kinetic (${fmt(diff.metrics?.kinetic)}), Typology (${fmt(diff.metrics?.typology)})\x1b[0m`);
      // The stack is reported as its own line because it is its own finding: a high shape score
      // between projects that share no language is a coincidence of size, and the reader has to be
      // able to see that without reading the source of the metric.
      const langs = ((diff as any).sharedLanguages ?? []) as string[];
      const pkgs = ((diff as any).sharedPackages ?? []) as string[];
      console.log(`\x1b[33m- Stack overlap: ${fmt((diff as any).metrics?.ecosystem)}\x1b[0m` +
        (langs.length ? ` \x1b[2m· shared languages: ${langs.join(', ')}\x1b[0m` : ' \x1b[2m· no shared language\x1b[0m') +
        (pkgs.length ? ` \x1b[2m· shared packages: ${pkgs.slice(0, 6).join(', ')}${pkgs.length > 6 ? ` (+${pkgs.length - 6})` : ''}\x1b[0m` : ''));
    } catch (err) {
      // A leaked driver error is not an answer. Name what failed and exit non-zero.
      console.error(`\x1b[31mComparison failed against ${abs}: ${(err as Error).message}\x1b[0m`);
      process.exit(1);
    }
  }
}
