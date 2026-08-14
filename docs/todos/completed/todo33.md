# todo33 — prune's orphan precision on a multi-service subject
Status: done
- Acceptance: a sampled orphan check on subject-b reaches the precision conducks already has, or each surviving class of false positive is named with its cause.

## Context

`prune` was measured on conducks and the result generalised (ADR 0092): 13 orphan findings, all 13
true. subject-b had **144 orphans and 118 unused exports** and had never been examined on its own
terms — the exact habit ADR 0093 and 0094 were written about.

Sampled 18 orphans against source: **11 genuinely dead, 7 false positives.** conducks reads 13/13.
The difference is not the rule; it is what a five-service repository contains that a single package
does not.

## Phase 0 — the causes found, and a warning about the instrument

- [x] **Declaration merging is invisible.** `interface ServiceTypeMap` is DECLARED once and AUGMENTED
      in `MailService.ts` and `CatalogService.ts` with `interface ServiceTypeMap { ... }` inside a
      `declare module` block. That is a TypeScript feature with no import and no call, so nothing
      references the original node and `prune` calls it dead. It is used by four files
- [x] **A duplicated file across services reads as dead in the copy nobody uses.**
      `useProductAuth.ts` exists in BOTH `app/` and `admin/`. The app copy carries four incoming
      edges; the admin copy has none and is correctly reported. This is NOT a defect — it is the tool
      telling the truth about a copy-paste, and it is listed here because it looks like a false
      positive until the service is checked
- [x] **THE INSTRUMENT MISLED ME THREE TIMES**, which is the durable lesson. A `grep` for the symbol
      name reported: 9 uses (crossing services), then 666 (matching `.next` build output), then 1
      (correct). Every intermediate answer was confident and wrong. A verification grep must be
      scoped to the finding's OWN service and to source extensions, excluding `node_modules`,
      `.next`, `dist` and `build`

## Phase 1 — model what the language actually does

- [x] DONE. `declare module '<spec>' { interface <Name> ... }` now emits a TYPE_REFERENCE from the
      augmenting unit to `<resolved spec>::<Name>`. The specifier and the type are both written in
      the source, so this is a read. The captures carry no `is` prefix on purpose — an is-capture is
      a DEFINITION and would mint a node, and the augmenting file defines nothing
- [x] The nested `interface` still mints a node in the AUGMENTING file, which nothing references
      because nothing should. Dead-code now skips it, reading the augmentation EDGE rather than
      taking a new column — the edge already carries `isAugmentation` and already persists
- [x] RE-SAMPLED 18 orphans on subject-b: **18/18 true**, zero false positives.
      `ServiceTypeMap` no longer appears; orphan findings **144 -> 136**
- [x] conducks holds at 13 orphans, source-verified precision **99.98%**; subject-b **99.97%**.
      1,284 tests green, `audit` green

## Phase 2 — the instrument, which was wrong FOUR times

- [x] The precision figure moved from 11/18 to 18/18 without the rule changing once. Every step was
      the CHECK being wrong: unscoped grep crossed services; scoping to the service matched `.next`
      build output; restricting to source extensions still counted comments and test mocks as uses.
      The criterion that finally held is the one `prune` actually claims — **is the symbol IMPORTED
      anywhere in its own service**, not does its name appear
- [x] The earlier "11/18" in this file's own Phase 0 is left standing rather than rewritten, because
      the sequence is the finding. A verification instrument gets the same scepticism as the tool
