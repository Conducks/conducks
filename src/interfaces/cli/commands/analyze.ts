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
    // folder that is not a project. Ask first; `--yes` skips the question for scripts.
    if (!args.includes('--yes') && !(await confirmScope(targetPath, registry))) {
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
    } catch (err: any) {
      if (err.message?.includes("LOCKED")) {
        console.error("\n❌ [Conducks] Structural Synapse is LOCKED.");
        console.error("This usually happens if another Conducks process is running or a previous run crashed.");
        console.error("Please ensure no other 'analyze' or 'mirror' pulses are active.\n");
        process.exit(1);
      }
      throw err;
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed
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
async function confirmScope(targetPath: string, registry: Registry): Promise<boolean> {
  const scope = registry.infrastructure.assessScope(targetPath);
  if (scope.level === "ok") return true;

  console.error("\n\x1b[33m⚠️  [Conducks] This does not look like one project root.\x1b[0m");
  console.error(registry.infrastructure.explainScope(scope));

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