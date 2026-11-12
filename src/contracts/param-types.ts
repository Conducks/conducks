/**
 * A function's declared parameter types, keyed by parameter name — the shape IntraLinker reads as
 * `paramTypes` and the vault stores as `param_types`.
 *
 * One rule for both. The vault column was derived here from `dna.params`, but the in-memory node only
 * got `paramTypes` back from a vault load, so a freshly parsed function had none and a call on a typed
 * parameter (`userId.split(...)`, `userId: string`) could not be resolved until the graph was
 * reloaded. The watcher never reloads, and dropped those calls (deep test 2026-11-12).
 *
 * Typed parameters only; names and types lower-cased, as the column always held them.
 */
export function paramTypesFromDna(dna: { params?: Array<{ name?: unknown; type?: unknown }> } | undefined | null): Record<string, string> | undefined {
  const typed = (dna?.params ?? []).filter(p => p && p.type);
  if (typed.length === 0) return undefined;
  return Object.fromEntries(typed.map(p => [String(p.name).toLowerCase(), String(p.type).toLowerCase()]));
}
