import { type ModuleNote, sectionOf, isEmptyBody } from "./module-notes.js";

/**
 * Conducks — Features Tree 🌳
 *
 * ADR 0193's second computed cross-module view: walk every note's `## Features` and print the tree
 * that used to be hand-maintained in `features.md`. A file that indexes the notes can disagree with
 * them; this cannot, because it reads nothing else.
 */

/** `- [part](./path.md) — description`, exactly the frozen grammar (conducks-docs §6.3). */
const LINKED_FEATURE_ITEM = /^\s*-\s*\[([^\]]+)\]\([^)]*\)\s*(?:—\s*(.*))?$/;
/** A plain `- name — description` bullet, for a feature with nothing (yet) to link to. */
const PLAIN_FEATURE_ITEM = /^\s*-\s*([^—\n]+?)\s*—\s*(.*)$/;

export interface FeatureEntry { name: string; description: string; }
export interface FeatureNode { feature: string; note: string; features: FeatureEntry[]; }

export interface FeaturesReport {
  tree: FeatureNode[];
  /** Notes with NO `## Features` heading at all — distinct from one that wrote `none` (ADR 0124). */
  notesWithNoSection: number;
  totalNotes: number;
}

function parseFeatures(note: ModuleNote): { entries: FeatureEntry[]; hasSection: boolean } {
  const lines = sectionOf(note.text, "Features");
  if (lines === null) return { entries: [], hasSection: false };
  if (isEmptyBody(lines)) return { entries: [], hasSection: true };

  const entries: FeatureEntry[] = [];
  for (const line of lines) {
    const linked = LINKED_FEATURE_ITEM.exec(line);
    const m = linked ?? PLAIN_FEATURE_ITEM.exec(line);
    if (!m) continue;
    const name = m[1].trim();
    if (!name) continue;
    entries.push({ name, description: (m[2] ?? "").trim() });
  }
  return { entries, hasSection: true };
}

/** Walk every note's `## Features`, one tree node per note, in feature-path order. */
export function buildFeaturesReport(notes: ModuleNote[]): FeaturesReport {
  const tree: FeatureNode[] = [];
  let notesWithNoSection = 0;

  for (const note of [...notes].sort((a, b) => a.feature.localeCompare(b.feature))) {
    const parsed = parseFeatures(note);
    if (!parsed.hasSection) { notesWithNoSection++; continue; }
    tree.push({ feature: note.feature, note: note.path, features: parsed.entries });
  }

  return { tree, notesWithNoSection, totalNotes: notes.length };
}
