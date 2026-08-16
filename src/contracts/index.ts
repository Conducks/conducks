/**
 * Conducks — the contracts layer's only door (ADR 0150).
 *
 * ADR 0005 puts `contracts` at the bottom of the layer contract: shared interfaces and types,
 * importing nothing. Everything above may import it, which is exactly why it needs a door — a layer
 * everyone may reach is the one where an accidental export becomes permanent.
 *
 * WHAT BELONGS HERE, and the test that decides it: a type used by TWO OR MORE features. A type used
 * by ONE feature belongs to that feature (ADR 0150 rule 5, read the other way round). `src/types/`
 * was a second, undeclared contracts folder holding both kinds, and three of its five files were
 * feature-owned — `language-plugin` and `capture-tags` are parsing's, used nowhere else; `mcp-response`
 * is the MCP surface's. They moved into their features rather than here, because a shared folder is
 * where a type goes to become everyone's problem.
 *
 * Every file behind this door states its own reason for existing, and they rhyme: `dead-code-types`,
 * `source-extensions`, `test-path`, `verdict` and `symbol-resolution` each replaced two or more
 * copies of the same rule. That is what a contract is for — one answer, not a convenient home.
 */
export { DEAD_CODE_TYPES, DEAD_CODE_QUESTION_TYPES } from './dead-code-types.js';
export type { DeadCodeType } from './dead-code-types.js';

export { SOURCE_EXTENSIONS } from './source-extensions.js';

export { tryResolveSymbol } from './symbol-resolution.js';
export type { NameIndex } from './symbol-resolution.js';

export { isTestNode, isTestPath } from './test-path.js';

export { FilterValidationError, FILTER_MAX_LIMIT, FILTER_DEFAULT_LIMIT } from './types.js';
export type { ConducksComponent, RegistryEntry, RegistryConfig, Tool } from './types.js';

export { verdict, renderVerdict, verdictToJson } from './verdict.js';

export type { PrismRequest, PrismSpectrum, SpectrumNode } from './prism-types.js';
export type { Advice } from './domain.js';
