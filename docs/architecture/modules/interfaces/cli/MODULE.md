# interfaces/cli — the command surface

**Layer:** interfaces. Imports composition only. Never imports another interface, with one allowed
exception: the `mirror` command launches the web server — a launcher edge, not logic coupling
(ADR 0005).

**Responsibility:** argument parsing, output formatting, exit codes, and the one-line lifecycle of
opening and closing the vault. Roughly 40 commands, one file each.

**Boundaries:** a command holds no analysis logic. If a command computes something rather than
asking a service for it, that computation belongs in domain. Commands are meant to be thin enough
that reading one tells you which service does the work.

**Deferred / not built:** commands take symbol IDs, not file paths. `conducks impact <symbolId>`
resolves a bare name via `resolveSymbol` but rejects a path, since a path has no `::`. Accepting a
path is a small, unbuilt convenience — the error already points at `conducks query` to find valid
IDs.

## Why every command imports the registry for typing only

Each command implements the `ConducksCommand` contract and receives the wired registry. The import
exists to type the handler, so TypeScript erases it — which is why the registry's fan-in looked like
a hub overload and was not (see the registry MODULE.md). This is the intended shape.

## Output is a product surface

These commands are the primary way a human or an agent meets conducks, so a false finding is more
expensive here than a missing one. Two habits follow: a finding that cannot be trusted should not be
printed at all (see evolution's STALE_IMPORT), and any command that reports structure should be
run against a **fresh** graph before its numbers are quoted, because `analyze` is incremental and
stale results look identical to real ones.
