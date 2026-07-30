# 0047 — conducks trusts neither the repository it reads nor the caller that drives it
Status: Accepted
- Date: 2026-07-30

## Context

conducks is a local developer tool, and its threat model was implicitly "the user runs it on their
own code, so everything is trusted". Two of its three inputs are not.

**The analyzed repository is attacker-supplied whenever it was cloned.** `ChronicleInterface` builds
git commands by interpolating a repo-relative path into a string and running it through `execSync`,
which executes via `/bin/sh -c`:

```
git log --format="%ae" -- "${relativePath}"     chronicle-interface.ts:345
git blame --porcelain -- "${relativePath}"      chronicle-interface.ts:378
git show :0:${relativePath}                     chronicle-interface.ts:250
git rev-list --count HEAD -- "${relativePath}"  chronicle-interface.ts:306
```

`relativePath` comes from `git ls-files`. Git permits filenames containing quotes and `$()`, so a
file named to close the quote and open a subshell executes commands when anything asks for that
file's history. Cloning a repository and running `analyze` is the whole attack.

**The caller is an LLM agent, and agents are steerable by the content they read.** The
`conducks_graph_query` MCP tool advertises "Only SELECT statements are permitted" and enforces it
with `sql.trim().toUpperCase().startsWith('SELECT')` (synapse.ts:620). DuckDB's core table functions
need no extension. Verified on this vault:

```
SELECT * FROM read_text('/etc/hosts')   →  file contents returned
```

`read_csv_auto('http://…')` is the same hole pointed outward. A prefix check tests the shape of the
string, not the capability of the statement.

Two smaller exposures share the assumption. The web mirror calls `app.listen(port)` with no host, so
it binds every interface and serves `/api/synapse`, `/api/governance` and `/api/docs` with no
authentication — CORS restricts browsers, not `curl`. And `.env` files are deliberately ingested as
non-code content, so a project's secrets can reach an MCP response.

## Decision

**Repository content and caller arguments are untrusted input, and the trust boundary is drawn at
the process edge rather than at the user's intent.** Four rules, each mechanically checkable:

1. **No shell.** A subprocess is invoked with an argument array — `execFileSync('git', [...])` — never
   with a command string. Interpolating any value into a string that reaches a shell is forbidden
   regardless of where the value came from, because the audit of where it came from is the thing
   that goes stale.
2. **A SQL surface is an allowlist of what may be read, not a check on how the query starts.**
   `conducks_graph_query` accepts SELECTs against the vault's own tables and rejects table functions
   outright.
3. **A server binds loopback unless told otherwise.** `mirror` listens on `127.0.0.1` by default;
   exposing it on a network is an explicit flag with a warning, not the default that happens because
   nobody passed a host.
4. **Secrets do not leave the vault.** `.env`-shaped files may be catalogued as units, and their
   CONTENT is not stored or returned.

**Not chosen: escaping the interpolated path.** Shell-escaping is correct and it is also a thing
every future call site has to remember. `execFileSync` removes the shell, so there is nothing to
escape and no rule to remember — the safer option is also the one that needs no discipline.

**Not chosen: dropping `conducks_graph_query`.** Raw SQL against the vault is the tool's most useful
escape hatch and the only surface that answers a question nobody anticipated. The problem is the
guard, not the capability.

**Not chosen: treating the analyzed repo as trusted because "the user cloned it deliberately".**
That is exactly the reasoning that makes supply-chain attacks work. The user deliberately clones
dependencies too.

## Consequences

Every git call site changes shape. `execFileSync` takes the command and its arguments separately, so
each of the nine `this.exec(...)` calls is rewritten, and the injected `exec` seam that the chronicle
tests rely on changes signature with them. That is the cost of the rule and it is paid once.

Rule 2 narrows a capability people may already be using. A query that joins the vault against a CSV
on disk is legitimate analysis and will stop working. The allowlist should therefore be an explicit
denial with a message naming the rejected function, not a silent empty result — a denial that
explains itself is a feature request; a silent one is a bug report.

Rule 3 changes the default for an existing command. Anyone reaching the mirror from another machine
today loses that without warning, which is the correct trade but must be in the changelog rather than
discovered.

`Open:` whether `.env` ingestion should be removed entirely rather than reduced to cataloguing. The
comment at `chronicle-interface.ts:14-17` says the intent is deliberate, and no record says what the
content is FOR — nothing found in this audit reads it. If nothing does, the file type should leave
the discovery set and rule 4 becomes unnecessary. Answering it means grepping every consumer of a
unit's source, which is a wider sweep than this record. Carried by todo25#P1.
