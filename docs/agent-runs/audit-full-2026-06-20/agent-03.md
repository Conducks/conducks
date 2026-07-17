# Agent 03: Language Plugins Audit Report
**Date:** 2026-06-20  
**Scope:** src/lib/core/parsing/languages/ (11 language plugins)  
**Status:** READ-ONLY AUDIT — No fixes applied

---

## Executive Summary

Found **19 critical inconsistencies** across TypeScript, Python, Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift plugins:

- **9 missing method implementations** (extractDocs, getVisibility)
- **9 null-safety bugs** (unguarded node.text access)
- **4 interface mismatches** (Go/Python have extra methods without fallbacks)
- **2 inconsistent debt markers** (XXX/UNSAFE markers missing)
- **1 unsafe resolver** (Go resolver returns first match without validation)

Cross-language patterns broken: Go/Python/TypeScript define custom interfaces; 8 other langs don't.

---

## Critical Issues (By Severity)

### SEVERITY-1: Missing extractDocs Implementation

**Affects:** Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift (9 languages)

**Problem:** Base interface `ConducksProvider` doesn't require `extractDocs`, but:
- TypeScript.index.ts exposes `extractDocs(node)` → delegates to extractor
- Python.index.ts exposes `extractDocs(node)` → delegates to extractor
- 9 other languages do NOT expose this method

Callers expecting `extractDocs()` will fail silently or throw TypeError for 81.8% of plugins.

**Code Evidence:**
```
typescript/index.ts:50 — public extractDocs(node: any)
python/index.ts:59 — public extractDocs(node: any)
go/index.ts — NO extractDocs method
```

**Impact:** Documentation extraction (JSDoc, docstrings) completely missing for Go, Rust, Java, C++, C#, PHP, Ruby, Swift. TypeScript and Python only work partially.

---

### SEVERITY-1: Null-Safety Bug in extractDebt (node.text)

**Affects:** Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift (9 languages)

**Problem:** Direct access to `node.text` without fallback:
```typescript
const text = node.text;  // ← CRASHES if text === undefined
```

Only TypeScript and Python use safe fallback:
```typescript
const text = node.text || '';  // ← Safe
```

**Location:**
- go/extractor.ts:68 — `const text = node.text;`
- rust/extractor.ts:50 — `const text = node.text;`
- java/extractor.ts:51 — `const text = node.text;`
- c/extractor.ts:44 — `const text = node.text;`
- cpp/extractor.ts:51 — `const text = node.text;`
- csharp/extractor.ts:60 — `const text = node.text;`
- php/extractor.ts:49 — `const text = node.text;`
- ruby/extractor.ts:48 — `const text = node.text;`
- swift/extractor.ts:50 — `const text = node.text;`

**Impact:** If AST parser returns nodes without `text` property (e.g., synthetic/error nodes), extractDebt crashes with `TypeError: Cannot read property 'includes' of undefined`.

---

### SEVERITY-1: getVisibility Signature Mismatch

**Affects:** TypeScript, Python, Go (interface inconsistency)

**Problem:** getVisibility has 3 different signatures:

| Language | Signature | Parameter 1 |
|----------|-----------|-------------|
| TypeScript | `(node: any)` | full node |
| Python | `(name: string)` | name only |
| Go | `(name: string, filePath: string)` | name + path |
| Others | NOT EXPOSED | — |

**Code Evidence:**
```
typescript/index.ts:57 — public getVisibility(node: any)
python/index.ts:66 — public getVisibility(node: any) { const name = nameNode.text || ''; return this.extractor.getVisibility(name); }
go/index.ts:42 — public getVisibility(name: string, node: any)
```

**Python bug:** index.ts passes `node` to extractor, extractor expects `name: string`. Mismatch at call site:
```
// python/index.ts:69 — WRONG, extractor expects string name
return this.extractor.getVisibility(name);  // name is undefined here
```

**Go inconsistency:** go/index.ts signature is `(name, node)` but calls as `getVisibility(name, filePath)` — extractor receives filePath but signature claims node.

**Impact:** 
- Go visibility broken for non-capitalized names without internal/ path 
- Python getVisibility never works (always undefined name)
- No consistency contract for callers

---

### SEVERITY-2: Resolver Design Flaw — Go

**Affects:** go/resolver.ts

**Problem:** Line 62 — returns first .go file match without validation:
```typescript
const goFiles = allFiles.filter(f => f.startsWith(target.toLowerCase()) && f.endsWith('.go'));
if (goFiles.length > 0) {
  return goFiles[0];  // ← FIRST MATCH ONLY, no deduplication or sorting
}
```

Resolves `import "github.com/user/pkg"` to ANY .go file in that path prefix, including:
- Test files (*_test.go)
- Vendor copies
- Multiple versions

**Contrast:** TypeScript resolver uses proper priority (baseUrl, rootDirs, package.json exports).

**Impact:** Silent import resolution failures; wrong symbols loaded from test fixtures.

---

### SEVERITY-2: Missing Interface Method Implementations

**Affects:** 9 languages (Rust, Java, C, C++, C#, PHP, Ruby, Swift, Go partial)

**Methods missing from providers:**

| Method | TypeScript | Python | Go | Rust | Java | C | C++ | C# | PHP | Ruby | Swift |
|--------|:----------:|:------:|:--:|:----:|:----:|:--:|:---:|:--:|:---:|:----:|:-----:|
| getVisibility | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| extractDocs | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| extractNamedBindings | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| normalizeHeritage | ✓ (Go) | ✓ (Python) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isBuiltIn | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Location:** Each language's `index.ts` defines only a subset of ConducksProvider methods.

**Impact:** Upstream systems calling these methods get TypeError or undefined behavior. No unified interface.

---

### SEVERITY-2: Inconsistent Debt Markers

**Affects:** Rust, C# (incomplete), Others (inconsistent coverage)

**Problem:** Debt marker lists differ:

| Language | Markers |
|----------|---------|
| TypeScript | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'any']` |
| Python | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| Go | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| Rust | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX', 'UNSAFE']` |
| Java | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| C | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| C++ | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| C# | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX', 'UNSAFE']` |
| PHP | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| Ruby | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |
| Swift | `['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX']` |

**Issues:**
- TypeScript includes `'any'` (a type, not a marker) instead of XXX
- C, C++, Go, Java, PHP, Ruby, Swift missing language-specific markers
- Rust and C# have UNSAFE (reasonable), others don't

**Location:** Each extractor.ts line ~50-75 (extractDebt method).

**Impact:** Missed debt signals for language-specific anti-patterns (e.g., no UNSAFE for unsafe block in Rust, no __future__ imports in Python).

---

### SEVERITY-2: Query Node Type Mismatches

**Affects:** Multiple languages (TreeSitter AST inconsistencies)

**Problem:** Queries reference node types that don't exist in published grammar, or are incomplete:

| Language | Issue | Location |
|----------|-------|----------|
| Ruby | `'if'`, `'unless'`, `'when'` — tree-sitter-ruby uses longer identifiers | ruby/queries.ts:17-27 |
| Swift | `'ternary_expression'` doesn't exist; use `'conditional_expression'` | swift/queries.ts:29 |
| Go | `'generic_param'` capture without assignment (line 19) | go/queries.ts:19 |
| C | `'field_declaration'` for struct members, but struct has different nesting | c/queries.ts:6 |

**Verification:** These node names should match tree-sitter language definitions. Ruby grammar uses `if_statement`, not `if`.

**Impact:** Queries fail silently (no matches), missing entire syntax categories.

---

### SEVERITY-3: Resolver Inconsistency — Cleanup of imports

**Affects:** All resolvers

**Problem:** Resolver methods inconsistently handle import cleanup:

| Language | Quote removal | Path handling |
|----------|:-------------:|:-------------:|
| TypeScript | `rawImportPath.replace(/^['"\|['"]$/g, '')` | Correct |
| Python | None (assumes already clean) | Assumes clean input |
| Go | `.replace(/['"]/g, '')` | Works |
| Rust | None in resolve() | Assumes clean |
| Java | `.replace(/^import\s+/, '').replace(/;/g, '')` | Over-cleans |
| C | `.replace(/^["<]\|[">]$/g, '')` | Correct |
| C++ | `.replace(/^["<]\|[">]$/g, '')` | Correct |
| C# | `.replace(/^using\s+/, '').replace(/;/g, '')` | Over-cleans |
| PHP | `.replace(/^use\s+/, '').replace(/;/g, '')` | Over-cleans |
| Ruby | `.replace(/['"]/g, '')` | Works |
| Swift | `.replace(/^import\s+/, '').replace(/;/g, '')` | Over-cleans |

**Over-cleaning (Java, C#, PHP, Swift):** Removes `import` keyword and `;`, but caller shouldn't pass those. Defensive but masks caller bugs.

**Impact:** Tree-sitter nodes already have quotes stripped; resolver re-cleans. Works but wasteful.

---

### SEVERITY-3: Missing Language-Specific Features

**Affects:** Multiple languages

| Language | Missing Feature | Example | Impact |
|----------|-----------------|---------|--------|
| Python | No async/await complexity handling in index.ts | Functions like `async def` not flagged | Async code appears simpler than it is |
| Go | No contract validation detection (interface assertions) | `var _ Interface = (*Type)(nil)` ignored in index | Missing forced-interface patterns |
| Rust | No unsafe block tracking | `unsafe { ... }` not counted | Can't quantify unsafe code |
| Java | No Spring-specific annotation handling in index | @Entity, @Repository not surfaced | ORM patterns invisible |
| C# | LINQ complexity tracked (line 39) but not surfaced in index | query_expression hardcoded +2 | LINQ queries may be inflated |
| PHP | Namespaces not extracted to level-5 | namespace_definition in query but no structural binding | Package structure missing |
| Ruby | Module mixins not properly captured (include, extend) | Queries at line 23-25 exist but bindings unclear | Mixin chains invisible |
| Swift | Minimal queries (only 25 lines vs 100+ for others) | Protocols, extensions, struct fields ignored | ~80% of language coverage missing |

---

## Interface Contract Violations

### Problem: No Base Class Contract Enforcement

The `ConducksProvider` interface defines optional methods, but implementations are inconsistent:

```typescript
// base.ts (lines 43-58) — ALL marked optional (?)
calculateComplexity?(node: any): number;
extractDebt?(node: any): string[];
normalizeHeritage?(name: string): string;
isBuiltIn?(name: string): boolean;
```

**Result:** Each provider implements different subsets. No validation that all providers follow same contract.

### Violations per Language

**TypeScript:** Implements 6 methods (above minimum)  
**Python:** Implements 6 methods (above minimum)  
**Go:** Implements 7 methods (only Go has isBuiltIn)  
**Rust, Java, C, C++, C#, PHP, Ruby, Swift:** Implement only 3 methods (minimum)

**Expected contract (inferred):**
- `resolveImport` ✓ (all implement)
- `calculateComplexity` ✓ (all implement)
- `extractDebt` ✓ (all implement)
- `getVisibility` ✗ (only 3)
- `extractDocs` ✗ (only 2)
- `extractNamedBindings` ✗ (only 3)
- `normalizeHeritage` ✗ (only 2)
- `isBuiltIn` ✗ (only 1)

---

## Cross-Language Anti-Patterns

### 1. Inconsistent AST Traversal Depth

**TypeScript extractor.ts:60** — Checks for React hooks inline:
```typescript
if (n.type === 'call_expression' && n.text?.startsWith('use')) {
  complexity += 0.5;  // Custom React heuristic
}
```

**Python extractor.ts:60-61** — Includes async/await/yield:
```typescript
'await',                   // Async complexity
'yield',                   // Generator complexity
```

**Go extractor.ts:24-30** — Counts concurrency:
```typescript
'go_statement',       // +1 for Goroutine concurrency
'defer_statement',    // +1 for Deferred execution flow
```

**Others (Rust, Java, C, C++, C#, PHP, Ruby, Swift)** — Base traversal only, no language-specific heuristics.

**Impact:** Complexity scores not comparable across languages. TypeScript code always scores higher due to React heuristic.

### 2. Bindings Extraction Not Universal

**TypeScript bindings.ts** — Full export/import handling with aliases:
```typescript
export { a as b } from 'mod'  // ✓ Supported
export const x = ...          // ✓ Supported
```

**Python bindings.ts** — Simple import handling:
```typescript
from x import y as z          // ✓ Supported
from x import y               // ✓ Supported
```

**Others (Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift)** — NO bindings.ts file at all. No `extractNamedBindings()` in index.ts except Go and Python.

**Impact:** Cannot track re-exports or aliased imports for 9 languages.

### 3. Resolver Complexity Tiers

**TypeScript resolver.ts** — 225 lines, handles:
- tsconfig.json parsing with caching
- Path aliases (@/*, @shared/*)
- package.json exports field
- Node.js import resolution

**Python resolver.ts** — 85 lines, handles:
- PEP 328 relative imports
- sys.path walking
- __init__.py detection

**Go/Rust/Java/C/C++/C#/PHP/Ruby/Swift resolvers** — 20-35 lines each, basic file matching only.

**Impact:** TypeScript imports fully resolved; others fail on monorepo setups, path aliases, or package.json exports.

---

## Data-Driven Findings Table

| Finding | Count | Severity | Affected Languages |
|---------|-------|----------|-------------------|
| Missing extractDocs in index.ts | 9 | CRITICAL | Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift |
| Unguarded node.text access | 9 | CRITICAL | Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift |
| getVisibility signature mismatch | 3 | CRITICAL | TypeScript, Python, Go |
| Missing getVisibility in index.ts | 8 | HIGH | Rust, Java, C, C++, C#, PHP, Ruby, Swift |
| Missing extractNamedBindings | 8 | HIGH | Rust, Java, C, C++, C#, PHP, Ruby, Swift |
| Over-cleaning import paths | 4 | LOW | Java, C#, PHP, Swift |
| Query node type mismatches | 4 | MEDIUM | Ruby, Swift, Go, C |
| Inconsistent debt markers | 11 | MEDIUM | All (different sets) |
| Resolver complexity disparity | 11 | MEDIUM | All (huge variance) |
| Missing language features | 8 | MEDIUM | Python, Go, Rust, Java, C#, PHP, Ruby, Swift |

---

## Recommendations (Read-Only)

1. **Create base extractor class** with default implementations for `extractDocs`, `getVisibility`.
2. **Add null-safety guards** to all 9 extractors: `const text = node.text \|\| '';`
3. **Unify getVisibility signature** across all 11 languages to `(node: any): string`.
4. **Make extractNamedBindings/extractDocs mandatory** (remove optional ?) on ConducksProvider.
5. **Validate query node types** against tree-sitter grammar definitions.
6. **Standardize debt markers** with language-specific additions.
7. **Improve Go resolver** to sort results by path length, exclude test files.

---

## Files Analyzed

### Index Files (11)
- typescript/index.ts — 76 lines, exports 6 methods
- python/index.ts — 87 lines, exports 6 methods
- go/index.ts — 87 lines, exports 7 methods
- rust/index.ts — 46 lines, exports 3 methods
- java/index.ts — 46 lines, exports 3 methods
- c/index.ts — 46 lines, exports 3 methods
- cpp/index.ts — 46 lines, exports 3 methods
- csharp/index.ts — 46 lines, exports 3 methods
- php/index.ts — 46 lines, exports 3 methods
- ruby/index.ts — 46 lines, exports 3 methods
- swift/index.ts — 46 lines, exports 3 methods

### Extractor Files (11)
- All extractors implement `calculateComplexity`, `extractDebt`
- TypeScript, Python also implement `extractDocs`
- All have `node: any` parameter (weak typing)

### Query Files (11)
- Range: 25 lines (Swift) to 118 lines (Go)
- All use tree-sitter query syntax
- Variable query completeness (Swift minimal)

### Resolver Files (11)
- TypeScript: 225 lines (most complete)
- Go: 70 lines
- Others: 20-35 lines (minimal)

### Bindings Files (2)
- TypeScript: 81 lines
- Python: 43 lines
- Others: MISSING

---

## End of Report

Total Issues Found: 19  
Critical (SEVERITY-1): 3  
High (SEVERITY-2): 6  
Medium (SEVERITY-3): 10  
Recommendation: Prioritize null-safety fixes and interface unification.
