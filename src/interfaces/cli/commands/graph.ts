import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { spanHashOf } from "@/registry/index.js";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Conducks — Graph Command. The code graph as data at a named commit.
 *
 * Prints ONE JSON object: { commit, files, symbols, symbols_at, edges, edges_at, comments, ranges }.
 * - files come from the ref (git cat-file, nothing checked out). ranges: only those asked for with
 *   `--ranges <file>` (JSON array of {path,start,end}, 1-based inclusive), each hashed at the ref;
 *   a missing file or out-of-bounds range gives `hash: null`.
 * - edges/comments/symbols come from the current graph (`*_at: "head"`), filtered to files that exist at the ref.
 * - shortcut: symbols are the CURRENT graph's, so `symbols_at` is "head". Upgrade when a content-only provider entry exists.
 */
export class GraphCommand implements ConducksCommand {
  public id = "graph";
  public description = "Print files, symbols, edges and comments at a commit as JSON";
  public usage = "conducks graph --at <ref> --json [--ranges <file>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const at = args.indexOf("--at");
    const ref = at !== -1 ? args[at + 1] : undefined;
    if (!ref || ref.startsWith("--") || !args.includes("--json")) {
      console.error(`Error: usage: ${this.usage}`);
      process.exit(1);
    }
    const rf = args.indexOf("--ranges");
    const asked: { path: string; start: number; end: number }[] = [];
    if (rf !== -1) {
      try {
        asked.push(...JSON.parse(readFileSync(args[rf + 1], "utf8")));
      } catch (e) {
        console.error(`Error: cannot read --ranges file: ${(e as Error).message}`);
        process.exit(1);
      }
    }
    const chronicle = registry.infrastructure.chronicle;
    const commit = chronicle.resolveRef(ref);
    const map = commit ? await chronicle.readRef(ref) : null;
    if (!commit || !map) {
      console.error(`Error: unknown ref "${ref}": git cannot resolve it to a commit.`);
      process.exit(1);
    }

    const files = [...map.keys()].sort();
    const ranges = asked.map(r => {
      const src = map.get(r.path);
      const ok = src !== undefined && r.start >= 1 && r.end >= r.start && r.end <= src.split("\n").length;
      return { path: r.path, start: r.start, end: r.end, hash: ok ? spanHashOf(src, { line: r.start, endLine: r.end }) : null };
    });

    await registry.infrastructure.ensureGraphLoaded();
    const root = chronicle.getProjectDir() || process.cwd();
    const nodes = await registry.query.query("*", 1_000_000);
    const inRef = new Set(files);
    const symbols = new Map<string, { name: string; file: string; line: number }>();
    const label = new Map<string, string>();
    const comments: { symbol: string; text: string }[] = [];
    for (const n of nodes) {
      const fp = n.properties.filePath as string | undefined;
      if (!fp || !n.properties.name) continue;
      const rel = path.isAbsolute(fp) ? path.relative(root, fp) : fp;
      if (!inRef.has(rel)) continue;
      const sym = `${rel}::${n.properties.name}`;
      const line = (n.properties as { range?: { start?: { line?: number } } }).range?.start?.line ?? 0;
      symbols.set(sym, { name: sym, file: rel, line });
      label.set(n.id, sym);
      const doc = (n.properties as { doc?: string }).doc;
      if (doc) comments.push({ symbol: sym, text: doc });
    }
    // Edges between symbols that exist at the ref; others (external, unresolved) are dropped.
    const seen = new Set<string>();
    const edges: { from: string; to: string; kind: string }[] = [];
    for (const e of registry.query.graph.getGraph().getAllEdges()) {
      const from = label.get(e.sourceId), to = label.get(e.targetId);
      const k = `${from}|${to}|${e.type}`;
      if (!from || !to || seen.has(k)) continue;
      seen.add(k);
      edges.push({ from, to, kind: e.type });
    }
    edges.sort((a, b) => (a.from + a.to + a.kind).localeCompare(b.from + b.to + b.kind));
    comments.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const syms = [...symbols.values()].sort((a, b) => a.name.localeCompare(b.name));

    process.stdout.write(JSON.stringify({ commit, files, symbols: syms, symbols_at: "head", edges, edges_at: "head", comments, ranges }) + "\n");
  }
}
