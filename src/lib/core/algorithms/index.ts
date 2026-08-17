/**
 * Conducks — the algorithms feature's only door (ADR 0150).
 *
 * Two measurements that read HISTORY rather than structure, which is what makes them a feature and
 * not a folder: everything else in core answers "what does this code say", and these two answer
 * "what has happened to it". Entropy reads the author distribution of a unit; the co-change engine
 * reads the commit log for files that change together while nothing links them.
 *
 * They share no code and that is fine — a feature is a boundary, not a cluster. What they share is
 * that both are pure computation over inputs someone else gathered, so neither reaches for a vault
 * or a repository of its own.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { calculateShannonEntropy, normalizeEntropyRisk } from './entropy.js';
export { CoChangeEngine } from './cochange-engine.js';
