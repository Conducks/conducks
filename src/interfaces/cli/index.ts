#!/usr/bin/env node
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs";
import { AnalyzeCommand } from "./commands/analyze.js";
import { StatusCommand } from "./commands/status.js";
import { QueryCommand } from "./commands/query.js";
import { ContextCommand } from "./commands/context.js";
import { AuditCommand } from "./commands/audit.js";
import { CleanCommand } from "./commands/clean.js";
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
import { BootstrapDocsCommand } from "./commands/bootstrap-docs.js";
import { UninstallCommand } from "./commands/uninstall.js";
import { DoctorCommand } from "./commands/doctor.js";
import { CoverageCommand } from "./commands/coverage.js";
import { CoverageViewCommand } from "./commands/coverage-view.js";
import { DocsStatusCommand } from "./commands/docs-status.js";
import { MonitorCommand } from "./commands/monitor.js";
import { DocsLintCommand } from "./commands/docs-lint.js";
import { VisualsLintCommand } from "./commands/visuals-lint.js";
import { SupplyChainCommand } from "./commands/supply-chain.js";
import { LedgerCommand } from "./commands/ledger.js";
import { ConducksCommand } from "./command.js";

import { fileURLToPath } from 'url';

process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
});

/**
 * Commands that must NOT have the persisted graph loaded and staleness-checked before they run.
 *
 * Two reasons land a command here: it writes the graph (`analyze`, `clean`), or it does not read it.
 */
export const STALENESS_BYPASS = new Set([
  'analyze', 'help', 'setup', 'uninstall', 'doctor', 'clean', 'mirror', 'fallback',
  'watch', 'record', 'mcp', 'docs-status', 'docs-lint', 'bootstrap-docs', 'monitor',
  'visuals-lint',
]);

/**
 * Commands that need no structural engine AT ALL — no grammars, no vault, no graph (ADR 0033).
 *
 * This is the CLI's half of the docs/code split ADR 0023 made on the MCP surface. These answer from
 * authored markdown and the filesystem: `docs-status` and `docs-lint` call `buildBoard`, which walks
 * `docs/`; `bootstrap-docs` writes template files; `monitor` opens each REGISTERED project's vault
 * read-only itself and never touches the current one; `help` prints a list it was handed.
 *
 * Skipping `registry.initialize()` skips loading 12 tree-sitter grammars and reading the whole graph
 * out of DuckDB — work these commands then never use. `STALENESS_BYPASS` alone was not enough: it
 * skips the load in `main`, but `initialize` performs its own load before that check is ever reached.
 *
 * MUST be a subset of `STALENESS_BYPASS`. A command here but not there would skip the init and then be
 * asked for a graph nobody loaded — asserted by `tests/unit/interfaces/cli/no-registry-commands.test.ts`.
 */
export const NEEDS_NO_REGISTRY = new Set([
  'help', 'docs-status', 'docs-lint', 'bootstrap-docs', 'monitor', 'visuals-lint',
]);

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
      if (['--base', '--head', '--symbol', '--id', '--q', '--mode', '--file', '--limit', '--direction'].includes(arg)) {
        i++; 
      }
      continue;
    }
    positionalArgs.push(arg);
  }

  const skipFirstArg = ['query', 'explain', 'rename', 'trace', 'resonance', 'impact', 'entropy', 'cohesion', 'flows', 'context'].includes(commandId);
  const pathCandidate = skipFirstArg ? positionalArgs[1] : positionalArgs[0];
  
  let targetPath = process.cwd();
  if (pathCandidate) {
    const resolvedCandidate = pathCandidate.startsWith('/') ? pathCandidate : path.resolve(process.cwd(), pathCandidate);
    if (fs.existsSync(resolvedCandidate) && fs.lstatSync(resolvedCandidate).isDirectory()) {
      targetPath = resolvedCandidate;
    }
  }
  
  // 🛡️ [Root Detachment Check]
  // Standard MCP runners execute global binaries from detached roots (/).
  // If we identify a detached root, fallback to CONDUCKS_WORKSPACE_ROOT or anchor to absolute project path via import.meta.url
  if (targetPath === '/' || targetPath === '/root' || targetPath === '/Users' || targetPath === '/usr') {
    targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
  }
  // Only 'analyze' writes to the vault. 'clean' is a destructive wipe (also needs write access).
  // Every other command is strictly read-only.
  const isReadCommand = !['analyze', 'clean'].includes(commandId);
  const persistence = registry.infrastructure.createPersistence(targetPath, isReadCommand);
  
  registry.infrastructure.chronicle.setProjectDir(targetPath);

  // Registry of modular commands
  const commands: ConducksCommand[] = [
    new AnalyzeCommand(), new QueryCommand(), new ContextCommand(), new AuditCommand(),
    new ImpactCommand(), new StatusCommand(), new CleanCommand(), new SetupCommand(),
    new WatchCommand(), new DiffCommand(), new RenameCommand(), new ResonanceCommand(),
    new AdviseCommand(), new PruneCommand(),
    new ListCommand(), new EntropyCommand(), new CohesionCommand(), new FlowsCommand(),
    new TraceCommand(), new ExplainCommand(), new FallbackCommand(), new EntryCommand(), new McpCommand(),
    new DriftCommand(), new GuardCommand(), new RecordCommand(), new MirrorCommand(),
    new BootstrapDocsCommand(), new UninstallCommand(), new DoctorCommand(), new CoverageCommand(),
    new CoverageViewCommand(), new DocsStatusCommand(), new DocsLintCommand(), new VisualsLintCommand(),
    new SupplyChainCommand(), new LedgerCommand(), new MonitorCommand()
  ];

  commands.push(new HelpCommand(commands));

  const command = commands.find(c => c.id === commandId);
  
  // Mirror is a live visualizer and should avoid forcing a full structural load.
  const isStalenessBypass = STALENESS_BYPASS.has(commandId);
  // Commands that answer from markdown and the filesystem alone: skip the engine entirely (ADR 0033).
  const needsNoRegistry = NEEDS_NO_REGISTRY.has(commandId);

  if (command) {
    try {
      // Lazy load heavy dependencies (WASM, grammars) only upon execution
      if (!needsNoRegistry) await registry.initialize(isReadCommand, targetPath, isReadCommand);

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
