/**
 * Conducks — may an import in THIS file bind to a symbol in THAT one?
 *
 * One question, one answer: a specifier written in a TypeScript file cannot name a symbol in a
 * `.py`, `.go` or `.rs` file, however unique the name is. Every linker that guesses by name has to
 * ask this before it commits an edge, because a single-candidate match across languages is the most
 * confident kind of wrong answer — nothing downstream can tell it from a correct one.
 *
 * WHAT WAS HERE UNTIL 2026-08-17, and why it is gone. This file also held `ImportResolver`, a
 * three-tier resolver, and `linker.ts` held the `GlobalSymbolLinker` that drove it. Both were dead
 * at runtime, in two independent ways, and measured before removal:
 *
 *   - the linker only visits a node whose `label` is `'import'`, and `label` is assigned from
 *     `canonicalKind` at ingest (`graph-engine.ts`). On the real 7,562-node graph the labels are
 *     ATOM, BEHAVIOR, UNIT, STRUCTURE, DIRECTORY, ECOSYSTEM, NAMESPACE, REPOSITORY, PACKAGE and
 *     INFRA. `'import'` count: 0. An import is an EDGE in this model, not a node;
 *   - and had one existed, `resolveImport` reads `properties.source`, which is not on the skeleton
 *     `addNode` keeps. Nodes carrying `source` on that same graph: 0. It would have returned at its
 *     first guard.
 *
 * So it scanned every node on every watcher pulse and could never emit an edge. `sameFamily` is the
 * part that was doing real work — `IntraLinker` calls it — and it is what remains.
 */

/**
 * Language family per file extension. An import in one family must never resolve
 * to a symbol in another (a TS `import` cannot bind to a `.rs`/`.go`/`.py` file).
 * Unknown extensions map to `undefined` and are never blocked (fail-open).
 */
const LANGUAGE_FAMILY: Record<string, string> = {
  ts: 'web', tsx: 'web', js: 'web', jsx: 'web', mjs: 'web', cjs: 'web', mts: 'web', cts: 'web',
  py: 'py', pyi: 'py',
  go: 'go',
  rs: 'rs',
  java: 'jvm', kt: 'jvm',
  cs: 'dotnet',
  cpp: 'cfam', cc: 'cfam', hpp: 'cfam', h: 'cfam', c: 'cfam',
  php: 'php', rb: 'ruby', swift: 'swift',
};

/**
 * The language family a path belongs to, from its extension.
 *
 * Splits on `::` because callers pass NODE IDS, not paths. Without it every id-shaped argument
 * would have an unknown extension — and the guard fails open, so the refusal would silently stop
 * happening rather than fail loudly.
 */
function familyOf(fileOrId: string): string | undefined {
  const file = fileOrId.split('::')[0];
  const m = /\.([a-z0-9]+)$/i.exec(file);
  return m ? LANGUAGE_FAMILY[m[1].toLowerCase()] : undefined;
}

/**
 * True unless both files have a known, DIFFERING language family.
 *
 * Fails open on purpose. A language added to the parser before it is added to the table above would
 * otherwise have every import refused, which reads downstream as "nothing imports this" rather than
 * as "not classified" — the failure that cannot be told from a real answer.
 */
export function sameFamily(sourceFileId: string, targetFileId: string): boolean {
  const a = familyOf(sourceFileId);
  const b = familyOf(targetFileId);
  if (a && b && a !== b) return false;
  return true;
}
