import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { STRUCTURAL_EDGE_TYPES } from "@/lib/core/graph/adjacency-list.js";
import path from "node:path";
import fs from "fs-extra";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Visualize Command (The Structural Mirror)
 *
 * Emits a READABLE Mermaid graph, not the whole synapse. Two modes:
 *   visualize [N]              → the top-N nodes by gravity + the dependency edges AMONG them
 *   visualize --focus <name>   → one symbol and its 1-hop dependency neighbours (a connected subgraph)
 * Only dependency edges are drawn — structural containment (a file owning its symbols) and
 * self-loops are excluded, or the diagram degenerates into a hairball of ownership arrows.
 */
export class VisualizeCommand implements ConducksCommand {
  public id = "visualize";
  public description = "Generate a static Mermaid structural mirror (top-N by gravity, or --focus <symbol>)";
  public usage = "conducks visualize [N] [--focus <symbol>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const limitArg = args.find(a => !a.startsWith('--'));
    const limit = limitArg ? parseInt(limitArg, 10) : 30;
    const focusIdx = args.indexOf('--focus');
    const focus = focusIdx !== -1 ? args[focusIdx + 1] : undefined;
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    chronicle.setProjectDir(targetPath);

    try {
      (registry.infrastructure.graphEngine as any).resonate();
      const graph = registry.query.graph.getGraph();

      const isDependency = (e: any) => !STRUCTURAL_EDGE_TYPES.includes(e.type) && e.sourceId !== e.targetId;
      const key = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');
      const allNodes = Array.from(graph.getAllNodes() as Iterable<any>);

      // Build the node set: a focused subgraph, or the top-N by gravity.
      let selected: any[];
      if (focus) {
        const hit = allNodes.find((n: any) => (n.properties?.name || '').toLowerCase() === focus.toLowerCase())
          || allNodes.find((n: any) => (n.properties?.name || '').toLowerCase().includes(focus.toLowerCase()));
        if (!hit) { console.log(`\x1b[31mNo node matches --focus "${focus}".\x1b[0m`); return; }
        const neighbourIds = new Set<string>([hit.id]);
        for (const dir of ['downstream', 'upstream'] as const)
          for (const e of graph.getNeighbors(hit.id, dir) as any[])
            if (isDependency(e)) neighbourIds.add(dir === 'downstream' ? e.targetId : e.sourceId);
        selected = [...neighbourIds].map(id => graph.getNode(id)).filter(Boolean);
      } else {
        selected = allNodes
          .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
          .slice(0, limit);
      }

      const inScope = new Set(selected.map((n: any) => n.id));
      const mermaidLines: string[] = ["graph TD"];
      for (const n of selected) mermaidLines.push(`  ${key(n.id)}["${n.properties?.name || n.id}"]`);

      // Edges: dependency-only, and BOTH endpoints in scope — keeps the diagram bounded + readable.
      const seen = new Set<string>();
      let edgeCount = 0;
      for (const n of selected) {
        for (const e of graph.getNeighbors(n.id, 'downstream') as any[]) {
          if (!isDependency(e) || !inScope.has(e.targetId)) continue;
          const ek = `${key(n.id)}->${key(e.targetId)}`;
          if (seen.has(ek)) continue;
          seen.add(ek); edgeCount++;
          mermaidLines.push(`  ${key(n.id)} --> ${key(e.targetId)}`);
        }
      }

      const title = focus ? `Focus: ${focus}` : `Top ${selected.length} by gravity`;
      const artifactPath = path.join(targetPath, '.conducks', 'structural_mirror.md');
      await fs.outputFile(artifactPath, `# Structural Mirror — ${title}\n\n\`\`\`mermaid\n${mermaidLines.join('\n')}\n\`\`\`\n`, 'utf-8');

      console.log(`\x1b[32m✅ Structural Mirror generated at: ${artifactPath}\x1b[0m`);
      console.log(`- Nodes: ${selected.length}  ·  Edges: ${edgeCount}  ·  ${title}`);
    } finally {
      await closePersistence(registry);
    }
  }
}
