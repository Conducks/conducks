# 0157 — a tool with no CLI twin is argued, not skipped
Status: Accepted
- Date: 2026-08-23
- Amends: 0148
- Builds: 0007
- Enforced by: tests/architecture/paired-surfaces.test.ts ("every MCP tool has a CLI command, or a granted reason not to", and its inverse "every granted MCP-only tool is still really MCP-only" — both run against the unfixed list first and both failed)

## Context

ADR 0148 states two claims in one sentence: **every MCP tool is a CLI command**, and **where both
exist they mirror**. Its enforcing test only ever checked the second.

`paired-surfaces.test.ts` built its pair list by looking for a CLI file named after each tool and
skipping the tool when there was none — `if (!fs.existsSync(cliFile)) continue;`, commented
*"MCP-only tool: nothing to drift from"*. That comment is true and it was standing in the place where
the other half of the rule belonged. A tool that violated claim one was silently exempted from
claim two, so the more a tool broke the rule the less the gate looked at it.

Found by reading the tool surface on 2026-08-23, not by any gate. What it had let through:
`conducks_graph_query` (`src/interfaces/tools/tools/synapse.ts:796`) runs raw SELECT against the
vault and has no CLI command anywhere — which is precisely what 0148's own text forbids, *"an agent
must never be able to ask something a person cannot, because the CLI is where a person checks what
the agent did."*

**But that gap was not an accident, and this is the part that took the longest to establish.**
ADR 0007:21 decided to KEEP `conducks_graph_query` — *"read-only, SELECT-guarded, a legitimate power
tool; removing it cuts agent capability for marginal cleanliness."* ADR 0007 pre-dates 0148 by
months, and 0148 never cites it. So the codebase held two accepted records that contradict each
other, neither stamped against the other, and the only thing keeping the peace was a test that
declined to ask.

## Decision

**An MCP tool may exist without a CLI command only where a record grants it, and the grant is named
in the test.** The exception list is code, each entry carrying the ADR that argued for it, and a
second test fails if a granted tool later gains a CLI command — so a grant cannot outlive the gap it
was written for.

`conducks_graph_query` is granted, on ADR 0007's reasoning, which this record does not overturn. It
is the one place an agent may ask something the CLI does not offer, and the trade is stated rather
than discovered: raw SELECT is a power tool whose CLI equivalent would be a SQL prompt, and shipping
one to be symmetrical would add a surface for the sake of the rule rather than for a user.

`conducks_docs` is NOT an exception. It pairs with `docs-status.ts` and only looked unpaired because
the lookup assumed the filename matches the tool name. A name difference is not a missing surface,
so the test carries a name map, without which the check would have been unusable within a week and
switched off.

**Rejected: give `graph_query` a CLI twin.** It would satisfy the rule and serve nobody — `conducks
graph-query "SELECT …"` is a worse `duckdb` shell against a vault whose schema is not a public
contract, and the ADR 0156 rule applies to reading as much as to writing: a capability that exists
to make a table symmetrical is a capability nobody runs.

**Rejected: delete the tool, per 0148's plain text.** ADR 0007 measured its value and this record has
no new evidence against it. Enforcing a rule by deleting the thing that revealed the rule was
incomplete is the wrong direction.

**Rejected: leave the skip and write the exception in prose.** That is the state this record found —
0007 already said it in prose, and the gate still could not see it. An exception a test does not read
is an exception the next reader has to rediscover.

## Consequences

- ADR 0148 is amended, not superseded: both its claims stand, and the first now has one stated
  exception rather than an unbounded silent one.
- The existence check is a real gate. Removing `graph_query` from the granted list fails the suite,
  and both new cases were run against the pre-fix list to prove they can fail.
- Any future MCP-only tool costs an ADR. That is the intended price — it is the same discipline the
  `GRANTED` array in the same file already uses for mirror exceptions, which is currently empty.
- The name map is a second thing that can rot: a renamed CLI command silently becomes an orphan
  again. Nothing catches that today beyond the existence test failing, which is the correct failure
  but names the tool rather than the rename.

Open: `paired-surfaces.test.ts` finds tools by regex over the tool files rather than by importing the
registered surface, so a tool declared in a shape the regex does not match is invisible to every
check in that file — including the two added here. The file's own first case guards the total
(`pairs().length >= 10`) but that floor was written when there were 14 tools and does not track the
count. No todo carries this yet.
