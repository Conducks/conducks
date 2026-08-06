#!/usr/bin/env node
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs";
import { AnalyzeCommand } from "./commands/analyze.js";
import { StatusCommand } from "./commands/status.js";
import { QueryCommand } from "./commands/query.js";
import { ContextCommand } from "./commands/context.js";
import { AuditCommand } from "./commands/audit.js";
import { ArchCommand } from "./commands/arch.js";
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
import { InstallHooksCommand } from "./commands/install-hooks.js";
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
  'visuals-lint', 'install-hooks',
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
  'install-hooks',
]);

/**
 * The branch guard: the refusal a read command owes its caller when the vault describes another
 * branch (ADR 0035, todo20#P1).
 *
 * Returns the message to print, or null when there is nothing to refuse. Reads the LATEST pulse's
 * branch, because that is the branch the graph currently in the vault was built from — an older
 * pulse's branch describes rows that have since been swept.
 *
 * Every failure mode here returns null rather than refusing. A vault with no `pulses` row, an
 * unreadable vault, a directory with no git: none of those is evidence the graph describes the
 * wrong tree, and a guard that refuses when it cannot tell is a guard that blocks the commands ADR
 * 0035 promised would keep working without a repository.
 *
 * Exported so it can be asserted against a real vault and a real repository, rather than only
 * through a spawned CLI.
 *
 * Both dependencies are taken STRUCTURALLY rather than imported. ADR 0005 allows `cli` to import
 * `composition`, `contracts`, `web` and `mcp` — not `core` — and both of these objects already
 * arrive through the registry, so naming their shape here keeps the guard in the CLI without
 * opening a boundary the architecture gate would fail.
 */
export async function branchGuard(
  persistence: { query<T = any>(sql: string, params?: unknown[]): Promise<T[]> },
  chronicle: { branchRefusal(vaultBranch: string | null | undefined): string | null },
): Promise<string | null> {
  let rows: Array<{ branch: string | null }>;
  try {
    rows = await persistence.query<{ branch: string | null }>(
      'SELECT branch FROM pulses ORDER BY timestamp DESC LIMIT 1'
    );
  } catch {
    return null;                       // no vault, no pulses table, or a vault this cannot read
  }
  if (rows.length === 0) return null;  // never pulsed

  return chronicle.branchRefusal(rows[0]?.branch);
}

/**
 * Conducks — Modular Conducks CLI v2.0.0
 */
export async function main() {
  const args = process.argv.slice(2);
  const commandId = args[0] || "help";
  const cmdArgs = args.slice(1);

  // The CLI is QUIET by default; the MCP server is not (ADR 0080, todo02#P2).
  //
  // `conducks status` printed five boot lines before its report — grammar engine starting, grammar
  // engine ready, log sink anchored, synapse anchored, resonance flow pushed — on every read-only
  // command. None of it is the answer the caller asked for, and an agent parsing this has to know
  // which lines to discard.
  //
  // Set HERE rather than in the logger's default, because the default has to stay loud: the MCP
  // server shares this process's logger, stdout there is the JSON-RPC channel, and stderr is the
  // only legal sink it has. So the CLI opts into silence and `conducks mcp` opts back out below.
  //
  // Quiet suppresses the TERMINAL only. Every suppressed line still lands in `.conducks/mcp.log`,
  // so a failed pulse is still diagnosable — the point is to stop narrating startup, not to stop
  // recording it. `--verbose` and `CONDUCKS_VERBOSE=1` restore the terminal half.
  //
  // Scoped to READ commands. `analyze`, `watch` and `clean` are long-running and their progress IS
  // the output — silencing those would replace noise with a command that looks hung. And quiet never
  // suppresses WARN/ERROR/SUCCESS at any level, so a failure is still reported.
  const NARRATES = new Set(['analyze', 'watch', 'clean', 'record', 'mcp', 'setup', 'doctor', 'uninstall']);
  const verbose = args.includes('--verbose') || process.env.CONDUCKS_VERBOSE === '1';
  registry.infrastructure.logger.setQuiet(!verbose && !NARRATES.has(commandId));

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
  let explicitTarget = false;
  if (pathCandidate) {
    const resolvedCandidate = pathCandidate.startsWith('/') ? pathCandidate : path.resolve(process.cwd(), pathCandidate);
    if (fs.existsSync(resolvedCandidate) && fs.lstatSync(resolvedCandidate).isDirectory()) {
      targetPath = resolvedCandidate;
      explicitTarget = true;
    }
  }
  // WALK UP to the project, the way git does — using the SAME walk the engine uses.
  //
  // The CLI anchored the vault at `cwd` verbatim while `RegistryBootstrapper.discoverRoot` walked up
  // independently, so one directory inside a project the two disagreed: `cd src && conducks coverage`
  // opened a vault at `src/.conducks` — which it CREATED on the way — while the engine anchored at
  // the repository, and the run died printing a raw `DUCKDB_NODEJS_ERROR` object. Creating state on
  // a failed read is the worse half, because the directory left behind reads as a project on the
  // next run (ADR 0116).
  //
  // Keyed on whether a DIRECTORY was resolved, not on whether a positional was present: `coverage`'s
  // first positional is the report FILE, so a truthy-`pathCandidate` test would skip the walk for
  // exactly the command that exposed the need for it.
  if (!explicitTarget) {
    targetPath = registry.infrastructure.discoverRoot(targetPath);
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
    new AnalyzeCommand(), new QueryCommand(), new ContextCommand(), new AuditCommand(), new ArchCommand(),
    new ImpactCommand(), new StatusCommand(), new CleanCommand(), new SetupCommand(),
    new WatchCommand(), new DiffCommand(), new RenameCommand(), new ResonanceCommand(),
    new AdviseCommand(), new PruneCommand(),
    new ListCommand(), new EntropyCommand(), new CohesionCommand(), new FlowsCommand(),
    new TraceCommand(), new ExplainCommand(), new FallbackCommand(), new EntryCommand(), new McpCommand(),
    new DriftCommand(), new GuardCommand(), new RecordCommand(), new MirrorCommand(),
    new BootstrapDocsCommand(), new UninstallCommand(), new DoctorCommand(), new CoverageCommand(),
    new CoverageViewCommand(), new DocsStatusCommand(), new DocsLintCommand(), new VisualsLintCommand(),
    // `link` was imported and never instantiated, so `conducks link <path>` answered
    // `Unknown command "link"` while FederatedLinker underneath worked fine. Nothing caught it:
    // the import satisfied the compiler and no test drove the command surface.
    new SupplyChainCommand(), new LedgerCommand(), new MonitorCommand(), new LinkCommand(), new InstallHooksCommand()
  ];

  commands.push(new HelpCommand(commands));

  const command = commands.find(c => c.id === commandId);

  // `--help` on a COMMAND prints that command's usage, before anything runs.
  //
  // Every command's arg parser skips unknown `--flags`, so `conducks query --help` fell through as
  // an empty query — and an empty query is read as `*`, which prints the whole symbol inventory.
  // Asking a tool how to use it and getting a wall of results is the least helpful possible answer,
  // and it is the same shape for every command that takes a positional argument (ADR 0111).
  //
  // Handled in the DISPATCHER rather than per command, because the defect is per command and the
  // fix should not have to be repeated thirty-nine times.
  if (command && (args.includes('--help') || args.includes('-h'))) {
    console.log(`\n\x1b[1m${command.id}\x1b[0m — ${command.description}`);
    console.log(`\n\x1b[2mUsage:\x1b[0m ${command.usage ?? `conducks ${command.id}`}`);
    console.log(`\n\x1b[2mRun \`conducks help\` for the full command list.\x1b[0m\n`);
    process.exit(0);
  }

  // A FLAG THE COMMAND DOES NOT KNOW IS AN ERROR, NOT A NO-OP.
  //
  // Every command's arg parser skips unknown `--flags`, so a typo was accepted in silence and the
  // command did something else instead (ADR 0119):
  //
  //   conducks entry --jsn                      human output, exit 0 — the caller believes it
  //                                             asked for JSON and that it got it
  //   conducks coverage cov.json --vs-baselin   ran the ORDINARY overlay, exit 0 — the regression
  //                                             gate never ran, and nothing said so
  //
  // The second is the shape ADR 0116 fixed by hand for that one command: a gate that cannot fail
  // gates nothing. One dropped letter puts it straight back.
  //
  // The allowed set comes from the command's OWN `usage` string, which makes usage the single
  // source of truth rather than prose beside the code. A command reading a flag it does not
  // advertise now fails on that flag — so the drift is caught the first time someone uses it,
  // instead of never. `status` (`--blueprint`, `--pulse`) and `trace` (`--limit`) had exactly that
  // drift and their usage strings were corrected in the same change.
  //
  // In the DISPATCHER for the same reason `--help` is: the defect is per command, and the fix
  // should not be written thirty-nine times.
  if (command) {
    const GLOBAL_FLAGS = new Set(['--help', '-h', '--verbose']);
    const declared = new Set((command.usage ?? '').match(/--[a-z][a-z0-9-]*/g) ?? []);
    // `--history=<window>` is passed as `--history=5`; compare on the name, not the pair.
    const unknown = cmdArgs
      .filter(a => a.startsWith('--'))
      .map(a => a.split('=')[0])
      .filter(a => !declared.has(a) && !GLOBAL_FLAGS.has(a));
    if (unknown.length > 0) {
      console.error(
        `\x1b[31mUnknown flag${unknown.length > 1 ? 's' : ''} for \`${command.id}\`: ${unknown.join(', ')}\x1b[0m`);
      console.error(`\x1b[2mUsage:\x1b[0m ${command.usage ?? `conducks ${command.id}`}`);
      process.exit(1);
    }
  }

  // Mirror is a live visualizer and should avoid forcing a full structural load.
  const isStalenessBypass = STALENESS_BYPASS.has(commandId);
  // Commands that answer from markdown and the filesystem alone: skip the engine entirely (ADR 0033).
  const needsNoRegistry = NEEDS_NO_REGISTRY.has(commandId);

  if (command) {
    try {
      // Lazy load heavy dependencies (WASM, grammars) only upon execution.
      //
      // `analyze` defers the graph too, even though it is a write command. It is the one writer
      // that cannot use a preloaded graph: `AnalysisDomain.analyze` calls `graph.clear()` before
      // touching it, so the whole load is discarded, and the pulse reloads from the vault later
      // anyway. MEASURED: the bootstrap load costs 88 MB to 223 MB of RSS — 135 MB spent on a graph
      // nothing reads. It is safe because the analysis domain holds the graph instance directly
      // rather than through `registry.infrastructure.graphEngine`, so the deferral guard (ADR 0038)
      // never fires on this path, and `analyze` is already in STALENESS_BYPASS so nothing loads the
      // graph to print a staleness banner either.
      const deferGraph = isReadCommand || commandId === 'analyze';
      if (!needsNoRegistry) await registry.initialize(isReadCommand, targetPath, deferGraph);

      if (!isStalenessBypass) {
        // BEFORE the load, and it REFUSES rather than warns (ADR 0035). A warning above a full
        // answer is read as noise and the answer below it is taken — and that answer describes a
        // branch that is not on disk. Nothing about it is salvageable, so nothing is printed.
        const refusal = await branchGuard(persistence as any, registry.infrastructure.chronicle);
        if (refusal) {
          console.error(`\x1b[31m${refusal}\x1b[0m`);
          // `process.exitCode` + `return`, never `process.exit()`: the latter skips the `finally`
          // below, leaving the vault handle open on the way out.
          process.exitCode = 1;
          return;
        }

        await persistence.load(registry.query.graph.getGraph());
        const status = registry.audit.status();
        if (status.staleness.stale) {
          // "0 commits behind" was printed both when git said zero and when git could not be read
          // at all — and an unreadable git is exactly when a user needs telling. `getCommitsBehind`
          // now returns null for that case and the banner says so rather than inventing a count.
          const st = status.staleness as any;
          const behind = st.countUnavailable
            ? 'an unknown number of commits (git could not be read)'
            : `${st.commitsBehind ?? 0} commits`;
          console.log(`\x1b[33m⚠️  [Conducks] Index is ${behind} behind HEAD. Run 'conducks analyze' to refresh structural resonance.\x1b[0m\n`);
        }
      }

      await command.execute(cmdArgs, registry);
    } catch (err) {
      // The MESSAGE, not the object. Passing `err` to console.error printed the driver's internals —
      // `errno: -1, code: 'DUCKDB_NODEJS_ERROR', errorType: 'IO'` — which is the same leaked-driver
      // shape ADR 0115 fixed for `resonance`, here on the path every command falls through
      // (ADR 0116). The stack is still one flag away for whoever actually wants it.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\x1b[31m[Conducks CLI] Execution Error:\x1b[0m ${message}`);
      if (verbose && err instanceof Error && err.stack) console.error(`\x1b[2m${err.stack}\x1b[0m`);
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
