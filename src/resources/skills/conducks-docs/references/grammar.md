# conducks-docs · the line grammar

Contents: §5 the five primitives · §5.1 exact syntax · §5.2 the four checkbox states · §5.3 what is
not read · §5.4 what `docs-lint` fails on · §5.4.1 the module-note grammar · §5.5 what it warns on.

Open this when writing any governed line, or when lint rejected one and you want to know why.

## §5 The line grammar

Five per-line primitives, no frontmatter:

```
# Title                 one per file, first line
Status: <value>         life state, one line, before the first `##` section
## Section              a heading
- [ ] task              one of four states — §5.2
- Key: value            a field
```

### §5.1 Exact syntax the parser requires

Measured against the regexes, not inferred:

| primitive | must be | tolerated | silently NOT read |
|---|---|---|---|
| `# Title` | `#` + at least one space, first line | — | `#Title` (no space) |
| `Status: value` | **column 0**, and **before the first `## ` section** | `Status:value` (no space after colon), a blank line between it and the title | any indented `Status:`; a `Status:` after the first section, which is read as prose |
| `## Section` | exactly two `#` + a space | — | `###` (never a section — below) |
| `- [ ] task` | `-`, brackets, one of `space` `x` `X` `>` `-` | `-[x]`, `[X]`, any indentation | any other marker — it FAILS lint, it is not ignored |
| `- Key: value` | **key starts with A–Z** | `-Key:v`, indented, multi-word (`Blocked by`) | `- builds:` — a lowercase key parses as NOTHING |

A key may hold letters, digits, spaces, `.`, `/`, `-`. Start it uppercase: `- builds: 0027` is prose,
not a field, and nothing warns you.

**`Status:` has one vocabulary per file type, and a value outside it FAILS lint.** Three types carry
one; the rest have no `Status:` at all.

| file | vocabulary |
|---|---|
| `todos/todoNN.md` | `todo` · `doing` · `done` · `blocked` |
| `decisions/NNNN-*.md` | `Accepted` · `Superseded by NNNN` — an amendment is an `- Amended by:` field, never a status |
| `handover.md` | `current` · `stale` |
| everything else | no `Status:` line |

Content inside ``` or ~~~ fences is skipped entirely — examples in a fenced block never parse as real
tasks or fields.

| rule | detail |
|---|---|
| **A value is the whole line** | Applies to BOTH a `- Key: value` and a `- [ ] task` — each is read as its own single line. No continuation exists. A wrapped part is not merged in; it is lost, and lint FAILS the file for it. Put a long task on one long line, however wide. For a paragraph, use a `##` section or the prose under the tasks — prose wraps freely. |
| **Blank line after the last task or field** | An UNINDENTED prose line directly under `- [ ]` or `- Key:` is the wrap above: not merged, and lint fails. Indented continuation lines, and lines starting `#` `>` `\|` `-` `1.` `![` `<`, pass lint — but they are still not part of the value, so nothing that must be READ may live there. A multi-line bullet is fine for prose; a flush-left paragraph is not. |
| **Indenting a checkbox does not nest it** | The parser accepts any leading whitespace, so an indented `- [ ]` is a full sibling task under the same phase and counts in the phase total like every other. Indent for readability if you like; you get no hierarchy from it. Real grouping inside a long phase is a `###` heading. |
| **One key per file** | A repeated key: the last silently wins. Earlier ones are not merged, not warned. Put multiple values on one line, comma-separated. |
| **ADR relation fields read the LEADING refs only** | On `- Amended by:`, `- Supersedes:`, `- Builds:` and the other relation keys, the parser takes the four-digit refs at the START of the value and stops at the first non-ref. Trailing prose is allowed and ignored: `- Amended by: 0012, 0018 — both on checkout` is valid. A note attaching to ONE ref goes in the paragraph below; there is no per-ref slot on the line. |
| **`- Depends:` is the exception — it scans the WHOLE line** | Every `todoNN#PN` anywhere in the value is read as a real dependency, including inside trailing prose. `- Depends: todo09#P3 (todo10#P1 landed first)` silently declares TWO dependencies. Keep phase addresses out of a `- Depends:` note. |
| **Read headings match exactly** | `## Context — the measured problem` is not `## Context`; it counts as missing. Put qualifiers in the first sentence. |
| **Phase numbers are plain integers** | `## Phase 2b` matches no phase — not an error, *invisible*. Its tasks never reach `docs-status`, and `todoNN#P2b` addresses nothing. Split → next free integer + `(was Phase 2b)` in the title. |
| **`###` is not a section** | Only `## ` opens one. Tasks under a `###` count toward the enclosing `## Phase N`. This is how a long phase groups work without a nested phase. |
| **Every phase carries ≥1 checkbox** | The checkbox is the only carrier of task state. A phase without one reports `0/0 (no open task)` — which reads as "nothing to do" whether it is finished, not started, or prose. Lint fails it. |

```markdown
WRONG                                          RIGHT
- [x] moved service to packages/product        - [x] moved service to packages/product
Both apps typecheck.                           
                                               Both apps typecheck.

- Amended by: 0012 (checkout)                  - Amended by: 0012, 0018
- Amended by: 0018 (pricing)                   
  first line dropped; 0012 reads unstamped     per-ref notes go in the prose below

## Phase 1 — remove the import `[DONE]`        ## Phase 1 — remove the import
Shipped via the hook. Gate green.              - [x] setAuthInitializer hook added
                                               - [x] KNOWN allowlist emptied, gate green
```

**State is derived, never announced.** A `[DONE]` marker is a second copy of what the checkboxes
already hold, and its prose is unaddressable. Date and narrative go in the paragraph under the tasks.

### §5.2 The checkbox carries the state, and there are exactly four

A task's state lives in its marker and nowhere else — there is no `## Deferred` section, no `[~]`,
no ALL-CAPS note doing the job instead.

| marker | means | counted in the denominator | needs a reason |
|---|---|---|---|
| `- [ ]` | open — owed, nobody has done it | yes | no |
| `- [x]` | done — and provable | yes | no |
| `- [>]` | deferred — still owed, not now | **yes** | **yes** |
| `- [-]` | dropped — not coming back | **no** | **yes** |

`[>]` stays in the denominator so a todo cannot reach 100% by parking what is hard; `[-]` stops
being owed, which is exactly why it costs a reason.

**A `[>]` or `[-]` with no reason FAILS lint.** Write the reason as an em-dash clause **on the task's
own line**:

```markdown
- [>] Publish the package — deferred to a human, not an agent: publishing spends a name once
- [-] Second cache tier — dropped: the measured hit rate never justified a second tier
```

Keep the reason on the same line as the marker. An indented continuation line is legal markdown and
renders fine, but the parser reads a task's text as its own line only — so a reason pushed onto the
next line is invisible and the task fails lint as reasonless. This is the most common way the check
surprises someone.

**`[>]` is not a defect.** An unanswered question in Phase 0 is not deferred work — leave it `[ ]`.
Reach for `[>]` when the work is real, understood, and blocked on something named.

### §5.3 What is not read

**An unrecognised line is prose.** State is read only as a `Status:`, a `- Key: value`, or a `- [ ]`
— **there is no fourth way.** Emoji or `[DONE]` in a heading, strikethrough, bold or ALL-CAPS DONE,
HTML comments, indentation, a `Status:` after the first `## ` section, and any field key not listed
in this standard all parse as prose and carry nothing.

### §5.4 What docs-lint fails on

**Four types are linted:** `todos` · `decisions` · `handover` · **module notes**
(`visuals/modules/*.md`). `docs-lint` is the single gate over every authored doc: it runs these four
grammars **and invokes `visuals-lint`**, so one command is the whole docs gate and there is no second
command a session can forget. `visuals-lint` stays callable alone for the per-page `--stamp`
workflow, which is not a gate (§6.3). The canvas, the other `visuals/` pages and the soft folders are
parsed but not grammar-checked — a broken heading there fails nothing, which is why §6.13 makes a
visual carry its own provenance.

**`docs-lint` FAILS the gate on:** a missing `# Title` · a missing `Status:` on a todo, decision or
handover · a `Status:` outside its file's vocabulary · a wrapped value · a todo with no `## Phase N`
section · a todo with no `- Acceptance:` · two phases sharing a number · a phase with no tasks · a
missing or misspelled `## Context` / `## Decision` / `## Consequences` · a `- Builds:` or `- Depends:`
pointing at an ADR or phase that does not exist · a relation stamped on one end only · superseding a
record that still has open phases without `- Inherits:` · a cross-tree address naming a tree that
does not exist, or a record that does not exist in it · an unknown checkbox marker · a `[>]` or `[-]`
with no stated reason · **a `- Depends:` that crosses a tree** — it fails even when the address
resolves, because the order it claims is not one this tree can keep · **`handover.md` inside a
service tree** — it is root-only, and split across services an agent reading one tree cannot know it
is missing the rest · **any `README.md` INSIDE a docs tree**, outside `completed/` `legacy/`
`archive/` `agent-runs/` — your repository's own root `README.md` is untouched and always fine,
because the walk starts at `docs/` and never climbs above it · **a `todoNN#PN` or `ADR NNNN` written
in PROSE that resolves to nothing** — a reader follows a paragraph reference exactly like a field, and
the number is checked wherever it is written, not only in `- Builds:` and `- Depends:`. A phase in a
`completed/` todo still resolves; it is a closed record, not a missing one. It cannot see `## Phase
2b` — that is a silent gap in `docs-status` — and it cannot resolve a BARE four-digit number written
without the `ADR` prefix, because `0.05`, `1,500` and a byte count are the same shape as an id and the
rule would fail the gate on measurements · **a module note missing a required field or section, or
misspelled** — §5.4.1.

#### §5.4.1 The module-note grammar

Written out here because it is grammar-linted, same as the other three types:

| required | must be | fails lint when |
|---|---|---|
| `# <module> — <one line>` | first line, `#` + a space | missing, or `#` with no space (§5.1) |
| `**Layer:**` `**Responsibility:**` `**Boundaries:**` `**Uses:**` | present somewhere in the body, each as its own line | any of the four missing |
| `## Features` | present, even if the body says `none` | section absent entirely — an EMPTY section and a MISSING one must read as different states, so the heading itself is what lint checks for |
| `## Glossary` | present, even if the body says `none` | section absent entirely — same reasoning |
| `Status: deprecated` | on a tombstoned note only — omitted on a live one | a tombstoned note with no `Status:` line |

`## Traps` stays optional — a feature with no trap is not pushed into inventing one, and its absence
never fails lint.

**This checks that a question was answered, never how well.** A one-word `**Boundaries:** none`
passes exactly like a paragraph. Whether a note is actually complete is the completeness bar in
`SKILL.md` §8, and nothing here enforces it.

### §5.5 What it warns on

**Hygiene — true findings that break no grammar:** `Status: done` still sitting in `todos/` ·
`Status: done` with unchecked tasks · `Status: doing` with everything checked · `Status: blocked` with
neither an unmet `- Depends:` nor a `- Blocked by:` · **every task deferred and none complete** — a
deferral is not a completion · **`Status: done` with deferred tasks still in it**, because
`completed/` is not scanned and closing the file buries them · **a `progress.md`, `map.md` or
`drift.md`** — derived files, never read and never linted; ask `conducks docs-status` and move them to
`legacy/` · ADRs with no build link and no `- Enforced by:`, reported as one aggregated list rather
than one line each. A warning is the gap between your claim and the checkboxes — fix it in the same
turn, before it becomes noise you learn to ignore.
