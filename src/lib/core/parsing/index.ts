/**
 * Conducks — the parsing feature's only door (ADR 0150).
 *
 * The largest feature in core: 69 files, 8.8k lines, thirteen language packs and the reflector that
 * turns a tree-sitter match into nodes and edges. Everything the rest of the system knows about a
 * codebase starts here, which is why it was the feature ADR 0150 was written about — and the last of
 * the five to get a door, because it depends on the other four.
 *
 * WHAT CROSSES, and it is less than the twenty entry points that existed before this file: the
 * reflector, the grammar registry, the analysis context, the ignore manager, the pipeline, the
 * thirteen providers the discovery surface constructs, the five processors, and the doc-comment
 * harvest.
 *
 * WHAT STAYS INSIDE: every `queries.ts`, the shared `ecmascript-positions` block, each pack's
 * resolver, extractor and bindings, `built-ins`-style tables, `essence-lens`. A grammar query is an
 * implementation detail of its language, and nothing outside parsing has business naming one.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 *
 * A DOOR IS ITSELF A DEPENDENCY EDGE (rule 5b). This one re-exports thirteen language packs, so a
 * caller importing it loads all thirteen — which is why `chronicle`'s discovery surface builds them
 * through a DYNAMIC import instead, and must keep doing so: a static import there closes the
 * `chronicle` ↔ `typescript/resolver` cycle this repository has already fixed once.
 */
export { ConducksReflector, ParseFailure } from './reflector.js';
export { grammars } from './grammar-registry.js';
export { AnalyzeContext } from './context.js';
export { IgnoreManager } from './ignore-manager.js';
export { ConducksPipeline } from './pipeline.js';
export { essenceLens } from './essence-lens.js';
export { nextRoutes } from './next-routes.js';

export { attachDocs, firstLineOf } from './doc-comments.js';
export type { HarvestedComment } from './doc-comments.js';

export { CaptureTags, DEFINITION_CAPTURES } from './capture-tags.js';
export type { CaptureTag } from './capture-tags.js';

export type { ILanguagePlugin } from './language-plugin.js';
export { ConducksPrism } from './prism-core.js';

/**
 * Specifier resolution, exported because `graph`'s intra-linker needs it and may not reach inside.
 *
 * It crosses as a CLASS rather than through a graph-side default, because the direction matters:
 * graph declares the port (`ResolveSpecifier`) and composition supplies this. A graph file importing
 * this door directly would close a cycle — the door re-exports the processors, and they import
 * graph's door (rule 5b).
 */
export { TypeScriptResolver } from './languages/typescript/resolver.js';

export { NativeProvider } from './providers/base.js';
export type { ConducksProvider, ImportSemantics } from './providers/base.js';

export { BindingProcessor } from './processors/binding.js';
export { CallProcessor } from './processors/call.js';
export { FlowProcessor } from './processors/flow.js';
export { HeritageProcessor } from './processors/heritage.js';
export { ImportProcessor } from './processors/import.js';

export { TypeScriptProvider, TYPESCRIPT_SUITE } from './languages/typescript/index.js';
export { TSXProvider } from './languages/tsx/index.js';
export { JavaScriptProvider } from './languages/javascript/index.js';
export { PythonProvider, PYTHON_SUITE } from './languages/python/index.js';
export { RustProvider } from './languages/rust/index.js';
export { JavaProvider } from './languages/java/index.js';
export { GoProvider } from './languages/go/index.js';
export { CProvider } from './languages/c/index.js';
export { CPPProvider } from './languages/cpp/index.js';
export { CSharpProvider } from './languages/csharp/index.js';
export { PHPProvider } from './languages/php/index.js';
export { RubyProvider } from './languages/ruby/index.js';
export { SwiftProvider } from './languages/swift/index.js';
