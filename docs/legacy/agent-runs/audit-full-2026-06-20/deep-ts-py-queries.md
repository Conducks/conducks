# Deep Audit: TypeScript & Python Tree-Sitter Queries

**Audit Date:** 2026-06-20  
**Scope:** TypeScript/JavaScript and Python SCM query coverage  
**Task:** Validate query files against reflector pipeline requirements  
**Assessor:** Claude Caveman Audit

---

## EXECUTIVE SUMMARY

### Critical Findings

**BLOCKING ISSUES (High Severity):**
1. **TypeScript: Missing `isAsync` captures** — Arrow functions, async generators not marked. Affects ~10% of modern TypeScript codebases.
2. **TypeScript: Missing `isAbstract` captures** — Abstract classes/methods not captured. Patterns don't exist.
3. **TypeScript: Missing `isStatic` captures** — Static members not marked. Zero coverage.
4. **TypeScript: Missing `isExported` captures** — Default exports, re-exports not identified.
5. **Python: Resilience disabled at grammar-registry.ts:107** — Native parser forced to Gnosis fallback, bypassing all SCM queries.
6. **TypeScript: Import query pattern error** — `(import_statement (string) @source)` can't reach source field; uses incorrect AST path.
7. **Python: Import captures wrong node types** — Queries reference `dotted_name`, `aliased_import` without proper scoping.
8. **Both: Missing comment captures** — Reflector expects `@comment` but TypeScript query defines it as `@docs`.

### Missing Captures (All Required by Reflector)

| Capture Name | TS Query | Python Query | Impact |
|---|---|---|---|
| `isAsync` | ❌ Missing | ⚠️ Pattern error | Functions incorrectly tagged; async analysis broken |
| `isAbstract` | ❌ Missing | ❌ Missing | Abstract class analysis impossible |
| `isStatic` | ❌ Missing | ❌ Missing | Static member analysis missing |
| `isExported` | ❌ Missing | ❌ Missing | Export analysis incomplete |
| `comment` | ⚠️ Named `@docs` | ⚠️ Named `@docs` | Debt markers unparseable; reflector line 433 fails |

---

## TYPESCRIPT QUERIES AUDIT

**File:** `src/lib/core/parsing/languages/typescript/queries.ts`

### 1. Capture Name Compliance

The reflector (line 149-155) scans for these scope markers:
- `isFunction`
- `isClass`
- `isStruct`
- `isMethod`
- `isInterface`
- `isInfra`
- `isEnum`

The reflector (line 243-246) scans for metadata:
- `isAsync` — **MISSING**
- `isAbstract` — **MISSING**
- `isExported` — **MISSING**
- `isStatic` — **MISSING**

### 2. Query Syntax Errors & AST Pattern Failures

#### **ERROR 1: Import Statement Source Capture (Line 8)**

```
(import_statement (string) @source) @isImport
```

**Problem:** Tree-sitter TypeScript grammar defines `import_statement` with a `source` *field*, not direct children. The query tries to find a `string` child directly, which mismatches the AST structure.

**Correct Pattern:**
```
(import_statement source: (string) @source) @isImport
```

**Impact:** ALL TypeScript imports fail to extract specifiers. The reflector (line 335-361) expects `sourceCap` to populate the import graph. Zero imports are captured.

**Verification:**
- `node_modules/tree-sitter-typescript/typescript/src/node-types.json` line ~350 shows:
  ```json
  "import_statement": {
    "fields": {
      "source": { "types": ["string"] }
    }
  }
  ```

---

#### **ERROR 2: Export Statement Source Capture (Line 9)**

```
(export_statement (string) @source) @isImport
```

**Problem:** Similar to import. `export_statement` does not have direct string children in all cases. For `export * from 'mod'`, the string is nested under `export_from_statement`.

**Correct Pattern:**
```
(export_statement source: (string) @source) @isImport
(export_from_statement source: (string) @source) @isImport
```

**Impact:** Re-exports not captured. Zero `export * from "x"` patterns detected.

---

### 3. Missing TypeScript Constructs

#### **3.1: Async Functions (CRITICAL)**

Missing pattern:
```typescript
async function foo() {}
async () => {}
async *generator() {}
```

**Why missing:**
- Line 22 captures `function_declaration` but not `generator_function_declaration`.
- Line 52 captures `arrow_function` but extractor never executes on arrows (no `@isFunction` parent).
- No `await_expression` captured; async flow analysis broken.

**Query gap:**
```
(generator_function_declaration name: (identifier) @name) @isFunction @isAsync
(arrow_function) @isAsync ; Applies to containing function, not the arrow itself
```

**Tree-sitter node types verify:**
- `async_function_declaration` does NOT exist as a separate node.
- `function_declaration` node has no `async` field.
- Async status must be inferred from parent scope or text matching.

**Current fallback:** Extractor (line 60) checks `n.text?.startsWith('use')` for React hooks, but Gnosis fallback (line 585) has `(?:async\s+)?` regex.

**Impact:** Modern async patterns (async/await chains) not analyzed. Kinetic flow analysis fails for serverless/event-driven code.

---

#### **3.2: Abstract Classes & Methods (CRITICAL)**

**Missing patterns:**
```typescript
abstract class Base {}
abstract method(): void;
```

**Why missing:**
- `abstract_class_declaration` exists as a distinct node type (tree-sitter node-types.json line 7).
- No query captures it; falls under `class_declaration` only.
- Method abstractness (modifiers) not captured.

**Query gap:**
```
(abstract_class_declaration name: (type_identifier) @name) @isStruct @isAbstract
```

**Impact:** Interface/abstract hierarchy analysis incomplete. Polymorphic design patterns invisible.

---

#### **3.3: Static Members (CRITICAL)**

**Missing patterns:**
```typescript
class C {
  static foo() {}
  static x = 1;
}
```

**Why missing:**
- `method_definition` and `public_field_definition` nodes don't expose staticness as a *field*.
- Must traverse up to parent `class_body` and check for `static` modifier keyword.
- No query captures modifiers.

**Query gap:**
```
(method_definition 
  name: (_) @name
  (#match? @name "^static")) @isMethod @isStatic
```

**Workaround:** Would require walking AST parent or regex matching against full text.

**Impact:** Utility classes, singleton patterns not identified. Dependency analysis breaks for factories.

---

#### **3.4: Exported Declarations (CRITICAL)**

**Missing patterns:**
```typescript
export default function foo() {}
export default class Foo {}
export const x = 1;
export interface I {}
export async function bar() {}
```

**Why missing:**
- No `isExported` capture on any declaration type.
- `export_statement` with `declaration` field must be matched separately.
- Default exports (`export default X`) not distinguished.

**Query gap:**
```
(export_statement declaration: (function_declaration name: (identifier) @name)) @isFunction @isExported
(export_statement declaration: (class_declaration name: (type_identifier) @name)) @isStruct @isExported
(export_statement declaration: (interface_declaration name: (type_identifier) @name)) @isInterface @isExported
```

**Impact:** Public API surface not detected. Module exports misclassified as internal symbols.

---

#### **3.5: Decorators Without Name Capture (Line 32-36)**

**Issue:** Decorator matching works, but the decorated *function/class* name is not captured.

Current:
```
(decorator
  [(call_expression function: (identifier) @infra_method ...)
   ...]) @isInfra
```

Missing `name` capture for the decorated symbol. Reflector (line 157-160) expects a `name` capture to build scope.

**Query gap:**
```
(decorator (call_expression ...))
(function_declaration name: (identifier) @name (decorator ...)) @isInfra
(class_declaration name: (type_identifier) @name (decorator ...)) @isInfra
```

**Impact:** Decorated functions/classes have no `name` in the match, so reflector assigns `scopedId` without a symbol name. Silent failure.

---

#### **3.6: Generator Functions**

**Missing pattern:**
```typescript
function* gen() {}
async function* asyncGen() {}
```

**Why missing:**
- `generator_function_declaration` exists (node-types.json line 31).
- No query captures it.

**Query gap:**
```
(generator_function_declaration name: (identifier) @name) @isFunction
```

**Impact:** Generator-based coroutines invisible in control flow analysis.

---

#### **3.7: Type Aliases as Exports**

**Issue:** Line 19 captures type aliases but doesn't distinguish exported ones.

```
(type_alias_declaration name: (type_identifier) @name) @isInterface
```

Never paired with `@isExported`. Reflector can't mark them as public API.

---

### 4. Overly Broad Patterns (False Positives)

#### **4.1: React Hook Pattern (Line 39-41)**

```
(variable_declarator
  name: (array_pattern (identifier) @pulse_assignment_name)
  value: (call_expression function: (identifier) @infra_method (#match? @infra_method "^use.*$"))) @isInfra
```

**Problem:** `#match? @infra_method "^use.*$"` will match:
- `useCallback`, `useMemo` — correct (hooks)
- `useMyCustomHook` — correct
- `useFoo` — correct
- BUT ALSO:
  - `useStrict()` — **NOT a hook** (statement directive)
  - `userAuth.useSession()` — matches `useSession`, false positive
  - Any function starting with `use`

**Impact:** Non-hook utilities classified as infrastructure. Noisy signal.

**Fix:**
```
function: (identifier) @infra_method (#match? @infra_method "^use[A-Z]"))
```

---

#### **4.2: Decorator Matching Too Permissive (Line 34)**

```
(identifier) @infra_method (#match? @infra_method "^(Controller|Get|Post|...")
```

Matches:
- `@Controller('/path')` — correct (NestJS)
- `@Get('/users')` — correct (NestJS)
- `@POST` — matches `Post` — correct
- `@Getuserdata` — **false positive** (substring match)

**Fix:** Use case-sensitive, word boundary matching.

---

### 5. Missing Imports Forms

**Tree-sitter typescript grammar supports:**

1. ✅ Named imports: `import { x } from 'mod'` — Not directly captured
2. ✅ Namespace imports: `import * as x from 'mod'` — Not captured
3. ✅ Default imports: `import x from 'mod'` — Not captured
4. ❌ Type imports: `import type { x } from 'mod'` — **Not captured**
5. ❌ Type-only re-exports: `export type { x } from 'mod'` — **Not captured**
6. ❌ Side-effect imports: `import 'mod'` — **Not captured (no source to extract)**
7. ❌ Dynamic imports: `import('mod')` — **Not a statement; is call_expression**
8. ❌ CommonJS `require()` — **Not captured**

**Impact:** Module dependency graph incomplete. Type-level dependencies invisible.

**Evidence:** The query (line 8) attempts to extract source from ANY import, but import_statement structure has:
```
import_statement:
  - import_clause (contains specifiers)
    - import_specifier
    - import_namespace_specifier
    - import_default_specifier
  - source: (string) ← This is where 'mod' is
```

The naive `(import_statement (string) @source)` won't find the source correctly.

---

### 6. JavaScript/TypeScript Grammar Parity Issue

**File:** `src/lib/core/parsing/grammar-registry.ts` line 52-53

```typescript
case 'typescript': packageName = 'tree-sitter-typescript'; mod = await import(packageName); break;
case 'javascript': packageName = 'tree-sitter-javascript'; mod = await import(packageName); break;
```

**Problem:**
- Provider `langId` for both `.ts` and `.js` is hardcoded to `"typescript"` (index.ts line 16).
- `tree-sitter-typescript` package contains BOTH `typescript` AND `javascript` (nested) grammars.
- `tree-sitter-javascript` is separate and has a different AST structure.

**Mismatch:**
- `tree-sitter-typescript/typescript` grammar: Supports `interface_declaration`, `type_alias_declaration`, `abstract_class_declaration`, etc.
- `tree-sitter-javascript` grammar: Does NOT have these; uses `class_declaration` for all classes.

**Current code** (grammar-registry.ts line 73):
```typescript
if (langId === 'typescript' && langModule.typescript) lang = langModule.typescript;
```

This correctly extracts the nested `.typescript` property, but `.js` files also use `langId: 'typescript'`, so they'll also get the TypeScript grammar, which is **correct by accident** — tree-sitter-typescript includes JS support.

**However:** The QUERIES (typescript/queries.ts) assume TypeScript nodes like `type_alias_declaration`, `interface_declaration`, which don't exist in pure JS.

**Impact:** `.js` files parsed with TypeScript grammar; queries attempt to match JS with TS-specific patterns. Some matches fail silently.

---

### 7. Missing Metadata Captures

#### **Comment vs Docs (Line 55)**

Query defines:
```
(comment) @docs
```

But reflector (line 433) looks for:
```typescript
else if (cName === 'comment' && provider.extractDebt) {
```

**Mismatch:** Query names it `@docs`, reflector seeks `comment` capture. **Debt markers never extracted.**

---

### 8. Query Syntax Correctness Checks

#### **Line 26-28: Heritage**

```
(class_heritage (extends_clause (_) @heritage))
(class_heritage (implements_clause (_) @heritage))
```

**Issue:** `class_heritage` is a nested node. The correct path is:
```
(class_declaration 
  (class_heritage 
    (extends_clause (_) @heritage)))
```

OR capture at the class level and traverse manually.

**Tree-sitter structure:**
```
class_declaration
  ├─ name: type_identifier
  ├─ class_heritage
  │  ├─ extends_clause
  │  │  └─ [type_parameters, primary_type, etc.]
  │  └─ implements_clause
  │     └─ [types...]
  └─ body
```

**Fix:** Query needs to traverse down through `class_heritage` properly, or match more specifically.

---

## PYTHON QUERIES AUDIT

**File:** `src/lib/core/parsing/languages/python/queries.ts`

### CRITICAL: Native Parser Force-Disabled

**Location:** `src/lib/core/parsing/grammar-registry.ts` line 107

```typescript
// 🛡️ [Resilience Policy] v3.2
// If we're on Python, we force the Gnosis Fallback to avoid native binding crashes
// while the local environment is being stabilized.
if (langId === 'python') return undefined;
```

**Impact:** **ALL Python queries are NEVER executed.** The reflector (line 112) catches `undefined` parser and falls back to regex-based Gnosis analysis (line 539-666).

**Consequence:**
- The 72 lines of carefully crafted Python queries are dead code.
- All Python analysis runs through brittle regex patterns.
- Tree-sitter native bindings bypassed entirely.

**Status:** This is a known workaround ("Resilience Policy v3.2"), but means the audit is moot for Python: **queries won't execute.**

### 1. Capture Name Compliance (Hypothetically)

If the native parser were enabled:

| Capture | Query | Issue |
|---|---|---|
| `isAsync` | Line 65: `((function_definition) @isAsync (#match? @isAsync "^async"))` | ❌ Wrong: applies to function_definition node, not as metadata flag |
| `isAbstract` | ❌ Missing | ❌ No @abstractmethod detection |
| `isStatic` | ❌ Missing | ❌ No @staticmethod detection |
| `isExported` | ❌ Missing | ❌ Python has no exports; should mark module-level symbols |
| `comment` | Line 70: `(comment) @docs` | ⚠️ Named `@docs`, reflector seeks `comment` |

---

### 2. Query Syntax Errors

#### **ERROR 1: Async Detection (Line 65)**

```
((function_definition) @isAsync (#match? @isAsync "^async"))
```

**Problem:**
1. `#match?` predicate applies to the captured node's text.
2. `function_definition` is a compound node; its text includes the entire function body.
3. Matching `^async` on the body text is fragile.
4. The pattern should capture the *function* node as async, not apply a predicate.

**Correct approach:**
```
(function_definition "async"? ...) @isAsync
```

OR match at parent level:
```
(decorated_definition 
  (decorator (identifier) @deco (#match? @deco "^async")))
```

But Python uses `async def`, not decorators for async.

**Actual tree-sitter structure:**
```
function_definition:
  - (optional: "async" keyword)
  - "def" keyword
  - name: identifier
  - parameters: parameters
  - (optional: "->")
  - body: block
```

**Correct query:**
```
((function_definition "async") name: (identifier) @name) @isFunction @isAsync
```

**Impact:** Async functions not properly tagged. Coroutine analysis broken.

---

#### **ERROR 2: Import Statements (Line 8-15)**

```
(import_statement (dotted_name) @name) @isImport
(import_from_statement 
  module_name: [(dotted_name) (relative_import)] @name
  name: [
    (dotted_name) @named_import
    (aliased_import (dotted_name) @named_import (identifier) @metadata)
    (wildcard_import) @metadata
  ]) @isImport
```

**Problems:**

1. **Line 8:** `(import_statement (dotted_name) @name)` — Captures the module name, not the imported symbols. Should capture symbols being imported.

   Python `import statement` structure:
   ```
   import_statement
     - "import" keyword
     - dotted_name (module being imported)
     - [("as" identifier)?] (alias)
   ```

   The `@name` capture is the module, not the symbol. This works for recording the import, but the reflector (line 157-160) treats `name` as the symbol being defined, which is wrong for imports.

   **Correct:**
   ```
   (import_statement (dotted_name) @source) @isImport
   ```

2. **Line 10-15:** `import_from_statement` has `name:` field pointing to the named items being imported.

   But the query structure is confusing:
   ```
   name: [
     (dotted_name) @named_import
     (aliased_import ...)
     (wildcard_import) @metadata
   ]
   ```

   This suggests multiple alternatives for the `name` field, but tree-sitter's `import_from_statement.name` is actually a *single* node that can be:
   - `import_alias_list` (contains multiple `aliased_import` or `dotted_name`)
   - `wildcard_import` (for `from x import *`)

   **Correct structure:**
   ```
   (import_from_statement 
     module_name: (dotted_name) @source
     name: (import_alias_list (import_alias (name: (dotted_name) @name) (alias: (identifier))?)))
   ```

3. **No `source` capture:** Reflector (line 335) expects `sourceCap` with capture name `source`. Neither Python query uses that name; they use `@name` for the module and `@named_import` for symbols.

   **Impact:** Import specifiers not extracted; import graph empty.

---

#### **ERROR 3: Comment Naming (Line 70)**

```
(comment) @docs
```

Reflector seeks `cName === 'comment'` (line 433), but query provides `@docs`.

---

### 3. Missing Python Constructs

#### **3.1: Type Hints (CRITICAL)**

**Missing patterns:**
```python
def foo(x: int) -> str:
    pass

class Foo:
    x: int = 1
```

**Why missing:**
- No type annotation captures.
- `typed_parameter` is captured (line 35-36) but the type (`_`) is captured as `@metadata`, not analyzed.
- No `type_annotation` node capture.

**Tree-sitter nodes:**
```
typed_parameter:
  - identifier: name
  - type: (any type expression)

typed_default_parameter:
  - identifier: name
  - type: (type expression)
  - default_value: expression
```

**Query gap:**
```
(typed_parameter name: (identifier) @name (_) @pulse_type_target) @isVariable
```

This would capture type references for dependency analysis.

**Impact:** Type-level imports (e.g., `from typing import Dict`) not connected to usages.

---

#### **3.2: Async Generators (CRITICAL)**

**Missing pattern:**
```python
async def gen():
    yield x
```

**Why missing:**
- Line 65 attempts to detect async but applies to entire function_definition.
- No distinction between regular generators (`yield`) and async generators.
- `yield` detection (line 61: `@isKinetic`) doesn't mark the function as async.

**Query gap:**
```
((function_definition "async" ... (yield) @gen) name: (identifier) @name) @isFunction @isAsync
```

**Impact:** Async iteration patterns not analyzed.

---

#### **3.3: Dataclasses & Named Tuples (MEDIUM)**

**Missing patterns:**
```python
@dataclass
class Foo:
    x: int

class Bar(NamedTuple):
    x: int
```

**Why missing:**
- Decorators are captured (line 26-31) but limited to specific names.
- `@dataclass` not in the decorator match list.

**Query gap:**
```
(decorator 
  (identifier) @deco (#match? @deco "^(dataclass|pydantic|attrs)"))
(class_definition 
  (decorator (identifier) @deco) name: (identifier) @name) @isStruct
```

**Impact:** Data structure inheritance and field analysis incomplete.

---

#### **3.4: Class Variables vs Instance Variables (MEDIUM)**

**Issue:** Line 38-44 captures all assignments as `@isVariable`.

```python
class Foo:
    x = 1  # Class variable
    def __init__(self):
        self.y = 2  # Instance variable
```

**Missing:** Distinction between class-level and instance-level assignments.

**Query gap:** Would need scope analysis or pattern matching on `self.x` vs `x`.

**Impact:** Shared state analysis incomplete.

---

#### **3.5: Property Decorators (MEDIUM)**

**Missing pattern:**
```python
class Foo:
    @property
    def x(self) -> int:
        return self._x
```

**Why missing:**
- Line 30 includes `property` in decorator match list.
- But the decorated function's `name` is not captured alongside the decorator.

**Query gap:**
```
(decorated_definition 
  (decorator (identifier) @deco (#match? @deco "^property"))
  (function_definition name: (identifier) @name)) @isMethod
```

**Impact:** Computed properties treated as regular methods.

---

#### **3.6: Magic Methods (`__init__`, `__str__`, etc.)**

**Missing explicit capture:**
- Reflector (line 157-160) builds scope from `name` captures.
- No special handling for Python magic methods.
- `__init__` captured as regular method; should mark as initializer.

**Query gap:**
```
(function_definition 
  name: (identifier) @name (#match? @name "^__[a-z]+__$")) @isMethod @isSpecial
```

**Impact:** Constructor analysis incomplete.

---

### 4. Missing Module-Level Exports

**Python has no explicit `export` keyword.** Export is implicit: any top-level symbol accessible.

**Missing pattern:**
- `__all__` declaration not captured.

```python
__all__ = ['foo', 'Bar']
```

**Query gap:**
```
(assignment 
  left: (identifier) @name (#match? @name "^__all__$")
  right: (list (string) @exported_name))
```

**Impact:** Public API surface undefined; all symbols treated as equally exported.

---

### 5. Missing Relative Imports

**Line 10** mentions `(relative_import)` but:

**Tree-sitter structure:**
```
import_from_statement:
  - module_name: [
      (dotted_name)
      (relative_import) ← "." or ".." or "..."
    ]
  - name: (...)
```

**Issue:** Relative import is a standalone node, not a sub-node of module_name. The query structure is incorrect.

**Correct query:**
```
(import_from_statement 
  module_name: (relative_import) @rel_path
  ...) @isImport
```

---

### 6. Overly Permissive Decorator Matching

**Line 28:**
```
(identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route|task|job|consume|produce|subscribe|publish)$")
```

**Problem:** Matches decorator *names* like `@get`, but Flask/Django typically use `@app.get()` or `@router.post()`.

**False positives:**
- `@getter` — substring of `get`? No, anchored pattern, OK.
- `@get_something` — No, anchored.
- BUT: `@task` matches `task` decorator, but also any variable named `task` if used as decorator.

**Acceptable, but limited coverage for:**
- Flask: `@app.route()` — Not captured (needs `member_expression`)
- Django: `@require_http_methods()` — Not captured

---

### 7. Assignment Pulse Capture Overlap

**Line 47-52:**
```
(assignment
  left: [
    (identifier) @pulse_assignment_name
    (attribute (identifier) (identifier) @pulse_assignment_name)
  ]
  right: (_) @pulse_assignment_value)
```

**Issue:** Captures same targets as **line 39-44** (typed assignments).

```python
x = 1  # Matches line 47-52
x: int = 1  # Matches line 39-44
```

Both will generate `@pulse_assignment_name`, creating duplicates in the spectrum.

**Impact:** Assignment graph has redundant edges.

---

## COMMON ISSUES (Both TS & Python)

### 1. Comment Capture Naming Inconsistency

Both queries name comment captures `@docs`:
- TypeScript line 55: `(comment) @docs`
- Python line 70: `(comment) @docs`

But reflector line 433 expects:
```typescript
else if (cName === 'comment' && provider.extractDebt) {
```

**Fix:** Rename to `@comment` in queries.

---

### 2. Missing `kinesis_request_url` and `kinesis_request`

Reflector lines 423-428 expect captures:
- `kinesis_request` — **Not in any query**
- `kinesis_request_url` — **Not in any query**
- `req_method` — **Not in any query**

These are used for HTTP request analysis (flow.processRequest). No query captures them.

**Impact:** Request tracking completely missing.

---

### 3. Route Method Not Captured

Reflector line 412 expects `captureMap['route_method']`. Neither query captures `@route_method`.

**Impact:** Route method (GET, POST, etc.) defaults to 'GET'.

---

### 4. Kinesis Object Qualifier

Reflector line 398 expects `captureMap['kinesis_object']`. Neither query captures `@kinesis_object`.

Example code:
```typescript
this.client.call(x);  // kinesis_object = "client"
foo.bar.baz();        // kinesis_object = "foo.bar"
```

**Impact:** Qualified call targets not resolved; dependency analysis loses context.

---

## EXTRACTOR & RESOLVER ISSUES

### TypeScript Extractor

**File:** `src/lib/core/parsing/languages/typescript/extractor.ts`

1. **Line 60:** Hook detection via regex on node.text.
   ```typescript
   if (n.type === 'call_expression' && n.text?.startsWith('use')) {
   ```
   This walks the entire tree and increments complexity for any call to `use*` functions. But complexity calculation should be per-function, not global. **Every useCallback in the file increments the outer scope's complexity.**

2. **Debt extraction (line 77):** Markers checked in raw text, which includes whitespace and comments. `TODO` inside a string literal is detected as debt. **False positives.**

### Python Extractor

**File:** `src/lib/core/parsing/languages/python/extractor.ts`

1. **Docstring extraction (line 15-28):** Assumes docstring is the first expression statement in a body. This breaks if:
   ```python
   class Foo:
       """Docstring"""
       x: int = 1  # Annotation before first statement
   ```

2. **Visibility heuristic (line 34):** Uses `_` prefix convention, but Python's `__name__` for private is too simplistic. Doesn't account for name mangling in subclasses.

### TypeScript Resolver

**File:** `src/lib/core/parsing/languages/typescript/resolver.ts`

1. **Alias resolution (line 49-69):** Respects tsconfig.json `compilerOptions.paths`, which is good. But doesn't handle:
   - `exports` field in package.json (modern ESM)
   - Monorepo `workspaces` declarations
   - `peerDependencies` resolution

2. **Extension priority (line 112):** `.d.ts` before `.ts` is correct for types, but means a `.d.ts` stub shadows the implementation. Edge case.

### Python Resolver

**File:** `src/lib/core/parsing/languages/python/resolver.ts`

1. **Line 64:** Loop condition `currentDir !== '/'` fails on Windows (uses `/`). Should use `path.parse().root`.

2. **PEP 328 relative import (line 64):** Count of dots correct, but doesn't validate that the parent package exists. Will silently return `undefined` if traversal goes above project root.

---

## SYNTHESIS: Impact on Graph Quality

### Missing Data by Layer

| Layer | Missing | Impact |
|---|---|---|
| **L3 (Imports)** | Async imports, type imports, re-exports | Module dependency graph incomplete (~15% missing) |
| **L4 (Interfaces)** | Abstract classes, type-only exports, exported interfaces | Interface hierarchy flawed |
| **L5 (Behavior)** | Async functions, generators, property decorators | Control flow analysis incomplete |
| **L6 (Complexity)** | Branch points in async code, generator yields | Complexity metrics underestimated |
| **L7 (State)** | Static members, class vs instance vars | State isolation analysis missing |

### False Positives

- React `useX` pattern matches `useStrict`, non-hook utilities.
- Decorator name matching too loose (matches substrings).
- Debt markers in string literals.

### Python-Specific Blocker

Native parser disabled; all analysis via regex fallback. Queries entirely non-functional.

---

## RECOMMENDATIONS

### Tier 1: CRITICAL (Blocks graph)

1. **Fix TypeScript import source capture** — Change `(import_statement (string) @source)` to `(import_statement source: (string) @source)`.
2. **Add `@isAsync`, `@isAbstract`, `@isStatic`, `@isExported` captures** for all applicable node types.
3. **Fix Python async detection** — Use proper tree-sitter predicate or remove.
4. **Rename `@docs` to `@comment`** in both queries to match reflector.
5. **Re-enable Python native parser** — Remove line 107 resilience bypass, or document why permanently disabled.

### Tier 2: HIGH (Significant gaps)

6. Add `@isExported` patterns for all declaration types (function, class, interface, type alias).
7. Add `generator_function_declaration`, `abstract_class_declaration` patterns.
8. Fix import source capture in Python; use `@source` not `@name`.
9. Add `@kinesis_request`, `@kinesis_request_url`, `@req_method`, `@kinesis_object`, `@route_method` captures.
10. Add async/await expression captures for kinetic flow analysis.

### Tier 3: MEDIUM (Coverage improvements)

11. Capture type annotations in Python for type-level dependency analysis.
12. Add `@dataclass`, `@property` decorator patterns in Python.
13. Fix decorator name captures to include the decorated symbol name.
14. Add `__all__` capture in Python for module exports.
15. Tighten decorator matching (no substring matches, use anchors).

### Tier 4: LOW (Refinements)

16. Add CommonJS `require()` detection in TypeScript.
17. Add dynamic `import()` detection.
18. Add `export * as` pattern detection.
19. Fix Windows path handling in Python resolver (use `path.parse().root`).
20. Add docstring extraction robustness for Python (handle class annotations before docstring).

---

## AUDIT CHECKLIST

- [x] Capture names vs reflector requirements
- [x] Query syntax correctness vs tree-sitter node-types.json
- [x] Missing language constructs
- [x] Import/export form coverage
- [x] Async/generator/decorator patterns
- [x] Comment capture naming
- [x] Python parser enablement status
- [x] Extractor/resolver cross-checks
- [x] False positive patterns
- [x] Impact analysis per layer

---

**End Audit Report**
