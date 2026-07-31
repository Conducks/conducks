/**
 * Conducks — Docs Board 📄🔗
 *
 * The cross-file half of the docs standard. `docs-grammar` parses ONE file; this walks the tree and
 * resolves the links between files — the facts no single doc can hold: which decision a phase
 * builds, which phase another waits on, what an old ADR left unbuilt.
 *
 * Everything here is DERIVED. A phase's state is its checkboxes; blocked is an unmet `- Depends:`;
 * an ADR's build state is its linked phases plus `- Enforced by:`. Nothing in a doc restates any of
 * it (conducks-docs §Rules, "one fact, one place").
 *
 * Two severities: `lint` breaks the grammar and fails the gate; `warns` is hygiene (a done todo not
 * yet promoted, an ADR nobody linked, a `Status:` claim the checkboxes contradict) and reports only.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  GOVERNED, REL, RE, type DocType, inferType, parseBody, shape, lint,
} from "@/lib/domain/analysis/docs-grammar.js";
import { resolveDocsTrees } from "@/lib/domain/analysis/service-docs.js";

export interface DocsBoard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  todos: any[]; decisions: any[]; other: any[];
  lint: Array<{ file: string; type: DocType; errs: string[] }>;
  warns: Array<{ file: string; errs: string[] }>;
  /** ADRs with no `- Builds:` phase and no `- Enforced by:` — nothing proves they were ever built. */
  unlinked: string[];
  /**
   * Architecture notes reviewed against their module's code that have DRIFTED since (todo17 Phase 3).
   * Absent on a project with no recorded reviews.
   */
  reviews?: Array<{ module: string; moduleDoc: string; intent?: string }>;
  /**
   * Qualified addresses found anywhere in this tree's docs — `app:todo42`, `(root):todo41`,
   * `packages/core:0014`. Collected here, resolved by `crossTreeLint` once every tree is built, since
   * no single tree can know what another one holds.
   */
  crossRefs: Array<{ file: string; addr: string }>;
}

/**
 * A qualified address: a tree label, a colon, then a record.
 *
 * Numbers are PER TREE (conducks-docs §4) — `app` and `admin` may each hold a `todo123`, and they are
 * different records. So an address is unqualified inside its own tree and carries `tree:` everywhere
 * else. The tree label is the service path as conducks prints it (`app`, `packages/core`) or
 * `(root)`.
 */
const CROSS_REF = /(\(root\)|[A-Za-z][\w.\-/]*):(todo\d+(?:#P\d+)?|\d{4})\b/g;

/**
 * The agent-facing projection: open threads, rooted at the decisions that own them, plus the
 * constraints an agent must not break. NOT a copy of the docs — every entry is an address
 * (`todo09#P2`, a file path) or a state, so the agent still opens the doc it decides to act on.
 *
 * Read-once vs read-often is the whole point of `layer`: constraints (conventions, memory) are
 * loaded at session start and kept, so shipping them on every call is the bulk of the cost — on
 * conducks itself the full board is ~14.7k tokens and this is well under a tenth of it.
 */
export function agentView(board: DocsBoard, layer: "all" | "board" = "all", recentCount = 4): Record<string, unknown> {
  const phase = (p: PhaseLike) => ({
    at: p.addr, done: `${p.done}/${p.total}`,
    // Deferred stays visible even though it already left the denominator above — dropping it here too
    // would make a parked task disappear from the one surface an agent actually reads (ADR 0034).
    ...(p.deferred ? { deferred: p.deferred } : {}),
    // Blocked has two causes now: an unmet `- Depends:` (blockedBy, addresses) or a phase-level
    // `- Blocked by:` (blockedReason, prose) — a phase can be blocked by the latter with no Depends
    // at all, so blockedBy alone would silently report nothing.
    ...(p.state === "blocked" ? { blockedBy: p.blockedBy.length ? p.blockedBy : [p.blockedReason].filter(Boolean) } : { next: p.next }),
  });

  const open = board.decisions
    .filter(d => d.buildState === "partial" || d.buildState === "unbuilt")
    .map(d => ({
      adr: d.id, title: d.title, file: d.file,
      state: d.state, build: d.buildState,
      ...(d.enforcedBy ? { enforcedBy: d.enforcedBy } : {}),
      phases: (d.builtBy as PhaseLike[]).filter(p => p.state !== "done").map(phase),
    }));

  // Grouped by todo, not one row per phase: repeating the same title on every phase is pure cost.
  const unlinkedWork = board.todos
    .filter(t => !/^done$/i.test(t.state || ""))
    .map(t => ({
      todo: t.id, title: t.title, file: t.file,
      phases: (t.phases as PhaseLike[]).filter(p => p.state !== "done" && !p.builds.length).map(phase),
    }))
    .filter(t => t.phases.length);

  const handover = board.other.find(o => o.type === "handover");
  const view: Record<string, unknown> = {
    open, unlinkedWork,
    // Derived, never authored: what shipped is already carried by dated ADRs and closed todos, so
    // `progress.md` was retired rather than parsed (ADR 0024). Depth is the caller's choice.
    recent: [...board.decisions]
      .filter(d => d.date).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, Math.max(0, recentCount))
      .map(d => `${d.date} · ADR ${d.id} — ${d.title}`),
    health: {
      grammarViolations: board.lint.length,
      warnings: board.warns.reduce((a, w) => a + w.errs.length, 0),
      adrsWithNoBuildLink: board.unlinked,
      handover: handover ? { state: handover.state, title: handover.title } : null,
      // An architecture note whose module changed after it was last reviewed. An agent about to act on
      // that note must know it describes older code (todo17 Phase 3).
      ...(board.reviews?.length ? { staleModuleNotes: board.reviews.map(r => r.moduleDoc) } : {}),
    },
  };

  if (layer === "all") {
    // Compact: the rule and the gotcha, not their reasoning. Open the file when you need the why.
    const entries = (type: string, keys: string[]) =>
      (board.other.find(o => o.type === type)?.entries ?? [])
        .map((e: Record<string, string>) => `${e.name} — ${keys.map(k => e[k]).find(Boolean) ?? ""}`.trim());
    view.constraints = {
      conventions: entries("conventions", ["Rule"]),
      memory: entries("memory", ["Gotcha"]),
      note: "Rules and gotchas only. Reasons, features and architecture: open the file.",
    };
  }
  return view;
}

interface PhaseLike {
  addr: string; done: number; total: number; deferred: number; next: string | null;
  state: string; blockedBy: string[]; blockedReason: string | null; builds: string[];
}

/** Walk a docs tree, skipping archive dirs (records/superseded material is not linted). */
function walkDocs(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const fp = path.join(dir, e);
    if (statSync(fp).isDirectory()) {
      if (/(completed|legacy|agent-runs|archive)$/.test(fp)) continue;
      out.push(...walkDocs(fp));
    } else if (e.endsWith(".md") && e.toLowerCase() !== "readme.md") {
      out.push(fp);
    }
  }
  return out;
}

/** Resolve the docs dir for a target path, parse every file, then link them. */
export function buildBoard(root: string): DocsBoard {
  const docsDir = statSyncSafe(path.join(root, "docs")) ? path.join(root, "docs") : root;
  const board: DocsBoard = { todos: [], decisions: [], other: [], lint: [], warns: [], unlinked: [], crossRefs: [] };
  const sources: Array<{ file: string; type: DocType; src: string }> = [];
  for (const fp of walkDocs(docsDir)) {
    const type = inferType(fp);
    const src = readFileSync(fp, "utf8");
    const body = parseBody(src);
    const rel = fp.replace(docsDir + "/", "");
    if (GOVERNED.includes(type)) {
      const errs = lint(type, body, src);
      if (errs.length) board.lint.push({ file: rel, type, errs });
      sources.push({ file: rel, type, src });
    }
    // Read from the RAW source, not the parsed body: an epic addresses its slices in checkbox text
    // (`- [x] app:todo42`) and a slice points up at its epic in prose. Neither is a field.
    for (const m of src.matchAll(CROSS_REF)) board.crossRefs.push({ file: rel, addr: m[0] });
    const shaped = shape(type, body, rel);
    if (type === "todo") board.todos.push(shaped);
    else if (type === "decision") board.decisions.push(shaped);
    else board.other.push(shaped);
  }
  linkPhases(board);
  linkDecisions(board);
  for (const x of crossCheckDecisions(board.decisions, root)) mergeLint(board, x.file, "decision", x.errs);
  proseRefLint(board, docsDir, sources);
  hygiene(board);
  board.reviews = driftedReviews(root);
  return board;
}

/** Files that exist at most once in a repo, at the ROOT tree. */
const ROOT_ONLY = ["conventions.md", "memory.md", "handover.md"];

/** Derived output that must never be authored — what shipped is already carried by ADRs and todos. */
const DERIVED_FILES = ["progress.md", "map.md", "drift.md"];

/**
 * Shape of the tree itself, as opposed to the grammar inside its files.
 *
 * Checks what `buildBoard` structurally cannot: `walkDocs` skips `README.md` entirely, so a README is
 * invisible to every other pass, and a `conventions.md` sitting in a service tree parses perfectly
 * while being in the wrong place. Both are answered by reading the directory, not the documents.
 *
 * Returns errors (fail the gate) and warns (report only) separately: a misplaced file is a real
 * breakage, but a legacy `progress.md` inherited from before the standard should not block a commit.
 */
export function treeShapeLint(root: string, isRoot: boolean): { errs: Array<{ file: string; errs: string[] }>; warns: Array<{ file: string; errs: string[] }> } {
  const docsDir = statSyncSafe(path.join(root, "docs")) ? path.join(root, "docs") : root;
  const errs: Array<{ file: string; errs: string[] }> = [];
  const warns: Array<{ file: string; errs: string[] }> = [];

  if (!isRoot) {
    for (const name of ROOT_ONLY) {
      if (!existsSync(path.join(docsDir, name))) continue;
      // Constraints load once per session. Split across services, an agent reading one tree cannot
      // know whether it has them all — and it has no way to find out that it doesn't.
      errs.push({ file: name, errs: [`\`${name}\` is ROOT-ONLY and must not live in a service tree — move its entries to the root \`${name}\`, naming the service in each entry`] });
    }
  }

  for (const name of DERIVED_FILES) {
    if (!existsSync(path.join(docsDir, name))) continue;
    warns.push({ file: name, errs: [`\`${name}\` is derived, not authored — it is never read or linted. Ask \`conducks docs-status\` instead, and move this file to \`legacy/\``] });
  }

  // A README duplicates what the standard already says, drifts from it, and is skipped by every read —
  // so it is the one doc guaranteed to be both wrong and unnoticed.
  for (const fp of walkReadmes(docsDir)) {
    errs.push({ file: path.relative(docsDir, fp), errs: ["`README.md` is not part of the standard — the docs have no map file. Put what it holds in `features.md`, or delete it"] });
  }
  return { errs, warns };
}

/** Every README under a docs tree, skipping the archive dirs nothing links into. */
function walkReadmes(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const fp = path.join(dir, e);
    if (statSync(fp).isDirectory()) {
      if (/(completed|legacy|agent-runs|archive)$/.test(fp)) continue;
      out.push(...walkReadmes(fp));
    } else if (e.toLowerCase() === "readme.md") {
      out.push(fp);
    }
  }
  return out;
}

/**
 * Every UNQUALIFIED `todoNN#PN` and `ADR NNNN` written in prose, outside a fenced block.
 *
 * The fields are not the only place a doc points at another record. ADR 0069 wrote
 * "Carried by todo29#P3" in a closing paragraph BEFORE todo29 existed — an invented number, which
 * the standard forbids — and `docs-lint` passed, because it resolved `- Builds:` and `- Depends:`
 * and nothing else. ADR 0060 pointed at `todo23#P5` after that phase had moved. Twice in two days,
 * caught by a human both times (todo29#P4, todo22#P4).
 *
 * A prose reference is load-bearing in exactly the way a field is: a reader follows it, and one that
 * resolves to nothing costs them the search plus the time spent trusting it (conducks-docs §1).
 *
 * TWO shapes only, and the omission is deliberate. `todoNN#PN` and `ADR NNNN` are unambiguous.
 * A BARE four-digit number is not — `0.05`, `1,500`, a byte count and a year all appear in these
 * docs, and a rule that guessed which ones were ADR ids would fail the gate on measurements. So a
 * reference written as a bare `0069` is still unchecked, and that is a stated gap rather than a
 * silent one.
 */
export function proseRefs(src: string): Array<{ kind: "phase" | "adr"; ref: string }> {
  const out: Array<{ kind: "phase" | "adr"; ref: string }> = [];
  let fenced = false;
  for (const line of src.split(/\r?\n/)) {
    if (RE.fence.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    // Qualified addresses belong to `crossTreeLint`, which knows what the other trees hold. Strip
    // them first or `app:todo42#P1` is also read here as a same-tree `todo42#P1` and fails against
    // THIS tree's numbering — the exact confusion §4 exists to prevent.
    const bare = line.replace(CROSS_REF, "");
    for (const m of bare.matchAll(/\btodo\d+#P\d+\b/g)) out.push({ kind: "phase", ref: m[0] });
    for (const m of bare.matchAll(/\bADR\s+(\d{4})\b/g)) out.push({ kind: "adr", ref: m[1] });
  }
  return out;
}

/**
 * Phase addresses a prose reference may legitimately name, INCLUDING completed todos.
 *
 * `walkDocs` skips `completed/` because a closed record is not linted — but it is still a real
 * address, and ADRs cite one constantly (`todo24#P6`, `todo28#P4`). Resolving against open todos
 * alone would fail the gate on every correct reference to finished work, which is the opposite of
 * the rule's purpose.
 */
function phaseAddrsIncludingCompleted(docsDir: string): Set<string> {
  const out = new Set<string>();
  const scan = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const fp = path.join(dir, e);
      if (statSync(fp).isDirectory()) { scan(fp); continue; }
      const todo = e.match(/^(todo\d+)\.md$/);
      if (!todo) continue;
      for (const m of readFileSync(fp, "utf8").matchAll(/^## Phase (\d+)\b/gm)) out.add(`${todo[1]}#P${m[1]}`);
    }
  };
  scan(path.join(docsDir, "todos"));
  return out;
}

/** ADR ids that exist on disk, read from filenames so an unparseable record still counts as present. */
function adrIdsOnDisk(docsDir: string): Set<string> {
  const out = new Set<string>();
  const scan = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const fp = path.join(dir, e);
      if (statSync(fp).isDirectory()) { scan(fp); continue; }
      const m = e.match(/^(\d{4})-.*\.md$/);
      if (m) out.add(m[1]);
    }
  };
  scan(path.join(docsDir, "decisions"));
  return out;
}

/** Fail the gate on a prose reference that resolves to nothing — see `proseRefs`. */
function proseRefLint(board: DocsBoard, docsDir: string, sources: Array<{ file: string; type: DocType; src: string }>): void {
  const phases = phaseAddrsIncludingCompleted(docsDir);
  const adrs = adrIdsOnDisk(docsDir);
  for (const { file, type, src } of sources) {
    const errs: string[] = [];
    const seen = new Set<string>();
    for (const { kind, ref } of proseRefs(src)) {
      if (seen.has(kind + ref)) continue;
      seen.add(kind + ref);
      if (kind === "phase" && !phases.has(ref))
        errs.push(`prose names \`${ref}\`, which does not exist — never invent the number (conducks-docs §4); write "no todo carries this yet" instead`);
      if (kind === "adr" && !adrs.has(ref))
        errs.push(`prose names \`ADR ${ref}\`, which does not exist`);
    }
    if (errs.length) mergeLint(board, file, type, errs);
  }
}

/** One built tree, labelled — what `crossTreeLint` needs to resolve addresses between trees. */
export interface LabelledBoard { label: string; board: DocsBoard }

/**
 * Resolve every qualified address across all trees, and fail the ones that point at nothing.
 *
 * This is the gate that replaces global numbering. Numbers are per tree, so a duplicate across trees
 * is CORRECT and no collision check is possible or wanted. What can still be wrong is an address:
 * a wrong tree label, or a record that was renamed, moved to `completed/`, or never existed. Left
 * unchecked, `- [ ] app:todo42` in a root epic reads as real work forever.
 *
 * Runs only once every tree is built, because no single tree can see another's records.
 */
export function crossTreeLint(trees: LabelledBoard[]): Array<{ label: string; file: string; errs: string[] }> {
  const known = new Map<string, Set<string>>();
  for (const { label, board } of trees) {
    const ids = new Set<string>();
    for (const t of board.todos) {
      ids.add(t.id);
      for (const p of t.phases ?? []) ids.add(p.addr);
    }
    for (const d of board.decisions) if (d.id) ids.add(d.id);
    known.set(label, ids);
  }

  const out: Array<{ label: string; file: string; errs: string[] }> = [];
  for (const { label, board } of trees) {
    const byFile = new Map<string, string[]>();
    for (const { file, addr } of board.crossRefs) {
      const [treeLabel, record] = splitAddr(addr);
      const ids = known.get(treeLabel);
      const err = !ids
        ? `\`${addr}\` names docs tree \`${treeLabel}\`, which does not exist (trees: ${[...known.keys()].join(", ")})`
        : !ids.has(record)
          ? `\`${addr}\` points at \`${record}\`, which does not exist in \`${treeLabel}\` — renamed, moved to completed/, or never written`
          : null;
      if (err) byFile.set(file, [...(byFile.get(file) ?? []), err]);
    }
    for (const [file, errs] of byFile) out.push({ label, file, errs });
  }
  return out;
}

/** `packages/core:todo09#P2` → ["packages/core", "todo09#P2"]. Split at the LAST colon: a label may not hold one, but be explicit. */
function splitAddr(addr: string): [string, string] {
  const i = addr.lastIndexOf(":");
  return [addr.slice(0, i), addr.slice(i + 1)];
}

/**
 * Every docs tree, fully checked — the ONE builder behind `docs-lint`, `docs-status`, and
 * `conducks_docs`, so the three surfaces cannot disagree on what counts as a violation.
 *
 * Before this, `docs-lint` was the only surface running `treeShapeLint` and `crossTreeLint`;
 * `docs-status` and `conducks_docs` called `buildBoard` alone. A `conventions.md` sitting in a
 * service tree, or an `- [ ] app:todo42` pointing at nothing, failed the CLI gate but read as clean
 * from `docs-status` and from the MCP tool an agent actually queries.
 *
 * Both checks are merged into the board's own `lint`/`warns` here, not returned alongside it, so a
 * caller cannot forget to apply one and end up back in the same split.
 */
export function buildTrees(root: string, opts?: { rootOnly?: boolean }): LabelledBoard[] {
  const trees = opts?.rootOnly ? resolveDocsTrees(root).slice(0, 1) : resolveDocsTrees(root);

  const labelled: LabelledBoard[] = trees.map(tree => {
    const board = buildBoard(tree.path);
    // Where a file SITS, not what is inside it — buildBoard cannot see this.
    const shapeResult = treeShapeLint(tree.path, tree.isRoot);
    for (const s of shapeResult.errs) board.lint.push({ file: s.file, type: "prose", errs: s.errs });
    board.warns.push(...shapeResult.warns);
    return { label: tree.label, board };
  });

  // A lone tree has no other tree to address into. Running crossTreeLint anyway would read every
  // legitimate `app:todo42` written in a single-repo project as naming a tree that does not exist.
  if (labelled.length > 1) {
    for (const x of crossTreeLint(labelled)) {
      const target = labelled.find(t => t.label === x.label);
      if (target) target.board.lint.push({ file: x.file, type: "todo", errs: x.errs });
    }
  }

  return labelled;
}

/**
 * Architecture notes that WERE reviewed against their module's code and have drifted since (todo17
 * Phase 3). Belongs on the board rather than in a separate report: an authored note going stale is a
 * docs fact, and a report nobody opens is not a gate.
 *
 * Only modules with a recorded review appear. A note that has never been reviewed is not evidence of
 * anything — flagging every note on a first run would make the board noise, and the caller who wants
 * "changed since the last pulse" wants `conducks monitor`, which has the vault to answer it.
 *
 * Reads `.conducks/doc-reviews.json` and hashes files. No DuckDB, no registry, no anchor — the docs
 * layer takes no connection (CONDUCKS-24).
 */
function driftedReviews(root: string): Array<{ module: string; moduleDoc: string; intent?: string }> {
  let reviews: Record<string, string>;
  try {
    reviews = JSON.parse(readFileSync(path.join(root, ".conducks", "doc-reviews.json"), "utf8"));
  } catch {
    return [];
  }
  if (typeof reviews !== "object" || reviews === null) return [];

  const out: Array<{ module: string; moduleDoc: string; intent?: string }> = [];
  for (const [module, record] of Object.entries(reviews)) {
    if (typeof record !== "string") continue;
    const [reviewedHash, intent] = record.split("|");
    const doc = path.join("docs", "modules", module.replace(/^src\/(lib\/)?/, ""), "MODULE.md");
    // existsSync, NOT statSyncSafe — that helper answers isDirectory(), so it is always false for a file.
    if (!existsSync(path.join(root, doc))) continue;
    if (moduleHashOf(path.join(root, module)) !== reviewedHash) out.push({ module, moduleDoc: doc, intent });
  }
  return out.sort((a, b) => a.module.localeCompare(b.module));
}

/** Combined hash of the source files directly in a directory. Must match ProjectMonitor.moduleHash. */
function moduleHashOf(dir: string): string {
  const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
    ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".php", ".rb", ".swift"]);
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter(f => exts.has(path.extname(f))).sort();
  } catch { return ""; }
  const parts = entries.map(f => {
    try { return createHash("sha256").update(readFileSync(path.join(dir, f), "utf8")).digest("hex"); }
    catch { return ""; }
  });
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Resolve `- Depends:` into blocked state. A phase waiting on an unfinished phase IS blocked, and
 * the board names the blocker — a blocked item with no stated cause is a dead end for whoever picks
 * it up.
 */
function linkPhases(board: DocsBoard): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byAddr = new Map<string, any>();
  for (const t of board.todos) for (const p of t.phases) byAddr.set(p.addr, p);

  for (const t of board.todos) {
    for (const p of t.phases) {
      p.blockedBy = [];
      for (const addr of p.depends as string[]) {
        const target = byAddr.get(addr);
        if (!target) { mergeLint(board, t.file, "todo", [`\`- Depends: ${addr}\` points at a phase that does not exist`]); continue; }
        if (target.pct < 100) p.blockedBy.push(addr);
      }
      // A phase-level `- Blocked by:` blocks ON ITS OWN — todo09#P3 is blocked on a network advisory
      // database with no `- Depends:` to express that, and the other 21 tasks in the same file are not
      // blocked at all (ADR 0034), so this must not require blockedBy to be non-empty.
      const owed = p.total - p.done;
      p.state = (p.blockedBy.length || p.blockedReason) ? "blocked"
        // Nothing owed: either every real task is checked, or the only tasks left are deferred/dropped
        // — neither holds the phase open forever, so both read as "done" (ADR 0034).
        : owed > 0 ? (p.done ? "doing" : "todo")
        : (p.total > 0 || p.deferred > 0) ? "done" : "todo";
    }
    t.blocked = t.phases.some((p: { state: string }) => p.state === "blocked");
    // The live phase is the first one that is neither finished nor waiting — what can start NOW.
    const live = t.phases.find((p: { state: string }) => p.state === "doing" || p.state === "todo") || null;
    t.activePhase = live ? live.phase : null;
    t.activeAddr = live ? live.addr : null;
    t.nextTask = live ? live.next : null;
  }
}

/**
 * Roll each ADR's build state up from the phases that declare `- Builds:` it. `unlinked` is a
 * distinct answer from `built`: nobody claimed the work, so silence must not read as done.
 */
function linkDecisions(board: DocsBoard): void {
  for (const d of board.decisions) {
    d.builtBy = [];
    for (const t of board.todos)
      for (const p of t.phases)
        if ((p.builds as string[]).includes(d.id)) d.builtBy.push(p);
    const open = d.builtBy.filter((p: { state: string }) => p.state !== "done");
    d.buildState = !d.builtBy.length ? "unlinked" : !open.length ? "built" : d.builtBy.some((p: { done: number }) => p.done) ? "partial" : "unbuilt";
    d.openPhases = open.map((p: { addr: string }) => p.addr);
  }
  // A `- Builds:` pointing at no ADR is a broken address, same as a dangling relation stamp.
  const ids = new Set(board.decisions.map(d => d.id));
  for (const t of board.todos)
    for (const p of t.phases)
      for (const ref of p.builds as string[])
        if (!ids.has(ref)) mergeLint(board, t.file, "todo", [`\`- Builds: ${ref}\` points at ADR ${ref}, which does not exist`]);
}

/**
 * Cross-file check across the ADR set: a relation must point at a record that exists, and that
 * record must answer back. A one-way stamp is how an ADR ends up read as current after a later one
 * changed it — the failure the `decisions/README.md` index used to paper over.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * Every repo-relative code path named inside an `- Enforced by:` value (ADR 0058).
 *
 * The field is specified as "a repo-relative path" and in practice carries prose around it: eight
 * values name more than one path, and several read like
 * "sentinel rule `layer_boundaries` (src/lib/domain/governance/sentinel-rules.ts)". So this pulls
 * every `tests/…` or `src/…` occurrence out of the value rather than treating the whole value as a
 * path. That is a regex over prose and is worth naming as such — it is not clean parsing.
 */
export function enforcedByPaths(value: string): string[] {
  if (!value) return [];
  return Array.from(String(value).matchAll(/\b((?:tests|src)\/[A-Za-z0-9_./-]+\.[A-Za-z]+)/g)).map(m => m[1]);
}

export function crossCheckDecisions(decisions: any[], treeRoot: string = process.cwd()): Array<{ file: string; errs: string[] }> {
  const byId = new Map(decisions.filter(d => d.id).map(d => [d.id, d]));
  const out: Array<{ file: string; errs: string[] }> = [];
  for (const d of decisions) {
    const errs: string[] = [];
    for (const [field, { key, mirror }] of Object.entries(REL)) {
      for (const ref of (d[key] ?? []) as string[]) {
        const target = byId.get(ref);
        const shown = cap(field);
        if (!target) { errs.push(`\`- ${shown}: ${ref}\` points at ADR ${ref}, which does not exist`); continue; }
        if (!(target[mirror] ?? []).includes(d.id))
          errs.push(`\`- ${shown}: ${ref}\` is not stamped at the other end — ADR ${ref} needs \`- ${mirrorField(mirror)}: ${d.id}\``);
      }
    }
    // Superseding a half-built record: the reasoning dies, the code does not. The remainder must be
    // claimed by the successor or it loses its owner at the exact moment someone should inherit it.
    for (const ref of (d.supersedes ?? []) as string[]) {
      const target = byId.get(ref);
      if (target?.openPhases?.length && !(d.inherits ?? []).includes(ref))
        errs.push(`supersedes ADR ${ref}, which still has unbuilt work (${target.openPhases.join(", ")}) — say what carried over with \`- Inherits: ${ref} (…)\` or abandon it explicitly`);
    }
    // An `- Enforced by:` naming a file that does not exist is a claim of enforcement with nothing
    // behind it — the same shape as a rule that matches zero nodes, or a verdict from a comparison
    // that never ran. One of this repository's 46 was already wrong and nothing caught it (ADR 0058).
    for (const rel of enforcedByPaths(d.enforcedBy ?? '')) {
      if (!existsSync(path.join(treeRoot, rel))) {
        errs.push(`\`- Enforced by:\` names \`${rel}\`, which does not exist — a record cannot be proved by a file that is not there`);
      }
    }

    if (errs.length) out.push({ file: d.file, errs });
  }
  return out;
}

/** Hygiene: true findings that do not break the grammar, so they report without failing the gate. */
function hygiene(board: DocsBoard): void {
  for (const t of board.todos) {
    const claim = String(t.state || "").toLowerCase();
    // `done` is not a resting state: the facts must be promoted and the file moved to completed/.
    if (claim === "done" && !/\/completed\//.test(t.file))
      warn(board, t.file, "`Status: done` but still in `todos/` — promote its surviving facts, then move it to `todos/completed/`");
    // The Status line is the author's claim; the checkboxes are the truth. The gap is the finding.
    if (claim === "done" && t.total && t.done < t.total)
      warn(board, t.file, `\`Status: done\` but ${t.total - t.done} task(s) are unchecked`);
    if (claim === "doing" && t.total && t.done === t.total)
      warn(board, t.file, "`Status: doing` but every task is checked");
    // `t.blocked` already covers a phase-level `- Blocked by:` (ADR 0034) because `linkPhases` sets a
    // phase's state to "blocked" on either cause — so nothing extra is needed here, only the comment:
    // a todo with a Blocked-by phase and Status: blocked is telling the truth, not lying.
    if (claim === "blocked" && !t.blocked && !t.blockedReason)
      warn(board, t.file, "`Status: blocked` with neither an unmet `- Depends:` nor a `- Blocked by:` — an unstated blocker is invisible to whoever could clear it");
    // Deferring is legal; deferring your way to "done" is not the same thing as finishing. A todo
    // whose every task is `[>]` owes nothing, so it reads 100% and drops off the board — the exact
    // "0/0 means nothing to do" ambiguity the empty-phase rule exists to refuse, reached through
    // deferral instead of prose. Nothing was built, so say so rather than let it close silently.
    if (t.deferred && !t.done)
      warn(board, t.file, `every task is deferred (${t.deferred}) and none is complete — this is a deferral, not a completion; keep it open, or drop the tasks with a reason if it is not coming back`);
    // Closing a todo files it in `completed/`, which nothing scans. Deferred work is work someone is
    // still meant to pick up, so filing it there is a silent delete dressed as a completion — the
    // task survives in git and in no board. Re-home it into a live todo, or admit it is dropped.
    if (claim === "done" && t.deferred)
      warn(board, t.file, `\`Status: done\` with ${t.deferred} deferred task(s) — \`completed/\` is not scanned, so closing this buries them. Move them to a live todo, or change them to \`[-]\` with a reason`);
  }
  // Aggregated, not one warning per file: on a repo that predates the link fields this is every
  // ADR at once, and a wall of identical lines is noise that trains you to ignore the channel.
  // `- Resolved by:` exempts an ADR for the same reason `superseded` does: the open question it
  // recorded now belongs to the successor, so demanding a build link here asks it to prove work it
  // deliberately handed on. ADR 0012 is the case — `Status: Accepted` with `- Resolved by: 0013` —
  // and it was reported on EVERY run and always would have been. A warning that is permanently
  // wrong is worse than no warning: it teaches the reader to skip the line, which is the same
  // failure as the untriaged findings this todo already tracks.
  board.unlinked = board.decisions
    .filter(d => d.buildState === "unlinked" && !d.enforcedBy
      && !d.resolvedBy?.length && !/^superseded$/i.test(d.state || ""))
    .map(d => d.id);
}

function mergeLint(board: DocsBoard, file: string, type: DocType, errs: string[]): void {
  const entry = board.lint.find(l => l.file === file);
  if (entry) entry.errs.push(...errs);
  else board.lint.push({ file, type, errs });
}

function warn(board: DocsBoard, file: string, msg: string): void {
  const entry = board.warns.find(w => w.file === file);
  if (entry) entry.errs.push(msg);
  else board.warns.push({ file, errs: [msg] });
}

function cap(field: string): string { return field.replace(/^\w/, c => c.toUpperCase()); }
function mirrorField(key: string): string {
  return cap(Object.entries(REL).find(([, r]) => r.key === key)![0]);
}

function statSyncSafe(p: string): boolean { try { return statSync(p).isDirectory(); } catch { return false; } }
