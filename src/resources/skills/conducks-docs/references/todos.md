# conducks-docs · todos

Contents: §6.7 the todo — shape, `- Depends:`, the phase as the unit · §6.8 what a task says, the
hypothesis, three failures and their homes · §6.9 the unsolved problem lives in Phase 0 · §6.10 how to
size, group, divide, and close.

Open this when writing a todo, sizing one, putting an unanswered question somewhere, or closing one.

### §6.7 `todos/todoNN.md`

```markdown
# todoNN — <title>
Status: todo | doing | done | blocked
- Acceptance: one line, testable — the whole todo's done-condition
- Blocked by: external cause, when no phase explains it        OPTIONAL

## Phase 1 — <title>
- Builds: NNNN            the ADR this phase implements
- [ ] open task
- [x] done task

## Phase 2 — <title>
- Depends: todoNN#P1      the phase that must finish first — same tree only
- [ ] open task
```

**If `- Acceptance:` will not fit one readable line, the todo is two todos.** It states when the WHOLE
file is done, so several independent outcomes joined by "and" is a sizing signal (§6.10). Where the
outcomes genuinely belong together, name the shared condition rather than listing each: "no job is
stuck, retried or slow to poll" beats three clauses with numbers in them, and the numbers live in the
phase tasks that prove them.

**`- Depends:` stays inside its tree.** It takes a bare `todoNN#PN`, never a qualified
`app:todoNN#PN`. Cross-service coupling goes through a root epic (§6.10) and nowhere else — two paths
to the same fact would disagree, and an inline cross-tree dep is invisible from the other tree, so one
side ships without knowing.

**The phase is the unit of linkage.** One todo may serve several decisions or none; one ADR may be
built across phases in several todos. Keep a phase to one coherent chunk with one owner ADR or none —
serving two decisions means it is two phases. Phase numbers are unique in a file; `todoNN#PN` is an
address others point at.

**State is derived.** Checkbox = task state. Phase state = its checkboxes. Blocked = an unmet
`- Depends:` or a stated `- Blocked by:`. An ADR's build state = the phases claiming it plus
`- Enforced by:`. Percent done = checked ÷ total. `Status:` is your claim, and lint compares it
against the checkboxes. Find every slice of an epic with `conducks docs-status`, or
`grep -rln "todoNN" */docs/`.

**A done task carries a test that could have failed** (§6.6 applies the same criterion to an ADR). A
test with no assertions reads as coverage and is worse than none.

**A failing, skipped or disabled test carries a `todoNN#PN` reference saying who owns it.**
"Pre-existing" on its own is not a label, it is a decision to tolerate the red — make it an explicit
one, written down, rather than absorbed silently by whoever notices next.

### §6.8 What a task says: the PROBLEM and the PROOF, never the code

A task states what is wrong and how you will know it is fixed. It does not state which lines to
write. Whoever picks it up can read the code; what they cannot recover is why it is wrong and what
"done" means.

| write | do not write |
|---|---|
| the symptom, and where it bites | a diff, or a file to open and edit |
| the evidence it is real — a number, a `file:line`, a failing case | a guess dressed as a fact |
| what proves it fixed | "make it work" |
| the constraint that rules an approach out | the approach itself, when more than one would do |

```markdown
❌ In db-client.ts, wrap the setTimeout in a clearTimeout on line 591

✅ Every command that opens the database hangs ~5s after printing its answer.
   The close path races the close against a 5s timeout and never clears the
   losing timer, so the event loop stays alive. Measured: answer at 451ms,
   exit at 5.5s. Fixed when such a command exits in under a second.
```

**State the evidence, not the hunch.** "The store seems bloated" is not a task. "The store holds
8.7 MB of rows in 235 MB, proven by rewriting it; the two documented reclaim commands were each
measured and neither shrinks the file" is one — and it stops the next person re-running the same
eliminations.

**A task an agent cannot verify is not done, it is claimed.** Every task names what a reader runs to
check it. If nothing can be run, say so and say why, rather than leaving the reader to assume a test
exists.

**A claim about WHERE a cost, a win or a bottleneck sits carries the measurement, or opens with
`UNMEASURED:`** and says what to time first. A confident sentence reads as knowledge even when it is a
guess, so it goes in unmarked and the next person optimises the half it named. If checking is cheaper
than the work being planned, check first. A claim that genuinely cannot be checked yet is a Phase 0
question (§6.9), not a premise inside a build phase.

**A todo is a HYPOTHESIS, and how it ends is the finding.**

`- Acceptance:` states an outcome. The phases state what you believe will produce it. That belief is
a hypothesis, and closing the todo tests it. Three ways it can end, and only one of them is silent:

| the tasks ran and | the hypothesis was | what the record owes |
|---|---|---|
| the acceptance was met, nothing surprising | correct | **nothing.** Checked boxes are the whole record |
| the acceptance was met, but it took more or other than the tasks said | incomplete | prose under the phase: what the tasks missed, and what it actually took |
| the acceptance was met a different way entirely | wrong | `[-]` the task with its reason, then write the task that DID work, in the same todo |

**Silence is a real answer.** Most work is straightforward and a clean run needs no narrative — a
paragraph under every finished phase is noise, and noise is how a convention gets ignored. Prose is
owed when the hypothesis did not hold, and only then.

For the third row, keep the eliminations beside the outcome they explain rather than closing quietly
and opening a new file: drop the task with `[-] … — dropped: <reason>` (§5.2) and add the task that
worked to the same phase, so the file reads as what happened.

```markdown
## Phase 2 — make the daemon reachable
- [-] provision over Improv BLE — dropped: device advertises and the browser pairs, but the wifi join
      never completes and neither side reports an error
- [x] serial flash over USB, verified by a boot log on the device

Improv cost an evening before the failure mode was clear: it fails silently on this board, so there
is nothing to debug and no reason to try it again here.
```

**Three failures, three homes, and only the first is this rule.**

| the failure was | goes to | why there |
|---|---|---|
| an attempt inside THIS job that did not pan out | prose under its phase | task-scoped; it explains the outcome it sits beside |
| an option weighed and chosen against | the ADR's `## Decision` (§6.6) | frozen, and a later reader must see the road not taken |
| a trap that will bite an unrelated job later | the owning feature note's `## Traps` (§6.3) | outlives every todo, and is anchored |

Keep a task-scoped failure out of a note's `## Traps`. It is the tempting move, and it loads a
feature's note — which a session reads before touching that feature — with detail that mattered to
one job and will never bite anyone else. `completed/` is unlinted but not lost: the file stays
greppable, which is what makes the todo the right home.

**A todo may carry a `## Context` section.** `- Acceptance:` is one line and one line cannot describe
a large job — what it is for, what it rests on, what was ruled out. Put that in a `## Context`
directly under the fields, before Phase 1. It is prose, not a phase, and nothing counts it. Write it
whenever the phase titles alone would not tell a stranger what this todo is.

### §6.9 The unsolved problem is a task, and it lives in Phase 0

Not every task is work. Some are questions nobody has answered yet, and the answer changes what gets
built. Those go in a **Phase 0** that everything below `- Depends:` on:

```markdown
## Phase 0 — decide before building
- [ ] Measure the cost of X. If it is over Nms the design in Phase 2 does not hold
- [ ] Two agents on one project: reads FAIL during a write. No solution yet — record what breaks

## Phase 2 — build it
- Depends: todo20#P0
```

A problem with no solution is written as an open task, in its own words, and REVISED IN PLACE when
the answer arrives — a task's text is not frozen. Record the problem before the answer: an unwritten
problem is rediscovered, at more cost than the note.

**A Phase 0 task is not a defect.** Leave it `[ ]` while it is unsolved; drop it only when the
question stops mattering, and say why.

**When Phase 0 chooses between designs, write only the winning phase — once it is known.** A phase
describes work that will happen. Writing both candidate designs as phases and parking one is the
trap: `[>]` means *still owed*, so the board counts a phase that will never be built as unpaid work
— the exact dishonesty `[>]` exists to prevent — and `[-]` is no better, because nothing was decided
against yet.

```markdown
WRONG                                          RIGHT
## Phase 0 — measure, then choose              ## Phase 0 — measure, then choose
- [ ] Measure direct-to-storage upload         - [ ] Measure direct-to-storage upload
                                                     latency. Under 5s at p99 → move the
## Phase 2 — fix the streaming                       upload off the server; over → fix the
- [>] ... — deferred pending Phase 0                 streaming in place. Write Phase 1
                                                     once the number says which
## Phase 3 — presigned URLs
- [>] ... — deferred pending Phase 0           (no second phase exists yet)
```

Phase 0's task carries both candidates and, **when one is known, the threshold that decides between
them** — that is what makes the question answerable rather than merely open.

**With no threshold in hand, say that.** "Under 5s at p99" reads as a number somebody chose, and the
next reader acts on it as if someone did. Write *"no threshold set yet; this measurement sets it"*
and name what the measurement must produce for the choice to be makeable. A fabricated threshold is
the guess-dressed-as-a-fact §6.8 rules out, and it looks decided.

### §6.10 How to size, group and divide

| you have | make it |
|---|---|
| one decision, one chunk of work | one ADR, one todo, phases inside it |
| one decision, work that splits by concern | one ADR, one todo, ONE PHASE PER CONCERN |
| several decisions that only make sense together | several ADRs, ONE todo — a phase per ADR, each `- Builds:` its own |
| work depending on an unanswered question | Phase 0 for the question, `- Depends:` from the phases it gates |
| codependent work across services | a root epic (below) |

**There is no sub-ADR.** A decision that needs sub-decisions is several ADRs — "one decision per
file" is what lets each be superseded on its own. The todo is what groups them: a todo whose phases
each `- Builds:` a different ADR is the epic for those decisions, and `conducks docs-status` renders
exactly that tree.

**Size a phase by what fails together.** If half of it can ship while the other half is still broken,
it is two phases. If a reviewer would have to read both halves to judge either, it is one.

**A root epic carries its open question in `## Context`, never a Phase 0.** The epic holds no work,
so it has no phase for a question to sit in. Say what is undecided, what it turns on and who owns the
answer, in prose. If the question must be tracked as work, it belongs to the slice that will answer it.

**A Phase 0 gates only what says it does.** A later phase waits for it because it carries
`- Depends: todoNN#P0`, and for no other reason. Work that does not turn on the answer — a separate
bug in the same area, a fix that ships either way — carries no `- Depends:` and proceeds immediately.

**Order phases by what unblocks what, never by how the work feels.** The board reads top to bottom
and `- Depends:` is the only thing that makes an order real.

**Codependent work across services gets a root epic — nothing else does.** An app-only fix lives in
`app/docs/todos/`. The epic is how a cross-service dependency is expressed: it holds no work of its
own, just the slice order, one checkbox per slice addressed as `tree:todoNN`, and why they are coupled.
Each slice opens with a line pointing up at the epic (`(root):todo41`), so the link is stamped at both
ends and either end can be found from the other.

```markdown
# todo41 — payouts move behind one port
Status: doing
- Acceptance: app and admin both read payouts through the port; neither writes the table directly.

## Phase 1 — the two slices, in order
- [x] app:todo42
- [ ] admin:todo43

admin lands after app: the port has to exist before admin can point at it.
```

**A slice that does not exist yet gets a description, not an address.** `- [ ] app:todo42` naming a
todo nobody has written is the invented reference §1 rules out, and here it also fails lint. Write what
the slice must achieve, and swap in `tree:todoNN` when that todo exists — the checkbox is the same
line either way:

```markdown
- [ ] billing exposes the port                 before it exists
- [ ] packages/billing:todo08                  after that todo is written
```

The epic is the one file that legitimately outlives its own addresses, because it is written first,
before anyone has picked up a slice. An ADR cannot hold this: it is frozen, and joint status moves.

**On close, in order:**

1. Say how the hypothesis ended (§6.8). Held, and the boxes are the whole record — write nothing.
   Held but cost more than the tasks said, or was reached another way — the prose and the `[-]` go in
   NOW, while you still remember, and before step 5 puts the file somewhere nothing prompts you again.
2. Promote surviving facts — a rule to the gate that can enforce it (or the owning note's
   `**Boundaries:**` where none can), a trap to that note's `## Traps`, a capability to its
   `## Features`.
3. Give the ADR an `- Enforced by:` pointing at the test that now proves it. The `- Builds:` link leaves
   the graph with the file, so without this the ADR reports as unbuilt.
4. Set `Status: done`.
5. Move the file to `completed/`.

**`completed/` is not scanned** (nor `legacy/`, `archive/`, `agent-runs/`). Two consequences:

- A file there is **no longer linted**. Open tasks → leave it in `todos/` with `Status: doing`.
- Its `- Builds:` leaves the graph, so the ADR reports **no build link** unless it carries an
  `- Enforced by:`.
