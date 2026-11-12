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

function snapshotKey(file: string, name: string): string {
  return `${file}::${name}`;
}

/**
 * One key per result. A file can hold two functions of one name (two classes each with `get`), and
 * `file::name` alone collapsed them: the snapshot kept the last, and both were then compared with it
 * (state-machine audit P-07-12). The second and later repeats get `#2`, `#3`… in result order; the
 * first keeps the plain key, so a baseline saved before this still matches every unique name.
 */
function snapshotKeys(results: CoverageResult[]): string[] {
  const seen = new Map<string, number>();
  return results.map(r => {
    const base = snapshotKey(r.file, r.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

export function defaultBaselinePath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, ".conducks", "coverage-baseline.json");
}

/** Builds a snapshot object ("file::name" -> pct) from a set of coverage results. */
function buildSnapshot(results: CoverageResult[]): CoverageSnapshot {
  const snapshot: CoverageSnapshot = {};
  const keys = snapshotKeys(results);
  results.forEach((r, i) => { snapshot[keys[i]] = r.pct; });
  return snapshot;
}

/** Writes a coverage snapshot to disk (default: `.conducks/coverage-baseline.json`). */
export function saveBaseline(results: CoverageResult[], baselinePath: string = defaultBaselinePath()): void {
  const snapshot = buildSnapshot(results);
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2), "utf8");
}

/**
 * Loads a previously saved snapshot. Returns null if none exists yet.
 *
 * A file that exists but is not a snapshot — cut short, hand-edited — is refused BY NAME. It went
 * straight to `JSON.parse`, so `--vs-baseline` died on "Unexpected end of JSON input" naming neither
 * the file nor the repair, and a parsed non-object was compared as if every function were NEW
 * (state-machine audit round 2, Q-07-8).
 */
export function loadBaseline(baselinePath: string = defaultBaselinePath()): CoverageSnapshot | null {
  if (!existsSync(baselinePath)) return null;
  const refuse = (why: string) =>
    new Error(`${baselinePath} is not a coverage baseline (${why}). Re-save it with \`coverage --save-baseline\`.`);
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(baselinePath, "utf8")); }
  catch (err: any) { throw refuse(err?.message ?? String(err)); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw refuse("not an object of file::name → percent");
  for (const [key, pct] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof pct !== "number") throw refuse(`"${key}" holds ${JSON.stringify(pct)}, not a percent`);
  }
  return parsed as CoverageSnapshot;
}

/**
 * Diffs current results against a baseline snapshot, classifying each current function:
 *  - NEW: no entry in baseline (function/file didn't exist, or wasn't bound, last time).
 *  - REGRESSED: was covered, now much less — see thresholds above. The "it broke" signal.
 *  - IMPROVED: pct went up.
 *  - SAME: pct unchanged.
 */
export function diffAgainstBaseline(results: CoverageResult[], baseline: CoverageSnapshot): DriftEntry[] {
  const keys = snapshotKeys(results);
  return results.map((r, i) => {
    const key = keys[i];
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
