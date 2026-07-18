# Deep Audit: Tree-Sitter Queries for C, C++, C#, PHP, Ruby, Swift

**Date:** 2026-06-20  
**Status:** READ-ONLY FINDINGS  
**Auditor:** Claude Caveman Agent

---

## Executive Summary

All six languages have **incomplete query coverage** relative to their linguistic feature set. The pipelines consistently miss:
- Secondary definition types (typedefs, enums in C; virtual/operator methods in C++; properties in C#; traits/modules in PHP/Ruby)
- Import/include directives beyond basic capture
- Advanced control flow (match expressions, guard statements, protocol extensions)
- Decorator/attribute systems
- Module/namespace aliasing and visibility modifiers

**Impact:** Symbol resolution gaps, missed infrastructure hooks, incomplete dependency graphs.

---

## 1. C Language (`src/lib/core/parsing/languages/c/`)

### 1.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | No `#include` directives mapped to `source` |
| `isFunction` | ✓ Present | OK |
| `isClass` | N/A | C has no classes |
| `isStruct` | ✓ Present | OK for structs, unions, enums |
| `isEnum` | ✓ Present (labeled as `isStruct`) | Overcounts; enum ≠ struct semantically |
| `isImport` | ✗ MISSING | No marker on `preproc_include` |
| `heritage` | ✗ MISSING | Not applicable (C has no inheritance) |
| `kinesis_target` | ✓ Present | OK for function calls |
| `pulse_assignment_name/value` | ✓ Present | OK |
| `comment` | ✓ Present | OK |

### 1.2 Missing Constructs

**queries.ts analysis:**

```
Line 16: (preproc_include (_) @name) @isPackage
```

**Problem:** 
- `preproc_include` is captured with `@name` but NOT with `@isImport`. The reflector expects `isImport` to mark imports (line 211 in reflector.ts).
- No `source` capture for the include path itself.

**Constructs NOT captured:**

1. **Typedefs** — Missing entirely
   - `typedef struct { ... } MyStruct;` — no definition marker
   - `typedef int myint;` — invisible to reflector
   - Impact: Type aliases not tracked as definitions

2. **Pointer/function pointers** — Not handled
   - `int (*funcPtr)(int);` — no capture
   - Impact: Function pointer types ignored

3. **Preprocessor macros** — Partial capture
   - Line 17: `(preproc_def (identifier) @name) @isMacro` — OK
   - But: `#define` expansions (parameterized macros) not fully captured
   - Missing: Macro bodies (value side)

4. **Include guards** — Not tracked
   - `#ifndef GUARD_H` / `#define GUARD_H` — macros captured, not linked as pattern

5. **Extern declarations** — Not marked
   - `extern int global_var;` — parsed as declaration, no visibility marker
   - Missing: `isExported` flag for extern symbols

6. **Static/inline keywords** — Not tracked
   - `static int helper() { ... }` — treated as regular function
   - Missing: `isStatic` capture

### 1.3 S-Expression Pattern Issues

**queries.ts line 10:**
```
(function_definition (function_declarator (identifier) @name)) @isFunction
```

**Correctness Check:**
- Tree-sitter C grammar: `function_definition → function_declarator → identifier` ✓
- But **does NOT capture method-like function pointers inside structs**
  - `struct S { int (*method)(void); };` — the function pointer is not a `function_definition`

**queries.ts line 12:**
```
(enum_specifier (type_identifier) @name) @isStruct
```

**Semantic Issue:**
- Tagging `@isStruct` for enums is technically correct (structurally) but **semantically wrong**
- Should be `@isEnum` for distinction (missing capture type)

### 1.4 Provider & C/CPP Grammar Confusion

**index.ts line 14:**
```typescript
public readonly extensions = [".c", ".h"];
```

**Issue:** 
- **Header files (.h) could be C or C++.** The CProvider claims ownership, but:
  - If a `.h` file uses C++ syntax (class, namespace), the C parser will fail
  - **No fallback to CPP provider**
  - Grammar registry (grammar-registry.ts:63) loads **both** `tree-sitter-c` and `tree-sitter-cpp`

**Missing Logic:**
- No heuristic to detect C vs. C++ in header files
- No language routing based on file content

---

## 2. C++ Language (`src/lib/core/parsing/languages/cpp/`)

### 2.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | `#include` not mapped to `source` |
| `isFunction` | ✓ Present | OK |
| `isClass` | ✗ MISSING | Should be separate from `isStruct` |
| `isStruct` | ✓ Present | OK but conflates struct/class |
| `isMethod` | ✓ Present | OK |
| `isInterface` | ✗ MISSING | No abstract base class marker |
| `isEnum` | ✗ MISSING | Not captured at all |
| `isImport` | ✗ MISSING | No marker on `preproc_include` |
| `isAsync` | ✗ MISSING | No coroutine detection |
| `isAbstract` | ✗ MISSING | No `virtual`/pure virtual detection |
| `heritage` | ✗ MISSING | No inheritance capture |
| `kinesis_target` | ✓ Present | OK |
| `pulse_assignment_name/value` | ✓ Present | OK |
| `comment` | ✓ Present | OK |

### 2.2 Missing Constructs

**queries.ts analysis:**

```
Line 15: (namespace_definition (_) @name) @isPackage
```

**Problem:**
- Namespace captures name but no way to distinguish:
  - Named namespace: `namespace foo { ... }`
  - Anonymous namespace: `namespace { ... }`
- No aliasing support: `namespace fs = std::filesystem;` not captured

**Constructs NOT captured:**

1. **Enum specifiers** — Completely missing
   - `enum Color { RED, GREEN };` — invisible
   - `enum class Status { OK, ERR };` — invisible
   - Impact: Enum definitions and constants lost

2. **Virtual/pure virtual methods** — Not detected
   - `virtual void foo() = 0;` — captured as regular method, no `isAbstract` flag
   - Impact: Interface-like contracts not recognized

3. **Destructors** — Partial capture
   - Line 25: `(destructor_name) @name` — captures name but **no parent scope**
   - Missing parent binding: which class owns this destructor?

4. **Template declarations** — Incomplete
   - Line 18: `(template_declaration) @isGeneric` — **captures entire template**, not the inner class/function
   - No way to get the template name or parameters
   - Should separate: template type, template specialization, generic function

5. **Operator overloads** — Not distinguished
   - `operator+`, `operator[]`, `operator()` — parsed as methods but no `isOperator` flag
   - Impact: Operator usage not tracked in kinesis

6. **Lambda expressions** — Not tracked
   - `[](int x) { return x * 2; }` — no capture
   - Missing: closure variable captures, lambda type

7. **Using declarations / using aliases** — Not captured
   - `using std::vector;` — not recognized as import
   - `using Real = double;` — not recognized as type alias

8. **Constexpr / consteval functions** — Not marked
   - No compile-time execution indicator

9. **Concepts (C++20)** — Not captured
   - `requires Comparable` clauses — invisible

### 2.3 S-Expression Pattern Issues

**queries.ts line 35:**
```
(call_expression [(identifier) (field_identifier) (field_expression) (qualified_identifier)] @kinesis_target)
```

**Correctness:**
- Tree-sitter C++ grammar uses `qualified_identifier` for `std::vector::push_back`
- Missing: Namespace prefix tracking
  - `foo::bar()` is captured as one target, but no way to distinguish the namespace

**queries.ts line 11-12:**
```
(class_specifier (type_identifier) @name) @isStruct
(struct_specifier (type_identifier) @name) @isStruct
```

**Semantic Issue:**
- Both class and struct tagged `@isStruct` — loses semantic distinction
- In C++, `class` defaults to private, `struct` to public
- Should use: `@isClass` for class_specifier, `@isStruct` for struct_specifier

### 2.4 C++ Include Resolver

**resolver.ts lines 13-29:**

```typescript
public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
  const cleanPath = rawPath.replace(/^["<]|[">]$/g, '');
  // ...
}
```

**Issues:**
- **Does NOT distinguish** between local includes (`"foo.h"`) and system includes (`<iostream>`)
- **No header search path handling** — C++ uses multiple include paths (`.` `/usr/include`, project-specific `-I`)
- **No standard library resolution** — `<vector>`, `<iostream>` will fail to resolve
- **Logic is too simple** — C++ resolution requires understanding include paths, not just filename matching

---

## 3. C# Language (`src/lib/core/parsing/languages/csharp/`)

### 3.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | `using` statements not mapped to `source` |
| `isFunction` | ✓ Present | OK (methods, constructors, destructors) |
| `isClass` | ✓ Present (via `class_declaration`) | OK |
| `isStruct` | ✓ Present | OK |
| `isInterface` | ✓ Present | OK |
| `isEnum` | ✓ Present | OK |
| `isProperty` | ✓ Present | OK (via `field_declaration`) |
| `isImport` | ✗ MISSING | No marker on `using` statements |
| `isAsync` | ✗ MISSING | No async/await detection |
| `isAbstract` | ✗ MISSING | No `abstract` keyword detection |
| `isStatic` | ✗ MISSING | No `static` keyword detection |
| `isExported` | ✗ MISSING | No `public`/internal visibility marker |
| `kinesis_target` | ✓ Present | OK |
| `pulse_assignment_name/value` | ✓ Present | OK |
| `comment` | ✓ Present | OK |

### 3.2 Missing Constructs

**queries.ts analysis:**

```
Line 6: (field_declaration (variable_declaration (variable_declarator (identifier) @name))) @isProperty
```

**Problem:**
- **C# distinguishes field vs. property (getter/setter)**
- Line 6 captures field, but **MISSES properties with accessors**
  - `public int X { get; set; }` — parsed as property_declaration, not field_declaration
  - Should add: `(property_declaration (identifier) @name) @isProperty`

**Constructs NOT captured:**

1. **Properties with accessors** — MISSING
   - `public int Age { get; set; }` — no capture as property definition
   - `public string Name { get => _name; set => _name = value; }` — invisible

2. **Events** — MISSING entirely
   - `public event EventHandler OnClick;` — not recognized
   - Impact: Event-driven architecture not modeled

3. **Delegates** — MISSING
   - `public delegate void MyDelegate(int x);` — invisible
   - Impact: Callback contracts not tracked

4. **Attributes/Decorators** — Partially captured
   - Lines 23-29 capture HTTP route attributes but **MISS**:
     - `[Serializable]`
     - `[Obsolete]`
     - `[DebuggerDisplay]`
     - Custom attributes on methods/properties/fields

5. **Async/Await** — Not detected
   - `async Task Foo() { await SomeAsync(); }` — no `isAsync` flag
   - Line 43 in extractor detects `await_expression` for complexity but **no query capture**
   - Should add: `(method_declaration (_) @isAsync (#match? @isAsync "^async"))`

6. **Abstract classes/methods** — Not detected
   - `abstract class Base { }` — treated as regular class
   - `abstract void Method();` — treated as regular method
   - Missing: `isAbstract` capture

7. **Static members** — Not detected
   - `static int Count { get; set; }` — no `isStatic` flag
   - Impact: Class-level state not distinguished from instance state

8. **Partial classes** — Not captured
   - `partial class Foo { }` — treated as regular class, no indication of being partial
   - Impact: Type splitting across files not tracked

9. **Records (C# 9+)** — Partially captured
   - Line 11: `(record_declaration (identifier) @name) @isStruct` — OK
   - But MISSING: positional parameters as implicit properties
   - `record Point(int X, int Y);` — parameters not captured as properties

10. **LINQ queries** — Not tracked as special flow
    - Line 39 in extractor detects `query_expression` but **no query capture**
    - `from x in list where x > 5 select x` — invisible to call graph

11. **Generic constraints** — Not captured
    - `where T : IComparable` — not recognized

12. **Extension methods** — Not marked
    - `public static void Ext(this MyClass obj) { }` — no indication of being extension

### 3.3 Using Statements (Imports)

**Missing entire construct:**

```
using System;
using MyNamespace;
using static System.Math;
using Alias = System.Collections.Generic;
```

**None of these are captured with `@isImport` or mapped to `source`.**

The resolver (resolver.ts) attempts to handle this, but the query itself doesn't capture them.

---

## 4. PHP Language (`src/lib/core/parsing/languages/php/`)

### 4.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | `use` statements not mapped to `source` |
| `isFunction` | ✓ Present | OK |
| `isClass` | ✓ Present (via `class_declaration @isStruct`) | Semantically wrong (should be @isClass) |
| `isStruct` | ✓ Present (overloaded) | OK but over-inclusive |
| `isInterface` | ✓ Present | OK |
| `isEnum` | ✓ Present (line 13) | OK (PHP 8.1+) |
| `isMethod` | ✓ Present | OK |
| `isImport` | ✗ MISSING | No marker on `use` statements |
| `isAsync` | ✗ MISSING | No async/generator detection |
| `isAbstract` | ✗ MISSING | No `abstract` keyword detection |
| `isStatic` | ✗ MISSING | No `static` keyword detection |
| `kinesis_target` | ✓ Present | OK |
| `pulse_assignment_name/value` | ✓ Present (line 7, 31 duplicated) | OK but duplicated |
| `comment` | ✓ Present | OK |

### 4.2 Missing Constructs

**queries.ts analysis:**

```
Line 12: (trait_declaration (name) @name) @isStruct
```

**Problem:**
- Traits are tagged `@isStruct` — **WRONG semantics**
- Should be separate: `@isTrait` (or at minimum @isInterface)

```
Lines 7 & 31: (assignment_expression ...) @isPulse
```

**Problem:**
- **Duplicate capture** for assignments — one is fields, one is general
- Redundant and confusing

**Constructs NOT captured:**

1. **Use statements (imports)** — MISSING
   - `use Illuminate\Support\Collection;` — not captured
   - `use MyNamespace\{Class1, Class2};` — group use not captured
   - `use function str_pad;` — function use not captured
   - Impact: No namespace resolution, dependency graph incomplete

2. **Namespace declarations** — Partial
   - Line 18: `(namespace_definition (namespace_name) @name) @isPackage` — OK
   - But: **no `use` alias tracking** — `use Foo as F` not captured

3. **Traits and mixins** — Misclassified
   - Line 12 tags as `@isStruct` (should be `@isTrait` or `@isInterface`)
   - `use TraitName` (trait inclusion in class) — NOT captured
   - Impact: Mixin composition not tracked

4. **Arrow functions (PHP 7.4+)** — MISSING
   - `fn($x) => $x * 2` — no capture
   - Missing from complexity calculation, assignment tracking

5. **Closures/anonymous functions** — MISSING
   - `function(...) { ... }` anonymous — not distinguished from named
   - Closure variable binding (`use ($x)`) — not captured

6. **Match expressions (PHP 8.0+)** — Detected in extractor but NOT in query
   - Line 27 in extractor: `match_expression` detected for complexity
   - **No query capture** to track match arms, targets
   - Impact: Flow analysis incomplete

7. **Constructor promotion (PHP 8.0+)** — MISSING
   - `public function __construct(private string $name)` — parameter promotion not captured
   - Should auto-create property

8. **Attributes/annotations** — Partially captured
   - Lines 22-29 capture HTTP attributes
   - **MISSING**: `#[Route]`, `#[Inject]` on properties, `#[Deprecated]`, etc.
   - No generic attribute capture mechanism

9. **Magic methods** — Not specially marked
   - `__construct`, `__call`, `__get`, `__set` — treated as regular methods
   - Should be flagged as infrastructure

10. **Type hints on parameters/return** — Not captured
    - `function foo(int $x): string` — hints not extracted
    - Impact: Type information lost

11. **Readonly properties (PHP 8.1+)** — Not marked
    - `readonly public string $name;` — no indication of immutability

12. **Nullsafe operator** — Not tracked
    - `$obj?->method()` — call tracking may be broken

### 4.3 Duplicate Capture

**queries.ts lines 7 & 31:**
```
Line 7:  (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
Line 31: (assignment_expression (variable_name) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
```

**Problem:** Identical rule, twice. This will create duplicate matches in the query results.

---

## 5. Ruby Language (`src/lib/core/parsing/languages/ruby/`)

### 5.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | `require` not mapped to `source` |
| `isFunction` | ✓ Present | OK |
| `isClass` | ✓ Present (via `class @name`) | OK |
| `isStruct` | ✓ Present (module/class/enum) | Overloaded |
| `isEnum` | ✗ MISSING | Not distinguished |
| `isModule` | ✗ MISSING | Should be separate from class |
| `isMethod` | ✓ Present (singleton_method) | Incomplete |
| `isImport` | ✗ MISSING | No marker on `require`/`require_relative` |
| `isAsync` | ✗ MISSING | No Fiber/async detection |
| `isAbstract` | ✗ MISSING | No abstract marker |
| `isStatic` | ✗ MISSING | No class method indicator |
| `isExported` | ✗ MISSING | No visibility marker (public/private) |
| `heritage` | ✓ Present (line 25, via include/extend/prepend) | OK but incomplete |
| `kinesis_target` | ✓ Present (line 31-32 duplicated) | OK but duplicated |
| `pulse_assignment_name/value` | ✓ Present | OK |
| `comment` | ✓ Present | OK |

### 5.2 Missing Constructs

**queries.ts analysis:**

```
Lines 31-32: (call method: (identifier) @kinesis_target)
```

**Problem:** **Identical rule, twice.** This creates duplicate captures.

**queries.ts line 12:**
```
(module name: (constant) @name) @isStruct
```

**Problem:** Modules tagged as `@isStruct` — **WRONG**. Should be `@isModule` (distinct construct).

**Constructs NOT captured:**

1. **Require/require_relative statements** — MISSING ENTIRELY
   - `require "myfile"` — not captured
   - `require_relative "./helper"` — not captured
   - Impact: No module dependency tracking, no import resolution

2. **Modules vs. Classes** — Misclassified
   - Line 12: both classes and modules get `@isStruct` tag
   - Should be: `@isClass` vs. `@isModule`

3. **Module inclusion (mixins)** — Incomplete
   - Lines 23-25 capture `include`, `extend`, `prepend` as `@isHeritage`
   - But **does NOT capture** `included`, `extended` hooks
   - Missing: which classes mix in which modules

4. **Singleton methods** — Present but incomplete
   - Line 14: `(singleton_method name: (identifier) @name) @isMethod` — OK
   - Missing: definition site of receiver
   - `obj.define_singleton_method(:foo) { ... }` — not captured

5. **Blocks/Procs/Lambdas** — MISSING
   - `do |x| x * 2 end` — no capture
   - `-> (x) { x * 2 }` — no capture
   - Impact: Higher-order function patterns not tracked, block parameters invisible

6. **Attr_accessor/attr_reader/attr_writer** — MISSING
   - `attr_accessor :name` — not recognized as property generator
   - Impact: Auto-generated getters/setters not shown in reflection

7. **Block parameters** — Not captured
   - `def foo(&block)` — block param not extracted
   - `{ |x| ... }` — block vars not tracked

8. **Rescue/ensure clauses** — Not marked specially
   - `begin ... rescue ... end` — parsed but not distinction for exception handling
   - Line 24 in extractor detects but **no query capture**

9. **Visibility modifiers** — Not captured
   - `private`, `protected`, `public` — invisible to reflector
   - Impact: No way to track method visibility

10. **Class variables** — MISSING
    - Line 8: captures `class_variable` as property
    - But **no distinction** from instance variables
    - Should be marked differently

11. **String interpolation calls** — Not tracked
    - `"#{obj.method}"` — the `method` call is inside string, may be missed

12. **Metaprogramming** — Not handled
    - `define_method`, `method_missing`, `send`, `eval` — invisible to static analysis
    - Impact: Dynamically generated methods not reflected

---

## 6. Swift Language (`src/lib/core/parsing/languages/swift/`)

### 6.1 Missing Required Capture Names

| Capture | Status | Impact |
|---------|--------|--------|
| `name` | ✓ Present | OK |
| `source` | ✗ MISSING | `import` not mapped to `source` |
| `isFunction` | ✓ Present | OK |
| `isClass` | ✓ Present | OK (though also uses for init) |
| `isStruct` | ✗ MISSING | No `struct_declaration` capture |
| `isEnum` | ✗ MISSING | No `enum_declaration` capture |
| `isProtocol` | ✗ MISSING | No `protocol_declaration` capture |
| `isExtension` | ✗ MISSING | No `extension_declaration` capture |
| `isImport` | ✗ MISSING | No marker on `import_declaration` |
| `isAsync` | ✗ MISSING | No async/await detection |
| `isAbstract` | ✗ MISSING | No protocol/requirement tracking |
| `kinesis_target` | ✓ Present | OK |
| `pulse_assignment_name/value` | ✓ Present | OK |
| `comment` | ✓ Present | OK |

### 6.2 Missing Constructs

**queries.ts analysis:**

```
Line 9: (import_declaration (identifier (simple_identifier) @name)) @isPackage
```

**Problem:**
- `import` captured as `@isPackage` with `@name` but **NO `@isImport` flag**
- No `source` capture for the import path
- Cannot track what was imported

```
Lines 6-8: (class_declaration ...) @isClass
           (function_declaration ...) @isFunction
           (init_declaration) @isFunction
```

**Problem:**
- `init_declaration` tagged as `@isFunction` — **WRONG**
- Should be `@isInit` or special marker for initializers
- Confuses with regular functions

**Constructs NOT captured:**

1. **Struct declarations** — COMPLETELY MISSING
   - `struct Point { var x: Int; var y: Int }` — invisible
   - Impact: Value types not distinguished from reference types

2. **Enum declarations** — COMPLETELY MISSING
   - `enum Color { case red, green, blue }` — invisible
   - Associated values, raw values not captured

3. **Protocol declarations** — COMPLETELY MISSING
   - `protocol Drawable { func draw() }` — invisible
   - Impact: Interface contracts not modeled

4. **Extension declarations** — COMPLETELY MISSING
   - `extension Array where Element: Comparable { ... }` — invisible
   - Impact: Open-world type extension not tracked

5. **Property wrappers** — MISSING
   - `@Published var count: Int` — not distinguished
   - `@State var name: String` — not distinguished
   - Impact: Reactive property bindings not visible

6. **Guard statements** — Not tracked
   - `guard let x = optional else { return }` — parsed but not specially marked
   - Line 19 in extractor detects but **no query capture**

7. **Where clauses** — Not captured
   - `func foo<T: Comparable>(x: T) where T.Count > 0 { ... }` — constraint invisible

8. **Async/await** — Not detected
   - `async func foo() { await someAsync() }` — no `isAsync` flag

9. **Isolated parameters (Swift 5.9+)** — Not marked
   - `func foo(isolated x: Actor)` — isolation not tracked

10. **Deinit** — Not captured
    - `deinit { ... }` — invisible

11. **Subscripts** — Not captured
    - `subscript(index: Int) -> String { get { ... } set { ... } }` — no definition

12. **@IBAction/@IBOutlet** — Not marked
    - UIKit/Storyboard annotations — invisible

13. **Type aliases** — Not captured
    - `typealias Result = (success: Bool, message: String)` — invisible

14. **Computed properties** — Not distinguished
    - `var fullName: String { first + " " + last }` — not marked as computed

15. **Generic constraints** — Not captured
    - Generic where clauses, associated type requirements — invisible

---

## 7. Cross-Language Issues

### 7.1 `isImport` Marker Missing Universally

**All six languages** have this pattern:

```
(some_import_construct (_) @name) @isPackage  // WRONG
```

**Should be:**

```
(some_import_construct (_) @name) @isImport
(some_import_construct (_) @source)           // For the path
```

**Impact:** Reflector (line 211) checks for `isImport` to distinguish imports from other definitions. Without this, all imports are treated as ordinary symbols.

### 7.2 Missing `source` Capture Type

**All six languages** lack explicit `source` capture mapping import/include paths.

Expected pattern (from TypeScript line 8):
```
(import_statement (string) @source) @isImport
```

Missing in: C, C++, C#, PHP, Ruby, Swift.

**Impact:** ImportProcessor cannot extract the import source path, breaking dependency resolution.

### 7.3 Modifier Markers (`isStatic`, `isAbstract`, `isExported`, `isAsync`)

**Queries capture modifiers through complex patterns but DO NOT use capture names.**

Example problems:
- C: static functions parsed as regular functions (no `@isStatic`)
- C++: pure virtual methods not marked (`@isAbstract`)
- C#: public/private not captured (no `@isExported`)
- PHP: static methods not marked (no `@isStatic`)
- Ruby: visibility (private/protected/public) not captured
- Swift: async functions not marked (no `@isAsync`)

**Extractor workaround:** Complexity extractors detect these in trees and set flags in DNA (reflector.ts lines 243-247), but **query-time capture would be more efficient**.

### 7.4 Enum Semantic Confusion

| Language | Query Status | Issue |
|----------|--------------|-------|
| C | `@isStruct` | Enums != structs |
| C++ | Missing entirely | No enum capture |
| C# | `@isStruct` | OK (distinct from class) — acceptable |
| PHP | `@isStruct` | OK (PHP 8.1+) — acceptable |
| Ruby | Missing entirely | No enum capture |
| Swift | Missing entirely | No enum capture |

**Recommendation:** Enums should have their own capture type `@isEnum` for semantic accuracy.

### 7.5 Duplicate Rules

| Language | Lines | Issue |
|----------|-------|-------|
| PHP | 7, 31 | `assignment_expression` rule repeated |
| Ruby | 31-32 | `(call method: ...) @kinesis_target` rule repeated twice |

**Impact:** Query matches duplicated, bloating output.

---

## 8. Tree-Sitter AST Correctness Issues

### 8.1 C++ Namespace Binding

**queries.ts line 15:**
```
(namespace_definition (_) @name) @isPackage
```

**Problem:**
- Tree-sitter C++ grammar: `namespace_definition` may wrap name in either:
  - Direct child: `namespace_definition identifier`
  - Or nested in qualified context
- **Should be more specific:**
  ```
  (namespace_definition (namespace_name (identifier) @name)) @isPackage
  ```

### 8.2 Swift init_declaration

**queries.ts line 8:**
```
(init_declaration) @isFunction
```

**Problem:**
- `init_declaration` has no `name` capture here
- init_declaration in tree-sitter Swift contains parameters but not a name field
- **Result:** init tagged as function but with no symbol name
- Should be:
  ```
  (init_declaration) @isInit
  (init_declaration) @name ; wrong, no name in init_declaration
  ```

Actually, Swift inits do not have names in the grammar — they're constructor methods. Tagging as `@isFunction` is acceptable, but should clarify intent.

---

## 9. Summary Table: Required vs. Provided

| Capture Type | C | C++ | C# | PHP | Ruby | Swift |
|---|---|---|---|---|---|---|
| name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| source | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isFunction | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| isClass | N/A | ✗ | ✓ | ✓ | ✓ | ✓ |
| isStruct | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| isEnum | ✓* | ✗ | ✓ | ✓ | ✗ | ✗ |
| isInterface | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| isMethod | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| isImport | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isAsync | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isAbstract | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isStatic | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| isExported | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| heritage | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| kinesis_target | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pulse_assignment | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| comment | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Legend:** ✓ = captured, ✗ = missing, * = misclassified (e.g., C's enums as @isStruct)

---

## 10. Severity & Impact Matrix

| Issue | Severity | Languages | Impact |
|-------|----------|-----------|--------|
| Missing `@isImport` on all imports | **CRITICAL** | All 6 | Imports not distinguished; dependency graph broken |
| Missing `source` capture | **CRITICAL** | All 6 | Import paths invisible; resolution impossible |
| Missing Struct (C++) / Enum (C++, Ruby, Swift) | **HIGH** | C++, Ruby, Swift | Type definitions invisible |
| Missing `@isAbstract` / virtual detection | **HIGH** | C++ (critical), others | Interface contracts not tracked |
| Missing visibility markers | **HIGH** | C, C++, PHP, Ruby | Access control not modeled |
| Missing async detection | **MEDIUM** | C#, PHP, Swift, C++ | Concurrency control flow incomplete |
| Missing property/computed property distinction | **MEDIUM** | C#, Swift | State access patterns confused |
| Missing trait/module/protocol distinction | **MEDIUM** | PHP, Ruby, Swift | Composition patterns lost |
| Duplicate query rules | **LOW** | PHP, Ruby | Performance, clarity |

---

## 11. File-by-File Violations

### Critical Issues (Must Fix)

**c/queries.ts:16**
```
Line 16: (preproc_include (_) @name) @isPackage
```
- Add: `@isImport` marker and separate `@source` capture
- Status: Missing `isImport`, missing `source`

**cpp/queries.ts:15, 28**
```
Line 15: (namespace_definition (_) @name) @isPackage
Line 28: (preproc_include (_) @name) @isPackage
```
- Add: `@isImport` marker and `@source` capture
- Add enum capture
- Add virtual method detection
- Status: Missing `isImport`, missing `source`, missing `isEnum`, missing `isAbstract`

**csharp/queries.ts:6, 39**
```
Line 6: (field_declaration ...) — misses property_declaration with getter/setter
Line 39: (comment) @comment — marked as `@docs` but should be `@comment`
```
- Add property_declaration with accessors
- Add async detection
- Add visibility markers
- Status: Missing property accessors, missing `isAsync`, missing `isAbstract`, missing `isStatic`, missing `isExported`

**php/queries.ts:7, 31**
```
Line 7 & 31: Duplicate (assignment_expression ...) rule
```
- Remove duplicate
- Add `use` statement capture
- Add `@isImport` marker
- Status: Duplicate rules, missing `isImport`, missing `source`, missing `use` capture

**ruby/queries.ts:31-32**
```
Lines 31-32: Duplicate (call method: ...) @kinesis_target
```
- Remove duplicate
- Add `require`/`require_relative` capture
- Separate module from struct
- Add visibility markers
- Status: Duplicate rules, missing `isImport`, missing `source`, missing require capture

**swift/queries.ts:missing entire sections**
```
Complete absence of:
- struct_declaration
- enum_declaration
- protocol_declaration
- extension_declaration
- typealias
```
- Add all primary type definitions
- Status: Missing multiple primary definitions

---

## 12. Recommendations

### Immediate (Blocking Dependencies)

1. **All languages:** Add `@isImport` and `@source` captures to all import/include/use/require statements
2. **C/C++:** Fix include directive capture with `@source`
3. **PHP:** Remove duplicate line 31
4. **Ruby:** Remove duplicate lines 31-32

### Short-term (Type Coverage)

1. **C++:** Add enum, virtual method, operator detection
2. **C#:** Add property accessors, async detection
3. **PHP:** Add trait marking, use statement capture
4. **Ruby:** Add require capture, visibility markers
5. **Swift:** Add struct, enum, protocol, extension, typealias captures

### Long-term (Modifier Coverage)

1. All languages: Implement `@isAsync`, `@isAbstract`, `@isStatic`, `@isExported` query captures
2. All languages: Implement language-specific heritage markers
3. Create capture validation tests per language

---

## Files Audited

- `/src/lib/core/parsing/languages/c/queries.ts` (26 lines)
- `/src/lib/core/parsing/languages/c/extractor.ts` (57 lines)
- `/src/lib/core/parsing/languages/c/resolver.ts` (31 lines)
- `/src/lib/core/parsing/languages/cpp/queries.ts` (39 lines)
- `/src/lib/core/parsing/languages/cpp/extractor.ts` (63 lines)
- `/src/lib/core/parsing/languages/cpp/resolver.ts` (31 lines)
- `/src/lib/core/parsing/languages/csharp/queries.ts` (41 lines)
- `/src/lib/core/parsing/languages/csharp/extractor.ts` (73 lines)
- `/src/lib/core/parsing/languages/csharp/resolver.ts` (27 lines)
- `/src/lib/core/parsing/languages/php/queries.ts` (39 lines)
- `/src/lib/core/parsing/languages/php/extractor.ts` (62 lines)
- `/src/lib/core/parsing/languages/php/resolver.ts` (27 lines)
- `/src/lib/core/parsing/languages/ruby/queries.ts` (37 lines)
- `/src/lib/core/parsing/languages/ruby/extractor.ts` (61 lines)
- `/src/lib/core/parsing/languages/ruby/resolver.ts` (31 lines)
- `/src/lib/core/parsing/languages/swift/queries.ts` (25 lines)
- `/src/lib/core/parsing/languages/swift/extractor.ts` (63 lines)
- `/src/lib/core/parsing/languages/swift/resolver.ts` (27 lines)

**Total:** 18 files, ~563 lines of tree-sitter queries and resolvers.

---

## Audit Conclusion

**Status:** All six languages have **incomplete query coverage**. Critical gaps include:
1. Missing `@isImport` and `source` captures (all languages)
2. Missing secondary type definitions (enums in C++/Ruby/Swift, structs in Swift, protocols in Swift)
3. Missing modifier detection (`@isAsync`, `@isAbstract`, `@isStatic`, `@isExported`)
4. Missing module/trait/protocol distinction (PHP, Ruby, Swift)
5. Semantic misclassifications (enums as structs, modules as structs, traits as structs)

**Blockers for production use:**
- Import dependency graph will be incomplete
- Many symbol types will be invisible to reflector
- Type semantics (class vs. struct, protocol vs. class) will be confused

**Recommendation:** Prioritize adding `@isImport` and `source` captures across all languages first, then systematically add missing type definitions per language.

