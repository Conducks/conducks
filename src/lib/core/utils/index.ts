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
 * WHY `logger` IS AN INSTANCE AND NOT A FACTORY, and how rule 4 is met (todo71). It is a shared
 * process-wide sink. Rule 4 forbids a door exporting MUTABLE state, and the mutable part was the
 * quiet flag: while it was set through an instance method, any of the seventeen places that build a
 * logger could silence the whole process, and the call read as a local decision. The flag is now a
 * module-level `let` private to `logger.ts`, reachable only through `setProcessQuiet` — so the
 * instance this door hands out carries no state a holder can change. Modules that want their own
 * prefix construct `new Logger(prefix)`, which is why the class is exported beside the instance.
 */
export { Logger, logger, setProcessQuiet } from './logger.js';
export { canonicalize, getProjectRelativePath } from './path-utils.js';
export { traceMemory } from './mem-trace.js';
export { assessRoot, explainScope, isNeverAProjectRoot } from './scope-guard.js';
export { SourceLineReader } from './source-line.js';
