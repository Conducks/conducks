/**
 * Conducks — Docs Grammar Parser 📄
 *
 * Parses authored markdown docs into structured data straight from the body — no YAML.
 * Implements the conducks-docs skill §4 grammar: five primitives (# Title, Status:,
 * ## Section, - [ ] task, - Key: value), type inferred from path. This is the single
 * source of truth for both `docs-status` (extract) and `docs-lint` (validate).
 *
 * LINE-ATOMIC: one line in, one fact out. A value is the WHOLE line after its marker and is
 * never split on whitespace — `Status: Amended by 0012` keeps its ref, not just "Amended".
 * The corollary is a value may never wrap onto a second line (there is no continuation rule,
 * so a wrapped line matches no primitive and would be dropped silently) — `lint` enforces it.
 */
import path from "node:path";

export type DocType =
  | "todo" | "decision" | "features" | "memory" | "conventions"
  | "handover" | "architecture" | "derived" | "prose";

export const GOVERNED: DocType[] = ["todo", "decision", "features", "memory", "conventions", "handover"];

const RE = {
  title: /^#\s+(.+?)\s*$/,
  status: /^Status:\s*(.+?)\s*$/,
  section: /^##\s+(.+?)\s*$/,
  task: /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/,
  field: /^\s*-\s*([A-Z][\w .\/-]*?):\s*(.+?)\s*$/,
  fence: /^\s*(```|~~~)/,
  phase: /^Phase\s+(\d+)\b/i,
};

/**
 * Status vocabulary per type — the leading token of the status line (conducks-docs §"How to
 * structure each file"). An ADR's Status carries LIFE state only: superseding kills a record,
 * amending does not. Amendments and other relations are `- Amended by:` style FIELDS, so an
 * amended ADR stays `Accepted` and binding — you just have to read the amendment too.
 */
const STATUS_VOCAB: Partial<Record<DocType, RegExp>> = {
  todo: /^(todo|doing|done|blocked)$/i,
  decision: /^(Accepted|Superseded\s+by\s+\d{4}(\s*,\s*\d{4})*)$/i,
  handover: /^(current|stale)$/i,
};

/** Relation fields on an ADR, and the field that must answer back from the other end. */
export const REL: Record<string, { key: string; mirror: string }> = {
  "amended by": { key: "amendedBy", mirror: "amends" },
  "amends": { key: "amends", mirror: "amendedBy" },
  "superseded by": { key: "supersededBy", mirror: "supersedes" },
  "supersedes": { key: "supersedes", mirror: "supersededBy" },
  "resolved by": { key: "resolvedBy", mirror: "resolves" },
  "resolves": { key: "resolves", mirror: "resolvedBy" },
};

export interface Section { head: string; tasks: Array<{ done: boolean; text: string }>; fields: Record<string, string>; }
export interface Body { title: string | null; status: string | null; fields: Record<string, string>; sections: Section[]; }

export function inferType(fp: string): DocType {
  if (/\/todos?\//.test(fp) || /\/todo\d*\.md$/.test(fp)) return "todo";
  if (/\/decisions?\//.test(fp)) return "decision";
  if (/features\.md$/.test(fp)) return "features";
  if (/memory\.md$/.test(fp)) return "memory";
  if (/conventions\.md$/.test(fp)) return "conventions";
  if (/handover\.md$/.test(fp)) return "handover";
  // Architecture is AUTHORED, not derived: a human explaining a module/subsystem's purpose, layer,
  // boundaries, and deferred design — the WHY the code can't tell you (see sofie's per-module
  // MODULE.md). It is free-form (no skeleton), never lint-flagged, and must NEVER be auto-generated.
  // file-OR-folder: `architecture.md`, an `architecture/` folder, or per-module `MODULE.md`.
  if (/architecture\.md$/.test(fp) || /\/architecture\//.test(fp) || /MODULE\.md$/.test(fp)) return "architecture";
  // `map.md` / `drift.md` are pure wiring — that IS derived structure; don't author it, query the
  // graph (audit / impact / trace / coverage) instead. `progress.md` joined them (ADR 0024): what
  // shipped and when is already carried by dated ADRs and closed todos, so it is a query, not a file.
  if (/map\.md$|drift\.md$|progress\.md$/.test(fp)) return "derived";
  // Everything else a human keeps under docs/ is SOFT — free-form, project-specific, valid, never
  // flagged (business/ design/ product/ process/ are just common examples, not a required set).
  // The only lint failures are GOVERNED files that break their own skeleton.
  return "prose";
}

function inferUnit(fp: string): string {
  const m = fp.match(/([^/]+)\/docs\//);
  return m ? m[1] : path.basename(path.dirname(fp));
}

export function parseBody(src: string): Body {
  const out: Body = { title: null, status: null, fields: {}, sections: [] };
  let cur: Section | null = null;
  let fenced = false;
  for (const line of src.split("\n")) {
    let m: RegExpExecArray | null;
    // A fenced block is illustration, not grammar — a `## foo` inside ``` is not a section.
    if (RE.fence.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if ((m = RE.title.exec(line)) && !out.title) { out.title = m[1]; continue; }
    if ((m = RE.status.exec(line)) && !out.status && !cur) { out.status = m[1]; continue; }
    if ((m = RE.section.exec(line))) { cur = { head: m[1], tasks: [], fields: {} }; out.sections.push(cur); continue; }
    if ((m = RE.task.exec(line)) && cur) { cur.tasks.push({ done: m[1].toLowerCase() === "x", text: m[2] }); continue; }
    if ((m = RE.field.exec(line))) { (cur ? cur.fields : out.fields)[m[1]] = m[2]; continue; }
  }
  return out;
}

/**
 * Split a status LINE into its state token and the refs it points at — without discarding the
 * line. `status` stays the raw line (line-atomic); `state`/`statusRefs` are the derived view
 * a board groups on. `Amended by 0016, 0017` → state "Amended", refs ["0016","0017"].
 */
export function readStatus(raw: string | null): { status: string | null; state: string | null; statusRefs: string[] } {
  if (!raw) return { status: null, state: null, statusRefs: [] };
  const m = raw.match(/^([A-Za-z]+)\b/);
  const refs = /\bby\s+(?:ADR\s*)?[\d\s,]+/i.test(raw) ? Array.from(raw.matchAll(/\d{4}/g)).map(x => x[0]) : [];
  return { status: raw, state: m ? m[1] : null, statusRefs: refs };
}

/** `todo09.md` → `todo09`. The stem other files address phases through. */
export function todoId(file: string): string {
  return path.basename(file).replace(/\.md$/i, "");
}

/** Leading ADR refs on a relation/link field — `0016, 0017 (why)` → ["0016","0017"], prose ignored. */
function refsIn(value?: string): string[] {
  if (!value) return [];
  return Array.from((value.match(/^[\d\s,and]+/i)?.[0] ?? "").matchAll(/\d{4}/g)).map(x => x[0]);
}

/** Leading phase addresses on a `- Depends:` field — `todo09#P3, todo10#P1 (why)`. */
function addrsIn(value?: string): string[] {
  if (!value) return [];
  return Array.from(value.matchAll(/([A-Za-z][\w.-]*#P\d+)/g)).map(x => x[1]);
}

/** The four-digit ADR number, from the filename (`0016-…md`) or, failing that, the title. */
export function adrId(file: string, title: string | null): string | null {
  return path.basename(file).match(/^(\d{4})/)?.[1] ?? title?.match(/^(\d{4})/)?.[1] ?? null;
}

/** Pull the ADR relation fields (`- Amended by: 0016, 0017`) into ref lists, ignoring the prose after them. */
export function readRelations(fields: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = { amendedBy: [], amends: [], supersededBy: [], supersedes: [], resolvedBy: [], resolves: [] };
  for (const [k, v] of Object.entries(fields)) {
    const r = REL[k.trim().toLowerCase()];
    // Only the leading ref list counts — `0016, 0017 (why)` must not harvest digits out of the why.
    if (r) out[r.key] = Array.from((v.match(/^[\d\s,and]+/i)?.[0] ?? "").matchAll(/\d{4}/g)).map(x => x[0]);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shape(type: DocType, body: Body, file: string): any {
  const base = { type, unit: inferUnit(file), file, title: body.title };
  if (type === "todo") {
    const id = todoId(file);
    const phases = body.sections.filter(s => RE.phase.test(s.head)).map(s => {
      const num = Number(RE.phase.exec(s.head)![1]);
      const done = s.tasks.filter(t => t.done).length;
      return {
        // `todoNN#PN` is the address other files point at — the phase is the unit of linkage.
        addr: `${id}#P${num}`, num, phase: s.head, done, total: s.tasks.length,
        pct: s.tasks.length ? Math.round(done / s.tasks.length * 100) : 0,
        next: s.tasks.find(t => !t.done)?.text ?? null,
        builds: refsIn(s.fields.Builds), depends: addrsIn(s.fields.Depends),
      };
    });
    const done = phases.reduce((a, p) => a + p.done, 0), total = phases.reduce((a, p) => a + p.total, 0);
    // The live phase is the first one not fully checked — "what is in progress", not just how much.
    const active = phases.find(p => p.pct < 100) || null;
    return {
      ...base, ...readStatus(body.status), id,
      acceptance: body.fields.Acceptance || null,
      // An external blocker (no network, a third-party release, a decision someone else owes) is a
      // real cause that no `- Depends:` can express — but it must still be STATED, not just claimed.
      blockedReason: body.fields["Blocked by"] || null,
      overallPct: total ? Math.round(done / total * 100) : 0, done, total, phases,
      activePhase: active ? active.phase : null, nextTask: active ? active.next : null,
    };
  }
  if (type === "decision") {
    const st = readStatus(body.status);
    const rel = readRelations(body.fields);
    // Superseded is a life state and comes off Status; amended is a relation and comes off the
    // fields. An amended ADR is still binding — it is grouped apart, not struck out.
    const state = /^superseded$/i.test(st.state || "") ? "Superseded" : rel.amendedBy.length ? "Amended" : st.state;
    return {
      ...base, ...st, state, ...rel, id: adrId(file, body.title), date: body.fields.Date || null,
      // Evidence that the decision is actually built, and the remainder a successor took on.
      enforcedBy: body.fields["Enforced by"] || null, inherits: refsIn(body.fields.Inherits),
    };
  }
  if (type === "features" || type === "memory" || type === "conventions")
    return { ...base, entries: body.sections.map(s => ({ name: s.head, ...s.fields })) };
  if (type === "handover") return { ...base, ...readStatus(body.status), sections: body.sections.map(s => s.head) };
  return base;
}

/**
 * A value line carries a fact the extractor reads; the line AFTER it may not continue it. There is
 * no continuation rule in the grammar, so a wrapped line matches no primitive and is dropped in
 * silence — half the recorded meaning gone, with the board still reporting "clean". Flagged only
 * for unindented plain text (an indented line is a normal markdown sub-item, a `-`/`|`/`>`/`#`
 * line is its own primitive or block).
 */
function wrappedValues(src: string): string[] {
  const errs: string[] = [];
  const lines = src.split("\n");
  let fenced = false, prevValue: string | null = null;
  for (const line of lines) {
    if (RE.fence.test(line)) { fenced = !fenced; prevValue = null; continue; }
    if (fenced) continue;
    if (prevValue && /^\S/.test(line) && !/^([#>|]|-|\d+\.|!\[|<)/.test(line)) {
      errs.push(`value wrapped onto the next line — keep it on one line: \`${prevValue.slice(0, 60)}…\``);
      prevValue = null;
      continue;
    }
    prevValue = RE.status.test(line) || RE.task.test(line) || RE.field.test(line) ? line.trim() : null;
  }
  return errs;
}

export function lint(type: DocType, body: Body, src?: string): string[] {
  const errs: string[] = [];
  if (!body.title) errs.push("missing `# Title`");
  if (type === "todo") {
    if (!body.status) errs.push("missing `Status:`");
    const phases = body.sections.filter(s => RE.phase.test(s.head));
    if (!phases.length) errs.push("no `## Phase N —` sections");
    if (!body.fields.Acceptance) errs.push("missing `- Acceptance:` (one line, testable)");
    // `todoNN#PN` is an address; two phases sharing a number make both unreachable.
    const seen = new Set<number>();
    for (const p of phases) {
      const n = Number(RE.phase.exec(p.head)![1]);
      if (seen.has(n)) errs.push(`duplicate \`## Phase ${n}\` — phase numbers address a phase and must be unique in the file`);
      seen.add(n);
    }
  }
  if (type === "decision") {
    if (!body.status) errs.push("missing `Status:`");
    for (const req of ["Context", "Decision", "Consequences"])
      if (!body.sections.some(s => s.head === req)) errs.push(`missing ## ${req} section`);
  }
  if (type === "handover" && !body.status) errs.push("missing `Status:` (current | stale)");
  // The status VALUE, not just its presence: a typo'd state silently reads as active on the board.
  const vocab = STATUS_VOCAB[type];
  if (vocab && body.status && !vocab.test(body.status.trim()))
    errs.push(`\`Status: ${body.status.slice(0, 40)}\` is not a valid ${type} status (${VOCAB_HINT[type]})`);
  if (src) errs.push(...wrappedValues(src));
  return errs;
}

const VOCAB_HINT: Partial<Record<DocType, string>> = {
  todo: "todo | doing | done | blocked",
  decision: "Accepted | Superseded by NNNN — amendments are a `- Amended by:` field, not a status",
  handover: "current | stale",
};
