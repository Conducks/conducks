# 0090 — a shim is not where the code lives
Status: Accepted
- Date: 2026-08-01
- Builds: 0071, 0082, 0084
- Enforced by: the oracle fixture (CONDUCKS/oracle, `EXPECTED.md` committed before the first run) — T07b shadowed receiver, T08 renamed re-export as a type, T10 barrel-republished function

## Context

The first controlled fixture this project has ever had. 36 hand-written TypeScript files, 28 planted
traps, and the expected answer for every one written down and COMMITTED BEFORE conducks was run
against it. That order is the whole point: an answer read first and judged afterwards is an answer
rationalised, which had already happened twice in one day.

It scored **10/14** on resolution and found four things no existing gate could see. Three were real
defects; the fourth is the reason a scorecard has to be honest about how it passes.

**A shadowed local resolved into the wrong class (T07b).** A function declaring its own
`client = new SmtpClient()` answered `HttpClient.fetchIt` — a different class in the same file.

**And T07a "passed" for the wrong reason.** Neither `client` existed as a node, so no type was read
for either; the method-name fallback picked the first `fetchIt` and happened to be right. A test that
passes by coincidence teaches nothing, and a scorecard that counts it as a pass is lying.

**A barrel node is a dead end.** `export { OrderRepo as Repo }` mints a real node for `Repo`, so an
edge pointing at it does not dangle and nothing looked further — but `Repo` DEFINES nothing. An
impact query answered from the shim misses the file that actually changes, and a member lookup on it
finds no members at all.

## Decision

**Follow a shim to the thing it stands for. And the innermost declaration wins.**

Three rules, each true of TypeScript rather than of this fixture:

1. **A variable that IS a `Registry` has a relationship to it**, emitted as a real CONSTRUCTS edge.
   The obvious alternative — keep every variable node — would have been OVERFITTING: `pruneTaxonomy`
   drops an edgeless ATOM deliberately (ADR 0012/0013, measured, because emitting every local
   variable floods the graph). Giving the variable a genuine relationship makes the EXISTING rule
   keep it, and only for variables whose type was actually read.
2. **Innermost scope first.** The call target carries its receiver unscoped, so the linker tries
   `<file>::<callerScope>.<receiver>` before `<file>::<receiver>`. That is the language's shadowing
   rule, not a heuristic.
3. **A pure alias is not a destination.** A node carrying an outgoing ALIASES edge and owning no
   members of its own is a re-export; edges pointing at it are rebound to what it aliases, and a type
   lookup follows the same hop before deciding a member does not exist. "Pure alias" is decided by
   STRUCTURE — an alias edge, no members — never by a name pattern.

## Consequences

- The fixture went **10/14 → 13/14**. The remaining failure is stated, not smoothed: a WILDCARD
  re-export (`export * from './money.js'`) mints a node with no alias edge at all, so there is
  nothing to follow. The named forms carry one; the wildcard does not.
- **The overfitting guard, measured on two subjects nobody wrote for this fixture:** conducks
  1,205/1,205 and mentorseed 1,314/1,314 member-call edges still verify 100% against SOURCE. That is
  the number a bad fix would have broken, and it is why the fixture cannot be trusted alone —
  I wrote it, so passing it only proves I fixed what I already knew about.
- **A rise in the dangling rate found a second defect.** The first version of rule 1 emitted 128
  dangling CONSTRUCTS on mentorseed — 65 `Date`, 22 `Set`, then `RegExp`, `Map`, `FormData`. All
  built-ins: `new Date()` genuinely makes the variable a Date, and Date is genuinely not a project
  node. Pointing built-in types at their global id — the treatment calls to built-ins already get —
  took the rate from 0.989% back to 0.556%. Visible only because the rate and the count were read
  together (ADR 0077).
- **The first attempt at rule 1 was itself wrong** and the fixture caught it: the edge used the bare
  name as its source, so both `client` edges landed on the module-level node and the local one,
  left edgeless, was pruned anyway. Found by re-running, not by re-reading.
