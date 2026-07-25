import chalk from 'chalk';

/**
 * The only capability this helper needs from the graph: name → candidate nodes.
 * Declared structurally so the CLI never names a core type (ADR 0005) — the concrete
 * `ConducksAdjacencyList` handed in by the registry satisfies it by shape.
 */
export interface NameIndex {
  findNodesByName(name: string): Array<{ id: string; properties?: unknown }>;
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
  if (input.includes('::')) return input;

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
