#!/usr/bin/env node
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs";
import { AnalyzeCommand } from "./commands/analyze.js";
import { StatusCommand } from "./commands/status.js";
import { QueryCommand } from "./commands/query.js";
import { ContextCommand } from "./commands/context.js";
import { VerifyCommand } from "./commands/verify.js";
import { CleanCommand } from "./commands/clean.js";
import { ContextGenCommand } from "./commands/context-gen.js";
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
import { McpCommand } from "./commands/mcp.js";
import { BootstrapDocsCommand } from "./commands/bootstrap-docs.js";
import { RecordCommand } from "./commands/record.js";
import { ConducksCommand } from "./command.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";

import { fileURLToPath } from 'url';

/**
 * Conducks — Modular Conducks CLI v2.0.0
 */
export async function main() {
  const args = process.argv.slice(2);
  const commandId = args[0] || "help";
  const cmdArgs = args.slice(1);

  // Conducks: Intelligent Persistence Targeting
  let positionalArgs: string[] = [];
  for (let i = 0; i < cmdArgs.length; i++) {
    const arg = cmdArgs[i];
    if (arg.startsWith('--')) {
      if (['--base', '--head', '--symbol', '--id', '--q'].includes(arg)) {
        i++;
      }
      continue;
    }
    positionalArgs.push(arg);
  }

  const targetPath = process.cwd();
  const isReadCommand = ['diff', 'explain', 'status', 'list', 'context'].includes(commandId);
  const persistence = new GraphPersistence(targetPath, isReadCommand);

  chronicle.setProjectDir(targetPath);

  // Registry of modular commands
  const commands: ConducksCommand[] = [
    new AnalyzeCommand(), new QueryCommand(), new ContextCommand(), new VerifyCommand(),
    new ImpactCommand(), new StatusCommand(), new CleanCommand(), new SetupCommand(),
    new WatchCommand(), new DiffCommand(), new RenameCommand(), new ResonanceCommand(),
    new AdviseCommand(), new PruneCommand(), new BlueprintCommand(), new MirrorCommand(),
    new ContextGenCommand(),
    new ListCommand(), new EntropyCommand(), new CohesionCommand(), new FlowsCommand(),
    new TraceCommand(), new ExplainCommand(), new EntryCommand(), new McpCommand(),
    new BootstrapDocsCommand(), new RecordCommand()
  ];

  commands.push(new HelpCommand(commands));

  const command = commands.find(c => c.id === commandId);
  const isStalenessBypass = ['analyze', 'help', 'setup', 'clean', 'mcp', 'bootstrap-docs', 'record'].includes(commandId);
  const isMcpCommand = commandId === 'mcp';

  if (command) {
    try {
      // Lazy load heavy dependencies (WASM, grammars) only upon execution
      await registry.initialize();

      if (!isStalenessBypass && !isMcpCommand) {
        await persistence.load(registry.intelligence.graph.getGraph());
        const status = registry.governance.status();
        if (status.staleness.stale) {
          const commits = (status.staleness as any).commitsBehind || 0;
          console.log(`\x1b[33m⚠️  [Conducks] Index is ${commits} commits behind HEAD. Run 'conducks analyze' to refresh structural resonance.\x1b[0m\n`);
        }
      }

      await command.execute(cmdArgs, persistence);
    } catch (err) {
      console.error(`\x1b[31m[Conducks CLI] Execution Error:\x1b[0m`, err);
      process.exit(1);
    } finally {
      await persistence.close();
    }
  } else {
    console.error(`\x1b[31mError: Unknown command "${commandId}"\x1b[0m`);
    console.log(`Run 'conducks help' for a list of available commands.`);
    process.exit(1);
  }
}

// Robust isMain detection that resolves symlinks so global symlinked installs work.
const thisPath = fileURLToPath(import.meta.url);
let invokedPath: string | undefined = undefined;
if (process.argv[1]) {
  invokedPath = process.argv[1].startsWith('/') ? process.argv[1] : path.resolve(process.cwd(), process.argv[1]);
  try {
    invokedPath = fs.realpathSync(invokedPath);
  } catch (_) { }
}
let thisReal = thisPath;
try { thisReal = fs.realpathSync(thisPath); } catch (_) { }
const isMain = !!(invokedPath && thisReal === invokedPath);
if (isMain) {
  main().catch(err => {
    console.error("\x1b[31m[Conducks CLI] Fatal Synapse Error:\x1b[0m", err);
    process.exit(1);
  });
}
