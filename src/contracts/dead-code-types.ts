/**
 * Conducks — the dead-code finding types, in ONE list 🪦
 *
 * `conducks_prune` hard-coded three of the five into its summary and into its `type` enum. Measured
 * on this repository: `summary {ORPHAN: 9, UNUSED_EXPORT: 70, STALE_IMPORT: 16}` sums to 95 against
 * `total: 99`, because four `UNIMPORTED_MODULE` findings were returned in the list, counted in no
 * bucket, and unreachable by any filter. A caller reconciling the summary against the total finds
 * four findings that exist nowhere.
 *
 * Same shape as SOURCE_EXTENSIONS before it was moved here: a list that must be identical in several
 * places, kept by memory in each of them. Adding a sixth type now reaches every summary and every
 * enum by construction.
 */
export const DEAD_CODE_TYPES = [
  'ORPHAN',
  'UNUSED_EXPORT',
  'UNREACHABLE_LOGIC',
  'STALE_IMPORT',
  'UNIMPORTED_MODULE',
] as const;

/** The union, derived from the list rather than restated — a second copy is how two went missing. */
export type DeadCodeType = typeof DEAD_CODE_TYPES[number];

/**
 * The types that are a QUESTION, not a verdict.
 *
 * `memory.md`: "an unreferenced module is a question, not a finding" — *disconnected by accident* and
 * *deliberately not wired yet* are the same zero-incoming-edges shape to a graph, and deleting the
 * second destroys a capability nobody decided to drop. The CLI has always separated these; the MCP
 * tool flattened them into one list beside the verdicts, which is the reading that gets code deleted.
 */
export const DEAD_CODE_QUESTION_TYPES: readonly DeadCodeType[] = ['UNIMPORTED_MODULE'];

/** Verdicts: everything that is not a question. Derived, so the two can never disagree. */
export const DEAD_CODE_VERDICT_TYPES: readonly DeadCodeType[] =
  DEAD_CODE_TYPES.filter(t => !DEAD_CODE_QUESTION_TYPES.includes(t));
