# A2 — Language Plugin Interface Enforcement

**Date:** 2026-06-21  
**Wave:** 5  
**Task:** Define `ILanguagePlugin` and add `implements` to all 11 provider classes.

## What was done

### 1. Audited all 11 plugins
- **Full method set** (TypeScript, Python): `resolveImport`, `calculateComplexity`, `extractDebt`, `extractDocs`, `getVisibility`, `extractNamedBindings`
- **Go**: same minus `extractDocs`, plus `normalizeHeritage`, `isBuiltIn` override
- **C, C++, C#, Java, PHP, Ruby, Rust, Swift**: only `resolveImport`, `calculateComplexity`, `extractDebt`

### 2. Extended `ConducksProvider` in `src/lib/core/parsing/providers/base.ts`
Added two missing optional methods to the existing interface:
- `getVisibility?(node: any, ...args: any[]): 'public' | 'private' | 'protected'`
- `extractDocs?(node: any): string | undefined`

### 3. Created `src/types/language-plugin.ts`
New `ILanguagePlugin` interface with:
- **Required:** `id`, `version`, `extensions`, `langId`, `queryScm`, `importSemantics`, `resolveImport`, `calculateComplexity`, `extractDebt`
- **Optional:** `extractNamedBindings`, `normalizeHeritage`, `isBuiltIn`, `getVisibility`, `extractDocs`

Optional methods are those implemented by only a subset of plugins. Required methods are the minimum every plugin needs to function in the pipeline.

### 4. Added `implements ILanguagePlugin` to all 11 provider classes
All 11 files updated:
- `languages/typescript/index.ts` — `TypeScriptProvider`
- `languages/python/index.ts` — `PythonProvider`
- `languages/go/index.ts` — `GoProvider`
- `languages/c/index.ts` — `CProvider`
- `languages/cpp/index.ts` — `CPPProvider`
- `languages/csharp/index.ts` — `CSharpProvider`
- `languages/java/index.ts` — `JavaProvider`
- `languages/php/index.ts` — `PHPProvider`
- `languages/ruby/index.ts` — `RubyProvider`
- `languages/rust/index.ts` — `RustProvider`
- `languages/swift/index.ts` — `SwiftProvider`

No stubs were needed — all 8 simpler plugins already satisfy the required method set. The missing methods (`extractDocs`, `getVisibility`, `extractNamedBindings`, etc.) are optional in `ILanguagePlugin`.

### 5. tsc result
`npx tsc --noEmit` — clean, zero errors.

## Key decision
`getVisibility` has a different signature in Go (`(name: string, node: any)` vs `(node: any)` in TypeScript/Python). The interface uses `getVisibility?(node: any, ...args: any[])` to accommodate this without forcing a breaking change to any existing plugin.
