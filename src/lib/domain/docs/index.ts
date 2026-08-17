/**
 * Conducks — the docs feature's only door (ADR 0150).
 *
 * The tooling for the conducks-docs standard and the visuals standard beside it: what the docs tree
 * SAYS it contains, whether it conforms to the grammar, whether every `file:line` a visual claims
 * still resolves, and whether a generated page still matches a fresh render.
 *
 * WHY IT IS NOT PART OF `analysis`, where these six files lived. Measured before moving: they import
 * NOTHING from any other file in that folder, and only two files there import back — both taking
 * `buildBoard`. Twenty-three files under one name were at least four subjects, and two of them had
 * zero coupling to the rest. A folder holding four unrelated subjects is not a feature; it is a
 * place things were put.
 *
 * `visuals-lint` and `visuals-drift` are here rather than in `domain/visual` because they lint the
 * docs/visuals PAGES — the standard's tooling. `domain/visual` is the graph's own visual wave, a
 * different subject that shares a word.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { buildBoard, agentView, governedCount, buildTrees, enforcedByPaths, crossTreeLint,
         treeShapeLint } from './docs-board.js';
export { DocsWatcher } from './docs-watcher.js';
export { lintVisuals, collectVisualPages, buildStamps, staleStamps } from './visuals-lint.js';
export type { VisualsViolation, ReviewStamps } from './visuals-lint.js';
export { checkVisualsDrift, generatorCommandOf } from './visuals-drift.js';
export type { DriftResult } from './visuals-drift.js';
