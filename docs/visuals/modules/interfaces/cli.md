# interfaces/cli — the command surface

**Layer:** interfaces. It is *meant* to import composition only, and it does import another interface
exactly once, legally: `mirror.ts:3` pulls `initGlobalMirror` from `interfaces/web` — a launcher edge,
not logic coupling (ADR 0005, encoded as `cli → web`).

**What it actually does, today:** 19 imports across 14 command files reach past the registry straight
into `@/lib/domain/*` and `@/lib/core/*` (`chronicle-interface`, `persistence`, `docs-grammar`,
`sentinel`, `gateway-service`, `linker-federated`, …). The encoded contract allows cli → composition,
contracts and web only, so each of those is an illegal downward reach. They are not caught because the
layer rule is not loaded ([sentinel](../domain/governance/sentinel.md)). Treat "imports
composition only" as the target state; when you touch a command that does otherwise, route it through
the registry instead of adding another one.

**Responsibility:** argument parsing, output formatting, exit codes, and the one-line lifecycle of
opening and closing the vault. 38 commands, one file each.

**Boundaries:** a command holds no analysis logic, and it never loads policy or config itself. If a
command computes something rather than asking a service for it, that computation belongs in domain.
Commands are meant to be thin enough that reading one tells you which service does the work. The
standing exception is `audit.ts`, which loads the sentinel policy file itself; that is how it managed
to evaluate an empty rule set while printing a pass
([sentinel](../domain/governance/sentinel.md)).

**Deferred / not built:** commands take symbol IDs, not file paths. `conducks impact <symbolId>`
resolves a bare name via `resolveSymbol` but rejects a path, since a path has no `::`. Accepting a
path is a small, unbuilt convenience — the error already points at `conducks query` to find valid
IDs.

## Why every command imports the registry for typing only

Each command implements the `ConducksCommand` contract and receives the wired registry. The import
exists to type the handler, so TypeScript erases it — which is why the registry's fan-in looked like
a hub overload and was not (see [registry](../registry.md)). This is the intended shape.

## Every MCP tool is a CLI command, and they mirror

ADR 0148. The rule is one-directional: `mirror`, `setup` and `install-hooks` have no agent audience and
stay CLI-only, but an agent must never be able to ask something a person cannot — the CLI is where a
person checks what the agent did.

"Mirror" means the same input yields the same ANSWER, not that the argument parsers look alike.
`--json` is the comparison point, because it is this surface's machine output and should carry the
same data the tool returns. Rendering differs by design: `context` prints source lines here and a token
budget there.

Enforced by `tests/architecture/paired-surfaces.test.ts`, deliberately weakly — one shared
`registry.*` accessor per pair. A call-graph version would fail on legitimate presentation differences
and get switched off; every defect this rule was written for violates the weak form anyway.

**Judge capability, not parameter lists.** The first audit compared `inputSchema` properties against
`usage` strings and reported `audit` as missing four modes; every one already had a CLI home under a
different command name (`conducks advise`, `conducks guard`). One surface grouping five things under
one tool while this one spreads them across three commands is a layout difference, not drift.


## Output is a product surface

These commands are the primary way a human or an agent meets conducks, so a false finding is more
expensive here than a missing one. Two habits follow: a finding that cannot be trusted should not be
printed at all (see evolution's STALE_IMPORT), and any command that reports structure should be
run against a **fresh** graph before its numbers are quoted, because `analyze` is incremental and
stale results look identical to real ones.
