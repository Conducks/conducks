import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

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
  public usage = "conducks trace <symbol_id> [--flow]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const isFlow = args.includes('--flow');
    // `--limit <n>` raises the step cap. The flag and its value are both dropped before the symbol
    // is read, or `--limit` itself would be taken as the symbol to trace.
    const limitAt = args.indexOf('--limit');
    const limit = limitAt > -1 ? Number(args[limitAt + 1]) : TRACE_LIMIT;
    const stepCap = Number.isFinite(limit) && limit > 0 ? limit : TRACE_LIMIT;
    // `limitAt + 1` is only a real index when the flag is PRESENT — with no --limit, limitAt is -1
    // and that expression is 0, which dropped the symbol itself and printed the usage line.
    const valueAt = limitAt > -1 ? limitAt + 1 : -1;
    const symbolInput = args.filter((a, i) => a !== '--flow' && a !== '--limit' && i !== valueAt)[0];

    if (!symbolInput) {
      console.error("Usage: conducks trace <symbol_id> [--flow]");
      process.exit(1);
    }

    await syncGraph(registry);

    let symbolId = symbolInput;
    if (!registry.query.graph.getGraph().getNode(symbolInput)) {
      const results = await registry.query.query(symbolInput, 1);
      if (results.length > 0) {
        symbolId = results[0].id;
      }
    }

    console.log(`\n\x1b[1m--- 🔌 Conducks Structural Trace: ${symbolId} ---\x1b[0m`);

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
          console.log(`${prefix}. [\x1b[36m${step.type}\x1b[0m] ${step.name} (\x1b[2m${step.filePath}\x1b[0m)`);
        });
        reportTruncation(circuit.steps.length, flowLimit);
      } else {
        const steps = registry.kinetic.trace(symbolId);
        const stepLimit = stepCap;
        steps.slice(0, stepLimit).forEach((id: string, i: number) => {
          const n = registry.query.graph.getGraph().getNode(id);
          const prefix = (i + 1).toString().padStart(2, '0');
          if (n) {
            console.log(`${prefix}. [\x1b[35m${n.label}\x1b[0m] ${n.properties.name} (\x1b[2m${n.properties.filePath}\x1b[0m)`);
          } else {
            console.log(`${prefix}. [\x1b[90mEXTERNAL\x1b[0m] ${id} (\x1b[2mUnresolved Ghost Target\x1b[0m)`);
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
