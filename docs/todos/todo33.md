# todo33 — prune's orphan precision on a multi-service subject
Status: todo
- Acceptance: a sampled orphan check on mentorseed reaches the precision conducks already has, or each surviving class of false positive is named with its cause.

## Context

`prune` was measured on conducks and the result generalised (ADR 0092): 13 orphan findings, all 13
true. mentorseed had **144 orphans and 118 unused exports** and had never been examined on its own
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

- [ ] Recognise an interface AUGMENTATION (`declare module` + a same-named `interface` body) as a
      reference to the original declaration, so declaration merging stops reading as dead code
- [ ] Re-sample 18 orphans on mentorseed and MEASURE the precision change, with the grep scoped as
      Phase 0 requires
- [ ] Re-check conducks: it reads 13/13 today and must not fall
