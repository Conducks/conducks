/**
 * Conducks — Docs Grammar Parser 📄
 *
 * Parses authored markdown docs into structured data straight from the body — no YAML.
 * Implements the conducks-docs skill §4 grammar: five primitives (# Title, Status:,
 * ## Section, - [ ] task, - Key: value), type inferred from path. This is the single
 * source of truth for both `docs-status` (extract) and `docs-lint` (validate).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type DocType =
  | "todo" | "decision" | "features" | "memory" | "conventions" | "progress"
  | "handover" | "derived" | "prose" | "unknown";

export const GOVERNED: DocType[] = ["todo", "decision", "features", "memory", "conventions", "progress", "handover"];

const RE = {
  title: /^#\s+(.+?)\s*$/,
  status: /^Status:\s*(.+?)\s*$/,
  section: /^##\s+(.+?)\s*$/,
  task: /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/,
  field: /^\s*-\s*([A-Z][\w .\/-]*?):\s*(.+?)\s*$/,
};

export interface Section { head: string; tasks: Array<{ done: boolean; text: string }>; fields: Record<string, string>; }
export interface Body { title: string | null; status: string | null; fields: Record<string, string>; sections: Section[]; }

export function inferType(fp: string): DocType {
  if (/\/todos?\//.test(fp) || /\/todo\d*\.md$/.test(fp)) return "todo";
  if (/\/decisions?\//.test(fp)) return "decision";
  if (/features\.md$/.test(fp)) return "features";
  if (/memory\.md$/.test(fp)) return "memory";
  if (/conventions\.md$/.test(fp)) return "conventions";
  if (/progress\.md$/.test(fp)) return "progress";
  if (/handover\.md$/.test(fp)) return "handover";
  if (/architecture\.md$|map\.md$|drift\.md$/.test(fp)) return "derived";
  // Free-form authored categories + the front door — part of the standard, kept but not parsed.
  if (/\/(product|business|brand|design|process)\//.test(fp) || /readme\.md$/i.test(fp)) return "prose";
  return "unknown";
}

export function inferUnit(fp: string): string {
  const m = fp.match(/([^/]+)\/docs\//);
  return m ? m[1] : path.basename(path.dirname(fp));
}

export function parseBody(src: string): Body {
  const out: Body = { title: null, status: null, fields: {}, sections: [] };
  let cur: Section | null = null;
  for (const line of src.split("\n")) {
    let m: RegExpExecArray | null;
    if ((m = RE.title.exec(line)) && !out.title) { out.title = m[1]; continue; }
    if ((m = RE.status.exec(line)) && !out.status && !cur) { out.status = m[1]; continue; }
    if ((m = RE.section.exec(line))) { cur = { head: m[1], tasks: [], fields: {} }; out.sections.push(cur); continue; }
    if ((m = RE.task.exec(line)) && cur) { cur.tasks.push({ done: m[1].toLowerCase() === "x", text: m[2] }); continue; }
    if ((m = RE.field.exec(line))) { (cur ? cur.fields : out.fields)[m[1]] = m[2]; continue; }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shape(type: DocType, body: Body, file: string): any {
  const base = { type, unit: inferUnit(file), file, title: body.title };
  if (type === "todo") {
    const phases = body.sections.filter(s => /^Phase\b/i.test(s.head)).map(s => {
      const done = s.tasks.filter(t => t.done).length;
      return { phase: s.head, done, total: s.tasks.length, pct: s.tasks.length ? Math.round(done / s.tasks.length * 100) : 0 };
    });
    const done = phases.reduce((a, p) => a + p.done, 0), total = phases.reduce((a, p) => a + p.total, 0);
    return { ...base, status: body.status, overallPct: total ? Math.round(done / total * 100) : 0, done, total, phases };
  }
  if (type === "decision") {
    const s = body.status || "";
    const sup = s.match(/superseded by\s+(\d+)/i);
    return { ...base, status: s.split(/\s/)[0] || s, supersededBy: sup ? sup[1] : null, date: body.fields.Date || null };
  }
  if (type === "features" || type === "memory" || type === "conventions")
    return { ...base, entries: body.sections.map(s => ({ name: s.head, ...s.fields })) };
  if (type === "progress") return { ...base, entries: body.sections.map(s => ({ when: s.head })) };
  if (type === "handover") return { ...base, status: body.status, sections: body.sections.map(s => s.head) };
  return base;
}

export function lint(type: DocType, body: Body): string[] {
  const errs: string[] = [];
  if (!body.title) errs.push("missing `# Title`");
  if (type === "todo") {
    if (!body.status) errs.push("missing `Status:`");
    if (!body.sections.some(s => /^Phase\b/i.test(s.head))) errs.push("no `## Phase N —` sections");
  }
  if (type === "decision") {
    if (!body.status) errs.push("missing `Status:`");
    for (const req of ["Context", "Decision", "Consequences"])
      if (!body.sections.some(s => s.head === req)) errs.push(`missing ## ${req} section`);
  }
  if (type === "handover" && !body.status) errs.push("missing `Status:` (current | stale)");
  return errs;
}

/** Walk a docs tree, skipping archive dirs (records/superseded material is not linted). */
export function walkDocs(dir: string): string[] {
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

export interface DocsBoard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  todos: any[]; decisions: any[]; other: any[];
  lint: Array<{ file: string; type: DocType; errs: string[] }>;
}

/** Resolve the docs dir for a target path, parse every governed file, return the board. */
export function buildBoard(root: string): DocsBoard {
  const docsDir = statSyncSafe(path.join(root, "docs")) ? path.join(root, "docs") : root;
  const board: DocsBoard = { todos: [], decisions: [], other: [], lint: [] };
  for (const fp of walkDocs(docsDir)) {
    const type = inferType(fp);
    const body = parseBody(readFileSync(fp, "utf8"));
    const rel = fp.replace(docsDir + "/", "");
    if (GOVERNED.includes(type)) {
      const errs = lint(type, body);
      if (errs.length) board.lint.push({ file: rel, type, errs });
    }
    const shaped = shape(type, body, rel);
    if (type === "todo") board.todos.push(shaped);
    else if (type === "decision") board.decisions.push(shaped);
    else board.other.push(shaped);
  }
  return board;
}

function statSyncSafe(p: string): boolean { try { return statSync(p).isDirectory(); } catch { return false; } }
