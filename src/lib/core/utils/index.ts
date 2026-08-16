/**
 * Conducks — the utils feature's only door (ADR 0150).
 *
 * Five leaves that share one property: they are used by everything and depend on nothing. That is
 * what makes them a feature rather than a folder — `path-utils` decides what a node id looks like,
 * `logger` decides where a diagnostic goes, and both are reached from every layer.
 *
 * The door exports what crosses the boundary and nothing more. `Logger`'s private helpers,
 * `SourceLineReader`'s cache and `scope-guard`'s marker tables stay inside, so any of them can be
 * changed without reading 30 call sites.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past it.
 *
 * WHY `logger` IS AN INSTANCE AND NOT A FACTORY. It is a shared process-wide sink, and ADR 0150
 * rule 4 forbids a door exporting mutable state — the same tension `core/git` carries with
 * `chronicle`, recorded there and here rather than papered over. The difference is that `Logger`'s
 * only mutable state is a static quiet flag, which is a property OF the process by design
 * (`setQuiet` is static precisely because a per-instance flag silenced four of five boot lines and
 * missed the fifth). Modules that want their own prefix construct their own `new Logger(prefix)`,
 * which is why the class is exported beside the instance.
 */
export { Logger, logger } from './logger.js';
export { canonicalize, getProjectRelativePath } from './path-utils.js';
export { traceMemory } from './mem-trace.js';
export { assessRoot, explainScope, isNeverAProjectRoot } from './scope-guard.js';
export { SourceLineReader } from './source-line.js';
export type { ScopeAssessment, ScopeLevel } from './scope-guard.js';
export type { SourceLine } from './source-line.js';
