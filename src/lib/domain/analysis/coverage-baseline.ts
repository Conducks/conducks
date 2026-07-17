import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Conducks — Coverage Baseline 🏺 🟩
 *
 * Persists a coverage snapshot (per-function fill %) and diffs a fresh run against it,
 * so `coverage --vs-baseline` can answer: "did anything that used to work stop working?"
 *
 * A snapshot is keyed by `file::name` (functions can share a name across files, but a
 * file+name pair is stable across runs as long as the function isn't moved/renamed).
 */

export type CoverageResult = { name: string; file: string; pct: number };

export type CoverageSnapshot = Record<string, number>; // "file::name" -> pct

export type DriftStatus = "NEW" | "REGRESSED" | "IMPROVED" | "SAME";

export type DriftEntry = {
  key: string;
  name: string;
  file: string;
  baselinePct: number | undefined; // undefined for NEW
  currentPct: number;
  status: DriftStatus;
};

/** REGRESSED thresholds — tuned to flag "it broke", not normal test-suite noise. */
const REGRESSED_HARD_BREAK_MIN_BASELINE = 50; // was meaningfully covered...
const REGRESSED_HARD_BREAK_MAX_CURRENT = 0;   // ...and now runs zero lines at all.
const REGRESSED_MAJOR_DROP = 40;              // or dropped by >= 40 points even if not to zero.

export function snapshotKey(file: string, name: string): string {
  return `${file}::${name}`;
}

export function defaultBaselinePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, ".conducks", "coverage-baseline.json");
}

/** Builds a snapshot object ("file::name" -> pct) from a set of coverage results. */
export function buildSnapshot(results: CoverageResult[]): CoverageSnapshot {
  const snapshot: CoverageSnapshot = {};
  for (const r of results) {
    snapshot[snapshotKey(r.file, r.name)] = r.pct;
  }
  return snapshot;
}

/** Writes a coverage snapshot to disk (default: `.conducks/coverage-baseline.json`). */
export function saveBaseline(results: CoverageResult[], baselinePath: string = defaultBaselinePath()): void {
  const snapshot = buildSnapshot(results);
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2), "utf8");
}

/** Loads a previously saved snapshot. Returns null if none exists yet. */
export function loadBaseline(baselinePath: string = defaultBaselinePath()): CoverageSnapshot | null {
  if (!existsSync(baselinePath)) return null;
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

/**
 * Diffs current results against a baseline snapshot, classifying each current function:
 *  - NEW: no entry in baseline (function/file didn't exist, or wasn't bound, last time).
 *  - REGRESSED: was covered, now much less — see thresholds above. The "it broke" signal.
 *  - IMPROVED: pct went up.
 *  - SAME: pct unchanged.
 */
export function diffAgainstBaseline(results: CoverageResult[], baseline: CoverageSnapshot): DriftEntry[] {
  return results.map(r => {
    const key = snapshotKey(r.file, r.name);
    const baselinePct = baseline[key];

    if (baselinePct === undefined) {
      return { key, name: r.name, file: r.file, baselinePct: undefined, currentPct: r.pct, status: "NEW" as const };
    }

    const hardBreak = baselinePct >= REGRESSED_HARD_BREAK_MIN_BASELINE && r.pct <= REGRESSED_HARD_BREAK_MAX_CURRENT;
    const majorDrop = r.pct <= baselinePct - REGRESSED_MAJOR_DROP;

    // Any drop below the "major" threshold is still just noise (e.g. -5pts from a flaky
    // test run) — only IMPROVED/SAME/REGRESSED are reported; small dips read as SAME.
    let status: DriftStatus;
    if (hardBreak || majorDrop) status = "REGRESSED";
    else if (r.pct > baselinePct) status = "IMPROVED";
    else status = "SAME";

    return { key, name: r.name, file: r.file, baselinePct, currentPct: r.pct, status };
  });
}
