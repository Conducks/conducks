#!/usr/bin/env node
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs";
import { AnalyzeCommand } from "./commands/analyze.js";
import { StatusCommand } from "./commands/status.js";
import { QueryCommand } from "./commands/query.js";
import { ContextCommand } from "./commands/context.js";
import { AuditCommand } from "./commands/audit.js";
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
import { FallbackCommand } from "./commands/fallback.js";
import { HelpCommand } from "./commands/help.js";
import { EntryCommand } from "./commands/entry.js";
import { McpCommand } from "./commands/mcp.js";
import { DriftCommand } from "./commands/drift.js";
import { GuardCommand } from "./commands/guard.js";
import { RecordCommand } from "./commands/record.js";
import { VisualizeCommand } from "./commands/visualize.js";
import { BootstrapDocsCommand } from "./commands/bootstrap-docs.js";
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

  // Apostle v3: Intelligent Persistence Targeting
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

  const skipFirstArg = ['query', 'explain', 'rename', 'trace', 'resonance', 'impact', 'entropy', 'cohesion', 'flows'].includes(commandId);
  const pathArg = skipFirstArg ? positionalArgs[1] : positionalArgs[0];
  
  let targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();
  
  // 🛡️ [Root Detachment Check]
  // Standard MCP runners execute global binaries from detached roots (/).
  // If we identify a detached root, fallback to CONDUCKS_WORKSPACE_ROOT or anchor to absolute project path via import.meta.url
  if (targetPath === '/' || targetPath === '/root' || targetPath === '/Users' || targetPath === '/usr') {
    targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
  }
  // Only 'analyze' writes to the vault. 'clean' is a destructive wipe (also needs write access).
  // Every other command is strictly read-only.
  const isReadCommand = !['analyze', 'clean'].includes(commandId);
  const persistence = new SynapsePersistence(targetPath, isReadCommand);
  
  chronicle.setProjectDir(targetPath);

  // Registry of modular commands
  const commands: ConducksCommand[] = [
    new AnalyzeCommand(), new QueryCommand(), new ContextCommand(), new AuditCommand(),
    new ImpactCommand(), new StatusCommand(), new CleanCommand(), new SetupCommand(),
    new WatchCommand(), new DiffCommand(), new RenameCommand(), new ResonanceCommand(),
    new AdviseCommand(), new PruneCommand(), new BlueprintCommand(), new ContextGenCommand(),
    new ListCommand(), new EntropyCommand(), new CohesionCommand(), new FlowsCommand(),
    new TraceCommand(), new ExplainCommand(), new FallbackCommand(), new EntryCommand(), new McpCommand(),
    new DriftCommand(), new GuardCommand(), new RecordCommand(), new VisualizeCommand(), new MirrorCommand(),
    new BootstrapDocsCommand()
  ];

  commands.push(new HelpCommand(commands));

  const command = commands.find(c => c.id === commandId);
  
  // Mirror is a live visualizer and should avoid forcing a full structural load.
  const isStalenessBypass = ['analyze', 'help', 'setup', 'clean', 'visualize', 'mirror', 'fallback', 'watch', 'record', 'mcp'].includes(commandId);

  if (command) {
    try {
      // Lazy load heavy dependencies (WASM, grammars) only upon execution
      await registry.initialize(isReadCommand, targetPath, isReadCommand);
      
      if (!isStalenessBypass) {
        await persistence.load(registry.query.graph.getGraph());
        const status = registry.audit.status();
        if (status.staleness.stale) {
          const commits = (status.staleness as any).commitsBehind || 0;
          console.log(`\x1b[33m⚠️  [Conducks] Index is ${commits} commits behind HEAD. Run 'conducks analyze' to refresh structural resonance.\x1b[0m\n`);
        }
      }

      await command.execute(cmdArgs, registry);
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
  } catch (_) {}
}
let thisReal = thisPath;
try { thisReal = fs.realpathSync(thisPath); } catch (_) {}
const isMain = !!(invokedPath && thisReal === invokedPath);
if (isMain) {
  main().catch(err => {
    console.error("\x1b[31m[Conducks CLI] Fatal Synapse Error:\x1b[0m", err);
    process.exit(1);
  });
}
