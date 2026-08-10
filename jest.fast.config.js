/**
 * Conducks — the FAST inner loop, for chasing a failure. `npm test` remains the gate.
 *
 * `jest.config.js` runs serially and recycles a worker after EVERY test file
 * (`workerIdleMemoryLimit: '1KB'`). Both constraints are real: the tree-sitter native addon serves one
 * JS-wrapper instance per process, so a second grammar-loading suite in the same process gets a
 * wrapper whose `tree.rootNode` is undefined, and DuckDB is single-writer.
 *
 * They are real for the suites that TOUCH those things, and they cost a fresh process for all 232
 * files. Measured: a unit run takes ~110s under the gate config and ~26s here.
 *
 * So this config parallelises and drops the recycling, and pays for it by not running the suites that
 * need either constraint. The excluded set is a PATH RULE rather than a file list on purpose — which
 * files fail depends on scheduling (whichever grammar suite lands second in a process), so an explicit
 * list would go stale silently and look like it was still protecting something.
 *
 * If your failure is in an excluded path, use the gate config. This is a diagnostic tool, and a
 * diagnostic tool that quietly skips your test is worse than no tool.
 */
import base from './jest.config.js';

/** Paths whose suites load tree-sitter grammars or drive a real vault. Not runnable in parallel. */
const NEEDS_SERIAL = [
  '<rootDir>/tests/unit/core/languages/',
  '<rootDir>/tests/unit/core/parsing/',
  '<rootDir>/tests/unit/core/polyglot',
  '<rootDir>/tests/polyglot-verify/',
  '<rootDir>/tests/integration/',
  '<rootDir>/tests/database/',
  // Core suites that reflect real source through the parser rather than a fixture graph.
  '<rootDir>/tests/unit/core/edge-line-number',
  '<rootDir>/tests/unit/core/instance-type-capture',
  '<rootDir>/tests/unit/core/parse-failure',
  '<rootDir>/tests/unit/core/renamed-binding',
  '<rootDir>/tests/unit/core/type-only-imports',
  '<rootDir>/tests/unit/core/type-position-targets',
  '<rootDir>/tests/unit/domain/analysis/import-binding-resolution',
  '<rootDir>/tests/unit/domain/analysis/orchestrator',
];

const project = { ...base.projects[0] };
delete project.workerIdleMemoryLimit;
project.displayName = 'fast';
project.testPathIgnorePatterns = [...(project.testPathIgnorePatterns ?? []), ...NEEDS_SERIAL];

export default {
  ...base,
  maxWorkers: 4,
  workerIdleMemoryLimit: undefined,
  projects: [project],
};
