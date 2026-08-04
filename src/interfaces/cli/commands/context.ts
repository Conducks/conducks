import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { syncGraph, closePersistence } from "@/interfaces/cli/shared/context.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";

/**
 * Conducks — Context (Trace) Command
 */
export class ContextCommand implements ConducksCommand {
  public id = "context";
  public description = "View symbol relationships and technical flows";
  public usage = "conducks context <symbolId> [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const symbolId = args.find(a => !a.startsWith('--'));
    if (!symbolId) {
      console.error("Error: Please provide a symbol ID (filePath::name) to trace.");
      process.exit(1);
    }

    try {
      await syncGraph(registry);
      const g = registry.query.graph.getGraph();
      const resolvedId = resolveSymbol(symbolId, g);
      const steps = registry.kinetic.trace(resolvedId);

      if (steps.length === 0) {
        if (useJson) {
          process.stdout.write(JSON.stringify({ symbolId: resolvedId, steps: [] }, null, 2) + '\n');
          return;
        }
        console.error(`❌ No flows found for: ${resolvedId}`);
        process.exit(1);
      }

      if (useJson) {
        process.stdout.write(JSON.stringify({
          symbolId: resolvedId,
          steps: steps.map((id: string, i: number) => {
            const node = g.getNode(id);
            return {
              order: i + 1,
              id,
              label: node?.label || 'node',
              name: node?.properties?.name || id,
              filePath: node?.properties?.filePath || null,
            };
          }),
        }, null, 2) + '\n');
        return;
      }

      // RELATIVE path and the DECLARATION LINE at each step (ADR 0132, todo39#P3). The absolute
      // path was ~90 characters of identical prefix on every row; the line is what lets a reader
      // follow the chain without opening each file in turn.
      const reader = registry.source.lineReader();
      const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
      const rel = (p: string) =>
        p && p.toLowerCase().startsWith(projectRoot.toLowerCase()) ? p.slice(projectRoot.length + 1) : p;

      console.log(`--- Technical Flow Trace: ${rel(resolvedId)} ---`);
      steps.forEach((id: string, i: number) => {
        const node = g.getNode(id);
        const file = String(node?.properties?.filePath || '');
        const line = Number((node?.properties as any)?.range?.start?.line ?? (node?.properties as any)?.lineStart ?? 0) || 0;
        const at = file ? `${rel(file)}${line ? `:${line}` : ''}` : 'unknown';
        console.log(`  ${i + 1}. ${node?.label || 'node'} ${node?.properties?.name || id} (${at})`);
        if (file && line) {
          const src = reader.read(file, line);
          if (src.text) console.log(`        ${src.text}`);
        }
      });
    } finally {
      // Ensure the DuckDB connection is ALWAYS closed to prevent EMFILE/leaks
      await closePersistence(registry);
    }
  }
}

