<!-- description: Putting a feature behind one public door and cleaning behind it — boundary rules, dead code, doc comments, tests that bite under mutation, and the order to do it in. Use when restructuring a module, hardening an area before changing it, splitting a file that has grown too large, or when a change means checking a dozen call sites. -->

# conducks-feature-clean

**One door per feature. Clean behind it. Leaves first.**

Needs no conducks — 14 of these 16 rules are about module boundaries and testing discipline, and
apply to any language. The two that name conducks say so.

Every rule below has a failure behind it. A rule with no failure is a preference, and preferences are
not in this file.

---

## The four that always apply

Everything else is situational. These are not.

**Numbers are ADR 0150's and never change.** Fourteen citations across the todos, the clean log and
`conventions.md` address these rules by number, so the tiering here regroups them and renumbers
nothing — a citation that silently points at the wrong rule is worse than no citation.

### Rule 1 · One door

Outside code imports a feature only through `<feature>/index.ts`. The feature's own files and its own
tests may reach internals; nobody else may.

*Why.* A feature reachable at many paths cannot be changed — every edit means checking every
importer. Measured: one parsing module was imported from outside at **24 separate files**, which is
why its two largest files sat at 1,676 and 1,120 lines. Splitting either meant reading two dozen call
sites, so nobody ever did.

### Rule 2 · A test enforces the door, not a habit

A gate fails on any import that reaches past a door. It reads the FILES, resolves relative
specifiers, and covers tests as well as source.

*Why.* Measured on one feature: a `@/`-shaped grep said **8** importers. Rewriting those left two
more reaching in relatively. The gate then found two more still, spelled `../git/...` — containing
none of the searched string. **The real count was 12, and three greps had missed a third of them.**
It happened again on the next feature: a rewrite reached 21 files, the gate named three more.

A text search shaped like one import style cannot see the others.

### Rule 10 · Every test must bite

Every new test must FAIL against a deliberately broken version of the thing it covers. A test that
passes either way is deleted, not kept.

*Why.* Tests written to document behaviour pass on code that does the opposite. Measured repeatedly:
four fixture entries written in one session passed with their own fix disabled. One "coverage" test
of a path helper passed with the entire feature deleted.

**A mutation that reports no failure is first a claim about the mutation.** One `perl` substitution
silently failed to match a template literal, so the "mutation" never applied and the test was nearly
recorded as vacuous. Assert the anchor exists before believing the result.

### Rule 16 · Cleaning is not fixing

Behaviour does not change during a clean. A fix is its own commit with its own measurement.

*Why.* A commit that reorganises AND changes behaviour cannot say which change moved which number.
Twice in one session a fix was built before its counter-case was measured, and both had to be
reverted — one of them would have made a stale answer permanent.

---

## The boundary rules

**Rule 4 ·** A door exports operations and types. Never mutable state, never a singleton a caller can
mutate.

> **This rule has failed on every feature it has met.** Two process-wide sinks — a git anchor and a
> logger — are each genuinely process-wide, and the second's static flag is static ON PURPOSE: a
> per-instance flag silenced four of five boot lines and missed the fifth. Carry it as an open
> question, not a rule, until something passes it.

**Rule 5 ·** A type two features share moves to a shared contracts layer. It does not travel through a
door.

**Rule 3 ·** Inside is private — a feature's own files and its own tests may reach its internals, nobody else may. A feature never reaches another's internals to "just get one thing". Ask the door, or move
the thing to contracts.

---

## The code rules

**Rule 6 ·** Every file, class and exported function carries a comment saying WHY it exists — not what the
line does. Variables and parameters are exempt.

> *Conducks-specific reason, and a good one anywhere:* the comment above a symbol is harvested into
> that symbol's node, so an uncommented symbol answers nothing when anyone asks what it is for.

**Rule 6, second half ·** A comment that contradicts its code is WRONG, not stale. Fix it in the change that revealed
it.

*Why.* One comment stated that a duplication "was written out three times… once per method" as
though removed. It was still there, four times.

**Rule 7 ·** No dead code — justified by READING, not by a tool.

*Why.* A dead-code detector measured at 140 of 245 on the largest subject, so silence from it is not
evidence. And reading changes the answer: on one feature the two methods that looked deadest had real
callers, while the one that looked safe to delete was held by a security test.

**Rule 8 ·** Every line traces to a purpose. No speculative flexibility, unused parameters, unreachable
branches.

**Rule 9 ·** No duplicated logic across files.

---

## The test rules

**Rule 10, first half ·** Every claim the door makes has a test.

**Rule 12 ·** Leaves are tested directly from INSIDE the boundary; outside behaviour only through the door.

**Rule 11 ·** Adversarial by default: empty · huge · unicode · duplicate ids · case-collision · cycle ·
self-reference · wrong order · re-entry · the dependency absent entirely.

*Why.* The cases that find defects are the ones nobody builds a fixture for. On one feature the new
adversarial suite covered *no binary at all*, *an empty answer*, *a name containing the path
separator*, *a response that is not the expected shape* — none of which nine existing suites touched.

**Rule 15, and stated with it ·** A test asserts the claim the code actually makes, not a stricter one that is easier to
check. State what the test did NOT cover, beside the number.

*Why.* A checker that scores a stricter claim reports failures that are not failures, and one that
scores a looser claim reports a pass that is not a pass. Both read as rigour.

---

## The process rules

**Rule 13 ·** Leaves first. A unit is untouched until everything it depends on is done — and this applies
to the FIXES as much as the features. Injecting into a file that has no tests yet is how a regression
becomes unattributable.

**Rule 14 — one unit per commit**, in order: read → door → clean → tests → gates → log.
**Rule 15 — gates after every unit**: the full suite, every oracle or benchmark the project has, typecheck,
lint. All green, or the unit is not done.

---

## The order, and what "done" means

```
0  READ the whole thing. List every claim it makes, including what it promises on failure
   Measure which public symbols have no caller — and for each, say whether it is dead,
   superseded, or a capability nothing consumes. They have different answers
1  THE DOOR, and the gate that holds it
2  CLEAN behind it — docs, dead code, contradicting comments
3  MAKE IT BREAK — adversarial cases, each mutation-tested
4  CLOSE — gates, log, and the rule table stated per rule
```

**Done is not "the clean finished".** State every rule as PASS, n/a, or OPEN with its reason. A
feature that passes 12 and defers 2 with a named blocker is finished honestly; one summarised as
"done" is not.

Two habits that carry the whole method:

- **Measure before deciding, and measure the counter-case in the SAME run.** Asking only about the
  symbol you expect to change reads as a clean success while the other half is broken.
- **Read the method whose name you are trusting.** One function called `save()` wrote no data at
  all — it wrote metadata and a marker row. Two guesses were made about why a write did not stick
  before anyone spent the minute reading it.
