import path from "node:path";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";

/**
 * Conducks — Visuals Lint 🖼️🛡️
 *
 * The one hole the conducks-docs standard names and does not fill. §5.4: `visuals/` is "parsed but
 * NOT grammar-checked", and "nothing catches a `visuals/` file going stale but a reader". A diagram
 * is a claim about code at a moment; every anchor in it rots silently the instant that code moves.
 *
 * This checks the DERIVED half of a visual and never the authored half (ADR 0001). Whether
 * `handleTranscript` still exists is computable, so it is checked. Why it exists, what breaks when
 * it changes, which of them is a defect — a human decided those, and no linter has an opinion.
 *
 * WHY THE FILESYSTEM AND NOT THE GRAPH. The vault is the working tree as of the last pulse, and on a
 * branch switch it "silently describes code that is no longer on disk" (ADR 0035). A rot detector
 * whose own input can be stale produces a FALSE GREEN — it reports a lying page as clean, which is
 * worse than no check because it looks like coverage. So the file list is ground truth. The graph may
 * later ADVISE (a rename is a graph question, ADR 0085); it may never decide.
 *
 * PURE BY CONSTRUCTION. Everything here takes its pages, its file list and its reader as arguments.
 * Discovery lives in the caller. The docs layer takes no connection (CONDUCKS-24) and this keeps the
 * rule while staying trivially testable — every case below is a unit test, not a fixture repo.
 */

/** A page to lint: its path (for reporting) and its full text. */
export interface VisualPage {
  /** Path as the reader should see it — repo-relative. */
  path: string;
  text: string;
}

export type VisualsSeverity = "error" | "warn";

export interface VisualsViolation {
  page: string;
  /** The anchor exactly as it is written in the page, so it can be grepped for and fixed. */
  anchor: string;
  reason: string;
  severity: VisualsSeverity;
}

export interface VisualsReport {
  violations: VisualsViolation[];
  /** Anchors that resolved to a real file and passed every claim made about them. */
  checked: number;
  /** Pages that carried at least one anchor. A page with none is reported separately — see below. */
  pagesWithAnchors: number;
}

/**
 * Docs-standard filenames that appear in prose constantly ("write it in `memory.md`"). They are not
 * code anchors, and resolving them would either fail or — worse — match some unrelated `memory.md`
 * in the tree and then "verify" it. Named explicitly rather than inferred from the `.md` extension,
 * because a real anchor into a prompt file (`SYSTEM.md:14`) IS a claim worth checking.
 */
const PROSE_DOC_NAMES = new Set([
  "MODULE.md", "architecture.md", "memory.md", "conventions.md",
  "handover.md", "features.md", "README.md", "CLAUDE.md",
]);

/** Extensions an anchor may point at. Anything else in prose is not a file reference. */
const ANCHORABLE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|cpp|cc|c|h|hpp|php|rb|swift|md|json|sql|sh)$/;

/**
 * One anchor as written. `file` is the path as the AUTHOR wrote it, which is very often abbreviated
 * (`daemon.py:131`) — resolution against the real tree happens later and is where most first-run
 * failures come from.
 */
interface RawAnchor {
  raw: string;
  file: string;
  line?: number;
  symbol?: string;
}

/**
 * A stretch of text in which files and constants belong together — the contents of one `<title>`
 * hover, or one `class="file"` span. A constant is only checked against files named in its OWN
 * context, because `SAMPLE_RATE=16000` means "in that file", and matching it against every file the
 * page mentions would produce confident nonsense.
 */
interface AnchorContext {
  text: string;
}

/**
 * WHERE AN ANCHOR IS LOOKED FOR — the contract a page has to keep.
 *
 * Not the whole page. Scanning everything would read ordinary prose ("open `index.ts`") as a claim and
 * fail it as ambiguous, and a gate that cries wolf is switched off inside a week. So a page marks its
 * claims, and only marked text is judged:
 *
 *   - any `<title>` — the hover on an SVG block, which is where a diagram carries its anchors
 *   - any element whose `class` contains `file`, `where` or `anchor`
 *   - any element carrying `data-anchor`
 *
 * The class list is deliberately loose about surrounding names (`class="det-where mono"` matches) so a
 * page can style freely. This is a CONVENTION, so it is stated in the standard (§5.4) — a rule the tool
 * enforces silently is a rule nobody can follow.
 */
const CONTEXT_PATTERNS = [
  /<title>([\s\S]*?)<\/title>/g,
  /class="[^"]*\b(?:file|where|anchor)[^"]*"[^>]*>([\s\S]*?)</g,
  /data-anchor[^>]*>([\s\S]*?)</g,
];

/**
 * A MARKDOWN page (module notes, ADR 0140) marks a claim by backticking it: `core/graph.ts:41`,
 * `daemon.py::run`. A bare backticked filename (`index.ts`) is prose, not a claim — requiring a
 * path separator or a line/symbol keeps "open `index.ts`" from failing as ambiguous, the same
 * anti-wolf rule the HTML contexts follow.
 */
const MD_CODE_SPAN = /`([^`\n]+)`/g;

/** Pull the stretches of a page in which an anchor may live. */
function contextsOf(page: VisualPage): AnchorContext[] {
  const out: AnchorContext[] = [];
  if (/\.md$/i.test(page.path)) {
    MD_CODE_SPAN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MD_CODE_SPAN.exec(page.text)) !== null) {
      const span = m[1];
      if (span.includes("/") || /:\d+|::\w+/.test(span)) out.push({ text: span });
    }
    return out;
  }
  for (const re of CONTEXT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(page.text)) !== null) out.push({ text: stripTags(m[1]) });
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
}

/**
 * `path`, `path:line`, `path:a-b`, `path::symbol`.
 *
 * The trailing `(?![\w/])` matters: without it `index.ts:150-192, 156` swallows the `, 156` and the
 * anchor stops matching anything real.
 */
const ANCHOR_RE = /([\w.@/-]+\.[a-z]{1,4})(?:::(\w+)|:(\d+)(?:-\d+)?)?/g;

/** Every anchor written in one context. */
function anchorsIn(text: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(text)) !== null) {
    const [raw, file, symbol, line] = m;
    if (!ANCHORABLE.test(file)) continue;
    out.push({ raw, file, symbol, line: line ? Number(line) : undefined });
  }
  return out;
}

/**
 * `NAME=value` as written in a hover — `COMMIT_SEC=1.1`, `MAX_HANDOVER_DEPTH=3`.
 *
 * This is the check with real teeth. A moved line number is an inconvenience; a threshold that has
 * changed under the page makes the page ACTIVELY WRONG while still looking precise, and no reader
 * has any way to notice.
 */
const CONST_RE = /\b([A-Z][A-Z0-9_]{2,})\s*=\s*([\w."'/-]+)/g;

function constantsIn(text: string): Array<{ raw: string; name: string; value: string }> {
  const out: Array<{ raw: string; name: string; value: string }> = [];
  CONST_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONST_RE.exec(text)) !== null) out.push({ raw: m[0], name: m[1], value: m[2] });
  return out;
}

/**
 * Resolve an author's abbreviation to exactly one real file, by path suffix.
 *
 * Three outcomes, and the third is the one that earns its keep. `index.ts` matches dozens of files in
 * any real repo; guessing one would let the checker "verify" an anchor against a file the author
 * never meant. Ambiguity is an ERROR that forces a longer path into the page — which is the fix.
 */
export function resolveAnchor(file: string, files: string[]): { ok: true; path: string } | { ok: false; reason: "missing" | "ambiguous"; matches: string[] } {
  const needle = file.replace(/^\.?\//, "");
  const exact = files.filter(f => f === needle);
  if (exact.length === 1) return { ok: true, path: exact[0] };

  const suffix = files.filter(f => f === needle || f.endsWith(`/${needle}`));
  if (suffix.length === 1) return { ok: true, path: suffix[0] };
  if (suffix.length === 0) return { ok: false, reason: "missing", matches: [] };
  return { ok: false, reason: "ambiguous", matches: suffix.slice(0, 5) };
}

/**
 * Is `name` DEFINED in this source (not merely mentioned)?
 *
 * Deliberately conservative. A checker that cries wolf is ignored within a week, and then it is worse
 * than nothing because it still looks like coverage. So this asks for a definition-shaped line and
 * accepts a method declaration; a bare mention is not enough to pass, and is reported as a WARN
 * rather than an error precisely because this test is a heuristic and not a parse.
 */
export function definesSymbol(source: string, name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b(?:function|class|const|let|var|interface|type|enum|def)\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:public|private|protected|static|async|\\*)?\\s*${n}\\s*[(<]`, "m"),
    new RegExp(`\\b${n}\\s*[:=]\\s*(?:async\\s*)?(?:function|\\(|<)`),
  ];
  return patterns.some(p => p.test(source));
}

/** The value a source assigns to `NAME`, if it assigns one literally. */
export function constantValue(source: string, name: string): string | null {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `NAME = 0.5`, `NAME: 0.5`, `NAME = float(os.environ.get("X", "0.5"))` — the last one is why the
  // fallback inside a call is read too, since that is where a Python default actually lives.
  const direct = new RegExp(`\\b${n}\\b\\s*(?::\\s*[\\w<>\\[\\]|]+\\s*)?=\\s*([^;\\n]+)`).exec(source);
  if (!direct) return null;
  const rhs = direct[1].trim();
  const envDefault = /(?:environ\.get|env\[[^\]]+\]\s*\?\?|getenv)\s*\([^,]+,\s*["']([^"']+)["']\s*\)/.exec(rhs)
    ?? /\|\|\s*["']?([\w.-]+)["']?/.exec(rhs);
  if (envDefault) return envDefault[1];
  const literal = /^["']?([\w.-]+)["']?/.exec(rhs);
  return literal ? literal[1] : null;
}

/** Numbers written as `16000` and `16_000` are the same number; `0.4` and `.4` are not worth a fight. */
function sameValue(written: string, actual: string): boolean {
  const norm = (s: string) => s.replace(/[_"']/g, "").replace(/\.0+$/, "");
  if (norm(written) === norm(actual)) return true;
  const a = Number(norm(written)), b = Number(norm(actual));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * Lint every page against the tree.
 *
 * `files` is repo-relative paths; `read` returns a file's text or null. Both injected — see the
 * module note on why discovery does not live here.
 */
export function lintVisuals(
  pages: VisualPage[],
  files: string[],
  read: (repoRelPath: string) => string | null,
): VisualsReport {
  const violations: VisualsViolation[] = [];
  let checked = 0;
  let pagesWithAnchors = 0;

  for (const page of pages) {
    const contexts = contextsOf(page);
    let sawAnchor = false;

    for (const ctx of contexts) {
      const anchors = anchorsIn(ctx.text);
      const resolvedHere: string[] = [];

      for (const a of anchors) {
        if (PROSE_DOC_NAMES.has(path.basename(a.file)) ) continue;
        sawAnchor = true;

        const r = resolveAnchor(a.file, files);
        if (!r.ok) {
          violations.push({
            page: page.path, anchor: a.raw, severity: "error",
            reason: r.reason === "missing"
              ? `no such file in the tree — it moved, or was deleted`
              : `ambiguous: matches ${r.matches.length}+ files (${r.matches.slice(0, 3).join(", ")}) — write a longer path`,
          });
          continue;
        }
        resolvedHere.push(r.path);

        const src = read(r.path);
        if (src === null) {
          violations.push({ page: page.path, anchor: a.raw, severity: "error", reason: `resolved to ${r.path} but it could not be read` });
          continue;
        }

        if (a.line !== undefined) {
          const lines = src.split("\n").length;
          if (a.line > lines) {
            violations.push({
              page: page.path, anchor: a.raw, severity: "error",
              reason: `${r.path} has ${lines} lines — line ${a.line} does not exist`,
            });
            continue;
          }
        }

        if (a.symbol && !definesSymbol(src, a.symbol)) {
          violations.push({
            page: page.path, anchor: a.raw, severity: "warn",
            reason: `no definition of \`${a.symbol}\` found in ${r.path} — renamed, or moved to another file`,
          });
          continue;
        }
        checked++;
      }

      // Constants are checked against the files named in the SAME context, never the whole page.
      for (const c of constantsIn(ctx.text)) {
        if (resolvedHere.length === 0) continue;
        let foundIn: string | null = null;
        let actual: string | null = null;
        for (const f of resolvedHere) {
          const src = read(f);
          if (src === null) continue;
          const v = constantValue(src, c.name);
          if (v !== null) { foundIn = f; actual = v; break; }
        }
        if (foundIn === null) continue;   // not a constant of these files — prose, not a claim
        if (actual !== null && !sameValue(c.value, actual)) {
          violations.push({
            page: page.path, anchor: c.raw, severity: "error",
            reason: `${foundIn} now has ${c.name} = ${actual} — the page still says ${c.value}`,
          });
          continue;
        }
        checked++;
      }
    }

    if (sawAnchor) pagesWithAnchors++;
    else {
      // A visual with no anchor at all cannot be checked by anything, ever. That is not a pass —
      // it is the exact state this command exists to make visible (the ADR 0044 / 0124 shape:
      // nothing-checked must never read as clean).
      violations.push({
        page: page.path, anchor: "—", severity: "warn",
        reason: "no file anchors — nothing in this page can be verified against the code",
      });
    }
  }

  return { violations, checked, pagesWithAnchors };
}

/**
 * Every page in a tree's `visuals/` folder.
 *
 * ROOT ONLY, by the standard (§3.2): `visuals/` never appears inside a service tree. Reading one from
 * a service would report a violation the standard already forbids, in a command that is not the one
 * enforcing that rule — `docs-lint`'s tree-shape check owns it.
 *
 * A missing folder returns `[]` and is NOT a failure. Most repos have no visuals and never will; §6.13
 * is explicit that a picture is created only when someone asks for one. The caller distinguishes
 * "nothing to lint" from "clean".
 */
export function collectVisualPages(root: string): VisualPage[] {
  const base = path.join(root, "docs", "visuals");
  if (!existsSync(base)) return [];
  const out: VisualPage[] = [];

  // RECURSIVE. A visuals tree grows subfolders as soon as it has more than a handful of pages — the
  // reference repo split its per-entry detail into `visuals/entry/` and this command silently stopped
  // seeing them: 299 anchors checked became 124, and the output still said "clean". That is the exact
  // failure `docs-lint` was fixed for (ADR 0124) — a gate that checks less than it appears to is worse
  // than no gate, because the number it prints is believed.
  const walk = (dir: string, rel: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir).sort(); } catch { return; }
    for (const name of entries) {
      const abs = path.join(dir, name);
      const relPath = path.join(rel, name);
      let isDir = false;
      try { isDir = statSync(abs).isDirectory(); } catch { continue; }
      if (isDir) { walk(abs, relPath); continue; }
      if (!/\.(html|md|svg)$/i.test(name)) continue;
      try { out.push({ path: relPath, text: readFileSync(abs, "utf8") }); }
      catch { /* unreadable file is reported by its absence, not by a crash here */ }
    }
  };
  walk(base, path.join("docs", "visuals"));
  return out;
}
