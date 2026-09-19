import path from "node:path";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

/**
 * Conducks — Module Note Walking 📄🌳
 *
 * Exists because `conducks glossary` and `conducks features` (ADR 0193's two COMPUTED cross-module
 * views) both need the same two things first: every note under `docs/visuals/modules/`, and the raw
 * lines of one named `## Section` inside it. Splitting that walk out is what lets both commands
 * disagree only about what they DO with a section, never about how one is found — the same reason
 * `docs-board.ts` and `visuals-lint.ts` each own one walk rather than two callers reimplementing it.
 *
 * `sectionOf` is the one function both counts (ADR 0124) are built on: it returns `null` when a
 * heading is entirely absent from a note, and an array (possibly holding only "none") when the
 * heading exists with nothing, or something, under it. Collapsing those two into one falsy value is
 * exactly the bug ADR 0194 names — "a missing section and an empty one must be different states."
 */

/** A parsed note: its feature path (repo-relative to `modules/`, no `.md`) and its raw text. */
export interface ModuleNote {
  /** The feature path a note's filename encodes, e.g. `core/utils`, `contracts` (ADR 0193 §6.3). */
  feature: string;
  /** Path as a reader/report should show it, repo-relative to the project root. */
  path: string;
  text: string;
}

/**
 * Every authored module note under `docs/visuals/modules/`. A missing folder returns `[]`, not an
 * error — the same "nothing to walk" shape `collectVisualPages` uses, because a repo with no visuals
 * tree yet is a real, unremarkable state (§6.13).
 */
export function collectModuleNotes(root: string): ModuleNote[] {
  const base = path.join(root, "docs", "visuals", "modules");
  if (!existsSync(base)) return [];
  const out: ModuleNote[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir).sort(); } catch { return; }
    for (const name of entries) {
      const abs = path.join(dir, name);
      let isDir = false;
      try { isDir = statSync(abs).isDirectory(); } catch { continue; }
      if (isDir) { walk(abs); continue; }
      if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
      const feature = path.relative(base, abs).replace(/\.md$/, "").split(path.sep).join("/");
      let text: string;
      try { text = readFileSync(abs, "utf8"); } catch { continue; }
      out.push({ feature, path: path.relative(root, abs), text });
    }
  };
  walk(base);
  return out;
}

/**
 * The raw lines of one `## <heading>` section in a note, or `null` if the heading itself never
 * appears — see the module note above for why that distinction is the whole point of this function.
 *
 * Stops at the next `##` heading of ANY name, so a note's `## Glossary` body never swallows the
 * `## Traps` that follows it.
 */
export function sectionOf(text: string, heading: string): string[] | null {
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => headingRe.test(l.trim()));
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body;
}

/** A section's body is present but declares nothing — the frozen `none` convention (conducks-docs §6.3). */
export function isEmptyBody(lines: string[]): boolean {
  const joined = lines.join("\n").trim().toLowerCase();
  return joined === "" || joined === "none" || joined === "- none";
}
