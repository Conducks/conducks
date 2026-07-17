# Wave 8 — Agent 02: GN6 Python MRO-Aware Scope Resolution

**Date:** 2026-06-21
**Task:** GN6 — Python MRO-aware scope resolution
**File:** `src/lib/core/parsing/languages/python/resolver.ts`

## Status: COMPLETE

## What was done

Added MRO-aware scope resolution to `resolver.ts` without touching the existing `PythonResolver` (import path resolution) logic.

### New exports added

1. **`buildMRO(className, baseClasses, classMap)`** — Standalone function implementing simplified C3 linearization (left-to-right DFS with deduplication). Always appends `'object'` as the final entry.

2. **`resolveMethodInMRO(methodName, mro, methodIndex)`** — Walks an MRO list and returns the first class that defines the given method name.

3. **`PythonMROResolver`** — Stateful class that:
   - `addClassHeritage(className, baseClasses)` — registers `class Foo(A, B):` → `{Foo: [A, B]}`
   - `addClassMethods(className, methods)` — registers methods directly defined on a class
   - `getMRO(className)` — returns full MRO list for a class
   - `resolveMethod(className, methodName)` — resolves method to defining class via MRO

### MRO example

```python
class A: pass
class B: pass
class Foo(A, B): pass
```

`getMRO('Foo')` → `['Foo', 'A', 'B', 'object']`

If `A` defines `save` and `B` also defines `save`, `resolveMethod('Foo', 'save')` returns `'A'` (correct per Python MRO).

## TypeScript check

`npx tsc --noEmit` — no errors, no output.

## Non-changes

- `PythonResolver` (import path resolution) — untouched.
- `PythonExtractor`, `PythonBindings`, `PythonProvider` — untouched.
- No new files created; augmented existing `resolver.ts`.
