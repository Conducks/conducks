# 0132 — an answer ends the investigation

Status: Accepted
- Date: 2026-08-04
- Builds: 0110, 0129, 0131
- Enforced by: todo39 — no test yet; this ADR states the target the work is measured against

## Context

Measured head to head against ripgrep on this repository, on the question a developer actually asks
before changing a function — *who uses `resolveSymbol`?*

| tool | time | what came back |
|---|---|---|
| `rg resolveSymbol` | 17 ms | 36 text matches: imports, comments and calls mixed, every one needs reading |
| `conducks impact resolveSymbol` | 682 ms | exactly 7 callers, all correct, each a name and a file |

Conducks is right and grep is not — 36 matches is not an answer to "who calls this". Yet a developer
still reaches for grep, and the reason is visible in the two outputs: **grep prints the line of code,
conducks prints a name.** `execute (cohesion.ts:38)` names one of seven different `execute`s in this
codebase. The reader cannot act on it, so they open the file — and once they are opening files, grep
got them there in 17 ms.

Being correct is not the product. **Ending the investigation is the product**, and today's answer does
not: it is a list of places to go look.

The line numbers of every call site are ALREADY in the vault. ADR 0110 put them there — `edges` carries
`lineNumber`, and the `lines` property holds every site, not just the first. Nothing reads the source
back at answer time.

## Decision

**An answer carries the three layers a reader needs, not one.** For "where is X used":

```
format — used in 2 files, 3 call sites

src/service.ts
  inside fetchUser()   line 4:   return format(id);
src/main.ts
  inside main()        line 4:   return fetchUser('  alice  ');    ← indirect, via fetchUser
```

FILE, the ENCLOSING FUNCTION, and **the source line itself**. The enclosing function is already what
the graph returns (ADR 0131 made that correct); the file is on the node; the line is on the edge. The
only new work is reading the line back from disk when the answer is printed.

**Direct and indirect are labelled, never merged.** Grep cannot see the indirect caller at all, and a
list that mixes them silently is a worse answer than one that omits them.

**The measure of success is not milliseconds.** It is: *can the reader decide whether it is safe to
change X without opening a file?* Conducks will not beat 17 ms and should stop trying. One answer that
ends the question beats four grep-and-read cycles, and the currency that matters for an agent is round
trips, not latency.

**Rejected: making the current output faster.** The gap is not speed, and a faster list of names is
still a list of places to go look. Rejected too: printing the whole enclosing function body — that is
a file read with extra steps, and it buries the one line that matters.

## Consequences

- The source line is read at ANSWER time, not stored. Storing code in the vault would double its size,
  go stale on every edit, and duplicate what git already holds. The cost is one file read per distinct
  file in the result — bounded by the answer's own size.
- A line that no longer exists (vault older than the working tree) must say so rather than print
  whatever now sits at that number. That is CONDUCKS-37's rule applied to a line: an answer states
  what it could not verify.
- This is the everyday sting fixed. It does not add a capability grep lacks — that is todo40 and
  todo41. It removes the reason to reach for grep first.
