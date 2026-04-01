#!/usr/bin/env node
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
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
import { VisualizeCommand } from "./commands/visualize.js";
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
  let commandId = args[0] || "help";
  if (commandId.startsWith("--")) {
    commandId = commandId.slice(2);
  }
  const isMcpCommand = commandId === 'mcp';

  if (isMcpCommand) {
    /**
     * FIX 3 (CORE): Redirect all console methods to stderr for MCP commands.
     * This ensures human-readable CLI logs do not pollute the stdout stream,
     * which is reserved for the JSON-RPC Model Context Protocol messages.
     * We do this as the very first action in main().
     */
    const silence = (...args: any[]) => console.error(...args);
    console.log = silence;
    console.info = silence;
    console.warn = silence;
    console.debug = silence;
  }

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

  const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  const writeCommands = ['analyze', 'setup', 'clean', 'rename'];
  const isReadOnly = !writeCommands.includes(commandId);

  chronicle.setProjectDir(targetPath);

  // Registry of modular commands
  const commands: ConducksCommand[] = [
    new AnalyzeCommand(), new QueryCommand(), new ContextCommand(), new AuditCommand(),
    new ImpactCommand(), new StatusCommand(), new CleanCommand(), new SetupCommand(),
    new WatchCommand(), new DiffCommand(), new RenameCommand(), new ResonanceCommand(),
    new AdviseCommand(), new PruneCommand(), new BlueprintCommand(), new MirrorCommand(),
    new ContextGenCommand(), new LinkCommand(), new VisualizeCommand(),
    new ListCommand(), new EntropyCommand(), new CohesionCommand(), new FlowsCommand(),
    new TraceCommand(), new ExplainCommand(), new EntryCommand(), new McpCommand(),
    new BootstrapDocsCommand(), new RecordCommand()
  ];

  commands.push(new HelpCommand(commands));

  const effectiveId = commandId;
  const command = commands.find(c => c.id === effectiveId);
  const isStalenessBypass = ['analyze', 'help', 'setup', 'clean', 'mcp', 'bootstrap-docs', 'record'].includes(effectiveId);

  /**
   * FIX 2: Long-running commands must NOT have their persistence layer closed
   * by the CLI's finally block. The original code had this list but the
   * finally block always called persistence.close() unconditionally.
   * The guard below ensures close() is skipped for persistent commands,
   * allowing the watcher/mcp event loop to remain alive.
   */
  const persistentCommands = new Set(['watch', 'mcp']);
  const isPersistent = persistentCommands.has(commandId);

  if (command) {
    try {
      console.log(`[CLI] Initializing registry (readOnly: ${isReadOnly}, root: ${targetPath})...`);
      await registry.initialize(isReadOnly, targetPath);
      console.log(`[CLI] Registry initialized. Executing command: ${commandId}...`);
      const persistence = registry.infrastructure.persistence;

      if (!isStalenessBypass && !isMcpCommand) {
        const status = registry.audit.status();
        if (status.staleness.stale) {
          const commits = (status.staleness as any).commitsBehind || 0;
          console.log(`\x1b[33m⚠️  [Conducks] Index is ${commits} commits behind HEAD. Run 'conducks analyze' to refresh structural resonance.\x1b[0m\n`);
        }
      }

      console.log(`[CLI] Calling ${command.id}.execute()...`);
      await command.execute(cmdArgs, persistence as any);
      console.log(`[CLI] ${command.id}.execute() completed.`);
    } catch (err) {
      console.error(`\x1b[31m[Conducks CLI] Execution Error:\x1b[0m`, err);
      process.exit(1);
    } finally {
      // FIX 2: Only close persistence for short-lived commands.
      // Persistent commands (watch, mcp) manage their own lifecycle
      // and rely on the DB connection staying open until SIGINT/SIGTERM.
      if (!isPersistent) {
        await registry.infrastructure.persistence.close();
      }
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