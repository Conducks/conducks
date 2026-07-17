# Agent 03 — Wave 8: LC1 (Go) + LC2 (Rust) Language Constructs

**Date:** 2026-06-21
**Task:** Add missing language constructs for Go and Rust query files

## LC1 — Go: goroutine and channel capture

**File:** `src/lib/core/parsing/languages/go/queries.ts`

Added 4 patterns before the HTTP Handlers section under `--- Infrastructure ---`:

- `(go_statement) @isInfra` — goroutine invocations
- `(channel_type) @isInfra` — channel type declarations
- `(select_statement) @isInfra` — select statements (concurrency control flow)
- `(call_expression function: (identifier) @source (#eq? @source "make") arguments: (argument_list (channel_type))) @isInfra` — make with channel

Note: `go_statement` was already captured as `@isConcurrent` at line 96 (execution logic section). The new `@isInfra` tag is additive — both captures coexist.

## LC2 — Rust: lifetime and generic parameter capture

**File:** `src/lib/core/parsing/languages/rust/queries.ts`

Added 3 patterns before the existing `--- Implementation Blocks ---` entry:

- `(lifetime) @isProperty` — lifetime annotations (`'a`)
- `(type_parameters (constrained_type_parameter) @isProperty)` — generic bounds (`T: Clone + Send`)
- `(impl_item trait: (_) @source type: (_) @isHeritage) @isInfra` — trait implementations

## Type check

`npx tsc --noEmit` — clean, no errors.
