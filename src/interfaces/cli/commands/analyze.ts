import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { closePersistence } from "@/interfaces/cli/shared/context.js";
import readline from "node:readline/promises";
import { basename } from "node:path";

/**
 * Conducks — Analyze Command
 * 
 * Performs a high-fidelity structural analysis and synchronization pulse.
 */
export class AnalyzeCommand implements ConducksCommand {
  public id = "analyze";
  public description = "Index and analyze repository structure";
  public usage = "conducks analyze [path] [--staged] [--verbose] [--force] [--yes]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isVerbose = args.includes('--verbose');
    const isStaged = args.includes('--staged');
    const isForce = args.includes('--force');
    
    // Support positional path: conducks analyze <path>
    const targetPath = args.find(a => !a.startsWith('-')) || process.cwd();

    // A pulse over the wrong root (a typo'd `~/Documents`) costs hours and writes a vault into a
    // folder that is not a project. `--yes` skips the QUESTION, not the CHECK — it used to skip
    // both, which meant every non-interactive caller (a script, CI, an agent, this project's own
    // benchmark) ran with no guard at all. That is how two benchmark projects with no project
    // marker of their own silently analyzed `/private/tmp` instead. The assessment is still
    // printed, so an automated run leaves a record of what it was warned about.
    const autoYes = args.includes('--yes');
    if (!(await confirmScope(targetPath, registry, autoYes))) {
      console.error("\n[Conducks] Aborted — nothing was analyzed.\n");
      process.exit(1);
    }

    try {
      // Delegate to the unified Analysis domain with scoped root
      await (registry.analyze as any).full({
        root: targetPath,
        staged: isStaged,
        verbose: isVerbose,
        force: isForce
      });

      // Reclaim the vault now the pulse has published. A pulse purges and re-inserts every unit it
      // touched, and DuckDB keeps the old row versions forever — so the file grows on every analyze
      // whether or not the code changed. Doing it here rather than as a maintenance command is the
      // point: a chore nobody runs is a vault nobody reclaims. The check is one query and the
      // rewrite only runs when it will pay, so a clean vault costs ~10 ms.
      try {
        const reclaimed = await registry.infrastructure.reclaimVault();
        if (reclaimed) {
          const mb = (n: number) => (n / 1048576).toFixed(1);
          console.log(`🛡️  [Vault] Reclaimed ${mb(reclaimed.before)} MB → ${mb(reclaimed.after)} MB`);
        }
      } catch (err: any) {
        // Never fail a good pulse over housekeeping. The graph is already committed; a vault that is
        // merely too big still answers every question correctly.
        console.error(`⚠️  [Vault] Compaction skipped: ${err.message}`);
      }
    } catch (err: any) {
      if (err.message?.includes("LOCKED")) {
        console.error("\n❌ [Conducks] Structural Synapse is LOCKED.");
        console.error("This usually happens if another Conducks process is running or a previous run crashed.");
        console.error("Please ensure no other 'analyze' or 'mirror' pulses are active.\n");
        process.exit(1);
      }
      throw err;
    } finally {
      // The close belongs in a `finally` around the PULSE, not after it. It used to sit past the
      // rethrow above, so a failed analyze — the exact case that leaves a transaction open and a
      // write-ahead log on disk — was the one case that never closed the vault.
      await closePersistence(registry);
    }
  }
}

/**
 * True when the pulse may proceed. Nothing is refused outright — `ask-twice` roots just cost a
 * second, deliberate confirmation (type the folder name), because they are almost always a typo.
 * With no TTY — a script, an agent, CI — an unanswerable question is a NO: silence must never start
 * an hours-long write.
 */
async function confirmScope(targetPath: string, registry: Registry, autoYes = false): Promise<boolean> {
  const scope = registry.infrastructure.assessScope(targetPath);
  if (scope.level === "ok") return true;

  console.error("\n\x1b[33m⚠️  [Conducks] This does not look like one project root.\x1b[0m");
  console.error(registry.infrastructure.explainScope(scope));

  // `--yes` IS the answer to the question, so it proceeds — but only after the reasons have been
  // printed. A silent bypass is what let an unattended run write a vault into a system temp folder
  // with nothing in the output to say it had been warned.
  if (autoYes) {
    console.error("\n[Conducks] Proceeding anyway — `--yes` was passed.\n");
    return true;
  }

  if (!process.stdin.isTTY) {
    console.error("\nNo terminal to confirm on — pass `--yes` if this really is the intended root.\n");
    return false;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const first = await rl.question("\nAnalyze it anyway? [y/N] ");
    if (!/^y(es)?$/i.test(first.trim())) return false;
    if (scope.level === "ask") return true;

    // Second gate: typing the folder name cannot be done by reflex, which is the entire point.
    const name = basename(scope.root) || scope.root;
    const second = await rl.question(`Type the folder name to confirm (\x1b[1m${name}\x1b[0m): `);
    if (second.trim() !== name) {
      console.error("Name did not match.");
      return false;
    }
    return true;
  } finally {
    rl.close();
  }
}