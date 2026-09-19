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

**An always-on process reports; it never fixes.** `conducks monitor` reports and exits 0 — it never
analyzes, writes to a vault, edits a doc or fails a build. Its one write is `--dismiss`: explicit,
per-module, recording the hash of the code it was checked against, and bound to an intent address
(an ADR, a todo, a path) that is verified to exist before being stored. A monitor that edits files or
blocks work gets switched off inside a week, and a switched-off monitor reports nothing — so the
useful version is strictly the one people leave running (ADR 0031).

**Uses:** takes argv from the shell and the wired registry from `composition`; each command asks the
registry for the domain service or persistence handle it needs, formats the result, and sets an exit
code. Nineteen imports across fourteen command files currently reach past the registry straight into
domain/core — an illegal downward reach the layer contract does not yet catch here (see above) —
route a touched command through the registry instead of adding another one.

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

## Features
38 commands, one file each, with no sub-notes of their own — `## Parts` would just restate the command
list `--help` already gives. Three had no capability home anywhere in `docs/visuals/modules/**` before
this note; they are listed here rather than left undocumented:

- **`conducks diff`** (`src/interfaces/cli/commands/diff.ts`) — the PR risk engine. Default mode reads the
  git working tree (staged, unstaged and untracked hunks via the shared `change-set.ts`), maps hunks to
  the structural symbols they touch, and prints an aggregated risk score plus the highest-risk symbols
  impacted. `--base <pulseId> [--head <pulseId>]` switches to a second mode entirely — a chronoscopic
  diff between two recorded pulses read from `node_history`, which has no edge history, so it reports
  node deltas only and says so rather than inventing a relationship count.
- **`conducks supply-chain`** (`src/interfaces/cli/commands/supply-chain.ts`) — surfaces the
  boundary-origin classification (ADR 0014): how much of the graph leaves the repo, split into
  trusted-unversioned stdlib versus versioned third-party, which packages carry the widest blast
  radius by importing-file count, and which are imported but never declared. Versions are joined
  live from the manifest rather than restated. It carries a name map for the cases where a Python
  import name is not its distribution name (`import yaml` ships as `pyyaml`) — without it a
  correctly declared dependency reads as undeclared, and an unknown mismatch still reads as
  undeclared, which is the honest answer for a name nothing in the tree declares.
- **`conducks link`** (`src/interfaces/cli/commands/link.ts`) — `conducks link <path>` links a proprietary
  "foundation synapse": a second project's vault the current project's federation layer can read
  across, via `registry.federation.createLinker`.
- **`conducks record`** (`src/interfaces/cli/commands/record.ts`) — `conducks record --type
  [vision|implementation|handover|todo] "content"` appends an authored note to
  `docs/<type>.md` for the current project. As of ADR 0193, `--type architecture`, `--type
  conventions` and `--type memory` (and their aliases `arch`, `convention`/`rules`, `learning`) are
  REFUSED with a non-zero exit — those three files are gone, and the command names where the content
  belongs instead (a gate, a module note's `**Boundaries:**`, or its `## Traps`) rather than silently
  writing it somewhere ungoverned.
- **`conducks setup`** (`src/interfaces/cli/commands/setup.ts`) — `conducks setup [--dry-run]` writes
  OUTSIDE the project: it syncs conducks' skills from `src/resources/skills/` into the single global
  `~/.claude/skills` (ADR 0029 — one copy serves every project; a repo-local copy would load twice),
  registers the project root in a global project registry under the user's home directory, edits the
  Claude Desktop MCP config, and
  installs the docs-lint/visuals-lint pre-commit gates behind managed markers. `--dry-run` prints what
  it would touch without touching it (ADR 0126).

## Glossary
- **mirror** (ADR 0148) — every MCP tool has a matching CLI command; both must answer identically
  under `--json`, though presentation may differ (`context` prints source lines here, a token budget
  there).

## Traps

**The installed skill is a COPY — edit the source or `npm run build` eats it.** `~/.claude/skills/
<name>/SKILL.md` is regenerated from `src/resources/skills/<name>.md` by
`scripts/sync-skills-postbuild.mjs` on every build's `postbuild` step (`package.json:44`), and
`conducks setup` (above) performs the same sync directly. Editing the installed copy looks like it
worked — the running session sees the change immediately — and the next build silently reverts it.
The two files are not byte-identical either: the source carries a `<!-- description: ... -->` comment
that the installer converts to YAML frontmatter, so a naive `diff` reports them different even when
they agree. Change the SOURCE, rebuild, and confirm the sync report says `N updated` rather than
`N current` — "current" means it decided nothing had changed.

**Project paths are not discoverable from a fresh checkout.** The `conducks` bin (`package.json:18`)
points at the BUILT CLI entry, compiled from `src/interfaces/cli/index.ts` — there is no `cli.ts` at
the source tree's root, which the built path's flatter shape can suggest. The vault is a DuckDB file
named `conducks-synapse.db` under a `.conducks/` directory at the project root, and grammars are the
tree-sitter `.wasm` files under `src/resources/grammars/`.
