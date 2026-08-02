import chalk from 'chalk';

/**
 * The only capability this helper needs from the graph: name → candidate nodes.
 * Declared structurally so the CLI never names a core type (ADR 0005) — the concrete
 * `ConducksAdjacencyList` handed in by the registry satisfies it by shape.
 */
export interface NameIndex {
  findNodesByName(name: string): Array<{ id: string; properties?: unknown }>;
  /** Optional so existing callers that only index by name still satisfy the shape. */
  getNode?(id: string): { id: string } | undefined;
}

export function cliError(code: string, message: string, suggestion?: string): never {
  process.stderr.write(chalk.red(`[ERROR] ${code}: ${message}\n`));
  if (suggestion) process.stderr.write(chalk.yellow(`Suggestion: ${suggestion}\n`));
  process.exit(1);
}

export function cliWarn(message: string): void {
  process.stderr.write(chalk.yellow(`[WARN] ${message}\n`));
}

/**
 * Resolve a user-supplied symbol string to a node ID.
 * If input contains '::' treat as full node ID directly.
 * Otherwise use name index to find best match (highest gravity).
 * Exits with helpful error if no match found.
 */
export function resolveSymbol(input: string, graph: NameIndex): string {
  if (input.includes('::')) {
    // Node ids are LOWERCASED on write (CONDUCKS-4, for APFS), so an id containing a real-cased
    // path — which is what a user copies out of their editor, and what every macOS temp dir has —
    // matched nothing and the command reported "not found" for a symbol that exists. Try the
    // verbatim id first so nothing that worked before changes, then the lowercased form, then fall
    // back to the bare name after `::` (ADR 0106).
    if (graph.getNode?.(input)) return input;
    const lowered = input.toLowerCase();
    if (graph.getNode?.(lowered)) return lowered;
    if (!graph.getNode) return input;   // caller cannot check; preserve the old behaviour
    const bare = input.slice(input.lastIndexOf('::') + 2);
    if (!bare) {
      cliError('SYMBOL_NOT_FOUND', `No symbol matching "${input}"`,
        `Run: conducks query "${input}" to find valid symbol IDs`);
    }
    return resolveSymbol(bare, graph);
  }

  const matches = graph.findNodesByName(input);
  if (matches.length === 0) {
    cliError(
      'SYMBOL_NOT_FOUND',
      `No symbol matching "${input}"`,
      `Run: conducks query "${input}" to find valid symbol IDs`
    );
  }

  // Pick highest-gravity node
  const best = matches.reduce((a, b) => {
    const ga = (a.properties as any)?.gravity ?? 0;
    const gb = (b.properties as any)?.gravity ?? 0;
    return gb > ga ? b : a;
  });

  if (matches.length > 1) {
    cliWarn(`Multiple symbols named "${input}" — using highest-gravity match: ${best.id}`);
  }

  return best.id;
}
