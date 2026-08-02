# todo36 — a chain through an interface member
Status: done
- Acceptance: `s.repo.find()` resolves when `s: Spectrum` and the interface declares `repo: OrderRepo`.

## Context

`spectrum: PrismSpectrum` then `spectrum.nodes.find(...)` is readable end to end — the parameter
states its type, the interface states the member's type. Nothing read the middle step.

## Phase 0 — the estimate was WRONG by 6x, and that is the finding

- [x] BUILT: interfaces record their members and declared types (`member_types`, a real column for
      the reason the other four are), and the linker walks parameter type -> interface member ->
      member's type. Oracle **T33 passes**: `s.repo.find` reaches `OrderRepo.find`
- [x] MEASURED, and the yield is nearly nothing: **~1 edge** on conducks. The "293 reachable" figure
      that motivated this came from a loose regex (`recv\\s*:\\s*[A-Z]` anywhere in the file), which
      matched object-literal properties and unrelated annotations
- [x] The HONEST count, taken from the recorded parameter types rather than a text search: of 670
      dotted danglers, **102** are called at file scope with no enclosing function, **504** have no
      enclosing parameter of that name, **19** are typed `any`, and **45** have a real type. Not 293
- [x] A classifier that greps for a shape is a hypothesis. This one over-counted by 6x and sent a
      day's worth of work at a bucket that was not there. The recorded data — `param_types` — was
      available and would have said 45 in one query

## Phase 1 — what was kept, and what was refused

- [x] KEPT: a member typed with a PROJECT type resolves the call on it. That adds knowledge
- [x] REFUSED: a member typed as an ARRAY. `s.entries.filter(...)` really is an Array method, so an
      edge to the array global would be TRUE and contentless — every function uses Array. It
      converts a dangler into a low-information edge and moves the rate while telling nobody
      anything. Measured: it took conducks from 2 source-contradicted edges to 15. The sweep removes
      those as universal members instead, which is the honest answer (oracle T34)
- [x] Oracle T34's expectation was MINE and wrong — it asserted the array global. Corrected in place
      in `EXPECTED.md` rather than deleted, because an expectation that loses to the design is a
      finding about the expectation
