# anchoring — writing a claim, and proving it is still true

Read this when you are about to write an anchor, fix a stale one, run a re-anchor pass, stamp, or
read what `visuals-lint` is telling you.

An anchor is a receipt. It says: *this sentence came from this exact place in the code, and you can
check me in one keystroke.* Everything here protects that promise, because a receipt nobody can check
is worse than no receipt — it looks like rigour.

## Contents

- 1 · Two levels, two anchors
- 2 · Prefer a symbol to a line
- 3 · Grammar the gate reads
- 4 · What the gate does NOT check — and what to do about it
- 5 · The stamp, and the re-anchor pass

---

## 1 · Two levels, two anchors

Matching the two altitudes in `SKILL.md` §2: a main feature and its internal steps make **different
claims**, so they carry different anchors — and they are now checked on different pages, since the
canvas carries only the first kind and every sub-feature anchor lives on a feature page.

### The main-feature anchor — on the container

**What DEFINES the feature.** Not everything it touches — the place a reader goes first to find out
what this capability is.

One of these, in preference order:

| form | use when | example shape |
|---|---|---|
| `path::symbol` | there is a function, class or const that IS the entrance | `services/voice/stt-tts.ts::startListening` |
| `path:line` | the entrance is a call site, a route table row, a registration | `src/index.ts:160` |
| `path` | the feature is one file and the whole file is the feature | rare, and usually a sign the scope is wrong |

Plus, when one exists, **the decision record that created the feature** — that is where the *why*
lives, and the why is the half a canvas cannot draw.

*Failure behind this.* Containers carried a title, a subtitle and a link, and **no anchor at all**.
Thirty-nine features on one canvas and not one of them said where it began — so every claim on the
page was checkable except the claim about what the page was divided into. A reader disagreeing with a
boundary had nothing to argue with.

### The sub-feature anchor — on the block

**Where THAT step happens.** The exact line the decision is made on, the constant is set on, the
boundary is crossed on. Then, after an em dash, the sentence that explains what the anchor shows.

```
n('ghost', 'Real speech?', 'the hallucination gate',
  'daemon.py:187-189 NO_SPEECH_PROB_MAX=0.4 AVG_LOGPROB_MIN=-0.85 GHOST_MAX_WORDS=3')
   └── the anchor ──────────┘ └── the constants that decide it ──────────────────┘
```

The anchor is not "the file this feature lives in". A block whose anchor points at a file rather than
a line is a block nobody can check, and it will read as verified forever.

## 2 · Prefer a symbol to a line

`path::symbol` survives edits above it. `path:line` does not — insert twelve lines at the top of a
file and every line anchor below is now pointing somewhere else, while still resolving perfectly.

Measured on one repo: **~32 symbol-form anchors, 11 of them stale (32%). Around 1,146 line-form
anchors, 624 stale (53%).** Small sample on the symbol side, so treat this as a direction rather than
a constant — but the direction is not in doubt, and the mechanism is obvious once stated.

So: **use `::symbol` wherever a definition exists.** Use `:line` for what has no symbol — a constant
inside a function, a specific branch, a call site — and accept that those are the ones a re-anchor
pass will keep re-reading.

**A line RANGE is a claim about a block of code**, and is right for a gate, a branch or a stanza that
has no name. `tools.ts:259-287` is a better anchor than `tools.ts:259` when the thing you are
describing is the whole stanza.

## 3 · Grammar the gate reads

The linter only reads text a page **marks as a claim** — an SVG `<title>`, an element whose class
contains `file`, `where` or `anchor`, or one carrying `data-anchor`. Ordinary prose is deliberately
not scanned, or "open `index.ts`" would fail as an ambiguous anchor and the gate would be switched off
within a week.

| written | verified |
|---|---|
| `path` | resolves to exactly one tracked file |
| `path:line` | the file still has that many lines |
| `path:from-to` | same, for the range |
| `path::symbol` | a **definition** exists |
| `NAME=value` | the file assigns `NAME` and the value still matches |

**An abbreviation matching more than one file FAILS.** It does not guess. This is the single most
common authoring error and it has already put a reader in the wrong file: one repo has two files named
`dispatch.ts` — an agent routing layer and a speech queue — and a reader following the short name had
even odds. **Write the long path** whenever a basename is not unique in the repo, and when in doubt
write it anyway.

`NAME=value` is the strongest form available and it is under-used. A threshold, a timeout, a cap, a
retry count: anchor the value, not just the line, and the gate will tell you the day someone changes
it.

## 4 · What the gate does NOT check — and what to do about it

| how a page rots | caught by |
|---|---|
| the data changed and the page did not | the drift check — byte-compares a fresh render |
| the code moved and an anchor broke | `visuals-lint` — resolves every anchor |
| the chrome drifted, or the page stopped loading its script | the renderer's own gates, which refuse to publish |
| **a sentence is false while its anchor still resolves** | **nothing. Ever.** |

The last row is the whole reason §5 exists. An anchor proves a line EXISTS. It cannot prove the
sentence attached to it is still true. One block said a call was logged first while the code logged it
third, and every anchor on it resolved perfectly.

**So a green gate is not a true page — report the two things separately**: what the gate proved, and
what a person re-read, since one block once said a call was logged first while the code logged it
third and every anchor on it still resolved.

## 5 · The stamp, and the re-anchor pass

**An anchored claim is not always just a description.** A module note's
`**Boundaries:**` line can be a binding rule, anchored like any other claim. A stale anchor under a
description is a wrong sentence; a stale anchor under a boundary rule is a rule nobody knows has
stopped being enforced. The stamp discipline below is unchanged either way, but what a broken one
costs is not.

### What a stamp is

`conducks visuals-lint --stamp [page]` records a content hash for every anchor on the page. The store
is a JSON file under the project's tool directory, keyed by page → anchor → hash.

A later run compares. An anchor whose cited code has changed since the stamp is reported as a
**reviewed claim citing code that changed** — not an error, not a failure, a **flag**: *nobody has
re-read this since it moved.*

**A stamp means one thing: a human re-read the code and the sentence is still true.** It is a
signature. Stamping without re-reading is forging a receipt, and it is worse than never stamping,
because the flag it clears was the only thing that knew.

### Reading the numbers honestly

Three separate numbers, and collapsing them is how a rotten page reads as clean:

```
anchors that resolve       — the gate is green
anchors flagged stale      — the code moved; nobody has looked
anchors never stamped      — nobody has EVER checked the sentence
```

Report all three, always, with the total. "1,180 anchors clean" is true and, alone, misleading when
624 of them are flagged.

`visuals-lint` prints the third one per PAGE, because a page is what you stamp:

```
⚠ 38 page(s) have NEVER been stamped — nobody has checked them
```

*Failure behind it.* The stale flag needs a stamp to compare against, so a page nobody ever stamped
raises nothing and reads exactly like a page reviewed yesterday. conducks' own repo printed
`✓ visuals-lint clean — 188 anchors across 76 page(s)` while its stamp store **did not exist**: 188
anchors resolved, zero sentences had ever been read by a person.

**A GENERATED page is not counted.** `modules/x.html` is rendered from `modules/x.md` beside it, so
demanding a stamp on both demands the same reading twice.

**Match the marker a GENERATOR writes, never a word a person can type.** The skip looks for the bold
`<b>DERIVED</b>` header every generator emits. A bare `\bDERIVED\b` was tried first and it silently
excused four pages across two repos: `architecture.html`, whose HTML comment says its SVG is derived
*and its shell is hand-maintained*, and three module notes containing the sentence "anything that
carries a DERIVED header". Each page opted itself out of the check by discussing it.

The direction of the error is the point. **A checker that errs toward excusing is worse than one that
errs toward flagging**, because a wrong flag is argued with and a wrong excuse is never seen. Prefer
the marker that is hard to write by accident, and when a page is skipped, be able to say which
generator wrote it.

**A page holding no resolving anchor is not counted either.** It cannot be stamped, so demanding one
would be a flag nobody can clear. The consequence is real and worth knowing: a long prose note that
cites no code is invisible to every number here. That is a defect in the NOTE — a note describing
code with nothing checkable in it is a note with no receipts — and the fix is to anchor it, not to
widen the count until contents pages start failing.

### When a page genuinely cannot be stamped

Some pages cite something a reader cannot verify from source — a value that only exists while a
daemon runs, a number measured on hardware. A stamp there would be a forged receipt, and leaving it
in the list forever trains everyone to ignore the list.

Declare it, with a reason, in `conducks.json`:

```json
{ "visuals": { "unstamped": {
  "docs/visuals/modules/services/voice/synth.md": "the daemon must be running to read this value, so it cannot be checked from source"
} } }
```

| rule | why |
|---|---|
| the reason is **at least 40 characters** | "wip" and "later" must not be able to silence a page |
| a page that is later **stamped** makes its own row an ERROR | the excuse outlived its cause; delete the row |
| a bad row **exits 1** | this is a CI gate, not a note — a reasonless row is the one way to switch the check off from outside |
| a bad row does **not** excuse the page | it stays in the never-stamped count; a failed excuse buys no silence |

An exemption is a claim like any other, so it is checked like one.

### Running a pass

Per feature, not per repo. A repo-wide re-anchor is a sweep, and a sweep gets abandoned at 40% with
no record of which 40%.

1. **Measure first.** Which anchors on this feature's pages are flagged, and how many.
2. **Open the file at the cited place.** Not the file — the place.
3. **Judge the sentence, not the anchor.** The anchor resolving told you nothing. The question is
   whether the block's title, subtitle and hover are still an accurate description of what that code
   does.
4. **Three outcomes, and the middle one is the point of the pass:**
   - still true → stamp it
   - **still true but now imprecise** — the line moved, a constant changed, a branch was added → fix
     the text, then stamp
   - no longer true → rewrite the block, or delete it. A block describing behaviour that was removed
     is not fixed by re-pointing its anchor
5. **Upgrade the anchor while you are there.** A `:line` that has a symbol available becomes
   `::symbol`. A bare threshold becomes `NAME=value`. This is the only moment the cost of the upgrade
   is already paid.
6. **Stamp only what you actually read**, and only that page. Then say how many you did not.

### Expect the count to go UP

A pass that re-reads a feature properly finds steps that were never drawn, so it adds blocks, and
blocks carry anchors. **Finishing with more anchors than you started with is the normal outcome of a
good pass**, and a pass that only ever shrinks the number was probably deleting rather than reading.

### Never stamp on behalf of an agent

An agent's report is a claim. If an agent re-read a file and reported the sentence still true, the
orchestrator re-reads the anchor before stamping it. A stamp is a signature and it is signed by
whoever ran the command, not by whoever did the reading.
