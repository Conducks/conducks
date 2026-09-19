import { type ModuleNote, sectionOf, isEmptyBody } from "./module-notes.js";

/**
 * Conducks — Glossary Collision Detection 📄🔤
 *
 * ADR 0193's first computed cross-module view: a term defined in two or more features' `## Glossary`
 * IS the collision, derived from the notes rather than maintained in a `glossary.md` nobody re-reads.
 * `memory.md`'s name-collision entries move here (ADR 0193 §6.5).
 *
 * Exists as its own file, not a method on `module-notes.ts`, because the walk and the section grammar
 * are shared with `features.ts` while the grouping rule below is glossary-specific.
 */

/** One `- **term** — definition` bullet, exactly the frozen grammar (conducks-docs §6.3). */
const GLOSSARY_ITEM = /^\s*-\s*\*\*(.+?)\*\*\s*—\s*(.+?)\s*$/;

export interface GlossaryEntry { feature: string; note: string; term: string; definition: string; }
export interface GlossaryCollision { term: string; entries: GlossaryEntry[]; }

export interface GlossaryReport {
  collisions: GlossaryCollision[];
  /** Every term seen, one row per feature that defines it — the uncollided majority, for `--all`-style callers. */
  entries: GlossaryEntry[];
  /** Notes with NO `## Glossary` heading at all — distinct from a note that wrote `none` (ADR 0124). */
  notesWithNoSection: number;
  totalNotes: number;
}

/**
 * Fold two spellings of the same term together before grouping. Case-fold (`node`/`Node`) and
 * hyphen/underscore-vs-space fold (`dead-code`/`dead code`) are the two variants ADR 0193's own
 * example names; nothing fancier — a stemmer would fold unrelated words together, which is a worse
 * failure than under-folding for a tool whose whole job is flagging a real disagreement.
 */
export function normaliseTerm(term: string): string {
  return term.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

/** Parse one note's `## Glossary` bullets. `null` section (heading absent) is the caller's job to count. */
function parseGlossary(note: ModuleNote): { entries: GlossaryEntry[]; hasSection: boolean } {
  const lines = sectionOf(note.text, "Glossary");
  if (lines === null) return { entries: [], hasSection: false };
  if (isEmptyBody(lines)) return { entries: [], hasSection: true };

  const entries: GlossaryEntry[] = [];
  for (const line of lines) {
    const m = GLOSSARY_ITEM.exec(line);
    if (!m) continue;
    entries.push({ feature: note.feature, note: note.path, term: m[1].trim(), definition: m[2].trim() });
  }
  return { entries, hasSection: true };
}

/** Walk every note's `## Glossary`, group by normalised term, and report a term owned by 2+ features. */
export function buildGlossaryReport(notes: ModuleNote[]): GlossaryReport {
  const entries: GlossaryEntry[] = [];
  let notesWithNoSection = 0;

  for (const note of notes) {
    const parsed = parseGlossary(note);
    if (!parsed.hasSection) notesWithNoSection++;
    entries.push(...parsed.entries);
  }

  const byTerm = new Map<string, GlossaryEntry[]>();
  for (const e of entries) {
    const key = normaliseTerm(e.term);
    const held = byTerm.get(key) ?? [];
    held.push(e);
    byTerm.set(key, held);
  }

  const collisions: GlossaryCollision[] = [];
  for (const [, held] of byTerm) {
    // Two entries in the SAME feature are one term written twice, not a cross-module collision —
    // the thing this tool exists to catch is two different features claiming the same word.
    const features = new Set(held.map(h => h.feature));
    if (features.size >= 2) collisions.push({ term: held[0].term, entries: held });
  }
  collisions.sort((a, b) => a.term.localeCompare(b.term));

  return { collisions, entries, notesWithNoSection, totalNotes: notes.length };
}
