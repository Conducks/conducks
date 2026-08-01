import { FileHashGate } from "@/lib/core/persistence/file-hash-gate.js";

/**
 * Conducks — what a vault knows against what is on disk (ADR 0036, todo21#P3).
 *
 * The ONE engine `watch` and `monitor` are surfaces over. It was already half-shared: both used
 * `FileHashGate.hash`, and both then answered "is this fresh?" separately — the monitor in bulk and
 * the watcher one event at a time.
 *
 * That split had a real cost rather than being merely untidy. The watcher runs with
 * `ignoreInitial: true` and performed NO reconcile, so everything edited while it was not running
 * was invisible to it: it saw events from the moment it started and nothing before. The monitor
 * could compute exactly that set and the watcher could not ask for it. Giving them one engine is
 * what closes that, and it is why the merge is worth doing rather than a refactor for its own sake.
 *
 * Pure over a stored map and a file list, holding no database and no filesystem walk, because the
 * classification is where the interesting mistakes are — `removed` in particular has a subtlety
 * that cost a false "graph behind" on every clean pulse.
 */

export interface Freshness {
  /** On disk, content differs from what the vault analyzed. */
  changed: string[];
  /** On disk, the vault has never seen it. COVERAGE, not staleness. */
  added: string[];
  /** The vault knows it and it is gone from disk. */
  removed: string[];
  /** How many files the vault has hashes for. */
  tracked: number;
}

/** Reads one file's current content, or null when it cannot be read. */
export type ReadFile = (absPath: string) => string | null;
/** True when the path still exists on disk. */
export type StillExists = (absPath: string) => boolean;

/**
 * Classify every file the vault knows and every file on disk.
 *
 * `sourceExtensions` gates the REMOVED check and nothing else, and that asymmetry is deliberate.
 * A pulse hashes every file it analyzed — `package.json`, markdown, config — while a caller
 * typically walks source extensions only, so a plain set difference reports every one of those as
 * deleted. Filtering the removed side to the extensions the caller actually walks is what stops a
 * clean pulse reporting phantom deletions.
 */
export function classifyFreshness(
  storedHashes: ReadonlyMap<string, string>,
  onDisk: readonly string[],
  sourceExtensions: ReadonlySet<string>,
  readFile: ReadFile,
  stillExists: StillExists,
  extensionOf: (p: string) => string,
): Freshness {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const seen = new Set<string>();

  for (const abs of onDisk) {
    const key = abs.toLowerCase();
    seen.add(key);
    const previous = storedHashes.get(key);
    if (previous === undefined) { added.push(abs); continue; }
    const source = readFile(abs);
    // An unreadable file is NOT evidence of change. Counting it as changed would make a permissions
    // error look like an edit and send a watcher into a pulse it cannot complete.
    if (source === null) continue;
    if (FileHashGate.hash(source) !== previous) changed.push(abs);
  }

  for (const key of storedHashes.keys()) {
    if (seen.has(key)) continue;
    if (!sourceExtensions.has(extensionOf(key))) continue;   // see the note above
    if (!stillExists(key)) removed.push(key);
  }

  return { changed, added, removed, tracked: storedHashes.size };
}

/**
 * Whether the graph holds something WRONG — content that moved under it, or nodes for a file that
 * is gone.
 *
 * Deliberately excludes `added`. `analyze` is incremental by mtime, so a file untouched since before
 * the last pulse never enters a wave and never gets a hash — on this repository that is dozens of
 * files. Counting those as staleness reported "graph behind" immediately after a successful full
 * pulse, which reads as a bug and trains the reader to ignore the line. They are a real coverage
 * gap and are reported as exactly that, separately.
 */
export const isStale = (f: Freshness): boolean => f.changed.length + f.removed.length > 0;
