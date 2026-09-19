# conducks-docs · module notes and code comments

Contents: §6.3 the module note — where it lives, when to write one, tombstones, anchors and stamps,
the template · §6.14 code comments, which the graph harvests.

Open this when writing or changing a module note, or when deciding whether a symbol needs a comment.

### §6.3 `visuals/modules/<path>.md` — module notes

A module note is **the single authored source for a feature**. It lives inside the visuals pipeline:
the `.md` is SOURCE — authored, authoritative, it settles arguments — and where the repo declares a
generator it is rendered into the styled page a human opens from the canvas. That render is DERIVED
and is regenerated, never edited (§6.13). Without a generator the notes are plain markdown — still
anchor-checked by `visuals-lint`, just not rendered. There is no separate `docs/modules/` folder; a
repo still carrying one holds a legacy tree.

**A note's path is the FEATURE's path with container segments elided — not a mirror of the source
tree.** `conducks-visuals` §2 is the only thing that decides what a feature is; this section only
says where its note lives once that call is made. `src/lib/core/graph` is `visuals/modules/core/graph.md`
— `lib/` is elided because it is a container, never a feature, and `core` gets no note of its own for
the same reason: `core/graph.md`, `core/registry.md` and `core/utils.md` exist, `core.md` does not. A
container's overview, when one is needed, lives in whichever feature it contains is the natural entry
point.

| form | for |
|---|---|
| `visuals/modules/<feature-path>.md` | a feature at that depth (`contracts` at depth one → `contracts.md`; `core/graph/linkers` at depth three → `core/graph/linkers.md`) |
| `visuals/modules/<feature-path>/<name>.md` | a single file inside a feature whose intent needs its own note |

**Write a note when intent stops being obvious from the code, never to complete a set.** Size does not
enter into it. A sub-feature earns its own note when its intent differs from its parent's; the parent
then becomes a link-only overview. On-demand is what keeps the folder honest — a note nobody wanted is
a note nobody maintains.

**A note for a removed feature is tombstoned, not deleted.** Mark it `Status: deprecated` and leave it
linked and greppable in place. `legacy/` is the last stop for a doc nothing links into (`SKILL.md` §8),
and this one must still be found: it is where "this was removed, do not re-add it" lives, and a
warning nobody can grep is a feature somebody rebuilds.

**Anchor the claims, then stamp the review.** In a note, a backticked span with a path separator or a
`:line`/`::symbol` is a CLAIM the gate checks; a bare backticked filename is prose. Three tiers of
rot, three answers:

| tier | example | who catches it |
|---|---|---|
| the anchor no longer resolves | file moved, line past EOF, symbol renamed | `visuals-lint` — error |
| the cited code CHANGED since last read | same line, different logic | a review stamp — warn: "re-read, then re-stamp" |
| the claim is false about unchanged code | was never true | only a reader |

`conducks visuals-lint --stamp <page>` records that you re-read that page's claims against the code.
Two rules no machinery holds: **stamp only what you actually read** — a stamp is a signature, and
stamping unread claims is lying to the gate — and **clear flags before closing the todo that touched
the code**, because a flag nobody clears is wallpaper.

→ The stamp store, per-page versus bare `--stamp`, the exemption register and the three counts a run
prints are `conducks-visuals/references/anchoring.md` §5. It owns them; this section owns only when a
note is stamped and by whom.

```markdown
# <module> — <one line: what it is>
Status: deprecated              ONLY on a tombstoned note — omit entirely otherwise

**Layer:** where this module sits in the contract — the node it is on the canvas
**Responsibility:** what it owns; what it explicitly does not
**Boundaries:** the seams — what crosses in and out, and the rule at each. A binding rule that has no
  gate to live in lands here
**Uses:** what it takes from below, and what it does with it — the field the completeness bar rests on
**Deferred / not built:** designed, chosen not to build, and why — optional, not one of the four
  fields lint requires (§5.4.1)

## Features               sub-features and steps, each anchored
- [part](./graph/part.md) — one line each, or `none` when there are none

## Traps                  optional — leave it out rather than inventing one to fill it
- the thing that looks wrong and is not, or looks fine and bites

## Glossary                present even when empty — write `none`
- **term** — what it means here, if this feature is the one that defines it
```

Prose after those fields carries rejected alternatives, correctness notes, the incident that produced
a rule. Symbol maps and call lists stay out — ask `conducks trace` / `conducks impact`.

Feature = what the system offers. Module = what one part owns, refuses, assumes, breaks on.

### §6.14 Code comments are docs, and the graph reads them

A comment above a symbol is harvested and attached to that symbol's node as `doc`, joined BY LINE so
it works across every grammar — JSDoc above the declaration, a Python docstring inside the body. That
is what `explain`, `context` and the MCP tools return when someone asks what a symbol is for. An
uncommented symbol is a node with no meaning attached, and every surface that answers "what does this
do" answers nothing for it.

**Required, because each one is a node the graph will be asked about:**

| | |
|---|---|
| **file** | a header saying why the file exists and what it owns |
| **class / interface** | what it is responsible for |
| **function** | why it exists — every exported one, and any internal one whose reason is not obvious from its name |

**Not required:** variables, parameters, loop bodies, or a line restating what the line does. The
graph already reads structure; the comment carries what structure cannot say.

**A comment is held to the same bar as any other doc** (`SKILL.md` §8, "Code outranks the doc"). A
comment that no longer matches its code is WRONG, not merely stale — fix it in the change that
revealed it, because it is being served to readers as the symbol's meaning.

Write the REASON, not the mechanics:

```ts
// no: restates the code, and the graph already knows
/** Loops over the nodes and returns the ones with no incoming edges. */

// yes: says what the reader cannot derive
/** Symbols nothing references. Excludes entry points, which are invoked by
 *  convention rather than called. */
```
