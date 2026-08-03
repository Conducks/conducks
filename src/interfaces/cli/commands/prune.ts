import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Prune Command
 */
export class PruneCommand implements ConducksCommand {
  public id = "prune";
  public description = "Identify unused exports and dead code";
  public usage = "conducks prune [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    await syncGraph(registry);
    const findings = registry.explain.prune();

    // `--json`, because a dead-code list is something a script acts on. Twelve of the fifteen read
    // commands offered it and `prune`, `trace` and `audit` did not — precisely the three whose
    // output is a work list rather than a report (ADR 0119).
    //
    // The verdict/question split (ADR 0104) travels as a FIELD rather than as two arrays: a caller
    // that ignores it gets every finding, which is the safe default, and one that reads it can tell
    // "this is unused" from "the graph cannot tell".
    if (args.includes('--json')) {
      process.stdout.write(JSON.stringify(findings.map((f: any) => ({
        ...f,
        claim: f.type === 'UNIMPORTED_MODULE' ? 'question' : 'verdict',
      })), null, 2) + '\n');
      return;
    }

    console.log(`\n\x1b[1m--- ✂️ Dead Weight Discovery ---\x1b[0m`);

    if (findings.length === 0) {
      console.log(`✅ No dead weight detected. All structural elements are in use.`);
    } else {
      // Questions print BELOW the findings and in a different colour, because they are a different
      // claim: a finding says "this is unused", a question says "the graph cannot tell" (ADR 0104).
      // Mixing them in one red list is what made `orphan-module.ts` read as a deletion candidate.
      const questions = findings.filter((f: any) => f.type === 'UNIMPORTED_MODULE');
      const verdicts = findings.filter((f: any) => f.type !== 'UNIMPORTED_MODULE');

      verdicts.forEach((f: any) => {
        const color = f.type === 'UNUSED_EXPORT' ? '\x1b[33m' : '\x1b[31m';
        console.log(`${color}- [${f.type}] ${f.symbol} (${f.file})\x1b[0m`);
        console.log(`  └─ ${f.message}`);
      });

      if (questions.length > 0) {
        console.log(`\n\x1b[1m--- ❓ Questions — not findings, and not safe to delete on this evidence ---\x1b[0m`);
        for (const f of questions) {
          console.log(`\x1b[36m- [${f.type}] ${f.symbol} (${f.file})\x1b[0m`);
          console.log(`  └─ ${f.message}`);
        }
      }
    }
  }
}
