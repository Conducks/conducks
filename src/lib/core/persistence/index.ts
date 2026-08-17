/**
 * Conducks — the persistence feature's only door (ADR 0150).
 *
 * The vault, and the two things that decide whether it is worth re-reading: a content hash per file,
 * and the comparison between those hashes and what is on disk.
 *
 * CONDUCKS-5 already said "all persistence goes through the driver interface, direct DuckDB calls
 * are forbidden outside this layer". This door is that rule made checkable rather than remembered —
 * `getRawConnection` is exported because two callers legitimately need it, and now every one of them
 * is visible in one place instead of anywhere an import can be written.
 *
 * THE ASYMMETRY WORTH KNOWING BEFORE USING THIS: `save()` writes metadata and the `pulses` row and
 * NO structure. Nodes and edges are written by `saveNodes` and `saveEdges`. A caller that expects
 * `save(graph)` to persist a graph gets a successful call that stores nothing — measured, that is
 * exactly what the watcher did for as long as it existed (todo67).
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { SynapsePersistence } from './persistence.js';
export { FileHashGate } from './file-hash-gate.js';
export { classifyFreshness, isStale } from './freshness.js';
export type { Freshness } from './freshness.js';
