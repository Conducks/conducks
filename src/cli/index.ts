#!/usr/bin/env node
import { GraphPersistence } from "../../lib/core/graph/persistence.js";
import { conducks } from "../conducks-core.js";
import path from "node:path";
import { AnalyzeCommand } from "./commands/analyze.js";
import { StatusCommand } from "./commands/status.js";
import { QueryCommand } from "./commands/query.js";
import { ContextCommand } from "./commands/context.js";
import { VerifyCommand } from "./commands/verify.js";
import { CleanCommand } from "./commands/clean.js";
import { BlueprintCommand } from "./commands/blueprint.js";
import { SetupCommand } from "./commands/setup.js";
import { ListCommand } from "./commands/list.js";
import { EntropyCommand } from "./commands/entropy.js";
import { CohesionCommand } from "./commands/cohesion.js";
import { ImpactCommand } from "./commands/impact.js";
import { LinkCommand } from "./commands/link.js";
import { DiffCommand } from "./commands/diff.js";
import { FlowsCommand } from "./commands/flows.js";
import { RenameCommand } from "./commands/rename.js";
import { ResonanceCommand } from "./commands/resonance.js";
import { PruneCommand } from "./commands/prune.js";
import { AdviseCommand } from "./commands/advise.js";
import { WatchCommand } from "./commands/watch.js";
import { MirrorCommand } from "./commands/mirror.js";
import { TraceCommand } from "./commands/trace.js";
import { ExplainCommand } from "./commands/explain.js";
import { HelpCommand } from "./commands/help.js";
import { EntryCommand } from "./commands/entry.js";
import { ApostleCommand } from "./command.js";
import { chronicle } from "../../lib/core/git/chronicle-interface.js";

/**
 * Conducks — Modular Apostle CLI v2.0.0
 * 
 * Re-architected for high-fidelity modularity and structural parity with .
 */
async function main() {
  const args = process.argv.slice(2);
  const commandId = args[0] || "help";
  const cmdArgs = args.slice(1);

  // Apostle v3: Intelligent Persistence Targeting
  // Skip values associated with known flags to avoid misinterpreting pulse IDs as paths.
  let positionalArgs: string[] = [];
  for (let i = 0; i < cmdArgs.length; i++) {
    const arg = cmdArgs[i];
    if (arg.startsWith('--')) {
      // Skip the next argument if it's a value for a flag
      if (['--base', '--head', '--symbol', '--id', '--q'].includes(arg)) {
        i++; 
      }
      continue;
    }
    positionalArgs.push(arg);
  }

  // Heuristic: for certain commands, the first positional arg is NOT the path
  const skipFirstArg = ['query', 'explain', 'rename', 'trace', 'resonance', 'impact', 'entropy', 'cohesion', 'flows'].includes(commandId);
  const pathArg = skipFirstArg ? positionalArgs[1] : positionalArgs[0];
  
  const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();
  const isReadCommand = ['diff', 'explain', 'status', 'list', 'context'].includes(commandId);
  const persistence = new GraphPersistence(targetPath, isReadCommand);
  
  // Apostle v5.4: Align Chronicle Interface with Target Path
  chronicle.setProjectDir(targetPath);

  // Registry of modular commands
  const commands: ApostleCommand[] = [
    new AnalyzeCommand(),
    new QueryCommand(),
    new ContextCommand(),
    new VerifyCommand(),
    new ImpactCommand(),
    new StatusCommand(),
    new CleanCommand(),
    new SetupCommand(),
    new WatchCommand(),
    new DiffCommand(),
    new RenameCommand(),
    new ResonanceCommand(),
    new AdviseCommand(),
    new PruneCommand(),
    new BlueprintCommand(),
    new MirrorCommand(),
    new ListCommand(),
    new EntropyCommand(),
    new CohesionCommand(),
    new FlowsCommand(),
    new TraceCommand(),
    new ExplainCommand(),
    new EntryCommand()
  ];

  // Add help command with access to all other commands
  commands.push(new HelpCommand(commands));

  const command = commands.find(c => c.id === commandId);
  const isStalenessBypass = ['analyze', 'help', 'setup', 'clean'].includes(commandId);

  if (command) {
    try {
      // Apostle v5.4: Active Staleness Verification
      if (!isStalenessBypass) {
        await persistence.load(conducks.graph.getGraph());
        const staleness = conducks.checkStaleness();
        if (staleness && staleness.stale) {
          console.log(`\x1b[33m⚠️  [Apostle] Index is ${staleness.commitsBehind} commits behind HEAD. Run 'conducks analyze' to refresh structural resonance.\x1b[0m\n`);
        }
      }

      await command.execute(cmdArgs, persistence);
    } catch (err) {
      console.error(`\x1b[31m[Apostle CLI] Execution Error:\x1b[0m`, err);
      process.exit(1);
    }
  } else {
    console.error(`\x1b[31mError: Unknown command "${commandId}"\x1b[0m`);
    console.log(`Run 'conducks help' for a list of available commands.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("\x1b[31m[Conducks CLI] Fatal Synapse Error:\x1b[0m", err);
  process.exit(1);
});
