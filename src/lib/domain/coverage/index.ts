/**
 * Conducks — the coverage feature's only door (ADR 0150).
 *
 * Binding an external coverage report to the graph: parse what the test run measured, join it onto
 * node spans, and compare a run against a recorded baseline.
 *
 * It reads a REPORT rather than inferring coverage from structure, and that distinction is the whole
 * feature. A depth-5 walk from every test node — which is what `TestAligner` did until it was
 * removed — is a guess; an istanbul report is a measurement.
 *
 * Two files, importing nothing else in `domain`. That independence is why this is its own area
 * rather than eight more lines in `analysis`.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { parseIstanbul, bindCoverage, weightedPct } from './coverage-bind.js';
export type { CovNode, CovResult, ParsedCoverage } from './coverage-bind.js';
export * from './coverage-baseline.js';
