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
  GOVERNED, REL, type DocType, inferType, parseBody, shape, lint,
} from "@/lib/domain/analysis/docs-grammar.js";

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
}

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
    ...(p.state === "blocked" ? { blockedBy: p.blockedBy } : { next: p.next }),
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
  addr: string; done: number; total: number; next: string | null;
  state: string; blockedBy: string[]; builds: string[];
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
  const board: DocsBoard = { todos: [], decisions: [], other: [], lint: [], warns: [], unlinked: [] };
  for (const fp of walkDocs(docsDir)) {
    const type = inferType(fp);
    const src = readFileSync(fp, "utf8");
    const body = parseBody(src);
    const rel = fp.replace(docsDir + "/", "");
    if (GOVERNED.includes(type)) {
      const errs = lint(type, body, src);
      if (errs.length) board.lint.push({ file: rel, type, errs });
    }
    const shaped = shape(type, body, rel);
    if (type === "todo") board.todos.push(shaped);
    else if (type === "decision") board.decisions.push(shaped);
    else board.other.push(shaped);
  }
  linkPhases(board);
  linkDecisions(board);
  for (const x of crossCheckDecisions(board.decisions)) mergeLint(board, x.file, "decision", x.errs);
  hygiene(board);
  board.reviews = driftedReviews(root);
  return board;
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
    const doc = path.join("docs", "architecture", "modules", module.replace(/^src\/(lib\/)?/, ""), "MODULE.md");
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
      p.state = p.blockedBy.length ? "blocked" : p.total && p.done === p.total ? "done" : p.done ? "doing" : "todo";
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
export function crossCheckDecisions(decisions: any[]): Array<{ file: string; errs: string[] }> {
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
    if (claim === "blocked" && !t.blocked && !t.blockedReason)
      warn(board, t.file, "`Status: blocked` with neither an unmet `- Depends:` nor a `- Blocked by:` — an unstated blocker is invisible to whoever could clear it");
  }
  // Aggregated, not one warning per file: on a repo that predates the link fields this is every
  // ADR at once, and a wall of identical lines is noise that trains you to ignore the channel.
  board.unlinked = board.decisions
    .filter(d => d.buildState === "unlinked" && !d.enforcedBy && !/^superseded$/i.test(d.state || ""))
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
