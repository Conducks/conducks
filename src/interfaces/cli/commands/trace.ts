import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";
import { displayId, displayPath, nameLookupFrom } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Trace (Lineage) Command
 * 
 * Maps the execution flow downstream or data lineage upstream.
 */
/**
 * How many steps a trace prints, and how it says so when there are more.
 *
 * The cap used to be a bare `.slice(0, 15)` with NOTHING printed about the rest. A trace that stops
 * at 15 and looks complete is a WRONG ANSWER: measured on the oracle fixture, a four-deep chain
 * reported three links and silently dropped the fourth, so "what does this reach" answered "not
 * ledgerWrite" when the edge was right there in the graph (ADR 0091).
 *
 * A bound is fine. A bound that hides itself is not.
 */
const TRACE_LIMIT = 15;

function reportTruncation(total: number, shown: number): void {
  if (total > shown) {
    console.log(`\x1b[33m    ...and ${total - shown} more step(s) not shown — this trace is TRUNCATED, not complete.\x1b[0m`);
    console.log(`\x1b[2m    Raise it with --limit <n>.\x1b[0m`);
  }
}

export class TraceCommand implements ConducksCommand {
  public id = "trace";
  public description = "Trace structural dependencies (use --flow for data lineage)";
  public usage = "conducks trace <symbol_id> [--mode reachability|path] [--target <symbol>] [--flow] [--limit <n>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isFlow = args.includes('--flow');

    // MIRROR THE TOOL. `conducks_trace` takes mode + target and answers the shortest structural path
    // between two symbols; the CLI could not ask that question at all, so the most useful thing this
    // command does was reachable from one surface only (todo61).
    //
    // The refusals are the tool's, for the reasons todo53 recorded: an unknown mode is an error rather
    // than a silent fall-through to reachability, and `path` without a target is a refusal rather than
    // a reachability answer handed back under a request for a path. "execution" stays accepted as the
    // deprecated alias (ADR 0066).
    //
    // `--flow` remains CLI-only: the rule is one-directional. Every MCP capability must exist here, not
    // the reverse.
    const TRACE_MODES = ['reachability', 'execution', 'path'] as const;
    const modeAt = args.indexOf('--mode');
    const mode = modeAt > -1 ? args[modeAt + 1] : undefined;
    if (mode !== undefined && !TRACE_MODES.includes(mode as never)) {
      console.error(`Error: --mode must be one of: ${TRACE_MODES.join(', ')} — got "${mode ?? ''}".`);
      process.exit(1);
    }
    const targetAt = args.indexOf('--target');
    const targetInput = targetAt > -1 ? args[targetAt + 1] : undefined;
    if (mode === 'path' && !targetInput) {
      console.error('Error: --mode path needs --target <symbol>. Without one there is no path to walk.');
      process.exit(1);
    }
    // `--limit <n>` raises the step cap. The flag and its value are both dropped before the symbol
    // is read, or `--limit` itself would be taken as the symbol to trace.
    const limitAt = args.indexOf('--limit');
    const limit = limitAt > -1 ? Number(args[limitAt + 1]) : TRACE_LIMIT;
    const stepCap = Number.isFinite(limit) && limit > 0 ? limit : TRACE_LIMIT;
    // `limitAt + 1` is only a real index when the flag is PRESENT — with no --limit, limitAt is -1
    // and that expression is 0, which dropped the symbol itself and printed the usage line.
    const valueAt = limitAt > -1 ? limitAt + 1 : -1;
    const useJson = args.includes('--json');
    // Every FLAG VALUE is skipped, not just --limit's. Without this, `trace alpha --target beta` reads
    // `beta` as a second positional and the wrong symbol can be traced.
    const flagValues = new Set([valueAt, modeAt > -1 ? modeAt + 1 : -1, targetAt > -1 ? targetAt + 1 : -1]);
    const symbolInput = args.filter((a, i) => !a.startsWith('--') && !flagValues.has(i))[0];

    if (!symbolInput) {
      console.error("Usage: conducks trace <symbol_id> [--flow]");
      process.exit(1);
    }

    await syncGraph(registry);

    // RESOLVE THE WAY EVERY OTHER COMMAND DOES. This used to try `getNode(input)` and then a
    // one-result `query()`, and when both missed it kept the RAW INPUT and traced from it — so a
    // symbol id no node is keyed by walked from nowhere and printed a heading with no steps under
    // it. That reads as "this symbol depends on nothing", which is a WRONG ANSWER rather than a
    // failure (ADR 0044: a walk that ran on nothing is not an empty result).
    //
    // MEASURED on a two-file Python fixture whose `run` calls `used_fn` over a direct CALLS edge:
    // `trace pkg/main.py::run` printed nothing while `impact` on the same symbol reported the call,
    // and passing the fully-qualified lowercased id to the same command returned six steps. The
    // partial form is what `context`, `impact` and `explain` all accept and what the docs show.
    //
    // `resolveSymbol` also REFUSES loudly when the symbol truly does not exist, which is the half
    // this command never had: silence and absence looked identical here.
    // Relative, real-case display (ADR 0132): a trace prints many rows, each of which repeated the
    // same ~90-character absolute lowercased prefix before the file that answers the question.
    //
    // Hoisted above the PATH MODE branch below, which used to `return` before either was defined
    // and so printed `symbolId`/`targetId`/`st.filePath` raw — the one branch of this command that
    // skipped the repair every other branch applies.
    const traceRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
    const rel = (p: any) => (p ? displayPath(String(p), traceRoot) : p);
    const traceNames = nameLookupFrom(registry.query.graph.getGraph());
    const formatId = (id: string) => displayId(id, traceRoot, traceNames);

    const symbolId = resolveSymbol(symbolInput, registry.query.graph.getGraph(), formatId);

    // PATH MODE — the shortest structural path to a target, the same answer `conducks_trace` gives.
    if (mode === 'path') {
      // Same resolver for the TARGET, for the same reason: an unresolved target made `findPath`
      // walk toward an id the graph does not hold and report "no structural path" — a claim about
      // the code, from a lookup that never landed.
      const targetId = resolveSymbol(targetInput as string, registry.query.graph.getGraph(), formatId);
      const path = await registry.kinetic.findPath(symbolId, targetId);
      const steps = path.map((id: string) => {
        const n = registry.query.graph.getGraph().getNode(id);
        return n
          ? { id, name: n.properties.name, kind: n.label, filePath: n.properties.filePath, resolved: true }
          : { id, name: id, kind: 'EXTERNAL', filePath: null, resolved: false };
      });
      if (useJson) {
        process.stdout.write(JSON.stringify({ symbolId, target: targetId, mode: 'path', steps }, null, 2) + '\n');
        return;
      }
      if (steps.length === 0) {
        console.log(`\x1b[33mNo structural path from ${formatId(symbolId)} to ${formatId(targetId)}.\x1b[0m`);
        return;
      }
      console.log(`\n\x1b[1m--- 🛤️  Shortest Structural Path ---\x1b[0m`);
      steps.forEach((st, i) => console.log(`  ${i + 1}. ${st.resolved ? st.name : `${st.name} (unresolved)`}  \x1b[2m${rel(st.filePath)}\x1b[0m`));
      return;
    }

    // `--json`, because a dependency chain is something a caller walks rather than reads. The
    // heading is suppressed rather than moved: it used to go to stdout unconditionally, so anything
    // piping this command got the banner in front of its data (ADR 0119).
    if (useJson) {
      const steps = isFlow
        ? registry.kinetic.flow(symbolId).steps ?? []
        : registry.kinetic.trace(symbolId).map((id: string) => {
            const n = registry.query.graph.getGraph().getNode(id);
            // An unresolved target is REPORTED as unresolved rather than dropped — the human
            // branch prints it as an "Unresolved Ghost Target", and a caller that cannot see the
            // gap would read a shorter chain as a complete one.
            return n
              ? { id, name: n.properties.name, kind: n.label, filePath: n.properties.filePath, resolved: true }
              : { id, name: id, kind: 'EXTERNAL', filePath: null, resolved: false };
          });
      process.stdout.write(JSON.stringify({
        symbolId,
        mode: isFlow ? 'flow' : 'trace',
        limit: stepCap,
        truncated: steps.length > stepCap,
        steps: steps.slice(0, stepCap),
      }, null, 2) + '\n');
      return;
    }

    console.log(`\n\x1b[1m--- 🔌 Conducks Structural Trace: ${formatId(symbolId)} ---\x1b[0m`);

    try {
      if (isFlow) {
        const circuit = registry.kinetic.flow(symbolId);
        if (!circuit.steps || circuit.steps.length === 0) {
          console.log(`\x1b[90mNo downstream data logic execution found.\x1b[0m`);
          return;
        }
        const flowLimit = stepCap;
        circuit.steps.slice(0, flowLimit).forEach((step: any, i: number) => {
          const prefix = (i + 1).toString().padStart(2, '0');
          console.log(`${prefix}. [\x1b[36m${step.type}\x1b[0m] ${step.name} (\x1b[2m${rel(step.filePath)}\x1b[0m)`);
        });
        reportTruncation(circuit.steps.length, flowLimit);
      } else {
        const steps = registry.kinetic.trace(symbolId);
        const stepLimit = stepCap;
        steps.slice(0, stepLimit).forEach((id: string, i: number) => {
          const n = registry.query.graph.getGraph().getNode(id);
          const prefix = (i + 1).toString().padStart(2, '0');
          if (n) {
            console.log(`${prefix}. [\x1b[35m${n.label}\x1b[0m] ${n.properties.name} (\x1b[2m${rel(n.properties.filePath)}\x1b[0m)`);
          } else {
            console.log(`${prefix}. [\x1b[90mEXTERNAL\x1b[0m] ${formatId(id)} (\x1b[2mUnresolved Ghost Target\x1b[0m)`);
          }
        });
        reportTruncation(steps.length, stepLimit);
      }
    } catch (err) {
      console.error(`Trace Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
