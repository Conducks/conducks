# Deep Audit: Go, Rust, Java Tree-Sitter Query Files

**Date:** 2026-06-20  
**Scope:** Query patterns, AST node types, capture completeness, resolver mapping  
**Files Audited:**
- `src/lib/core/parsing/languages/go/queries.ts` + extractor + resolver
- `src/lib/core/parsing/languages/rust/queries.ts` + extractor + resolver
- `src/lib/core/parsing/languages/java/queries.ts` + extractor + resolver

---

## GO QUERIES AUDIT

### Coverage Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Package declaration | ✓ | Line 15 |
| Functions | ✓ | Line 14 |
| Structs | ✓ | Line 31 |
| Interfaces | ✓ | Line 32 |
| Methods (with receivers) | ✓ | Lines 22–28, 90 |
| Generics (Go 1.18+) | ✓ | Line 18 |
| Imports | ✓ | Lines 112–113 |
| Variables/Constants | ✓ | Lines 7–8 |
| Goroutines | ✓ | Line 96 |
| Type assertions | ✓ | Line 78 |
| Comments/debt | ✓ | Line 116 |
| Embedded structs | ✓ | Line 93 |
| **Blank imports** | ✗ | `_ = "fmt"` pattern missing |
| **Init functions** | ⚠ | func init() matches but not special-cased |
| **Named return values** | ✗ | No return type capture |
| **CGO bindings** | ✗ | //go:cgo directives not captured |
| **Build tags** | ✗ | //+build directives not extracted |

### Critical Issues

**[go/queries.ts:36–40] SEVERITY: MEDIUM — HTTP handler pattern fragile**
- Line 36–40 uses `selector_expression operand: (identifier)` to match `http.HandleFunc`
- Will NOT match chained calls like `api.server.HandleFunc()` or nested selectors
- Pattern assumes single-level selector; multi-level object access untested
- Impact: Infrastructure entry points may be missed for wrapped router objects

**[go/queries.ts:93] SEVERITY: LOW — Embedded struct detection too broad**
- Line 93 captures all field types (type_identifier, pointer_type, slice_type, map_type)
- No distinction between embedded structs (inheritance) and explicit fields
- Embedding is detected only by field type name matching later (not in query)
- Impact: Heritage relationships may be incorrectly attributed

**[go/resolver.ts:30–44] SEVERITY: MEDIUM — Module resolution assumes vendor layout**
- `resolveModule()` walks up directory tree looking for path segments
- Assumes `github.com/user/repo/pkg` maps to filesystem `github.com/user/repo/pkg` (requires vendor/)
- No handling of go.mod module aliases or local replace directives
- Will fail silently on standard go modules without vendored sources
- Impact: External imports unresolvable in non-vendored projects

**[go/resolver.ts:59] SEVERITY: MEDIUM — Arbitrary file selection**
- `tryExtensions()` returns first .go file found in directory
- Prefers arbitrary file over _test.go or package-canonical file
- Should prefer main.go → _test.go → others for determinism
- Impact: Import resolution may point to test or tool code unexpectedly

### Missing Language Constructs

| Construct | Why Matters | Fix |
|-----------|-----------|-----|
| Blank imports (\_) | Used to trigger init() side effects; doc/verification signal | Add pattern: `import_spec (package_identifier) @name (#eq? @name "_")` |
| Init functions special case | Entry point for package initialization; complexity & lifecycle tracking | Tag `function_declaration name: (identifier) @name (#eq? @name "init")` with @isInit |
| Named return values | Affects signature fingerprint; required for API contract tracking | Capture function return params in (parameter_list) |
| CGO directives | Indicates C interop; affects build/security analysis | Parse //go:cgo comments separately or use cgo_import_spec |
| Build tags | Different code paths per OS/arch; branch complexity varies | Extract //+build and //go:build as metadata |

### Summary

**4 issues found:** 2 unresolvable (module system), 1 pattern weakness, 1 false positive.  
**Severity: MEDIUM.** Goroutine/interface/type-assertion capture solid. Imports work but resolver cannot handle unmounted modules.

---

## RUST QUERIES AUDIT

### Coverage Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Functions | ✓ | Line 12 |
| Structs | ✓ | Line 13 |
| Enums | ⚠ | Line 14, tagged @isStruct (wrong) |
| Unions | ⚠ | Line 15, tagged @isStruct (wrong) |
| Traits | ✓ | Line 16, mapped to @isInterface |
| Modules | ⚠ | Line 19, captures mod name but not body |
| Impl blocks | ✗ | Line 22 captures type only, methods invisible |
| Route attributes | ✓ | Lines 26–29 |
| Assignments | ✓ | Line 32 |
| Function calls | ✓ | Line 35 |
| Comments | ⚠ | Line 38 uses @docs not @comment |
| **Use declarations** | ✗✗ | **ENTIRE IMPORT SYSTEM MISSING** |
| **Async functions** | ✗ | async fn not detected |
| **Visibility modifiers** | ✗ | pub, pub(crate) not captured |
| **Trait methods** | ✗ | trait method sigs not extracted |
| **Macros** | ✗ | macro_invocation, macro_definition missing |
| **Lifetimes** | ✗ | 'a, 'static parameters not captured |
| **Unsafe blocks** | ✗ | Not counted in complexity |

### Critical Issues

**[rust/queries.ts:14–15] SEVERITY: CRITICAL — Semantic type misclassification**
- Line 14: `enum_item` tagged `@isStruct` (should be @isEnum)
- Line 15: `union_item` tagged `@isStruct` (should be @isUnion)
- Enums ≠ Structs: variants have different semantics, pattern matching vs field access
- Impact: Type hierarchy corrupted; enumeration handling impossible

**[rust/queries.ts:22] SEVERITY: CRITICAL — Impl block extraction incomplete**
- Line 22 captures `impl_item type: (type_identifier) @heritage`
- **Does NOT capture functions inside impl block**
- Methods are lost; only the impl target type is recorded
- Query should also match: `(impl_item (function_item name: (identifier) @name)) @isMethod`
- Impact: All methods in Rust are invisible to analyzer

**[rust/queries.ts:38] SEVERITY: LOW — Comment capture name inconsistency**
- Line 38 uses `@docs` but reflector.ts:433 expects `@comment`
- Extractor extracts debt markers from text, so functional impact minimal
- Impact: Inconsistency in naming; potential for refactoring errors

**[rust/queries.ts: MISSING] SEVERITY: CRITICAL — No import capture**
- NO pattern for `use std::io;`, `use foo as bar;`, `use foo::{A, B};`
- NO pattern for `mod utils;` or `mod utils { }`
- Entire import graph is invisible
- Impact: Cannot resolve dependencies; import relationships unknown

**[rust/queries.ts: MISSING] SEVERITY: HIGH — No pub/async visibility**
- `pub fn`, `pub mod`, `async fn` not distinguished from private/sync
- Required for public API surface and concurrency analysis
- Impact: Private vs public APIs indistinguishable; async patterns invisible

**[rust/queries.ts: MISSING] SEVERITY: HIGH — Trait methods not extracted**
- Trait definitions exist (line 16) but trait method signatures are not captured
- Pattern should include: `(trait_item (function_item name: (identifier) @name)) @isMethod`
- Impact: Trait contracts invisible; polymorphism analysis impossible

**[rust/queries.ts: MISSING] SEVERITY: MEDIUM — Macros and lifetimes**
- Macro invocations (`foo!()`) not captured
- Lifetime parameters ('a, 'static) not captured
- Impact: Macro-generated code invisible; lifetime complexity not tracked

**[rust/resolver.ts:15] SEVERITY: MEDIUM — Path resolution too simplistic**
- Line 15 replaces `crate::` and `::` with `/`, assumes all map to filesystem
- Doesn't handle workspace crates or external dependencies from Cargo.lock
- Won't resolve `use external_crate::module`
- Impact: External crate imports fail silently

**[rust/resolver.ts:26–31] SEVERITY: LOW — Weak suffix matching**
- EndsWith check allows "utils" to match both "utils.rs" and "utils/mod.rs"
- Should prefer exact match > suffix match for determinism
- Impact: May return wrong file for ambiguous paths

### Missing Language Constructs

| Construct | Why Matters | Fix |
|-----------|-----------|-----|
| **use declarations** | Module imports; dependency graph; public API surface | Add patterns for use_item, use_list, use_path, use_as_clause |
| **mod declarations** | Module structure; namespace organization | Add pattern: `(mod_item name: (identifier) @name)` with body capture |
| **Impl methods** | Core OOP in Rust; half of codebase structure | Add: `(impl_item (function_item name: (identifier) @name)) @isMethod` |
| **Async functions** | Concurrency primitive; execution model differs | Add: `(function_item async:? name: ...)` or detect async token |
| **pub/pub(crate)** | Visibility scoping; API boundary detection | Add visibility attribute detection (requires deeper pattern) |
| **Trait methods** | Polymorphism contracts | Add: `(trait_item (function_item name: (identifier) @name)) @isMethod` |
| **Macros** | Code generation; metaprogramming patterns | Add: `(macro_invocation), (macro_definition)` |
| **Lifetimes** | Reference semantics; lifetime variance tracking | Add: `(lifetime_parameter) @name` |
| **Enums/Unions** | Proper type semantics (not struct) | Relabel enum_item, union_item with @isEnum, @isUnion |

### Summary

**11 issues found:** 5 critical (missing imports, methods, enums), 3 high (pub, async, traits), 3 medium/low (comments, resolution, pattern).  
**Severity: CRITICAL.** Entire import system absent. Methods invisible. Type semantics broken.

---

## JAVA QUERIES AUDIT

### Coverage Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| Class declarations | ✓ | Line 10 |
| Interface declarations | ✓ | Line 12 |
| Enum declarations | ⚠ | Line 13, tagged @isStruct (wrong) |
| Record declarations | ⚠ | Line 11, no component extraction |
| Methods | ✓ | Line 15 |
| Constructors | ⚠ | Line 16, tagged @isFunction (should be @isMethod) |
| Package declarations | ⚠ | Line 18, uses scoped_identifier (fragile) |
| Field declarations | ✓ | Line 6 |
| Local variables | ✓ | Line 7 |
| Route annotations | ✓ | Lines 22–24 |
| DI annotations | ✓ | Lines 27–28 |
| Assignments | ✓ | Line 31 |
| Method invocations | ⚠ | Line 34, misses qualified calls |
| Object creation | ✓ | Line 35 |
| Comments | ✓ | Line 38 |
| **Imports** | ✗✗ | **ENTIRE IMPORT SYSTEM MISSING** |
| **Extends/Implements** | ✗✗ | No inheritance capture |
| **Abstract/Static** | ✗ | Modifiers not captured |
| **Generics** | ✗ | Type parameters not captured |
| **Inner classes** | ✗ | Nested types invisible |
| **Static initializers** | ✗ | Static blocks not captured |
| **Throws clauses** | ✗ | Exception contracts missing |
| **Other annotations** | ✗ | Only routes/DI captured |

### Critical Issues

**[java/queries.ts: MISSING] SEVERITY: CRITICAL — No import capture**
- NO pattern for `import java.util.*;`, `import static X.Y;`, or `import ... as ...`
- Entire dependency graph is invisible
- Reflector expects isImport/source captures (reflector.ts:334–361) but query provides none
- Impact: All external dependencies untrackable; no import resolution

**[java/queries.ts:13] SEVERITY: CRITICAL — Enum tagged as struct**
- `enum_declaration` tagged `@isStruct` (should be @isEnum)
- Enums are not classes; use different semantics (constants vs inheritance)
- Impact: Enumeration handling broken; type hierarchy corrupted

**[java/queries.ts:16] SEVERITY: MEDIUM — Constructor tagged as function**
- `constructor_declaration` tagged `@isFunction` (should be @isMethod)
- Constructors are initializers, not functions; belong to class scope
- Impact: Constructor semantics lost; scoping incorrect

**[java/queries.ts: MISSING] SEVERITY: CRITICAL — No extends/implements**
- NO pattern for `class X extends Y` or `class X implements Y, Z`
- Entire inheritance graph invisible
- Reflector expects heritage captures but none provided
- Impact: Polymorphism, type substitution analysis impossible

**[java/queries.ts:18] SEVERITY: MEDIUM — Package declaration path fragile**
- Line 18 uses `scoped_identifier` which may not exist in tree-sitter-java
- Should use `package_identifier` or verify scoped_identifier structure
- May crash on parse if AST structure differs
- Impact: Package detection may fail silently

**[java/queries.ts:34] SEVERITY: MEDIUM — Method invocation lacks qualifier**
- Line 34 captures `method_invocation name: (identifier) @kinesis_target`
- Misses qualified calls like `this.foo()` or `obj.method()`
- Should also capture: `(method_invocation object: (_) @kinesis_object)`
- Impact: Intra-class and object-oriented call chains incomplete

**[java/extractor.ts] SEVERITY: LOW — Complexity misses switch expressions**
- Line 22 recognizes `switch_statement` but Java 12+ has `switch_expression`
- Switch expressions not counted as branch complexity
- Impact: Complexity underestimated for modern Java code

**[java/resolver.ts:18–20] SEVERITY: CRITICAL — Weak substring matching**
- Line 19: `file.includes(cleanPath)` does substring match, not path match
- "com.pkg" will match "welcome.pkg" or "uncomp.pkg"
- No verification of .java extension or path normalization
- Impact: Import resolution returns wrong files; false positives

### Missing Language Constructs

| Construct | Why Matters | Fix |
|-----------|-----------|-----|
| **Import statements** | Dependencies; public API surface; version tracking | Add pattern: `(import_declaration name: (scoped_identifier) @source)` and wildcard variant |
| **Extends/Implements** | Inheritance tree; polymorphism; type hierarchy | Add patterns: `superclass: (type_identifier) @heritage`, `superinterfaces: (interface_type_list)` |
| **Generics** | Type parameters; instantiation patterns | Add: `(type_parameters (type_parameter) @pulse_type_target)` |
| **Abstract modifiers** | Abstract methods/classes; contract markers | Add visibility/modifier detection |
| **Static modifiers** | Class-level vs instance semantics | Add static keyword detection |
| **Inner classes** | Nested scope; member access rules | Add: `(class_declaration containing class_declaration)` context |
| **Static initializers** | Initialization order; side effects | Add: `(static_initializer)` blocks |
| **Throws clauses** | Exception contracts; error propagation | Add: `(method_declaration throws: (throws_clause))` |
| **Record components** | Field bindings in records | Add: `(record_declaration (record_component name: (identifier)))` |
| **More annotations** | @Override, @Deprecated, @Nullable, etc. | Broaden annotation pattern beyond routes/DI |

### Summary

**13 issues found:** 3 critical (imports, extends/implements, enum), 2 critical (resolver), 4 medium (constructor, package, method call, extractor), 4 low/missing.  
**Severity: CRITICAL.** Entire import and inheritance systems missing. Imports return wrong files. Enums and constructors misclassified.

---

## Extractor Issues (Cross-Language)

### [go/extractor.ts]

**[go/extractor.ts:67–79] EFFICIENCY: extractDebt uses linear marker scan**
- Lines 67–79: Loop over markers array, search for substring in node.text
- Time: O(n_markers × len(text)) per node
- Impact: Negligible for small files; comment-heavy code gets slow
- Fix: Use single regex or set matching

**[go/extractor.ts:15–44] COMPLEXITY: Missing control flow constructs**
- Line 24: Counts `go_statement`, `defer_statement` as +1 each
- Missing: `labeled_statement` for break/continue target complexity
- Doesn't distinguish whether defer/go actually execute (dead code branches)
- Impact: Complexity slightly underestimated

**[go/extractor.ts:52–60] VISIBILITY: Only checks capitalization**
- Line 58: Checks first character A-Z for "public"
- Doesn't account for exported identifiers via interface satisfaction
- Misses unexported-but-public patterns (interface{})
- Impact: Visibility classification incomplete

### [rust/extractor.ts]

**[rust/extractor.ts] MISSING: extractNamedBindings not implemented**
- Reflector expects extractNamedBindings? (optional, base provider)
- Rust does not implement this method
- Impact: Use aliases and selective imports not normalized
- Fix: Add method to extract use as / use {} bindings

**[rust/extractor.ts:13–43] MISSING: Unsafe block counting**
- Complexity calculation doesn't count `unsafe` blocks
- Unsafe is control flow + memory risk; should be +1 per block
- Impact: Complexity underestimated for unsafe-heavy code

### [java/extractor.ts]

**[java/extractor.ts] MISSING: extractNamedBindings not implemented**
- Reflector expects extractNamedBindings? (optional, base provider)
- Java does not implement this method
- Impact: Import aliases not normalized
- Fix: Add method to extract import aliases and static imports

**[java/extractor.ts:13–44] MISSING: Lambda complexity**
- Complexity calculation doesn't count `lambda_expression`
- Lambdas are partial function control flow; should be +0.5 each
- Impact: Complexity underestimated for functional Java code

**[java/extractor.ts:13–44] MISSING: Synchronized block counting**
- Doesn't count `synchronized_statement` as branch
- Synchronization is concurrency control; adds to complexity
- Should be +1 for concurrent analysis
- Impact: Concurrency complexity invisible

---

## Critical Path Blocking Issues

### Tier-1 Blockers (Unfixable without major query rewrite)

1. **Rust: No use/mod declarations** → Import graph invisible. Cannot build dependency DAG.
2. **Rust: Methods invisible in impl blocks** → Half of code structure missing.
3. **Java: No import statements** → Dependency graph broken. No external API tracking.
4. **Java: No extends/implements** → Inheritance tree invisible. Polymorphism unresolvable.
5. **Java: No enum distinction** → Type semantics broken.

### Tier-2 Fixable (Query pattern additions)

1. **Rust: Enums/Unions mislabeled** → Relabel @isStruct → @isEnum/@isUnion.
2. **Java: Enum mislabeled** → Relabel @isStruct → @isEnum.
3. **Java: Constructor mislabeled** → Relabel @isFunction → @isMethod.
4. **Go: HTTP handler fragility** → Make selector pattern multi-level aware.
5. **Go: Module resolver doesn't handle go.mod** → Add go.mod parsing logic.

### Tier-3 Enhancements (Optional but valuable)

1. **Rust: Trait method extraction**
2. **Rust: Async/pub visibility marking**
3. **Java: Generics type parameters**
4. **Java: Inner class nesting**
5. **Go: Named return value capture**

---

## Summary Table

| Language | Imports | Inheritance | Methods | Visibility | Complexity | **Severity** |
|----------|---------|-------------|---------|-----------|-----------|---|
| **Go** | ✓ | ✓ | ✓ | ⚠ | ⚠ | MEDIUM |
| **Rust** | ✗✗ | ✗ | ✗ | ✗✗ | ⚠ | **CRITICAL** |
| **Java** | ✗✗ | ✗✗ | ⚠ | ✗✗ | ⚠ | **CRITICAL** |

**Total issues:** 28  
**Blocking:** 5 (unfixable without major rewrite)  
**Fixable:** 8 (query relabeling or pattern addition)  
**Enhancement:** 5 (optional)

**Recommendation:** Address Tier-1 blockers for Rust and Java before production deployment. Import resolution and method extraction are fundamental to any structural analysis system.
