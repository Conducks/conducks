import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { warnIfStale } from "@/interfaces/cli/shared/stale-warning.js";
import { DEAD_CODE_TYPES } from "@/contracts/index.js";

/**
 * Conducks — Prune Command
 */
export class PruneCommand implements ConducksCommand {
  public id = "prune";
  public description = "Identify unused exports and dead code";
  public usage = "conducks prune [--type <TYPE>] [--limit <n>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    // MIRROR THE TOOL. `conducks_prune` filters by finding type and caps the list; the CLI took only
    // `--json`, so "show me the stale imports" was answerable from one surface only (todo61).
    //
    // The type list comes from `contracts/dead-code-types.ts` — the same constant the tool's enum
    // spreads — so a sixth type reaches both surfaces at once instead of being remembered into one.
    // The tool used to hard-code three of five and its summary totalled 95 against a stated 99
    // (todo53); retyping the list here would reintroduce exactly that.
    const ALLOWED = [...DEAD_CODE_TYPES, 'all'];
    const typeAt = args.indexOf('--type');
    const filterType = typeAt > -1 ? args[typeAt + 1] : undefined;
    if (filterType !== undefined && !ALLOWED.includes(filterType as never)) {
      console.error(`Error: --type must be one of: ${ALLOWED.join(', ')} — got "${filterType ?? ''}".`);
      process.exit(1);
    }

    // A limit that does not parse is an error, not a silent default — the rule `impact --depth` and
    // `trace --limit` already follow. A flag that reads as obeyed and is not is worse than no flag.
    const limitAt = args.indexOf('--limit');
    let limit: number | undefined;
    if (limitAt > -1) {
      limit = Number(args[limitAt + 1]);
      if (!Number.isInteger(limit) || limit < 1) {
        console.error(`Error: --limit needs a positive integer, got "${args[limitAt + 1] ?? ''}".`);
        process.exit(1);
      }
    }

    await syncGraph(registry);
    // A delete recommendation about code that has since changed is the sharpest form of this
    // problem, so the warning matters more here than anywhere.
    await warnIfStale(registry as any);
    let findings = registry.explain.prune();
    if (filterType && filterType !== 'all') {
      findings = findings.filter((f: { type: string }) => f.type === filterType);
    }
    if (limit !== undefined) findings = findings.slice(0, limit);

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
