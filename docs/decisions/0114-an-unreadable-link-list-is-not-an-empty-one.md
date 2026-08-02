# 0114 — an unreadable link list is not an empty one
Status: Accepted
- Date: 2026-08-02
- Builds: 0111, 0113
- Enforced by: tests/integration/features/list-link.test.ts (a corrupt list fails loudly rather than reporting none; a link whose project no longer resolves is marked; linking twice lists once) — run against the unfixed build first, 3 of 5 failed

## Context

Second command of the todo37 sweep. `list` and `link` are scored together: `link` writes
`<root>/.conducks/links.json` and `list` is its only reader, so testing either alone tests half a
feature. **4 of 7** against expectations written before either ran.

**A corrupt link list read as an empty one.**

```ts
public async getLinks(): Promise<string[]> {
  try { return JSON.parse(await this.fsMock.readFile(this.configPath, 'utf-8')); }
  catch { return []; }
}
```

One `catch` collapsed three different answers — the file does not exist, the file is malformed, the
file cannot be read — into the same empty array. Measured: with a corrupt `links.json`, `list`
printed **"No federated projects linked."** and exited **0**. The user had linked projects; the tool
reported a clean workspace and called it success.

This is the class ADR 0111 named, in its most misleading form: not merely an empty result that means
"you phrased it wrong", but one that means "your state is damaged" while reporting health.

**A link was verified once and never again.** `link()` checks the target holds a
`.conducks/conducks-synapse.db` at the moment it writes. Nothing looks again, so a project that was
deleted, moved, or had its vault cleared was listed exactly like a live one.

## Decision

**Absent and unreadable are different answers.** `getLinks()` returns `[]` only for `ENOENT`. A parse
failure, a permissions failure, or a file holding the wrong shape throws with the path and the
reason. `list` exits non-zero on it rather than printing a reassuring sentence.

**A link is checked when it is read, not only when it is written.** Each entry is resolved to one of
three states, and the human output marks each one:

| status | meaning |
|---|---|
| `ok` | the path exists and holds an analyzed synapse |
| `not-analyzed` | the path exists, the vault does not — run `analyze` there |
| `missing` | the path is gone |

**`list --json`** returns `{ workspace, links: [{ path, status }] }`.

Rejected: revalidating inside `getLinks()` — `loadLinked()` calls it on the analyze path, and making
a read do filesystem work there would put a per-link `stat` into every pulse. The check belongs to
the command that reports to a human.

## Consequences

- **4/7 → 7/7.** The regression test was run against the unfixed build first and **3 of 5 failed**.
- The "linking twice lists once" case also failed without the fix, which was not predicted — the old
  `list` had no `--json`, so the test could not even ask the question. A missing output format hid a
  behaviour nobody could check.
- Noted and NOT fixed: there is no `unlink`. `links.json` is append-only from the CLI, so removing a
  link means editing JSON by hand. That is a missing capability rather than a wrong answer, and
  inventing a command mid-sweep would be scope the measurement did not ask for.
- Two commands into the sweep, two commands with real defects, and both were in the same place: what
  a command does when its input is damaged rather than absent. Worth carrying into the remaining
  twenty-seven as a standing question — **what does this print when the thing it reads is broken?**
